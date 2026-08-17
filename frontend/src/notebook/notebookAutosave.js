export const NOTEBOOK_AUTOSAVE_DELAY_MS = 350;

function pageKey({ noteId, pageId }) {
  return `${noteId}\u0000${pageId}`;
}

function mergePatch(previous, next) {
  return {
    ...previous,
    ...next,
    noteId: next.noteId,
    pageId: next.pageId,
  };
}

// Keeps the pointer-up path free of deep clones and IndexedDB work. The latest
// immutable canvas/workflow references are held briefly, then one bounded flush
// snapshots and persists each touched page. A new batch may form while the
// previous write is in flight; flush() waits for both in order.
export function createNotebookAutosave({
  onFlush,
  delayMs = NOTEBOOK_AUTOSAVE_DELAY_MS,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
}) {
  if (typeof onFlush !== "function") throw new TypeError("onFlush is required");

  let pending = new Map();
  let timer = null;
  let deferred = null;
  let inFlight = Promise.resolve();

  const ensureDeferred = () => {
    if (deferred) return deferred;
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    // Effects intentionally fire-and-forget autosaves. Attach a rejection
    // observer here while preserving the original promise for explicit flushes.
    void promise.catch(() => undefined);
    deferred = { promise, resolve, reject };
    return deferred;
  };

  const flush = () => {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    if (pending.size === 0) return inFlight;

    const patches = [...pending.values()];
    const batchDeferred = ensureDeferred();
    pending = new Map();
    deferred = null;

    const run = inFlight
      .catch(() => undefined)
      .then(() => onFlush(patches));
    inFlight = run;
    run.then(batchDeferred.resolve, batchDeferred.reject);
    return run;
  };

  const schedule = (patch) => {
    if (!patch?.noteId || !patch?.pageId) {
      return Promise.reject(new TypeError("noteId and pageId are required"));
    }
    const key = pageKey(patch);
    pending.set(key, mergePatch(pending.get(key), patch));
    const batchDeferred = ensureDeferred();
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      void flush();
    }, delayMs);
    return batchDeferred.promise;
  };

  return {
    schedule,
    flush,
    hasPending: () => pending.size > 0,
  };
}
