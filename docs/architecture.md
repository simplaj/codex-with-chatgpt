# Architecture

```
             ┌───────────────────────────┐
             │    ChatGPT Web / Sol      │
             │  Reason / Plan / Review   │
             └──────────┬──────────▲─────┘
                        │          │
               MCP      │          │ Computer Use
            Data Plane  │          │ Control Plane
                        ▼          │
             ┌─────────────────────┐
             │      C2C Bridge     │
             │  MCP Server (RO)    │
             │  OAuth AS + PRM     │
             │  Pairing Manager    │
             │  Tunnel Manager     │
             │  Admin API (local)  │
             └──────────┬──────────┘
                        │  read-only
                        ▼
             ┌─────────────────────┐
             │   Local Workspace   │
             └──────────▲──────────┘
                        │ edit / shell / git / test
             ┌──────────┴──────────┐
             │  Codex Harness      │
             └─────────────────────┘
```

## Principles

- **ChatGPT thinks. Codex works.** The bridge never re-implements a coding harness.
- **Computer Use = control plane**: tiny `[C2C]` state messages (< 1 KB).
- **MCP = data plane**: ChatGPT pulls files/diffs/search results itself.
- **Read-only by design**: no write/exec tools exist in V1 at all.
- **Workspace is the security boundary**: one bridge = one workspace = one token audience.

## Components (src/)

| Module | Responsibility |
| --- | --- |
| `bridge/` | Express app assembly, loopback-only listener, port fallback, runtime state, admin API |
| `mcp/` | McpServer with 9 read-only tools; stateless Streamable HTTP transport (fresh server per request, JSON responses), or a single-server stdio transport |
| `auth/` | OAuth 2.1 authorization server: discovery metadata (RFC 8414 + Protected Resource Metadata), dynamic client registration (RFC 7591), authorization-code + PKCE (S256 only), refresh rotation, revocation (RFC 7009). Opaque tokens stored as SHA-256 hashes |
| `pairing/` | PairingCode lifecycle: CSPRNG generation, TTL, attempt limits, IP rate limit, one-time use |
| `workspace/` | Canonical-path containment (realpath of deepest existing ancestor), sensitive-file policy, `.c2cignore`, paginated read/list, ripgrep search with Node fallback, git status/diff with pagination |
| `tunnel/` | `TunnelProvider` interface + Cloudflare Quick and workspace-configured Named Tunnel implementations; business logic is vendor-agnostic |
| `execution/` | JSONL execution records plus optional sanitized command output (`execution_output`) |
| `process/` | Daemon spawn/reuse, health probing, graceful shutdown |
| `cli/` | `c2c` commands; `--json` everywhere for the Skill |
| `config/`, `logger/` | OS-convention state dir, secret-redacting logger |

## Request lifecycles

**MCP call**: ChatGPT → tunnel (https) → bridge `/mcp` → bearer middleware
(401/403) → stateless StreamableHTTP transport → tool handler → workspace layer
(path containment → ignore rules → pagination) → JSON result.

**Authorization**: 401 with `WWW-Authenticate: resource_metadata=…` →
`/.well-known/oauth-protected-resource/mcp` → AS metadata → DCR →
`/oauth/authorize` (HTML pairing page) → pairing code verified → 302 with
authorization code → `/oauth/token` (PKCE S256) → access + refresh tokens.

**Ports**: prefer 48765, bind 127.0.0.1 only. On conflict, `/health` identifies
whether the occupant is a c2c bridge for the same workspace (reuse) or not
(fall back to an ephemeral port). Configuration follows automatically via the
runtime state file; users never see ports.

**Tunnel**: default is a Cloudflare Quick Tunnel (`cloudflared tunnel --url …`).
The URL changes per start, so `c2c doctor` can restart it and tell the Skill to
Delete + recreate that workspace's ChatGPT connector. A workspace may instead
choose a named hostname once (`c2c tunnel choose --mode named`). The Skill asks
before the first public URL exists; `cloudflared tunnel login` is the only extra
user step. Tunnel name, hostname and preference live under the OS state dir
(`tunnels/<workspaceId>.json`), never in the project. Named starts use
`cloudflared tunnel --url … run <name>` so the public URL stays stable. If named
provisioning fails, C2C falls back to Quick Tunnel. If a named tunnel later
drops, doctor asks for a Cloudflare re-login (`namedRepair`) instead of
rotating the ChatGPT connector.

## Optional private stdio transport

`c2c mcp-stdio --workspace <absolute-path>` runs the same MCP tool handlers in
a foreground process using stdin/stdout. The workspace option is mandatory;
stdout contains only protocol messages and diagnostics use stderr. It opens no
HTTP bridge, OAuth endpoints, admin API, or Cloudflare process.

OpenAI Secure MCP Tunnel's standalone runtime can launch this process and
forward requests over outbound HTTPS. Tunnel permissions replace HTTP bearer
authentication on this path; all read-only tools remain constrained to the
selected workspace. The runtime owns process supervision and tunnel health,
independently of the existing `c2c doctor`/`stop` bridge commands. See the
[setup and lifecycle guide](openai-tunnel.md).

## Optional full-access stdio tools

Explicit `--access full` registers three additional file/shell tools in the stdio
server. The default HTTP server remains read-only. These full tools run as the
local OS user, not inside the project containment policy; consult security.md.
