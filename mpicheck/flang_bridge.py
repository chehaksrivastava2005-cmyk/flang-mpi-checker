"""Bridge between existing Python analyzer and Flang JSON metadata.

Allows the mpicheck rule engine to consume semantic metadata extracted
either natively via Flang (C++) or via the existing fparser2 prototype.
"""
from __future__ import annotations
import json
import os
import subprocess
from typing import Optional, Any

from .metadata_schema import FlangTranslationUnit, deserialize_tu
from .analyzer import FortranSourceUnit
from .types import BufferInfo, DerivedTypeDef, MpiCall


class BridgeUnit:
    """Adapts a FlangTranslationUnit to expose the interface expected by the rule engine.
    
    This maps the C++ extracted metadata back into the `mpicheck.types` dataclasses
    that the existing Python rules operate on.
    """
    def __init__(self, metadata: FlangTranslationUnit):
        self.path = metadata.file
        self.calls = []
        for c in metadata.calls:
            buffers = {}
            for role, b in c.buffers.items():
                buffers[role] = BufferInfo(
                    name=b.name,
                    base_type=b.base_type,
                    kind=b.kind,
                    shape=b.shape,
                    is_assumed_shape=b.is_assumed_shape,
                    is_assumed_size=b.is_assumed_size,
                    is_allocatable=b.is_allocatable,
                    is_pointer=b.is_pointer,
                    is_contiguous_attr=b.is_contiguous_attr,
                    is_optional=b.is_optional,
                    is_derived=b.is_derived,
                    derived_type_name=b.derived_type_name,
                    is_section=b.is_section,
                    decl_line=b.decl_loc.get("line", -1)
                )
            self.calls.append(MpiCall(
                name=c.name,
                line=c.line,
                raw=c.raw,
                arg_nodes=[], # Not natively available from JSON, rules shouldn't rely on it
                buffers=buffers,
                raw_values=c.raw_values,
                scope=c.scope,
                in_rank_conditional=c.in_rank_conditional,
                conditional_text=c.conditional_text,
            ))
        
        self.derived_types = {}
        for k, v in metadata.derived_types.items():
            components = []
            for comp in v.get("components", []):
                components.append((comp.get("name"), comp.get("base_type"), str(comp.get("kind")) if comp.get("kind") else None))
            self.derived_types[k] = DerivedTypeDef(
                name=v.get("name", ""),
                bind_c=v.get("bind_c", False),
                components=components,
                line=v.get("decl_loc", {}).get("line", -1)
            )
        
        # Flang natively resolves these, rules mostly need to check properties directly
        self.scope_symbols = {}
        self.tree = None


def extract_with_flang(path: str, flang_bin: str) -> BridgeUnit:
    """Invoke the external Flang binary to extract semantic metadata.
    
    This is intended to call a custom `flang-new` wrapper that runs the MpiChecker pass.
    """
    res = subprocess.run([flang_bin, "-fplugin=mpicheck", path], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"Flang extraction failed: {res.stderr}")
    data = json.loads(res.stdout)
    return BridgeUnit(deserialize_tu(data))


def extract_with_fparser2(path: str, project=None) -> Any:
    """Fallback to the existing Python fparser2 analyzer."""
    if project:
        from .project import ProjectAwareUnit
        return ProjectAwareUnit(path, project)
    return FortranSourceUnit(path)

