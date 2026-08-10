import { COLORS, RADIUS, SHADOW, SUBJECTS, SURFACES } from "../theme";
import Logo from "../components/Logo";
import { navigate } from "../router";
import NotebookMock from "./NotebookMock";

const MAX_WIDTH = 1120;

const PROPERTIES = [
  {
    glyph: "✎",
    title: "Live, on the page",
    body:
      "Feedback arrives while the student is still writing, from the strokes themselves. Not from a photo of finished work, and not from a chat window that never sees the page.",
  },
  {
    glyph: "⌖",
    title: "Precise about where",
    body:
      "It flags the first line where the reasoning broke, and it tells a proven mistake apart from a step it could not verify. It never accuses a student of an error it merely failed to understand.",
  },
  {
    glyph: "◷",
    title: "Teaches, step by step",
    body:
      "Three levels of help. What went wrong on this line, a different problem worked in full, then your own step reasoned through with you.",
  },
];

const STACK = [
  {
    heading: "Recognition",
    items: ["Gemini 2.5 Flash", "Vertex AI", "Application Default Credentials"],
  },
  {
    heading: "Deterministic judges",
    items: ["RDKit", "SymPy", "Exact rational balancer", "OPSIN"],
  },
  {
    heading: "Backend",
    items: ["FastAPI", "Python 3.11", "Pydantic", "574 tests"],
  },
  {
    heading: "Frontend",
    items: ["React", "Vite", "Canvas + Pointer Events", "Vitest"],
  },
  {
    heading: "Runs on",
    items: ["Cloud Run", "Vercel", "One container, one URL"],
  },
];

const SUBJECT_AREAS = [
  {
    heading: "Chemistry",
    body: "Six subjects, eleven judges, all reachable.",
    items: [
      "Formulas, moles and stoichiometry",
      "Equations, balancing and net ionic",
      "Redox and electrochemistry",
      "Solutions, acids, bases and buffers",
      "Structure, bonding and isomers",
      "Organic groups, naming and reactions",
    ],
    accent: SUBJECTS.chemistry.accent,
    tint: SUBJECTS.chemistry.accentLight,
    route: "/chemistry",
  },
  {
    heading: "Math",
    body: "Step-by-step algebra, checked exactly.",
    items: [
      "Linear equations, term by term",
      "Sign, distribution and division errors named",
      "Every verdict proven by SymPy",
      "Trigonometry, calculus and geometry next",
    ],
    accent: SUBJECTS.math.accent,
    tint: SUBJECTS.math.accentLight,
    route: "/math",
  },
];

const AUDIENCES = [
  {
    who: "Students",
    body:
      "Write homework by hand, the way you already do. Find out which line broke while you can still remember what you were thinking, instead of the next morning in red pen.",
  },
  {
    who: "Teachers",
    body:
      "A student who uses this still has to do the work. Every verdict says which engine decided it, so a proven check never looks the same as a guess.",
  },
  {
    who: "Tutors",
    body:
      "See where a student's method goes wrong, not just that their final answer is off. The mistake has a line number and a name.",
  },
];


function Section({ children, style }) {
  return (
    <section style={{ padding: "0 24px", ...style }}>
      <div style={{ maxWidth: MAX_WIDTH, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

function Eyebrow({ children }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        color: COLORS.muted,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function Heading({ children, style }) {
  return (
    <h2
      style={{
        margin: 0,
        fontSize: "clamp(26px, 3.4vw, 38px)",
        lineHeight: 1.15,
        letterSpacing: -0.5,
        color: COLORS.text,
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

function PrimaryButton({ children, onClick, accent = COLORS.primary, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "15px 28px",
        background: accent,
        color: "#fff",
        border: "none",
        borderRadius: RADIUS.pill,
        fontSize: 16,
        fontWeight: 700,
        fontFamily: "sans-serif",
        cursor: "pointer",
        boxShadow: SHADOW.float,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export default function Landing({ theme }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.background,
        fontFamily: "sans-serif",
        color: COLORS.text,
      }}
    >
      {/* ---------------------------------------------------------- header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div
          style={{
            maxWidth: MAX_WIDTH,
            margin: "0 auto",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Logo size={34} accent={COLORS.primary} radius={9} />
          <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: -0.2 }}>
            verity.ai
          </span>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              title="Change theme"
              aria-label="Change theme"
              onClick={theme.cycle}
              style={{
                width: 38,
                height: 38,
                display: "grid",
                placeItems: "center",
                background: COLORS.surface,
                color: COLORS.text,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.md,
                fontSize: 16,
                cursor: "pointer",
              }}
            >
              {theme.preference === "dark" ? "☾" : theme.preference === "light" ? "☀" : "◐"}
            </button>
            <PrimaryButton
              onClick={() => navigate("/chemistry")}
              style={{ padding: "10px 20px", fontSize: 14, boxShadow: "none" }}
            >
              Try our product now
            </PrimaryButton>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ hero */}
      <Section style={{ paddingTop: 72, paddingBottom: 64 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 48,
            alignItems: "center",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(38px, 5.6vw, 62px)",
                lineHeight: 1.04,
                letterSpacing: -1.6,
              }}
            >
              Homework that tells you
              <br />
              <span style={{ color: COLORS.primary }}>which line broke.</span>
            </h1>
            <p
              style={{
                marginTop: 22,
                marginBottom: 0,
                fontSize: "clamp(16px, 1.6vw, 19px)",
                lineHeight: 1.6,
                color: COLORS.muted,
                maxWidth: 520,
              }}
            >
              Write your working by hand with a stylus, exactly as you would on
              paper. As you finish each line, verity.ai reads it, checks it, and
              marks the first place the reasoning broke. Then it teaches you
              through that step.
            </p>

            <div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", gap: 12 }}>
              <PrimaryButton onClick={() => navigate("/chemistry")} accent={SUBJECTS.chemistry.accent}>
                Try chemistry
              </PrimaryButton>
              <PrimaryButton onClick={() => navigate("/math")} accent={SUBJECTS.math.accent}>
                Try math
              </PrimaryButton>
            </div>
            <div style={{ marginTop: 14, fontSize: 13, color: COLORS.muted }}>
              Free, nothing to install, works in a browser on a tablet.
            </div>
          </div>

          <div style={{ display: "grid", placeItems: "center" }}>
            <NotebookMock />
          </div>
        </div>
      </Section>

      {/* --------------------------------------------------------- problem */}
      <Section
        style={{
          paddingTop: 56,
          paddingBottom: 56,
          background: COLORS.surface,
          borderTop: `1px solid ${COLORS.border}`,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <Eyebrow>The gap</Eyebrow>
        <Heading style={{ maxWidth: 760 }}>
          Answer checkers tell you that you are wrong. Solvers tell you
          everything. Neither tells you where you went wrong.
        </Heading>
        <p
          style={{
            marginTop: 18,
            marginBottom: 0,
            maxWidth: 760,
            fontSize: 17,
            lineHeight: 1.65,
            color: COLORS.muted,
          }}
        >
          Photomath and its peers hand over the full solution, which is why
          schools ban them. Chat tutors never see the written page at all. A
          marked homework sheet comes back a day later, long after the thinking
          has gone. Nobody today can look at a student's page and say: your
          mistake is on line 3, and it is a sign error.
        </p>
      </Section>

      {/* ------------------------------------------------------ properties */}
      <Section style={{ paddingTop: 64, paddingBottom: 64 }}>
        <Eyebrow>How it works</Eyebrow>
        <Heading style={{ marginBottom: 36 }}>Three things it does differently</Heading>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 20,
          }}
        >
          {PROPERTIES.map((property) => (
            <div
              key={property.title}
              style={{
                padding: 26,
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.xl,
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  display: "grid",
                  placeItems: "center",
                  borderRadius: RADIUS.md,
                  background: COLORS.primaryLight,
                  color: COLORS.primary,
                  fontSize: 20,
                  marginBottom: 16,
                }}
              >
                {property.glyph}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                {property.title}
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.6, color: COLORS.muted }}>
                {property.body}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* --------------------------------------------------------- subjects */}
      <Section style={{ paddingTop: 8, paddingBottom: 64 }}>
        <Eyebrow>What it covers</Eyebrow>
        <Heading style={{ marginBottom: 36 }}>Pick a subject and start writing</Heading>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 20,
          }}
        >
          {SUBJECT_AREAS.map((area) => (
            <div
              key={area.heading}
              style={{
                padding: 30,
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.xl,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  alignSelf: "flex-start",
                  padding: "5px 12px",
                  borderRadius: RADIUS.pill,
                  background: area.tint,
                  color: area.accent,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  marginBottom: 16,
                }}
              >
                {area.heading}
              </div>
              <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 18 }}>
                {area.body}
              </div>
              <ul
                style={{
                  margin: 0,
                  marginBottom: 26,
                  padding: 0,
                  listStyle: "none",
                  display: "grid",
                  gap: 9,
                }}
              >
                {area.items.map((item) => (
                  <li
                    key={item}
                    style={{
                      fontSize: 14.5,
                      color: COLORS.muted,
                      display: "flex",
                      gap: 10,
                      lineHeight: 1.45,
                    }}
                  >
                    <span style={{ color: area.accent, fontWeight: 700 }}>›</span>
                    {item}
                  </li>
                ))}
              </ul>
              <PrimaryButton
                onClick={() => navigate(area.route)}
                accent={area.accent}
                style={{ marginTop: "auto", alignSelf: "flex-start", boxShadow: "none" }}
              >
                Open {area.heading.toLowerCase()}
              </PrimaryButton>
            </div>
          ))}
        </div>
      </Section>

      {/* -------------------------------------------------------- audiences */}
      <Section
        style={{
          paddingTop: 60,
          paddingBottom: 60,
          background: COLORS.surface,
          borderTop: `1px solid ${COLORS.border}`,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <Eyebrow>Who it is for</Eyebrow>
        <Heading style={{ marginBottom: 34 }}>Built to survive a classroom</Heading>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 22,
          }}
        >
          {AUDIENCES.map((audience) => (
            <div key={audience.who}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  marginBottom: 9,
                  color: COLORS.primary,
                }}
              >
                {audience.who}
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.65, color: COLORS.muted }}>
                {audience.body}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ stack */}
      <Section style={{ paddingTop: 64, paddingBottom: 64 }}>
        <Eyebrow>Under the hood</Eyebrow>
        <Heading style={{ marginBottom: 14 }}>The stack</Heading>
        <p
          style={{
            marginTop: 0,
            marginBottom: 34,
            maxWidth: 720,
            fontSize: 16,
            lineHeight: 1.65,
            color: COLORS.muted,
          }}
        >
          A model reads the handwriting. It never decides whether the work is
          right. Where an exact engine can judge a step, the exact engine wins
          and every verdict carries the name of whichever one spoke.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 18,
          }}
        >
          {STACK.map((group) => (
            <div
              key={group.heading}
              style={{
                padding: 22,
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.lg,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: COLORS.muted,
                  marginBottom: 12,
                }}
              >
                {group.heading}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {group.items.map((item) => (
                  <span
                    key={item}
                    style={{
                      padding: "5px 11px",
                      borderRadius: RADIUS.pill,
                      background: COLORS.background,
                      border: `1px solid ${COLORS.border}`,
                      fontSize: 12.5,
                      color: COLORS.text,
                    }}
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* -------------------------------------------------------------- cta */}
      <Section style={{ paddingTop: 20, paddingBottom: 84 }}>
        <div
          style={{
            padding: "56px 34px",
            borderRadius: RADIUS.xl,
            background: SURFACES.sidebar,
            border: `1px solid ${COLORS.border}`,
            textAlign: "center",
          }}
        >
          <Heading style={{ marginBottom: 14 }}>Open it and write something</Heading>
          <p
            style={{
              margin: "0 auto 28px",
              maxWidth: 500,
              fontSize: 16,
              lineHeight: 1.6,
              color: COLORS.muted,
            }}
          >
            No account, no install. A stylus and a tablet browser is the whole
            setup.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <PrimaryButton onClick={() => navigate("/chemistry")} accent={SUBJECTS.chemistry.accent}>
              Try chemistry
            </PrimaryButton>
            <PrimaryButton onClick={() => navigate("/math")} accent={SUBJECTS.math.accent}>
              Try math
            </PrimaryButton>
          </div>
        </div>
      </Section>

      <footer
        style={{
          padding: "26px 24px",
          borderTop: `1px solid ${COLORS.border}`,
          background: COLORS.surface,
        }}
      >
        <div
          style={{
            maxWidth: MAX_WIDTH,
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            fontSize: 13,
            color: COLORS.muted,
          }}
        >
          <Logo size={22} accent={COLORS.muted} radius={6} />
          <span>verity.ai</span>
          <span style={{ marginLeft: "auto" }}>
            Built for the SAIL programme, 2026.
          </span>
        </div>
      </footer>
    </div>
  );
}
