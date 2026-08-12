"""Ask every concept for every hint level, against the real model, and grade it.

`student_walkthrough.py` answers "did a hint come back". This answers "was it
any good", which is the question that actually decides whether a student is
helped. Thirty concepts, two questions each, three levels each: 180 live
generations, every one of them checked against the rules in `hint_rules.py`
and the product rules in CLAUDE.md.

What counts as a failure here, in the order it matters:

  * a correct answer judged wrong, or a wrong answer judged correct
  * the answer to the student's own problem appearing in a level 1 or 2 hint
  * a SMILES string reaching a student, on any level, on any topic
  * an unverified worked example rendering
  * the static floor served when the model was available, which means a
    bug in our code rather than a design decision
  * an em dash, a row number ("line 3"), or an empty hint

Run the API first, then this against it:

    backend\\venv\\Scripts\\python.exe -m uvicorn main:app --port 8077
    backend\\venv\\Scripts\\python.exe backend\\scripts\\live_hint_audit.py

It makes real model calls and costs real money. It is never part of pytest.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from live_questions import QUESTIONS, Question  # noqa: E402

DEFAULT_BASE = "http://127.0.0.1:8077"

GREEN, RED, AMBER, GREY, BOLD, OFF = (
    "\033[32m", "\033[31m", "\033[33m", "\033[90m", "\033[1m", "\033[0m",
)

# Pointing by position instead of by content. The student laid the page out
# themselves, so our row numbers are not theirs.
ROW_POINTER = re.compile(
    r"\b(?:line|step|row)\s*(?:number\s*)?\d\b"
    r"|\b(?:first|second|third|fourth|fifth|last)\s+(?:line|row|step)\b",
    re.IGNORECASE,
)

# Anything that reads as SMILES rather than as chemistry a person writes.
# Deliberately narrow: it looks for the punctuation SMILES uses and school
# chemistry does not, so "H2SO4" is not a hit and "CC(=O)OC" is.
SMILES_SHAPE = re.compile(r"[A-Za-z][A-Za-z0-9]*\(=O\)|\[[A-Za-z][a-z]?[+-@H0-9]*\]")

EQUATION_CONCEPTS = {"balance", "net_ionic", "half_reaction"}
STRUCTURE_CONCEPTS = {
    "formula_structure", "isomer", "match_structure", "functional_group",
    "draw_from_name", "reaction",
}
QUANTITY_CONCEPTS = {
    "molar_mass", "percent_composition", "moles_from_mass", "mass_from_moles",
    "theoretical_yield", "percent_yield", "molarity", "dilution",
    "strong_acid_ph", "strong_base_ph", "weak_acid_ph", "weak_base_ph",
    "buffer_ph", "titration_concentration", "percent_by_mass",
    "cell_potential",
}


def post(base: str, path: str, payload: dict, timeout: int = 300) -> dict:
    request = urllib.request.Request(
        f"{base}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()[:300]
        raise RuntimeError(f"{exc.code} {path} {body}") from exc


def status_of(data: dict) -> str:
    verdicts = data.get("verdicts") or []
    if not verdicts:
        return data.get("problem_error") or "no verdict"
    first = verdicts[0]
    return first.get("status") or ("valid" if first.get("valid") else "invalid")


def judge(base: str, question: Question, line: str) -> str:
    if not question.check_path:
        return "skipped"
    body = dict(question.check_body)
    body["steps"] = [{"line_number": 1, question.step_key: line}]
    if question.check_path in ("/chemistry/stoichiometry", "/chemistry/solutions"):
        body["answers_only"] = True
    return status_of(post(base, question.check_path, body))


def _mentions(text: str, needle: str) -> bool:
    """Whole-token containment, so CC(C)C is not found inside CC(C)CC."""
    pattern = re.compile(
        r"(?<![A-Za-z0-9()=\[\]])" + re.escape(needle) + r"(?![A-Za-z0-9()=\[\]])",
        re.IGNORECASE,
    )
    return bool(pattern.search(text))


def grade(question: Question, level: int, payload: dict) -> list[str]:
    """Every rule this hint could break, as a list of plain sentences."""
    problems: list[str] = []
    hint = payload.get("hint") or ""
    example = payload.get("worked_example")

    if not hint.strip():
        problems.append("empty hint")
        return problems
    if payload.get("source") != "model":
        problems.append("served the static floor with the model available")
    if "—" in hint:
        problems.append("em dash in the hint")
    if ROW_POINTER.search(hint):
        found = ROW_POINTER.search(hint).group(0)
        problems.append(f"points by position: {found!r}")
    if len(hint) < 25:
        problems.append(f"hint is {len(hint)} characters, too short to help")

    # Only what a person reads. `structure` is a SMILES handed to the
    # renderer and drawn as a picture, and searching it for the answer as a
    # substring reported CC(C)C leaking out of an example whose answer was
    # CC(C)CC, which is a different molecule.
    visible = [hint]
    if example:
        visible += [example.get("problem") or "", example.get("technique") or ""]
        visible += list(example.get("steps") or [])
    searched = " ".join(visible)

    leak = question.leak or question.correct
    if level in (1, 2) and leak and _mentions(searched, leak):
        problems.append(f"the answer {leak!r} appears in a level {level} hint")

    # No SMILES may ever reach a person, on any level or topic. It is our
    # internal representation, and a student who has never heard of it reads
    # CC(=O)OC as noise.
    for text in visible:
        found = SMILES_SHAPE.search(text or "")
        if found:
            problems.append(f"SMILES reached the student: {found.group(0)!r}")
            break

    if level == 2:
        if not example:
            problems.append("level 2 with no worked example")
        else:
            if not example.get("verified"):
                problems.append("worked example not verified")
            if not example.get("steps"):
                problems.append("worked example has no steps")
            if question.problem.lower() in (example.get("problem") or "").lower():
                problems.append("the worked example is the student's own problem")
            equations = [item for item in (example.get("equations") or []) if item]
            quantities = [item for item in (example.get("quantities") or []) if item]
            structure = example.get("structure")
            if question.concept in EQUATION_CONCEPTS and not equations:
                problems.append("no equations to animate on an equation concept")
            if question.concept in QUANTITY_CONCEPTS and not quantities:
                problems.append("no quantities to animate on a numeric concept")
            if question.concept in STRUCTURE_CONCEPTS and not structure:
                problems.append("no structure to draw on a structure concept")
    return problems


def run_question(base: str, index: int, question: Question) -> dict:
    row = {
        "index": index, "concept": question.concept, "topic": question.topic,
        "problem": question.problem, "judged": {}, "levels": {},
        "problems": [], "session": None,
    }
    try:
        opened = post(base, "/chemistry/session", {
            "topic": question.topic, "problem": question.problem,
            **question.session,
        })
        row["session"] = opened.get("session_id")
    except Exception as exc:
        row["problems"].append(f"session failed: {exc}")
        return row

    for label, line, want in (("correct", question.correct, "valid"),
                              ("wrong", question.wrong, "invalid")):
        try:
            verdict = judge(base, question, line)
        except Exception as exc:
            verdict = f"error: {exc}"
        row["judged"][label] = verdict
        if verdict in ("skipped", want):
            continue
        if question.judge_optional and verdict in ("unsupported", "parse_error"):
            continue
        row["problems"].append(
            f"the {label} answer {line!r} was judged {verdict}, wanted {want}"
        )

    for level in (1, 2, 3):
        try:
            payload = post(base, "/hint", {
                "line_number": len(question.working) or 1,
                "error_type": question.error_type,
                "level": level,
                "subject": "chemistry",
                "topic": question.topic,
                "problem_type": question.concept,
                "session_id": row["session"],
                "problem": question.problem,
                "student_line": question.wrong,
                "working_lines": question.working,
            })
        except Exception as exc:
            row["levels"][level] = {"source": "error", "hint": str(exc)[:200]}
            row["problems"].append(f"level {level} failed: {exc}")
            continue

        faults = grade(question, level, payload)
        row["levels"][level] = {
            "source": payload.get("source"),
            "hint": payload.get("hint"),
            "example": payload.get("worked_example"),
            "terminal": payload.get("terminal_step"),
            "latency_ms": payload.get("latency_ms"),
            "faults": faults,
        }
        row["problems"].extend(f"level {level}: {fault}" for fault in faults)
    return row


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--concept", default="all")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--out", default="hint_audit.json")
    args = parser.parse_args()
    base = args.base.rstrip("/")

    wanted = [
        question for question in QUESTIONS
        if args.concept in ("all", question.concept)
    ]
    if not wanted:
        print(f"no questions for concept {args.concept!r}")
        return 2

    print(f"{BOLD}{len(wanted)} questions, {len(wanted) * 3} live hints{OFF}")
    started = time.time()
    rows: list[dict] = []

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [
            pool.submit(run_question, base, index, question)
            for index, question in enumerate(wanted)
        ]
        for done, future in enumerate(futures, start=1):
            row = future.result()
            rows.append(row)
            mark = f"{RED}x{OFF}" if row["problems"] else f"{GREEN}.{OFF}"
            print(f"{mark} {done:>3}/{len(wanted)} {row['concept']}", flush=True)

    rows.sort(key=lambda item: item["index"])
    Path(args.out).write_text(json.dumps(rows, indent=2), encoding="utf-8")

    # ------------------------------------------------------------- the table
    print()
    print(f"{BOLD}{'concept':26}{'correct':10}{'wrong':10}  L1     L2     L3{OFF}")
    print("-" * 74)
    generated = {1: 0, 2: 0, 3: 0}
    for row in rows:
        cells = []
        for level in (1, 2, 3):
            info = row["levels"].get(level) or {}
            source = info.get("source")
            if source == "model" and not info.get("faults"):
                generated[level] += 1
                cells.append(f"{GREEN}ok    {OFF}")
            elif source == "model":
                generated[level] += 1
                cells.append(f"{AMBER}flag  {OFF}")
            elif source == "fallback":
                cells.append(f"{RED}floor {OFF}")
            else:
                cells.append(f"{RED}err   {OFF}")

        def mark(value, want):
            colour = GREEN if value in (want, "skipped") else RED
            return f"{colour}{str(value)[:9]:<10}{OFF}"

        print(
            f"{row['concept'][:25]:26}"
            f"{mark(row['judged'].get('correct'), 'valid')}"
            f"{mark(row['judged'].get('wrong'), 'invalid')}  "
            + " ".join(cells)
        )

    total = len(rows)
    print()
    for level in (1, 2, 3):
        share = generated[level] / total * 100
        colour = GREEN if share > 90 else AMBER if share > 60 else RED
        print(f"  level {level} generated: {colour}{generated[level]}/{total} "
              f"({share:.0f}%){OFF}")
    print(f"  elapsed {time.time() - started:.0f}s   written to {args.out}")

    # ---------------------------------------------------------- the findings
    faulty = [row for row in rows if row["problems"]]
    print()
    if not faulty:
        print(f"{GREEN}{BOLD}Every concept passed every level.{OFF}")
        return 0
    print(f"{RED}{BOLD}{len(faulty)} of {total} questions have findings{OFF}")
    for row in faulty:
        print(f"\n{BOLD}{row['concept']}{OFF}  {row['problem'][:70]}")
        for problem in row["problems"]:
            print(f"    {RED}{problem}{OFF}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
