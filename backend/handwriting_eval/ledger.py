"""Content-free, fail-closed attempt ledger for approved provider replays."""

from __future__ import annotations

import json
import os
import re
import stat
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator


LEDGER_SCHEMA_VERSION = 1
MYSCRIPT_POC_ATTEMPT_CAP = 650
MAX_GENERIC_ATTEMPT_CAP = 10_000
MAX_LEDGER_BYTES = 512 * 1024
MAX_LEDGER_LINE_BYTES = 4096
LOCK_WAIT_SECONDS = 1.0
LOCK_POLL_SECONDS = 0.005
LEDGER_SUFFIX = ".handwriting-ledger.jsonl"
SAFE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{1,119}$")
REPO_ROOT = Path(__file__).resolve().parents[2]


class AttemptLedgerError(RuntimeError):
    """A content-safe ledger failure that must stop provider traffic."""

    def __init__(self, code: str):
        safe_code = code if SAFE_ID_RE.fullmatch(code) else "ledger_error"
        super().__init__(f"Handwriting attempt ledger failed ({safe_code})")
        self.code = safe_code


@dataclass(frozen=True)
class AttemptLedgerStatus:
    run_id: str
    provider: str
    request_cap: int
    used: int

    @property
    def remaining(self) -> int:
        return self.request_cap - self.used


def _reject_constant(_value: str) -> None:
    raise ValueError("non_finite_json")


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("duplicate_json_key")
        value[key] = item
    return value


def _strict_json(value: bytes) -> dict[str, Any]:
    parsed = json.loads(
        value,
        parse_constant=_reject_constant,
        object_pairs_hook=_reject_duplicate_keys,
    )
    if not isinstance(parsed, dict):
        raise ValueError("record_not_object")
    return parsed


def _encoded_record(record: dict[str, Any]) -> bytes:
    return (
        json.dumps(record, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        + "\n"
    ).encode("ascii")


class DurableAttemptLedger:
    """Append-only request budget that survives replay-process restarts.

    The ledger deliberately stores no fixture identifier, ink, transcription,
    expected answer, user identifier, or restricted-store path. A reservation
    is durable before the caller may open a provider connection. A crashed
    caller therefore consumes budget instead of risking an uncounted retry.
    """

    def __init__(
        self,
        path: Path | str,
        *,
        run_id: str,
        provider: str,
        request_cap: int,
        repo_root: Path | str = REPO_ROOT,
    ):
        if not SAFE_ID_RE.fullmatch(run_id):
            raise AttemptLedgerError("run_id_invalid")
        if not SAFE_ID_RE.fullmatch(provider):
            raise AttemptLedgerError("provider_invalid")
        maximum = (
            MYSCRIPT_POC_ATTEMPT_CAP
            if provider == "myscript"
            else MAX_GENERIC_ATTEMPT_CAP
        )
        if not isinstance(request_cap, int) or isinstance(request_cap, bool):
            raise AttemptLedgerError("request_cap_invalid")
        if not 1 <= request_cap <= maximum:
            raise AttemptLedgerError("request_cap_invalid")

        candidate = Path(path)
        if not candidate.is_absolute() or not str(candidate).endswith(LEDGER_SUFFIX):
            raise AttemptLedgerError("ledger_path_invalid")
        if not candidate.parent.is_dir():
            raise AttemptLedgerError("ledger_parent_missing")
        resolved = candidate.resolve(strict=False)
        resolved_repo = Path(repo_root).resolve(strict=True)
        if resolved == resolved_repo or resolved_repo in resolved.parents:
            raise AttemptLedgerError("ledger_inside_repository")

        self.path = candidate
        self.run_id = run_id
        self.provider = provider
        self.request_cap = request_cap

    def __repr__(self) -> str:
        return (
            "DurableAttemptLedger("
            f"run_id={self.run_id!r}, provider={self.provider!r}, "
            f"request_cap={self.request_cap!r}, path_configured=True)"
        )

    @property
    def _lock_path(self) -> Path:
        return self.path.with_name(self.path.name + ".lock")

    @contextmanager
    def _exclusive_lock(self) -> Iterator[None]:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor: int | None = None
        failure: AttemptLedgerError | None = None
        deadline = time.monotonic() + LOCK_WAIT_SECONDS
        while descriptor is None and failure is None:
            try:
                descriptor = os.open(self._lock_path, flags, 0o600)
            except FileExistsError:
                if time.monotonic() >= deadline:
                    failure = AttemptLedgerError("ledger_locked")
                else:
                    time.sleep(LOCK_POLL_SECONDS)
            except OSError:
                failure = AttemptLedgerError("ledger_lock_unavailable")
        if descriptor is not None:
            try:
                os.write(descriptor, b"locked\n")
                os.fsync(descriptor)
            except OSError:
                failure = AttemptLedgerError("ledger_lock_unavailable")
            finally:
                os.close(descriptor)
        if failure is not None:
            raise failure

        try:
            yield
        finally:
            try:
                self._lock_path.unlink()
            except OSError:
                # A lock that cannot be removed intentionally blocks subsequent
                # traffic until an operator investigates it.
                pass

    def initialize(self) -> AttemptLedgerStatus:
        """Create a new empty ledger; never overwrite an existing run."""

        header = _encoded_record(
            {
                "provider": self.provider,
                "request_cap": self.request_cap,
                "run_id": self.run_id,
                "schema_version": LEDGER_SCHEMA_VERSION,
                "type": "attempt_ledger",
            }
        )
        with self._exclusive_lock():
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
            if hasattr(os, "O_NOFOLLOW"):
                flags |= os.O_NOFOLLOW
            descriptor: int | None = None
            failure: AttemptLedgerError | None = None
            try:
                descriptor = os.open(self.path, flags, 0o600)
                written = os.write(descriptor, header)
                if written != len(header):
                    failure = AttemptLedgerError("ledger_write_incomplete")
                else:
                    os.fsync(descriptor)
            except FileExistsError:
                failure = AttemptLedgerError("ledger_already_exists")
            except OSError:
                failure = AttemptLedgerError("ledger_write_unavailable")
            finally:
                if descriptor is not None:
                    os.close(descriptor)
            if failure is not None:
                raise failure
        return AttemptLedgerStatus(
            run_id=self.run_id,
            provider=self.provider,
            request_cap=self.request_cap,
            used=0,
        )

    def _read_status(self) -> AttemptLedgerStatus:
        if not hasattr(os, "O_NOFOLLOW") and self.path.is_symlink():
            raise AttemptLedgerError("ledger_symlink_forbidden")
        flags = os.O_RDONLY
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor: int | None = None
        failure: AttemptLedgerError | None = None
        try:
            descriptor = os.open(self.path, flags)
            file_stat = os.fstat(descriptor)
        except OSError:
            failure = AttemptLedgerError("ledger_unavailable")
            file_stat = None
        if failure is not None:
            if descriptor is not None:
                os.close(descriptor)
            raise failure
        assert descriptor is not None and file_stat is not None
        if not stat.S_ISREG(file_stat.st_mode) or file_stat.st_size > MAX_LEDGER_BYTES:
            os.close(descriptor)
            raise AttemptLedgerError("ledger_invalid")
        if os.name == "posix" and file_stat.st_mode & 0o077:
            os.close(descriptor)
            raise AttemptLedgerError("ledger_permissions_invalid")

        try:
            with os.fdopen(descriptor, "rb") as ledger_file:
                descriptor = None
                lines = ledger_file.readlines()
        except OSError:
            raise AttemptLedgerError("ledger_unavailable") from None
        finally:
            if descriptor is not None:
                os.close(descriptor)
        if not lines or len(lines) > self.request_cap + 1:
            raise AttemptLedgerError("ledger_invalid")
        if any(
            not line.endswith(b"\n") or len(line) > MAX_LEDGER_LINE_BYTES
            for line in lines
        ):
            raise AttemptLedgerError("ledger_invalid")

        try:
            header = _strict_json(lines[0])
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            raise AttemptLedgerError("ledger_invalid") from None
        expected_header = {
            "provider": self.provider,
            "request_cap": self.request_cap,
            "run_id": self.run_id,
            "schema_version": LEDGER_SCHEMA_VERSION,
            "type": "attempt_ledger",
        }
        if header != expected_header:
            raise AttemptLedgerError("ledger_identity_mismatch")

        for sequence, line in enumerate(lines[1:], start=1):
            try:
                reservation = _strict_json(line)
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
                raise AttemptLedgerError("ledger_invalid") from None
            if reservation != {
                "sequence": sequence,
                "type": "attempt_reserved",
            }:
                raise AttemptLedgerError("ledger_sequence_invalid")

        return AttemptLedgerStatus(
            run_id=self.run_id,
            provider=self.provider,
            request_cap=self.request_cap,
            used=len(lines) - 1,
        )

    def status(self) -> AttemptLedgerStatus:
        with self._exclusive_lock():
            return self._read_status()

    @property
    def used(self) -> int:
        return self.status().used

    def reserve(self) -> int:
        """Durably consume one attempt before any provider connection opens."""

        with self._exclusive_lock():
            status = self._read_status()
            if status.used >= status.request_cap:
                raise AttemptLedgerError("request_cap_exhausted")
            sequence = status.used + 1
            record = _encoded_record(
                {"sequence": sequence, "type": "attempt_reserved"}
            )
            flags = os.O_WRONLY | os.O_APPEND
            if hasattr(os, "O_NOFOLLOW"):
                flags |= os.O_NOFOLLOW
            descriptor: int | None = None
            failure: AttemptLedgerError | None = None
            try:
                descriptor = os.open(self.path, flags)
                written = os.write(descriptor, record)
                if written != len(record):
                    failure = AttemptLedgerError("ledger_write_incomplete")
                else:
                    os.fsync(descriptor)
            except OSError:
                failure = AttemptLedgerError("ledger_write_unavailable")
            finally:
                if descriptor is not None:
                    os.close(descriptor)
            if failure is not None:
                raise failure
            return sequence
