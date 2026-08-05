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
