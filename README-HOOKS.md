# 🪝 Entorno de Prueba para Hooks de Cursor (`preToolUse`) — `C:\LabCursorTest`

Este entorno contiene la configuración y scripts para probar los **Hooks de Cursor (`preToolUse`)**.

---

## 📁 Estructura del Proyecto

```text
C:\LabCursorTest\
├── .cursor/
│   ├── hooks.json                  # Configuración del hook preToolUse
│   └── hooks/
│       ├── pre-tool-use.js         # Script ejecutor Node.js que intercepta las herramientas
│       ├── test-hook-runner.js     # Suite de pruebas automatizada
│       └── hooks.log               # Registro de auditoría (generado automáticamente)
└── README-HOOKS.md                 # Guía explicativa
```

---

## 🧪 Ejecución de Pruebas

Para probar la intercepción de herramientas y la respuesta de los hooks localmente:

```bash
node .cursor/hooks/test-hook-runner.js
```

---

## ⚙️ Funcionamiento

1. Cursor ejecuta el hook configurado en `.cursor/hooks.json` enviando los datos por `stdin`.
2. El script `.cursor/hooks/pre-tool-use.js` evalúa los parámetros:
   - Si detecta `DANGEROUS_ACTION` o `BLOCK_THIS`, responde con `exit code 2` y deniega la ejecución.
   - En caso contrario, responde con `exit code 0` y permite la ejecución.
3. Todas las transacciones se almacenan en `.cursor/hooks/hooks.log`.
