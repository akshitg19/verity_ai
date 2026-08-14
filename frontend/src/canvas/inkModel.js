import { DEFAULT_LINE_HEIGHT, getStrokeRow } from "./geometry";

// How much clear vertical space still counts as the same written line.
// A subscript sits below the baseline but still overlaps the glyph it belongs
// to; the next line down starts well clear of it.
export const DEFAULT_ROW_JOIN_GAP = 10;

// A row may not grow past this multiple of the ruled height by joining.
// Without a ceiling every join widens the row's bounds, which makes the next
// join likelier, and one row eventually swallows the page. Two and a quarter
// ruled bands still bounds that growth while leaving room for a tested
// numerator, fraction bar, and denominator.
export const MAX_ROW_HEIGHT_RATIO = 2.25;
export const SPATIAL_CELL_SIZE = 64;

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

// Which row a piece of ink belongs to, decided against the ink already on the
// page rather than against a fixed grid.
//
// `getStrokeRow` alone drops a stroke into the 64px band containing its
// vertical centre. A subscript's centre sits roughly 30px below its parent
// glyph's, which is enough to cross a band boundary, so `H₂` was torn into
// `H` on one line and `2` on the next. Worse, whether it tore depended on
// where on the page the student happened to write: in the reported case the
// subscript of `N₂` stayed put while the ones on `H₂` and `NH₃` did not.
// That is not something a student can learn to avoid.
//
// So a stroke joins the existing row whose ink it overlaps most, and the grid
// is consulted only to key a genuinely new row. Existing row keys are never
// rewritten, which matters because the row integer is the identity the
// recognition queue, the verdict map, and the undo path all key off.
export function resolveRowForBounds(
  index,
  bounds,
  {
    lineHeight = DEFAULT_LINE_HEIGHT,
    joinGap = DEFAULT_ROW_JOIN_GAP,
    maxRowHeight = DEFAULT_LINE_HEIGHT * MAX_ROW_HEIGHT_RATIO,
  } = {}
) {
  if (!bounds) return null;

  let bestRow = null;
  let bestOverlap = -Infinity;
  let bestDistance = Infinity;

  for (const [row, rowBounds] of index.bounds) {
    if (!rowBounds) continue;

    // Positive when the two genuinely overlap, negative when there is clear
    // space between them, so `-joinGap` reads as "this far apart and no more".
    const overlap =
      Math.min(bounds.maxY, rowBounds.maxY) -
      Math.max(bounds.minY, rowBounds.minY);
    if (overlap < -joinGap) continue;

    // Refuse a join that would stretch the row past the ceiling above.
    const joinedHeight =
      Math.max(bounds.maxY, rowBounds.maxY) -
      Math.min(bounds.minY, rowBounds.minY);
    if (joinedHeight > maxRowHeight) continue;

    // A single point has no height, so every candidate ties at zero overlap.
    // Distance between centres breaks the tie deterministically; without it
    // the winner would depend on Map insertion order.
    const distance = Math.abs(
      (bounds.minY + bounds.maxY) / 2 - (rowBounds.minY + rowBounds.maxY) / 2
    );

    if (overlap > bestOverlap || (overlap === bestOverlap && distance < bestDistance)) {
      bestOverlap = overlap;
      bestDistance = distance;
      bestRow = row;
    }
  }

  if (bestRow !== null) return bestRow;
  return Math.floor((bounds.minY + bounds.maxY) / 2 / lineHeight);
}

// The row a stroke actually landed in. The eraser and undo both need this,
// and they cannot recompute it from the stroke alone any more, because a
// joined stroke does not live in the row its own centre would name.
export function findStrokeRow(index, stroke) {
  for (const [row, rowStrokes] of index.rows) {
    if (rowStrokes.includes(stroke)) return row;
  }
  return null;
}

export function addStrokeToInkIndex(index, stroke, options) {
  const bounds = getStrokeBounds(stroke);
  const row = bounds
    ? resolveRowForBounds(index, bounds, options)
    : getStrokeRow(stroke);
  const rowStrokes = index.rows.get(row);

  if (rowStrokes) {
    rowStrokes.push(stroke);
  } else {
    index.rows.set(row, [stroke]);
  }
  index.strokeRows.set(stroke, row);

  index.bounds.set(
    row,
    mergeBounds(index.bounds.get(row), getStrokeBounds(stroke))
  );

  if (!bounds) return row;
  index.strokeBounds.set(stroke, bounds);
  const minCellX = Math.floor(bounds.minX / SPATIAL_CELL_SIZE);
  const maxCellX = Math.floor(bounds.maxX / SPATIAL_CELL_SIZE);
  const minCellY = Math.floor(bounds.minY / SPATIAL_CELL_SIZE);
  const maxCellY = Math.floor(bounds.maxY / SPATIAL_CELL_SIZE);
  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      const key = `${cellX}:${cellY}`;
      const cell = index.spatial.get(key) ?? new Set();
      cell.add(stroke);
      index.spatial.set(key, cell);
    }
  }

  return row;
}

export function strokesNearBounds(index, bounds) {
  if (!bounds) return new Set();
  const minCellX = Math.floor(bounds.minX / SPATIAL_CELL_SIZE);
  const maxCellX = Math.floor(bounds.maxX / SPATIAL_CELL_SIZE);
  const minCellY = Math.floor(bounds.minY / SPATIAL_CELL_SIZE);
  const maxCellY = Math.floor(bounds.maxY / SPATIAL_CELL_SIZE);
  const candidates = new Set();
  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
      for (const stroke of index.spatial.get(`${cellX}:${cellY}`) ?? []) {
        const strokeBounds = index.strokeBounds.get(stroke);
        if (
          strokeBounds &&
          strokeBounds.maxX >= bounds.minX &&
          strokeBounds.minX <= bounds.maxX &&
          strokeBounds.maxY >= bounds.minY &&
          strokeBounds.minY <= bounds.maxY
        ) {
          candidates.add(stroke);
        }
      }
    }
  }
  return candidates;
}

export function rowsNearBounds(index, bounds) {
  const rows = new Set();
  for (const stroke of strokesNearBounds(index, bounds)) {
    const row = index.strokeRows.get(stroke);
    if (row !== undefined) rows.add(row);
  }
  return rows;
}

export function buildInkIndex(strokes) {
  const index = {
    rows: new Map(),
    bounds: new Map(),
    strokeBounds: new Map(),
    strokeRows: new Map(),
    spatial: new Map(),
  };

  for (const stroke of strokes) addStrokeToInkIndex(index, stroke);

  return index;
}
