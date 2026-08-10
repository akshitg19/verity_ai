const trustedPreviews = new WeakSet();

// Only responses from the application's RDKit rendering path are wrapped for
// display. This keeps the dangerouslySetInnerHTML trust boundary explicit:
// the SVG is not accepted directly from a model or unchecked student text.
export function trustedStructurePreview(response) {
  if (!response?.svg) return null;

  const preview = Object.freeze({
    svg: response.svg,
    formula: response.formula ?? null,
    generic: Boolean(response.generic),
  });
  trustedPreviews.add(preview);
  return preview;
}

export function isTrustedStructurePreview(preview) {
  return Boolean(
    preview &&
      typeof preview === "object" &&
      trustedPreviews.has(preview) &&
      typeof preview.svg === "string" &&
      preview.svg.length > 0
  );
}
