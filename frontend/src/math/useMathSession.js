import { useCallback, useEffect, useRef, useState } from "react";

import { openMathSession } from "../api";

export default function useMathSession({
  topic,
  problemText,
  pageScopeRef,
  onFailure,
}) {
  const [session, setSession] = useState(null);
  const sessionKeyRef = useRef(null);
  const sessionRequestId = useRef(0);
  const sessionAbortRef = useRef(null);
  const sessionInFlightRef = useRef(null);

  const cancelSession = useCallback(() => {
    sessionRequestId.current += 1;
    sessionAbortRef.current?.abort();
    sessionAbortRef.current = null;
    sessionInFlightRef.current = null;
    sessionKeyRef.current = null;
    setSession(null);
  }, []);

  const ensureSession = useCallback(
    async (problemOverride = null) => {
      const effectiveProblem = (problemOverride ?? problemText ?? "").trim();

      if (!topic || !effectiveProblem) {
        return null;
      }

      const payload = {
        topic,
        problem: effectiveProblem,
      };

      const key = JSON.stringify(payload);

      // Reuse the existing session only when it belongs to this exact
      // topic/problem pair.
      if (session && sessionKeyRef.current === key) {
        return session;
      }

      const requestPageId = pageScopeRef.current;
      const existing = sessionInFlightRef.current;

      // If an identical session request is already running for this page,
      // share that promise rather than opening a duplicate session.
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
          const created = await openMathSession(payload, {
            signal: abortController.signal,
          });

          if (
            id !== sessionRequestId.current ||
            requestPageId !== pageScopeRef.current
          ) {
            return null;
          }

          if (!created) return null;

          sessionKeyRef.current = key;
          setSession(created);

          return created;
        } catch (error) {
          if (
            id !== sessionRequestId.current ||
            requestPageId !== pageScopeRef.current
          ) {
            return null;
          }

          if (error.name === "AbortError") return null;

          onFailure?.(error);
          return null;
        } finally {
          if (sessionAbortRef.current === abortController) {
            sessionAbortRef.current = null;
          }

          if (sessionInFlightRef.current?.promise === promise) {
            sessionInFlightRef.current = null;
          }
        }
      })();

      sessionInFlightRef.current = {
        key,
        pageId: requestPageId,
        controller: abortController,
        promise,
      };

      return promise;
    },
    [onFailure, pageScopeRef, problemText, session, topic]
  );

  useEffect(
    () => () => {
      sessionAbortRef.current?.abort();
      sessionAbortRef.current = null;
      sessionInFlightRef.current = null;
    },
    []
  );

  return {
    session,
    ensureSession,
    cancelSession,
  };
}