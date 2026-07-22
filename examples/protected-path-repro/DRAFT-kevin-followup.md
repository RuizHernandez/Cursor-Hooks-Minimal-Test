DRAFT — NOT YET VERIFIED FOR POSTING. See HANDOFF-2026-07-21.md step 2
before publishing this. The BOM finding is solid; the enforcement claim
is explicitly hedged as preliminary until the isolated single-prompt
retest is done.

---

Hi @kevinn — quick follow-up on the minimal repro you invited, now up at
`examples/protected-path-repro/` in the repo I shared earlier (README
there has the full setup: `preToolUse` + `beforeShellExecution` +
`beforeMCPExecution` hook denying writes/deletes on a protected file,
plus `permissions.deny` in `.cursor/cli.json`).

**Confirmed:** Cursor CLI on Windows (`v2026.07.17-3e2a980`) prefixes the
hook's stdin payload with a UTF-8 BOM (`U+FEFF`). A hook doing a plain
`JSON.parse(stdin)` — the natural way to write one — throws on that BOM
before it ever reaches the actual allow/deny logic. Our `hooks.log` shows
10 consecutive `[DENY]` entries in one session, all
`Unexpected token '﻿'`. We've patched our hook to strip it before
parsing; flagging in case this breaks other hooks that don't expect it.

**Preliminary, still isolating — not confirmed yet:** in that same
BOM-broken session, the hook denied every call (fail-closed, as
designed), and Cursor CLI appears to have executed most of the
underlying operations anyway (file edit, `rm`, `sed -i`, shell redirect
all reported as succeeding). Cursor Desktop IDE hit the same BOM issue in
a separate run and correctly blocked everything instead. We haven't yet
re-run this with the BOM fix in place, one isolated command at a time
(rather than a batch), to confirm whether the CLI genuinely disregards a
*clean* `deny` or whether this was specific to the parse-error path.
We'll follow up with that result — didn't want to sit on the BOM finding
in the meantime since it's independently reproducible regardless of how
the enforcement question resolves.
