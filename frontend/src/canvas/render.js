const DEFAULT_LINE_PAD = 16;
const DEFAULT_SCALE = 1;
const PAPER_COLOR = "#faf8f2";
const RULING_COLOR = "rgba(120, 150, 190, 0.4)";

// Recognition deliberately normalizes every pen color to dark ink. The
// student's chosen display color is useful on screen, but a consistent dark
// export keeps color from becoming another variable in transcription.
export const RECOGNITION_INK_COLOR = "#1a1a2e";

export function getRenderBounds(lineStrokes, padding = DEFAULT_LINE_PAD) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const stroke of lineStrokes ?? []) {
    for (const point of stroke.points ?? []) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (minX === Infinity) {
    return {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      width: 1,
      height: 1,
      empty: true,
    };
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, Math.ceil(maxX - minX + padding * 2)),
    height: Math.max(1, Math.ceil(maxY - minY + padding * 2)),
    empty: false,
  };
}

function positiveScale(value) {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SCALE;
}

export function canvasToPngDataUrl(
  canvas,
  { FileReaderImpl = globalThis.FileReader } = {}
) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("The handwriting image could not be encoded."));
        return;
      }

      const reader = new FileReaderImpl();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () =>
        reject(new Error("The handwriting image could not be read."));
      reader.readAsDataURL(blob);
    }, "image/png");
  });
}

export async function renderLineToPng(
  lineStrokes,
  {
    documentLike = globalThis.document,
    FileReaderImpl = globalThis.FileReader,
    padding = DEFAULT_LINE_PAD,
    scale = DEFAULT_SCALE,
  } = {}
) {
  const bounds = getRenderBounds(lineStrokes, padding);
  const renderScale = positiveScale(scale);
  const offscreen = documentLike.createElement("canvas");
  offscreen.width = Math.max(1, Math.ceil(bounds.width * renderScale));
  offscreen.height = Math.max(1, Math.ceil(bounds.height * renderScale));

  const context = offscreen.getContext("2d");
  if (!context) {
    throw new Error("The handwriting canvas could not be created.");
  }

  context.fillStyle = PAPER_COLOR;
  context.fillRect(0, 0, offscreen.width, offscreen.height);

  if (!bounds.empty) {
    context.strokeStyle = RULING_COLOR;
    context.lineWidth = renderScale;
    context.beginPath();
    const ruleY = (bounds.height - padding / 2) * renderScale;
    context.moveTo(0, ruleY);
    context.lineTo(offscreen.width, ruleY);
    context.stroke();

    context.strokeStyle = RECOGNITION_INK_COLOR;
    context.fillStyle = RECOGNITION_INK_COLOR;
    context.lineWidth = 2.5 * renderScale;
    context.lineCap = "round";
    context.lineJoin = "round";

    for (const stroke of lineStrokes ?? []) {
      const points = stroke.points ?? [];
      if (points.length === 0) continue;

      const pointAt = (point) => ({
        x: (point.x - bounds.minX + padding) * renderScale,
        y: (point.y - bounds.minY + padding) * renderScale,
      });

      if (points.length === 1) {
        const point = pointAt(points[0]);
        context.beginPath();
        context.arc(
          point.x,
          point.y,
          context.lineWidth / 2,
          0,
          Math.PI * 2
        );
        context.fill();
        continue;
      }

      const first = pointAt(points[0]);
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (let index = 1; index < points.length; index += 1) {
        const point = pointAt(points[index]);
        context.lineTo(point.x, point.y);
      }
      context.stroke();
    }
  }

  return canvasToPngDataUrl(offscreen, { FileReaderImpl });
}
