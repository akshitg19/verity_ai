#!/usr/bin/env python3
"""Fail closed unless a content-free handwriting rollout manifest is complete."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path, PurePosixPath
from typing import Any, Sequence

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from handwriting_eval.validation import (  # noqa: E402
    CorpusGovernanceValidation,
    EvaluationDataError,
    ManifestValidation,
    load_corpus_governance,
    load_manifest,
)


MAX_MANIFEST_BYTES = 256 * 1024
MAX_EVIDENCE_BYTES = 4 * 1024 * 1024
MAX_APPROVAL_ARTIFACT_BYTES = 4 * 1024 * 1024
MAX_CORPUS_MANIFEST_BYTES = 64 * 1024 * 1024
MAX_CORPUS_GOVERNANCE_BYTES = 256 * 1024
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
APPROVAL_NAMES = (
    "privacy_legal",
    "commercial",
    "security_authentication",
    "data_governance",
    "product_rollout",
)
EXTERNAL_APPROVAL_NAMES = (
    "privacy_legal",
    "commercial",
    "security_authentication",
    "product_rollout",
)
AUTHORITATIVE_PATHS = {
    "decision_report": "docs/handwriting/provider-evaluation-report.md",
    "rollout_runbook": "docs/handwriting/rollout-runbook.md",
}


class RolloutApprovalError(ValueError):
    """A content-safe failure carrying a stable operator code."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class _StrictJSONError(ValueError):
    pass


def _reject_json_constant(_value: str) -> None:
    raise _StrictJSONError


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise _StrictJSONError
        result[key] = value
    return result


def _load_json_object(path: Path, *, maximum_bytes: int) -> dict[str, Any]:
    try:
        if not path.is_file() or path.stat().st_size > maximum_bytes:
            raise RolloutApprovalError("json_file_missing_or_too_large")
        value = json.loads(
            path.read_text(encoding="utf-8"),
            parse_constant=_reject_json_constant,
            object_pairs_hook=_reject_duplicate_keys,
        )
    except RolloutApprovalError:
        raise
    except (
        OSError,
        UnicodeDecodeError,
        json.JSONDecodeError,
        _StrictJSONError,
    ):
        raise RolloutApprovalError("json_file_invalid") from None
    if not isinstance(value, dict):
        raise RolloutApprovalError("json_root_not_object")
    return value


def _validate_schema(manifest: dict[str, Any], schema: dict[str, Any]) -> None:
    try:
        Draft202012Validator.check_schema(schema)
    except SchemaError:
        raise RolloutApprovalError("approval_schema_invalid") from None
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    errors = sorted(
        validator.iter_errors(manifest),
        key=lambda error: tuple(str(part) for part in error.absolute_path),
    )
    if errors:
        first = errors[0]
        location = ".".join(str(part) for part in first.absolute_path) or "root"
        safe_location = re.sub(r"[^a-zA-Z0-9_.-]", "_", location)[:120]
        safe_validator = re.sub(
            r"[^a-zA-Z0-9_.-]", "_", str(first.validator)
        )[:40]
        raise RolloutApprovalError(
            f"approval_schema_failed__{safe_location}__{safe_validator}"
        )


def _load_corpus_evidence(
    *,
    corpus_manifest_path: Path,
    fixture_schema_path: Path,
    corpus_governance_path: Path,
    governance_schema_path: Path,
    decision: dict[str, Any],
    provider: str,
) -> tuple[ManifestValidation, CorpusGovernanceValidation]:
    """Load restricted decision metadata without opening stroke/image inputs."""

    try:
        for path, maximum_bytes in (
            (corpus_manifest_path, MAX_CORPUS_MANIFEST_BYTES),
            (corpus_governance_path, MAX_CORPUS_GOVERNANCE_BYTES),
        ):
            if not path.is_file() or path.stat().st_size > maximum_bytes:
                raise RolloutApprovalError("corpus_evidence_invalid")
        corpus_manifest = load_manifest(
            corpus_manifest_path,
            fixture_schema_path,
            require_inputs=False,
            require_decision_ready=True,
            allow_consented_user=True,
        )
        corpus_governance = load_corpus_governance(
            corpus_governance_path,
            governance_schema_path,
            corpus_manifest,
            expected_corpus_version=decision["corpus_version"],
            expected_provider=provider,
            require_decision_size=True,
        )
    except RolloutApprovalError:
        raise
    except (EvaluationDataError, OSError, ValueError):
        raise RolloutApprovalError("corpus_evidence_invalid") from None
    return corpus_manifest, corpus_governance


def _repository_file(root: Path, relative_path: str) -> Path:
    posix = PurePosixPath(relative_path)
    if posix.is_absolute() or ".." in posix.parts or "\\" in relative_path:
        raise RolloutApprovalError("evidence_path_unsafe")
    try:
        resolved_root = root.resolve(strict=True)
        candidate = root.joinpath(*posix.parts).resolve(strict=True)
    except OSError:
        raise RolloutApprovalError("evidence_file_missing") from None
    if resolved_root not in candidate.parents or not candidate.is_file():
        raise RolloutApprovalError("evidence_path_outside_repository")
    try:
        if candidate.stat().st_size > MAX_EVIDENCE_BYTES:
            raise RolloutApprovalError("evidence_file_too_large")
    except OSError:
        raise RolloutApprovalError("evidence_file_unreadable") from None
    return candidate


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as input_file:
            while chunk := input_file.read(64 * 1024):
                digest.update(chunk)
    except OSError:
        raise RolloutApprovalError("evidence_file_unreadable") from None
    return digest.hexdigest()


def repository_head(repository_root: Path) -> str:
    """Read the checked-out commit without emitting repository command output."""

    try:
        result = subprocess.run(
            ["git", "-C", str(repository_root), "rev-parse", "HEAD"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        raise RolloutApprovalError("repository_commit_unavailable") from None
    value = result.stdout.strip()
    if result.returncode != 0 or not COMMIT_RE.fullmatch(value):
        raise RolloutApprovalError("repository_commit_unavailable")
    return value


def validate_committed_evidence(
    evidence: dict[str, Any], repository_root: Path, source_commit: str
) -> None:
    """Require each declared evidence hash to match its blob in source_commit."""

    if not COMMIT_RE.fullmatch(source_commit):
        raise RolloutApprovalError("expected_source_commit_invalid")
    for name, item in evidence.items():
        object_spec = f"{source_commit}:{item['path']}"
        try:
            size_result = subprocess.run(
                [
                    "git",
                    "-C",
                    str(repository_root),
                    "cat-file",
                    "-s",
                    object_spec,
                ],
                check=False,
                capture_output=True,
                text=True,
                timeout=10,
            )
            size_text = size_result.stdout.strip()
            if (
                size_result.returncode != 0
                or not size_text.isdecimal()
                or int(size_text) > MAX_EVIDENCE_BYTES
            ):
                raise RolloutApprovalError(
                    f"evidence_not_pinned_to_commit__{name}"
                )
            blob_result = subprocess.run(
                [
                    "git",
                    "-C",
                    str(repository_root),
                    "cat-file",
                    "blob",
                    object_spec,
                ],
                check=False,
                capture_output=True,
                timeout=10,
            )
            diff_result = subprocess.run(
                [
                    "git",
                    "-C",
                    str(repository_root),
                    "diff",
                    "--quiet",
                    source_commit,
                    "--",
                    item["path"],
                ],
                check=False,
                capture_output=True,
                timeout=10,
            )
        except (OSError, subprocess.SubprocessError):
            raise RolloutApprovalError(
                f"evidence_not_pinned_to_commit__{name}"
            ) from None
        if (
            blob_result.returncode != 0
            or hashlib.sha256(blob_result.stdout).hexdigest() != item["sha256"]
        ):
            raise RolloutApprovalError(
                f"evidence_hash_mismatch__{name}"
            )
        if diff_result.returncode == 1:
            raise RolloutApprovalError(f"evidence_worktree_drift__{name}")
        if diff_result.returncode != 0:
            raise RolloutApprovalError(
                f"evidence_not_pinned_to_commit__{name}"
            )


def _validate_approvals(approvals: dict[str, Any]) -> None:
    evidence_ids: set[str] = set()
    today = date.today()
    for name in APPROVAL_NAMES:
        approval = approvals[name]
        if approval["status"] != "approved":
            raise RolloutApprovalError(f"approval_not_approved__{name}")
        if not all(
            key in approval
            for key in (
                "evidence_id",
                "artifact_sha256",
                "reviewed_at",
                "valid_through",
            )
        ):
            raise RolloutApprovalError(f"approval_evidence_missing__{name}")
        if approval["evidence_id"] in evidence_ids:
            raise RolloutApprovalError("approval_evidence_id_duplicate")
        evidence_ids.add(approval["evidence_id"])
        try:
            reviewed_at = date.fromisoformat(approval["reviewed_at"])
            valid_through = date.fromisoformat(approval["valid_through"])
        except (TypeError, ValueError):
            raise RolloutApprovalError(
                f"approval_review_date_invalid__{name}"
            ) from None
        if reviewed_at > today:
            raise RolloutApprovalError(f"approval_review_date_future__{name}")
        if valid_through < reviewed_at:
            raise RolloutApprovalError(f"approval_validity_invalid__{name}")
        if valid_through < today:
            raise RolloutApprovalError(f"approval_expired__{name}")


def _validate_approval_artifacts(
    approvals: dict[str, Any], artifact_paths: dict[str, Path]
) -> None:
    """Bind every non-governance approval to an actual external artifact.

    Approval artifacts may contain private legal or security material. Read only
    their bytes for a bounded SHA-256 calculation and never parse or emit them.
    The data-governance approval is checked separately against the canonical
    corpus-governance JSON hash.
    """

    for name in EXTERNAL_APPROVAL_NAMES:
        path = artifact_paths.get(name)
        if path is None:
            raise RolloutApprovalError(f"approval_artifact_missing__{name}")
        try:
            if (
                not path.is_file()
                or path.stat().st_size > MAX_APPROVAL_ARTIFACT_BYTES
            ):
                raise RolloutApprovalError(
                    f"approval_artifact_missing_or_too_large__{name}"
                )
        except RolloutApprovalError:
            raise
        except OSError:
            raise RolloutApprovalError(
                f"approval_artifact_unreadable__{name}"
            ) from None
        try:
            actual_hash = _sha256_file(path)
        except RolloutApprovalError:
            raise RolloutApprovalError(
                f"approval_artifact_unreadable__{name}"
            ) from None
        if actual_hash != approvals[name]["artifact_sha256"]:
            raise RolloutApprovalError(
                f"approval_artifact_hash_mismatch__{name}"
            )


def _validate_evidence(
    evidence: dict[str, Any], repository_root: Path
) -> None:
    paths = [item["path"] for item in evidence.values()]
    if len(paths) != len(set(paths)):
        raise RolloutApprovalError("evidence_path_duplicate")
    for name, expected_path in AUTHORITATIVE_PATHS.items():
        if evidence[name]["path"] != expected_path:
            raise RolloutApprovalError(f"authoritative_evidence_path_invalid__{name}")
    for name, item in evidence.items():
        _repository_file(repository_root, item["path"])


def _validate_ledger_path(value: str, repository_root: Path) -> None:
    path = PurePosixPath(value)
    if (
        not path.is_absolute()
        or ".." in path.parts
        or not value.startswith("/mnt/verity-handwriting/")
        or path.suffix != ".jsonl"
    ):
        raise RolloutApprovalError("durable_ledger_path_invalid")
    try:
        resolved_root = repository_root.resolve(strict=True)
        candidate = Path(value).resolve(strict=False)
    except OSError:
        raise RolloutApprovalError("durable_ledger_path_invalid") from None
    if candidate == resolved_root or resolved_root in candidate.parents:
        raise RolloutApprovalError("durable_ledger_path_inside_repository")


def _validate_corpus_binding(
    approval_manifest: dict[str, Any],
    corpus_manifest: ManifestValidation,
    corpus_governance: CorpusGovernanceValidation,
) -> None:
    decision = approval_manifest["decision"]
    operations = approval_manifest["operations"]
    provider = approval_manifest["provider"]

    if not corpus_manifest.decision_eligible:
        raise RolloutApprovalError("corpus_manifest_not_decision_eligible")
    if corpus_manifest.manifest_sha256 != decision["corpus_manifest_sha256"]:
        raise RolloutApprovalError("corpus_manifest_hash_mismatch")
    if len(corpus_manifest.records) != decision["sample_count"]:
        raise RolloutApprovalError("corpus_sample_count_mismatch")
    if corpus_governance.governance_id != decision["corpus_governance_id"]:
        raise RolloutApprovalError("corpus_governance_id_mismatch")
    if (
        corpus_governance.governance_sha256
        != decision["corpus_governance_sha256"]
    ):
        raise RolloutApprovalError("corpus_governance_hash_mismatch")
    if corpus_governance.corpus_version != decision["corpus_version"]:
        raise RolloutApprovalError("corpus_version_mismatch")
    if corpus_governance.manifest_sha256 != corpus_manifest.manifest_sha256:
        raise RolloutApprovalError("corpus_governance_manifest_mismatch")
    if corpus_governance.fixture_count != len(corpus_manifest.records):
        raise RolloutApprovalError("corpus_governance_count_mismatch")
    if provider not in corpus_governance.approved_providers:
        raise RolloutApprovalError("corpus_provider_not_approved")
    if corpus_governance.retention_policy_ids != (
        operations["retention_policy_id"],
    ):
        raise RolloutApprovalError("corpus_retention_policy_mismatch")
    if corpus_governance.deletion_test_id != operations["deletion_test_id"]:
        raise RolloutApprovalError("corpus_deletion_test_mismatch")


def validate_rollout_approval(
    manifest: dict[str, Any],
    schema: dict[str, Any],
    *,
    repository_root: Path,
    expected_source_commit: str,
    corpus_manifest: ManifestValidation,
    corpus_governance: CorpusGovernanceValidation,
    approval_artifacts: dict[str, Path],
) -> dict[str, Any]:
    """Validate every rollout gate and return an allowlisted summary."""

    _validate_schema(manifest, schema)
    if not COMMIT_RE.fullmatch(expected_source_commit):
        raise RolloutApprovalError("expected_source_commit_invalid")
    if manifest["source_commit"] != expected_source_commit:
        raise RolloutApprovalError("source_commit_mismatch")

    decision = manifest["decision"]
    if decision["status"] not in {"GO", "CATEGORY_LIMITED_GO"}:
        raise RolloutApprovalError("provider_decision_not_go")
    if decision["sample_count"] < 300:
        raise RolloutApprovalError("decision_sample_count_below_minimum")
    if decision["sample_count"] > 500:
        raise RolloutApprovalError("decision_sample_count_above_maximum")

    _validate_approvals(manifest["approvals"])
    _validate_approval_artifacts(manifest["approvals"], approval_artifacts)
    if (
        manifest["approvals"]["data_governance"]["artifact_sha256"]
        != decision["corpus_governance_sha256"]
    ):
        raise RolloutApprovalError("corpus_governance_approval_mismatch")
    _validate_corpus_binding(manifest, corpus_manifest, corpus_governance)
    _validate_evidence(manifest["evidence"], repository_root)
    validate_committed_evidence(
        manifest["evidence"], repository_root, expected_source_commit
    )

    operations = manifest["operations"]
    if operations["ledger_run_id"] != decision["run_id"]:
        raise RolloutApprovalError("ledger_run_id_mismatch")
    if operations["categories"] != decision["categories"]:
        raise RolloutApprovalError("rollout_categories_mismatch")
    if not (
        decision["sample_count"]
        <= operations["request_cap"]
        <= decision["sample_count"] * 2
    ):
        raise RolloutApprovalError("request_cap_outside_decision_run_bounds")
    if (
        operations["provider_dashboard_requests_before"]
        + operations["request_cap"]
        > operations["provider_account_limit"]
    ):
        raise RolloutApprovalError("provider_account_limit_would_be_exceeded")
    _validate_ledger_path(operations["durable_ledger_path"], repository_root)

    return {
        "schema_version": 1,
        "status": "PASS",
        "release_id": manifest["release_id"],
        "source_commit": manifest["source_commit"],
        "provider": "myscript",
        "rollout_scope": manifest["rollout_scope"],
        "decision": decision["status"],
        "category_count": len(decision["categories"]),
        "sample_count": decision["sample_count"],
        "request_cap": operations["request_cap"],
        "canary_percentage": operations["canary_percentage"],
        "approval_count": len(APPROVAL_NAMES),
        "evidence_count": len(manifest["evidence"]),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate a content-free handwriting rollout approval manifest."
    )
    parser.add_argument("--manifest", required=True)
    parser.add_argument(
        "--schema",
        default=str(REPO_ROOT / "docs/handwriting/rollout-approval.schema.json"),
    )
    parser.add_argument("--corpus-manifest")
    parser.add_argument("--corpus-governance")
    for approval_name in EXTERNAL_APPROVAL_NAMES:
        parser.add_argument(
            f"--{approval_name.replace('_', '-')}-approval-artifact"
        )
    parser.add_argument(
        "--fixture-schema",
        default=str(REPO_ROOT / "docs/handwriting/fixtures/fixture.schema.json"),
    )
    parser.add_argument(
        "--governance-schema",
        default=str(
            REPO_ROOT / "docs/handwriting/fixtures/corpus-governance.schema.json"
        ),
    )
    parser.add_argument("--repository-root", default=str(REPO_ROOT))
    parser.add_argument("--expected-source-commit", required=True)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        manifest = _load_json_object(
            Path(args.manifest), maximum_bytes=MAX_MANIFEST_BYTES
        )
        schema = _load_json_object(Path(args.schema), maximum_bytes=MAX_MANIFEST_BYTES)
        checked_out_commit = repository_head(Path(args.repository_root))
        if checked_out_commit != args.expected_source_commit:
            raise RolloutApprovalError("checked_out_commit_mismatch")
        _validate_schema(manifest, schema)
        if args.corpus_manifest is None or args.corpus_governance is None:
            raise RolloutApprovalError("corpus_evidence_missing")
        corpus_manifest, corpus_governance = _load_corpus_evidence(
            corpus_manifest_path=Path(args.corpus_manifest),
            fixture_schema_path=Path(args.fixture_schema),
            corpus_governance_path=Path(args.corpus_governance),
            governance_schema_path=Path(args.governance_schema),
            decision=manifest["decision"],
            provider=manifest["provider"],
        )
        summary = validate_rollout_approval(
            manifest,
            schema,
            repository_root=Path(args.repository_root),
            expected_source_commit=args.expected_source_commit,
            corpus_manifest=corpus_manifest,
            corpus_governance=corpus_governance,
            approval_artifacts={
                name: Path(
                    getattr(args, f"{name}_approval_artifact")
                )
                for name in EXTERNAL_APPROVAL_NAMES
                if getattr(args, f"{name}_approval_artifact") is not None
            },
        )
    except RolloutApprovalError as exc:
        print(
            json.dumps(
                {"schema_version": 1, "status": "FAIL", "code": exc.code},
                sort_keys=True,
            ),
            file=sys.stderr,
        )
        return 1
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
