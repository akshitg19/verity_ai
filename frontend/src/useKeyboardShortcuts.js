import { useEffect } from "react";

// The shortcuts a laptop user tries without being told.
//
// This is built for a tablet, but a teacher will look at it on a laptop, and
// ctrl+Z doing nothing reads as broken rather than as unsupported. Kept out of
// App.jsx because App.jsx is capped at 260 lines on purpose: the cap is what
// stops this file becoming the place every stray effect lands.
//
// Ignored while a field has focus, so ctrl+Z inside a transcription box is the
// browser's undo on that text and not an undo of the last pen stroke.
export default function useKeyboardShortcuts({ onUndo, onRedo, onToggleNotebook }) {
  useEffect(() => {
    const onKey = (event) => {
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
        event.target?.tagName
      );
      const chord = event.metaKey || event.ctrlKey;
      if (!chord || typing) return;

      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        onUndo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        onRedo();
      } else if (key === "b") {
        event.preventDefault();
        onToggleNotebook();
      }
    };
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, [onUndo, onRedo, onToggleNotebook]);
}
