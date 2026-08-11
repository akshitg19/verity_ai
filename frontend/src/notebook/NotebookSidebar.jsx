import { useMemo, useState } from "react";

import { COLORS, FONT, RADIUS, SHADOW, SUBJECTS, SURFACES } from "../theme";
import { exportPage } from "../canvas/exportPage";
import PageThumbnail from "./PageThumbnail";
import RowMenu from "./RowMenu";

// The notes shelf, built the way a notes app is built.
//
// Apple Notes and Samsung Notes both settle on the same three things, so this
// does too: one subject in view at a time rather than every subject at once,
// a search field, and a three-dot menu on every row instead of a scattering
// of tiny glyphs. The subject is a heading in the student's own words, not a
// folder called "First structure".

function relativeTime(timestamp) {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.round(seconds / 86400)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function InlineName({ value, onCommit, onCancel, size = 13 }) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onCommit(trimmed);
    else onCancel();
  };
  return (
    <input
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") onCancel();
      }}
      onClick={(event) => event.stopPropagation()}
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: "3px 6px",
        border: `1px solid ${COLORS.primary}`,
        borderRadius: 6,
        background: COLORS.surface,
        color: COLORS.text,
        fontSize: size,
        fontFamily: FONT.sans,
        outline: "none",
      }}
    />
  );
}

function NoteRow({
  note,
  active,
  folders,
  onOpen,
  onRename,
  onDelete,
  onDuplicate,
  onMove,
  onTogglePin,
}) {
  const [editing, setEditing] = useState(false);
  const accent = SUBJECTS[note.subject]?.accent ?? COLORS.primary;

  const menu = [
    { glyph: "✎", label: "Rename", onSelect: () => setEditing(true) },
    {
      glyph: note.pinned ? "☆" : "★",
      label: note.pinned ? "Unpin" : "Pin to top",
      onSelect: () => onTogglePin(note.id),
    },
    { glyph: "⧉", label: "Duplicate", onSelect: () => onDuplicate(note.id) },
    ...folders.map((folder) => ({
      glyph: "🗀",
      label: `Move to ${folder.name}`,
      disabled: note.folderId === folder.id,
      onSelect: () => onMove(note.id, folder.id),
    })),
    ...(note.folderId
      ? [{ glyph: "↥", label: "Move out of folder", onSelect: () => onMove(note.id, null) }]
      : []),
    { glyph: "🗑", label: "Delete", danger: true, onSelect: () => onDelete(note.id) },
  ];

  return (
    <div
      onClick={() => !editing && onOpen(note.id)}
      // Dragging a note onto a folder is what people try before they find the
      // menu, so the menu stays and this is the shortcut on top of it.
      draggable={!editing}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/verity-note", note.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 8px 9px 12px",
        marginBottom: 2,
        borderRadius: RADIUS.md,
        background: active ? SURFACES.sidebarActive : "transparent",
        boxShadow: active ? `inset 3px 0 0 ${accent}` : "none",
        cursor: "pointer",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? (
          <InlineName
            value={note.title}
            onCommit={(name) => {
              onRename(note.id, name);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: 13.5,
              fontWeight: active ? 700 : 500,
              color: COLORS.text,
              overflow: "hidden",
            }}
          >
            {note.pinned && (
              <span aria-label="Pinned" title="Pinned" style={{ fontSize: 10, color: accent }}>
                ★
              </span>
            )}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {note.title}
            </span>
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginTop: 2,
            fontSize: 11,
            color: COLORS.muted,
          }}
        >
          <span>{relativeTime(note.updatedAt)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {note.pages.length} page{note.pages.length === 1 ? "" : "s"}
          </span>
          {note.lastVerdict === "invalid" && (
            <span
              title="Something on this note was flagged"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--v-invalid)",
              }}
            />
          )}
          {note.lastVerdict === "valid" && (
            <span
              title="Everything checked out"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--v-valid)",
              }}
            />
          )}
        </div>
      </div>
      <RowMenu items={menu} label={`Actions for ${note.title}`} />
    </div>
  );
}

function FolderRow({ folder, children, count, onRename, onDelete, onCreateIn, onDropNote }) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [over, setOver] = useState(false);

  return (
    <div style={{ marginBottom: 2 }}>
      <div
        onClick={() => !editing && setOpen((value) => !value)}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("text/verity-note")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          const noteId = event.dataTransfer.getData("text/verity-note");
          setOver(false);
          if (!noteId) return;
          event.preventDefault();
          onDropNote(noteId, folder.id);
          setOpen(true);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 8px 8px 6px",
          borderRadius: RADIUS.md,
          background: over ? COLORS.primaryLight : "transparent",
          outline: over ? `2px dashed ${COLORS.primary}` : "none",
          cursor: "pointer",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 12,
            fontSize: 9,
            color: COLORS.muted,
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 160ms ease",
          }}
        >
          ▶
        </span>
        <span aria-hidden="true" style={{ fontSize: 14 }}>
          🗀
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <InlineName
              value={folder.name}
              onCommit={(name) => {
                onRename(folder.id, name);
                setEditing(false);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: COLORS.text,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {folder.name}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, color: COLORS.muted }}>{count}</span>
        <RowMenu
          label={`Actions for ${folder.name}`}
          items={[
            { glyph: "✎", label: "Rename", onSelect: () => setEditing(true) },
            { glyph: "+", label: "New note here", onSelect: () => onCreateIn(folder.id) },
            {
              glyph: "🗑",
              label: "Delete folder",
              danger: true,
              onSelect: () => onDelete(folder.id),
            },
          ]}
        />
      </div>
      {open && <div style={{ paddingLeft: 14 }}>{children}</div>}
    </div>
  );
}

// Placeholders on purpose, and labelled as such rather than pretending.
// Students expect a notes app to reach their cloud drive, and a menu that
// says "coming soon" is a promise; a menu with nothing in it reads as a
// product that never thought about it.
const CLOUD_TARGETS = [
  { id: "drive", label: "Google Drive", glyph: "▲" },
  { id: "onedrive", label: "OneDrive", glyph: "☁" },
];

export default function NotebookSidebar({
  notebook,
  open,
  onClose,
  width = 280,
  subject = "chemistry",
  onSubjectChange,
}) {
  const {
    treeFor,
    createFolder,
    renameFolder,
    deleteFolder,
    moveNoteToFolder,
    activeNote,
    activePage,
    createNote,
    duplicateNote,
    openNote,
    renameNote,
    deleteNote,
    togglePin,
    deleted,
    undoDelete,
    dismissDeleted,
    addPage,
    openPage,
    deletePage,
  } = notebook;

  const [query, setQuery] = useState("");
  const [cloudNotice, setCloudNotice] = useState(null);
  const meta = SUBJECTS[subject];
  const tree = treeFor(subject);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tree;
    const match = (note) => note.title.toLowerCase().includes(needle);
    return {
      folders: tree.folders
        .map((folder) => ({ ...folder, notes: folder.notes.filter(match) }))
        .filter((folder) => folder.notes.length),
      loose: tree.loose.filter(match),
    };
  }, [query, tree]);

  const noteCount = tree.loose.length + tree.folders.reduce((sum, f) => sum + f.notes.length, 0);
  const nothingHere = !filtered.folders.length && !filtered.loose.length;

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
          transform: open ? "translateX(0)" : `translateX(-${width + 12}px)`,
          transition: "transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
          background: SURFACES.sidebar,
          borderRight: `1px solid ${COLORS.border}`,
          boxShadow: open ? SHADOW.float : "none",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          fontFamily: FONT.sans,
        }}
      >
        <div style={{ padding: "18px 16px 10px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2
              style={{
                margin: 0,
                flex: 1,
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: -0.4,
                color: COLORS.text,
              }}
            >
              {meta.label}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notebook"
              style={{
                width: 30,
                height: 30,
                display: "grid",
                placeItems: "center",
                border: "none",
                borderRadius: RADIUS.sm,
                background: "transparent",
                color: COLORS.muted,
                fontSize: 18,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>
            {noteCount} note{noteCount === 1 ? "" : "s"}
          </div>

          {/* One subject at a time. Two whole trees on screen at once was the
              reason the shelf felt like a file manager. */}
          <div
            style={{
              display: "flex",
              gap: 2,
              padding: 3,
              marginTop: 12,
              borderRadius: RADIUS.md,
              background: COLORS.background,
              border: `1px solid ${COLORS.border}`,
            }}
          >
            {["chemistry", "math"].map((option) => {
              const selected = subject === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSubjectChange?.(option)}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    background: selected ? COLORS.surface : "transparent",
                    color: selected ? SUBJECTS[option].accent : COLORS.muted,
                    border: "none",
                    borderRadius: RADIUS.sm,
                    boxShadow: selected ? SHADOW.raised : "none",
                    fontFamily: FONT.sans,
                    fontSize: 12.5,
                    fontWeight: selected ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {SUBJECTS[option].label}
                </button>
              );
            })}
          </div>

          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes"
            aria-label="Search notes"
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: 8,
              padding: "8px 12px",
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.md,
              background: COLORS.background,
              color: COLORS.text,
              fontFamily: FONT.sans,
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 10px 10px" }}>
          {filtered.folders.map((folder) => (
            <FolderRow
              key={folder.id}
              folder={folder}
              count={folder.notes.length}
              onRename={renameFolder}
              onDelete={deleteFolder}
              onCreateIn={(folderId) => createNote(subject, undefined, folderId)}
              onDropNote={moveNoteToFolder}
            >
              {folder.notes.length ? (
                folder.notes.map((note) => (
                  <NoteRow
                    key={note.id}
                    note={note}
                    active={note.id === activeNote.id}
                    folders={tree.folders}
                    onOpen={openNote}
                    onRename={renameNote}
                    onDelete={deleteNote}
                    onDuplicate={duplicateNote}
                    onMove={moveNoteToFolder}
                    onTogglePin={togglePin}
                  />
                ))
              ) : (
                <div style={{ padding: "6px 12px", fontSize: 12, color: COLORS.muted }}>
                  Empty
                </div>
              )}
            </FolderRow>
          ))}

          {filtered.loose.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              active={note.id === activeNote.id}
              folders={tree.folders}
              onOpen={openNote}
              onRename={renameNote}
              onDelete={deleteNote}
              onDuplicate={duplicateNote}
              onMove={moveNoteToFolder}
              onTogglePin={togglePin}
            />
          ))}

          {nothingHere && (
            <div
              style={{
                padding: "28px 16px",
                textAlign: "center",
                fontSize: 13,
                color: COLORS.muted,
                lineHeight: 1.5,
              }}
            >
              {query ? (
                <>Nothing matches “{query}”.</>
              ) : (
                <>
                  No {meta.label.toLowerCase()} notes yet.
                  <br />
                  Start one and it saves as you write.
                </>
              )}
            </div>
          )}
        </div>

        {/* Pages in the open note. Kept at the foot because it is about the
            note you are in, not about choosing a different one. */}
        <div
          style={{
            flexShrink: 0,
            padding: "10px 14px",
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 8,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: COLORS.muted,
            }}
          >
            Pages
            <span
              style={{
                marginLeft: "auto",
                maxWidth: 120,
                textTransform: "none",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {activeNote.title}
            </span>
            <button
              type="button"
              title="Save this page as a picture"
              aria-label="Save this page as a picture"
              onClick={() =>
                exportPage(
                  activePage.strokes,
                  activeNote.title,
                  activeNote.pages.findIndex((page) => page.id === activePage.id) + 1
                )
              }
              style={{
                border: "none",
                background: "transparent",
                color: COLORS.muted,
                fontSize: 13,
                lineHeight: 1,
                cursor: "pointer",
                padding: 0,
              }}
            >
              ⤓
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {activeNote.pages.map((page, index) => {
              const current = page.id === activePage.id;
              return (
                <span key={page.id} style={{ position: "relative" }}>
                  <button
                    type="button"
                    aria-label={`Open page ${index + 1}`}
                    aria-current={current ? "page" : undefined}
                    title={`Page ${index + 1}`}
                    onClick={() => openPage(page.id)}
                    style={{
                      width: 38,
                      height: 48,
                      padding: 2,
                      borderRadius: 6,
                      border: `1px solid ${current ? meta.accent : COLORS.border}`,
                      background: current ? COLORS.surface : COLORS.background,
                      color: current ? meta.accent : COLORS.muted,
                      cursor: "pointer",
                      boxShadow: current ? SHADOW.raised : "none",
                      overflow: "hidden",
                    }}
                  >
                    <PageThumbnail strokes={page.strokes} label={index + 1} />
                  </button>
                  {activeNote.pages.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Delete page ${index + 1}`}
                      title="Delete this page"
                      onClick={() => deletePage(page.id)}
                      style={{
                        position: "absolute",
                        top: -5,
                        right: -5,
                        width: 16,
                        height: 16,
                        display: "grid",
                        placeItems: "center",
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: "50%",
                        background: COLORS.surface,
                        color: COLORS.muted,
                        fontSize: 10,
                        lineHeight: 1,
                        cursor: "pointer",
                      }}
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })}
            <button
              type="button"
              onClick={addPage}
              title="Add a page"
              aria-label="Add a page"
              style={{
                width: 32,
                height: 40,
                borderRadius: 6,
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

        <div
          style={{
            flexShrink: 0,
            display: "flex",
            gap: 8,
            padding: "10px 14px",
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          <button
            type="button"
            onClick={() => createNote(subject)}
            style={{
              flex: 1,
              padding: "10px 12px",
              background: meta.accent,
              color: "#fff",
              border: "none",
              borderRadius: RADIUS.md,
              fontFamily: FONT.sans,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            New note
          </button>
          <button
            type="button"
            onClick={() => createFolder(subject, "New folder")}
            title="New folder"
            aria-label="New folder"
            style={{
              width: 42,
              padding: 0,
              display: "grid",
              placeItems: "center",
              background: COLORS.surface,
              color: COLORS.text,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.md,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            🗀
          </button>
          <RowMenu
            label="Sync and backup"
            items={CLOUD_TARGETS.map((target) => ({
              glyph: target.glyph,
              label: `Sync to ${target.label}`,
              onSelect: () => setCloudNotice(target.label),
            }))}
          />
        </div>

        {deleted && (
          <div
            role="status"
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 14px",
              background: COLORS.background,
              borderTop: `1px solid ${COLORS.border}`,
              fontSize: 12,
              color: COLORS.muted,
            }}
          >
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Deleted “{deleted.note.title}”
            </span>
            <button
              type="button"
              onClick={undoDelete}
              style={{
                border: "none",
                background: "transparent",
                color: meta.accent,
                fontFamily: FONT.sans,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Undo
            </button>
            <button
              type="button"
              onClick={dismissDeleted}
              aria-label="Dismiss"
              style={{
                border: "none",
                background: "transparent",
                color: COLORS.muted,
                fontSize: 14,
                cursor: "pointer",
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        )}

        {cloudNotice && (
          <div
            role="status"
            onClick={() => setCloudNotice(null)}
            style={{
              flexShrink: 0,
              padding: "9px 14px",
              background: COLORS.primaryLight,
              color: COLORS.primary,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {cloudNotice} sync is not connected yet. Your notes are saved in this
            browser.
          </div>
        )}
      </aside>
    </>
  );
}
