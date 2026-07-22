#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'hooks.log');
const STDIN_TIMEOUT_MS = parseInt(process.env.HOOK_STDIN_TIMEOUT_MS || '5000', 10);
const MAX_STDIN_BYTES = 5 * 1024 * 1024;

// Repo root the hook is invoked from. Cursor runs hook commands with the
// workspace root as cwd, so this is the anchor for resolving relative
// paths out of tool_input the same way the tool itself would.
const REPO_ROOT = process.cwd();

// Comma-separated list of paths/prefixes to protect, relative to REPO_ROOT.
// A real deployment should keep this list itself outside the Coder
// agent's write access (e.g. injected via env var by the orchestrator,
// not read from a file the Coder can edit).
const PROTECTED_RELATIVE = (process.env.PROTECTED_PATHS || 'docs/protected')
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

const PROTECTED_ABSOLUTE = PROTECTED_RELATIVE.map((p) => path.resolve(REPO_ROOT, p));

let responded = false;

function denyAndExit(reason, logMessage) {
  if (responded) return;
  responded = true;
  try {
    if (logMessage) {
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [DENY] ${logMessage}\n`);
    }
  } catch (_) {}
  console.log(JSON.stringify({ permission: 'deny', reason }));
  process.exit(2);
}

function allowAndExit(toolName) {
  if (responded) return;
  responded = true;
  console.log(JSON.stringify({ permission: 'allow', tool_name: toolName }));
  process.exit(0);
}

process.on('uncaughtException', (err) => {
  denyAndExit(
    '[Protected Path Guard] Blocked: uncaught exception in hook.',
    `Uncaught exception: ${err && err.stack ? err.stack : err}`
  );
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
  denyAndExit('[Protected Path Guard] Blocked: unhandled rejection in hook.', `Unhandled rejection: ${msg}`);
});

function readStdinWithLimit() {
  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes > MAX_STDIN_BYTES) {
        reject(new Error(`stdin exceeds ${MAX_STDIN_BYTES} byte limit`));
        process.stdin.destroy();
        return;
      }
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', (err) => reject(err));
  });
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout ${ms}ms ${label}`)), ms);
    if (timer.unref) timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isProtected(candidatePath) {
  if (!candidatePath || typeof candidatePath !== 'string') return false;
  const resolved = path.resolve(REPO_ROOT, candidatePath);
  return PROTECTED_ABSOLUTE.some((p) => resolved === p || resolved.startsWith(p + path.sep));
}

// Fields commonly used by Write/Edit-style tools across agent frameworks.
const PATH_FIELDS = ['file_path', 'path', 'target_file', 'filePath', 'notebook_path', 'file'];

// Read-only tools are explicitly exempted from path blocking -- the goal
// is to stop mutation, not to hide the rubric from evaluators (the whole
// point is that they CAN read it, just via a pinned commit instead of the
// mutable worktree). Anything not on this list is treated as potentially
// mutating and stays subject to the path check, including unrecognized/
// future tool names -- fail closed by default rather than allowlisting
// write tools by name, which would miss whatever the next tool is called.
const READ_ONLY_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead', 'WebFetch', 'WebSearch']);

function pathsFromToolInput(toolName, toolInput) {
  if (READ_ONLY_TOOLS.has(toolName)) return [];
  const found = [];
  for (const key of PATH_FIELDS) {
    if (typeof toolInput[key] === 'string') found.push(toolInput[key]);
  }
  return found;
}

// Best-effort shell-command scanner. This is intentionally string-based,
// not a real shell parser, so it WILL miss sufficiently obfuscated
// commands (variable indirection, alternate encodings, globs that expand
// to the target without naming it). Treat a clean scan here as "not
// caught by this heuristic," not as proof the command is safe -- that's
// exactly the gap this repro exists to probe.
const WRITE_CAPABLE_SHELL = /\b(rm|mv|cp|sed|dd|truncate|tee|chmod|chown)\b|>>?|git\s+(checkout|reset|clean|apply|stash)/i;

function shellCommandTouchesProtected(command) {
  if (!command || typeof command !== 'string') return false;
  if (!WRITE_CAPABLE_SHELL.test(command)) return false;
  return PROTECTED_RELATIVE.some((rel) => {
    const abs = path.resolve(REPO_ROOT, rel);
    return command.includes(rel) || command.includes(abs) || command.includes(path.basename(rel));
  });
}

async function main() {
  let rawInput;
  try {
    rawInput = await withTimeout(readStdinWithLimit(), STDIN_TIMEOUT_MS, 'waiting for stdin');
  } catch (err) {
    denyAndExit(
      `[Protected Path Guard] Blocked: stdin read/timeout (${err.message}).`,
      `Stdin timeout: ${err.message}`
    );
    return;
  }

  if (!rawInput || rawInput.trim() === '') {
    denyAndExit('[Protected Path Guard] Blocked: empty stdin.', 'Empty stdin');
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawInput);
  } catch (e) {
    denyAndExit('[Protected Path Guard] Blocked: invalid JSON payload.', `JSON parse error: ${e.message}`);
    return;
  }

  const toolName = payload.tool_name || payload.tool || '';
  const toolInput = payload.tool_input || payload.parameters || payload.args || {};
  const hookEvent = payload.hook_event_name || payload.hook || 'preToolUse';

  try {
    fs.appendFileSync(
      LOG_FILE,
      JSON.stringify({ timestamp: new Date().toISOString(), hookEvent, toolName, toolInput }, null, 2) + '\n---\n'
    );
  } catch (logErr) {
    process.stderr.write(`[hook] Could not write hooks.log: ${logErr.message}\n`);
  }

  // 1. Direct Write/Edit-style tool calls carrying a path field.
  for (const candidate of pathsFromToolInput(toolName, toolInput)) {
    if (isProtected(candidate)) {
      denyAndExit(
        `[Protected Path Guard] Blocked: '${toolName}' targets protected path '${candidate}'.`,
        `Protected path write blocked via ${toolName}: ${candidate}`
      );
      return;
    }
  }

  // 2. Shell commands, whether they arrive as a Bash-style tool call
  //    (preToolUse) or as the dedicated beforeShellExecution event.
  const command = toolInput.command || toolInput.cmd || '';
  if (shellCommandTouchesProtected(command)) {
    denyAndExit(
      `[Protected Path Guard] Blocked: shell command targets protected path.`,
      `Protected path shell access blocked: ${command}`
    );
    return;
  }

  // 3. MCP tool calls (beforeMCPExecution, or any mcp__-prefixed tool_name
  //    seen via preToolUse) -- scan all string arguments, since MCP tools
  //    don't share a common path-field convention.
  if (hookEvent === 'beforeMCPExecution' || toolName.startsWith('mcp__')) {
    for (const value of Object.values(toolInput)) {
      if (typeof value === 'string' && isProtected(value)) {
        denyAndExit(
          `[Protected Path Guard] Blocked: MCP tool '${toolName}' targets protected path '${value}'.`,
          `Protected path MCP access blocked via ${toolName}: ${value}`
        );
        return;
      }
    }
  }

  allowAndExit(toolName);
}

main().catch((err) => {
  denyAndExit(
    `[Protected Path Guard] Blocked: unhandled error (${err.message}).`,
    `Unhandled main() error: ${err.stack || err.message}`
  );
});
