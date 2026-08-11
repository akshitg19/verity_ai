export default function NotebookSaveStatus({ status, error, onRetry }) {
  return (
    <div
      className="workspace-save-status"
      role={status === "error" ? "alert" : "status"}
      aria-live={status === "error" ? "assertive" : "polite"}
    >
      <span>
        {status === "saving"
          ? "Saving…"
          : status === "error"
          ? `Save failed: ${error ?? "try again"}`
          : "Saved"}
      </span>
      {status === "error" && (
        <button type="button" onClick={() => void onRetry()}>
          Retry
        </button>
      )}
    </div>
  );
}
