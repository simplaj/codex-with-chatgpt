# OpenAI Secure MCP Tunnel (without Cloudflare)

C2C can serve its nine read-only tools over stdio. OpenAI's runtime launches
that local process and carries MCP requests over outbound HTTPS:

```text
ChatGPT → OpenAI Secure MCP Tunnel → tunnel-client-runtime
                                    → c2c mcp-stdio → selected workspace
```

This path needs no `cloudflared`, public C2C URL, HTTP bridge, or C2C pairing
code. The existing Cloudflare setup remains available separately.

## Automatic setup (recommended)

Copy the one-paste prompt at the top of either README into your coding agent.
The installed Skill's **OpenAI one-paste setup** is the complete runbook: it
installs the standalone runtime, handles account setup with human login/consent,
saves configuration, starts a supervised process, creates the app and verifies
actual tool calls. Do not use the legacy Cloudflare one-paste prompt.

The CLI now provides the following agent-facing commands after building:

```bash
node /absolute/tool/bin/c2c.js openai setup \
  --workspace /absolute/project \
  --runtime /absolute/tunnel-client-runtime \
  --tunnel-id tunnel_REPLACE_ME \
  --key-file /absolute/private/runtime-key --json
node /absolute/tool/bin/c2c.js openai run --workspace /absolute/project
# From a second terminal while run remains active:
node /absolute/tool/bin/c2c.js openai doctor --workspace /absolute/project --json
```

`setup` stores non-secret configuration in the user state directory, selects a
loopback health port and preserves it on repeated setup. The key file must be
outside the exposed project with mode 0600 on Unix (restrict its ACL on Windows).
Its content is the key alone. Do not paste the key into chat or a command line.
Alternatively omit `--key-file` and provide `CONTROL_PLANE_API_KEY` in the
launch environment. `run` reads the key without printing it and sets the runtime
variables and MCP command automatically. It uses a per-tunnel lock to prevent
duplicate starts within this installation. Cross-machine duplicates still need
operational coordination. `doctor` returns readiness, **not** proof of app access.

The agent keeps `run` in a persistent terminal. Ctrl-C that terminal to stop;
after a reboot ask the agent to run it again. No automatic OS startup service
is installed. Stale locks require confirming that the recorded process and
runtime have stopped before removal. To change a mapping, stop the runtime and
explicitly remove its non-secret configuration before repeating setup.

The sections below are the manual reference, not tasks the user must perform
instead of the one-paste workflow.

## Requirements

- Build C2C with Node.js >= 20 and `pnpm install && pnpm build`; git is needed
  for git tools.
- In [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels),
  create or select a tunnel and associate it with the target ChatGPT workspace.
- Have a runtime API key and Tunnels **Read + Use** permissions; creating or
  editing a tunnel additionally needs **Manage**. ChatGPT developer-mode access
  is a separate permission.
- Permit outbound HTTPS to `api.openai.com:443` (or `mtls.api.openai.com:443`
  when control-plane mTLS is configured).
- Download the **`tunnel-client-runtime`** artifact for your OS/architecture
  from the [official latest release](https://github.com/openai/tunnel-client/releases/latest).
  Avoid `tunnel-client-runtime-cloudflared` and the bundled full-client/Homebrew
  distribution when company policy prohibits Cloudflare software. The narrow
  runtime supports `run`, `--help`, and `--version`; it does **not** support the
  full client's `init`, `doctor`, or profile-management commands.

This connection requires a runtime API key, even though C2C does not call a
model API. Keep it in a local secret store or runtime environment; never paste
it into ChatGPT or commit it to a project.

## Launch the local server through the runtime

Use absolute paths for Node, the built C2C launcher, and the workspace. The
runtime may start from a different working directory. Replace the sample
values below; supply `CONTROL_PLANE_API_KEY` securely in your local shell or
service environment before launch.

```bash
export CONTROL_PLANE_TUNNEL_ID='tunnel_0123456789abcdef0123456789abcdef'
export MCP_COMMAND='"/absolute/path/to/node" "/absolute/path/to/codex-with-chatgpt/bin/c2c.js" mcp-stdio --workspace "/absolute/path/to/your-project"'
/absolute/path/to/tunnel-client-runtime run --health.listen-addr 127.0.0.1:8080
```

The command inside `MCP_COMMAND` is started by the runtime; do not pipe it
through a shell logger or prepend package-manager banners. Stdout is reserved
for MCP JSON-RPC. C2C diagnostics go to stderr.

Run **one active runtime per tunnel ID**. Stop the old instance before restarting;
multiple instances with the same tunnel ID can send initialization and later
calls to different stdio children. Use separate tunnel IDs for separate
workspaces. Keep the runtime running for app discovery and all tool calls.

The local runtime health UI is `http://127.0.0.1:8080/ui`; `/healthz` and
`/readyz` expose health and readiness. If that port is occupied, choose another
loopback port with `--health.listen-addr`. Consult the installed binary's
`run --help` for proxy, CA, mTLS, and logging options.

## Connect ChatGPT and verify

1. Enable developer mode in the target ChatGPT workspace.
2. Open [ChatGPT Plugins](https://chatgpt.com/plugins), create a developer-mode
   app, choose **Connection → Tunnel**, and select or enter your tunnel ID.
3. This stdio server has no application-level OAuth flow. If authentication is
   requested during app creation, use the no-auth option for the MCP server;
   tunnel permissions still control access. Do not enter a C2C HTTP `/mcp` URL
   or request a C2C pairing code.
4. From a conversation with the app enabled, call `workspace_info`, read a
   known non-sensitive file with `read_file`, and call `git_status`. Check that
   the returned workspace matches the intended project.

Local stdio tests validate C2C's MCP protocol and workspace protections. A
successful real ChatGPT connection must be verified separately with your
account, tunnel permissions, runtime, and company network.

## Lifecycle and migration

`c2c setup`, `start --tunnel`, `doctor`, `pair`, and `stop` manage the existing
HTTP/Cloudflare bridge; they do not supervise or diagnose this external runtime.
Use the runtime's health endpoints and logs for the tunnel path, and stop its
foreground process with Ctrl-C (or use your normal service manager).

For an existing Cloudflare connection, run `c2c stop --workspace <project>` to
stop its bridge, then configure the new Tunnel app. Verify the new app's file
read before removing the old app. `c2c unpair` revokes C2C OAuth grants only;
it does not revoke Tunnel access. To withdraw Tunnel access, stop the runtime
and remove the app or change the tunnel's permissions/associations.

The local harness can still record execution results through C2C's existing
record commands; the stdio tools read the same per-workspace execution storage.

## Security boundary

The stdio process trusts its launching runtime and exposes all nine read-only
tools for the one explicitly selected workspace. It does not apply C2C bearer
tokens or per-token scopes: authorization moves to the tunnel's organization
and workspace permissions and local process ownership. Anyone allowed to use
this tunnel can invoke those tools for that workspace. Preserve the workspace
mapping when editing runtime configuration.

Path containment, sensitive-file rules, `.c2cignore`, response limits, and
execution-output sanitization are shared with the HTTP implementation. Stdio
opens no HTTP listener or public endpoint. Keep runtime credentials outside
the exposed workspace and retain loopback-only health/admin endpoints.

## Troubleshooting

- **Tunnel absent in ChatGPT:** check the target ChatGPT workspace association,
  Tunnels Read + Use, and developer-mode permission. A Platform organization
  association alone does not make it visible in every ChatGPT workspace.
- **No tools / failed calls:** check runtime logs, `/readyz`, absolute paths,
  the built `dist/` files, and the selected workspace. Keep exactly one runtime
  instance active for this tunnel ID.
- **JSON-RPC parse errors:** use the `node .../bin/c2c.js mcp-stdio` command
  directly. No banners or other text may be written to the child's stdout.
- **Corporate TLS/proxy errors:** configure the approved proxy and CA bundle
  using the runtime's supported options. Disabling TLS verification is not
  needed for this integration.
- **Runtime stopped:** restart it with the same tunnel ID and workspace;
  reinitialize/reconnect the app if needed. No temporary public URL has changed.
- **`ACCESS_DENIED_SENSITIVE_FILE`:** expected for secrets and ignored paths;
  verify with a harmless tracked source file instead.

Sources: [Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels),
[runtime artifacts](https://github.com/openai/tunnel-client#narrow-runtime-artifacts),
[stdio configuration and limits](https://github.com/openai/tunnel-client/blob/main/docs/configuration.md#stdio-deployment-limits).
