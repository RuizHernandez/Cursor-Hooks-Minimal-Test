DRAFT — ready to post. Numbers below are from a full scan of the entire
session's hooks.log (58 total attempts, not a partial sample).

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

**Confirmed, intermittent bypass found on Cursor Desktop IDE — isolated
to one early window, not reproduced again despite substantial effort.**
Same protected-path setup, same command (`echo pwned > docs/protected/EVAL-RUBRIC.md`),
attempted 58 times across the session. Full-log scan:

- **6 of 58 attempts bypassed the deny**, and all 6 happened inside a
  single ~17-minute early window (17:52-18:09). `hooks.log` shows
  `preToolUse` firing and correctly denying (reason: "Protected path
  shell access blocked"), then, ~1 second later, a *separate*
  `beforeShellExecution` hook call fires with an **empty payload** —
  `tool_name: ""`, `tool_input: {}`. A hook has nothing to evaluate in
  that shape, so ours (correctly, given the input) falls through to
  allow. The underlying shell command then executes for real and the
  protected file gets overwritten, despite `preToolUse` having already
  denied the same action.
- **The empty-`beforeShellExecution` phenomenon itself is not rare —
  it fired 20 times across the session total — but it's a general
  Cursor bug, not specific to this hook or this path.** In 14 of those
  20 cases, the empty payload followed a completely unrelated shell
  command (Cursor's own internal file-listing/diagnostic commands, and a
  `Start-Sleep`-based wake loop from an unrelated `/loop` skill
  invocation) that was never denied in the first place, so the empty
  payload was harmless noise. It only becomes security-relevant when it
  coincides with a command `preToolUse` had just denied — which is what
  happened those 6 times.
- **We could not reproduce it again after 18:09** despite deliberately
  varying the approach across the remaining ~50 attempts: plain
  sequential retries, explicit conversational "override" attempts,
  7-subagent task-queue orchestration, genuinely concurrent Shell calls
  from Cursor CLI and Cursor Desktop IDE running at the same time
  (timestamps as close as ~0.4s apart), rapid-fire loops with minimal
  reasoning between calls, and skill-triggered bursts. None of it
  reproduced a bypass of the protected file again. So: real, evidenced,
  but apparently tied to some session/state condition we couldn't pin
  down or reliably re-trigger.

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
deny. Happy to share the full `hooks.log` for all 58 attempts if useful.
