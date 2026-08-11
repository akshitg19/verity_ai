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

// Rub out the part of a stroke that falls inside the eraser disc, and return
// what is left.
//
// The old eraser deleted whole strokes, so clipping the tail of one long
// stroke removed the entire thing. This splits instead: the points inside the
// disc go, and each surviving run becomes its own stroke.
//
// Returns the original stroke unchanged when nothing is inside the disc, which
// is both the fast path and what keeps a single-point dot from being swept up
// by the "drop one-point remnants" rule below.
export function eraseFromStroke(stroke, centre, radius = DEFAULT_ERASER_RADIUS) {
  const points = stroke?.points ?? [];
  if (points.length === 0) return [];

  const inside = points.map(
    (point) => Math.hypot(point.x - centre.x, point.y - centre.y) <= radius
  );
  if (!inside.some(Boolean)) return [stroke];

  const runs = [];
  let run = [];
  for (let index = 0; index < points.length; index += 1) {
    if (inside[index]) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push(points[index]);
    }
  }
  if (run.length) runs.push(run);

  // A one-point remnant is a stray dot the student did not draw, so it goes.
  return runs
    .filter((segment) => segment.length >= 2)
    .map((segment) => ({ ...stroke, points: segment }));
}

// Points along a drag, so a fast swipe erases a continuous band rather than
// leaving gaps between pointer samples.
export function samplePath(from, to, step = 6) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const count = Math.max(1, Math.ceil(distance / step));
  const points = [];
  for (let index = 1; index <= count; index += 1) {
    const t = index / count;
    points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  return points;
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
