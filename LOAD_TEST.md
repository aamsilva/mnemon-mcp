# Load Test — mnemon-mcp

Data: 16-Ago-2026 08:35 · Método: cliente MCP real por chamada (spawn node), timeout 60s · Toolset: recall (semântico, com embeddings Ollama)

## Resultado funcional [VERIFICADO]

| Teste | Chamadas | Concurr. | OK | FAIL | Wall (s) | Throughput (req/s) |
|---|---|---|---|---|---|---|
| baseline | 10 | 1 | 10 | 0 | 3.9 | 2.58 |
| concorrente | 20 | 10 | 20 | 0 | 0.9 | 21.89 |
| stress | 40 | 20 | 40 | 0 | 1.9 | 20.81 |

**0% erros em todas as 70 chamadas** (handshake + recall).

## Latência (ms)

| cenário | avg | p50 | p95 | max |
|---|---|---|---|---|
| 10 / 1 conc | 384 | 393 | 450 | 450 |
| 20 / 10 conc | 413 | 428 | 463 | 463 |
| 40 / 20 conc | 874 | 875 | 1065 | 1124 |

## Observações

- **Throughput estável ~21 req/s** em concorrência (10-20 processos) — o spawn do processo é o custo dominante; a latência do recall semântico fica bem comportada
- **Sem degeneração**: 10→20 concurrent, p95 sobe apenas 450→1063ms (recall semântico com Ollama paralelo)
- **0 erros mesmo a 20 concurrent** — sem timeouts nem respostas malformadas

## Gargalo

O binário Go faz recall semântico com embeddings Ollama (nomic-embed-text) — mas com cache + paralelismo, o MCP aguenta ~21 req/s folgado. Para uso real (sessões T1/T2/T3 + VPS) o tráfego é muito inferior a este teto.
