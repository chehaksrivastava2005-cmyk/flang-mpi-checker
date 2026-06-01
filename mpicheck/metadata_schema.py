"""JSON Metadata schema for Flang → Python integration.

Defines the structure of the JSON emitted by the C++ Flang scaffold
and consumed by the Python rule engine.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any


@dataclass
class FlangBufferMetadata:
    name: str
    base_type: str
    kind: Optional[str] = None
    rank: int = 0
    shape: List[str] = field(default_factory=list)
    is_assumed_shape: bool = False
    is_assumed_size: bool = False
    is_allocatable: bool = False
    is_pointer: bool = False
    is_contiguous_attr: bool = False
    is_optional: bool = False
    is_derived: bool = False
    derived_type_name: Optional[str] = None
    is_section: bool = False
    decl_loc: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FlangMpiCallRecord:
    name: str
    line: int
    raw: str
    scope: str
    in_rank_conditional: bool
    conditional_text: Optional[str]
    buffers: Dict[str, FlangBufferMetadata]
    raw_values: Dict[str, str]


@dataclass
class FlangTranslationUnit:
    file: str
    calls: List[FlangMpiCallRecord]
    derived_types: Dict[str, Any]


def deserialize_tu(data: Dict[str, Any]) -> FlangTranslationUnit:
    calls = []
    for c_data in data.get("calls", []):
        buffers = {}
        for role, b_data in c_data.get("buffers", {}).items():
            buffers[role] = FlangBufferMetadata(
                name=b_data.get("name", ""),
                base_type=b_data.get("base_type", "UNKNOWN"),
                kind=str(b_data["kind"]) if "kind" in b_data else None,
                rank=b_data.get("rank", 0),
                shape=b_data.get("shape", []),
                is_assumed_shape=b_data.get("is_assumed_shape", False),
                is_assumed_size=b_data.get("is_assumed_size", False),
                is_allocatable=b_data.get("is_allocatable", False),
                is_pointer=b_data.get("is_pointer", False),
                is_contiguous_attr=b_data.get("is_contiguous_attr", False),
                is_optional=b_data.get("is_optional", False),
                is_derived=b_data.get("is_derived", False),
                derived_type_name=b_data.get("derived_type_name"),
                is_section=b_data.get("is_section", False),
                decl_loc=b_data.get("decl_loc", {}),
            )
        
        calls.append(FlangMpiCallRecord(
            name=c_data.get("name", ""),
            line=c_data.get("line", 0),
            raw=c_data.get("raw", ""),
            scope=c_data.get("scope", "<global>"),
            in_rank_conditional=c_data.get("in_rank_conditional", False),
            conditional_text=c_data.get("conditional_text"),
            buffers=buffers,
            raw_values=c_data.get("raw_values", {}),
        ))
        
    return FlangTranslationUnit(
        file=data.get("file", ""),
        calls=calls,
        derived_types=data.get("derived_types", {}),
    )
