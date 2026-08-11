export function safeHintResourceUrl(resource) {
  if (!resource) return null;
  try {
    const url = new URL(resource, globalThis.location?.href);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}
