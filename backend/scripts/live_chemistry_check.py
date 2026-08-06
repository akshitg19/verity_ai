"""Real Gemini calls across the whole chemistry spine. Paid, never in CI.

The automated suite mocks every model call, which is the right rule for CI
and leaves one thing unmeasured: whether the live pipeline actually works.
This script is that measurement. It makes real calls, on real problems, and
asserts the things that must hold in production:

* structure recognition reads a rendered molecule back to the same structure
* every hint level generates, at every one of the six chemistry topics
* every generated level-2 example passes our own deterministic verifier
* nothing generated at any level states the answer

Usage, from the repository root:

    ./backend/venv/Scripts/python.exe backend/scripts/live_chemistry_check.py
    ./backend/venv/Scripts/python.exe backend/scripts/live_chemistry_check.py --topic solutions

Needs `gcloud auth application-default login` to have been run recently.
Costs real tokens. Prints a pass/fail table and exits non-zero on failure,
so it can gate a demo without being wired into CI.
"""

from __future__ import annotations

import argparse
import base64
import io
import sys
import time
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import hints
from answer_vault import build_vault
from judge.chemistry import canonical_smiles, render_svg
from judge.solutions import SolutionsProblem
from judge.stoichiometry import StoichiometryProblem
from model import ModelError, is_configured
from redaction import check_outbound
from schemas import HintRequest
from sessions import SESSIONS
from structure_recognition import transcribe_structure


# One problem per topic, each with the vault inputs its judge needs and a
# deliberately wrong student line for the hint to diagnose.
CASES = {
    "solutions": {
        "problem": "What is the pH of 0.100 M acetic acid? Ka = 1.8 x 10^-5",
        "vault": {
            "solutions": SolutionsProblem(
                task="weak_acid_ph", concentration_m=0.1, ka=1.8e-5
            )
        },
        "student_line": "pH = 1.00",
        "previous_line": "Ka = x^2 / 0.100",
        "error_type": "wrong_value",
    },
    "stoichiometry": {
        "problem": (
            "28.0 g of N2 reacts with 6.00 g of H2. What is the percent yield "
            "if 25.0 g of NH3 is collected?"
        ),
        "vault": {
            "stoichiometry": StoichiometryProblem(
                task="percent_yield",
                equation="N2 + H2 -> NH3",
                amounts={"N2": 28.0, "H2": 6.0},
                product="NH3",
                actual_yield_g=25.0,
            )
        },
        "student_line": "percent yield = 89.3 %",
        "previous_line": "theoretical yield = 28.0 g",
        "error_type": "wrong_value",
    },
    "balancing": {
        "problem": "Balance C3H8 + O2 -> CO2 + H2O",
        "vault": {"reference_equation": "C3H8 + O2 -> CO2 + H2O"},
        "student_line": "C3H8 + 4O2 -> 3CO2 + 4H2O",
        "previous_line": "C3H8 + O2 -> 3CO2 + 4H2O",
        "error_type": "unbalanced_atoms",
    },
    "redox": {
        "problem": "What is the oxidation state of Cr in Cr2O7^2-?",
        "vault": {"reference_equation": "Cr2O7^2- + 14H^+ + 6e- -> 2Cr^3+ + 7H2O"},
        "student_line": "Cr = +7",
        "previous_line": "O = -2",
        "error_type": "wrong_oxidation_state",
    },
    "structure": {
        "problem": "Draw the structure of methyl ethanoate.",
        "vault": {"target_smiles": "CC(=O)OC"},
        "student_line": "CCOC",
        "previous_line": None,
        "error_type": "structure_mismatch",
    },
    "organic": {
        "problem": "Draw a molecule containing an ester group.",
        "vault": {"target_group": "ester"},
        "student_line": "CCOCC",
        "previous_line": None,
        "error_type": "wrong_functional_group",
    },
}

# Structures rendered by RDKit and fed straight back to the recogniser. Not
# handwriting -- that is what the corpus harness is for -- but a real,
# end-to-end check that the vision path returns a usable SMILES at all.
RECOGNITION_CASES = [
    ("ethanol", "CCO"),
    ("methyl ethanoate", "CC(=O)OC"),
    ("benzene", "c1ccccc1"),
    ("propan-2-one", "CC(C)=O"),
    ("the Aug 4 general ester", "O=C(*)O*"),
]


class Report:
    def __init__(self) -> None:
        self.rows: list[tuple[str, bool, str]] = []

    def add(self, name: str, passed: bool, detail: str = "") -> None:
        self.rows.append((name, passed, detail))
        mark = "PASS" if passed else "FAIL"
        print(f"  [{mark}] {name}" + (f" -- {detail}" if detail else ""))

    @property
    def failed(self) -> int:
        return sum(1 for _, passed, _ in self.rows if not passed)

    def summary(self) -> str:
        total = len(self.rows)
        return f"{total - self.failed}/{total} checks passed"


def _svg_to_png_bytes(svg: str) -> bytes | None:
    """Rasterise an RDKit SVG so the vision path gets a real PNG.

    cairosvg is not a project dependency, so this returns None when it is
    absent and the recognition section is skipped rather than faked.
    """
    try:
        import cairosvg  # type: ignore
    except ImportError:
        return None
    return cairosvg.svg2png(bytestring=svg.encode("utf-8"), output_width=600)


def run_recognition(report: Report) -> None:
    print("\nStructure recognition (real Gemini vision calls)")
    sample = _svg_to_png_bytes(render_svg("CCO"))
    if sample is None:
        print(
            "  SKIPPED: cairosvg is not installed, so rendered structures "
            "cannot be rasterised. Install it, or use run_chemistry_corpus.py "
            "with real handwriting instead (which is the better test anyway)."
        )
        return

    for label, smiles in RECOGNITION_CASES:
        png = _svg_to_png_bytes(render_svg(smiles))
        encoded = base64.b64encode(png).decode("ascii")
        try:
            read, unreadable, confidence, latency = transcribe_structure(encoded)
        except Exception as exc:  # noqa: BLE001 - a live script reports, not raises
            report.add(f"recognise {label}", False, str(exc))
            continue
        if unreadable:
            report.add(f"recognise {label}", False, "returned UNREADABLE")
            continue
        try:
            same = canonical_smiles(read) == canonical_smiles(smiles)
        except Exception:
            same = False
        report.add(
            f"recognise {label}",
            same,
            f"read {read!r}, confidence {confidence}, {latency} ms",
        )


def run_topic(topic: str, report: Report) -> None:
    case = CASES[topic]
    print(f"\n{topic}: {case['problem']}")

    try:
        vault = build_vault(topic=topic, problem=case["problem"], **case["vault"])
    except Exception as exc:  # noqa: BLE001
        report.add(f"{topic} vault", False, str(exc))
        return
    report.add(f"{topic} vault", True, f"{len(vault.answer_forms)} answer forms held")

    session = SESSIONS.create(topic, case["problem"], vault)

    for level in (1, 2, 3):
        request = HintRequest(
            line_number=2,
            error_type=case["error_type"],
            level=level,
            subject="chemistry",
            topic=topic,
            session_id=session.session_id,
            problem=case["problem"],
            student_line=case["student_line"],
            previous_line=case["previous_line"],
        )
        started = time.perf_counter()
        try:
            response = hints.generate_hint(request)
        except ModelError as exc:
            report.add(f"{topic} level {level}", False, str(exc))
            continue
        elapsed = int((time.perf_counter() - started) * 1000)

        # A fallback at level 1 or 2 means generation or verification failed.
        # At level 3 on a single-step problem it is the designed refusal.
        expected_fallback = level == 3 and response.terminal_step
        generated = response.source == "model" or expected_fallback
        report.add(
            f"{topic} level {level} generated",
            generated,
            f"source={response.source}"
            + (", terminal refusal" if response.terminal_step else "")
            + f", {elapsed} ms",
        )

        allowed, violation = check_outbound(
            response.hint, vault, allow_near_answer=(level == 3)
        )
        report.add(
            f"{topic} level {level} leak-free",
            allowed,
            violation or "",
        )

        if level == 2 and response.worked_example is not None:
            example = response.worked_example
            report.add(
                f"{topic} level 2 example verified",
                example.verified,
                f"{len(example.steps)} steps: {example.problem[:60]}",
            )
            for line in example.steps:
                ok, why = check_outbound(line, vault)
                if not ok:
                    report.add(f"{topic} level 2 example line leak-free", False, why)
                    break
            else:
                report.add(f"{topic} level 2 example lines leak-free", True)
        elif level == 2:
            report.add(
                f"{topic} level 2 example verified",
                False,
                "no example survived verification",
            )

        print(f"      hint: {response.hint[:150]}")
        if response.worked_example:
            for index, step in enumerate(response.worked_example.steps, start=1):
                print(f"        {index}. {step}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--topic",
        choices=sorted(CASES),
        help="run one topic instead of all six",
    )
    parser.add_argument(
        "--skip-recognition",
        action="store_true",
        help="skip the vision calls and test only the hint ladder",
    )
    args = parser.parse_args()

    if not is_configured():
        print(
            "Google Cloud credentials are not available.\n"
            "Run: gcloud auth application-default login"
        )
        return 2

    report = Report()
    if not args.skip_recognition:
        run_recognition(report)

    for topic in [args.topic] if args.topic else list(CASES):
        run_topic(topic, report)

    print("\n" + "=" * 72)
    print(report.summary())
    if report.failed:
        print("\nFailures:")
        for name, passed, detail in report.rows:
            if not passed:
                print(f"  - {name}: {detail}")
    return 1 if report.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
