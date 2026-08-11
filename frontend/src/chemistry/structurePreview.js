import DOMPurify from "dompurify";

const trustedPreviews = new WeakSet();

const SANITIZE_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed"],
  FORBID_ATTR: ["style"],
};

function sanitizeSvg(svg) {
  if (typeof svg !== "string" || !svg.trim()) return null;
  const sanitized = DOMPurify.sanitize(svg, SANITIZE_CONFIG);
  if (typeof sanitized !== "string" || !sanitized.trim()) return null;

  // RDKit's SVG is self-contained. Remove any reference that could make the
  // browser fetch or execute an external resource, including through a
  // fragment-style CSS URL. DOMPurify handles script/event attributes; this
  // hook closes the resource-loading part of the boundary.
  const template = globalThis.document?.createElement?.("template");
  if (!template) return null;
  template.innerHTML = sanitized;
  for (const element of template.content.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (
        (name === "href" || name === "xlink:href" || name === "src") &&
        !value.startsWith("#")
      ) {
        element.removeAttribute(attribute.name);
      }
      if (name === "style" || value.includes("url(")) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return template.innerHTML;
}

// Only responses from the application's RDKit rendering path are wrapped for
// display. Sanitization happens before the object enters the WeakSet, so
// provenance is an additional guard rather than the SVG security boundary.
export function trustedStructurePreview(response) {
  const svg = sanitizeSvg(response?.svg);
  if (!svg) return null;

  const preview = Object.freeze({
    svg,
    formula: response.formula ?? null,
    generic: Boolean(response.generic),
  });
  trustedPreviews.add(preview);
  return preview;
}

export { sanitizeSvg };

export function isTrustedStructurePreview(preview) {
  return Boolean(
    preview &&
      typeof preview === "object" &&
      trustedPreviews.has(preview) &&
      typeof preview.svg === "string" &&
      preview.svg.length > 0
  );
}
