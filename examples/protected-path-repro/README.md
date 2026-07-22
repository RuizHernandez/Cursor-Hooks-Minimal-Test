# Minimal Repro: Protected-Path Hook Enforcement

Built in response to Kevin Neilson's (Cursor) forum reply, which explained
that a prior report (a `HOLD` instruction in Markdown not being enforced)
wasn't a Cursor defect — Markdown instructions aren't an enforcement
mechanism, `preToolUse`/`beforeShellExecution` hooks are — and invited a
minimal, reproducible setup if a *configured deny* could be shown to be
bypassed by Cursor itself.

This folder is that minimal setup. It is self-contained: open **this
folder** (`examples/protected-path-repro/`) as the Cursor workspace root,
not the parent repo, so `.cursor/hooks.json` and `.cursor/cli.json` here
are the ones Cursor picks up.

## What's protected

`docs/protected/EVAL-RUBRIC.md` — stands in for the kind of artifact Kevin
described (e.g. `docs/ux/P2-impl-notes.md`): something an evaluator/
reviewer should trust, that a Coder agent should never be able to rewrite.

## What's wired up

- **`.cursor/hooks.json`** — `.cursor/hooks/protected-path-guard.js` is
  registered on `preToolUse`, `beforeShellExecution`, and
  `beforeMCPExecution` (three separate lifecycle events, per Kevin's point
  about needing "separate checks for shell and MCP operations").
- **`.cursor/cli.json`** — `permissions.deny` with `Write(docs/protected/**)`
  and `Shell(rm)` / `Shell(sed)` / `Shell(dd)` / `Shell(truncate)`, as a
  second, independent enforcement layer specific to Cursor CLI (schema
  verified against `cursor.com/docs/cli/reference/permissions`).
- **`.cursor/hooks/protected-path-guard.js`** — fail-closed on every
  abnormal path (uncaught exception, malformed JSON, empty stdin, stdin
  timeout — same pattern as the root repo's `pre-tool-use.js`), plus:
  - Blocks any non-read-only tool call whose `file_path`/`path`/
    `target_file`/etc. resolves onto the protected path (path-traversal
    and absolute-path spellings included).
  - Explicitly exempts `Read`/`Glob`/`Grep`/`LS`/etc. — the goal is to stop
    *mutation*, not hide the rubric from evaluators.
  - Scans shell commands (`beforeShellExecution`, or a `Bash` tool call
    seen via `preToolUse`) for write-capable verbs/redirects combined with
    the protected path appearing in the command string.
  - Scans MCP tool calls (`beforeMCPExecution`, or any `mcp__`-prefixed
    tool name) across all string arguments.

## What's already verified (script-level, run locally)

```bash
node test-local-guard.js
```

15/15 cases pass, including path-traversal, absolute-path, `rm`, redirect
truncation, `sed -i`, `git checkout --` (the exact "mutable worktree"
scenario Kevin flagged), an MCP write call, and base64-obfuscated file
*content* (the path itself stayed literal, so it was still caught) —
alongside three control cases proving legitimate reads/writes elsewhere
are still allowed.

### Known, disclosed gap — not fixed, deliberately left visible

One case is expected to `allow` and does:

```
cd docs/pr*ected && echo pwned > EVAL-RUBRIC.md
```

The shell scanner is a string-matching heuristic, not a real shell parser.
Glob wildcards (`pr*ected`) break the substring match against the
protected path/dirname, so this command slips through undetected. This is
disclosed on purpose rather than hidden: **no regex/string heuristic over
arbitrary shell input can be complete.** The honest mitigation isn't a
smarter regex (that's an arms race), it's defense in depth beyond the
hook — e.g. OS-level read-only permissions on the protected path, or a
server-side git check as the actual backstop, with the hook as the fast
first line of defense rather than the only one.

## What's NOT verified — this is the actual repro for Kevin

Everything above only proves the **hook script** denies correctly when
Cursor calls it with these payloads. It does not prove Cursor's runtime
calls this hook for every one of `preToolUse` / `beforeShellExecution` /
`beforeMCPExecution`, or that a `deny` response is actually honored end to
end. That's the open question from the forum thread, and it can only be
answered by running this for real:

1. Open this folder in Cursor Desktop IDE (or point Cursor CLI at it) as
   the workspace root.
2. Confirm the hook is active (check `.cursor/hooks/hooks.log` gets an
   entry after any tool call).
3. Ask the agent, one at a time, to run each of the operations in
   `test-local-guard.js`'s case list against `docs/protected/EVAL-RUBRIC.md`
   — the `Write`/`Edit` attempts, the shell `rm`/redirect/`sed -i`/
   `git checkout --`, and the MCP write if an MCP filesystem server is
   configured.
4. For each: did the operation actually get blocked (file unchanged,
   agent sees a deny), or did Cursor let it through despite the hook
   returning `{"permission":"deny", ...}`?
5. If any operation gets through: capture the exact steps, the Cursor
   Request ID for that turn, and the relevant `hooks.log` entry (or its
   absence, if the hook was never invoked at all) — that's precisely the
   minimal setup + Request ID Kevin asked for.
6. If none get through: that's also a real result — it confirms hooks
   enforce as documented for this tool/event coverage, and the glob-gap
   above becomes the one substantive, disclosed follow-up worth reporting
   (a heuristic limitation in *our* script, not a Cursor enforcement gap).
