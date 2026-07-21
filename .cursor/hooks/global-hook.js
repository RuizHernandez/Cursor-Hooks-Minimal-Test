// Hook de prueba Global (~/.cursor/hooks.json)
console.log(JSON.stringify({ permission: "deny", reason: "GLOBAL_HOOK_FIRED" }));
process.exit(2);
