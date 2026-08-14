import {
  isAbortError,
  normalizeRecognitionResult,
} from "./recognitionTypes";

const NOOP = () => {};

function rowOrder(left, right) {
  return left.row - right.row || left.id - right.id;
}

export default class RecognitionCoordinator {
  constructor({
    recognize,
    isCurrent = () => true,
    onProvisional = NOOP,
    onCommit = NOOP,
    onError = NOOP,
    onActivityChange = NOOP,
    maxConcurrent = 2,
  } = {}) {
    if (typeof recognize !== "function") {
      throw new TypeError("RecognitionCoordinator requires recognize(job, context).");
    }
    this.recognize = recognize;
    this.isCurrent = isCurrent;
    this.onProvisional = onProvisional;
    this.onCommit = onCommit;
    this.onError = onError;
    this.onActivityChange = onActivityChange;
    this.maxConcurrent = Number.isFinite(maxConcurrent)
      ? Math.max(1, Math.floor(maxConcurrent))
      : 2;
    this.pending = new Map();
    this.active = new Map();
    this.completed = new Map();
    this.latestJobByRow = new Map();
    this.committedVersionByRow = new Map();
    this.nextJobId = 1;
    this.commitChain = Promise.resolve();
    this.commitCount = 0;
    this.disposed = false;
    this.lastActivity = false;
  }

  enqueue(job) {
    if (this.disposed || job?.row === null || job?.row === undefined) return false;
    if (
      !job.provisional &&
      this.committedVersionByRow.get(job.row) === job.version
    ) {
      return false;
    }

    const next = { ...job, id: this.nextJobId++ };
    this.latestJobByRow.set(next.row, next.id);
    this.pending.set(next.row, next);
    this.completed.delete(next.row);
    for (const entry of this.active.values()) {
      if (entry.job.row === next.row) {
        entry.controller.abort(new DOMException(
          "Superseded by newer ink.",
          "AbortError"
        ));
      }
    }
    this.#notifyActivity();
    this.#pump();
    return true;
  }

  invalidate(row) {
    this.latestJobByRow.delete(row);
    this.pending.delete(row);
    this.completed.delete(row);
    for (const entry of this.active.values()) {
      if (entry.job.row === row) {
        entry.controller.abort(new DOMException("Expression changed.", "AbortError"));
      }
    }
    this.#flushReady();
    this.#notifyActivity();
  }

  clear() {
    this.pending.clear();
    this.completed.clear();
    this.latestJobByRow.clear();
    this.committedVersionByRow.clear();
    for (const entry of this.active.values()) {
      entry.controller.abort(new DOMException("Recognition cleared.", "AbortError"));
    }
    this.#notifyActivity();
  }

  dispose() {
    this.disposed = true;
    this.clear();
  }

  async whenIdle() {
    while (
      this.pending.size > 0 ||
      this.active.size > 0 ||
      this.completed.size > 0 ||
      this.commitCount > 0
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await this.commitChain;
  }

  #isLive(job) {
    return !this.disposed &&
      this.latestJobByRow.get(job.row) === job.id &&
      this.isCurrent(job);
  }

  #nextPending() {
    return [...this.pending.values()].sort(rowOrder)[0] ?? null;
  }

  #pump() {
    while (!this.disposed && this.active.size < this.maxConcurrent) {
      const job = this.#nextPending();
      if (!job) break;
      this.pending.delete(job.row);
      const controller = new AbortController();
      const entry = { job, controller };
      this.active.set(job.id, entry);
      void this.#run(entry);
    }
    this.#notifyActivity();
  }

  async #run(entry) {
    const { job, controller } = entry;
    try {
      const result = normalizeRecognitionResult(
        await this.recognize(job, {
          signal: controller.signal,
          onProvisional: (candidate) => {
            if (!this.#isLive(job)) return;
            this.onProvisional(job, normalizeRecognitionResult(
              { ...candidate, provisional: true },
              { source: candidate?.source ?? "provisional" }
            ));
          },
        }),
        { source: "recognizer" }
      );
      if (!this.#isLive(job)) return;
      if (job.provisional || result.provisional) {
        this.onProvisional(job, { ...result, provisional: true });
      } else {
        this.completed.set(job.row, { job, result });
      }
    } catch (error) {
      if (this.#isLive(job) && !controller.signal.aborted && !isAbortError(error)) {
        this.onError(job, error);
      }
    } finally {
      if (this.active.get(job.id) === entry) this.active.delete(job.id);
      this.#flushReady();
      this.#pump();
      this.#notifyActivity();
    }
  }

  #hasOutstandingFinalWork() {
    return [...this.pending.values()].some((job) => !job.provisional) ||
      [...this.active.values()].some((entry) => !entry.job.provisional);
  }

  #flushReady() {
    // A concurrent recognition wave becomes one ordered judge snapshot. This
    // prevents the faster row from causing an avoidable partial judgment and
    // then being judged again milliseconds later when its neighbour finishes.
    if (this.#hasOutstandingFinalWork()) return;
    const ready = [];
    for (const entry of [...this.completed.values()].sort((left, right) =>
      rowOrder(left.job, right.job)
    )) {
      if (!this.#isLive(entry.job)) {
        this.completed.delete(entry.job.row);
        continue;
      }
      ready.push(entry);
      this.completed.delete(entry.job.row);
      this.committedVersionByRow.set(entry.job.row, entry.job.version);
    }
    if (ready.length === 0) return;

    this.commitCount += 1;
    this.commitChain = this.commitChain
      .then(async () => {
        const current = ready.filter(({ job }) => this.#isLive(job));
        if (current.length > 0) await this.onCommit(current);
      })
      .catch((error) => {
        const current = ready.find(({ job }) => this.#isLive(job));
        if (current && !isAbortError(error)) this.onError(current.job, error);
      })
      .finally(() => {
        this.commitCount -= 1;
        this.#notifyActivity();
      });
  }

  #notifyActivity() {
    const active = this.pending.size > 0 ||
      this.active.size > 0 ||
      this.completed.size > 0 ||
      this.commitCount > 0;
    if (active === this.lastActivity) return;
    this.lastActivity = active;
    this.onActivityChange(active);
  }
}
