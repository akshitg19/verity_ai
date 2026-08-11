import { openSession, transcribeStructure } from "../api";
import { renderLineToPng } from "../canvas/render";

function sessionFingerprint(payload) {
  return JSON.stringify(payload ?? {});
}

export async function readStructureSnapshot(
  strokes,
  isCurrent,
  { render = renderLineToPng, transcribe = transcribeStructure, signal } = {}
) {
  const dataUrl = await render([...(strokes ?? [])]);
  if (!isCurrent()) return null;

  const imageBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const result = signal
    ? await transcribe(imageBase64, { signal })
    : await transcribe(imageBase64);
  return isCurrent() ? result : null;
}

export async function openCurrentSession(
  payload,
  isCurrent,
  { open = openSession, signal } = {}
) {
  // Session ownership belongs to the page-level hook. A module-global promise
  // cannot know which page owns its AbortSignal: a second page could abort the
  // first page's request and then receive the already-aborted promise. The
  // hook may still share one in-flight request for identical inputs, but this
  // low-level helper always creates an independently cancellable request.
  const result = await Promise.resolve().then(() => open(payload, { signal }));
  return isCurrent() ? result : null;
}

export function clearSessionCache() {
  // Kept as a compatibility no-op for callers that used to clear the global
  // cache. There is intentionally no process-wide session cache now.
}

export { sessionFingerprint };
