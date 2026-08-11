// The geometry behind a page thumbnail, kept out of the component so it can be
// tested without a DOM and so the component file exports only a component,
// which is what React Fast Refresh needs.

import { COLORS } from "../theme";

export const VIEW_WIDTH = 100;
export const VIEW_HEIGHT = 130;

export function thumbnailPaths(strokes, limit = 140) {
  const usable = (strokes ?? []).filter((stroke) => stroke?.points?.length);
  if (!usable.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of usable) {
    for (const point of stroke.points) {
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
  }

  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  // Fit inside the box while keeping the aspect ratio, so a wide line of
  // working is not stretched into something unrecognisable.
  const scale = Math.min(VIEW_WIDTH / width, VIEW_HEIGHT / height, 1.6);
  const offsetX = (VIEW_WIDTH - width * scale) / 2;
  const offsetY = (VIEW_HEIGHT - height * scale) / 2;

  // Only as many strokes as it takes to recognise the page. A dense page of
  // algebra can be hundreds, and past the first hundred or so they land on
  // top of each other anyway.
  return usable.slice(0, limit).map((stroke) => ({
    color: stroke.color ?? COLORS.text,
    points: stroke.points
      .map(
        (point) =>
          `${((point.x - minX) * scale + offsetX).toFixed(1)},${(
            (point.y - minY) * scale +
            offsetY
          ).toFixed(1)}`
      )
      .join(" "),
  }));
}

