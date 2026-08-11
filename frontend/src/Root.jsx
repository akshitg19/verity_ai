import App from "./App";
import Landing from "./landing/Landing";
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
    document.title = route === "/"
      ? "verity.ai — Homework, thought through"
      : route === "/math"
      ? "Math workspace — verity.ai"
      : "Chemistry workspace — verity.ai";
  }, [route]);

  if (route === "/") return <Landing theme={theme} />;
  return <App theme={theme} subject={route === "/math" ? "math" : "chemistry"} />;
}
