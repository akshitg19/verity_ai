#!/usr/bin/env python3
"""Generate deterministic synthetic fixtures for chemistry routing tests."""

from __future__ import annotations

import json
import math
import struct
import zlib
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs/handwriting/fixtures/synthetic-chemistry-routing-v1"
SAMPLES = OUTPUT / "samples"
CANVAS_HEIGHT = 120

Point = tuple[float, float]
PathShape = list[Point]


def path(*points: Point) -> PathShape:
    return list(points)


GLYPHS: dict[str, list[PathShape]] = {
    "0": [path((.5, 0), (.15, .1), (0, .5), (.15, .9), (.5, 1), (.85, .9), (1, .5), (.85, .1), (.5, 0))],
    "1": [path((.2, .2), (.5, 0), (.5, 1)), path((.2, 1), (.8, 1))],
    "2": [path((0, .2), (.25, 0), (.7, 0), (1, .25), (.9, .45), (0, 1), (1, 1))],
    "3": [path((0, .1), (.5, 0), (.9, .2), (.55, .5), (.95, .75), (.65, 1), (.1, .9))],
    "4": [path((.8, 1), (.8, 0)), path((.8, .1), (0, .7), (1, .7))],
    "C": [path((1, .1), (.7, 0), (.25, .1), (0, .5), (.25, .9), (.7, 1), (1, .9))],
    "F": [path((0, 1), (0, 0), (1, 0)), path((0, .5), (.75, .5))],
    "H": [path((0, 0), (0, 1)), path((1, 0), (1, 1)), path((0, .5), (1, .5))],
    "N": [path((0, 1), (0, 0), (1, 1), (1, 0))],
    "O": [path((.5, 0), (.15, .1), (0, .5), (.15, .9), (.5, 1), (.85, .9), (1, .5), (.85, .1), (.5, 0))],
    "S": [path((1, .1), (.7, 0), (.2, .1), (0, .35), (.8, .6), (1, .8), (.75, 1), (.2, .9), (0, .8))],
    "e": [path((0, .55), (1, .55), (.8, .25), (.35, .2), (0, .5), (.2, .9), (.75, 1), (1, .85))],
    "l": [path((.5, 0), (.5, 1))],
    "o": [path((.5, .2), (.15, .3), (0, .6), (.2, .9), (.6, 1), (1, .75), (.9, .35), (.5, .2))],
    "+": [path((0, .5), (1, .5)), path((.5, 0), (.5, 1))],
    "-": [path((0, .5), (1, .5))],
    ">": [path((0, 0), (1, .5), (0, 1))],
    "^": [path((0, .6), (.5, 0), (1, .6))],
}


def _densify(points: PathShape, steps: int = 7) -> PathShape:
    dense: PathShape = []
    for start, end in zip(points, points[1:]):
        for index in range(steps):
            ratio = index / steps
            dense.append(
                (
                    start[0] + (end[0] - start[0]) * ratio,
                    start[1] + (end[1] - start[1]) * ratio,
                )
            )
    dense.append(points[-1])
    return dense


def _stroke(points: Iterable[Point], timestamp: int) -> tuple[dict, int]:
    values = []
    for x, y in points:
        values.append(
            {
                "x": round(x, 3),
                "y": round(y, 3),
                "t": timestamp,
                "p": 0.5,
            }
        )
        timestamp += 10
    return {"pointer_type": "synthetic", "points": values}, timestamp + 35


def text_ink(layout: list[tuple[str, float, float]]) -> dict:
    strokes = []
    timestamp = 0
    x_origin = 18.0
    for character, scale, y_offset in layout:
        width = 24 * scale
        height = 48 * scale
        for segment in GLYPHS[character]:
            points = [
                (x_origin + x * width, 24 + y_offset + y * height)
                for x, y in _densify(segment)
            ]
            stroke, timestamp = _stroke(points, timestamp)
            strokes.append(stroke)
        x_origin += width + 9
    return {
        "schema_version": 1,
        "canvas": {
            "width": math.ceil(x_origin + 18),
            "height": CANVAS_HEIGHT,
            "units": "css_px",
            "origin": "top_left",
        },
        "strokes": strokes,
    }


def structure_ink(name: str) -> dict:
    timestamp = 0
    strokes = []
    if name == "benzene":
        vertices = [(70, 20), (110, 42), (110, 82), (70, 104), (30, 82), (30, 42), (70, 20)]
        paths = [vertices, [(43, 47), (68, 33)], [(97, 49), (97, 76)], [(68, 91), (43, 77)]]
        width = 140
    else:
        paths = [[(25, 75), (70, 45), (115, 75)]]
        for segment in GLYPHS["O"]:
            paths.append([(135 + x * 24, 45 + y * 40) for x, y in segment])
        width = 185
    for segment in paths:
        stroke, timestamp = _stroke(_densify(segment), timestamp)
        strokes.append(stroke)
    return {
        "schema_version": 1,
        "canvas": {
            "width": width,
            "height": CANVAS_HEIGHT,
            "units": "css_px",
            "origin": "top_left",
        },
        "strokes": strokes,
    }


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + kind
        + payload
        + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    )


def _paint_disk(pixels: bytearray, width: int, height: int, x: int, y: int) -> None:
    for offset_y in range(-2, 3):
        for offset_x in range(-2, 3):
            if offset_x * offset_x + offset_y * offset_y > 5:
                continue
            target_x = x + offset_x
            target_y = y + offset_y
            if 0 <= target_x < width and 0 <= target_y < height:
                pixels[target_y * width + target_x] = 0


def render_png(ink: dict) -> bytes:
    width = int(ink["canvas"]["width"])
    height = int(ink["canvas"]["height"])
    pixels = bytearray([255]) * (width * height)
    for stroke in ink["strokes"]:
        points = stroke["points"]
        for start, end in zip(points, points[1:]):
            delta_x = end["x"] - start["x"]
            delta_y = end["y"] - start["y"]
            steps = max(1, math.ceil(max(abs(delta_x), abs(delta_y))))
            for index in range(steps + 1):
                ratio = index / steps
                _paint_disk(
                    pixels,
                    width,
                    height,
                    round(start["x"] + delta_x * ratio),
                    round(start["y"] + delta_y * ratio),
                )
    scanlines = b"".join(
        b"\x00" + bytes(pixels[row * width : (row + 1) * width])
        for row in range(height)
    )
    header = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", header)
        + _png_chunk(b"IDAT", zlib.compress(scanlines, level=9))
        + _png_chunk(b"IEND", b"")
    )


TEXT_CASES = (
    ("chem-text-co-element", [("C", 1, 0), ("o", .75, 12)], "Co", ["chemistry_capitalization"]),
    ("chem-text-co-molecule", [("C", 1, 0), ("O", 1, 0)], "CO", ["chemistry_capitalization"]),
    ("chem-text-chloride", [("C", 1, 0), ("l", .8, 5)], "Cl", ["chemistry_capitalization", "one-l-i"]),
    ("chem-text-c-one", [("C", 1, 0), ("1", .8, 5)], "C1", ["one-l-i"]),
    ("chem-text-ammonium", [("N", 1, 0), ("H", 1, 0), ("4", .65, 22), ("+", .6, -2)], "NH4+", ["subscript", "superscript", "charge"]),
    ("chem-text-iron-charge", [("F", 1, 0), ("e", .8, 10), ("3", .6, -4), ("+", .55, -4)], "Fe3+", ["chemistry_capitalization", "superscript", "charge"]),
    ("chem-text-reaction", [(character, .72, 10) for character in "2H2+O2->2H2O"], "2H2+O2->2H2O", ["reaction_arrow"]),
    ("chem-text-sulfate", [("S", 1, 0), ("O", 1, 0), ("4", .65, 22), ("^", .5, -5), ("2", .55, -5), ("-", .55, -5)], "SO4^2-", ["subscript", "superscript", "charge"]),
)


def _manifest_record(
    fixture_id: str,
    *,
    domain: str,
    topic: str,
    canonical: str,
    output_format: str,
    tags: list[str],
) -> dict:
    return {
        "schema_version": 1,
        "id": fixture_id,
        "domain": domain,
        "topic": topic,
        "difficulty": "ambiguous" if tags else "basic",
        "device_group": "synthetic-vector-chemistry-v1",
        "browser_group": "offline-generator",
        "inputs": {
            "strokes": f"samples/{fixture_id}.json",
            "image": f"samples/{fixture_id}.png",
        },
        "expected": {
            "format": output_format,
            "canonical": canonical,
            "accepted": [],
            "unreadable": False,
        },
        "tags": tags,
        "annotation": {
            "reviewer_count": 1,
            "status": "reviewed",
            "notes": "Deterministic synthetic chemistry routing fixture; not decision evidence.",
        },
        "consent": {
            "retention_approved": True,
            "retention_policy_id": "repo-synthetic-v1",
            "source": "synthetic",
            "provenance_id": "synthetic-chemistry-routing-v1",
            "approved_providers": ["fixture-echo", "gemini"],
        },
    }


def main() -> None:
    SAMPLES.mkdir(parents=True, exist_ok=True)
    records = []
    for fixture_id, layout, canonical, tags in TEXT_CASES:
        ink = text_ink(layout)
        records.append(
            _manifest_record(
                fixture_id,
                domain="chemistry_text",
                topic="written-chemistry-routing",
                canonical=canonical,
                output_format="text",
                tags=tags,
            )
        )
        (SAMPLES / f"{fixture_id}.json").write_text(
            json.dumps(ink, sort_keys=True, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        (SAMPLES / f"{fixture_id}.png").write_bytes(render_png(ink))

    for fixture_id, structure_name, canonical in (
        ("chem-structure-benzene", "benzene", "c1ccccc1"),
        ("chem-structure-ethanol", "ethanol", "CCO"),
    ):
        ink = structure_ink(structure_name)
        records.append(
            _manifest_record(
                fixture_id,
                domain="chemistry_structure",
                topic="molecular-structure-routing",
                canonical=canonical,
                output_format="smiles",
                tags=[],
            )
        )
        (SAMPLES / f"{fixture_id}.json").write_text(
            json.dumps(ink, sort_keys=True, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        (SAMPLES / f"{fixture_id}.png").write_bytes(render_png(ink))

    (OUTPUT / "manifest.jsonl").write_text(
        "".join(
            json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n"
            for record in records
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
