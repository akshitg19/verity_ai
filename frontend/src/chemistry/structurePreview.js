export const RDKitPreviewSource = "rdkit-render-endpoint";

// Only responses from the application's RDKit rendering path are wrapped for
// display. This keeps the dangerouslySetInnerHTML trust boundary explicit:
// the SVG is not accepted directly from a model or unchecked student text.
export function trustedStructurePreview(response) {
  if (!response?.svg) return null;

  return {
    svg: response.svg,
    formula: response.formula ?? null,
    generic: Boolean(response.generic),
    source: RDKitPreviewSource,
  };
}

export function isTrustedStructurePreview(preview) {
  return Boolean(
    preview?.svg && preview.source === RDKitPreviewSource
  );
}
