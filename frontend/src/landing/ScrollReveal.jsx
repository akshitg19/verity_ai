import { useEffect, useRef, useState } from "react";

function shouldRevealImmediately() {
  if (typeof window === "undefined") return true;
  if (!("IntersectionObserver" in window)) return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export default function ScrollReveal({
  as: Element = "div",
  children,
  className = "",
  delay = 0,
  style,
  variant = "rise",
}) {
  const elementRef = useRef(null);
  const [visible, setVisible] = useState(shouldRevealImmediately);

  useEffect(() => {
    if (visible) return undefined;
    const element = elementRef.current;
    if (!element) return undefined;

    const observer = new window.IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setVisible(true);
        observer.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <Element
      ref={elementRef}
      className={`scroll-reveal scroll-reveal--${variant}${visible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      style={{ "--reveal-delay": `${delay}ms`, ...style }}
    >
      {children}
    </Element>
  );
}
