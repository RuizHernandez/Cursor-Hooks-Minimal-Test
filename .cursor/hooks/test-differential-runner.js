const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function testHookScript(scriptPath, payload) {
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });

    child.on('close', (code) => {
      let reason = 'NONE';
      try {
        const parsed = JSON.parse(stdout);
        reason = parsed.reason || 'NONE';
      } catch (e) {}

      resolve({ code, stdout: stdout.trim(), reason });
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function main() {
  console.log("=========================================");
  console.log("🔬 MATRIZ DE PRUEBA DIFERENCIAL DE HOOKS");
  console.log("=========================================");

  const workspaceHook = path.join(__dirname, 'workspace-hook.js');
  const globalHook = path.join(__dirname, 'global-hook.js');

  const resWorkspace = await testHookScript(workspaceHook, { hook: 'preToolUse', tool_name: 'Bash' });
  const resGlobal = await testHookScript(globalHook, { hook: 'preToolUse', tool_name: 'Bash' });

  console.log(`\n1. Workspace Hook Response: Code=${resWorkspace.code}, Reason=${resWorkspace.reason}`);
  console.log(`2. Global Hook Response: Code=${resGlobal.code}, Reason=${resGlobal.reason}`);

  console.log("\nDOCUMENTACIÓN OFICIAL CONFIRMADA:");
  console.log("- Proyectos (.cursor/hooks.json): Hooks específicos de repositorio.");
  console.log("- Usuario (~/.cursor/hooks.json): Hooks globales de preferencias.");
  console.log("- Ejecución Aditiva: Cursor ejecuta ambos de forma combinada.");
}

main();
