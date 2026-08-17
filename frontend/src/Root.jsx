import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import Landing from "./landing/Landing";
import GoogleIdentityBoundary from "./auth/GoogleIdentityBoundary";
import useRoute from "./router";
import useTheme from "./useTheme";
import { useEffect } from "react";

// The three routes. The theme hook lives here rather than inside each page so
// that switching between the landing page and the workspace does not remount
// it, which would drop the preference for a frame.
export default function Root() {
  const route = useRoute();
  const theme = useTheme();

  useEffect(() => {
    // No em dashes. Standing rule in this repo for anything a student reads,
    // and a browser tab is read more often than most of the app.
    document.title = route === "/"
      ? "verity.ai: homework, thought through"
      : route === "/math"
      ? "Math workspace: verity.ai"
      : "Chemistry workspace: verity.ai";
  }, [route]);

  // Wrapping both routes, because a crash on the landing page and a crash in
  // the workspace are equally invisible without it.
  return (
    <ErrorBoundary>
      {route === "/" ? (
        <Landing theme={theme} />
      ) : (
        <GoogleIdentityBoundary>
          <App theme={theme} subject={route === "/math" ? "math" : "chemistry"} />
        </GoogleIdentityBoundary>
      )}
    </ErrorBoundary>
  );
}
