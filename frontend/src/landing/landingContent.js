// Every claim on the landing page, in one file.
//
// The rule for this file: nothing here is written to sound good. Each demo
// below was run through the real judge before it was written down, and each
// number is counted from the repo rather than estimated. Where something is
// not built or not measured, the copy says so, because "we have not measured
// that yet" is a better answer at a table full of CS people than a number
// somebody invented.
//
// The three properties in `final_tasks.md` are the messaging spine, in this
// order, on every surface: live on the page, precise about where, teaches up
// to the answer and never past it. Do not invent a fourth framing per section.

// --- the walkthroughs -------------------------------------------------------
//
// Four problems, two maths and two chemistry. Every line, verdict and flagged
// line number below is what the real judge returned:
//
//   /check           2x + 3 = 11        -> line 3 invalid, "algebraic"
//   /check topic=statistics  mean of... -> line 3 invalid, "statistics_error"
//   /chemistry/balance  C3H8 + O2 ...   -> line 2 invalid, atoms unbalanced
//   /chemistry/name  propan-2-ol        -> line 1 invalid, "wrong_name"
//
// If you change a line here, run it through the judge again first.

export const DEMOS = [
  {
    id: "algebra",
    subject: "math",
    eyebrow: "Algebra",
    title: "A sign of trouble on line 3",
    prompt: "Solve for x",
    engine: "SymPy",
    handwriting: true,
    lines: [
      { text: "2x + 3 = 11", state: "valid" },
      { text: "2x = 8", state: "valid" },
      { text: "x = 5", state: "invalid" },
    ],
    stages: [
      ["Write", "One line, in your own handwriting", "Nothing typed, nothing photographed"],
      ["Read", "Handwriting to text, as you finish the line", "The model reads. It does not decide"],
      ["Check", "SymPy: line 3 does not follow from line 2", "Proven, not predicted"],
    ],
    verdict: "Line 3 is the first broken step. Lines 1 and 2 are left alone.",
  },
  {
    id: "statistics",
    subject: "math",
    eyebrow: "Statistics",
    title: "The working is right, the last line is not",
    prompt: "mean of 4, 8, 6, 10, 12",
    engine: "SymPy",
    handwriting: true,
    lines: [
      { text: "(4+8+6+10+12)/5", state: "valid" },
      { text: "40/5", state: "valid" },
      { text: "9", state: "invalid" },
    ],
    stages: [
      ["Write", "Set the problem up in your own notation", "Ruled page, stylus, same as paper"],
      ["Read", "Each finished line is read in real time", "Correct it if the reader got it wrong"],
      ["Check", "The arithmetic is exact, so the verdict is too", "40/5 is 8, and line 3 says 9"],
    ],
    verdict: "Two correct lines and one wrong answer is a different lesson from a wrong method, and the page can tell them apart.",
  },
  {
    id: "balancing",
    subject: "chemistry",
    eyebrow: "Equations and balancing",
    title: "Counted, not pattern matched",
    prompt: "Balance: C3H8 + O2 -> CO2 + H2O",
    engine: "Exact rational linear algebra",
    handwriting: false,
    lines: [
      { text: "C3H8 + 4O2 -> 3CO2 + 4H2O", state: "invalid", caption: "first attempt" },
      { text: "C3H8 + 5O2 -> 3CO2 + 4H2O", state: "valid", caption: "second attempt" },
    ],
    stages: [
      ["Write", "Write the equation out, or draw it", "Subscripts and coefficients side by side"],
      ["Read", "Formulas parsed atom by atom", "Nesting, charges and state symbols included"],
      ["Check", "Atom counts differ for: O", "The exact words the engine returns"],
    ],
    verdict: "A balancer that solves the system can say which element is short and by how much, rather than only that something is wrong.",
  },
  {
    id: "organic",
    subject: "chemistry",
    eyebrow: "Organic chemistry",
    title: "A drawing, read and compared as a structure",
    prompt: "Draw propan-2-ol",
    engine: "RDKit + OPSIN",
    handwriting: true,
    drawing: true,
    lines: [
      // The sketch is what the student drew. The text beside it is the SMILES
      // the reader returned, which is the point of the walkthrough: nobody
      // writes a SMILES, they draw, and this is the step in between.
      { text: "CCCO", state: "invalid", caption: "read as CCCO", sketch: "CCCO" },
      { text: "CC(C)O", state: "valid", caption: "read as CC(C)O", sketch: "CC(C)O" },
    ],
    stages: [
      ["Draw", "Sketch the skeleton the way you would in a workbook", "Implicit carbons, rings, double bonds"],
      ["Read", "The drawing becomes a structure", "Shown back as a picture so a misread is obvious"],
      ["Check", "Both structures reduced to canonical form and compared", "The OH is on the wrong carbon"],
    ],
    verdict: "The name is resolved to a structure and the drawing is resolved to a structure, so the comparison is exact rather than a guess about what was meant.",
  },
];

// --- the three properties ---------------------------------------------------

export const PILLARS = [
  {
    glyph: "◉",
    title: "Real time, on the page",
    body: "Feedback arrives while you are still writing, from the pen strokes themselves. Every competing step checker starts from a photo of finished work, and chat tutors never see the page at all. This is the part nothing else does.",
    tag: "One of a kind",
  },
  {
    glyph: "⌖",
    title: "Precise about where",
    body: "It marks the first line where the reasoning actually broke and leaves the rest of the page alone. A step it could not verify is shown as our limit, never as your mistake, so it cannot accuse you of an error it merely failed to understand.",
    tag: "Four outcomes, not two",
  },
  {
    glyph: "⚖",
    title: "Proven, not predicted",
    body: "Where an engine can prove a step, its verdict is final and the model's opinion is discarded before it reaches you. SymPy decides the maths, RDKit decides the structures, and balancing is solved with exact rational linear algebra.",
    tag: "No hallucinated verdicts",
  },
];

// --- who decides ------------------------------------------------------------

export const ENGINE_SPLIT = {
  reads: {
    title: "The model reads",
    items: [
      "Turns handwriting into text, and a drawing into a structure",
      "Writes the explanation, after the engine has already decided",
      "Proposes a verdict only where nothing can prove one, and it is labelled when it does",
    ],
  },
  decides: {
    title: "The engines decide",
    items: [
      "SymPy compares the two sides of a maths step exactly",
      "RDKit compares structures as canonical SMILES",
      "Balancing is exact rational linear algebra, solved rather than searched",
      "Where an engine can speak, the model's opinion is thrown away",
    ],
  },
};

// --- the hint ladder --------------------------------------------------------

export const LADDER = [
  {
    level: 1,
    name: "Where it went wrong",
    ask: "“Where did I go wrong?”",
    body: "Names the operation you actually performed on that line, and what to compare against what. Never a corrected value.",
    example: "On line 3 you divided both sides by 2. Compare each term on line 3 to the matching term on line 2, one of them did not come through the division.",
  },
  {
    level: 2,
    name: "A worked example",
    ask: "“Show me how this works”",
    body: "A different problem that mirrors yours with different numbers, worked end to end. Every line of it is checked by the same engine that checks your work before you ever see it.",
    example: "Solve 3x + 4 = 19. Subtract 4: 3x = 15. Divide by 3: x = 5. Every line verified.",
  },
  {
    level: 3,
    name: "Your own step",
    ask: "“Walk me through mine”",
    body: "Your actual line, reasoned through with you until that step is finished. This is the rung a tutor would sit on, and it is the last one.",
    example: "You have 2x = 8. Dividing both sides by 2 leaves x on the left. What does 8 divided by 2 give you?",
  },
];

// --- subjects ---------------------------------------------------------------
//
// The six names must read the same here, in the app, in the deck and in the
// README. These match `frontend/src/math/topics.js` exactly, which is the list
// a student actually sees in the subject picker. Changing one means changing
// both, plus the six-names note in `final_tasks.md`.

export const MATH_SUBJECTS = [
  ["Pre-Algebra", "Fractions, decimals, percents, ratio, order of operations, exponents and roots."],
  ["Algebra", "Linear equations and inequalities, systems, quadratics, polynomials, logs and exponentials."],
  ["Geometry", "Angle chasing, congruence and similarity, circles, area and volume, coordinate geometry."],
  ["Trigonometry", "Unit circle values, identities, equations over an interval, sine and cosine rules."],
  ["Statistics & Probability", "Descriptive statistics, probability, distributions, confidence intervals, regression."],
  ["Calculus", "Limits, derivatives through the chain and product rules, integrals by substitution."],
];

export const CHEM_SUBJECTS = [
  ["Formulas, moles and stoichiometry", "Molar mass, percent composition, empirical formulas, limiting reagent, yield.", 9],
  ["Equations and balancing", "Balancing by exact linear algebra, net ionic equations, spectator ions.", 2],
  ["Redox and electrochemistry", "Half reactions balanced on atoms and charge, oxidation states, cell potentials.", 3],
  ["Solutions, acids and bases", "Molarity, dilution, pH and pOH, Ka and Kb, buffers, ICE tables, titration.", 9],
  ["Molecular structure and bonding", "Hand-drawn structures read into SMILES and compared by canonical form, isomers.", 2],
  ["Organic", "Functional groups, IUPAC naming, drawing a named compound, product prediction.", 4],
];

// --- tech stack -------------------------------------------------------------

export const STACK = [
  ["App", "React + Vite, canvas element", "One codebase for iPad and Samsung. No app store, and a demo is a URL."],
  ["Ink", "Pointer Events API", "The web standard with full stylus data, pressure included."],
  ["Recognition", "Gemini 2.5 Flash on Vertex AI", "Reads rendered ink without training a model. It reads only."],
  ["Math verdicts", "SymPy", "Exact symbolic computation, not floating point comparison."],
  ["Structures", "RDKit", "Canonical SMILES comparison and substructure matching."],
  ["Balancing", "Exact rational linear algebra", "Balancing is solved, not searched."],
  ["IUPAC naming", "OPSIN", "Name to structure, then the same structural comparison."],
  ["Backend", "FastAPI + uvicorn", "Simple integration and an interactive /docs surface."],
];

// --- what is coming ---------------------------------------------------------
//
// Everything in this list is explicitly labelled as not built. It is on the
// page because a judge asking "where does this go next" deserves a real
// answer, and because shipping a roadmap as though it were a feature is the
// fastest way to lose the room.

export const ROADMAP = [
  {
    glyph: "◐",
    title: "Accounts",
    status: "In progress",
    body: "A sign-in, so a term of homework follows you between a tablet and a laptop. The identity boundary is already built and switched off, and work is currently stored in your own browser.",
  },
  {
    glyph: "▲",
    title: "Streaks and rewards",
    status: "Coming soon",
    body: "The thing Duolingo understood: showing up daily is the habit that matters. A streak for the days you practise, and progress you can see per subject rather than per problem.",
  },
  {
    glyph: "◈",
    title: "An agent that remembers your mistakes",
    status: "Coming soon",
    body: "Make the same sign error three times and the page should know. A retrieval layer over your own flagged lines, so hints get more specific to you and practice is aimed where you keep slipping, rather than at whatever came next in the book.",
  },
  {
    glyph: "◇",
    title: "More subjects",
    status: "Planned",
    body: "Physics is the likely seventh: formula manipulation and dimensional consistency are exactly checkable, and problem setup is the model path.",
  },
];

// --- faq --------------------------------------------------------------------

export const FAQ = [
  {
    q: "Does the AI decide whether my work is right?",
    a: "No, and this is the part worth being precise about. The model reads your handwriting and, once an engine has already decided, writes the explanation. Whether a step is correct is decided by SymPy, RDKit, or the balancer. Where one of those can prove a step, its verdict is final and the model's opinion is discarded before it reaches you. Where nothing can prove a step, reaction prediction for instance, the model's verdict is shown labelled as a model verdict, never as a proven one.",
  },
  {
    q: "Will it just give me the answer?",
    a: "No. The backend solves the problem before it writes a single hint and holds that solution server side, where no response the page receives is able to carry it. Level 1 and level 2 hints pass through one deterministic checkpoint that compares them against every form of the answer: at any precision, as a balanced equation, or as an equivalent structure. Level 3 currently finishes the step it is working with you, which is a deliberate product decision and is documented rather than hidden.",
  },
  {
    q: "What if it misreads my handwriting?",
    a: "The line it read is shown back to you and you can correct it before it is treated as your work. On a drawing, the structure is rendered back as a picture, because nobody can check a SMILES string by eye but anybody can check a picture. Recognition being wrong is a known failure and the page is built so you catch it, not so it is hidden.",
  },
  {
    q: "How does the worked example avoid being wrong?",
    a: "Every line of a generated worked example is run back through the same engine that checks your own work, before it is shown. An example that fails verification is regenerated. For maths, nothing unverified is ever rendered, because SymPy rejecting an algebra example means the arithmetic is wrong. For chemistry an example that fails twice is shown marked as unverified, which is a deliberate trade recorded in the repo.",
  },
  {
    q: "What does it actually cover?",
    a: "Six maths subjects and six chemistry subjects, with 29 chemistry question types you can pick from directly. Chemistry is further ahead than maths on everything except the judge. Elementary math and algebra are the most complete maths subjects today.",
  },
  {
    q: "Is it finished?",
    a: "No, and we would rather say so. The judges are covered by an automated suite that mocks the model, so what is proven is that a clean line reaches the right verdict. The measurement we still owe is handwriting: real problems, written by hand on a tablet, end to end. That corpus is being built and it is the thing that decides what we would demo without a net.",
  },
];
