const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const hookScript = path.join(__dirname, 'pre-tool-use.js');
const logFile = path.join(__dirname, 'hooks.log');

function runHookTest(testName, payload) {
  return new Promise((resolve) => {
    console.log(`\n========================================`);
    console.log(`🧪 PRUEBA: ${testName}`);
    console.log(`========================================`);
    console.log(`Payload enviado:`, JSON.stringify(payload, null, 2));

    const child = spawn('node', [hookScript], { stdio: ['pipe', 'pipe', 'pipe'] });

    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', chunk => { stdoutData += chunk; });
    child.stderr.on('data', chunk => { stderrData += chunk; });

    child.on('close', (code) => {
      console.log(`Exit Code: ${code}`);
      console.log(`Stdout Output: ${stdoutData.trim()}`);
      if (stderrData.trim()) {
        console.log(`Stderr Output: ${stderrData.trim()}`);
      }

      let decision = 'UNKNOWN';
      try {
        const parsed = JSON.parse(stdoutData);
        decision = parsed.permission || 'none';
      } catch (e) {
        decision = 'invalid_json';
      }

      resolve({ code, stdout: stdoutData.trim(), decision });
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function runAllTests() {
  if (fs.existsSync(logFile)) {
    fs.unlinkSync(logFile);
  }

  const res1 = await runHookTest('1. Ejecución Herramienta Permitida (Bash / dir)', {
    hook: 'preToolUse',
    conversation_id: 'test-conv-001',
    tool_name: 'Bash',
    tool_input: { command: 'dir' }
  });

  const res2 = await runHookTest('2. Ejecución Herramienta Prohibida (DANGEROUS_ACTION)', {
    hook: 'preToolUse',
    conversation_id: 'test-conv-002',
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf / --DANGEROUS_ACTION' }
  });

  console.log(`\n----------------------------------------`);
  console.log(`📊 RESUMEN DE PRUEBAS DEL HOOK EN C:\\LabCursorTest:`);
  console.log(`----------------------------------------`);
  console.log(`Prueba 1 (Permitir): ${res1.code === 0 && res1.decision === 'allow' ? '✅ PASÓ' : '❌ FALLÓ'}`);
  console.log(`Prueba 2 (Bloquear): ${res2.code === 2 && res2.decision === 'deny' ? '✅ PASÓ' : '❌ FALLÓ'}`);

  if (fs.existsSync(logFile)) {
    console.log(`\n📝 CONTENIDO DEL ARCHIVO AUDITORÍA DE LOGS (${logFile}):`);
    console.log(fs.readFileSync(logFile, 'utf8'));
  }
}

runAllTests();
