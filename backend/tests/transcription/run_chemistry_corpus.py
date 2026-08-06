"""Run the handwritten chemistry corpus and print the fatal-failure rate.

Extends the `run_samples.py` pattern with the thing `final_tasks.md` says
actually matters:

> The headline metric is **not** transcription accuracy. It is the fatal
> rate. A system that misreads 20% of lines but never produces a confident
> wrong verdict is shippable; a system that reads 95% correctly and
> confidently mis-flags the other 5% is not.

So this does not stop at "did Gemini read the drawing". It carries every
reading through to a verdict and grades the outcome against the taxonomy:

| Severity | Failure |
|---|---|
| **Fatal** | A correctly drawn structure judged `invalid` |
| **Fatal** | A wrongly drawn structure judged `valid` |
| Serious   | Correct reading, but the judge returned unsupported/parse_error |
| Minor     | Misread the student would fix in the correction panel |
| Minor     | Latency over 2s |

Usage, from the repository root:

    ./backend/venv/Scripts/python.exe backend/tests/transcription/run_chemistry_corpus.py

Each sample is a PNG plus a sidecar JSON, both written by the capture mode
in the app (see `/capture/chemistry` in `main.py`):

    samples/chemistry/0007.png
    samples/chemistry/0007.json
        {"topic": "structure",
         "ground_truth": "CC(=O)OC",     <- typed by whoever drew it
         "target": "CC(=O)OC",           <- what the problem asked for
         "expected_verdict": "valid",
         "note": "skeletal, carbonyl on C2"}

Ground truth is typed **at capture time by the person who drew it**, never
reconstructed later from model output, which is how corpora quietly become
self-fulfilling.

Makes real Gemini calls. Never run from CI.
"""

from __future__ import annotations

import base64
import json
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from judge.chemistry import (
    ChemistryJudge,
    ChemistryParseError,
    FunctionalGroupJudge,
    UnsupportedChemistryError,
    canonical_smiles,
)
from schemas import ChemistryStep
from structure_recognition import transcribe_structure


SAMPLES_DIR = Path(__file__).parent / "samples" / "chemistry"
RESULTS_FILE = Path(__file__).parent / "chemistry_results.txt"
LATENCY_TARGET_MS = 2000

structure_judge = ChemistryJudge()
group_judge = FunctionalGroupJudge()


@dataclass
class Outcome:
    name: str
    read: str = ""
    expected: str = ""
    verdict: str = ""
    severity: str = "pass"
    latency_ms: int = 0
    note: str = ""


@dataclass
class Tally:
    outcomes: list[Outcome] = field(default_factory=list)

    def add(self, outcome: Outcome) -> None:
        self.outcomes.append(outcome)

    @property
    def fatal_rate(self) -> float:
        if not self.outcomes:
            return 0.0
        fatal = sum(1 for o in self.outcomes if o.severity == "fatal")
        return 100.0 * fatal / len(self.outcomes)

    @property
    def read_accuracy(self) -> float:
        if not self.outcomes:
            return 0.0
        correct = sum(
            1 for o in self.outcomes if o.severity in ("pass", "serious")
        )
        return 100.0 * correct / len(self.outcomes)

    def p95_latency(self) -> int:
        if not self.outcomes:
            return 0
        ordered = sorted(o.latency_ms for o in self.outcomes)
        index = max(0, int(len(ordered) * 0.95) - 1)
        return ordered[index]


def _same_structure(first: str, second: str) -> bool:
    try:
        return canonical_smiles(first) == canonical_smiles(second)
    except (ChemistryParseError, UnsupportedChemistryError, ValueError):
        return False


def _judge(meta: dict, smiles: str) -> str:
    step = [ChemistryStep(line_number=1, smiles=smiles)]
    topic = meta.get("topic", "structure")
    if topic == "functional_group":
        verdicts = group_judge.check(meta["target"], step)
    else:
        verdicts = structure_judge.check(meta["target"], step)
    return verdicts[0].status


def grade(meta: dict, read: str, unreadable: bool, latency_ms: int, name: str) -> Outcome:
    """Turn one sample's result into a severity, per the taxonomy."""
    ground_truth = meta["ground_truth"]
    expected_verdict = meta.get("expected_verdict", "valid")
    outcome = Outcome(
        name=name,
        read=read,
        expected=ground_truth,
        latency_ms=latency_ms,
        note=meta.get("note", ""),
    )

    if unreadable or not read:
        outcome.severity = "minor"
        outcome.verdict = "unreadable"
        outcome.note = "model declined to read; the student would retype it"
        return outcome

    read_correctly = _same_structure(read, ground_truth)
    try:
        verdict = _judge(meta, read)
    except Exception as exc:  # noqa: BLE001 - a harness reports, never raises
        outcome.severity = "serious"
        outcome.verdict = f"judge error: {exc}"
        return outcome
    outcome.verdict = verdict

    if read_correctly:
        if verdict == expected_verdict:
            outcome.severity = "pass"
        elif verdict in ("unsupported", "parse_error"):
            # The Aug 4 ester. Reads as broken, but it is honest.
            outcome.severity = "serious"
        else:
            # Read the drawing right and reached the wrong verdict: this is
            # the failure that ends a classroom trial.
            outcome.severity = "fatal"
        return outcome

    # Misread. Only fatal if the misreading produced a confident verdict.
    if verdict in ("valid", "invalid"):
        outcome.severity = "fatal"
        outcome.note = "misread, then judged confidently"
    else:
        outcome.severity = "minor"
    return outcome


def main() -> int:
    samples = sorted(SAMPLES_DIR.glob("*.png"))
    if not samples:
        print(
            f"No samples in {SAMPLES_DIR}.\n"
            "Capture some with the app's capture mode first: set "
            "VERITY_CAPTURE_DIR, start the backend, and use Capture Sample "
            "in the chemistry toolbar."
        )
        return 1

    tally = Tally()
    lines: list[str] = []

    for image in samples:
        sidecar = image.with_suffix(".json")
        if not sidecar.exists():
            print(f"{image.name}: no ground truth sidecar, skipping")
            continue
        meta = json.loads(sidecar.read_text(encoding="utf-8"))
        encoded = base64.b64encode(image.read_bytes()).decode("ascii")

        try:
            read, unreadable, confidence, latency_ms = transcribe_structure(encoded)
        except Exception as exc:  # noqa: BLE001
            outcome = Outcome(
                name=image.name, severity="serious", verdict=f"ERROR: {exc}"
            )
            tally.add(outcome)
            lines.append(f"{image.name:20s} ERROR {exc}")
            continue

        outcome = grade(meta, read, unreadable, latency_ms, image.name)
        if latency_ms > LATENCY_TARGET_MS and outcome.severity == "pass":
            outcome.severity = "minor"
            outcome.note = f"latency {latency_ms} ms over the {LATENCY_TARGET_MS} ms target"
        tally.add(outcome)

        line = (
            f"{outcome.name:20s} {outcome.severity:8s} "
            f"read={outcome.read or '-':28s} expected={outcome.expected:28s} "
            f"verdict={outcome.verdict:12s} confidence={confidence:5s} "
            f"{outcome.latency_ms:5d}ms {outcome.note}"
        )
        print(line)
        lines.append(line)

    counts = Counter(outcome.severity for outcome in tally.outcomes)
    summary = [
        "",
        "=" * 72,
        f"samples:            {len(tally.outcomes)}",
        f"FATAL rate:         {tally.fatal_rate:.1f}%   <- the headline number",
        f"read accuracy:      {tally.read_accuracy:.1f}%",
        f"p95 latency:        {tally.p95_latency()} ms (target {LATENCY_TARGET_MS} ms)",
        f"breakdown:          {dict(counts)}",
        "",
        "A fatal failure is a confident verdict on a misread drawing, or a",
        "wrong verdict on a correctly read one. Target: zero. Everything else",
        "is recoverable in the correction panel.",
    ]
    for line in summary:
        print(line)
    lines.extend(summary)

    RESULTS_FILE.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWritten to {RESULTS_FILE}")
    return 0 if counts.get("fatal", 0) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
