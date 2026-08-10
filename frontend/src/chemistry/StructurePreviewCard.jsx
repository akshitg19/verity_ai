import { COLORS, RADIUS, SUBJECTS } from "../theme";
import { isTrustedStructurePreview } from "./structurePreview";

const accent = SUBJECTS.chemistry.accent;

export default function StructurePreviewCard({ preview }) {
  if (!isTrustedStructurePreview(preview)) return null;

  return (
    <div
      style={{
        marginTop: 10,
        padding: 8,
        borderRadius: RADIUS.md,
        background: "#fff",
        border: `1px solid ${COLORS.border}`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: COLORS.muted,
          marginBottom: 6,
        }}
      >
        What we read, drawn back
      </div>
      <div
        className="structure-preview"
        style={{ display: "grid", placeItems: "center" }}
        // The SVG comes from our application's RDKit rendering path, never
        // directly from a model or unchecked student output.
        dangerouslySetInnerHTML={{ __html: preview.svg }}
      />
      <div
        style={{
          marginTop: 4,
          fontSize: 11,
          color: COLORS.muted,
          textAlign: "center",
        }}
      >
        {preview.formula && <span>{preview.formula}</span>}
        {preview.generic && (
          <span style={{ marginLeft: 8, color: accent, fontWeight: 600 }}>
            generic (R groups read as wildcards)
          </span>
        )}
      </div>
    </div>
  );
}
