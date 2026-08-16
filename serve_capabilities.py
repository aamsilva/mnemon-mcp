#!/usr/bin/env python3
"""serve_capabilities.py (mnemon-mcp) — expõe o mnemon-mcp por HTTP via Tailscale.
Endpoint: POST /api/call  {name, args, caller, source}
          GET  /health    estado do server
Uso: python3 serve_capabilities.py  (porta 8098)
Padrão: replicado do super-browser-mcp serve_capabilities.py (16-Ago) —
o Neo/VPS não podem usar stdio local do Mac Mini; HTTP é a única via remota.
"""
import json, subprocess, time, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

PORT = 8098
MCP_BIN = ["/opt/homebrew/bin/node", "/Volumes/disco1tb/tools/mnemon-mcp/src/index.js"]
LOG_FILE = Path("/Volumes/disco1tb/logs/mnemon-mcp-api.log")

def log(msg):
    try:
        with LOG_FILE.open("a") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass

def _coerce(v):
    """WebUI/enviam strings — coerce para tipos (zod do MCP exige number/bool)."""
    if isinstance(v, str):
        s = v.strip()
        if s.lower() in ("true", "false"):
            return s.lower() == "true"
        try:
            return int(s)
        except Exception:
            try:
                return float(s)
            except Exception:
                pass
        if s.startswith("{") or s.startswith("["):
            try:
                return json.loads(s)
            except Exception:
                pass
    return v

def call_tool(name, args, caller="remote", source="api"):
    args = {k: _coerce(v) for k, v in (args or {}).items()}
    t0 = time.time()
    try:
        p = subprocess.Popen(MCP_BIN, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        init = {"jsonrpc": "2.0", "id": 1, "method": "initialize",
                "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                           "clientInfo": {"name": caller, "version": "1"}}}
        p.stdin.write(json.dumps(init) + "\n")
        p.stdin.write(json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/call",
                                  "params": {"name": name, "arguments": args}}) + "\n")
        p.stdin.flush()
        out = ""
        deadline = time.time() + 50
        while time.time() < deadline:
            line = p.stdout.readline()
            if not line:
                break
            try:
                d = json.loads(line)
                if d.get("id") == 2:
                    out = d.get("result", {}).get("content", [{}])[0].get("text", "")
                    break
            except Exception:
                continue
        p.kill()
        ms = (time.time() - t0) * 1000
        ok = bool(out) and '"error"' not in out[:50]
        log(f"{name} ok={ok} {ms:.0f}ms source={source} caller={caller}")
        return {"ok": ok, "latency_ms": round(ms), "result": out[:1000000], "source": source}
    except Exception as e:
        ms = (time.time() - t0) * 1000
        log(f"{name} ERRO {str(e)[:200]} source={source}")
        return {"ok": False, "latency_ms": round(ms), "error": str(e)[:300]}

class Handler(BaseHTTPRequestHandler):
    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path in ("/", "/health"):
            self._json({"ok": True, "service": "mnemon-mcp", "endpoints": ["POST /api/call", "GET /health"], "port": PORT})
        else:
            self._json({"error": "not found"}, 404)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/api/call":
            self._json({"error": "not found"}, 404)
            return
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)) or 0))
        except Exception as e:
            self._json({"ok": False, "error": f"bad json: {e}"}, 400)
            return
        # detect source por IP do cliente (padrão super-browser)
        ip = self.client_address[0]
        src = {"127.0.0.1": "local"}.get(ip, f"remote-{ip}")
        res = call_tool(body.get("name", ""), body.get("args", {}),
                        caller=body.get("caller", "remote"), source=body.get("source", src))
        self._json(res)

    def log_message(self, *a):
        pass

if __name__ == "__main__":
    log(f"serve_capabilities mnemon-mcp arrancou na porta {PORT}")
    HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
