from __future__ import annotations

import time

import pytest
from google.auth.exceptions import GoogleAuthError, TransportError

from identity_auth import (
    GoogleIdentitySettings,
    IdentityConfigurationError,
    IdentityNotAllowed,
    IdentityProviderUnavailable,
    IdentityTokenInvalid,
    verify_bearer_token,
)


CLIENT_ID = "preview-client.apps.googleusercontent.com"


def settings(**overrides) -> GoogleIdentitySettings:
    values = {
        "enabled": True,
        "client_id": CLIENT_ID,
        "allowed_subjects": frozenset(),
        "allowed_emails": frozenset(),
        "allowed_domains": frozenset({"wisc.edu"}),
    }
    values.update(overrides)
    return GoogleIdentitySettings(**values)


def claims(**overrides) -> dict[str, object]:
    values: dict[str, object] = {
        "aud": CLIENT_ID,
        "iss": "https://accounts.google.com",
        "exp": time.time() + 300,
        "sub": "stable-google-subject",
        "email": "reviewer@wisc.edu",
        "email_verified": True,
        "hd": "wisc.edu",
    }
    values.update(overrides)
    return values


def verifier(result: dict[str, object]):
    def verify(token, request, client_id):
        assert token == "signed.jwt.token"
        assert request is not None
        assert client_id == CLIENT_ID
        return result

    return verify


def test_authentication_is_off_by_default() -> None:
    assert GoogleIdentitySettings.from_environ({}).enabled is False


@pytest.mark.parametrize(
    "environ",
    [
        {"VERITY_AUTH_MODE": "unexpected"},
        {"VERITY_AUTH_MODE": "google"},
        {
            "VERITY_AUTH_MODE": "google",
            "VERITY_GOOGLE_CLIENT_ID": CLIENT_ID,
        },
        {
            "VERITY_AUTH_MODE": "google",
            "VERITY_GOOGLE_CLIENT_ID": CLIENT_ID,
            "VERITY_AUTH_ALLOWED_DOMAINS": "not a domain",
        },
    ],
)
def test_enabled_authentication_fails_closed_on_unsafe_configuration(environ) -> None:
    with pytest.raises(IdentityConfigurationError):
        GoogleIdentitySettings.from_environ(environ)


def test_configuration_normalises_explicit_allow_lists() -> None:
    configured = GoogleIdentitySettings.from_environ(
        {
            "VERITY_AUTH_MODE": "GOOGLE",
            "VERITY_GOOGLE_CLIENT_ID": CLIENT_ID,
            "VERITY_AUTH_ALLOWED_SUBJECTS": " stable-google-subject ",
            "VERITY_AUTH_ALLOWED_EMAILS": " Reviewer@WISC.edu ",
            "VERITY_AUTH_ALLOWED_DOMAINS": " WISC.EDU. ",
        }
    )

    assert configured.enabled is True
    assert configured.allowed_subjects == frozenset({"stable-google-subject"})
    assert configured.allowed_emails == frozenset({"reviewer@wisc.edu"})
    assert configured.allowed_domains == frozenset({"wisc.edu"})


def test_valid_workspace_identity_is_returned_without_the_token() -> None:
    identity = verify_bearer_token(
        "Bearer signed.jwt.token", settings(), verify=verifier(claims())
    )

    assert identity.subject == "stable-google-subject"
    assert identity.email == "reviewer@wisc.edu"
    assert identity.hosted_domain == "wisc.edu"
    assert not hasattr(identity, "token")


def test_public_signing_certificate_transport_is_reused() -> None:
    request_ids = []

    def record_request(token, request, client_id):
        request_ids.append(id(request))
        return claims()

    verify_bearer_token(
        "Bearer signed.jwt.token", settings(), verify=record_request
    )
    verify_bearer_token(
        "Bearer signed.jwt.token", settings(), verify=record_request
    )

    assert len(set(request_ids)) == 1


def test_exact_gmail_allow_list_does_not_require_workspace_domain() -> None:
    configured = settings(
        allowed_emails=frozenset({"reviewer@gmail.com"}),
        allowed_domains=frozenset(),
    )
    identity = verify_bearer_token(
        "bearer signed.jwt.token",
        configured,
        verify=verifier(claims(email="reviewer@gmail.com", hd=None)),
    )

    assert identity.email == "reviewer@gmail.com"


def test_stable_subject_allow_list_is_exact_and_email_independent() -> None:
    configured = settings(
        allowed_subjects=frozenset({"stable-google-subject"}),
        allowed_emails=frozenset(),
        allowed_domains=frozenset(),
    )
    identity = verify_bearer_token(
        "Bearer signed.jwt.token",
        configured,
        verify=verifier(claims(email="reviewer@gmail.com", hd=None)),
    )

    assert identity.subject == "stable-google-subject"


@pytest.mark.parametrize(
    "authorization,changed_claims,expected",
    [
        ("", {}, IdentityTokenInvalid),
        ("Basic signed.jwt.token", {}, IdentityTokenInvalid),
        ("Bearer token with spaces", {}, IdentityTokenInvalid),
        ("Bearer signed.jwt.token", {"aud": "other-client"}, IdentityTokenInvalid),
        ("Bearer signed.jwt.token", {"iss": "https://issuer.invalid"}, IdentityTokenInvalid),
        ("Bearer signed.jwt.token", {"exp": 1}, IdentityTokenInvalid),
        ("Bearer signed.jwt.token", {"email_verified": False}, IdentityTokenInvalid),
        ("Bearer signed.jwt.token", {"hd": "example.edu"}, IdentityNotAllowed),
    ],
)
def test_invalid_or_unapproved_credentials_fail_closed(
    authorization, changed_claims, expected
) -> None:
    with pytest.raises(expected):
        verify_bearer_token(
            authorization,
            settings(),
            verify=verifier(claims(**changed_claims)),
        )


def test_non_workspace_third_party_email_is_not_trusted_by_exact_address_alone() -> None:
    configured = settings(
        allowed_emails=frozenset({"reviewer@example.edu"}),
        allowed_domains=frozenset(),
    )

    with pytest.raises(IdentityNotAllowed):
        verify_bearer_token(
            "Bearer signed.jwt.token",
            configured,
            verify=verifier(claims(email="reviewer@example.edu", hd=None)),
        )


def test_signing_key_transport_failure_is_distinct_from_bad_credentials() -> None:
    def unavailable(token, request, client_id):
        raise TransportError("network unavailable")

    with pytest.raises(IdentityProviderUnavailable):
        verify_bearer_token(
            "Bearer signed.jwt.token", settings(), verify=unavailable
        )


def test_google_auth_claim_failure_is_a_bad_credential_not_an_outage() -> None:
    def invalid_issuer(token, request, client_id):
        raise GoogleAuthError("Wrong issuer")

    with pytest.raises(IdentityTokenInvalid):
        verify_bearer_token(
            "Bearer signed.jwt.token", settings(), verify=invalid_issuer
        )
