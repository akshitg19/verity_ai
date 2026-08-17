"""Fail-closed Google identity verification for an internal preview.

The browser receives a Google ID token from Google Identity Services and sends
it as a bearer token. This module verifies that token server-side and then
applies an explicit subject, email, or Workspace-domain allow-list. Tokens and
claims must never be logged.
"""

from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from typing import Callable, Mapping

import cachecontrol
import requests
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from requests.exceptions import RequestException


GOOGLE_ISSUERS = frozenset({"accounts.google.com", "https://accounts.google.com"})
MAX_BEARER_TOKEN_LENGTH = 16_384
_DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
    r"[a-z]{2,63}$"
)
_SUBJECT_RE = re.compile(r"^[A-Za-z0-9._-]{3,255}$")


class IdentityConfigurationError(RuntimeError):
    """The identity boundary was enabled without a safe configuration."""


class IdentityTokenInvalid(ValueError):
    """The bearer credential is absent, malformed, expired, or untrusted."""


class IdentityNotAllowed(PermissionError):
    """The token is valid but the account is outside the preview allow-list."""


class IdentityProviderUnavailable(RuntimeError):
    """Google signing keys could not be reached or refreshed."""


@dataclass(frozen=True)
class GoogleIdentitySettings:
    enabled: bool
    client_id: str = ""
    allowed_subjects: frozenset[str] = frozenset()
    allowed_emails: frozenset[str] = frozenset()
    allowed_domains: frozenset[str] = frozenset()

    @classmethod
    def from_environ(
        cls, environ: Mapping[str, str] | None = None
    ) -> "GoogleIdentitySettings":
        source = os.environ if environ is None else environ
        mode = source.get("VERITY_AUTH_MODE", "off").strip().lower()
        if mode in {"", "off", "disabled"}:
            return cls(enabled=False)
        if mode != "google":
            raise IdentityConfigurationError(
                "VERITY_AUTH_MODE must be 'off' or 'google'"
            )

        client_id = source.get("VERITY_GOOGLE_CLIENT_ID", "").strip()
        if not client_id:
            raise IdentityConfigurationError(
                "VERITY_GOOGLE_CLIENT_ID is required when Google auth is enabled"
            )

        allowed_subjects = _parse_csv(
            source.get("VERITY_AUTH_ALLOWED_SUBJECTS", ""), _normalise_subject
        )
        allowed_emails = _parse_csv(
            source.get("VERITY_AUTH_ALLOWED_EMAILS", ""), _normalise_email
        )
        allowed_domains = _parse_csv(
            source.get("VERITY_AUTH_ALLOWED_DOMAINS", ""), _normalise_domain
        )
        if not allowed_subjects and not allowed_emails and not allowed_domains:
            raise IdentityConfigurationError(
                "Google auth requires an explicit subject, email, or domain allow-list"
            )

        return cls(
            enabled=True,
            client_id=client_id,
            allowed_subjects=allowed_subjects,
            allowed_emails=allowed_emails,
            allowed_domains=allowed_domains,
        )


@dataclass(frozen=True)
class VerifiedIdentity:
    subject: str
    email: str
    hosted_domain: str | None


VerifyFunction = Callable[[str, google_requests.Request, str], Mapping[str, object]]

# google-auth otherwise re-fetches Google's public signing certificates for
# every verification. CacheControl follows the response's cache headers, so
# rotations are still respected without adding a network round trip to every
# student action. The cache contains public certificates, never ID tokens.
_CACHED_CERT_SESSION = cachecontrol.CacheControl(requests.Session())
_CACHED_GOOGLE_REQUEST = google_requests.Request(session=_CACHED_CERT_SESSION)


def _parse_csv(value: str, normalise: Callable[[str], str]) -> frozenset[str]:
    parsed: set[str] = set()
    for raw in value.split(","):
        candidate = raw.strip()
        if candidate:
            parsed.add(normalise(candidate))
    return frozenset(parsed)


def _normalise_email(value: str) -> str:
    email = value.strip().lower()
    if (
        email.count("@") != 1
        or any(character.isspace() for character in email)
        or email.startswith("@")
        or email.endswith("@")
    ):
        raise IdentityConfigurationError(
            "VERITY_AUTH_ALLOWED_EMAILS contains an invalid address"
        )
    return email


def _normalise_subject(value: str) -> str:
    subject = value.strip()
    if not _SUBJECT_RE.fullmatch(subject):
        raise IdentityConfigurationError(
            "VERITY_AUTH_ALLOWED_SUBJECTS contains an invalid identifier"
        )
    return subject


def _normalise_domain(value: str) -> str:
    domain = value.strip().lower().rstrip(".")
    if not _DOMAIN_RE.fullmatch(domain):
        raise IdentityConfigurationError(
            "VERITY_AUTH_ALLOWED_DOMAINS contains an invalid domain"
        )
    return domain


def _default_verify(
    token: str, request: google_requests.Request, client_id: str
) -> Mapping[str, object]:
    return id_token.verify_oauth2_token(token, request, client_id)


def verify_bearer_token(
    authorization: str,
    settings: GoogleIdentitySettings,
    *,
    verify: VerifyFunction = _default_verify,
    now: Callable[[], float] = time.time,
) -> VerifiedIdentity:
    """Verify one Google ID token and enforce the configured allow-list."""

    if not settings.enabled:
        raise IdentityConfigurationError("Google identity verification is disabled")

    scheme, separator, token = authorization.strip().partition(" ")
    if separator != " " or scheme.lower() != "bearer" or not token.strip():
        raise IdentityTokenInvalid("A bearer credential is required")
    token = token.strip()
    if any(character.isspace() for character in token):
        raise IdentityTokenInvalid("The bearer credential is malformed")
    if len(token) > MAX_BEARER_TOKEN_LENGTH:
        raise IdentityTokenInvalid("The bearer credential is too large")

    try:
        claims = verify(token, _CACHED_GOOGLE_REQUEST, settings.client_id)
    except ValueError as exc:
        raise IdentityTokenInvalid("The bearer credential is invalid") from exc
    except (TransportError, RequestException) as exc:
        raise IdentityProviderUnavailable(
            "Google identity verification is unavailable"
        ) from exc
    except GoogleAuthError as exc:
        # google-auth reports a non-Google issuer as GoogleAuthError. That is a
        # bad credential, not an identity-provider outage.
        raise IdentityTokenInvalid("The bearer credential is invalid") from exc

    if claims.get("aud") != settings.client_id:
        raise IdentityTokenInvalid("The bearer credential has the wrong audience")
    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise IdentityTokenInvalid("The bearer credential has the wrong issuer")
    expiry = claims.get("exp")
    if not isinstance(expiry, (int, float)) or expiry <= now():
        raise IdentityTokenInvalid("The bearer credential has expired")

    subject = claims.get("sub")
    email_claim = claims.get("email")
    if not isinstance(subject, str) or not subject or len(subject) > 255:
        raise IdentityTokenInvalid("The bearer credential has no stable subject")
    if not isinstance(email_claim, str) or claims.get("email_verified") is not True:
        raise IdentityTokenInvalid("The bearer credential has no verified email")

    email = email_claim.strip().lower()
    hosted_domain_claim = claims.get("hd")
    hosted_domain = (
        hosted_domain_claim.strip().lower().rstrip(".")
        if isinstance(hosted_domain_claim, str) and hosted_domain_claim.strip()
        else None
    )

    subject_allowed = subject in settings.allowed_subjects
    domain_allowed = bool(
        hosted_domain and hosted_domain in settings.allowed_domains
    )
    email_allowed = email in settings.allowed_emails

    # Google is authoritative for Gmail addresses and for Workspace addresses
    # carrying an hd claim. An exact allow-list entry is not enough for a
    # third-party email account whose ownership Google cannot continuously
    # vouch for.
    google_authoritative = email.endswith("@gmail.com") or bool(hosted_domain)
    if (
        not subject_allowed
        and not domain_allowed
        and not (email_allowed and google_authoritative)
    ):
        raise IdentityNotAllowed("The account is outside the preview allow-list")

    return VerifiedIdentity(
        subject=subject,
        email=email,
        hosted_domain=hosted_domain,
    )
