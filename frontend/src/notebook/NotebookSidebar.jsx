import { useState } from "react";

import { COLORS, FONT, RADIUS, SHADOW, SUBJECTS, SURFACES } from "../theme";

// The notes shelf: folders by subject, notes inside them, pages inside the
// open note.
//
// Math and chemistry live in separate folders rather than sharing one
// surface, which is the point of the notebook model: the two subjects have
// nothing in common except the pen.

function relativeTime(timestamp) {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

function NoteRow({ note, active, onOpen, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.title);
  const accent = SUBJECTS[note.subject]?.accent ?? COLORS.primary;

  const commit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== note.title) onRename(note.id, trimmed);
    else setDraft(note.title);
  };

  return (
    <div
      onClick={() => onOpen(note.id)}
      onDoubleClick={() => setEditing(true)}
      style={{
        padding: "8px 10px",
        marginBottom: 3,
        borderRadius: RADIUS.sm,
        background: active ? SURFACES.sidebarActive : "transparent",
        borderLeft: `3px solid ${active ? accent : "transparent"}`,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setDraft(note.title);
                setEditing(false);
              }
            }}
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "2px 4px",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 5,
              fontSize: 12.5,
              fontFamily: FONT.sans,
            }}
          />
        ) : (
          <div
            style={{
              fontSize: 12.5,
              fontWeight: active ? 700 : 500,
              color: COLORS.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {note.title}
          </div>
        )}
        <div style={{ fontSize: 10.5, color: COLORS.muted, marginTop: 1 }}>
          {note.pages.length} page{note.pages.length === 1 ? "" : "s"} ·{" "}
          {relativeTime(note.updatedAt)}
          {note.lastVerdict === "invalid" && (
            <span style={{ color: COLORS.danger, marginLeft: 6 }}>· flagged</span>
          )}
          {note.lastVerdict === "valid" && (
            <span style={{ color: "#267a55", marginLeft: 6 }}>· correct</span>
          )}
        </div>
      </div>
      <button
        type="button"
        title="Delete note"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(note.id);
        }}
        style={{
          border: "none",
          background: "transparent",
          color: COLORS.muted,
          fontSize: 13,
          cursor: "pointer",
          padding: 2,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

function Folder({ subject, notes, activeNoteId, onOpen, onRename, onDelete, onCreate }) {
  const [open, setOpen] = useState(true);
  const meta = SUBJECTS[subject];

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 6px",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          style={{
            border: "none",
            background: "transparent",
            color: COLORS.muted,
            cursor: "pointer",
            fontSize: 10,
            padding: 0,
            width: 12,
          }}
        >
          {open ? "▾" : "▸"}
        </button>
        <span style={{ fontSize: 13 }}>{meta.glyph}</span>
        <span
          style={{
            flex: 1,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: meta.accent,
          }}
        >
          {meta.label}
        </span>
        <button
          type="button"
          title={`New ${meta.label.toLowerCase()} note`}
          onClick={() => onCreate(subject)}
          style={{
            border: "none",
            background: "transparent",
            color: meta.accent,
            fontSize: 15,
            cursor: "pointer",
            padding: 0,
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>

      {open &&
        (notes.length ? (
          notes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              active={note.id === activeNoteId}
              onOpen={onOpen}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))
        ) : (
          <div
            style={{
              padding: "6px 10px 6px 28px",
              fontSize: 11,
              color: COLORS.muted,
            }}
          >
            Nothing here yet.
          </div>
        ))}
    </div>
  );
}

export default function NotebookSidebar({ notebook, open, onClose, width = 250 }) {
  const {
    folders,
    activeNote,
    activePage,
    createNote,
    openNote,
    renameNote,
    deleteNote,
    addPage,
    openPage,
    deletePage,
  } = notebook;

  return (
    <>
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 24,
            background: SURFACES.overlay,
            // The overlay only exists on narrow screens; on a tablet in
            // landscape the shelf sits beside the page instead of over it.
            display: "block",
          }}
        />
      )}

      <aside
        aria-label="Notebook"
        style={{
          position: "fixed",
          top: 0,
          bottom: 0,
          left: 0,
          width,
          zIndex: 25,
          transform: open ? "translateX(0)" : `translateX(-${width + 8}px)`,
          transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          background: SURFACES.sidebar,
          borderRight: `1px solid ${COLORS.border}`,
          boxShadow: open ? SHADOW.float : "none",
          padding: "16px 12px",
          boxSizing: "border-box",
          overflowY: "auto",
          fontFamily: FONT.sans,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>
            Notebook
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close notebook"
            style={{
              border: "none",
              background: "transparent",
              color: COLORS.muted,
              fontSize: 18,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {["math", "chemistry"].map((subject) => (
          <Folder
            key={subject}
            subject={subject}
            notes={folders[subject] ?? []}
            activeNoteId={activeNote.id}
            onOpen={openNote}
            onRename={renameNote}
            onDelete={deleteNote}
            onCreate={createNote}
          />
        ))}

        <div
          style={{
            marginTop: 8,
            paddingTop: 12,
            borderTop: `1px solid ${COLORS.border}`,
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
            Pages in “{activeNote.title}”
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {activeNote.pages.map((page, index) => {
              const current = page.id === activePage.id;
              return (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => openPage(page.id)}
                  onDoubleClick={() => deletePage(page.id)}
                  title={
                    current
                      ? "Current page (double-click to delete)"
                      : "Open this page"
                  }
                  style={{
                    width: 34,
                    height: 40,
                    borderRadius: 5,
                    border: `1px solid ${current ? COLORS.primary : COLORS.border}`,
                    background: current ? COLORS.surface : "#fff",
                    color: current ? COLORS.primary : COLORS.muted,
                    fontSize: 11,
                    fontWeight: current ? 700 : 500,
                    cursor: "pointer",
                    boxShadow: current ? SHADOW.raised : "none",
                  }}
                >
                  {index + 1}
                </button>
              );
            })}
            <button
              type="button"
              onClick={addPage}
              title="Add a page"
              style={{
                width: 34,
                height: 40,
                borderRadius: 5,
                border: `1px dashed ${COLORS.border}`,
                background: "transparent",
                color: COLORS.muted,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              +
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
