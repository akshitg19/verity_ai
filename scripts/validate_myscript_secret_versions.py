#!/usr/bin/env python3
"""Reject mutable or malformed MyScript Secret Manager version references."""

from __future__ import annotations

import re
import sys
from collections.abc import Sequence


POSITIVE_NUMERIC_VERSION = re.compile(r"^[1-9][0-9]*$")
VERSION_LABELS = ("MYSCRIPT application-key", "MYSCRIPT HMAC-key")


def main(argv: Sequence[str] | None = None) -> int:
    values = list(sys.argv[1:] if argv is None else argv)
    if len(values) != len(VERSION_LABELS):
        print("Expected exactly two MyScript Secret Manager versions.", file=sys.stderr)
        return 2

    for label, value in zip(VERSION_LABELS, values):
        if not POSITIVE_NUMERIC_VERSION.fullmatch(value):
            print(
                f"{label} version must be a positive numeric Secret Manager version.",
                file=sys.stderr,
            )
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
