#!/usr/bin/env python3
"""Generate a deterministic, synthetic vector-only linear-equation smoke set."""

from __future__ import annotations

import json
import math
import random
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/handwriting/fixtures/synthetic-myscript-smoke-v1"
SAMPLES = OUTPUT / "samples"
X_CASE_OUTPUT = ROOT / "docs/handwriting/fixtures/synthetic-myscript-x-case-v1"
X_CASE_SAMPLES = X_CASE_OUTPUT / "samples"

EXPRESSIONS = (
    "x+1=2",
    "x+2=5",
    "2x=6",
    "3x+1=7",
    "4x-2=6",
    "5+x=9",
    "9-x=4",
    "x-3=5",
    "2+x=8",
    "7=x+2",
    "x=3",
    "x=8",
    "2x+3=9",
    "3x-2=7",
    "4x+5=9",
    "8=2x",
    "6=x+1",
    "x+7=9",
    "10-x=4",
    "x-1=6",
    "2x-1=5",
    "3+x=6",
    "5x=10",
    "12=3x",
    "x+4=11",
    "9=4+x",
    "6-x=2",
    "x-5=3",
    "2+x=10",
    "15=5x",
)


def line(*points: tuple[float, float]) -> list[tuple[float, float]]:
    return list(points)


GLYPHS: dict[str, list[list[tuple[float, float]]]] = {
    "0": [line((.5, 0), (.2, .1), (.05, .35), (.05, .7), (.2, .95), (.5, 1), (.8, .9), (.95, .65), (.95, .3), (.8, .05), (.5, 0))],
    "1": [line((.2, .2), (.5, 0), (.5, 1)), line((.2, 1), (.8, 1))],
    "2": [line((.05, .25), (.2, .05), (.55, 0), (.85, .15), (.9, .35), (.05, 1), (.95, 1))],
    "3": [line((.05, .1), (.35, 0), (.75, .05), (.9, .25), (.75, .48), (.4, .52), (.75, .55), (.95, .75), (.8, .95), (.4, 1), (.05, .9))],
    "4": [line((.75, 1), (.75, 0)), line((.75, .05), (.05, .7), (.95, .7))],
    "5": [line((.9, 0), (.15, 0), (.1, .45), (.55, .45), (.85, .55), (.9, .8), (.7, 1), (.3, 1), (.05, .9))],
    "6": [line((.85, .1), (.6, 0), (.25, .15), (.08, .45), (.1, .8), (.3, 1), (.65, .98), (.9, .75), (.8, .55), (.5, .45), (.15, .58))],
    "7": [line((.05, 0), (.95, 0), (.35, 1))],
    "8": [line((.5, .5), (.2, .4), (.1, .2), (.3, 0), (.7, 0), (.9, .2), (.8, .4), (.5, .5), (.2, .6), (.1, .8), (.3, 1), (.7, 1), (.9, .8), (.8, .6), (.5, .5))],
    "9": [line((.85, .45), (.55, .55), (.2, .45), (.05, .2), (.25, 0), (.65, 0), (.9, .25), (.85, .7), (.65, .95), (.35, 1), (.1, .9))],
    "x": [line((.05, .15), (.95, .9)), line((.9, .1), (.1, .95))],
    "+": [line((.05, .5), (.95, .5)), line((.5, .1), (.5, .9))],
    "-": [line((.05, .5), (.95, .5))],
    "=": [line((.05, .35), (.95, .35)), line((.05, .7), (.95, .7))],
}


def _densify(
    points: list[tuple[float, float]], count: int = 4
) -> list[tuple[float, float]]:
    dense: list[tuple[float, float]] = []
    for start, end in zip(points, points[1:]):
        for index in range(count):
            ratio = index / count
            dense.append(
                (
                    start[0] + (end[0] - start[0]) * ratio,
                    start[1] + (end[1] - start[1]) * ratio,
                )
            )
    dense.append(points[-1])
    return dense


def strokes_for(
    expression: str,
    variant: int,
    *,
    x_height_scale: float = 1.0,
    x_y_offset: float = 0.0,
    x_width_scale: float = 1.0,
) -> dict:
    rng = random.Random(20260816 + variant)
    glyph_width = 22 + (variant % 3)
    glyph_height = 42 + (variant % 4)
    spacing = 8 + (variant % 2)
    slant = ((variant % 5) - 2) * 0.7
    x_origin = 18.0
    y_origin = 20.0
    timestamp = 0.0
    strokes = []
    for character in expression:
        for segment in GLYPHS[character]:
            points = []
            for x_value, y_value in _densify(segment):
                jitter_x = rng.uniform(-0.45, 0.45)
                jitter_y = rng.uniform(-0.45, 0.45)
                transformed_y = (
                    x_y_offset + y_value * x_height_scale
                    if character == "x"
                    else y_value
                )
                transformed_x = x_value
                if character == "x" and x_width_scale != 1.0:
                    transformed_x = 0.5 + (x_value - 0.5) * x_width_scale
                x = (
                    x_origin
                    + transformed_x * glyph_width
                    + transformed_y * slant
                    + jitter_x
                )
                y = y_origin + transformed_y * glyph_height + jitter_y
                points.append(
                    {
                        "x": round(x, 3),
                        "y": round(y, 3),
                        "t": round(timestamp, 3),
                        "p": 0.5,
                    }
                )
                timestamp += 11 + (variant % 4)
            strokes.append({"pointer_type": "synthetic", "points": points})
            timestamp += 45
        x_origin += glyph_width + spacing
    width = math.ceil(x_origin + 18)
    return {
        "schema_version": 1,
        "canvas": {
            "width": width,
            "height": 90,
            "units": "css_px",
            "origin": "top_left",
        },
        "strokes": strokes,
    }


def _accepted_forms(expression: str) -> list[str]:
    accepted = []
    for candidate in (
        re.sub(r"(?<=\d)x", "*x", expression),
        re.sub(r"(?<=\d)x", " x", expression),
    ):
        if candidate != expression and candidate not in accepted:
            accepted.append(candidate)
    return accepted


def main() -> None:
    SAMPLES.mkdir(parents=True, exist_ok=True)
    manifest = []
    for index, expression in enumerate(EXPRESSIONS, start=1):
        fixture_id = f"synthetic-linear-{index:03d}"
        sample_name = f"samples/{fixture_id}.json"
        sample = strokes_for(expression, index)
        (OUTPUT / sample_name).write_text(
            json.dumps(sample, sort_keys=True, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        manifest.append(
            {
                "schema_version": 1,
                "id": fixture_id,
                "domain": "math",
                "topic": "linear-equations",
                "difficulty": "basic" if index <= 12 else "intermediate",
                "device_group": "synthetic-vector-v1",
                "browser_group": "offline-generator",
                "inputs": {"strokes": sample_name},
                "expected": {
                    "format": "ascii",
                    "canonical": expression,
                    "accepted": _accepted_forms(expression),
                    "unreadable": False,
                },
                "tags": [],
                "annotation": {
                    "reviewer_count": 1,
                    "status": "reviewed",
                    "notes": (
                        "Deterministic synthetic single-line vector smoke fixture."
                    ),
                },
                "consent": {
                    "retention_approved": True,
                    "retention_policy_id": "repo-synthetic-v1",
                    "source": "synthetic",
                    "provenance_id": "synthetic-myscript-smoke-v1",
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

    # The first smoke's four genuine failures were all x -> X. Its synthetic
    # x occupied the full digit height, making case visually ambiguous. Keep
    # every non-x point and every jitter sample identical within each pair,
    # changing only the x height. This bounded probe can distinguish a fixture
    # artifact from systematic provider casing without rewriting provider text.
    X_CASE_SAMPLES.mkdir(parents=True, exist_ok=True)
    x_case_manifest = []
    for pair_index, expression in enumerate(EXPRESSIONS[:10], start=1):
        for shape, scale, offset in (
            ("full-height", 1.0, 0.0),
            ("lowercase-height", 0.58, 0.42),
        ):
            fixture_id = f"synthetic-x-case-{pair_index:02d}-{shape}"
            sample_name = f"samples/{fixture_id}.json"
            sample = strokes_for(
                expression,
                pair_index,
                x_height_scale=scale,
                x_y_offset=offset,
            )
            (X_CASE_OUTPUT / sample_name).write_text(
                json.dumps(sample, sort_keys=True, separators=(",", ":")) + "\n",
                encoding="utf-8",
            )
            x_case_manifest.append(
                {
                    "schema_version": 1,
                    "id": fixture_id,
                    "domain": "math",
                    "topic": "linear-equations",
                    "difficulty": "ambiguous",
                    "device_group": "synthetic-vector-x-case-v1",
                    "browser_group": "offline-generator",
                    "inputs": {"strokes": sample_name},
                    "expected": {
                        "format": "ascii",
                        "canonical": expression,
                        "accepted": _accepted_forms(expression),
                        "unreadable": False,
                    },
                    "tags": ["x-case", f"x-height-{shape.removesuffix('-height')}"],
                    "annotation": {
                        "reviewer_count": 1,
                        "status": "reviewed",
                        "notes": (
                            "Deterministic paired synthetic x-height probe; "
                            "not decision evidence."
                        ),
                    },
                    "consent": {
                        "retention_approved": True,
                        "retention_policy_id": "repo-synthetic-v1",
                        "source": "synthetic",
                        "provenance_id": "synthetic-myscript-x-case-v1",
                        "approved_providers": ["myscript"],
                    },
                }
            )
    (X_CASE_OUTPUT / "manifest.jsonl").write_text(
        "".join(
            json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n"
            for record in x_case_manifest
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
