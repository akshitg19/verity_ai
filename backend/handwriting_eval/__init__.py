"""Offline-first evaluation helpers for handwriting recognition providers."""

from .normalization import NORMALIZATION_VERSION, normalize_expression
from .scoring import score_run
from .validation import (
    CorpusGovernanceValidation,
    EvaluationDataError,
    load_corpus_governance,
    load_manifest,
    load_predictions,
)

__all__ = [
    "CorpusGovernanceValidation",
    "EvaluationDataError",
    "NORMALIZATION_VERSION",
    "load_manifest",
    "load_corpus_governance",
    "load_predictions",
    "normalize_expression",
    "score_run",
]
