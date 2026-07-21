// Script para simular un Timeout (bloqueo prolongado o congelamiento de stdin)
console.log("Iniciando espera prolongada para provocar timeout...");
setTimeout(() => {
  console.log(JSON.stringify({ permission: "allow" }));
  process.exit(0);
}, 15000); // Espera de 15 segundos
