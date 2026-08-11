import { useCallback, useEffect, useRef, useState } from "react";

import { openCurrentSession } from "./requestModel";

export default function useChemistrySession({
  topic,
  problemType,
  values,
  problemText,
  pageScopeRef,
  onFailure,
}) {
  const [session, setSession] = useState(null);
  const sessionRequestId = useRef(0);
  const sessionAbortRef = useRef(null);
  const sessionInFlightRef = useRef(null);

  const cancelSession = useCallback(() => {
    sessionRequestId.current += 1;
    sessionAbortRef.current?.abort();
    sessionAbortRef.current = null;
    sessionInFlightRef.current = null;
    setSession(null);
  }, []);

  const ensureSession = useCallback(async () => {
    if (session) return session;
    const payload = topic.session?.(problemType, values, problemText);
    if (!payload) return null;
    const requestPageId = pageScopeRef.current;
    const key = JSON.stringify(payload);
    const existing = sessionInFlightRef.current;
    if (
      existing &&
      existing.pageId === requestPageId &&
      existing.key === key &&
      !existing.controller.signal.aborted
    ) {
      return existing.promise;
    }

    existing?.controller.abort();
    const id = ++sessionRequestId.current;
    const abortController = new AbortController();
    sessionAbortRef.current = abortController;
    const promise = (async () => {
      try {
        const created = await openCurrentSession(
          payload,
          () => id === sessionRequestId.current && requestPageId === pageScopeRef.current,
          { signal: abortController.signal }
        );
        if (!created) return null;
        setSession(created);
        return created;
      } catch (error) {
        if (id !== sessionRequestId.current || requestPageId !== pageScopeRef.current) return null;
        if (error.name === "AbortError") return null;
        onFailure?.(error);
        return null;
      } finally {
        if (sessionAbortRef.current === abortController) sessionAbortRef.current = null;
        if (sessionInFlightRef.current?.promise === promise) sessionInFlightRef.current = null;
      }
    })();
    sessionInFlightRef.current = { key, pageId: requestPageId, controller: abortController, promise };
    return promise;
  }, [onFailure, pageScopeRef, problemText, problemType, session, topic, values]);

  useEffect(() => () => {
    sessionAbortRef.current?.abort();
    sessionAbortRef.current = null;
    sessionInFlightRef.current = null;
  }, []);

  return { session, ensureSession, cancelSession };
}
