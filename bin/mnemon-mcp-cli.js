#!/usr/bin/env node
/**
 * mnemon-mcp-cli — bridge CLI -> mnemon MCP server.
 * Permite scripts (auto_evolve, mnemon_store, cron, launchd) usarem o MESMO
 * caminho MCP que o opencode, em vez de subprocess direto ao binário Go.
 *
 * Uso: mnemon-mcp-cli <tool> [args...]
 *   mnemon-mcp-cli recall "ARES fix" --limit 3
 *   mnemon-mcp-cli remember "conteúdo" --imp 4 --cat decision
 *   mnemon-mcp-cli status
 *
 * Saída: JSON do resultado (como o MCP devolve), ou {error: msg} + exit 1.
 * ponytail: cliente JSON-RPC 2.0 mínimo sobre stdio do server MCP.
 */
const { spawn } = require("child_process");
const path = require("path");

const SERVER = path.join(__dirname, "..", "src", "index.js");
const [,, tool, ...rest] = process.argv;

if (!tool) {
  console.error("uso: mnemon-mcp-cli <tool> [args...]");
  process.exit(1);
}

// Converte args CLI (--key value) em object de input JSON-RPC.
const input = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const val = rest[i + 1];
    if (val !== undefined && !val.startsWith("--")) {
      input[key] = /^\d+$/.test(val) ? Number(val) : (val === "true" ? true : val === "false" ? false : val);
      i++;
    } else {
      input[key] = true;
    }
  }
}

const child = spawn("node", [SERVER], { stdio: ["pipe", "pipe", "inherit"] });
let buf = "";
let reqId = 1;
const pending = new Map();

function send(method, params) {
  return new Promise((resolve, reject) => {
    pending.set(reqId, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: reqId++, method, params }) + "\n");
    setTimeout(() => {
      if (pending.delete(reqId - 1)) reject(new Error("timeout"));
    }, 90000);
  });
}

child.stdout.on("data", (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx);
    buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  }
});

(async () => {
  try {
    await send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "mnemon-mcp-cli", version: "1.0.0" },
    });
    // notificação (sem id) — o SDK espera isto após initialize
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    // Re-mapeia args posicionais: remember/related/import/link têm args posicionais.
    // Para tools com posicionais (remember content, related insight_id, link a b, forget id, import draft).
    const positional = {
      remember: ["content"],
      related: ["insight_id"],
      link: ["source_id", "target_id"],
      forget: ["insight_id"],
      import: ["draft"],
      recall: ["query"],
      search: ["query"],
    };
    const posKeys = positional[tool] || [];
    const named = {};
    const unnamed = rest.filter(a => !a.startsWith("--"));
    posKeys.forEach((k, i) => { if (unnamed[i] !== undefined) named[k] = unnamed[i]; });
    Object.assign(named, input);

    const result = await send("tools/call", { name: tool, arguments: named });
    const text = result && result.content && result.content[0] && result.content[0].text;
    if (text !== undefined) {
      process.stdout.write(text);
      if (!text.endsWith("\n")) process.stdout.write("\n");
    } else {
      process.stdout.write(JSON.stringify(result || {}));
    }
    child.kill();
    process.exit(0);
  } catch (e) {
    // Fallback: se o server MCP falhar (down/timeout), usa o binário Go direto.
    // Resiliência (diretiva 16-Ago: "usa sempre fallback locais").
    child.kill();
    const { execFileSync } = require("child_process");
    const MNEMON = "/Users/augustosilva/.opencode/bin/mnemon";
    const args = rest.slice();
    try {
      const out = execFileSync(MNEMON, args, { timeout: 60000, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
      process.stdout.write(out);
      if (!out.endsWith("\n")) process.stdout.write("\n");
      process.exit(0);
    } catch (e2) {
      console.error(JSON.stringify({ error: e2.message }));
      process.exit(1);
    }
  }
})();
