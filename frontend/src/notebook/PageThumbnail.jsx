import { COLORS } from "../theme";
import { thumbnailPaths, VIEW_HEIGHT, VIEW_WIDTH } from "./thumbnailGeometry";

// A page, drawn small.
//
// The page strip was numbered squares, which tells a student the page exists
// and nothing about what is on it. Every notes app shows the page instead,
// because "the one with the long division on it" is how people actually
// remember which page they want.
//
// Rendered as an SVG polyline rather than a canvas: strokes are already point
// lists, an SVG scales itself with viewBox, and there is no imperative draw to
// keep in step with React.

export default function PageThumbnail({ strokes, label }) {
  const paths = thumbnailPaths(strokes);

  if (!paths) {
    return (
      <span
        aria-hidden="true"
        style={{
          display: "block",
          fontSize: 10,
          color: COLORS.muted,
          textAlign: "center",
          lineHeight: "44px",
        }}
      >
        {label}
      </span>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      {paths.map((path, index) => (
        <polyline
          key={index}
          points={path.points}
          fill="none"
          stroke={path.color}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />
      ))}
    </svg>
  );
}
