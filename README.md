# mnemon-mcp

MCP server para a memória **mnemon** (MAGMA four-graph). Camada fina Node sobre o binário Go `mnemon` — consumível por opencode, VS Code, Cursor, Antigravity, Claude Code e VPS (multi-máquina).

> 🔒 **PRIVADO por design**: expõe memória pessoal. O código não contém dados (só invoca o binário local), mas o repo é privado por segurança. A BD (`~/.mnemon/data/default/mnemon.db`) NUNCA entra no repo.

## Arquitetura

```
┌─ Cliente MCP (opencode / VS Code / Cursor / Claude Code / VPS)
│     │  stdio (JSON-RPC 2.0)
│     ▼
│  mnemon-mcp (Node, src/index.js)  ← 12 tools
│     │  execFileSync (~60s timeout, 32MB buffer)
│     ▼
│  binário Go: /Users/augustosilva/.opencode/bin/mnemon
│     │  SQLite + Ollama embeddings (nomic-embed-text)
│     ▼
│  mnemon.db (MAGMA: insights, entities, edges, oplog)
```

**Paralelo** (decisão user 16-Ago): não substitui o plugin `mnemon.js` (recall fixo injetado por sessão) nem o `auto_evolve.py` (loop de escrita). É camada complementar para acesso fora do opencode.

## Instalação

```bash
cd /Volumes/disco1tb/tools/mnemon-mcp
npm install
```

Registo no `opencode.json`:
```json
"mnemon-mcp": { "type": "local", "enabled": true,
  "command": ["/opt/homebrew/bin/node", "/Volumes/disco1tb/tools/mnemon-mcp/src/index.js"] }
```

## 12 tools

| Tool | Descrição | Contrato |
|---|---|---|
| `recall` | recall semântico MAGMA (keyword+vector+RRF) | `{query, limit?}` |
| `search` | search token literal | `{query, limit?}` |
| `related` | BFS em edges | `{insight_id, depth?, edge?}` |
| `remember` | guardar insight (auto-cat/dedup/entidades) | `{content, cat?, imp?, source?, tags?}` |
| `link` | edge entre 2 insights | `{source_id, target_id, type?, meta?}` |
| `status` | estatísticas | `{}` |
| `forget` | soft-delete (arquiva) | `{insight_id}` |
| `gc` | candidatos a arquivo | `{threshold?, limit?}` |
| `import` | ingestão batch via draft JSON | `{draft, dry_run?}` |
| `log` | histórico de operações | `{limit?}` |
| `receipt` | receipt privacy-safe | `{limit?}` |
| `viz` | grafo (dot/html) | `{format?}` |

Não expostos (intencional): `embed`, `event`, `setup`, `completion` (manuais/deploy/lifecycle).

## Uso

```bash
# CLI wrapper (testes/scripts)
npx super-browser  # n/a — usar o cliente MCP

# Via cliente MCP
mnemon_mcp_recall    {"query": "ARES fix", "limit": 3}
mnemon_mcp_remember  {"content": "FACTO ...", "cat": "fact", "imp": 4, "source": "agent"}
mnemon_mcp_import    {"draft": "{\"schema_version\":\"1\",\"insights\":[...]}", "dry_run": true}
```

## Contratos reais do binário (16-Ago — corrigidos após handshake)

- `related` NÃO tem `--limit` → usa `--depth` + `--edge` (enum temporal/semantic/causal/entity)
- `link --type` é enum (temporal|semantic|causal|entity), default semantic
- `remember --source` é enum (user|agent|external); aceita `--tags`
- `import` lê ficheiro (o MCP escreve o draft num temp file e apaga no finally)

## Testes

```bash
npm test        # funcionais: handshake + status + recall + remember (dedup)
```

## Load test

Ver `LOAD_TEST.md` (chamadas concorrentes, latência p50/p95).

## Versões

- v1.1.0 — 12 tools completas (16-Ago 00:50)
- v1.0.0 — 7 tools core (16-Ago 00:40)

## Segurança

- Repo **privado** (nunca tornar público — memória pessoal)
- O server só lê/escreve na BD local do utilizador
- `receipt` exporta operações sem conteúdo bruto (privacy-safe)

## Uso via CLI bridge (scripts, cron, launchd) — v1.1.1

Para que **todos os use cases passem pelo MCP** (não só o opencode), existe o bridge
`bin/mnemon-mcp-cli.js` (symlink em `~/.opencode/bin/mnemon-mcp-cli`):

```bash
mnemon-mcp-cli recall "ARES fix" --limit 3      # recall via MCP
mnemon-mcp-cli search "cloudflare 1010"         # search literal
mnemon-mcp-cli remember "facto" --imp 4 --cat decision --source user --entities "a,b"
mnemon-mcp-cli status                           # estatísticas
mnemon-mcp-cli forget <id>                      # soft-delete
```

- **Fala JSON-RPC 2.0 com o MCP server via stdio** — mesmo caminho que o opencode.
- **Fallback automático**: se o server falhar, cai para o binário Go direto
  (resiliência — diretiva 16-Ago "usa sempre fallback locais").
- **Scripts migrados** (16-Ago): `auto_evolve.py`, `mnemon_phase3.py`,
  `mnemon_brief.py`, `mnemon_recall_fallback.py`, `mnemon_store.py`.
- O MCP server agora aceita `entities` e `no_diff` no `remember`
  (flags que o binário Go já suportava).
