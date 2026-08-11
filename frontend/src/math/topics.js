export const MATH_TOPICS = [
  {
    id: "pre_algebra",
    label: "Pre-Algebra",
    glyph: "±",
    blurb: "Arithmetic, fractions, ratios, percents, exponents, roots, and basic expressions.",
    implemented: false,
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
    implemented: false,
  },
  {
    id: "trigonometry",
    label: "Trigonometry",
    glyph: "θ",
    blurb: "Unit circle, identities, equations, and triangle relationships.",
    implemented: false,
  },
  {
    id: "statistics",
    label: "Statistics & Probability",
    glyph: "σ",
    blurb: "Descriptive statistics, probability, distributions, inference, and regression.",
    implemented: false,
  },
  {
    id: "calculus",
    label: "Calculus",
    glyph: "∫",
    blurb: "Limits, derivatives, applications, and integrals.",
    implemented: false,
  },
];

export const MATH_TOPIC_BY_ID = Object.fromEntries(
  MATH_TOPICS.map((topic) => [topic.id, topic])
);