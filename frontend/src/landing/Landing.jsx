import { useState } from "react";

import Logo from "../components/Logo";
import { COLORS, RADIUS, SHADOW, SUBJECTS } from "../theme";
import HintLadder from "./HintLadder";
import LandingWorkflowDemo from "./LandingWorkflowDemo";
import ScrollReveal from "./ScrollReveal";
import {
  CHEM_SUBJECTS,
  DEMOS,
  ENGINE_SPLIT,
  FAQ,
  LADDER,
  MATH_SUBJECTS,
  PILLARS,
  ROADMAP,
  STACK,
} from "./landingContent";
import "./landing-motion.css";

const MAX_WIDTH = 1180;
const grid = "repeat(auto-fit, minmax(min(100%, 260px), 1fr))";

function Section({ children, style, innerStyle, id, tinted }) {
  return (
    <section
      id={id}
      style={{
        padding: "0 24px",
        ...(tinted
          ? {
              background: COLORS.surface,
              borderTop: `1px solid ${COLORS.border}`,
              borderBottom: `1px solid ${COLORS.border}`,
            }
          : null),
        ...style,
      }}
    >
      <div style={{ maxWidth: MAX_WIDTH, margin: "0 auto", ...innerStyle }}>{children}</div>
    </section>
  );
}

function Button({ children, href, tone = "solid", style }) {
  const toneStyle = tone === "outline"
    ? { background: "transparent", color: COLORS.primary, border: `1px solid ${COLORS.primary}` }
    : { background: COLORS.primary, color: "#fff", border: "1px solid transparent" };
  return (
    <a href={href} className="landing-button" style={{
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

function SectionHeading({ children, kicker }) {
  return (
    <>
      {kicker && (
        <div style={{ marginBottom: 10, color: COLORS.primary, fontSize: 12.5, fontWeight: 800, letterSpacing: 0.9, textTransform: "uppercase" }}>
          {kicker}
        </div>
      )}
      <h2 style={{ margin: 0, fontSize: "clamp(26px, 3.2vw, 38px)", lineHeight: 1.12, letterSpacing: -0.9 }}>{children}</h2>
    </>
  );
}

function Lede({ children }) {
  return (
    <p style={{ maxWidth: 680, margin: "16px 0 0", color: COLORS.muted, fontSize: 16.5, lineHeight: 1.65 }}>
      {children}
    </p>
  );
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
        fontSize: 16.5,
        fontWeight: 700,
        cursor: "pointer",
      }}>
        <span style={{ flex: 1 }}>{item.q}</span>
        <span aria-hidden="true" style={{ color: COLORS.primary, fontSize: 20 }}>{open ? "−" : "+"}</span>
      </button>
      {open && <p style={{ margin: 0, padding: "0 38px 20px 0", color: COLORS.muted, fontSize: 15.5, lineHeight: 1.7 }}>{item.a}</p>}
    </div>
  );
}

export default function Landing({ theme }) {
  const [openFaq, setOpenFaq] = useState(0);
  const chemTypes = CHEM_SUBJECTS.reduce((total, [, , count]) => total + count, 0);

  return (
    <div className="landing-motion-ready" style={{ minHeight: "100vh", overflowX: "hidden", color: COLORS.text, background: COLORS.background }}>
      {/* The bar runs the full width of the window. It used to be clamped to
          the same 1080px as the body copy, which left the wordmark floating
          in the middle of a wide screen instead of anchoring the page. */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: "color-mix(in srgb, var(--v-surface) 92%, transparent)",
        borderBottom: `1px solid ${COLORS.border}`,
        backdropFilter: "blur(14px)",
      }}>
        <div className="landing-header" style={{ minHeight: 78, padding: "10px clamp(20px, 4vw, 46px)", display: "flex", alignItems: "center", gap: 28 }}>
          <a href="/" aria-label="verity.ai home" style={{ display: "flex", textDecoration: "none" }}>
            <Logo size={46} showWordmark showTagline />
          </a>
          <nav className="landing-nav" aria-label="Main navigation" style={{ display: "flex", gap: 24 }}>
            <a href="#how" style={{ color: COLORS.text, textDecoration: "none", fontSize: 15 }}>How it works</a>
            <a href="#engines" style={{ color: COLORS.text, textDecoration: "none", fontSize: 15 }}>What decides</a>
            <a href="#hints" style={{ color: COLORS.text, textDecoration: "none", fontSize: 15 }}>Hints</a>
            <a href="#coverage" style={{ color: COLORS.text, textDecoration: "none", fontSize: 15 }}>Subjects</a>
            <a href="#next" style={{ color: COLORS.text, textDecoration: "none", fontSize: 15 }}>What is next</a>
            <a href="#faq" style={{ color: COLORS.text, textDecoration: "none", fontSize: 15 }}>FAQ</a>
          </nav>
          <button type="button" title="Change theme" aria-label="Change theme" onClick={theme.cycle} style={{
            width: 44,
            height: 44,
            marginLeft: "auto",
            flexShrink: 0,
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
          <div className="landing-header__cta" style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <Button href="/math" tone="outline" style={{ padding: "10px 16px" }}>Open Math</Button>
            <Button href="/chemistry" style={{ padding: "10px 16px" }}>Open Chemistry</Button>
          </div>
        </div>
      </header>

      {/* --- hero ---------------------------------------------------------- */}
      <Section style={{ paddingTop: 76, paddingBottom: 60 }}>
        <div className="landing-hero-grid">
          <ScrollReveal variant="left">
            <div className="landing-eyebrow">
              <span aria-hidden="true">●</span>
              Real time handwriting, one of a kind
            </div>
            <h1 style={{ margin: 0, fontSize: "clamp(44px, 6.8vw, 76px)", lineHeight: 0.96, letterSpacing: -2.6 }}>
              Think it through.
            </h1>
            <p style={{ maxWidth: 640, margin: "26px 0 0", color: COLORS.text, fontSize: "clamp(18px, 2.1vw, 21px)", lineHeight: 1.55, fontWeight: 500 }}>
              A handwriting aware tutor that reads your work as you write it, checks
              it against engines that compute the answer rather than guess at it,
              and helps you work through the step you are stuck on.
            </p>
            <p style={{ maxWidth: 620, margin: "18px 0 0", color: COLORS.muted, fontSize: 17, lineHeight: 1.65 }}>
              Middle school and high school maths and chemistry. Write on a tablet
              with a stylus the way you would on paper. It nudges you in the right
              direction and never solves it for you.
            </p>
            <div style={{ marginTop: 30, display: "flex", flexWrap: "wrap", gap: 12 }}>
              <Button href="/math">Open Math</Button>
              <Button href="/chemistry" tone="outline">Open Chemistry</Button>
            </div>
            <p style={{ margin: "22px 0 0", color: COLORS.muted, fontSize: 14 }}>
              Nothing to type. Nothing to photograph. No sign-in.
            </p>
          </ScrollReveal>
          <ScrollReveal variant="right" delay={110}>
            <LandingWorkflowDemo demo={DEMOS[0]} />
          </ScrollReveal>
        </div>
      </Section>

      {/* --- the three properties ------------------------------------------ */}
      <Section tinted style={{ paddingTop: 64, paddingBottom: 64 }}>
        <ScrollReveal>
          <SectionHeading kicker="Why it is different">
            Nobody today can tell a student
            <br />
            “your mistake is on line 3.”
          </SectionHeading>
          <Lede>
            Homework apps check the final answer, or hand over the whole solution,
            which is why schools ban them. Chat tutors never see your written work
            at all. These three properties are what make this a product rather than
            a feature, and none of them are traded away.
          </Lede>
        </ScrollReveal>
        <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: grid, gap: 24 }}>
          {PILLARS.map((pillar, index) => (
            <ScrollReveal className="landing-pillar" delay={index * 90} key={pillar.title}>
              <div className="landing-pillar__glyph" aria-hidden="true">{pillar.glyph}</div>
              <span className="landing-pillar__tag">{pillar.tag}</span>
              <h3 style={{ margin: "10px 0 10px", fontSize: 20.5, letterSpacing: -0.4 }}>{pillar.title}</h3>
              <p style={{ margin: 0, color: COLORS.muted, lineHeight: 1.68, fontSize: 15.5 }}>{pillar.body}</p>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* --- the walkthroughs ---------------------------------------------- */}
      <Section id="how" style={{ paddingTop: 76, paddingBottom: 76 }}>
        <ScrollReveal>
          <SectionHeading kicker="Four walkthroughs">Watch it read a line and mark it</SectionHeading>
          <Lede>
            Two maths, two chemistry. Every line, verdict and error message below is
            what the real engine returned for that problem, not an illustration of
            what it might say.
          </Lede>
        </ScrollReveal>
        <div className="landing-demo-grid">
          {DEMOS.map((demo, index) => (
            <ScrollReveal variant="scale" delay={index * 80} key={demo.id}>
              <LandingWorkflowDemo demo={demo} compact />
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* --- who decides ---------------------------------------------------- */}
      <Section id="engines" tinted style={{ paddingTop: 72, paddingBottom: 72 }}>
        <ScrollReveal>
          <SectionHeading kicker="The part that matters">
            AI reads. Engines judge.
          </SectionHeading>
          <Lede>
            We separated recognition from correctness. The model reads your
            handwriting, the deterministic engines decide whether you are right, and
            the model writes the explanation only after an engine has already
            decided. That ordering is the whole architecture, and it is why a
            hallucination cannot become a verdict.
          </Lede>
        </ScrollReveal>

        <div className="landing-split">
          <ScrollReveal variant="left" className="landing-split__card landing-split__card--reads">
            <h3>{ENGINE_SPLIT.reads.title}</h3>
            <ul>
              {ENGINE_SPLIT.reads.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <span className="landing-split__stamp">Gemini 2.5 Flash on Vertex AI</span>
          </ScrollReveal>

          <div className="landing-split__arrow" aria-hidden="true">
            <span />
            <strong>then</strong>
            <span />
          </div>

          <ScrollReveal variant="right" delay={90} className="landing-split__card landing-split__card--decides">
            <h3>{ENGINE_SPLIT.decides.title}</h3>
            <ul>
              {ENGINE_SPLIT.decides.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <span className="landing-split__stamp">SymPy · RDKit · exact linear algebra</span>
          </ScrollReveal>
        </div>

        <ScrollReveal delay={120} style={{ marginTop: 34, padding: "22px 24px", background: COLORS.background, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.lg }}>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.7 }}>
            <strong>Where nothing can prove a step</strong>, predicting a reaction
            product for instance, the model's verdict is shown labelled as a model
            verdict rather than dressed up as a proven one. If two independent reads
            disagree, the page asks you to confirm the line instead of guessing.
            Four outcomes, never three: correct, review this, we could not check
            this, and we could not read this. The last two are our limits, never
            your mistake.
          </p>
        </ScrollReveal>
      </Section>

      {/* --- the hint ladder ------------------------------------------------ */}
      <Section id="hints" style={{ paddingTop: 76, paddingBottom: 40 }}>
        <ScrollReveal>
          <SectionHeading kicker="The hint ladder">Diagnose, demonstrate, then do it with you</SectionHeading>
          <Lede>
            Three rungs, and each is a different kind of help rather than the same
            help worded more generously. It is the escalation a human tutor uses,
            and it stops before the top.
          </Lede>
        </ScrollReveal>
        <ScrollReveal variant="scale" delay={90} style={{ marginTop: 40 }}>
          <HintLadder />
        </ScrollReveal>
      </Section>

      {/* --- withholding ----------------------------------------------------- */}
      <Section style={{ paddingTop: 44, paddingBottom: 78 }}>
        <ScrollReveal variant="scale" className="landing-vault">
          <div className="landing-vault__body">
            <SectionHeading kicker="The guarantee">It knows the answer. It will not hand it to you.</SectionHeading>
            <p>
              The backend solves your problem completely, before it writes a single
              hint, and holds that solution server side in an object that no
              response the page receives is able to carry. That is deliberate: the
              guarantee is enforced by mechanism rather than by asking a model to be
              discreet.
            </p>
            <p>
              Every hint at levels 1 and 2 passes through one deterministic
              checkpoint that compares it against every form of the answer we can
              enumerate: at any precision, written as a fraction or a word, as a
              balanced equation, or as a structure that canonicalises to the same
              molecule. One chokepoint, one call site, so it can be audited by
              reading a single file.
            </p>
            <p className="landing-vault__honest">
              Stated as narrowly as we enforce it: <strong>the answer is never
              stated</strong>. Not “you could not possibly work it out”, which would
              not survive a sharp question from a teacher. Level 3 currently
              finishes the step it is working with you, including on a last step.
              That is a deliberate call, functionality first, and the machinery that
              withholds is still there, still tested, one flag away.
            </p>
          </div>
          <ul className="landing-vault__list">
            {[
              ["Answer vault", "Solved once at setup, held server side, never a field on any response"],
              ["Outbound redaction", "One deterministic checkpoint, never a model, on every hint that leaves"],
              ["Terminal step gate", "Built and tested, currently switched off behind one flag"],
              ["Escalation budget", "Level 3 metered per problem, counted on the server, not by the page"],
            ].map(([title, body]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{body}</span>
              </li>
            ))}
          </ul>
        </ScrollReveal>
      </Section>

      {/* --- subjects -------------------------------------------------------- */}
      <Section id="coverage" tinted style={{ paddingTop: 72, paddingBottom: 72 }}>
        <ScrollReveal>
          <SectionHeading kicker="Coverage">Six subjects each</SectionHeading>
          <Lede>
            Named the way students and teachers already name them. Chemistry is
            further ahead than maths on everything except the judge, with {chemTypes} question
            types you can pick directly.
          </Lede>
        </ScrollReveal>

        <div className="landing-coverage">
          {[
            ["math", "Math", MATH_SUBJECTS, "Deterministic verdicts over arithmetic and algebra today. Geometry proofs and statistics interpretation route to the model path, labelled."],
            ["chemistry", "Chemistry", CHEM_SUBJECTS, "All six reachable from the page, driving eleven endpoints, with the routing table served by the backend so the two cannot drift apart."],
          ].map(([id, title, subjects, blurb], index) => (
            <ScrollReveal as="article" variant="scale" delay={index * 110} key={id} className="landing-coverage__card">
              <header>
                <span className="landing-coverage__glyph" style={{ color: SUBJECTS[id].accent }}>{SUBJECTS[id].glyph}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{blurb}</p>
                </div>
              </header>
              <ol>
                {subjects.map(([name, detail, count]) => (
                  <li key={name}>
                    <strong>
                      {name}
                      {count ? <em>{count} question types</em> : null}
                    </strong>
                    <span>{detail}</span>
                  </li>
                ))}
              </ol>
              <Button href={`/${id}`} tone="outline" style={{ marginTop: 22, alignSelf: "flex-start" }}>Open {title}</Button>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* --- the workspace --------------------------------------------------- */}
      <Section style={{ paddingTop: 76, paddingBottom: 76 }}>
        <ScrollReveal>
          <SectionHeading kicker="The workspace">Somewhere to keep a term of homework</SectionHeading>
          <Lede>
            Notes, folders inside each subject, and pages as a strip of thumbnails.
            Built to be the app you keep your homework in, not a single canvas that
            grows forever. Work is saved in your browser and stays there.
          </Lede>
        </ScrollReveal>
        {/* Both workspaces, because the page gives the two subjects equal
            billing and showing only the maths one undercut that. */}
        <div className="landing-shots">
          {[
            ["/verity-workspace-showcase.jpg", "Math", "The ruled page, the recognised lines beside it, and the verdict panel.", "The verity.ai maths workspace: a ruled page with handwritten working, the recognised lines beside it, and the verdict panel"],
            ["/verity-chemistry-showcase.jpg", "Chemistry", "The same page, with the worksheet that fits the question on it.", "The verity.ai chemistry workspace, checking an answer against a deterministic verdict"],
          ].map(([src, label, caption, alt], index) => (
            <ScrollReveal as="figure" variant="scale" delay={index * 90} key={src} style={{ margin: 0 }}>
              <div className="landing-product-shot" style={{ overflow: "hidden", border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.xl, background: COLORS.surface, boxShadow: SHADOW.float }}>
                <img src={src} alt={alt} style={{ width: "100%", height: "auto", display: "block" }} />
              </div>
              <figcaption style={{ marginTop: 12, color: COLORS.muted, fontSize: 13.5 }}>
                <strong style={{ color: COLORS.text }}>{label}.</strong> {caption}
              </figcaption>
            </ScrollReveal>
          ))}
        </div>
      </Section>

      {/* --- tech stack ------------------------------------------------------- */}
      <Section tinted style={{ paddingTop: 72, paddingBottom: 72 }}>
        <ScrollReveal>
          <SectionHeading kicker="Built with">The stack, and why each piece is there</SectionHeading>
        </ScrollReveal>
        {/* One reveal around the whole table, not one per row. Per-row
            reveals left the last row sitting at opacity 0 until you scrolled
            past it, which read as an empty bordered strip hanging off the
            bottom of the table. */}
        <ScrollReveal className="landing-stack">
          {STACK.map(([piece, choice, reason]) => (
            <div className="landing-stack__row" key={piece}>
              <span className="landing-stack__piece">{piece}</span>
              <span className="landing-stack__choice">{choice}</span>
              <span className="landing-stack__reason">{reason}</span>
            </div>
          ))}
        </ScrollReveal>
      </Section>

      {/* --- roadmap ---------------------------------------------------------- */}
      <Section id="next" style={{ paddingTop: 76, paddingBottom: 76 }}>
        <ScrollReveal>
          <SectionHeading kicker="What is next">Where this goes</SectionHeading>
          <Lede>
            Labelled honestly. Nothing in this section is built yet, and saying so
            is worth more than a page that reads as though everything already ships.
          </Lede>
        </ScrollReveal>
        <div className="landing-roadmap">
          {ROADMAP.map((item, index) => (
            <ScrollReveal variant="scale" delay={index * 90} key={item.title} className="landing-roadmap__card">
              <div className="landing-roadmap__top">
                <span className="landing-roadmap__glyph" aria-hidden="true">{item.glyph}</span>
                <span className={`landing-roadmap__status landing-roadmap__status--${item.status.toLowerCase().replace(/\s+/g, "-")}`}>
                  {item.status}
                </span>
              </div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </ScrollReveal>
          ))}
        </div>
        <ScrollReveal delay={140} className="landing-goal">
          <strong>The test we hold every feature to</strong>
          <p>
            A teacher would let a student use this during homework, and the student
            would still have to think. Anything that fails that is out of scope, no
            matter how well it works.
          </p>
        </ScrollReveal>
      </Section>

      {/* --- faq --------------------------------------------------------------- */}
      <Section id="faq" tinted style={{ paddingTop: 76, paddingBottom: 76 }} innerStyle={{ maxWidth: 860 }}>
        <ScrollReveal>
          <SectionHeading kicker="FAQ">The questions we actually get asked</SectionHeading>
          <div style={{ marginTop: 26 }}>
            {FAQ.map((item, index) => <FaqItem key={item.q} item={item} open={openFaq === index} onToggle={() => setOpenFaq(openFaq === index ? -1 : index)} />)}
          </div>
        </ScrollReveal>
      </Section>

      {/* --- cta ---------------------------------------------------------------- */}
      <Section style={{ paddingTop: 76, paddingBottom: 78 }}>
        <ScrollReveal variant="scale" style={{ padding: "52px 28px", color: "#fff", textAlign: "center", background: "linear-gradient(135deg, var(--v-primary), var(--v-chem))", borderRadius: RADIUS.xl }}>
          <h2 style={{ margin: 0, fontSize: "clamp(28px, 4.2vw, 40px)", letterSpacing: -1 }}>Write one line and see.</h2>
          <p style={{ margin: "16px auto 0", maxWidth: 520, fontSize: 16.5, lineHeight: 1.6, opacity: 0.92 }}>
            {LADDER.length} rungs of help, {MATH_SUBJECTS.length + CHEM_SUBJECTS.length} subjects, and an engine that
            proves the verdict before you are told anything.
          </p>
          <div style={{ marginTop: 26, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 12 }}>
            <Button href="/math" style={{ background: "#fff", color: COLORS.primary }}>Open Math</Button>
            <Button href="/chemistry" style={{ background: "transparent", color: "#fff", borderColor: "rgba(255,255,255,.75)" }}>Open Chemistry</Button>
          </div>
        </ScrollReveal>
      </Section>

      <footer style={{ padding: "28px 24px", background: COLORS.surface, borderTop: `1px solid ${COLORS.border}` }}>
        <div style={{ maxWidth: MAX_WIDTH, margin: "0 auto", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 18 }}>
          <Logo size={34} showWordmark />
          <div style={{ marginLeft: "auto", display: "flex", gap: 20, fontSize: 14.5 }}>
            <a href="/math" style={{ color: COLORS.text }}>Math</a>
            <a href="/chemistry" style={{ color: COLORS.text }}>Chemistry</a>
            <a href="#faq" style={{ color: COLORS.text }}>FAQ</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
