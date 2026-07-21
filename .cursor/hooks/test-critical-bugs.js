const { spawn } = require('child_process');
const path = require('path');

function runTest(testName, scriptName, timeoutMs = 7000) {
  return new Promise((resolve) => {
    console.log(`\n========================================`);
    console.log(`🧪 PRUEBA CRÍTICA: ${testName}`);
    console.log(`========================================`);

    const scriptPath = path.join(__dirname, scriptName);
    const start = Date.now();
    const child = spawn('node', [scriptPath], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdoutData = '';
    let stderrData = '';
    let killedByTimeout = false;

    const timer = setTimeout(() => {
      killedByTimeout = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', chunk => { stdoutData += chunk; });
    child.stderr.on('data', chunk => { stderrData += chunk; });

    child.on('close', (code) => {
      clearTimeout(timer);
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      console.log(`Tiempo de ejecución: ${duration}s`);
      console.log(`Exit Code: ${code}`);
      console.log(`Stdout: ${stdoutData.trim() || '(vacío)'}`);
      console.log(`Stderr: ${stderrData.trim() || '(vacío)'}`);

      let behavior = 'DESCONOCIDO';
      if (killedByTimeout) {
        behavior = '🚨 TIMEOUT DETECTADO (El script no respondió dentro del límite)';
      } else if (code === 1) {
        behavior = '⚠️ FAIL-OPEN POTENCIAL (Exit Code 1 emitido)';
      } else if (code === 2) {
        behavior = '🛡️ DENEGACIÓN FAIL-CLOSED (Exit Code 2)';
      } else if (code === 0) {
        behavior = '✅ APROBACIÓN (Exit Code 0)';
      }

      resolve({ code, stdout: stdoutData.trim(), stderr: stderrData.trim(), duration, behavior, killedByTimeout });
    });

    child.stdin.write(JSON.stringify({ hook: 'preToolUse', tool_name: 'Bash', tool_input: { command: 'test' } }));
    child.stdin.end();
  });
}

async function runCriticalSuite() {
  console.log("🔥 INICIANDO SUITE DIAGNÓSTICA DE BUGS CRÍTICOS EN CURSOR HOOKS 🔥");

  const res1 = await runTest('1. Flujo Normal (pre-tool-use.js)', 'pre-tool-use.js');

  console.log(`\n========================================`);
  console.log(`📊 RESULTADO DE VERIFICACIÓN HOOK FAIL-CLOSED`);
  console.log(`========================================`);
  console.log(`1. Hook Status: ${res1.behavior} (${res1.duration}s)`);
}

runCriticalSuite();
