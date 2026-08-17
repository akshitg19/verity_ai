import { useState } from "react";

import Logo from "../components/Logo";
import { COLORS, RADIUS, SUBJECTS } from "../theme";
import LandingProductStory from "./LandingProductStory";
import LandingWorkflowDemo from "./LandingWorkflowDemo";
import ScrollReveal from "./ScrollReveal";
import "./landing-motion.css";

const MAX_WIDTH = 1080;
const grid = "repeat(auto-fit, minmax(min(100%, 260px), 1fr))";

const BENEFITS = [
  ["Write by hand", "Use a stylus on a notebook page instead of translating every step into a form."],
  ["Find the first broken step", "Keep the work in order and focus attention on the first line that needs it."],
  ["Get targeted help", "Keep feedback tied to the student’s own work, with more detail only when requested."],
];

const STEPS = [
  ["1", "Write the problem and each step on the page."],
  ["2", "Finish a complete line, then choose Check line."],
  ["3", "Review the recognized text, verdict, and next hint."],
];

const FAQ = [
  {
    q: "What is ready for the showcase?",
    a: "The presenter-controlled Algebra path reads vector ink with MyScript Beta. The public deployed fallback, non-Algebra math, and Chemistry keep their existing Gemini handwriting path.",
  },
  {
    q: "Does recognition decide whether a step is correct?",
    a: "No. Recognition turns handwriting into text. Deterministic math and chemistry engines make the supported correctness decisions.",
  },
  {
    q: "What if the handwriting is misread?",
    a: "The recognized line is shown back to the student and can be corrected before it is treated as their intended work.",
  },
  {
    q: "Where are notebook pages saved?",
    a: "Notebook state is kept in the browser. A finished line is sent to the configured recognition service only when recognition is requested.",
  },
];

function Section({ children, style, innerStyle, id }) {
  return (
    <section id={id} style={{ padding: "0 24px", ...style }}>
      <div style={{ maxWidth: MAX_WIDTH, margin: "0 auto", ...innerStyle }}>{children}</div>
    </section>
  );
}

function Button({ children, href, tone = "solid", style }) {
  const toneStyle = tone === "outline"
    ? { background: COLORS.surface, color: COLORS.primary, border: `1px solid ${COLORS.primary}` }
    : { background: COLORS.primary, color: "#fff", border: "1px solid transparent" };
  return (
    <a href={href} style={{
      minHeight: 44,
      padding: "11px 21px",
      boxSizing: "border-box",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: RADIUS.md,
      fontSize: 14.5,
      fontWeight: 700,
      textDecoration: "none",
      ...toneStyle,
      ...style,
    }}>
      {children}
    </a>
  );
}

function SectionHeading({ children }) {
  return <h2 style={{ margin: 0, fontSize: "clamp(25px, 3vw, 34px)", lineHeight: 1.15, letterSpacing: -0.6 }}>{children}</h2>;
}

function FaqItem({ item, open, onToggle }) {
  return (
    <div style={{ borderBottom: `1px solid ${COLORS.border}` }}>
      <button type="button" aria-expanded={open} onClick={onToggle} style={{
        width: "100%",
        minHeight: 58,
        padding: "16px 0",
        display: "flex",
        alignItems: "center",
        gap: 16,
        color: COLORS.text,
        background: "transparent",
        border: 0,
        textAlign: "left",
        font: "inherit",
        fontSize: 16,
        fontWeight: 700,
        cursor: "pointer",
      }}>
        <span style={{ flex: 1 }}>{item.q}</span>
        <span aria-hidden="true" style={{ color: COLORS.primary, fontSize: 20 }}>{open ? "−" : "+"}</span>
      </button>
      {open && <p style={{ margin: 0, padding: "0 38px 18px 0", color: COLORS.muted, fontSize: 15, lineHeight: 1.65 }}>{item.a}</p>}
    </div>
  );
}

export default function Landing({ theme }) {
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <div className="landing-motion-ready" style={{ minHeight: "100vh", color: COLORS.text, background: COLORS.background }}>
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "color-mix(in srgb, var(--v-surface) 94%, transparent)",
        borderBottom: `1px solid ${COLORS.border}`,
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ maxWidth: MAX_WIDTH, minHeight: 64, margin: "0 auto", padding: "8px 24px", display: "flex", alignItems: "center", gap: 24 }}>
          <a href="/" aria-label="verity.ai home" style={{ display: "flex", textDecoration: "none" }}><Logo size={34} showWordmark /></a>
          <nav className="landing-nav" aria-label="Main navigation" style={{ display: "flex", gap: 20 }}>
            <a href="#how" style={{ color: COLORS.text, textDecoration: "none", fontSize: 14.5 }}>How it works</a>
            <a href="#coverage" style={{ color: COLORS.text, textDecoration: "none", fontSize: 14.5 }}>Subjects</a>
            <a href="#faq" style={{ color: COLORS.text, textDecoration: "none", fontSize: 14.5 }}>FAQ</a>
          </nav>
          <button type="button" title="Change theme" aria-label="Change theme" onClick={theme.cycle} style={{
            width: 44,
            height: 44,
            marginLeft: "auto",
            display: "grid",
            placeItems: "center",
            color: COLORS.muted,
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            cursor: "pointer",
          }}>
            {theme.preference === "dark" ? "☾" : theme.preference === "light" ? "☀" : "◐"}
          </button>
          <Button href="/math" style={{ padding: "10px 17px" }}>Open Math</Button>
        </div>
      </header>

      <Section style={{ paddingTop: 68, paddingBottom: 54 }}>
        <div className="landing-hero-grid">
          <ScrollReveal variant="left">
            <div style={{ marginBottom: 16, color: COLORS.primary, fontSize: 13, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase" }}>
              Handwritten work, useful feedback
            </div>
            <h1 style={{ margin: 0, fontSize: "clamp(42px, 6.5vw, 70px)", lineHeight: 0.98, letterSpacing: -2.4 }}>
              See where the work changed course.
            </h1>
            <p style={{ maxWidth: 620, margin: "24px 0 0", color: COLORS.muted, fontSize: "clamp(17px, 2vw, 20px)", lineHeight: 1.55 }}>
              Verity reads handwritten steps, checks supported reasoning, and keeps feedback attached to the line that needs it.
            </p>
            <div style={{ marginTop: 28, display: "flex", flexWrap: "wrap", gap: 12 }}>
              <Button href="/math">Try Math</Button>
              <Button href="/chemistry" tone="outline">Try Chemistry</Button>
            </div>
          </ScrollReveal>
          <ScrollReveal variant="right" delay={110}>
            <LandingWorkflowDemo />
          </ScrollReveal>
        </div>
      </Section>

      <Section style={{ paddingTop: 76, paddingBottom: 76, background: COLORS.surface, borderTop: `1px solid ${COLORS.border}`, borderBottom: `1px solid ${COLORS.border}` }}>
        <LandingProductStory />
      </Section>

      <Section style={{ paddingTop: 58, paddingBottom: 58 }}>
        <div style={{ display: "grid", gridTemplateColumns: grid, gap: 30 }}>
          {BENEFITS.map(([title, body], index) => <ScrollReveal className="landing-benefit" delay={index * 90} key={title}>
            <h2 style={{ margin: "0 0 8px", fontSize: 19 }}>{title}</h2>
            <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.6, fontSize: 15 }}>{body}</p>
          </ScrollReveal>)}
        </div>
      </Section>

      <Section id="how" style={{ paddingTop: 70, paddingBottom: 70 }}>
        <ScrollReveal><SectionHeading>Three deliberate steps</SectionHeading></ScrollReveal>
        <div style={{ marginTop: 32, display: "grid", gridTemplateColumns: grid, gap: 18 }}>
          {STEPS.map(([number, copy], index) => <ScrollReveal delay={index * 90} key={number} style={{ minHeight: 150, padding: 22, boxSizing: "border-box", background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg }}>
            <div style={{ color: COLORS.primary, fontSize: 13, fontWeight: 800 }}>STEP {number}</div>
            <p style={{ margin: "16px 0 0", fontSize: 16, lineHeight: 1.55 }}>{copy}</p>
          </ScrollReveal>)}
        </div>
      </Section>

      <Section id="coverage" style={{ paddingTop: 64, paddingBottom: 64, background: COLORS.surface, borderTop: `1px solid ${COLORS.border}`, borderBottom: `1px solid ${COLORS.border}` }}>
        <ScrollReveal><SectionHeading>Choose a workspace</SectionHeading></ScrollReveal>
        <div style={{ marginTop: 30, display: "grid", gridTemplateColumns: grid, gap: 22 }}>
          {[
            ["math", "Math", "Work line by line across supported topics. The showcase focuses on Algebra and labels its recognition source and latency in the toolbar.", ["Algebra", "Pre-Algebra", "Trigonometry", "Calculus"]],
            ["chemistry", "Chemistry", "Use chemistry-specific worksheets and deterministic judges while Gemini handles handwriting recognition.", ["Stoichiometry", "Balancing", "Structures", "Naming"]],
          ].map(([id, title, copy, capabilities], index) => <ScrollReveal as="article" variant="scale" delay={index * 110} key={id} style={{ padding: 28, display: "flex", flexDirection: "column", background: COLORS.background, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg }}>
            <div style={{ color: SUBJECTS[id].accent, fontSize: 22 }}>{SUBJECTS[id].glyph}</div>
            <h3 style={{ margin: "12px 0 8px", fontSize: 23 }}>{title}</h3>
            <p style={{ margin: "0 0 18px", color: COLORS.muted, lineHeight: 1.65, fontSize: 15 }}>{copy}</p>
            <div className="landing-capabilities" aria-label={`${title} capabilities`}>
              {capabilities.map((capability) => <span key={capability}>{capability}</span>)}
            </div>
            <Button href={`/${id}`} tone="outline" style={{ marginTop: "auto", alignSelf: "flex-start" }}>Open {title}</Button>
          </ScrollReveal>)}
        </div>
      </Section>

      <Section id="faq" style={{ paddingTop: 70, paddingBottom: 70 }} innerStyle={{ maxWidth: 760 }}>
        <ScrollReveal>
          <SectionHeading>Good to know</SectionHeading>
          <div style={{ marginTop: 22 }}>
            {FAQ.map((item, index) => <FaqItem key={item.q} item={item} open={openFaq === index} onToggle={() => setOpenFaq(openFaq === index ? -1 : index)} />)}
          </div>
        </ScrollReveal>
      </Section>

      <Section style={{ paddingBottom: 72 }}>
        <ScrollReveal variant="scale" style={{ padding: "42px 28px", color: "#fff", textAlign: "center", background: "linear-gradient(135deg, var(--v-primary), var(--v-chem))", borderRadius: RADIUS.xl }}>
          <h2 style={{ margin: 0, fontSize: "clamp(26px, 4vw, 36px)" }}>Start with one complete line.</h2>
          <div style={{ marginTop: 22, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 12 }}>
            <Button href="/math" style={{ background: "#fff", color: COLORS.primary }}>Open Math</Button>
            <Button href="/chemistry" style={{ background: "transparent", borderColor: "rgba(255,255,255,.75)" }}>Open Chemistry</Button>
          </div>
        </ScrollReveal>
      </Section>

      <footer style={{ padding: "24px", background: COLORS.surface, borderTop: `1px solid ${COLORS.border}` }}>
        <div style={{ maxWidth: MAX_WIDTH, margin: "0 auto", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 18 }}>
          <Logo size={30} showWordmark />
          <div style={{ marginLeft: "auto", display: "flex", gap: 18, fontSize: 14 }}>
            <a href="/math" style={{ color: COLORS.text }}>Math</a>
            <a href="/chemistry" style={{ color: COLORS.text }}>Chemistry</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
