import RecognizerAdapter, { assertRecognizer } from "./RecognizerAdapter";
import { normalizeRecognitionResult, throwIfAborted } from "./recognitionTypes";

export default class ShadowRecognizer extends RecognizerAdapter {
  constructor({ control, candidate, onCandidateResult = null } = {}) {
    super("shadow");
    this.control = assertRecognizer(control, "control recognizer");
    this.candidate = assertRecognizer(candidate, "candidate recognizer");
    this.onCandidateResult = onCandidateResult;
  }

  async recognize(request = {}) {
    throwIfAborted(request.signal);
    void this.candidate.recognize(request).then(
      (result) => this.onCandidateResult?.({
        ok: true,
        result: normalizeRecognitionResult(result, {
          source: this.candidate.source ?? "candidate",
        }),
      }),
      (error) => {
        if (!request.signal?.aborted) this.onCandidateResult?.({ ok: false, error });
      }
    );
    return normalizeRecognitionResult(
      await this.control.recognize(request),
      { source: this.control.source ?? "control" }
    );
  }
}

