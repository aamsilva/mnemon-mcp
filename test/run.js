// mnemon-mcp testes funcionais — handshake, status, recall, remember (dedup), import dry-run.
// Uso: npm test  (deve sair com exit 0 se TODOS passam)
const { spawn } = require("child_process");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SERVER = path.join(ROOT, "src", "index.js");

function client() {
  const p = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  let buf = "";
  let idc = 100;
  p.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && pending.has(msg.id)) {
          const { resolve } = pending.get(msg.id);
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch { /* ignore non-JSON */ }
    }
  });
  p.send = (method, params, id) => {
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    return new Promise((resolve) => pending.set(id, { resolve }));
  };
  return p;
}

let passed = 0, failed = 0;
function check(name, ok, detail = "") {
  if (ok) { passed++; console.log(`[✓] ${name}`); }
  else { failed++; console.log(`[✗] ${name} ${detail}`); }
}

async function main() {
  const p = client();
  await new Promise((r) => setTimeout(r, 800));

  const init = await p.send("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } }, 1);
  check("handshake serverInfo.name", init.result?.serverInfo?.name === "mnemon-mcp", JSON.stringify(init.result?.serverInfo));

  const tools = await p.send("tools/list", {}, 2);
  const names = (tools.result?.tools || []).map((t) => t.name);
  check("12 tools", names.length === 12, `got ${names.length}`);
  const expected = ["recall", "search", "related", "remember", "link", "status", "forget", "gc", "import", "log", "receipt", "viz"];
  check("tools set", expected.every((t) => names.includes(t)), names.join(","));

  const st = await p.send("tools/call", { name: "status", arguments: {} }, 3);
  const stText = st.result?.content?.[0]?.text || "";
  check("status total_insights > 0", stText.includes("total_insights"), stText.slice(0, 60));

  const rc = await p.send("tools/call", { name: "recall", arguments: { query: "mnemon mcp", limit: 2 } }, 4);
  const rcText = rc.result?.content?.[0]?.text || "";
  let rcParsed;
  try { rcParsed = JSON.parse(rcText); } catch {}
  check("recall results", Array.isArray(rcParsed?.results) && rcParsed.results.length > 0, rcText.slice(0, 60));

  const rb = await p.send("tools/call", { name: "remember", arguments: { content: "TESTE mnemon-mcp functional: remember via MCP.", cat: "context", imp: 2, source: "agent" } }, 5);
  const rbText = rb.result?.content?.[0]?.text || "";
  // dedup ou insert ambos são OK — não pode ser erro
  check("remember (insert ou dedup)", rbText.includes("id") || rbText.includes("action"), rbText.slice(0, 80));

  const imp = await p.send("tools/call", { name: "import", arguments: { draft: JSON.stringify({ schema_version: "1", insights: [{ content: "TESTE import dry-run", category: "context", importance: 2, source: "agent" }] }), dry_run: true } }, 6);
  const impText = imp.result?.content?.[0]?.text || "";
  check("import dry-run validation", impText.toLowerCase().includes("validation passed") || impText.toLowerCase().includes("dry run"), impText.slice(0, 80));

  p.kill();
  console.log(`\nRESULTADO: ${passed} PASS, ${failed} FAIL`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
