const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, 'hooks.log');

/**
 * Lee stdin de forma asíncrona hasta completarlo.
 */
function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', err => reject(err));
  });
}

async function main() {
  try {
    const rawInput = await readStdin();
    if (!rawInput || rawInput.trim() === '') {
      console.log(JSON.stringify({ status: "empty_stdin", permission: "allow" }));
      process.exit(0);
    }

    let payload;
    try {
      payload = JSON.parse(rawInput);
    } catch (e) {
      fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [ERROR] Falló parseo JSON: ${rawInput}\n`);
      process.exit(0);
    }

    const timestamp = new Date().toISOString();
    const toolName = payload.tool_name || payload.tool || 'Desconocida';
    const toolInput = payload.tool_input || payload.parameters || payload.args || {};

    // 1. Registrar auditoría en hooks.log
    const logEntry = {
      timestamp,
      event: 'preToolUse',
      tool_name: toolName,
      tool_input: toolInput,
      conversation_id: payload.conversation_id || null
    };

    fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry, null, 2) + '\n---\n');

    // 2. Lógica de validación / Reglas de Seguridad
    const inputStr = JSON.stringify(toolInput);
    
    // Regla de ejemplo: Bloquear palabras clave peligrosas de prueba
    if (inputStr.includes('DANGEROUS_ACTION') || inputStr.includes('BLOCK_THIS')) {
      const response = {
        permission: "deny",
        reason: `[Cursor Hook] Bloqueado por regla de seguridad preToolUse: Parámetros prohibidos detectados en '${toolName}'.`
      };
      console.log(JSON.stringify(response));
      // Código 2 notifica a Cursor la denegación explícita
      process.exit(2);
    }

    // 3. Permitir ejecución si pasa las verificaciones
    const response = {
      permission: "allow",
      tool_name: toolName
    };
    console.log(JSON.stringify(response));
    process.exit(0);

  } catch (error) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [CRITICAL] Exception: ${error.message}\n`);
    process.exit(0);
  }
}

main();
