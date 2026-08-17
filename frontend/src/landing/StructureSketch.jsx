// Skeletal structures, drawn the way a student draws them.
//
// The organic walkthrough used to show only `CCCO`, and a SMILES string is
// our notation, not theirs. The thing the product actually does is read a
// *drawing*, so the drawing is what the page has to show: the sketch is the
// student's half, the SMILES beside it is what came back out of the reader.
//
// Hand-drawn on purpose. These are three-carbon alcohols with a vertex or
// two, so an inline path is smaller, sharper and theme-aware in a way a
// rendered PNG is not, and it needs no round trip to RDKit to put a picture
// on a static page.

const SKETCHES = {
  // propan-1-ol: the OH on the end carbon.
  CCCO: {
    label: "propan-1-ol",
    paths: ["M12 44 L32 26 L52 44 L70 30"],
    hydroxyl: { x: 78, y: 28 },
  },
  // propan-2-ol: the OH on the middle carbon, which is the whole difference.
  "CC(C)O": {
    label: "propan-2-ol",
    paths: ["M14 46 L34 28 L54 46", "M34 28 L34 12"],
    hydroxyl: { x: 34, y: 6, anchor: "middle" },
  },
};

export default function StructureSketch({ smiles, tone = "ink" }) {
  const sketch = SKETCHES[smiles];
  if (!sketch) return null;

  const stroke = tone === "invalid" ? "#9a481e" : "#25322d";

  return (
    <svg
      className="structure-sketch"
      viewBox="0 0 100 56"
      role="img"
      aria-label={`Skeletal structure of ${sketch.label}`}
    >
      {sketch.paths.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <text
        x={sketch.hydroxyl.x}
        y={sketch.hydroxyl.y}
        fill={stroke}
        fontSize="15"
        fontWeight="700"
        dominantBaseline="middle"
        textAnchor={sketch.hydroxyl.anchor ?? "start"}
      >
        OH
      </text>
    </svg>
  );
}

export { SKETCHES };
