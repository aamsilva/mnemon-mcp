# CODEX EVAL PROMPT — mnemon (memory system) + mnemon-mcp (MCP layer)

> **Copiar isto para o ChatGPT/Codex como prompt de avaliação.**
> Repos: https://github.com/mnemon-dev/mnemon (core, Apache-2.0) · https://github.com/aamsilva/mnemon @our-fixes (patch de produção) · https://github.com/aamsilva/mnemon-mcp v1.1.1 (camada MCP pública)

---

## 1. O que és / o que fazer

És um revisor de código sénior (Go + Node.js + MCP + sistemas de memória para LLMs). Avalia **mnemon** (sistema de memória MAGMA (four-graph)) e **mnemon-mcp** (server MCP fino que o expõe). Produz uma review **executável**: correção, segurança, performance, API design, robustez de operações — ordenada por P0/P1/P2, cada item com patch proposto. Não reescreves o projecto: avalias e sugerires melhorias, correções e aperfeiçoamentos.

## 2. Contexto — o que é o sistema

```text
Agente LLM (OpenCode/Codex/Claude)
   |
   v
mnemon-mcp (Node, MCP stdio — src/index.js, ~135 lin, camada fina)
   |  subprocess: execFileSync(mnemon, args, {timeout 60s})
   v
mnemon binário Go (core, 386 ficheiros .go / ~7.2K LOC)
   |
   +-- sqlite mnemon.db
   |     insights | edges (temporal/causal/semantic/entity)
   |     embeddings bge-m3 (vector recall)
   +-- MAGMA retrieval: keyword + vector + RRF (beam search)
```

- **12 tools MCP**: recall/search/related/remember/link/status/gc/forget/log/viz/import (+entity ops). `remember` tem dedup + auto-categorização (context/decision/fact/insight/preference/general) + extração de entidades; `import` aceita draft JSON schema_version '1' com dry_run.
- **Importância & lifecycle**: 1..5; shadow GC — `effective_importance = decay(half-life 30d) × importância`; insights ≤2 GC-eligible, ≥4 protegidos (lock); auto-prune por **MaxInsights**.
- **Supersedes**: correções marcam o fact errado (`superseded_by_id`) e a lição nova o fact (`supersedes_id`) — recall **não deve** devolver insights superseded.
- **Deploy real**: single-user production com ~5.1K insights, escrita intensiva via agentes orquestrados, runs 24/7.

## 3. Factos medidos (não hipóteses)

- Recall em produção: ~1.0-1.1s médio (DB 111MB, 5117 insights, 39K+ edges).
- Auto-prune com MaxInsights=1000/5000 **apagou insights reais por engano** → corrigimos produção para 10000 (patch).
- Bug do superseded: insights marcados superseded continuavam a sair no recall (GetAllActiveInsights/GetAllEmbeddings/beam não filtravam) → temos patch branch `our-fixes`.
- Latência remember: dedup por token-Jaccard + vector; import re-embed completa tem tempos mensuráveis segundos→minutos conforme volume.
- MCP wrapper: timeout 60s, maxBuffer 32MB; sem retry; sem streaming.

## 4. Questões de avaliação (respond com evidência do código)

### A. Correctness/MAGMA
1. O beam search + RRF pode devolver resultados **só-keyword** em queries semânticas? Quando e porquê? Como tornar a fusão robusta?
2. `effective_importance` decay + GC: os locks (≥4 protegidos) e as regras de decay toleram **deltas de importância por categoria** (ex: decision vs fact)? Propõe o algoritmo melhor.
3. Dedup por Jaccard de tokens: falsos positivos/negativos esperados (PT/EN mix, camelCase, entidades)? Como melhorar sem perder velocidade?
4. Supersedes: verifica o patch `our-fixes` (recall.go, node.go). Está completo? Falta algum caminho (FTS, viz, related)?

### B. Segurança/robustez do MCP
5. O wrapper corre `execFileSync(MNEMON, args)` com strings do mlt/Data — há injecção de argumentos possible? Qual o patch certo (execFile com array + zod validation dos args)?
6. Concurrency: múltiplos processos MCP + CLI a escrever a mesma SQLite — WAL? Desde busy_timeout? Onde é que isso quebra sob escrita paralela?
7. O `import` não valida o schema do draft? Quais os campos a validar e perigos (mass assignment, encode do embeddings)?
8. Compartir de segredo: mnemon.db nunca nos repos. Há caminho onde o tool echo devolve conteúdo sensível regressado por params (leaks em logs)?

### C. Robustez de operações
9. `remember` fallbacks: se o binário crashar mid-write a DB fica corrupta? Há transações/backup-restore strategy (`.backup()` API + `integrity_check`)?
10. Dois-clones-regressão: já tivemos regressão real porque recompilamos do clone limpo sem o patch de superseded. Propõe mecanismos CI/setup-guard que garantam que **releases sempre levam os patches**.
11. Uma sessão MCP = subprocess filho por chamada/ferramenta? Que truque reduz o switch-overhead? (connector persistent? spawn daemon CLI? — e os trade-offs reais.)

### D. API/TDX design
12. A distância MCP expõe 12 tools; os agentes LLM confundem-se entre `search` (token) vs `recall` (semântico). Merge? Rename? Guião de decisão.
13. Tool descriptions: melhor texto para reduzir mis-selection em agentes LLM?
14. `import` JSON schema versioning: como evoluir sem breaking change?

### E. Performance (com números reais 1.0s recall)
15. Onde estão os hotspots no vector recall? Índice HNSW? Cache de embeddings?
16. WAL + a DB 111MB crescendo: retention strategy que preserve insights 4-5 permanentes.

## 5. O que NÃO é válido alegar

- Não há dados privados nos repos (DB fora). Não espires o mnemon.db local.
- O lat milisseg patter "é rápido/slow" sem números: cites o código ou pergunta.
- Não reescrevas com "novas bibliotecas"; o core é deliberadamente Go+SQLite sem dependências exóticas.

## 6. Formato do output

```markdown
## Veredicto: OK / OK-com-limitações / NEEDS-WORK
## P0 (crítico)   — cada: [arquivo:linha] problema → patch proposto (diff quando possível)
## P1 (importante) — idem
## P2 (nice-to-have)
## O que está BEM (para não apagarmos por engano)
## Sugestões de aperfeiçoamento (roadmap 30d)
```

Prioriza patches **pequenos e executáveis** sobre redesigns (o sistema corre prod 24/7).
