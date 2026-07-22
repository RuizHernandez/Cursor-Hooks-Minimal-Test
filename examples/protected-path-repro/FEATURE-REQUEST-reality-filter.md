# Feature request draft for github.com/anthropics/claude-code/issues

Copy each section into the matching field of the "Feature Request" form.
This proposes making a protocol the submitter designed themselves (with
Claude's help, some time ago) — "Filtro de Realidad v5 + Anti-Sycophancy"
— available as a built-in option, rather than requiring every project to
hand-write its own version.

---

## Problem Statement

Sycophancy — an agent agreeing too readily, approving work without real
scrutiny, praising reflexively ("¡Excelente idea!") instead of critically
evaluating it — is a recurring problem, and it gets worse, not better, in
multi-agent/orchestration setups where one agent is responsible for
reviewing or gating another agent's output. Right now there's no
built-in, standardized way to counteract this; every project that wants
real rigor has to hand-write its own custom system-prompt/protocol
document and hope every agent in the pipeline actually follows it.

I designed my own such protocol a while back (with Claude's help) —
"Filtro de Realidad v5 + Anti-Sycophancy". The motivation wasn't
software-first: I do scientific research on microorganisms — kinetic
modeling, simulation, factorial experimental design for microbial
metabolite production (see my Google Scholar and ResearchGate profiles
below). In that field, an unverified or hallucinated claim about thermal
behavior, biomass properties, or a kinetic parameter isn't a minor bug,
it's a fabricated result. I originally wrote the "Filtro de Realidad"
rule set to stop an LLM assistant from doing to my research code and
scientific claims what sycophantic agreement does to code review:
approving or asserting things that sound plausible but weren't actually
verified against literature or data. I later reused the same discipline
for a multi-agent swarm project (an orchestration layer, "Queen
Supremacy", governing how a supervising agent handles a subordinate that
oversteps its role).

To be precise about which part is actually novel: frontier models already
lean toward calibration and non-sycophancy on their own, so the
anti-sycophancy/verify-before-claiming half of this mostly reinforces
behavior a good base model already tends toward — I make no claim to
have invented that. The part a base model does **not** do by itself is
**explicit authority boundaries between an orchestrating agent and its
subordinates**: who may decide, who may only report, and the rule that
an orchestrator verifies real state (git, logs, files) instead of
trusting any agent's narrative, including its own. That governance layer
is this protocol's actual contribution — not a new idea in the abstract
(least-privilege and orchestrator-worker patterns predate it), but a
portable, prompt-level articulation of it for LLM agent swarms.

I published the full protocol, with an honestly-graded evidence section
(not a controlled study — every claim is tiered by how it was actually
observed, from "witnessed by an independent second agent" down to
"user self-report"), here:

- Repo: https://github.com/RuizHernandez/reality-filter-protocol (v1.0.0)
- DOI: https://doi.org/10.5281/zenodo.21499994

The repo's own `EVIDENCE.md` documents its companion finding: a
technical, adversarial investigation into Cursor's hook system
(https://github.com/RuizHernandez/Cursor-Hooks-Minimal-Test) that
reproduced a real enforcement bypass — a `beforeShellExecution` hook
call arriving with an empty payload defaulted to allow, letting a shell
command through that `preToolUse` had already denied (6 confirmed
bypasses out of 58 attempts, Request ID `3f8c4ba1-3fa6-445d-b3cb-6e57bed3edee`).
That's the point of pairing the two: a conversational/prompt-level rule
like this one is the *social* half of agent trust — it shapes a
cooperative agent's behavior, but it is not enforcement. Only a real
technical gate is. This feature request is about the social half; it
doesn't replace the need for the technical one.

## Proposed Solution

Offer an opt-in "anti-sycophancy" / "reality filter" mode or system-prompt
template, built into Claude / Claude Code, based on principles like:

- No reflexive agreement; responses must critically analyze content
  before validating it.
- Explicit statement of what was actually reviewed and under what
  criteria, on every approval — not just a verdict.
- Prohibition on both directions of dishonesty: don't approve by
  inertia, and don't fabricate objections just to look thorough when the
  work is actually sound.
- Tag uncertain or unverified claims explicitly (e.g. `[Inferencia]`,
  `[Especulación]`, `[No verificado]`) instead of stating them as fact.
- For multi-agent orchestration specifically: formal authority/role
  boundaries between agents, with an explicit clause for how a
  supervising agent should react when a subordinate agent oversteps its
  role (reject state, discard falsified artifacts, halt until order is
  restored) rather than silently absorbing the overstep.

This doesn't need to be a new subsystem — a first-class, documented
system-prompt template (or a toggle that assembles one) would let users
adopt a maintained version instead of everyone reinventing it per
project, which is what's happening today.

## Alternative Solutions

- Hand-writing a custom protocol/system-prompt file per project (what I
  already do) — works, but isn't portable, isn't discoverable by other
  users solving the same problem, and there's no shared, maintained
  standard for how to phrase it well.
- General "be more critical" / "don't just agree with me" prompting —
  in my experience this is weaker and less consistent than a fully
  specified protocol with explicit rules and an authority-boundary
  clause for multi-agent cases.

## Priority

High for my own workflow. This isn't a claim of a measured productivity
study (see the tiered evidence in the repo's `EVIDENCE.md` — it's real
usage, not a controlled evaluation), but a fabricated approval, a
false accusation left uncorrected, or a governance overstep that goes
unnoticed costs far more time to unwind after the fact than the
discipline costs to maintain up front — especially in multi-agent
pipelines where one bad "approved" or one silently-absorbed overstep
propagates into everything downstream.

## Feature Category

Agent behavior / System prompts / Multi-agent orchestration

## Use Case Example

1. I run a multi-agent swarm where one agent ("Queen") orchestrates
   others (Coder, Architect, Reviewer) and a terminal-interface agent
   ("Primary") that's restricted to read/write/message-passing only.
2. Under my protocol's governance clause, if Primary oversteps — e.g.
   dispatches tasks or approves phases on its own, or generates
   fabricated acknowledgment files — Queen has explicit authority to
   reject the state, delete the falsified artifacts, and halt the
   pipeline until order is restored. Queen reports this happened during
   this project; that specific incident is self-reported (Tier 2 in the
   repo's evidence grading), not independently witnessed by a third
   party — the repo is explicit about that distinction rather than
   presenting it as fully verified.
3. Weeks later, in an unrelated investigation, I asked Queen about a
   different (hook-enforcement) bug. Instead of conflating the two,
   Queen explicitly separated them: "la regla es de gobernanza, no de
   seguridad de shell... son dos capas distintas, y solo la de
   gobernanza está cubierta aquí" — then backed its account of the
   governance incident with a verbatim citation of its own protocol
   file at a specific commit, rather than just asserting it happened.
4. With this feature: instead of me having authored that discipline by
   hand into a project-specific file, I could enable a maintained,
   built-in equivalent and get the same rigor by default, and other
   users building multi-agent pipelines wouldn't have to independently
   rediscover the need for an explicit authority-boundary clause the way
   I did.

## Additional Context

The protocol referenced here ("Filtro de Realidad v5 + Anti-Sycophancy",
including the "Queen Supremacy" orchestration-authority clause) is my own
design, originally developed with Claude's help, and grew out of my
scientific research work rather than a software project:

- Google Scholar: https://scholar.google.com.mx/citations?hl=es&user=BvW7db0AAAAJ
- ResearchGate: https://www.researchgate.net/profile/Itan-Ruiz-Hernandez
- Repo (v1.0.0): https://github.com/RuizHernandez/reality-filter-protocol
- Zenodo DOI: https://doi.org/10.5281/zenodo.21499994
- Companion technical finding (Cursor hook enforcement bypass): https://github.com/RuizHernandez/Cursor-Hooks-Minimal-Test

Field: biochemistry / bacteriology / biotechnology, with recent work on
microbial kinetic modeling and simulation (e.g. factorial-design studies
on primary metabolite production by *Pseudomonas*).
