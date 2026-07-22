# Feedback for Anthropic: Claude Code agentic verification during a live bug hunt

Context: over two sessions, I asked Claude Code to help investigate whether
Cursor's `preToolUse`/`beforeShellExecution` hooks could be bypassed,
following up on a Cursor engineer's public forum reply. Full trail is in
this repo: `examples/protected-path-repro/` (hook, tests, `HANDOFF-2026-07-21.md`,
`DRAFT-kevin-followup.md`).

I'm sharing this because the *process* Claude Code used to get from a
noisy, self-contradicting set of test results to a well-evidenced, honest
finding seems worth Anthropic seeing directly, not just the end result.

## What made this hard

Every "the CLI bypassed the hook!" moment turned out, on inspection, to
have a mundane explanation — but the explanations were all different, and
each one only surfaced because Claude Code refused to accept an agent's
self-reported transcript as evidence:

1. **Wrong directory (twice).** The CLI reported successfully editing
   files that, on inspection, had never existed in the real repo — it was
   operating in an entirely different, hookless DevSwarm workspace. Caught
   by asking the CLI to drop a uniquely-named marker file and physically
   locating it on disk, rather than trusting `pwd` claims in the chat.
2. **A real encoding bug, twice.** Cursor CLI on Windows prefixes hook
   stdin with a UTF-8 BOM — actually two BOMs, not one, which Claude Code
   only found after its first fix (single-BOM strip) didn't resolve a
   second live-tested failure, and it reproduced the *exact* JSON.parse
   error text locally to confirm before writing a second, more thorough
   fix.
3. **A misattributed "bypass" hash.** A file-content hash treated as
   baseline for a day turned out to be stale after an incidental Windows
   line-ending renormalization in git; Claude Code caught the mismatch by
   re-diffing against the canonical GitHub blob before trusting a "the
   file changed!" claim.
4. **Statistical overclaiming, caught and corrected.** An initial "3 of 8"
   bypass-rate claim, based on a partial sample the user pointed it to,
   was superseded by Claude Code doing a full grep across the entire
   session log (58 attempts total) once it noticed an uncounted bypass
   instance nearby — landing on a materially different, more defensible
   number (6/58, clustered in one window) instead of publishing the
   earlier estimate.
5. **A false-positive "bypass" filtered out.** Several later empty-payload
   `beforeShellExecution` events looked identical to genuine bypasses at
   first glance, until Claude Code checked what shell command each one
   actually followed and found most were tied to Cursor's own unrelated
   internal commands (file listing, an unrelated skill's sleep/wake loop)
   — not the protected path at all. Reporting those as bypasses would have
   been wrong.

## The discipline that mattered

- Every claim of "it worked" / "it got blocked" from either Cursor IDE or
  Cursor CLI was independently checked against `hooks.log` and a file
  content hash before being accepted — the chat transcript was never
  treated as ground truth.
- When a hypothesis (e.g. "concurrency triggers it") didn't pan out across
  several honest attempts, that was reported as a negative result instead
  of being dropped silently or reframed as success.
- The final report to the Cursor engineer explicitly separates what's
  confirmed (BOM bug, 6 real bypasses with a Request ID) from what's
  merely observed-but-unexplained (the burst clustering, the failure to
  re-trigger it afterward), rather than presenting a tidy narrative the
  data didn't support.

Happy to answer questions or share the raw `hooks.log` if useful for
understanding failure modes in Cursor's hook dispatch, or in how an agent
should approach self-verification during an extended investigation.
