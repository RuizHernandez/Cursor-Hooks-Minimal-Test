// Hook de prueba del Workspace (.cursor/hooks.json)
console.log(JSON.stringify({ permission: "deny", reason: "WORKSPACE_HOOK_FIRED" }));
process.exit(2);
