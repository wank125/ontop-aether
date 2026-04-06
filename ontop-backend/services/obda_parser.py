"""Parse and serialize Ontop .obda mapping files."""
import re

import httpx

from models.mapping import MappingContent, MappingRule
from config import ONTOP_ENGINE_URL


def parse_obda(content: str) -> MappingContent:
    """Parse .obda file content into structured data."""
    parsed = _parse_obda_via_engine(content)
    if parsed is not None:
        return parsed
    return _parse_obda_legacy(content)


def _parse_obda_via_engine(content: str) -> MappingContent | None:
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                f"{ONTOP_ENGINE_URL}/api/ontop/parse-mapping",
                json={"mappingContent": content},
            )
            resp.raise_for_status()
    except Exception:
        return None

    body = resp.json()
    data = body.get("data", body)
    if not data.get("success"):
        return None

    mappings = [
        MappingRule(
            mapping_id=item.get("mappingId", ""),
            target=item.get("target", ""),
            source=item.get("source", ""),
        )
        for item in data.get("mappings", [])
    ]
    prefixes = {
        str(prefix).rstrip(":"): str(uri)
        for prefix, uri in (data.get("prefixes") or {}).items()
    }
    return MappingContent(prefixes=prefixes, mappings=mappings)


def _parse_obda_legacy(content: str) -> MappingContent:
    """Fallback parser kept for resilience when ontop-engine is unavailable."""
    prefixes = {}
    mappings = []

    # Parse [PrefixDeclaration] section
    in_prefix = False
    in_mapping = False

    lines = content.split("\n")
    i = 0
    while i < len(lines):
        line = lines[i].strip()

        if line == "[PrefixDeclaration]":
            in_prefix = True
            i += 1
            continue

        if in_prefix:
            if line.startswith("["):
                in_prefix = False
            elif line and not line.startswith("#"):
                parts = re.split(r":\s+", line.strip(), maxsplit=1)
                if len(parts) == 2:
                    prefix_name = parts[0].strip().rstrip(":")
                    prefix_uri = parts[1].strip()
                    prefixes[prefix_name] = prefix_uri

        if "[MappingDeclaration]" in line:
            in_mapping = True
            # Skip to @collection [[
            while i < len(lines) and "@collection [[" not in lines[i]:
                i += 1
            i += 1  # Skip the [[ line
            continue

        if in_mapping:
            if "]]" in line:
                in_mapping = False
                i += 1
                continue

            if line.startswith("mappingId"):
                # Read a complete mapping rule (3 lines: mappingId, target, source)
                mapping_id = re.split(r"\t+", line)[1].strip() if "\t" in line else line.split("mappingId", 1)[1].strip()

                # Read target line
                i += 1
                while i < len(lines) and not lines[i].strip().startswith("target"):
                    i += 1
                target_line = lines[i].strip() if i < len(lines) else ""
                target = re.split(r"\t+", target_line)[1].strip() if "\t" in target_line else target_line.split("target", 1)[1].strip()

                # Read source line
                i += 1
                while i < len(lines) and not lines[i].strip().startswith("source"):
                    i += 1
                source_line = lines[i].strip() if i < len(lines) else ""
                source = re.split(r"\t+", source_line)[1].strip() if "\t" in source_line else source_line.split("source", 1)[1].strip()

                mappings.append(MappingRule(
                    mapping_id=mapping_id,
                    target=target,
                    source=source,
                ))

        i += 1

    return MappingContent(prefixes=prefixes, mappings=mappings)


def serialize_obda(content: MappingContent) -> str:
    """Serialize MappingContent back to .obda file format."""
    lines = []

    # PrefixDeclaration section
    lines.append("[PrefixDeclaration]")
    for prefix, uri in content.prefixes.items():
        lines.append(f"{prefix}:\t\t{uri}")
    lines.append("")

    # MappingDeclaration section
    lines.append("[MappingDeclaration] @collection [[")
    for m in content.mappings:
        lines.append(f"mappingId\t{m.mapping_id}")
        lines.append(f"target\t\t{m.target}")
        lines.append(f"source\t\t{m.source}")
        lines.append("")
    lines.append("]]")
    lines.append("")

    return "\n".join(lines)
