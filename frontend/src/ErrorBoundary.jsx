import { Component } from "react";

// Why this exists, and why it shows the error text rather than hiding it.
//
// There was no error boundary anywhere in the app, so any throw during render
// unmounted the whole tree and left a white screen. On a laptop that is
// recoverable: open developer tools, read the error. On a tablet, which is the
// device this product is actually for, there is no console a student can
// reach, so a white screen is the entire diagnostic. "It does not work" was
// the most detail anyone could give, about a failure that had already told the
// browser exactly what was wrong.
//
// So this deliberately prints the message on screen. It is not pretty and it
// is not meant to be reassuring; it is meant to be readable out loud from a
// tablet to whoever is fixing it.

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // Kept so a device with a console still gets the full stack.
    console.error("verity.ai crashed during render", error, info);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="crash-screen" role="alert">
        <h1>Something broke on this page</h1>
        <p>
          The workspace stopped rather than showing you a half-drawn page. Your
          notes are stored on this device and are not affected by this.
        </p>
        <button type="button" onClick={() => globalThis.location?.reload()}>
          Reload the page
        </button>
        <p className="crash-screen-ask">
          If it keeps happening, send this text to whoever is fixing it:
        </p>
        <pre>
          {String(error?.message || error)}
          {info?.componentStack ? `\n${info.componentStack.trim()}` : ""}
        </pre>
      </div>
    );
  }
}
