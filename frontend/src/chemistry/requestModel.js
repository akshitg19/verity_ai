import { openSession, transcribeStructure } from "../api";
import { renderLineToPng } from "../canvas/render";

export async function readStructureSnapshot(
  strokes,
  isCurrent,
  { render = renderLineToPng, transcribe = transcribeStructure } = {}
) {
  const dataUrl = await render([...(strokes ?? [])]);
  if (!isCurrent()) return null;

  const imageBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const result = await transcribe(imageBase64);
  return isCurrent() ? result : null;
}

export async function openCurrentSession(
  payload,
  isCurrent,
  { open = openSession } = {}
) {
  const result = await open(payload);
  return isCurrent() ? result : null;
}
