export const WALKTHROUGHS = Object.freeze({
  math: {
    label: "Math",
    eyebrow: "Algebra walkthrough",
    title: "Follow one line from ink to feedback",
    prompt: "Solve for x",
    lines: ["2x + 3 = 11", "2x = 8", "x = 5"],
    stages: [
      ["Write", "Pen input · complete one line", "Ink stays responsive"],
      ["Recognize", "MyScript Beta · Vector · 272 ms rehearsal", "Transcription only"],
      ["Verify", "SymPy verdict · first break: line 3", "Reasoning stays deterministic"],
    ],
  },
  chemistry: {
    label: "Chemistry",
    eyebrow: "Chemistry walkthrough",
    title: "Check the equation with chemistry rules",
    prompt: "Balance the equation",
    lines: ["H₂ + O₂ → H₂O", "Hydrogen  2 = 2", "Oxygen  2 ≠ 1"],
    stages: [
      ["Write", "Worksheet input · one complete row", "Formula layout stays intact"],
      ["Recognize", "Gemini · Image recognition", "Transcription only"],
      ["Verify", "Balance judge · oxygen mismatch", "Atom counts stay deterministic"],
    ],
  },
});
