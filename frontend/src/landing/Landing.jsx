import { useState } from "react";

import { COLORS, RADIUS, SHADOW, SUBJECTS } from "../theme";
import Logo, { LogoMark } from "../components/Logo";
import NotebookMock from "./NotebookMock";

const MAX_WIDTH = 1080;

const SUBJECT_AREAS = [
  {
    id: "chemistry",
    heading: "Chemistry",
    body: "Six subjects, checked by software that computes the chemistry rather than recognising a pattern.",
    items: [
      "Formulas, moles and stoichiometry",
      "Chemical equations and balancing",
      "Redox and electrochemistry",
      "Solutions, acids, bases and buffers",
      "Molecular structure and bonding",
      "Organic groups, naming and reactions",
    ],
    route: "/chemistry",
  },
  {
    id: "math",
    heading: "Math",
    body: "Every step compared exactly, with the kind of mistake named rather than a bare wrong.",
    items: [
      "Elementary math",
      "Algebra",
      "Geometry (coming next)",
      "Trigonometry (coming next)",
      "Statistics (coming next)",
      "Calculus (coming next)",
    ],
    route: "/math",
  },
];

const STEPS = [
  {
    number: "1",
    title: "Write it out by hand",
    body: "Open a page and work the problem with a stylus, the way you would on paper. Nothing to type, nothing to photograph.",
  },
  {
    number: "2",
    title: "Each line gets read and checked",
    body: "As you finish a line it is read and compared against the line before it. The first line where the reasoning broke is marked, and the rest are left alone.",
  },
  {
    number: "3",
    title: "Work through it with help",
    body: "Ask what went wrong, watch a different problem worked in full, or go through your own step. You choose how much help you want.",
  },
];

const FAQ = [
  {
    q: "Is it free?",
    a: "Yes. There is no account to make and nothing to install. Open the page on a tablet and start writing.",
  },
  {
    q: "What do I need to use it?",
    a: "A tablet with a stylus and a browser. It is built for pen input first, so an iPad with an Apple Pencil or a Galaxy Tab with an S Pen is the intended way to use it. A mouse works for trying it out.",
  },
  {
    q: "Which topics does it cover?",
    a: "Six chemistry subjects, from moles and stoichiometry through balancing, redox, solutions, structure and organic. Six math subjects: elementary math, algebra, geometry, trigonometry, statistics and calculus. Elementary math and algebra are checked today, and the other four are marked as coming until they are.",
  },
  {
    q: "How does it decide whether my work is right?",
    a: "Wherever an exact engine can decide a step, it does, and its verdict is final. Chemistry structures go through RDKit, equations through an exact balancer, and algebra through SymPy. A model reads your handwriting; it does not get to overrule the engine that can prove the answer.",
  },
  {
    q: "How are the hints made?",
    a: "They are written for the problem in front of you rather than picked from a list. The worked example at level two is generated and then run back through the same engine that checks your own work, line by line, before it is shown. An example that fails that check is never displayed.",
  },
  {
    q: "Will it just give me the answer?",
    a: "It is built to teach the step you are stuck on rather than hand over a finished solution. The help gets more specific as you ask for more, and it always starts with what went wrong rather than what to write.",
  },
  {
    q: "What if it misreads my handwriting?",
    a: "Every line it reads is shown back to you and can be corrected before anything is judged. When it is unsure, it says so instead of guessing, and a line it could not read is never reported as a mistake.",
  },
  {
    q: "Does my work leave the device?",
    a: "Your notes and pages are saved in your own browser. A line is sent for reading when you finish it, and nothing else is stored.",
  },
];

const FOOTER = [
  {
    heading: "Subjects",
    links: ["Chemistry", "Math", "All topics"],
  },
  {
    heading: "About",
    links: ["How it works", "Our approach", "Frequently asked questions"],
  },
  {
    heading: "Resources",
    links: ["For students", "For teachers", "For tutors"],
  },
  {
    heading: "Legal",
    links: ["Terms of use", "Privacy policy", "Accessibility", "Cookie notice"],
  },
];

function Section({ children, style, inner }) {
  return (
    <section style={{ padding: "0 24px", ...style }}>
      <div style={{ maxWidth: MAX_WIDTH, margin: "0 auto", ...inner }}>{children}</div>
    </section>
  );
}

function Button({ children, onClick, href, tone = "solid", style }) {
  const tones = {
    solid: { background: COLORS.primary, color: "#fff", border: "1px solid transparent" },
    outline: {
      background: "transparent",
      color: COLORS.primary,
      border: `1px solid ${COLORS.primary}`,
    },
    quiet: {
      background: COLORS.surface,
      color: COLORS.text,
      border: `1px solid ${COLORS.border}`,
    },
  };
  const props = {
    style: {
      padding: "13px 24px",
      borderRadius: RADIUS.md,
      fontSize: 15,
      fontWeight: 600,
      fontFamily: "inherit",
      cursor: "pointer",
      textDecoration: "none",
      display: "inline-block",
      ...tones[tone],
      ...style,
    },
  };
  return href ? <a href={href} {...props}>{children}</a> : <button type="button" onClick={onClick} {...props}>{children}</button>;
}

function SectionHeading({ children, style }) {
  return (
    <h2
      style={{
        margin: 0,
        fontSize: "clamp(24px, 3vw, 34px)",
        lineHeight: 1.2,
        letterSpacing: -0.4,
        fontWeight: 700,
        color: COLORS.text,
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

function FaqItem({ item, open, onToggle }) {
  return (
    <div style={{ borderBottom: `1px solid ${COLORS.border}` }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: "100%",
          padding: "20px 0",
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span style={{ flex: 1, fontSize: 17, fontWeight: 600, color: COLORS.text }}>
          {item.q}
        </span>
        <span
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: 26,
            height: 26,
            display: "grid",
            placeItems: "center",
            borderRadius: "50%",
            background: COLORS.primaryLight,
            color: COLORS.primary,
            fontSize: 15,
            transform: open ? "rotate(45deg)" : "none",
            transition: "transform 180ms ease",
          }}
        >
          +
        </span>
      </button>
      {open && (
        <div
          style={{
            paddingBottom: 22,
            paddingRight: 42,
            fontSize: 15.5,
            lineHeight: 1.65,
            color: COLORS.muted,
          }}
        >
          {item.a}
        </div>
      )}
    </div>
  );
}

export default function Landing({ theme }) {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div style={{ minHeight: "100vh", width: "100%", overflowX: "hidden", background: COLORS.background, color: COLORS.text }}>
      {/* ------------------------------------------------------------ header */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: COLORS.surface,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div
          style={{
            maxWidth: MAX_WIDTH,
            margin: "0 auto",
            padding: "10px 24px",
            display: "flex",
            alignItems: "center",
            gap: 24,
          }}
        >
          <a
            href="/"
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
            aria-label="verity.ai home"
          >
            <Logo size={34} showWordmark />
          </a>

          <nav
            className="landing-nav"
            style={{ display: "flex", gap: 20, alignItems: "center", marginLeft: 8 }}
          >
            {SUBJECT_AREAS.map((area) => (
              <a
                key={area.id}
                style={{
                  background: "none",
                  padding: 0,
                  fontSize: 15,
                  fontWeight: 500,
                  color: COLORS.text,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textDecoration: "none",
                }}
                href={area.route}
              >
                {area.heading}
              </a>
            ))}
            <a
              href="#faq"
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: COLORS.text,
                textDecoration: "none",
              }}
            >
              FAQ
            </a>
          </nav>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              title="Change theme"
              aria-label="Change theme"
              onClick={theme.cycle}
              style={{
                width: 36,
                height: 36,
                display: "grid",
                placeItems: "center",
                background: "transparent",
                color: COLORS.muted,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.md,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              {theme.preference === "dark" ? "☾" : theme.preference === "light" ? "☀" : "◐"}
            </button>
            <Button
              href="/chemistry"
              style={{ padding: "9px 18px", fontSize: 14 }}
            >
              Get started
            </Button>
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------------- hero */}
      <Section style={{ paddingTop: 76, paddingBottom: 72 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 310px), 1fr))",
            gap: 56,
            alignItems: "center",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(40px, 5.4vw, 60px)",
                lineHeight: 1.05,
                letterSpacing: -1.8,
                fontWeight: 700,
              }}
            >
              Think it through.
            </h1>
            <p
              style={{
                marginTop: 20,
                marginBottom: 0,
                fontSize: "clamp(17px, 1.7vw, 20px)",
                lineHeight: 1.6,
                color: COLORS.muted,
                maxWidth: 480,
              }}
            >
              Write your homework by hand and find out which line broke, while
              you still remember what you were thinking. verity.ai reads every
              step you write, marks the first one that does not follow, and
              helps you work it out yourself.
            </p>

            <div style={{ marginTop: 30, display: "flex", flexWrap: "wrap", gap: 12 }}>
              <Button href="/chemistry" style={{ padding: "14px 26px" }}>
                Get started with chemistry
              </Button>
              <Button
                tone="outline"
                href="/math"
                style={{ padding: "14px 26px" }}
              >
                Get started with math
              </Button>
            </div>
            <div style={{ marginTop: 16, fontSize: 14, color: COLORS.muted }}>
              Free. No account, nothing to install.
            </div>
          </div>

          <div style={{ display: "grid", placeItems: "center" }}>
            <NotebookMock />
          </div>
        </div>
      </Section>

      {/* --------------------------------------------------- explore content */}
      <Section
        style={{
          paddingTop: 64,
          paddingBottom: 64,
          background: COLORS.surface,
          borderTop: `1px solid ${COLORS.border}`,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <SectionHeading>Explore our content</SectionHeading>
        <p
          style={{
            marginTop: 12,
            marginBottom: 36,
            maxWidth: 620,
            fontSize: 16.5,
            lineHeight: 1.6,
            color: COLORS.muted,
          }}
        >
          Six subjects in chemistry and six in math. Everything without a
          "coming next" beside it is something the app can actually check
          today, rather than a heading with nothing behind it.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
            gap: 24,
          }}
        >
          {SUBJECT_AREAS.map((area) => (
            <div
              key={area.id}
              style={{
                padding: 28,
                background: COLORS.background,
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.lg,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ color: SUBJECTS[area.id].accent, fontSize: 20 }}>
                  {SUBJECTS[area.id].glyph}
                </span>
                <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{area.heading}</h3>
              </div>
              <p
                style={{
                  margin: "0 0 18px",
                  fontSize: 15,
                  lineHeight: 1.55,
                  color: COLORS.muted,
                }}
              >
                {area.body}
              </p>
              <ul style={{ margin: "0 0 24px", padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                {area.items.map((item) => (
                  <li
                    key={item}
                    style={{
                      display: "flex",
                      gap: 10,
                      fontSize: 15,
                      lineHeight: 1.45,
                      color: COLORS.text,
                    }}
                  >
                    <span style={{ color: SUBJECTS[area.id].accent, flexShrink: 0 }}>›</span>
                    {item}
                  </li>
                ))}
              </ul>
              <Button
                tone="outline"
                href={area.route}
                style={{ marginTop: "auto", alignSelf: "flex-start" }}
              >
                Start {area.heading.toLowerCase()}
              </Button>
            </div>
          ))}
        </div>
      </Section>

      {/* --------------------------------------------------------- how it works */}
      <Section style={{ paddingTop: 72, paddingBottom: 72 }}>
        <SectionHeading>How it works</SectionHeading>
        <div
          style={{
            marginTop: 34,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
            gap: 48,
            alignItems: "center",
          }}
        >
          <div style={{ display: "grid", gap: 26 }}>
            {STEPS.map((step) => (
              <div key={step.number} style={{ display: "flex", gap: 16 }}>
                <span
                  style={{
                    flexShrink: 0,
                    width: 34,
                    height: 34,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: "50%",
                    background: COLORS.primaryLight,
                    color: COLORS.primary,
                    fontWeight: 700,
                    fontSize: 15,
                  }}
                >
                  {step.number}
                </span>
                <div>
                  <div style={{ fontSize: 17.5, fontWeight: 700, marginBottom: 5 }}>
                    {step.title}
                  </div>
                  <div style={{ fontSize: 15.5, lineHeight: 1.6, color: COLORS.muted }}>
                    {step.body}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* The gradient panel, with the mark reversed out of it. */}
          <div
            style={{
              minHeight: 300,
              borderRadius: RADIUS.xl,
              display: "grid",
              placeItems: "center",
              padding: 32,
              background:
                "linear-gradient(150deg, var(--v-primary) 0%, var(--v-chem) 100%)",
              boxShadow: SHADOW.card,
              color: "#fff",
              textAlign: "center",
            }}
          >
            <div>
              <span style={{ color: "#fff", display: "inline-block" }}>
                <LogoMark size={72} strokeWidth={6} />
              </span>
              <div style={{ marginTop: 22, fontSize: 21, fontWeight: 700, lineHeight: 1.35 }}>
                The engine solves it first
              </div>
              <div
                style={{
                  marginTop: 10,
                  fontSize: 15,
                  lineHeight: 1.6,
                  opacity: 0.92,
                  maxWidth: 300,
                }}
              >
                Every verdict you see was decided by software that can prove the
                chemistry or the algebra, not guessed at. When nothing can prove
                a step, it says so instead of pretending.
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------- who for */}
      <Section
        style={{
          paddingTop: 64,
          paddingBottom: 64,
          background: COLORS.surface,
          borderTop: `1px solid ${COLORS.border}`,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <SectionHeading>Made to be allowed in class</SectionHeading>
        <div
          style={{
            marginTop: 30,
            display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 250px), 1fr))",
            gap: 28,
          }}
        >
          {[
            [
              "For students",
              "Find the line that broke while the problem is still in your head, instead of the next morning in red pen.",
            ],
            [
              "For teachers",
              "A student who uses this still has to do the work. Every verdict shows which engine decided it, so a proven check never looks like a guess.",
            ],
            [
              "For tutors",
              "See where a method goes wrong, not just that a final answer is off. The mistake has a line number and a name.",
            ],
          ].map(([who, body]) => (
            <div key={who}>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: COLORS.primary }}>
                {who}
              </div>
              <div style={{ fontSize: 15.5, lineHeight: 1.65, color: COLORS.muted }}>{body}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ----------------------------------------------------------------- faq */}
      <Section id="faq" style={{ paddingTop: 72, paddingBottom: 72 }} inner={{ maxWidth: 760 }}>
        <div id="faq" />
        <SectionHeading style={{ marginBottom: 8 }}>
          Frequently asked questions
        </SectionHeading>
        <div style={{ marginTop: 20 }}>
          {FAQ.map((item, index) => (
            <FaqItem
              key={item.q}
              item={item}
              open={openFaq === index}
              onToggle={() => setOpenFaq(openFaq === index ? -1 : index)}
            />
          ))}
        </div>
      </Section>

      {/* ----------------------------------------------------------------- cta */}
      <Section style={{ paddingBottom: 80 }}>
        <div
          style={{
            padding: "58px 32px",
            borderRadius: RADIUS.xl,
            background: "linear-gradient(150deg, var(--v-primary) 0%, var(--v-chem) 100%)",
            color: "#fff",
            textAlign: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "clamp(26px, 3vw, 34px)", fontWeight: 700 }}>
            Open a page and write something
          </h2>
          <p
            style={{
              margin: "14px auto 26px",
              maxWidth: 460,
              fontSize: 16.5,
              lineHeight: 1.6,
              opacity: 0.94,
            }}
          >
            A stylus and a browser is the whole setup.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Button
              href="/chemistry"
              style={{ background: "#fff", color: COLORS.primary, padding: "14px 26px" }}
            >
              Get started with chemistry
            </Button>
            <Button
              href="/math"
              style={{
                background: "transparent",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.7)",
                padding: "14px 26px",
              }}
            >
              Get started with math
            </Button>
          </div>
        </div>
      </Section>

      {/* -------------------------------------------------------------- footer */}
      <footer
        style={{
          borderTop: `1px solid ${COLORS.border}`,
          background: COLORS.surface,
          padding: "48px 24px 32px",
        }}
      >
        <div style={{ maxWidth: MAX_WIDTH, margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))",
              gap: 32,
              marginBottom: 40,
            }}
          >
            <div>
              <Logo size={32} showWordmark showTagline />
            </div>
            {FOOTER.map((group) => (
              <div key={group.heading}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.8,
                    textTransform: "uppercase",
                    color: COLORS.muted,
                    marginBottom: 12,
                  }}
                >
                  {group.heading}
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 9 }}>
                  {group.links.map((link) => (
                    <li key={link}>
                      <span style={{ fontSize: 14.5, color: COLORS.text }}>{link}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div
            style={{
              paddingTop: 22,
              borderTop: `1px solid ${COLORS.border}`,
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              fontSize: 13.5,
              color: COLORS.muted,
            }}
          >
            <span>verity.ai</span>
            <span style={{ marginLeft: "auto" }}>Built for the SAIL programme, 2026.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
