import { getRenderBounds } from "./render";

// Saving a page as a picture.
//
// Distinct from `renderLineToPng`, which exists to feed the recogniser: that
// one flattens every pen to one ink colour on purpose, because the model reads
// dark-on-light best. A student saving their own work wants their own page
// back, in the colours they wrote it in, so this draws the strokes as they are.
//
// It is the reason students screenshot their notes, and a screenshot of a
// scrolling canvas is always the wrong crop.

const PAGE_PAD = 40;
const EXPORT_SCALE = 2;
const PAPER = "#fbfaf6";
const DEFAULT_INK = "#1f2926";

// "C3H8 + O2 -> CO2 + H2O" is a fine note title and an illegal filename on
// every platform we care about.
export function pageFileName(noteTitle, pageNumber, extension = "png") {
  const safe = (noteTitle ?? "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return `${safe || "verity page"} p${pageNumber}.${extension}`;
}

export function renderPageToCanvas(strokes, { documentLike = globalThis.document } = {}) {
  const bounds = getRenderBounds(strokes, PAGE_PAD);
  const canvas = documentLike.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(bounds.width * EXPORT_SCALE));
  canvas.height = Math.max(1, Math.ceil(bounds.height * EXPORT_SCALE));

  const context = canvas.getContext("2d");
  if (!context) throw new Error("This page could not be turned into an image.");

  context.fillStyle = PAPER;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const stroke of strokes ?? []) {
    const points = (stroke.points ?? []).filter(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
    );
    if (!points.length) continue;

    context.strokeStyle = stroke.color ?? DEFAULT_INK;
    context.fillStyle = stroke.color ?? DEFAULT_INK;
    context.lineWidth = (stroke.width ?? 2.5) * EXPORT_SCALE;

    const at = (point) => [
      (point.x - bounds.minX + PAGE_PAD) * EXPORT_SCALE,
      (point.y - bounds.minY + PAGE_PAD) * EXPORT_SCALE,
    ];

    if (points.length === 1) {
      // A dot is a stroke too, and a single moveTo draws nothing.
      const [x, y] = at(points[0]);
      context.beginPath();
      context.arc(x, y, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }

    context.beginPath();
    const [startX, startY] = at(points[0]);
    context.moveTo(startX, startY);
    for (const point of points.slice(1)) {
      const [x, y] = at(point);
      context.lineTo(x, y);
    }
    context.stroke();
  }

  return canvas;
}

export function downloadCanvas(canvas, filename, { documentLike = globalThis.document } = {}) {
  const link = documentLike.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = filename;
  link.click();
}

export function exportPage(strokes, noteTitle, pageNumber, options = {}) {
  if (!(strokes ?? []).some((stroke) => stroke?.points?.length)) return false;
  const canvas = renderPageToCanvas(strokes, options);
  downloadCanvas(canvas, pageFileName(noteTitle, pageNumber), options);
  return true;
}
