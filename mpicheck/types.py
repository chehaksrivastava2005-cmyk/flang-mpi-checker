"""Dataclasses representing extracted Fortran semantic info."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class BufferInfo:
    name: str
    base_type: str                              # 'REAL'/'INTEGER'/'COMPLEX'/'CHARACTER'/'LOGICAL'/'TYPE'
    kind: Optional[str] = None                  # '4'/'8' or None
    shape: List[str] = field(default_factory=list)        # ['100','50']; [':'] assumed; ['*'] assumed-size
    is_assumed_shape: bool = False
    is_assumed_size: bool = False
    is_allocatable: bool = False
    is_pointer: bool = False
    is_contiguous_attr: bool = False            # CONTIGUOUS attribute declared
    is_optional: bool = False
    is_derived: bool = False
    derived_type_name: Optional[str] = None
    is_section: bool = False                    # passed as A(i:j:k)
    section_strides: List[Optional[str]] = field(default_factory=list)
    is_scalar_literal: bool = False
    decl_line: int = -1

    def static_element_count(self) -> Optional[int]:
        if self.is_section:
            return None
        try:
            n = 1
            for d in self.shape:
                if d in (':', '*'):
                    return None
                n *= int(d)
            return n
        except (ValueError, TypeError):
            return None

    def is_contiguous_known(self) -> bool:
        if self.is_section:
            for s in self.section_strides:
                if s not in (None, '1'):
                    return False
            return True
        if self.is_contiguous_attr:
            return True
        if self.is_assumed_shape and not self.is_contiguous_attr:
            return False
        return True


@dataclass
class DerivedTypeDef:
    name: str
    bind_c: bool
    components: List[Tuple[str, str, Optional[str]]]   # (name, base_type, kind)
    line: int = -1

    def has_mixed_kinds(self) -> bool:
        kinds = {(t, k) for _, t, k in self.components}
        return len(kinds) > 1


@dataclass
class MpiCall:
    name: str
    line: int
    raw: str
    arg_nodes: List[Any]
    buffers: Dict[str, BufferInfo] = field(default_factory=dict)   # role -> BufferInfo
    raw_values: Dict[str, str] = field(default_factory=dict)       # role -> source text
    scope: str = "<global>"
    in_rank_conditional: bool = False
    conditional_text: Optional[str] = None


@dataclass
class Diagnostic:
    file: str
    line: int
    severity: str          # 'error' | 'warning' | 'note'
    rule: str
    message: str

    def format(self) -> str:
        return f"{self.file}:{self.line}: {self.severity}: [{self.rule}] {self.message}"
