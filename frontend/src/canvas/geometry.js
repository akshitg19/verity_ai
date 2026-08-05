export const DEFAULT_LINE_HEIGHT = 64;
export const DEFAULT_ERASER_RADIUS = 18;

export function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) /
        (dx * dx + dy * dy)
    )
  );

  const closestX = start.x + t * dx;
  const closestY = start.y + t * dy;

  return Math.hypot(point.x - closestX, point.y - closestY);
}

export function strokeTouchesPoint(
  stroke,
  point,
  radius = DEFAULT_ERASER_RADIUS
) {
  const points = stroke.points;

  if (points.length === 1) {
    return Math.hypot(point.x - points[0].x, point.y - points[0].y) <= radius;
  }

  for (let index = 1; index < points.length; index += 1) {
    if (distanceToSegment(point, points[index - 1], points[index]) <= radius) {
      return true;
    }
  }

  return false;
}

// Assign a stroke to the ruled row containing its vertical center.
export function getStrokeRow(stroke, lineHeight = DEFAULT_LINE_HEIGHT) {
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of stroke.points) {
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }

  return Math.floor((minY + maxY) / 2 / lineHeight);
}

// Returns a map of row index to the strokes assigned to that row.
export function segmentIntoLines(strokes, lineHeight = DEFAULT_LINE_HEIGHT) {
  const lines = new Map();

  for (const stroke of strokes) {
    const row = getStrokeRow(stroke, lineHeight);
    if (!lines.has(row)) lines.set(row, []);
    lines.get(row).push(stroke);
  }

  return lines;
}
