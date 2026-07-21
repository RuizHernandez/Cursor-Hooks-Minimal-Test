# Revisión de Seguridad — Hook `preToolUse` de Cursor

**Alcance:** `README-HOOKS.md`, `.cursor/hooks.json`, `.cursor/hooks/pre-tool-use.js`, `.cursor/hooks/test-hook-runner.js`.

## Nota sobre el encargo

El encargo mencionaba una "matriz diagnóstica de los 3 bugs críticos" en `.cursor/hooks/test-critical-bugs.js`. Ese archivo no existe en el repo; el que existe es `.cursor/hooks/test-hook-runner.js`, que solo cubre 2 casos (permitir / bloquear por palabra clave) y no documenta bugs. Los "3 bugs críticos" de este informe surgen de mi propio análisis de `pre-tool-use.js` frente al comportamiento declarado en `hooks.json`, no de un archivo de diagnóstico preexistente.

## Contexto clave de `hooks.json`

```json
"preToolUse": [{ "command": "node .cursor/hooks/pre-tool-use.js", "matcher": ".*", "timeout": 10 }]
```

Cursor aplica un **timeout externo de 10s** al proceso del hook. Esto importa porque el script no controla qué hace Cursor si el proceso no responde a tiempo — solo puede *evitar* llegar a ese límite respondiendo rápido y explícitamente.

## Los 3 bugs críticos (fail-open)

### 1. Excepción no controlada → `allow` silencioso
```js
} catch (error) {
  fs.appendFileSync(LOG_FILE, `... [CRITICAL] Exception: ${error.message}\n`);
  process.exit(0);   // <-- exit 0 = "allow" según README-HOOKS.md
}
```
El `catch` global envuelve *todo*, incluida la escritura del log de auditoría (línea 48), que ocurre **antes** de la regla de seguridad (línea 54). Si `fs.appendFileSync` falla (disco lleno, permisos, ruta bloqueada por antivirus, etc.), la excepción salta directo a este bloque y el proceso sale con `0` — permitiendo la herramienta **sin haber evaluado la regla de bloqueo**. Es el bug más grave: una falla puramente operacional (logging) puede tumbar la seguridad completa del hook.

### 2. JSON malformado → `allow` silencioso
```js
} catch (e) {
  fs.appendFileSync(LOG_FILE, `... Falló parseo JSON: ${rawInput}\n`);
  process.exit(0);   // <-- no imprime {permission: "deny"}, pero exit 0 = allow igual
}
```
Un payload que no parsea como JSON (truncado, corrupto, o manipulado deliberadamente para romper el parser) termina permitiendo la ejecución en vez de denegarla. No hay forma de aplicar la regla de seguridad sobre un payload que no se pudo interpretar, así que el único comportamiento seguro es denegar.

### 3. Ausencia total de timeout interno → riesgo de fail-open externo
`readStdin()` espera indefinidamente el evento `'end'` de `stdin`. Si el proceso padre (Cursor) no cierra el stream, o el pipe se cuelga, el script nunca sale por sí mismo — depende enteramente de que Cursor mate el proceso a los 10s marcados en `hooks.json`. El script no tiene forma de saber (ni de influir en) qué decisión toma Cursor ante un hook que agota su timeout externo; muchos runners de hooks tratan un timeout/crash del hook como "no bloqueante" para no congelar el IDE, lo que en la práctica equivale a `allow`. Sin un timeout interno que denieguemos explícitamente *antes* del límite de 10s, el fail-safe queda completamente fuera del control de este script.

## Hallazgos secundarios (no bloqueantes, pero relevantes)

- **Bypass trivial por mayúsculas/minúsculas:** la regla busca `'DANGEROUS_ACTION'` y `'BLOCK_THIS'` con coincidencia exacta de caso. `dangerous_action` o `Dangerous_Action` pasan sin ser detectados.
- **`stdin` vacío se trata como `allow`:** un stdin vacío no debería interpretarse como "sin problema"; sin payload no hay manera de aplicar ninguna regla, por lo que también debería denegar bajo un criterio estrictamente fail-closed.
- **Sin límite de tamaño de `stdin`:** un payload extremadamente grande se buffer­iza por completo en memoria antes de intentar `JSON.parse`, lo que abre una vía de agotamiento de memoria.
- **`test-hook-runner.js` no cubre estos casos:** los tests existentes solo verifican el camino feliz (`allow`) y el bloqueo por palabra clave (`deny`). No hay pruebas para stdin vacío, JSON malformado, excepción en la escritura del log, ni timeout — precisamente los 3 caminos donde vive el fail-open real.

## Recomendaciones

1. **Todo camino anómalo debe terminar en `deny` (exit 2), nunca en `exit 0` por omisión.** Esto incluye: excepción no controlada, rechazo de promesa no controlado, JSON malformado, stdin vacío y timeout de lectura.
2. **Separar la escritura del log de auditoría de la lógica de seguridad.** Una falla de logging es un problema operacional, no evidencia de que la solicitud sea peligrosa; debe reportarse a `stderr` sin impedir que la regla de seguridad se evalúe, y sin que una excepción ahí arrastre al `catch` global hacia un `allow`.
3. **Agregar timeout interno explícito (p. ej. 5s) por debajo del límite externo de 10s de `hooks.json`**, para garantizar que el script *siempre* responda con una decisión propia (`deny`) antes de que Cursor tenga que decidir qué hacer con un proceso colgado.
4. **Agregar `process.on('uncaughtException')` y `process.on('unhandledRejection')`** como red de seguridad final, ya que `async/await` con `try/catch` no captura errores lanzados desde callbacks de eventos fuera de esa cadena.
5. **Normalizar el texto antes de buscar palabras clave prohibidas** (p. ej. `toUpperCase()`) para cerrar el bypass por capitalización.
6. **(Opcional, defensa en profundidad) Limitar el tamaño máximo de `stdin`** para evitar agotamiento de memoria con payloads anómalamente grandes.
7. **Ampliar `test-hook-runner.js`** para cubrir explícitamente: stdin vacío → deny, JSON malformado → deny, timeout → deny, y (si es viable simular) fallo de escritura de log → la regla de seguridad se sigue evaluando.

## Script mejorado

Implementé las recomendaciones 1–6 en un archivo nuevo, **`.cursor/hooks/pre-tool-use.improved.js`**, dejando `pre-tool-use.js` intacto para que se pueda revisar el diff antes de reemplazarlo. Cambios de comportamiento respecto al original:

| Escenario | Original | Mejorado |
|---|---|---|
| Excepción no controlada | `allow` (exit 0) | `deny` (exit 2) |
| JSON malformado | `allow` (exit 0) | `deny` (exit 2) |
| `stdin` vacío | `allow` (exit 0) | `deny` (exit 2) |
| Timeout de lectura de stdin | sin límite (depende de Cursor) | `deny` (exit 2) a los 5s, configurable vía `HOOK_STDIN_TIMEOUT_MS` |
| Falla al escribir `hooks.log` | podía degradar a `allow` vía el catch global | se reporta a stderr; la regla de seguridad se evalúa igual |
| `dangerous_action` (minúsculas) | pasaba sin bloquear | bloqueado (normalización a mayúsculas) |
| Caso feliz (`allow`) / palabra clave (`deny`) | sin cambios | sin cambios |

Validé las 6 rutas manualmente (allow, deny por palabra clave, bypass por capitalización, stdin vacío, JSON malformado y timeout simulado con `HOOK_STDIN_TIMEOUT_MS=1000`); las seis produjeron la decisión esperada.

### Un punto de diseño a decidir con el equipo

En el punto 2, opté porque **una falla de logging no bloquee llamadas legítimas** (se reporta a stderr en vez de denegar). Esto es una desviación deliberada de "fail-closed ante toda excepción": si prefieren que *cualquier* falla, incluida la de logging, deniegue la herramienta (fail-closed absoluto, al costo de que un disco lleno bloquee todo el uso de herramientas hasta resolverlo), es un cambio de una línea (mover el `try/catch` del `appendFileSync` para que su error propague hacia `denyAndExit` en vez de a stderr).

## Próximos pasos sugeridos

- Revisar `pre-tool-use.improved.js`, decidir el punto de diseño anterior, y sustituir `pre-tool-use.js` cuando se apruebe.
- Ampliar `test-hook-runner.js` con los casos de la recomendación 7.
- Considerar renombrar/crear `test-critical-bugs.js` si la intención original era tener un archivo dedicado a estos 3 escenarios de fail-open, ya que actualmente no existe.
