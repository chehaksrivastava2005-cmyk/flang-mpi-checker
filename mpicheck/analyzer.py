"""Core analyzer: walks fparser2 AST, builds per-scope symbol tables,
extracts MPI call metadata with Fortran type info.

Conceptually mirrors the data Flang's Semantics phase exposes (Symbol,
DynamicType, shape, attrs) but driven by fparser2 parse-tree introspection.
"""
from __future__ import annotations
import re
from typing import Dict, List, Optional, Tuple, Any

from fparser.two.parser import ParserFactory
from fparser.common.readfortran import FortranFileReader, FortranStringReader
from fparser.two.utils import walk
from fparser.two import Fortran2003 as F

from .types import BufferInfo, DerivedTypeDef, MpiCall
from .mpi_db import is_mpi_call, get_signature, normalize


# -------------------- helpers --------------------

def _line_of(node) -> int:
    item = getattr(node, "item", None)
    if item is not None and getattr(item, "span", None):
        return item.span[0]
    p = getattr(node, "parent", None)
    while p is not None:
        it = getattr(p, "item", None)
        if it is not None and getattr(it, "span", None):
            return it.span[0]
        p = getattr(p, "parent", None)
    return -1


def _text(node) -> str:
    return str(node).strip()


def _is_rank_predicate(text: str) -> Tuple[bool, Optional[str]]:
    """Detect 'rank == N' / 'myrank.eq.N' / 'comm_rank == N' style guards."""
    t = re.sub(r"\s+", "", text.lower())
    pat = re.compile(r"(\w*rank\w*|me|myid|my_id)([=<>!/]+|\.eq\.|\.ne\.|\.lt\.|\.gt\.|\.le\.|\.ge\.)(\d+|\w+)")
    m = pat.search(t)
    if m:
        return True, m.group(0)
    return False, None


# -------------------- derived types --------------------

def _collect_derived_types(tree) -> Dict[str, DerivedTypeDef]:
    out: Dict[str, DerivedTypeDef] = {}
    for dt in walk(tree, F.Derived_Type_Def):
        stmt = dt.children[0]   # Derived_Type_Stmt
        attrs = stmt.children[0]
        name_node = stmt.children[1]
        name = _text(name_node)
        bind_c = False
        if attrs is not None:
            atxt = _text(attrs).upper()
            bind_c = "BIND" in atxt and "C" in atxt
        comps: List[Tuple[str, str, Optional[str]]] = []
        comp_part = None
        for ch in dt.children[1:]:
            if isinstance(ch, F.Component_Part):
                comp_part = ch
                break
        if comp_part is not None:
            for stmt_def in comp_part.children:
                if not isinstance(stmt_def, F.Data_Component_Def_Stmt):
                    continue
                tspec = stmt_def.children[0]
                base, kind = _decode_type_spec(tspec)
                decl_list = stmt_def.children[2]
                for cd in decl_list.children:
                    if isinstance(cd, F.Component_Decl):
                        cname = _text(cd.children[0])
                        comps.append((cname, base, kind))
        out[name] = DerivedTypeDef(name=name, bind_c=bind_c, components=comps, line=_line_of(dt))
    return out


def _decode_type_spec(tspec) -> Tuple[str, Optional[str]]:
    """Return (base_type, kind). Normalizes 'DOUBLE PRECISION' -> ('REAL','8'),
    'DOUBLE COMPLEX' -> ('COMPLEX','8')."""
    if isinstance(tspec, F.Intrinsic_Type_Spec):
        base = _text(tspec.children[0]).upper().strip()
        kind = None
        ks = tspec.children[1]
        if ks is not None:
            kt = _text(ks)
            m = re.search(r"\(\s*([^)]+?)\s*\)", kt)
            inner = m.group(1) if m else kt
            inner = re.sub(r"^\s*KIND\s*=\s*", "", inner, flags=re.IGNORECASE).strip()
            kind = inner or None
        # Normalize legacy spellings
        if base == "DOUBLE PRECISION":
            return "REAL", "8"
        if base == "DOUBLE COMPLEX":
            return "COMPLEX", "8"
        return base, kind
    if isinstance(tspec, F.Declaration_Type_Spec):
        return "TYPE", _text(tspec.children[1])
    return _text(tspec).upper(), None


# -------------------- symbol table per scope --------------------

class SymbolTable:
    def __init__(self):
        self.vars: Dict[str, BufferInfo] = {}

    def add(self, info: BufferInfo) -> None:
        self.vars[info.name.lower()] = info

    def get(self, name: str) -> Optional[BufferInfo]:
        return self.vars.get(name.lower())


def _collect_symbols(scope_node) -> SymbolTable:
    st = SymbolTable()
    for d in walk(scope_node, F.Type_Declaration_Stmt):
        tspec = d.children[0]
        attr_list = d.children[1]
        entity_list = d.children[2]
        base, kind = _decode_type_spec(tspec)

        is_optional = False
        is_allocatable = False
        is_pointer = False
        is_contiguous = False
        if attr_list is not None:
            atxt = _text(attr_list).upper()
            is_optional = "OPTIONAL" in atxt
            is_allocatable = "ALLOCATABLE" in atxt
            is_pointer = "POINTER" in atxt
            is_contiguous = "CONTIGUOUS" in atxt

        decl_line = _line_of(d)

        for ent in entity_list.children:
            if not isinstance(ent, F.Entity_Decl):
                continue
            ent_name = _text(ent.children[0])
            array_spec = ent.children[1]
            shape: List[str] = []
            is_assumed_shape = False
            is_assumed_size = False
            if array_spec is not None:
                cls = type(array_spec).__name__
                if cls == "Assumed_Shape_Spec_List":
                    is_assumed_shape = True
                    shape = [":"] * len(array_spec.children)
                elif cls == "Deferred_Shape_Spec_List":
                    shape = [":"] * len(array_spec.children)
                elif cls == "Assumed_Size_Spec":
                    is_assumed_size = True
                    shape = ["*"]
                elif cls == "Explicit_Shape_Spec_List":
                    for sp in array_spec.children:
                        if isinstance(sp, F.Explicit_Shape_Spec):
                            lo, hi = sp.children
                            if lo is None:
                                shape.append(_text(hi))
                            else:
                                shape.append(f"{_text(hi)}-{_text(lo)}+1")
                else:
                    shape = [_text(array_spec)]
            info = BufferInfo(
                name=ent_name,
                base_type=base,
                kind=kind,
                shape=shape,
                is_assumed_shape=is_assumed_shape,
                is_assumed_size=is_assumed_size,
                is_allocatable=is_allocatable,
                is_pointer=is_pointer,
                is_contiguous_attr=is_contiguous,
                is_optional=is_optional,
                is_derived=(base == "TYPE"),
                derived_type_name=kind if base == "TYPE" else None,
                decl_line=decl_line,
            )
            st.add(info)
    return st


# -------------------- argument resolution --------------------

def _arg_to_buffer(arg_node, st: SymbolTable, raw: str) -> BufferInfo:
    """Resolve actual argument to BufferInfo.

    Handles: bare Name, Part_Ref with Section_Subscript_List, Data_Ref (a%b),
    Literal_Constant (treated as scalar).
    """
    # bare name
    if isinstance(arg_node, F.Name):
        nm = _text(arg_node)
        sym = st.get(nm)
        if sym is not None:
            return sym
        # symbol resolved elsewhere (USE, INCLUDE, COMMON, external module);
        # mark shape as opaque so size-check is conservative
        return BufferInfo(name=nm, base_type="UNKNOWN", shape=[":"], is_assumed_shape=True)

    # array section / element ref
    if isinstance(arg_node, F.Part_Ref):
        base_name = _text(arg_node.children[0])
        sym = st.get(base_name)
        sub_list = arg_node.children[1]
        is_section = False
        strides: List[Optional[str]] = []
        if isinstance(sub_list, F.Section_Subscript_List):
            for sub in sub_list.children:
                if isinstance(sub, F.Subscript_Triplet):
                    is_section = True
                    stride = sub.children[2]
                    strides.append(_text(stride) if stride is not None else None)
                else:
                    strides.append(None)
        if sym is None:
            # cross-file/module symbol — extent unknown, do not fabricate scalar
            return BufferInfo(name=base_name, base_type="UNKNOWN",
                              shape=[":"], is_assumed_shape=True,
                              is_section=is_section, section_strides=strides)
        # Single-element ref like A(i) used as buffer base+offset (MPI convention):
        # capacity is the underlying array, not 1 element. Only treat as scalar
        # if the symbol is itself scalar (no shape).
        cloned = BufferInfo(**{**sym.__dict__})
        cloned.is_section = is_section
        cloned.section_strides = strides
        return cloned

    # derived component a%b — treat as scalar of component type if resolvable
    if isinstance(arg_node, F.Data_Ref):
        return BufferInfo(name=_text(arg_node), base_type="DERIVED_COMPONENT")

    # numeric literal
    name = type(arg_node).__name__
    if "Literal_Constant" in name or "Constant" in name:
        return BufferInfo(name=raw, base_type="LITERAL", is_scalar_literal=True)

    return BufferInfo(name=raw, base_type="EXPR")


def _find_call_scope_name(call_node) -> str:
    p = call_node.parent
    while p is not None:
        if isinstance(p, F.Subroutine_Subprogram):
            sub_stmt = p.children[0]
            return _text(sub_stmt.children[1])
        if isinstance(p, F.Function_Subprogram):
            fn_stmt = p.children[0]
            for ch in fn_stmt.children:
                if isinstance(ch, F.Name):
                    return _text(ch)
        if isinstance(p, F.Main_Program):
            return "<main>"
        p = getattr(p, "parent", None)
    return "<global>"


def _scope_node_of(call_node):
    p = call_node.parent
    while p is not None:
        if isinstance(p, (F.Subroutine_Subprogram, F.Function_Subprogram, F.Main_Program)):
            return p
        p = getattr(p, "parent", None)
    return None


def _find_enclosing_rank_conditional(call_node) -> Tuple[bool, Optional[str]]:
    """Walk up; if surrounded by IF block whose condition mentions rank, return True."""
    p = call_node.parent
    while p is not None:
        if isinstance(p, F.If_Construct):
            # first child is If_Then_Stmt with condition
            first = p.children[0]
            cond_text = _text(first)
            ok, what = _is_rank_predicate(cond_text)
            if ok:
                return True, cond_text
        if isinstance(p, F.If_Stmt):
            cond_text = _text(p)
            ok, _ = _is_rank_predicate(cond_text)
            if ok:
                return True, cond_text
        p = getattr(p, "parent", None)
    return False, None


# -------------------- public API --------------------

class FortranSourceUnit:
    def __init__(self, path: str, source: Optional[str] = None):
        self.path = path
        self.parser = ParserFactory().create(std="f2008")
        if source is not None:
            reader = FortranStringReader(source)
        else:
            reader = FortranFileReader(path)
        self.tree = self.parser(reader)
        self.derived_types: Dict[str, DerivedTypeDef] = _collect_derived_types(self.tree)
        self.scope_symbols: Dict[int, SymbolTable] = {}   # id(scope_node) -> SymbolTable
        self.calls: List[MpiCall] = []
        self._build_scope_tables()
        self._extract_mpi_calls()

    def _build_scope_tables(self) -> None:
        for sub in walk(self.tree, F.Subroutine_Subprogram):
            self.scope_symbols[id(sub)] = _collect_symbols(sub)
        for fn in walk(self.tree, F.Function_Subprogram):
            self.scope_symbols[id(fn)] = _collect_symbols(fn)
        for mp in walk(self.tree, F.Main_Program):
            self.scope_symbols[id(mp)] = _collect_symbols(mp)
        for mod in walk(self.tree, F.Module):
            self.scope_symbols[id(mod)] = _collect_symbols(mod)

    def _scope_table_for(self, call_node) -> SymbolTable:
        scope = _scope_node_of(call_node)
        if scope is not None and id(scope) in self.scope_symbols:
            return self.scope_symbols[id(scope)]
        # fallback to module-level symbols
        p = getattr(call_node, "parent", None)
        while p is not None:
            if id(p) in self.scope_symbols:
                return self.scope_symbols[id(p)]
            p = getattr(p, "parent", None)
        return SymbolTable()

    def _extract_mpi_calls(self) -> None:
        for c in walk(self.tree, F.Call_Stmt):
            proc = _text(c.children[0])
            if not is_mpi_call(proc):
                continue
            sig = get_signature(proc)
            arg_list = c.children[1]
            arg_nodes = list(arg_list.children) if arg_list is not None else []
            line = _line_of(c)
            raw = _text(c)
            in_cond, cond_text = _find_enclosing_rank_conditional(c)
            st = self._scope_table_for(c)
            buffers: Dict[str, BufferInfo] = {}
            raw_values: Dict[str, str] = {}

            if sig is not None:
                for i, role in enumerate(sig):
                    if i >= len(arg_nodes):
                        break
                    arg = arg_nodes[i]
                    raw_arg = _text(arg)
                    raw_values[role] = raw_arg
                    if role in ("buf", "sendbuf", "recvbuf"):
                        buffers[role] = _arg_to_buffer(arg, st, raw_arg)
                    elif role in ("datatype", "sendtype", "recvtype",
                                  "count", "sendcount", "recvcount",
                                  "dest", "source", "tag", "root", "comm",
                                  "op", "request", "status", "ierr"):
                        # just keep raw_values
                        pass
            self.calls.append(MpiCall(
                name=normalize(proc),
                line=line,
                raw=raw,
                arg_nodes=arg_nodes,
                buffers=buffers,
                raw_values=raw_values,
                scope=_find_call_scope_name(c),
                in_rank_conditional=in_cond,
                conditional_text=cond_text,
            ))
