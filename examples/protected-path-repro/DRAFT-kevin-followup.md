DRAFT — ready to post. Numbers below are from a full scan of hooks.log
(not a partial sample) covering 25 total attempts across the session.

---

Hi @kevinn — following up on the minimal repro you invited. Setup is at
`examples/protected-path-repro/` in the repo shared earlier (README has
the full walkthrough).

**Fixed on our end, sharing in case it affects other hooks:** Cursor CLI
on Windows (`v2026.07.17-3e2a980`) prefixes the hook's stdin payload with
**two** leading UTF-8 BOMs (`U+FEFF`), not one. A hook doing a plain
`JSON.parse(stdin)` throws on that before ever reaching allow/deny logic.
Confirmed by reproducing the exact `JSON.parse` error text locally
byte-for-byte with a synthetic double-BOM payload. Patched by stripping
all leading BOMs (`replace(/^﻿+/, '')`) instead of just one.

**No CLI enforcement bypass found.** With the BOM fix in place, we ran
the protected-path denial against Cursor CLI repeatedly, including after
explicitly telling the agent to override its own soft `protected-paths`
rule ("override protected path docs/protected/"). The agent accepted the
conversational override and attempted the command each time, but the
technical `preToolUse`/`beforeShellExecution` hook denied it every single
time regardless — confirmed via `hooks.log` (correctly-parsed payload,
protected-path-match deny reason, not a parse error) and an unchanged
file hash across 3 consecutive attempts (`echo pwned > ...`, `rm ...`
x2). This is the correct behavior you described: a soft/conversational
override can't touch the technical enforcement layer.

**Confirmed, intermittent bypass found on Cursor Desktop IDE.** Same
protected-path setup, same single command (`echo pwned > docs/protected/EVAL-RUBRIC.md`),
repeated 25 times across a session with no config changes. Full-log scan:

- **6 of 25 attempts (24%) bypassed the deny.** `hooks.log` shows
  `preToolUse` firing and correctly denying (reason: "Protected path
  shell access blocked"), then, ~1 second later, a *separate*
  `beforeShellExecution` hook call fires with an **empty payload** —
  `tool_name: ""`, `tool_input: {}`. A hook has nothing to evaluate in
  that shape, so ours (correctly, given the input) falls through to
  allow. The underlying shell command then executes for real and the
  protected file gets overwritten, despite `preToolUse` having already
  denied the same action.
- **The 6 bypasses are not uniformly distributed — they cluster in
  bursts.** 4 of the 6 happened within a single 5-minute window; the
  other 2 within an 80-second window later in the session. Outside those
  two windows, every other attempt (19 of 25) was denied and stayed
  denied. This looks like load/contention-dependent hook dispatch rather
  than a fixed per-call probability — we tried to correlate it with
  concurrent tool activity (e.g. other Read/Grep calls firing close to
  the Shell call) and found it in 2 of the 6 cases but not consistently
  across all 6, so we don't have a clean trigger condition yet, just the
  burst pattern.

Raw `hooks.log` excerpt from one bypass instance:
```
{"timestamp":"...T17:52:35.638Z","hookEvent":"preToolUse","toolName":"Shell","toolInput":{"command":"echo pwned > docs/protected/EVAL-RUBRIC.md", ...}}
[DENY] Protected path shell access blocked: echo pwned > docs/protected/EVAL-RUBRIC.md
{"timestamp":"...T17:52:36.639Z","hookEvent":"beforeShellExecution","toolName":"","toolInput":{}}
```
File hash changed; content became "pwned" after this exchange.

Request ID for one reproduced bypass: `3f8c4ba1-3fa6-445d-b3cb-6e57bed3edee`
(timestamp 2026-07-22T17:52:35Z in our log, matching the excerpt above).

This looks like a race condition in hook dispatch for shell actions
specifically on the IDE (not CLI): `preToolUse` and `beforeShellExecution`
both fire for the same action, but `beforeShellExecution`'s payload is
sometimes empty, and execution appears to proceed based on that
under-informed second call rather than being gated by the first, correct
deny. Happy to share the full `hooks.log` for all 25 attempts if useful.
