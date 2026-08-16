import hashlib
import json
import subprocess
import sys
from copy import deepcopy
from datetime import date, timedelta
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from scripts.validate_handwriting_rollout_approval import (  # noqa: E402
    RolloutApprovalError,
    main,
    repository_head,
    validate_committed_evidence,
    validate_rollout_approval,
)


SCHEMA = json.loads(
    (ROOT / "docs/handwriting/rollout-approval.schema.json").read_text()
)
SOURCE_COMMIT = "a" * 40


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def evidence_file(repository_root, name, content):
    path = repository_root / "docs/handwriting" / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return {
        "path": f"docs/handwriting/{name}",
        "sha256": sha256(path),
    }


def valid_manifest(repository_root):
    evidence = {
        "decision_report": evidence_file(
            repository_root,
            "provider-evaluation-report.md",
            "decision evidence\n",
        ),
        "target_device_report": evidence_file(
            repository_root,
            "target-device-evidence.md",
            "device evidence\n",
        ),
        "rollout_runbook": evidence_file(
            repository_root,
            "rollout-runbook.md",
            "rollout evidence\n",
        ),
        "rollback_test": evidence_file(
            repository_root,
            "rollback-test-evidence.md",
            "rollback evidence\n",
        ),
    }
    approvals = {}
    for name in (
        "privacy_legal",
        "commercial",
        "security_authentication",
        "data_governance",
        "product_rollout",
    ):
        approvals[name] = {
            "status": "approved",
            "evidence_id": f"{name.replace('_', '-')}-review-v1",
            "artifact_sha256": hashlib.sha256(name.encode()).hexdigest(),
            "reviewed_at": date.today().isoformat(),
            "valid_through": (date.today() + timedelta(days=90)).isoformat(),
        }
    if not (repository_root / ".git").exists():
        subprocess.run(
            ["git", "init", "--quiet", str(repository_root)],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "-C", str(repository_root), "add", "docs/handwriting"],
            check=True,
            capture_output=True,
        )
        subprocess.run(
            [
                "git",
                "-C",
                str(repository_root),
                "-c",
                "user.name=Verity Test",
                "-c",
                "user.email=verity-test@example.invalid",
                "commit",
                "--quiet",
                "-m",
                "Add synthetic evidence",
            ],
            check=True,
            capture_output=True,
        )
    source_commit = repository_head(repository_root)
    return {
        "schema_version": 1,
        "release_id": "myscript-linear-canary-v1",
        "source_commit": source_commit,
        "provider": "myscript",
        "rollout_scope": "internal_canary",
        "decision": {
            "status": "CATEGORY_LIMITED_GO",
            "run_id": "myscript-linear-decision-v1",
            "corpus_version": "consented-linear-v1",
            "corpus_manifest_sha256": "b" * 64,
            "normalization_version": "v2",
            "sample_count": 300,
            "categories": ["math-linear-equations"],
        },
        "approvals": approvals,
        "evidence": evidence,
        "operations": {
            "durable_ledger_path": (
                "/mnt/verity-handwriting/myscript-linear-decision-v1.jsonl"
            ),
            "ledger_run_id": "myscript-linear-decision-v1",
            "request_cap": 600,
            "provider_dashboard_requests_before": 350,
            "provider_account_limit": 2000,
            "canary_percentage": 1,
            "fallback_provider": "gemini",
            "max_primary_attempts": 1,
            "max_fallback_attempts": 1,
            "retention_policy_id": "restricted-ink-retention-v1",
            "deletion_test_id": "restricted-ink-deletion-test-v1",
            "authentication_boundary_id": "real-user-auth-review-v1",
            "rollback_target_revision": "verity-ai-00020-zwl",
            "categories": ["math-linear-equations"],
        },
        "activation_flags": {
            "MYSCRIPT_ENABLED": True,
            "MYSCRIPT_POC_ROUTE_ENABLED": True,
        },
    }


def validate(manifest, repository_root, expected_commit=None):
    expected_commit = expected_commit or manifest["source_commit"]
    return validate_rollout_approval(
        manifest,
        SCHEMA,
        repository_root=repository_root,
        expected_source_commit=expected_commit,
    )


def assert_code(expected, manifest, repository_root, expected_commit=None):
    with pytest.raises(RolloutApprovalError) as captured:
        validate(manifest, repository_root, expected_commit)
    assert captured.value.code == expected


def test_complete_content_free_rollout_manifest_passes(tmp_path):
    manifest = valid_manifest(tmp_path)

    summary = validate(manifest, tmp_path)

    assert summary == {
        "schema_version": 1,
        "status": "PASS",
        "release_id": "myscript-linear-canary-v1",
        "source_commit": manifest["source_commit"],
        "provider": "myscript",
        "rollout_scope": "internal_canary",
        "decision": "CATEGORY_LIMITED_GO",
        "category_count": 1,
        "sample_count": 300,
        "request_cap": 600,
        "canary_percentage": 1,
        "approval_count": 5,
        "evidence_count": 4,
    }
    serialized = json.dumps(summary)
    assert "evidence_id" not in serialized
    assert "artifact_sha256" not in serialized
    assert "/mnt/" not in serialized


def test_no_decision_and_small_corpus_fail_closed(tmp_path):
    manifest = valid_manifest(tmp_path)
    manifest["decision"]["status"] = "NO_DECISION"
    assert_code("provider_decision_not_go", manifest, tmp_path)

    manifest = valid_manifest(tmp_path)
    manifest["decision"]["sample_count"] = 299
    assert_code("decision_sample_count_below_minimum", manifest, tmp_path)


def test_every_independent_approval_requires_complete_evidence(tmp_path):
    manifest = valid_manifest(tmp_path)
    manifest["approvals"]["privacy_legal"] = {"status": "pending"}
    assert_code("approval_not_approved__privacy_legal", manifest, tmp_path)

    manifest = valid_manifest(tmp_path)
    del manifest["approvals"]["commercial"]["artifact_sha256"]
    assert_code("approval_evidence_missing__commercial", manifest, tmp_path)

    manifest = valid_manifest(tmp_path)
    manifest["approvals"]["commercial"]["evidence_id"] = (
        manifest["approvals"]["privacy_legal"]["evidence_id"]
    )
    assert_code("approval_evidence_id_duplicate", manifest, tmp_path)


def test_future_approval_date_is_rejected(tmp_path):
    manifest = valid_manifest(tmp_path)
    manifest["approvals"]["product_rollout"]["reviewed_at"] = (
        date.today() + timedelta(days=1)
    ).isoformat()
    assert_code("approval_review_date_future__product_rollout", manifest, tmp_path)


def test_expired_or_inverted_approval_validity_is_rejected(tmp_path):
    manifest = valid_manifest(tmp_path)
    manifest["approvals"]["commercial"]["reviewed_at"] = (
        date.today() - timedelta(days=10)
    ).isoformat()
    manifest["approvals"]["commercial"]["valid_through"] = (
        date.today() - timedelta(days=1)
    ).isoformat()
    assert_code("approval_expired__commercial", manifest, tmp_path)

    manifest = valid_manifest(tmp_path)
    manifest["approvals"]["commercial"]["valid_through"] = (
        date.today() - timedelta(days=1)
    ).isoformat()
    assert_code("approval_validity_invalid__commercial", manifest, tmp_path)


def test_source_commit_must_match_the_exact_release(tmp_path):
    manifest = valid_manifest(tmp_path)
    assert_code("source_commit_mismatch", manifest, tmp_path, "c" * 40)
    assert_code("expected_source_commit_invalid", manifest, tmp_path, "main")


def test_repository_head_is_a_full_commit_hash():
    assert len(repository_head(ROOT)) == 40


def test_repository_evidence_must_exist_in_the_exact_commit():
    path = ROOT / "docs/handwriting/provider-evaluation-report.md"
    commit = repository_head(ROOT)
    blob = subprocess.run(
        [
            "git",
            "-C",
            str(ROOT),
            "cat-file",
            "blob",
            f"{commit}:docs/handwriting/provider-evaluation-report.md",
        ],
        check=True,
        capture_output=True,
    ).stdout
    evidence = {
        "decision_report": {
            "path": "docs/handwriting/provider-evaluation-report.md",
            "sha256": hashlib.sha256(blob).hexdigest(),
        }
    }

    assert path.is_file()
    validate_committed_evidence(evidence, ROOT, commit)

    evidence["decision_report"]["sha256"] = "0" * 64
    with pytest.raises(RolloutApprovalError) as captured:
        validate_committed_evidence(evidence, ROOT, commit)
    assert captured.value.code == (
        "evidence_hash_mismatch__decision_report"
    )


def test_cli_rejects_a_manifest_not_bound_to_the_checked_out_commit(
    tmp_path, capsys
):
    manifest = valid_manifest(tmp_path)
    path = tmp_path / "approval.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")

    exit_code = main([
        "--manifest",
        str(path),
        "--repository-root",
        str(ROOT),
        "--expected-source-commit",
        SOURCE_COMMIT,
    ])

    captured = capsys.readouterr()
    assert exit_code == 1
    assert '"code": "checked_out_commit_mismatch"' in captured.err
    assert captured.out == ""


def test_repository_evidence_is_pinned_and_cannot_escape(tmp_path):
    manifest = valid_manifest(tmp_path)
    manifest["evidence"]["target_device_report"]["sha256"] = "0" * 64
    assert_code("evidence_hash_mismatch__target_device_report", manifest, tmp_path)

    manifest = valid_manifest(tmp_path)
    manifest["evidence"]["target_device_report"]["path"] = (
        "docs/handwriting/safe/../../private.md"
    )
    assert_code("evidence_path_unsafe", manifest, tmp_path)


def test_authoritative_report_and_runbook_paths_cannot_be_substituted(tmp_path):
    manifest = valid_manifest(tmp_path)
    manifest["evidence"]["decision_report"] = evidence_file(
        tmp_path,
        "different-decision.md",
        "not authoritative\n",
    )
    assert_code(
        "authoritative_evidence_path_invalid__decision_report",
        manifest,
        tmp_path,
    )


def test_run_identity_categories_and_attempt_budget_are_consistent(tmp_path):
    manifest = valid_manifest(tmp_path)
    manifest["operations"]["ledger_run_id"] = "different-run-v1"
    assert_code("ledger_run_id_mismatch", manifest, tmp_path)

    manifest = valid_manifest(tmp_path)
    manifest["operations"]["categories"] = ["math-fractions"]
    assert_code("rollout_categories_mismatch", manifest, tmp_path)

    manifest = valid_manifest(tmp_path)
    manifest["operations"]["request_cap"] = 299
    assert_code("request_cap_outside_decision_run_bounds", manifest, tmp_path)

    manifest = valid_manifest(tmp_path)
    manifest["operations"]["request_cap"] = 601
    assert_code("request_cap_outside_decision_run_bounds", manifest, tmp_path)


def test_provider_account_limit_and_durable_store_fail_closed(tmp_path):
    manifest = valid_manifest(tmp_path)
    manifest["operations"]["provider_account_limit"] = 900
    assert_code("provider_account_limit_would_be_exceeded", manifest, tmp_path)

    for unsafe in (
        "/tmp/run.jsonl",
        "/mnt/verity-handwriting/../run.jsonl",
        "/mnt/verity-handwriting/run.txt",
    ):
        manifest = valid_manifest(tmp_path)
        manifest["operations"]["durable_ledger_path"] = unsafe
        assert_code("durable_ledger_path_invalid", manifest, tmp_path)


def test_schema_rejects_activation_flag_drift_without_echoing_content(
    tmp_path, capsys
):
    checked_out_commit = repository_head(ROOT)
    manifest = valid_manifest(tmp_path)
    manifest["source_commit"] = checked_out_commit
    manifest["activation_flags"]["MYSCRIPT_ENABLED"] = False
    manifest["recognized_answer"] = "private-answer-content"
    path = tmp_path / "approval.json"
    path.write_text(json.dumps(manifest), encoding="utf-8")
    schema_path = ROOT / "docs/handwriting/rollout-approval.schema.json"

    exit_code = main([
        "--manifest",
        str(path),
        "--schema",
        str(schema_path),
        "--repository-root",
        str(ROOT),
        "--expected-source-commit",
        checked_out_commit,
    ])

    captured = capsys.readouterr()
    assert exit_code == 1
    assert '"status": "FAIL"' in captured.err
    assert "private-answer-content" not in captured.err
    assert captured.out == ""


def test_cli_malformed_json_error_is_content_safe(tmp_path, capsys):
    manifest_path = tmp_path / "approval.json"
    manifest_path.write_text("private-recognized-answer", encoding="utf-8")

    exit_code = main([
        "--manifest",
        str(manifest_path),
        "--repository-root",
        str(tmp_path),
        "--expected-source-commit",
        SOURCE_COMMIT,
    ])

    captured = capsys.readouterr()
    assert exit_code == 1
    assert '"code": "json_file_invalid"' in captured.err
    assert "private-recognized-answer" not in captured.err
    assert captured.out == ""


def test_duplicate_json_keys_are_rejected_without_value_disclosure(tmp_path, capsys):
    manifest_path = tmp_path / "approval.json"
    manifest_path.write_text(
        '{"schema_version":1,"schema_version":"private-content"}',
        encoding="utf-8",
    )

    exit_code = main([
        "--manifest",
        str(manifest_path),
        "--repository-root",
        str(tmp_path),
        "--expected-source-commit",
        SOURCE_COMMIT,
    ])

    captured = capsys.readouterr()
    assert exit_code == 1
    assert '"code": "json_file_invalid"' in captured.err
    assert "private-content" not in captured.err
    assert captured.out == ""
