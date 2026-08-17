export const STORY_SCENES = Object.freeze([
  {
    id: "math",
    eyebrow: "Math reasoning",
    title: "Follow the logic, not only the final answer.",
    copy: "Lines stay ordered so Verity can point to the first algebra step that changed the result.",
    status: "SymPy · first-break feedback",
    image: "/verity-workspace-showcase.jpg",
    alt: "The real Verity Math workspace with vector recognition and line-by-line controls",
  },
  {
    id: "chemistry",
    eyebrow: "Chemistry depth",
    title: "Use the worksheet that fits the chemistry.",
    copy: "Move from molar mass and stoichiometry to balancing, redox, structures, and naming without forcing every problem into one form.",
    status: "Gemini recognition · chemistry-specific judges",
    image: "/verity-chemistry-showcase.jpg",
    alt: "The real Verity Chemistry workspace checking a synthetic molar-mass answer",
  },
  {
    id: "feedback",
    eyebrow: "Targeted feedback",
    title: "Recognition reads. Deterministic engines decide.",
    copy: "A transcription is never rewritten to make the work correct. The recognized input, verdict, and next action stay visibly separate.",
    status: "Visible source · visible verdict",
    image: "/verity-chemistry-showcase.jpg",
    alt: "Verity Chemistry showing a correct deterministic verdict for a synthetic answer",
  },
]);
