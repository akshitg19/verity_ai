"""Problem sessions: firewall mechanism 4, and the vault's home.

A session is created when a student starts a problem. It holds the answer
vault and the level-3 escalation counter server-side, keyed by an opaque id.
The client is told the id and how many level-3 unlocks remain, and nothing
else -- in particular never the vault, never the answer, and never the
counter's provenance, so a client cannot mint itself more unlocks by
editing a request.

The budget is per *problem*, not per line, and the reason is tutoring rather
than rationing: a student who needs level 3 on every line of a problem
should be sent back to the worked examples, and saying so is better teaching
than walking them through six steps in a row.

In-memory on purpose. Sessions are worth nothing after a restart, holding
them anywhere durable would mean writing answers to disk, and the whole
point of the vault is that it never leaves the process.
"""

from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass, field

from answer_vault import AnswerVault


DEFAULT_LEVEL_3_BUDGET = 3
SESSION_TTL_SECONDS = 60 * 60 * 4
MAX_SESSIONS = 500


@dataclass
class ProblemSession:
    session_id: str
    topic: str
    problem: str
    # None where we could not solve the problem ahead of time. The hint layer
    # still generates against it; see `_unsolved_session` in hints.py for the
    # product call that decided that, and what it costs.
    vault: AnswerVault | None
    level_3_remaining: int = DEFAULT_LEVEL_3_BUDGET
    created_at: float = field(default_factory=time.monotonic)
    # Every line the student has written, in order, so terminal-step
    # detection can ask how far through the working they are.
    student_lines: list[str] = field(default_factory=list)

    def __repr__(self) -> str:  # pragma: no cover - defensive
        return (
            f"<ProblemSession {self.session_id[:8]} topic={self.topic!r} "
            f"level3_left={self.level_3_remaining}>"
        )

    __str__ = __repr__

    @property
    def expired(self) -> bool:
        return time.monotonic() - self.created_at > SESSION_TTL_SECONDS


class SessionStore:
    """A small, self-evicting store. Not a cache, not a database."""

    def __init__(self, budget: int = DEFAULT_LEVEL_3_BUDGET):
        self._sessions: dict[str, ProblemSession] = {}
        self._lock = threading.Lock()
        self._budget = budget

    def create(self, topic: str, problem: str, vault: AnswerVault) -> ProblemSession:
        session = ProblemSession(
            session_id=secrets.token_urlsafe(24),
            topic=topic,
            problem=problem,
            vault=vault,
            level_3_remaining=self._budget,
        )
        with self._lock:
            self._evict_locked()
            self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str | None) -> ProblemSession | None:
        if not session_id:
            return None
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            if session.expired:
                del self._sessions[session_id]
                return None
            return session

    def record_lines(self, session_id: str | None, lines: list[str]) -> None:
        session = self.get(session_id)
        if session is None:
            return
        with self._lock:
            for line in lines:
                if line and line not in session.student_lines:
                    session.student_lines.append(line)
            del session.student_lines[:-50]

    def spend_level_3(self, session_id: str | None) -> bool:
        """Consume one unlock. False when the budget is exhausted.

        The counter is decremented here and nowhere else, so there is a
        single place to audit whether a client can influence it. It cannot:
        the id selects a session, it does not carry a count.
        """
        session = self.get(session_id)
        if session is None:
            return False
        with self._lock:
            if session.level_3_remaining <= 0:
                return False
            session.level_3_remaining -= 1
            return True

    def remaining(self, session_id: str | None) -> int | None:
        session = self.get(session_id)
        return None if session is None else session.level_3_remaining

    def _evict_locked(self) -> None:
        expired = [
            key for key, session in self._sessions.items() if session.expired
        ]
        for key in expired:
            del self._sessions[key]
        if len(self._sessions) >= MAX_SESSIONS:
            oldest = sorted(
                self._sessions.items(), key=lambda item: item[1].created_at
            )
            for key, _ in oldest[: len(self._sessions) - MAX_SESSIONS + 1]:
                del self._sessions[key]

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()


SESSIONS = SessionStore()


__all__ = [
    "DEFAULT_LEVEL_3_BUDGET",
    "ProblemSession",
    "SESSIONS",
    "SessionStore",
]
