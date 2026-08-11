import { openSession, transcribeStructure } from "../api";
import { renderLineToPng } from "../canvas/render";

const sessionPromises = new Map();

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
  const key = sessionFingerprint(payload);
  let promise = sessionPromises.get(key);
  if (!promise) {
    promise = Promise.resolve().then(() => open(payload, { signal }));
    sessionPromises.set(key, promise);
    void promise.then(() => undefined, () => undefined).then(() => {
      if (sessionPromises.get(key) === promise) sessionPromises.delete(key);
    });
  }
  const result = await promise;
  return isCurrent() ? result : null;
}

export function clearSessionCache() {
  sessionPromises.clear();
}
