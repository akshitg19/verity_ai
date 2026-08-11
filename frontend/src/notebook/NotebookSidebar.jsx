import { useEffect, useMemo, useRef, useState } from "react";

import { COLORS, FONT, RADIUS, SHADOW, SUBJECTS, SURFACES } from "../theme";
import { exportPage } from "../canvas/exportPage";
import PageThumbnail from "./PageThumbnail";
import { FolderRow, NoteRow } from "./NotebookRows";
import RowMenu from "./RowMenu";

// The notes shelf, built the way a notes app is built.
//
// Apple Notes and Samsung Notes both settle on the same three things, so this
// does too: one subject in view at a time rather than every subject at once,
// a search field, and a three-dot menu on every row instead of a scattering
// of tiny glyphs. The subject is a heading in the student's own words, not a
// folder called "First structure".

function downloadNotebook(serialized, title) {
  const blob = new Blob([serialized], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeTitle = (title || "verity-notebook")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-|-$/g, "");
  link.href = url;
  link.download = `${safeTitle || "verity-notebook"}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  const sidebarRef = useRef(null);
  const headingRef = useRef(null);
  const backdropRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const wasOpenRef = useRef(false);
  const backgroundStateRef = useRef([]);
  const importInputRef = useRef(null);
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
    deletedPage,
    undoDeletePage,
    dismissDeletedPage,
    saveStatus,
    saveError,
    exportNotebook,
    importNotebook,
    retrySave,
  } = notebook;

  const [query, setQuery] = useState("");
  const [cloudNotice, setCloudNotice] = useState(null);
  const [importError, setImportError] = useState(null);
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
  const handleExportNotebook = async () => {
    try {
      const serialized = await exportNotebook();
      downloadNotebook(serialized, activeNote.title);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Export failed.");
    }
  };

  const handleImportNotebook = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportError(null);
    try {
      await importNotebook(await file.text());
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "That notebook could not be imported.");
    }
  };

  useEffect(() => {
    if (!open || wasOpenRef.current) {
      if (!open && wasOpenRef.current) restoreFocusRef.current?.focus?.();
      wasOpenRef.current = open;
      return undefined;
    }
    restoreFocusRef.current = document.activeElement;
    requestAnimationFrame(() => headingRef.current?.focus());
    const workspace = sidebarRef.current?.closest(".workspace-app");
    backgroundStateRef.current = [...(workspace?.children ?? [])]
      .filter((element) => element !== sidebarRef.current && element !== backdropRef.current)
      .map((element) => {
        const previous = Boolean(element.inert);
        element.inert = true;
        return { element, previous };
      });
    wasOpenRef.current = true;
    return () => {
      for (const { element, previous } of backgroundStateRef.current) element.inert = previous;
      backgroundStateRef.current = [];
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = [...(sidebarRef.current?.querySelectorAll("button, input, [href], [tabindex]:not([tabindex='-1'])") ?? [])]
        .filter((element) => !element.disabled && !element.closest("[inert]"));
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement);
      const nextIndex = event.shiftKey
        ? index <= 0 ? controls.length - 1 : index - 1
        : index === controls.length - 1 ? 0 : index + 1;
      event.preventDefault();
      controls[nextIndex]?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  return (
    <>
      {open && (
        <div
          ref={backdropRef}
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
        ref={sidebarRef}
        aria-label="Notebook"
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-labelledby="notebook-sidebar-title"
        inert={!open}
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
              ref={headingRef}
              id="notebook-sidebar-title"
              tabIndex={-1}
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
                minWidth: 44,
                minHeight: 44,
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
            <button
              type="button"
              title="Export notebook backup"
              aria-label="Export notebook backup"
              onClick={() => void handleExportNotebook()}
              style={{
                minWidth: 44,
                minHeight: 44,
                border: "none",
                background: "transparent",
                color: COLORS.muted,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              JSON
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportNotebook}
              hidden
            />
            <button
              type="button"
              title="Import notebook backup"
              aria-label="Import notebook backup"
              onClick={() => importInputRef.current?.click()}
              style={{
                minWidth: 44,
                minHeight: 44,
                border: "none",
                background: "transparent",
                color: COLORS.muted,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                padding: 0,
              }}
            >
              Import
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
                        top: -12,
                        right: -12,
                        width: 44,
                        height: 44,
                        display: "grid",
                        placeItems: "center",
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: "50%",
                        background: COLORS.surface,
                        color: COLORS.muted,
                        fontSize: 16,
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

        {deletedPage && (
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
            <span style={{ flex: 1 }}>Page deleted</span>
            <button type="button" onClick={undoDeletePage} style={{ minWidth: 44, minHeight: 44, border: "none", background: "transparent", color: meta.accent, fontWeight: 700 }}>Undo</button>
            <button type="button" onClick={dismissDeletedPage} aria-label="Dismiss page recovery" style={{ minWidth: 44, minHeight: 44, border: "none", background: "transparent", color: COLORS.muted, fontSize: 18 }}>×</button>
          </div>
        )}

        <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", color: saveStatus === "error" ? COLORS.danger : COLORS.muted, fontSize: 11 }}>
          <span style={{ flex: 1 }}>{saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? `Save failed: ${saveError ?? "try again"}` : "Saved"}</span>
          {saveStatus === "error" && (
            <button type="button" onClick={() => void retrySave()} style={{ minWidth: 44, minHeight: 44, border: "none", background: "transparent", color: meta.accent, fontWeight: 700, cursor: "pointer" }}>
              Retry
            </button>
          )}
        </div>

        {importError && (
          <div role="alert" style={{ padding: "7px 14px", color: COLORS.danger, fontSize: 11 }}>
            {importError}
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
