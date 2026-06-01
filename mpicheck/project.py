"""Multi-file project: resolve USE statements across translation units.

Mirrors Flang's project-wide symbol resolution that pulls module exports
into using scopes before semantic checks fire.
"""
from __future__ import annotations
import os
from typing import Dict, List, Optional, Tuple

from fparser.two.parser import ParserFactory
from fparser.common.readfortran import FortranFileReader, FortranStringReader
from fparser.two.utils import walk
from fparser.two import Fortran2003 as F

from .analyzer import (
    FortranSourceUnit, SymbolTable, _collect_symbols, _collect_derived_types,
    _line_of, _text
)
from .types import BufferInfo, DerivedTypeDef


_FORTRAN_EXTS = (".f", ".f90", ".f95", ".f03", ".f08", ".for")


class Project:
    """Pre-scan a tree of Fortran files; expose merged module symbol tables."""

    def __init__(self, paths: List[str], verbose: bool = False):
        self.parser = ParserFactory().create(std="f2008")
        self.module_symbols: Dict[str, SymbolTable] = {}
        self.module_derived: Dict[str, Dict[str, DerivedTypeDef]] = {}
        self.include_decls: Dict[str, SymbolTable] = {}    # include-file path -> SymbolTable
        self.files: List[str] = []
        self.parse_errors: List[Tuple[str, str]] = []
        self._collect_files(paths)
        self._prescan()

    def _collect_files(self, paths: List[str]) -> None:
        for p in paths:
            if os.path.isdir(p):
                for root, _, files in os.walk(p):
                    for f in files:
                        if f.lower().endswith(_FORTRAN_EXTS):
                            self.files.append(os.path.join(root, f))
            elif os.path.isfile(p):
                self.files.append(p)
        self.files = sorted(set(self.files))

    def _prescan(self) -> None:
        """First pass: collect module symbols + derived types across the whole project."""
        for path in self.files:
            try:
                tree = self.parser(FortranFileReader(path, ignore_comments=False))
            except Exception as e:
                self.parse_errors.append((path, str(e)))
                continue
            for mod in walk(tree, F.Module):
                stmt = mod.children[0]
                mod_name = _text(stmt.children[1]).lower()
                st = _collect_symbols(mod)
                if mod_name in self.module_symbols:
                    # merge (first definition wins, second adds extras)
                    for k, v in st.vars.items():
                        self.module_symbols[mod_name].vars.setdefault(k, v)
                else:
                    self.module_symbols[mod_name] = st
                dts = _collect_derived_types(mod)
                self.module_derived.setdefault(mod_name, {}).update(dts)

    def merged_symbols_for(self, scope_node, base_table: SymbolTable,
                           file_dir: str) -> SymbolTable:
        """Given a scope node already containing local decls (base_table),
        merge symbols from any USE statements and INCLUDE files reachable."""
        merged = SymbolTable()
        merged.vars.update(base_table.vars)
        # USE statements in this scope or any enclosing scope
        seen_mods = set()
        node = scope_node
        while node is not None:
            for use in walk(node, F.Use_Stmt):
                # children: [module_nature, '::', module_name, only_specifier_list]
                mod_name = None
                for ch in use.children:
                    if isinstance(ch, F.Name):
                        mod_name = _text(ch).lower()
                        break
                if mod_name and mod_name not in seen_mods:
                    seen_mods.add(mod_name)
                    mt = self.module_symbols.get(mod_name)
                    if mt is not None:
                        for k, v in mt.vars.items():
                            merged.vars.setdefault(k, v)
            # Don't traverse further — fparser Use_Stmt walk already gathered scope-local
            break
        # INCLUDE statements: parse the included file's declarations once, cache.
        for inc in walk(scope_node, F.Include_Stmt):
            raw = _text(inc)
            # Include_Stmt prints as "INCLUDE 'path'"
            import re as _re
            m = _re.search(r"['\"]([^'\"]+)['\"]", raw)
            if not m:
                continue
            inc_path = m.group(1)
            full = inc_path
            if not os.path.isabs(full):
                full = os.path.join(file_dir, inc_path)
            if full in self.include_decls:
                st = self.include_decls[full]
            else:
                st = SymbolTable()
                try:
                    if os.path.isfile(full):
                        sub_tree = self.parser(FortranFileReader(full))
                        st = _collect_symbols(sub_tree)
                except Exception:
                    pass
                self.include_decls[full] = st
            for k, v in st.vars.items():
                merged.vars.setdefault(k, v)
        return merged


class ProjectAwareUnit(FortranSourceUnit):
    """FortranSourceUnit that resolves USE / INCLUDE against a Project."""

    def __init__(self, path: str, project: Project, source: Optional[str] = None):
        self._project = project
        self._file_dir = os.path.dirname(os.path.abspath(path))
        super().__init__(path, source=source)

    def _build_scope_tables(self) -> None:
        # base: local decls
        super()._build_scope_tables()
        # augment with USE + INCLUDE
        for scope_id, base in list(self.scope_symbols.items()):
            # find scope node by id
            scope_node = None
            for node in walk(self.tree, (F.Subroutine_Subprogram, F.Function_Subprogram,
                                          F.Main_Program, F.Module)):
                if id(node) == scope_id:
                    scope_node = node
                    break
            if scope_node is None:
                continue
            self.scope_symbols[scope_id] = self._project.merged_symbols_for(
                scope_node, base, self._file_dir)
        # pull derived types from used modules
        all_use_mods = set()
        for use in walk(self.tree, F.Use_Stmt):
            for ch in use.children:
                if isinstance(ch, F.Name):
                    all_use_mods.add(_text(ch).lower())
                    break
        for m in all_use_mods:
            self.derived_types.update(self._project.module_derived.get(m, {}))
