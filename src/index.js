#!/usr/bin/env node
/**
 * mnemon-mcp — MCP server para a memória mnemon (MAGMA four-graph).
 * Camada fina sobre o binário Go `mnemon` (recall/remember/search/link/status).
 * Consumível por opencode, VS Code, Cursor, Antigravity, Claude Code e VPS.
 * Criado 16-Ago: user pediu memória acessível em várias máquinas e ferramentas.
 */
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
const MNEMON = "/Users/augustosilva/.opencode/bin/mnemon";
const TIMEOUT = 60000;

function run(args) {
  const out = execFileSync(MNEMON, args, { timeout: TIMEOUT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  try { return JSON.parse(out); } catch { return { raw: out }; }
}

const server = new McpServer({ name: "mnemon-mcp", version: pkg.version });

server.tool("recall", "Recupera insights por keyword (semântico MAGMA: keyword+vector+RRF).",
  { query: z.string().describe("Query (ex: 'ARES fix sentiment')"), limit: z.number().optional() },
  async ({ query, limit = 5 }) => {
    const d = run(["recall", query, "--limit", String(limit)]);
    return { content: [{ type: "text", text: JSON.stringify(d) }] };
  });

server.tool("search", "Pesquisa insights com scoring token-based (literal, sem embeddings).",
  { query: z.string().describe("Query"), limit: z.number().optional() },
  async ({ query, limit = 5 }) => {
    const d = run(["search", query, "--limit", String(limit)]);
    return { content: [{ type: "text", text: JSON.stringify(d) }] };
  });

  server.tool("related", "Insights relacionados via graph traversal (BFS, edges).",
  { insight_id: z.string().describe("ID do insight de partida"), depth: z.number().optional(), edge: z.enum(["temporal","semantic","causal","entity"]).optional() },
  async ({ insight_id, depth = 2, edge }) => {
    const args = ["related", insight_id, "--depth", String(depth)];
    if (edge) args.push("--edge", edge);
    const d = run(args);
    return { content: [{ type: "text", text: JSON.stringify(d) }] };
  });

  server.tool("remember", "Guarda um novo insight (auto-cat, dedup, extração de entidades via binário Go).",
  { content: z.string().describe("Conteúdo do insight"), cat: z.enum(["preference","decision","fact","insight","context","general"]).optional(), imp: z.number().optional().describe("Importância 1-5"), source: z.enum(["user","agent","external"]).optional().describe("origem"), tags: z.string().optional().describe("tags separadas por vírgula") },
  async ({ content, cat, imp = 3, source, tags }) => {
    const args = ["remember", content, "--imp", String(imp)];
    if (cat) args.push("--cat", cat);
    if (source) args.push("--source", source);
    if (tags) args.push("--tags", tags);
    const d = run(args);
    return { content: [{ type: "text", text: JSON.stringify(d) }] };
  });

  server.tool("link", "Cria/atualiza uma edge entre dois insights.",
  { source_id: z.string().describe("ID de origem"), target_id: z.string().describe("ID de destino"), type: z.enum(["temporal","semantic","causal","entity"]).optional(), meta: z.string().optional().describe("JSON metadata (ex: {\"reason\":\"similar\"})") },
  async ({ source_id, target_id, type, meta }) => {
    const args = ["link", source_id, target_id];
    if (type) args.push("--type", type);
    if (meta) args.push("--meta", meta);
    const d = run(args);
    return { content: [{ type: "text", text: JSON.stringify(d) }] };
  });

server.tool("status", "Estatísticas da memória (categorias, entidades, edges, tamanho DB).",
  {},
  async () => {
    const d = run(["status"]);
    return { content: [{ type: "text", text: JSON.stringify(d) }] };
  });

server.tool("forget", "Soft-delete de um insight (arquiva, nunca apaga definitivamente).",
  { insight_id: z.string().describe("ID do insight") },
  async ({ insight_id }) => {
    const d = run(["forget", insight_id]);
    return { content: [{ type: "text", text: JSON.stringify(d) }] };
  });

const transport = new StdioServerTransport();
server.connect(transport).catch(e => { console.error("[mnemon-mcp]", e.message); process.exit(1); });
