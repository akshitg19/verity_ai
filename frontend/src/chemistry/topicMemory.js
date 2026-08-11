// Which topic the student had open, remembered the way the notebook
// remembers pages.
//
// Without this, leaving the workspace and coming back reset the topic to the
// default while the strokes stayed on the page, so a student who was balancing
// equations returned to a page of balancing work with "structure and bonding"
// selected. Picking their real topic back then counted as switching topic,
// which resets the problem and threw the work away. Remembering the choice
// removes the whole sequence rather than patching the reset at the end of it.

import { TOPICS } from "./topics";

export const TOPIC_STORAGE_KEY = "verity.chemistry.topic.v1";

export const emptyValues = (type) =>
  Object.fromEntries(
    type.fields.map((field) => [
      field.name,
      field.type === "select" ? field.options[0] : "",
    ])
  );

const FALLBACK = { topicId: "structure", typeId: null, values: null };

export function readStoredTopic(storage = globalThis.localStorage) {
  try {
    const stored = JSON.parse(storage?.getItem(TOPIC_STORAGE_KEY) ?? "null");
    const topic = TOPICS.find((entry) => entry.id === stored?.topicId);
    if (!topic) return FALLBACK;

    const type = topic.types.find((entry) => entry.id === stored?.typeId);
    if (!type) return { topicId: topic.id, typeId: null, values: null };

    // Only the fields this type actually has, so a value stored against an
    // older shape of the form cannot come back as a phantom field.
    const values = { ...emptyValues(type) };
    for (const field of type.fields) {
      const value = stored?.values?.[field.name];
      if (typeof value === "string") values[field.name] = value;
    }
    return { topicId: topic.id, typeId: type.id, values };
  } catch {
    return FALLBACK;
  }
}

export function rememberTopic(
  topicId,
  typeId,
  values,
  storage = globalThis.localStorage
) {
  try {
    storage?.setItem(
      TOPIC_STORAGE_KEY,
      JSON.stringify({ topicId, typeId, values })
    );
  } catch {
    // Same bargain as the notebook: losing the memory of a choice must never
    // stop the choice from working now.
  }
}
