import { COLORS, SUBJECTS } from "../theme";

// Pages as pages, not as the sentence "Page 1 of 1 +".
//
// A thumbnail per page, the current one marked, and one control to add
// another. Every notes app a student already uses shows pages this way, and
// the text version read as unfinished because it was.
function PageThumb({ page, index, active, accent, onOpen, onDelete, canDelete }) {
  // A cheap sketch of the ink, so pages are distinguishable at a glance
  // without rendering a real canvas per page.
  const marks = Math.min(6, Math.ceil((page.strokes?.length ?? 0) / 4));

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => onOpen(page.id)}
        aria-current={active ? "page" : undefined}
        title={`Page ${index + 1}`}
        style={{
          width: 42,
          height: 54,
          padding: 5,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          gap: 3,
          background: "var(--v-paper)",
          border: active ? `2px solid ${accent}` : `1px solid ${COLORS.border}`,
          borderRadius: 6,
          cursor: "pointer",
          boxShadow: active ? `0 0 0 3px ${accent}22` : "none",
        }}
      >
        {Array.from({ length: marks }).map((_, line) => (
          <span
            key={line}
            style={{
              display: "block",
              height: 2,
              width: `${55 + ((line * 37) % 40)}%`,
              borderRadius: 2,
              background: "var(--v-ink)",
              opacity: 0.5,
            }}
          />
        ))}
        {marks === 0 && (
          <span style={{ fontSize: 9, color: COLORS.muted, marginTop: "auto" }}>
            empty
          </span>
        )}
      </button>
      <div
        style={{
          textAlign: "center",
          fontSize: 10,
          marginTop: 3,
          color: active ? accent : COLORS.muted,
          fontWeight: active ? 700 : 500,
        }}
      >
        {index + 1}
      </div>
      {canDelete && active && (
        <button
          type="button"
          title="Delete this page"
          aria-label={`Delete page ${index + 1}`}
          onClick={() => onDelete(page.id)}
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            width: 18,
            height: 18,
            display: "grid",
            placeItems: "center",
            background: COLORS.surface,
            color: COLORS.danger,
            border: `1px solid ${COLORS.border}`,
            borderRadius: "50%",
            fontSize: 11,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function PageStrip({ notebook, mode }) {
  const accent = SUBJECTS[mode]?.accent ?? COLORS.primary;
  const pages = notebook.activeNote.pages;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          maxWidth: 210,
          paddingBottom: 2,
        }}
      >
        {pages.map((page, index) => (
          <PageThumb
            key={page.id}
            page={page}
            index={index}
            active={page.id === notebook.activePage.id}
            accent={accent}
            onOpen={notebook.openPage}
            onDelete={notebook.deletePage}
            canDelete={pages.length > 1}
          />
        ))}
      </div>
      <button
        type="button"
        title="Add a page"
        aria-label="Add a page"
        onClick={notebook.addPage}
        style={{
          flexShrink: 0,
          width: 42,
          height: 54,
          display: "grid",
          placeItems: "center",
          background: COLORS.surface,
          color: accent,
          border: `1px dashed ${COLORS.border}`,
          borderRadius: 6,
          fontSize: 18,
          cursor: "pointer",
        }}
      >
        +
      </button>
    </div>
  );
}
