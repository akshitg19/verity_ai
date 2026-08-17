export const MATH_TOPICS = [
  {
    id: "pre_algebra",
    label: "Pre-Algebra",
    glyph: "±",
    blurb: "Arithmetic, fractions, ratios, percents, exponents, roots, and basic expressions.",
    implemented: true,
  },
  {
    id: "algebra",
    label: "Algebra",
    glyph: "x",
    blurb: "Linear equations, expressions, and step-by-step equation solving.",
    implemented: true,
  },
  {
    id: "geometry",
    label: "Geometry",
    glyph: "△",
    blurb: "Angles, triangles, similarity, circles, area, volume, and coordinate geometry.",
    implemented: true,
  },
  {
    id: "trigonometry",
    label: "Trigonometry",
    glyph: "θ",
    blurb: "Unit circle, identities, equations, and triangle relationships.",
    implemented: true,
  },
  {
    id: "statistics",
    label: "Statistics & Probability",
    glyph: "σ",
    blurb: "Descriptive statistics, probability, distributions, inference, and regression.",
    implemented: true,
  },
  {
    id: "calculus",
    label: "Calculus",
    glyph: "∫",
    blurb: "Limits, derivatives, applications, and integrals.",
    implemented: true,
  },
];

export const MATH_TOPIC_BY_ID = Object.fromEntries(
  MATH_TOPICS.map((topic) => [topic.id, topic])
);