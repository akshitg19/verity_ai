import ActionDialog from "./ActionDialog";

export default function WorkspaceActionDialog({
  actionDialog,
  onClose,
  onClear,
  onCreatePage,
  onKeepInk,
}) {
  const clearOnly = actionDialog?.type === "clear";
  const buttonStyle = {
    minHeight: 44,
    width: "100%",
    padding: "10px 14px",
    border: `1px solid var(--v-border)`,
    borderRadius: 9,
    background: "var(--v-surface)",
    color: "var(--v-text)",
    font: "inherit",
    fontWeight: 700,
    cursor: "pointer",
  };
  return (
    <ActionDialog
      open={Boolean(actionDialog)}
      title={clearOnly ? "Clear this page?" : "Start a new question"}
      description={
        clearOnly
          ? "Your ink will move into Undo so you can recover it immediately."
          : "Choose where the new question should begin. Your current work will not be overwritten by a tap."
      }
      onClose={onClose}
    >
      <div style={{ display: "grid", gap: 8 }}>
        {clearOnly ? (
            <button type="button" onClick={onClear} style={buttonStyle}>Clear page</button>
        ) : (
          <>
            <button type="button" onClick={onCreatePage} style={buttonStyle}>Create a new page</button>
            <button type="button" onClick={onKeepInk} style={buttonStyle}>Keep this ink and update the problem</button>
            <button type="button" onClick={onClear} style={buttonStyle}>Clear this page</button>
          </>
        )}
        <button type="button" onClick={onClose} style={{ ...buttonStyle, color: "var(--v-muted)" }}>Cancel</button>
      </div>
    </ActionDialog>
  );
}
