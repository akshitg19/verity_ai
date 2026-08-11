import { useState } from "react";

import { COLORS, FONT, RADIUS, SUBJECTS, SURFACES } from "../theme";
import RowMenu from "./RowMenu";

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

export function NoteRow({
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
      role="button"
      tabIndex={0}
      aria-current={active ? "page" : undefined}
      onClick={() => !editing && onOpen(note.id)}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !editing) {
          event.preventDefault();
          onOpen(note.id);
        }
      }}
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

export function FolderRow({ folder, children, count, onRename, onDelete, onCreateIn, onDropNote }) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [over, setOver] = useState(false);

  return (
    <div style={{ marginBottom: 2 }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => !editing && setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!editing) setOpen((value) => !value);
          }
        }}
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
