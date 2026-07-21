#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'hooks.log');

// Cursor's hooks.json sets an external timeout of 10s (see .cursor/hooks.json).
// We must respond well before that so Cursor never has to decide what to do
// with a process that blew its own deadline. 5s leaves headroom for JSON
// parsing / log I/O after stdin resolves.
const STDIN_TIMEOUT_MS = parseInt(process.env.HOOK_STDIN_TIMEOUT_MS || '5000', 10);

// Defense-in-depth: cap stdin size so a runaway/malicious payload can't
// exhaust memory while we're still buffering it.
const MAX_STDIN_BYTES = 5 * 1024 * 1024; // 5MB

let responded = false;

/**
 * Single choke point for denials. Fail-closed: every abnormal path in this
 * script (bad input, timeout, parse error, unexpected exception) routes
 * here instead of exiting 0.
 */
function denyAndExit(reason, logMessage) {
  if (responded) return; // guard against double-exit races (e.g. timeout firing after success)
  responded = true;

  try {
    if (logMessage) {
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [DENY] ${logMessage}\n`);
    }
  } catch (_) {
    // A logging failure must never prevent the deny response from being emitted.
  }

  console.log(JSON.stringify({ permission: 'deny', reason }));
  process.exit(2);
}

function allowAndExit(toolName) {
  if (responded) return;
  responded = true;
  console.log(JSON.stringify({ permission: 'allow', tool_name: toolName }));
  process.exit(0);
}

// Anything that escapes the main try/catch (e.g. a throw inside an event
// handler, which async/await does NOT capture) must still fail closed
// rather than let Node's default handler exit non-2 or hang.
process.on('uncaughtException', (err) => {
  denyAndExit(
    '[Cursor Hook] Bloqueado: excepcion no controlada en el hook.',
    `Uncaught exception: ${err && err.stack ? err.stack : err}`
  );
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.stack || reason.message : String(reason);
  denyAndExit(
    '[Cursor Hook] Bloqueado: rechazo de promesa no controlado en el hook.',
    `Unhandled rejection: ${msg}`
  );
});

function readStdinWithLimit() {
  return new Promise((resolve, reject) => {
    let data = '';
    let bytes = 0;
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes > MAX_STDIN_BYTES) {
        reject(new Error(`stdin excede el limite de ${MAX_STDIN_BYTES} bytes`));
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
    timer = setTimeout(() => reject(new Error(`Timeout de ${ms}ms ${label}`)), ms);
    // Do not let this timer keep the event loop alive by itself.
    if (timer.unref) timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function main() {
  let rawInput;
  try {
    rawInput = await withTimeout(readStdinWithLimit(), STDIN_TIMEOUT_MS, 'esperando stdin');
  } catch (err) {
    denyAndExit(
      `[Cursor Hook] Bloqueado: no se pudo leer stdin a tiempo (${err.message}).`,
      `Stdin read/timeout error: ${err.message}`
    );
    return;
  }

  if (!rawInput || rawInput.trim() === '') {
    // No hay payload que evaluar: sin datos no podemos aplicar ninguna
    // regla de seguridad, asi que se deniega en vez de asumir "allow".
    denyAndExit(
      '[Cursor Hook] Bloqueado: stdin vacio, no se puede evaluar la solicitud.',
      'Empty stdin received'
    );
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawInput);
  } catch (e) {
    denyAndExit(
      '[Cursor Hook] Bloqueado: payload JSON invalido, no se puede evaluar la solicitud con seguridad.',
      `JSON parse error: ${e.message}. Raw (truncated): ${rawInput.slice(0, 500)}`
    );
    return;
  }

  const timestamp = new Date().toISOString();
  const toolName = payload.tool_name || payload.tool || 'Desconocida';
  const toolInput = payload.tool_input || payload.parameters || payload.args || {};

  // Audit logging is best-effort: a full disk or permissions issue here
  // is an operational problem, not evidence the request is dangerous, so
  // it is reported to stderr rather than routed through denyAndExit and
  // used to block unrelated tool calls. All *security-relevant* failures
  // below still fail closed.
  try {
    fs.appendFileSync(
      LOG_FILE,
      JSON.stringify(
        {
          timestamp,
          event: 'preToolUse',
          tool_name: toolName,
          tool_input: toolInput,
          conversation_id: payload.conversation_id || null
        },
        null,
        2
      ) + '\n---\n'
    );
  } catch (logErr) {
    process.stderr.write(`[hook] No se pudo escribir hooks.log: ${logErr.message}\n`);
  }

  // Reglas de seguridad. Normalizamos a mayusculas para que variaciones
  // triviales de capitalizacion no evadan el bloqueo (bypass mas obvio
  // del script original).
  const inputStr = JSON.stringify(toolInput);
  const normalized = inputStr.toUpperCase();

  if (normalized.includes('DANGEROUS_ACTION') || normalized.includes('BLOCK_THIS')) {
    denyAndExit(
      `[Cursor Hook] Bloqueado por regla de seguridad preToolUse: parametros prohibidos detectados en '${toolName}'.`,
      `Blocked dangerous action in tool '${toolName}'`
    );
    return;
  }

  allowAndExit(toolName);
}

main().catch((err) => {
  // Belt-and-suspenders: should be unreachable since main() has its own
  // try/catch per branch, but guarantees fail-closed even if a future
  // edit adds a branch without one.
  denyAndExit(
    `[Cursor Hook] Bloqueado: error inesperado en el hook (${err.message}).`,
    `Unhandled main() error: ${err.stack || err.message}`
  );
});
