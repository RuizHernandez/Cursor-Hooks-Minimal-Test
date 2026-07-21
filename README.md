# 🪝 Cursor Hooks (`preToolUse`) Minimal Test Environment & Fail-Closed Security Reference

[![Cursor Hooks](https://img.shields.io/badge/Cursor-Hooks_preToolUse-purple.svg)](https://cursor.com)
[![Node.js](https://img.shields.io/badge/Node.js-v24.x-green.svg)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Security](https://img.shields.io/badge/Security-Fail--Closed-red.svg)](#-key-security-highlights)

This repository provides a clean, minimal, reproducible test environment for **Cursor Hooks (`preToolUse`)** built in accordance with Cursor engineering recommendations and multi-agent swarm security reviews.

---

## 📁 Repository Architecture

```text
.
├── .cursor/
│   ├── hooks.json                      # Cursor hooks definition (portable Node.js command)
│   └── hooks/
│       ├── pre-tool-use.js             # Fail-closed Node.js hook executor (production grade)
│       ├── test-hook-runner.js         # Automated simulation test runner (allow & deny cases)
│       ├── test-critical-bugs.js       # Diagnostic test suite for edge cases & timeouts
│       ├── test-differential-runner.js # Local process execution test runner
│       ├── workspace-hook.js           # Differential test script (workspace level)
│       ├── global-hook.js              # Differential test script (user level)
│       └── hooks.log                   # Dynamic audit trail log (generated dynamically)
├── HOOKS-SECURITY-REVIEW.md            # Multi-agent security review report (by Claude Code Sonnet 5)
├── README-HOOKS.md                     # Detailed hook configuration & lifecycle documentation
├── README.md                           # Main repository documentation
├── LICENSE                             # MIT License
└── memory/                             # Session logs and governance documentation
```

---

## ⚡ Quickstart & Testing

To run the automated verification test suite locally:

```bash
# 1. Run basic allow/deny hook verification
node .cursor/hooks/test-hook-runner.js

# 2. Run critical edge-case & timeout diagnostic suite
node .cursor/hooks/test-critical-bugs.js
```

### Expected Output:
- **Allowed Tool Calls**: Exits with code `0` (`{"permission": "allow"}`)
- **Prohibited Tool Calls**: Exits with code `2` (`{"permission": "deny", "reason": "..."}`)

---

## 🛡️ Key Security & Architectural Highlights

1. **Strict Fail-Closed Design (`Exit Code 2`)**:
   - All unhandled exceptions, malformed JSON payloads, empty `stdin` streams, and prohibited arguments route through exit code `2`.
   - Prevents silent fallback (*fail-open*) if an unexpected error occurs during hook evaluation.

2. **Internal Timeout vs External Timeout (5s vs 10s)**:
   - Cursor enforces a 10-second external timeout on hook processes (`hooks.json`).
   - The hook script implements an **internal `stdin` timeout of 5 seconds**. If a stream stalls, it aborts proactively and emits an explicit `deny` decision **before** Cursor's process killer triggers.

3. **Layered Configuration Resolution**:
   - Cursor evaluates hooks across 4 additive layers: **Enterprise** (`C:\ProgramData\Cursor\hooks.json` on Windows / `/etc/cursor/hooks.json` on Linux) → **Team** → **Project** (`.cursor/hooks.json`) → **User** (`~/.cursor/hooks.json`).

4. **Stream Buffer Cap (5MB)**:
   - Defensively capping the incoming `stdin` buffer at 5MB prevents memory exhaustion from runaway payloads while maintaining fast stream parsing.

---

## 📜 Documentation & Reports

- **Security Review Report**: See [`HOOKS-SECURITY-REVIEW.md`](HOOKS-SECURITY-REVIEW.md) for full vulnerability analysis and mitigation details.
- **Hook Reference Guide**: See [`README-HOOKS.md`](README-HOOKS.md) for payload schemas and Cursor output panel debugging tips.

---

## 📄 License

[MIT License](LICENSE). Designed for AI safety research and workspace security testing.
