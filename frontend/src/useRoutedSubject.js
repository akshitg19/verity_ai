import { useEffect, useRef } from "react";

export default function useRoutedSubject({ notebook, subject }) {
  const routedSubjectRef = useRef(null);

  useEffect(() => {
    if (!notebook.hydrated) return;
    if (routedSubjectRef.current === subject) return;

    const subjectNote = notebook.folders[subject]?.[0];

    routedSubjectRef.current = subject;

    if (!subjectNote) {
      void notebook.createNote(subject);
      return;
    }

    if (notebook.activeNote.subject !== subject) {
      void notebook.openNote(subjectNote.id);
    }
  }, [
    notebook,
    notebook.activeNote.subject,
    notebook.createNote,
    notebook.folders,
    notebook.hydrated,
    notebook.openNote,
    subject,
  ]);
}