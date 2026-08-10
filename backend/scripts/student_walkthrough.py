"""Drive the live API the way a student actually uses it, and report.

This exists because every automated test in this repo mocks the model, so
"hints work" was an untested claim right up until it was tested by hand and
turned out to be false on three separate counts.

For each question it does what a person does, in order:

  1. open the problem (the session that builds the answer vault)
  2. submit the CORRECT working, and expect `valid`
  3. submit a WRONG line, and expect `invalid` on the right line
  4. ask for hint level 1, then 2, then 3

and then reports, per question, whether each of those actually happened.

The headline numbers are the ones worth arguing about:

  * how many questions produce a generated hint at every level, rather than
    silently serving the static floor
  * whether any correct answer was called wrong, which is the failure this
    product cannot ship with

Run it against the deployed service:

    python backend/scripts/student_walkthrough.py
    python backend/scripts/student_walkthrough.py --topic balancing
    python backend/scripts/student_walkthrough.py --base http://127.0.0.1:8000

It makes real model calls and therefore costs real money. It is never part
of pytest.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

DEFAULT_BASE = "https://verity-ai-389644353290.us-central1.run.app/api"

GREEN, RED, AMBER, GREY, BOLD, OFF = (
    "\033[32m",
    "\033[31m",
    "\033[33m",
    "\033[90m",
    "\033[1m",
    "\033[0m",
)


def post(base: str, path: str, payload: dict, timeout: int = 240) -> dict:
    request = urllib.request.Request(
        f"{base}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode())


# --------------------------------------------------------------------------
# The questions. Ten per topic, ordered easy to nasty, each with a correct
# answer and a plausible wrong one a real student would write.
# --------------------------------------------------------------------------

BALANCING = [
    ("N2 + H2 -> NH3", "N2 + 3H2 -> 2NH3", "N2 + 2H2 -> 2NH3"),
    ("Fe + O2 -> Fe2O3", "4Fe + 3O2 -> 2Fe2O3", "2Fe + O2 -> Fe2O3"),
    ("C3H8 + O2 -> CO2 + H2O", "C3H8 + 5O2 -> 3CO2 + 4H2O", "C3H8 + 3O2 -> 3CO2 + 4H2O"),
    ("C4H10 + O2 -> CO2 + H2O", "2C4H10 + 13O2 -> 8CO2 + 10H2O", "C4H10 + 6O2 -> 4CO2 + 5H2O"),
    ("Al + HCl -> AlCl3 + H2", "2Al + 6HCl -> 2AlCl3 + 3H2", "Al + 3HCl -> AlCl3 + H2"),
    ("KClO3 -> KCl + O2", "2KClO3 -> 2KCl + 3O2", "KClO3 -> KCl + O2"),
    ("Ca(OH)2 + H3PO4 -> Ca3(PO4)2 + H2O", "3Ca(OH)2 + 2H3PO4 -> Ca3(PO4)2 + 6H2O", "Ca(OH)2 + H3PO4 -> Ca3(PO4)2 + H2O"),
    ("Al + CuSO4 -> Al2(SO4)3 + Cu", "2Al + 3CuSO4 -> Al2(SO4)3 + 3Cu", "Al + CuSO4 -> Al2(SO4)3 + Cu"),
    ("NH3 + O2 -> NO + H2O", "4NH3 + 5O2 -> 4NO + 6H2O", "2NH3 + 2O2 -> 2NO + 3H2O"),
    ("Fe2O3 + CO -> Fe + CO2", "Fe2O3 + 3CO -> 2Fe + 3CO2", "Fe2O3 + CO -> 2Fe + CO2"),
]

# (label, params, correct answer line, wrong answer line)
SOLUTIONS = [
    ("molarity", {"task": "molarity", "formula": "NaCl", "mass_g": 5.85, "volume_l": 1.0}, "M = 0.100 M", "M = 0.585 M"),
    ("dilution", {"task": "dilution", "initial_concentration_m": 2.0, "initial_volume_l": 0.050, "final_volume_l": 0.250}, "M2 = 0.400 M", "M2 = 0.100 M"),
    ("strong acid pH", {"task": "strong_acid_ph", "concentration_m": 0.010}, "pH = 2.00", "pH = 12.00"),
    ("strong base pH", {"task": "strong_base_ph", "concentration_m": 0.010}, "pH = 12.00", "pH = 2.00"),
    ("weak acid pH", {"task": "weak_acid_ph", "concentration_m": 0.100, "ka": 1.8e-5}, "pH = 2.87", "pH = 3.20"),
    ("weak base pH", {"task": "weak_base_ph", "concentration_m": 0.100, "kb": 1.8e-5}, "pH = 11.13", "pH = 2.87"),
    ("buffer", {"task": "buffer_ph", "acid_concentration_m": 0.250, "base_concentration_m": 0.400, "pka": 4.74}, "pH = 4.94", "pH = 4.54"),
    ("percent by mass", {"task": "percent_by_mass", "solute_mass_g": 5.0, "solution_mass_g": 100.0}, "5.00 %", "0.05 %"),
    ("weak acid, small Ka", {"task": "weak_acid_ph", "concentration_m": 0.500, "ka": 6.3e-10}, "pH = 4.75", "pH = 5.20"),
    ("dilution to volume", {"task": "dilution", "initial_concentration_m": 12.0, "initial_volume_l": 0.010, "final_concentration_m": 0.500}, "V2 = 0.240 L", "V2 = 0.120 L"),
]

STOICHIOMETRY = [
    ("molar mass", {"task": "molar_mass", "formula": "H2O"}, "18.02 g/mol", "20.00 g/mol"),
    ("molar mass, hydrate", {"task": "molar_mass", "formula": "CuSO4"}, "159.61 g/mol", "150.00 g/mol"),
    ("percent composition", {"task": "percent_composition", "formula": "H2O", "element": "O"}, "88.8 %", "50.0 %"),
    ("moles from mass", {"task": "moles_from_mass", "formula": "NaCl", "mass_g": 58.44}, "1.00 mol", "2.00 mol"),
    ("mass from moles", {"task": "mass_from_moles", "formula": "CO2", "moles": 2.0}, "88.02 g", "44.01 g"),
    ("moles from mass, small", {"task": "moles_from_mass", "formula": "H2O", "mass_g": 9.0}, "0.499 mol", "1.00 mol"),
    ("percent composition, C", {"task": "percent_composition", "formula": "CO2", "element": "C"}, "27.3 %", "50.0 %"),
    ("molar mass, organic", {"task": "molar_mass", "formula": "C6H12O6"}, "180.16 g/mol", "172.00 g/mol"),
    ("mass from moles, half", {"task": "mass_from_moles", "formula": "NaOH", "moles": 0.5}, "20.00 g", "40.00 g"),
    ("percent composition, N", {"task": "percent_composition", "formula": "NH3", "element": "N"}, "82.2 %", "25.0 %"),
]


def check_balancing(base, question, line):
    return post(base, "/chemistry/balance", {
        "reference_equation": question,
        "steps": [{"line_number": 1, "equation": line}],
    })


def session_balancing(base, question):
    return post(base, "/chemistry/session", {
        "topic": "balancing",
        "problem": f"Balance: {question}",
        "reference_equation": question,
    })


def check_numeric(base, endpoint, params, line):
    return post(base, endpoint, {**params, "steps": [{"line_number": 1, "smiles": line}]})


def session_numeric(base, topic, key, params, label):
    return post(base, "/chemistry/session", {
        "topic": topic,
        "problem": label,
        key: {**params, "steps": [{"line_number": 1, "smiles": "0"}]},
    })


def status_of(data):
    verdicts = data.get("verdicts") or []
    if not verdicts:
        return data.get("problem_error") or "no verdict"
    return verdicts[0].get("status") or ("valid" if verdicts[0].get("valid") else "invalid")


def ask_hint(base, session_id, topic, problem, student_line, error_type, level):
    return post(base, "/hint", {
        "line_number": 1,
        "error_type": error_type,
        "level": level,
        "subject": "chemistry",
        "topic": topic,
        "session_id": session_id,
        "problem": problem,
        "student_line": student_line,
    })


def run_question(base, topic, label, problem, correct, wrong, opener, checker, error_type):
    row = {"topic": topic, "label": label, "correct": None, "wrong": None,
           "levels": {}, "notes": []}

    try:
        opened = opener()
        session_id = opened.get("session_id")
    except Exception as exc:
        row["notes"].append(f"session failed: {exc}")
        return row

    try:
        row["correct"] = status_of(checker(correct))
    except Exception as exc:
        row["notes"].append(f"correct check failed: {exc}")
    try:
        row["wrong"] = status_of(checker(wrong))
    except Exception as exc:
        row["notes"].append(f"wrong check failed: {exc}")

    for level in (1, 2, 3):
        try:
            data = ask_hint(base, session_id, topic, problem, wrong, error_type, level)
            row["levels"][level] = {
                "source": data.get("source"),
                "terminal": data.get("terminal_step"),
                "hint": (data.get("hint") or "")[:150],
                "example": bool(data.get("worked_example")),
                "em_dash": "—" in (data.get("hint") or ""),
            }
        except Exception as exc:
            row["levels"][level] = {"source": "error", "hint": str(exc)[:80]}
    return row


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default=DEFAULT_BASE)
    parser.add_argument("--topic", default="all")
    parser.add_argument("--limit", type=int, default=0, help="questions per topic")
    args = parser.parse_args()
    base = args.base.rstrip("/")

    rows = []
    started = time.time()

    def wanted(name):
        return args.topic in ("all", name)

    if wanted("balancing"):
        items = BALANCING[: args.limit] if args.limit else BALANCING
        for question, correct, wrong in items:
            print(f"{GREY}balancing  {question}{OFF}", flush=True)
            rows.append(run_question(
                base, "balancing", question, f"Balance: {question}", correct, wrong,
                opener=lambda q=question: session_balancing(base, q),
                checker=lambda line, q=question: check_balancing(base, q, line),
                error_type="unbalanced_atoms",
            ))

    if wanted("solutions"):
        items = SOLUTIONS[: args.limit] if args.limit else SOLUTIONS
        for label, params, correct, wrong in items:
            print(f"{GREY}solutions  {label}{OFF}", flush=True)
            rows.append(run_question(
                base, "solutions", label, label, correct, wrong,
                opener=lambda p=params, l=label: session_numeric(base, "solutions", "solutions", p, l),
                checker=lambda line, p=params: check_numeric(base, "/chemistry/solutions", p, line),
                error_type="wrong_value",
            ))

    if wanted("stoichiometry"):
        items = STOICHIOMETRY[: args.limit] if args.limit else STOICHIOMETRY
        for label, params, correct, wrong in items:
            print(f"{GREY}stoich     {label}{OFF}", flush=True)
            rows.append(run_question(
                base, "stoichiometry", label, label, correct, wrong,
                opener=lambda p=params, l=label: session_numeric(base, "stoichiometry", "stoichiometry", p, l),
                checker=lambda line, p=params: check_numeric(base, "/chemistry/stoichiometry", p, line),
                error_type="wrong_value",
            ))

    # ---------------------------------------------------------------- report
    print()
    print(f"{BOLD}{'topic':14}{'question':34}{'correct':10}{'wrong':10}  L1     L2     L3{OFF}")
    print("-" * 96)

    fatal = []
    generated = {1: 0, 2: 0, 3: 0}
    em_dashes = 0

    for row in rows:
        def mark(value, want):
            if value == want:
                return f"{GREEN}{value:<9}{OFF}"
            return f"{RED}{str(value):<9}{OFF}"

        cells = []
        for level in (1, 2, 3):
            info = row["levels"].get(level) or {}
            source = info.get("source")
            if source == "model":
                generated[level] += 1
                cells.append(f"{GREEN}model {OFF}")
            elif source == "fallback":
                cells.append(f"{AMBER}floor {OFF}")
            else:
                cells.append(f"{RED}err   {OFF}")
            if info.get("em_dash"):
                em_dashes += 1

        print(
            f"{row['topic']:14}{row['label'][:33]:34}"
            f"{mark(row['correct'], 'valid')}"
            f"{mark(row['wrong'], 'invalid')}  "
            + " ".join(cells)
        )
        if row["correct"] != "valid":
            fatal.append((row["label"], f"correct answer judged {row['correct']}"))
        if row["wrong"] != "invalid":
            fatal.append((row["label"], f"wrong answer judged {row['wrong']}"))
        for note in row["notes"]:
            print(f"    {RED}{note}{OFF}")

    total = len(rows) or 1
    print()
    print(f"{BOLD}questions{OFF} {len(rows)}   {BOLD}elapsed{OFF} {time.time() - started:.0f}s")
    for level in (1, 2, 3):
        share = generated[level] / total * 100
        colour = GREEN if share > 80 else AMBER if share > 40 else RED
        print(f"  level {level} generated: {colour}{generated[level]}/{len(rows)} ({share:.0f}%){OFF}")
    print(f"  em dashes in hints: {RED if em_dashes else GREEN}{em_dashes}{OFF}")

    print()
    if fatal:
        print(f"{RED}{BOLD}FATAL: {len(fatal)} judging failures{OFF}")
        for label, why in fatal:
            print(f"  {RED}{label}: {why}{OFF}")
        return 1
    print(f"{GREEN}{BOLD}No judging failures. Every correct answer passed and every wrong one was caught.{OFF}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
