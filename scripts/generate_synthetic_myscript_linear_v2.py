#!/usr/bin/env python3
"""Generate the predeclared 300-case synthetic MyScript linear v2 corpus."""

from __future__ import annotations

import json
from pathlib import Path

from generate_synthetic_myscript_smoke import _accepted_forms, strokes_for


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/handwriting/fixtures/synthetic-myscript-linear-v2"
SAMPLES = OUTPUT / "samples"

EXPRESSIONS = (
    "x+0=1", "x+1=3", "x+2=5", "x+3=7", "x+4=9",
    "x-1=2", "x-2=4", "x-3=5", "x-4=6", "x-5=7",
    "0+x=6", "1+x=8", "2+x=9", "9-x=3", "8-x=2",
    "2x=8", "3x=9", "4x=12", "5x=15", "6x=18",
    "2x+1=7", "3x+2=11", "4x+3=15", "5x+4=19", "6x+5=23",
    "2x-1=9", "3x-2=10", "4x-3=13", "5x-4=16", "6x-5=19",
    "10+x=18", "12+x=20", "x+10=24", "x+12=27", "20-x=11",
    "25-x=13", "2x+10=30", "3x+12=33", "4x-10=22", "5x-12=28",
    "30=2x+10", "33=3x+12", "22=4x-10", "28=5x-12", "40=5x",
    "42=6x", "21=3x", "24=4x", "18=x+10", "20=x+12",
    "11=20-x", "13=25-x", "7=2x+1", "11=3x+2", "15=4x+3",
    "19=5x+4", "9=2x-1", "10=3x-2", "13=4x-3", "16=5x-4",
)

# Each group uses the same RNG seed and changes only the two x strokes. This
# isolates height/width sensitivity from digits, operators, timing, and jitter.
GEOMETRIES = (
    ("lowercase-standard", 0.58, 0.42, 1.00),
    ("lowercase-narrow", 0.58, 0.42, 0.72),
    ("lowercase-wide", 0.58, 0.42, 1.28),
    ("lowercase-tall", 0.72, 0.28, 1.00),
    ("full-height", 1.00, 0.00, 1.00),
)


def main() -> None:
    SAMPLES.mkdir(parents=True, exist_ok=True)
    manifest = []
    for expression_index, expression in enumerate(EXPRESSIONS, start=1):
        for geometry, height_scale, y_offset, width_scale in GEOMETRIES:
            fixture_id = f"synthetic-linear-v2-{expression_index:03d}-{geometry}"
            sample_name = f"samples/{fixture_id}.json"
            sample = strokes_for(
                expression,
                10_000 + expression_index,
                x_height_scale=height_scale,
                x_y_offset=y_offset,
                x_width_scale=width_scale,
            )
            (OUTPUT / sample_name).write_text(
                json.dumps(sample, sort_keys=True, separators=(",", ":")) + "\n",
                encoding="utf-8",
            )
            tags = [
                "x-case",
                "x-height-full"
                if geometry == "full-height"
                else "x-height-lowercase",
            ]
            if "-" in expression:
                tags.append("minus-equals")
            manifest.append(
                {
                    "schema_version": 1,
                    "id": fixture_id,
                    "domain": "math",
                    "topic": "linear-equations",
                    "difficulty": "ambiguous",
                    "device_group": f"synthetic-vector-linear-v2-{geometry}",
                    "browser_group": "offline-generator",
                    "inputs": {"strokes": sample_name},
                    "expected": {
                        "format": "ascii",
                        "canonical": expression,
                        "accepted": _accepted_forms(expression),
                        "unreadable": False,
                    },
                    "tags": tags,
                    "annotation": {
                        "reviewer_count": 1,
                        "status": "reviewed",
                        "notes": (
                            "Deterministic paired synthetic linear-equation "
                            f"geometry probe ({geometry}); not decision evidence."
                        ),
                    },
                    "consent": {
                        "retention_approved": True,
                        "retention_policy_id": "repo-synthetic-v1",
                        "source": "synthetic",
                        "provenance_id": "synthetic-myscript-linear-v2",
                        "approved_providers": ["myscript"],
                    },
                }
            )
    (OUTPUT / "manifest.jsonl").write_text(
        "".join(
            json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n"
            for record in manifest
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
