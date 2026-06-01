"""Report generation — markdown and JSON summary reports."""
from __future__ import annotations
import json
from collections import Counter
from typing import Dict, List, Tuple

from .types import Diagnostic


def generate_summary(
    per_file: List[Tuple[str, List[Diagnostic]]],
) -> Dict:
    """Generate structured summary statistics from analysis results."""
    rule_counts: Counter = Counter()
    severity_counts: Counter = Counter()
    total_files = len(per_file)
    files_with_issues = 0
    all_diagnostics: List[Diagnostic] = []

    for path, diags in per_file:
        if diags:
            files_with_issues += 1
        for d in diags:
            rule_counts[d.rule] += 1
            severity_counts[d.severity] += 1
            all_diagnostics.append(d)

    return {
        "total_files": total_files,
        "files_with_issues": files_with_issues,
        "files_clean": total_files - files_with_issues,
        "total_diagnostics": len(all_diagnostics),
        "by_rule": dict(rule_counts.most_common()),
        "by_severity": dict(severity_counts.most_common()),
        "diagnostics": [
            {"file": d.file, "line": d.line, "severity": d.severity,
             "rule": d.rule, "message": d.message}
            for d in sorted(all_diagnostics, key=lambda d: (d.file, d.line))
        ],
    }


def format_json_report(summary: Dict) -> str:
    """Format summary as JSON string."""
    return json.dumps(summary, indent=2)


def format_markdown_report(summary: Dict) -> str:
    """Format summary as a markdown report."""
    lines = ["# mpicheck Analysis Report\n"]
    lines.append(f"- **Files analyzed:** {summary['total_files']}")
    lines.append(f"- **Files with issues:** {summary['files_with_issues']}")
    lines.append(f"- **Clean files:** {summary['files_clean']}")
    lines.append(f"- **Total diagnostics:** {summary['total_diagnostics']}\n")

    if summary["by_severity"]:
        lines.append("## By Severity\n")
        lines.append("| Severity | Count |")
        lines.append("|----------|-------|")
        for sev, n in summary["by_severity"].items():
            lines.append(f"| {sev} | {n} |")
        lines.append("")

    if summary["by_rule"]:
        lines.append("## By Rule\n")
        lines.append("| Rule | Count |")
        lines.append("|------|-------|")
        for rule, n in summary["by_rule"].items():
            lines.append(f"| `{rule}` | {n} |")
        lines.append("")

    if summary["diagnostics"]:
        lines.append("## Diagnostics\n")
        lines.append("```")
        for d in summary["diagnostics"]:
            lines.append(f"{d['file']}:{d['line']}: {d['severity']}: [{d['rule']}] {d['message']}")
        lines.append("```\n")

    return "\n".join(lines)


def format_ascii_chart(summary: Dict) -> str:
    """Generate an ASCII bar chart of rule distribution."""
    by_rule = summary.get("by_rule", {})
    if not by_rule:
        return "  (no diagnostics)\n"
    max_count = max(by_rule.values())
    max_name = max(len(r) for r in by_rule)
    bar_width = 40
    lines = []
    for rule, count in sorted(by_rule.items(), key=lambda kv: -kv[1]):
        bar_len = int(count / max_count * bar_width) if max_count > 0 else 0
        bar = "█" * bar_len
        lines.append(f"  {rule:<{max_name}}  {bar} {count}")
    return "\n".join(lines) + "\n"
