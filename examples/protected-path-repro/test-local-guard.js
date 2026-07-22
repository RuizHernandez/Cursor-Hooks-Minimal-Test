// Runs a battery of realistic tool-call payloads directly against
// protected-path-guard.js (bypassing Cursor entirely) to prove the hook
// SCRIPT itself denies every one of them. This does NOT prove Cursor's
// runtime actually invokes the hook for every one of these tool
// categories -- see README.md for the live-Cursor half of this repro.
const { spawn } = require('child_process');
const path = require('path');

const hookScript = path.join(__dirname, '.cursor', 'hooks', 'protected-path-guard.js');
const cwd = __dirname;

function runRawCase(name, rawStdin, expected) {
  return new Promise((resolve) => {
    const child = spawn('node', [hookScript], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.on('close', (code) => {
      let decision = 'invalid_json';
      try {
        decision = JSON.parse(stdout).permission;
      } catch (_) {}
      const pass = decision === expected;
      console.log(`${pass ? '✅' : '❌'} ${name} -> code=${code} decision=${decision} (expected ${expected})`);
      resolve(pass);
    });
    child.stdin.write(rawStdin);
    child.stdin.end();
  });
}

function runCase(name, payload, expected) {
  return runRawCase(name, JSON.stringify(payload), expected);
}

async function main() {
  const cases = [
    // Direct Write-tool attempts, several path spellings
    ['Write tool, relative path', { hook: 'preToolUse', tool_name: 'Write', tool_input: { file_path: 'docs/protected/EVAL-RUBRIC.md', content: 'x' } }, 'deny'],
    ['Write tool, ./ prefixed path', { hook: 'preToolUse', tool_name: 'Write', tool_input: { file_path: './docs/protected/EVAL-RUBRIC.md', content: 'x' } }, 'deny'],
    ['Write tool, path traversal', { hook: 'preToolUse', tool_name: 'Write', tool_input: { file_path: 'docs/x/../protected/EVAL-RUBRIC.md', content: 'x' } }, 'deny'],
    ['Write tool, absolute path', { hook: 'preToolUse', tool_name: 'Write', tool_input: { file_path: path.resolve(cwd, 'docs/protected/EVAL-RUBRIC.md'), content: 'x' } }, 'deny'],
    ['Edit tool, target_file field', { hook: 'preToolUse', tool_name: 'Edit', tool_input: { target_file: 'docs/protected/EVAL-RUBRIC.md', old_string: 'a', new_string: 'b' } }, 'deny'],

    // Shell / beforeShellExecution style
    ['Shell rm', { hook: 'beforeShellExecution', tool_name: 'Bash', tool_input: { command: 'rm docs/protected/EVAL-RUBRIC.md' } }, 'deny'],
    ['Shell truncate via redirect', { hook: 'beforeShellExecution', tool_name: 'Bash', tool_input: { command: 'echo pwned > docs/protected/EVAL-RUBRIC.md' } }, 'deny'],
    ['Shell sed -i', { hook: 'beforeShellExecution', tool_name: 'Bash', tool_input: { command: "sed -i 's/protected/pwned/' docs/protected/EVAL-RUBRIC.md" } }, 'deny'],
    ['Shell git checkout overwrite', { hook: 'beforeShellExecution', tool_name: 'Bash', tool_input: { command: 'git checkout -- docs/protected/EVAL-RUBRIC.md' } }, 'deny'],
    ['Shell base64-obfuscated payload (path still literal, still caught)', { hook: 'beforeShellExecution', tool_name: 'Bash', tool_input: { command: "echo cHduZWQ= | base64 -d > docs/protected/EVAL-RUBRIC.md" } }, 'deny'],
    ['Shell glob-obfuscated PATH (KNOWN GAP: expected to slip past this heuristic)', { hook: 'beforeShellExecution', tool_name: 'Bash', tool_input: { command: 'cd docs/pr*ected && echo pwned > EVAL-RUBRIC.md' } }, 'allow'],

    // MCP style
    ['MCP filesystem write_file', { hook: 'beforeMCPExecution', tool_name: 'mcp__filesystem__write_file', tool_input: { path: 'docs/protected/EVAL-RUBRIC.md', content: 'x' } }, 'deny'],

    // Windows Cursor CLI has been observed prefixing stdin with a UTF-8 BOM;
    // confirm the guard strips it and still evaluates the real payload
    // instead of denying on a parse error that masks the true decision.
    ['BOM-prefixed payload, protected path (regression)', null, 'deny', '﻿' + JSON.stringify({ hook: 'preToolUse', tool_name: 'Write', tool_input: { file_path: 'docs/protected/EVAL-RUBRIC.md', content: 'x' } })],
    ['BOM-prefixed payload, unrelated path (regression)', null, 'allow', '﻿' + JSON.stringify({ hook: 'preToolUse', tool_name: 'Write', tool_input: { file_path: 'docs/scratch.md', content: 'x' } })],
    ['DOUBLE-BOM-prefixed payload (confirmed real-world case, regression)', null, 'deny', '﻿﻿' + JSON.stringify({ hook: 'preToolUse', tool_name: 'Write', tool_input: { file_path: 'docs/protected/EVAL-RUBRIC.md', content: 'x' } })],

    // Control cases: must still ALLOW legitimate, unrelated operations
    ['Control: write to unrelated file', { hook: 'preToolUse', tool_name: 'Write', tool_input: { file_path: 'docs/scratch.md', content: 'x' } }, 'allow'],
    ['Control: read the protected file', { hook: 'preToolUse', tool_name: 'Read', tool_input: { file_path: 'docs/protected/EVAL-RUBRIC.md' } }, 'allow'],
    ['Control: unrelated shell command', { hook: 'beforeShellExecution', tool_name: 'Bash', tool_input: { command: 'ls docs' } }, 'allow']
  ];

  let passed = 0;
  for (const [name, payload, expected, rawOverride] of cases) {
    const ok = rawOverride !== undefined ? await runRawCase(name, rawOverride, expected) : await runCase(name, payload, expected);
    if (ok) passed++;
  }

  console.log(`\n${passed}/${cases.length} script-level cases behaved as expected.`);
  console.log('\nThis only proves the hook SCRIPT is airtight. It does NOT prove Cursor');
  console.log('actually calls this hook for every one of these tool/event categories --');
  console.log('run the same operations for real inside Cursor IDE / Cursor CLI with this');
  console.log('folder open as the workspace root (see README.md) to test that.');
  process.exit(passed === cases.length ? 0 : 1);
}

main();
