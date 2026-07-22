# Feature request draft for github.com/anthropics/claude-code/issues

Copy each section into the matching field of the "Feature Request" form.

---

## Problem Statement

During an extended debugging session (investigating whether an external
tool's security hook could be bypassed — full trail at
github.com/RuizHernandez/Cursor-Hooks-Minimal-Test, `examples/protected-path-repro/`),
I repeatedly needed to verify "what actually changed since the last time
I checked" in a log file and a target file, across dozens of check-ins
over a multi-hour session. Neither the external tool's chat transcript
nor its own self-reported results could be trusted as ground truth — I
had to independently confirm every claim against the real filesystem.

The only way to do this was manual, ad hoc bookkeeping: run `wc -l` on
the log file to note its current line count, wait for the user to
trigger an action, then re-run `wc -l` and use `sed -n 'N,$p'` to see
only the new lines, plus separately re-run `sha256sum` on the target
file each time to check whether its content actually changed. This
plumbing isn't part of the actual investigation — it's just bookkeeping
to avoid misattributing stale log entries or a stale file hash to a new
event — but it consumed a large fraction of the turns in the session and
was easy to get subtly wrong (I did, at least once, reference a stale
baseline hash before catching the mistake).

## Proposed Solution

A lightweight "checkpoint and diff" primitive for files, usable from
within a Claude Code session:

- `checkpoint <path>` — record the current state of a file (line count
  for logs, content hash for arbitrary files) under a label.
- `since <label> <path>` — return only what changed since that
  checkpoint: new lines appended (for logs), or a clear
  changed/unchanged verdict plus a diff (for arbitrary files) — without
  me having to manually track line numbers or re-run full-file hashes
  and compare them by eye.

Ideally exposed as a small, composable tool (not a full new subsystem)
so it works naturally inside an existing Bash-heavy verification
workflow, the way `git diff` composes with everything else.

## Alternative Solutions

- Manual `wc -l` + `sed -n 'N,$p'` bookkeeping (what I actually did this
  session) — works, but is manual, easy to miscount, and adds several
  extra tool calls to every single check-in.
- `tail -f` in the background — doesn't give a clean "what's new since
  exactly this point" diff on demand; awkward to reconcile with
  request/response turns.
- Re-hashing and eyeballing the full hash string each time (what I did
  for file-integrity checks) — works but doesn't scale past a couple of
  checkpoints and has no memory of prior checkpoints across a long
  session.

## Priority

Medium — a workflow quality-of-life improvement for verification-heavy
agentic sessions, not a blocker.

## Feature Category

Tools / Developer workflow

## Use Case Example

1. I'm auditing whether an external tool honors a security decision it
   reports making (in this case: a hook that says "deny" — does the
   underlying action actually get blocked?).
2. I restore a known-good baseline file and note the log file's current
   length as a checkpoint before asking the user to trigger an action.
3. The user runs the action in a separate tool (outside my control) and
   tells me it's done.
4. Today: I re-run `wc -l`, manually compute the delta, `sed -n` to
   extract just the new lines, and separately `sha256sum` the target
   file to see if it changed — every single time, dozens of times over
   the session.
5. With this feature: I'd call `since checkpoint-1 hooks.log` and
   `since checkpoint-1 target-file` and get back exactly what's new,
   letting me spend the turn on actually interpreting the result instead
   of re-deriving "is this actually new."

## Additional Context

This came up specifically while cross-checking an external tool's
security enforcement (not a Claude Code bug) — but the underlying
friction (verify external/tool-reported state against ground truth,
repeatedly, over a long session) seems general to any agentic debugging
or audit workflow, not specific to this one investigation.
