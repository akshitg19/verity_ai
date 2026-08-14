import { RecognitionError, throwIfAborted } from "./recognitionTypes";

export default class RecognizerAdapter {
  constructor(source) {
    if (!source) throw new TypeError("A recognizer source is required.");
    this.source = source;
  }

  async recognize({ signal } = {}) {
    throwIfAborted(signal);
    throw new RecognitionError(
      `${this.source} does not implement recognize().`,
      { code: "not_implemented", source: this.source }
    );
  }
}

export function assertRecognizer(recognizer, label = "recognizer") {
  if (!recognizer || typeof recognizer.recognize !== "function") {
    throw new TypeError(`${label} must implement recognize(request).`);
  }
  return recognizer;
}

