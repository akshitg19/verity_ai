# Hand-testing log

What actually happened when a person wrote a question by hand and watched the
app answer it. One file per topic, kept so the demo can be built from questions
we have already seen work rather than from questions we hope will work.

This is a log, not a plan. `final_tasks.md` stays the source of truth for what
gets built; this folder only records what was observed.

```
testing/
  chemistry/
    equations-and-balancing.md    10 questions
    stoichiometry.md              10 questions
    solutions.md                  10 questions
    redox.md                      10 questions
    structure-and-bonding.md      10 questions
    organic.md                    10 questions
```

All sixty are locked as deterministic tests in
`backend/tests/test_chemistry_walkthrough.py` and
`backend/tests/test_balancing_walkthrough.py`, so the sheets cannot go stale
without CI saying so.

**The one finding that spans topics.** The numeric judges mark a line valid
when it matches *any* quantity in the correct working, which is right for a
middle line and wrong for the last one. A student who answers a pH question
with the pOH gets a tick. Nothing marks a line as the final answer. Full
write-up in `solutions.md`.

Ten questions per topic is the target. Each file holds the question exactly as
it was typed in, the lines exactly as they were written, what the app was
expected to say, what it actually said, and whether the hints were any good.

How to run one:

1. `backend/start-backend.ps1`, then `npm run dev` in `frontend/`.
2. Open the chemistry page, pick the subject and topic, type the problem in.
3. Write each working line by hand, one line per row, and let it read each one.
4. Fill in the result rows as you go. Write what happened, not what should
   have happened.

A question is only demo-safe once it has been run end to end twice, on the
tablet, with the same result both times.
