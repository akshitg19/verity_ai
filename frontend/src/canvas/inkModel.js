import { getStrokeRow } from "./geometry";

export function getStrokeBounds(stroke) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of stroke.points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }

  if (minX === Infinity) return null;

  return { minX, maxX, minY, maxY };
}

export function mergeBounds(current, next) {
  if (!current) return next ? { ...next } : null;
  if (!next) return { ...current };

  return {
    minX: Math.min(current.minX, next.minX),
    maxX: Math.max(current.maxX, next.maxX),
    minY: Math.min(current.minY, next.minY),
    maxY: Math.max(current.maxY, next.maxY),
  };
}

export function expandAndClampBounds(bounds, padding, width, height) {
  if (!bounds) return null;

  const minX = Math.max(0, bounds.minX - padding);
  const minY = Math.max(0, bounds.minY - padding);
  const maxX = Math.min(width, bounds.maxX + padding);
  const maxY = Math.min(height, bounds.maxY + padding);

  return {
    x: minX,
    y: minY,
    width: Math.max(0, maxX - minX),
    height: Math.max(0, maxY - minY),
  };
}

export function getCanvasBackingSize(
  width,
  height,
  devicePixelRatio,
  maxPixelRatio = 2
) {
  const pixelRatio = Math.min(
    Math.max(devicePixelRatio || 1, 1),
    maxPixelRatio
  );

  return {
    pixelRatio,
    width: Math.ceil(width * pixelRatio),
    height: Math.ceil(height * pixelRatio),
  };
}

export function addStrokeToInkIndex(index, stroke) {
  const row = getStrokeRow(stroke);
  const rowStrokes = index.rows.get(row);

  if (rowStrokes) {
    rowStrokes.push(stroke);
  } else {
    index.rows.set(row, [stroke]);
  }

  index.bounds.set(
    row,
    mergeBounds(index.bounds.get(row), getStrokeBounds(stroke))
  );

  return row;
}

export function buildInkIndex(strokes) {
  const index = {
    rows: new Map(),
    bounds: new Map(),
  };

  for (const stroke of strokes) addStrokeToInkIndex(index, stroke);

  return index;
}
