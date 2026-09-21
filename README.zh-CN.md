# Codex with ChatGPT

[English](README.md) | **简体中文**

> ChatGPT 负责思考，Codex 负责干活。

> 权限说明：下文“只读”描述适用于默认模式。显式启用 `--access full` 后，网页应用可直接读写文件和执行终端命令，权限等同启动程序的系统用户，不受项目目录限制。

## 解决什么问题

ChatGPT 付费订阅的网页版额度大量闲置，Codex 却在消耗紧张的 API 额度做
规划和 Review。本项目把"思考"交给你已付费的网页版 ChatGPT，Codex 只负责
执行。不调用模型 API、不搞逆向代理——官方网页 + 只读 MCP 桥接。
可选的 OpenAI Tunnel 连接需要 runtime API key。

## 这是什么

把 ChatGPT 网页版变成 Codex 编码会话的"规划与审查大脑"，而执行权完全保留在
Codex 手里。不会整包上传项目，但被请求的文件内容会通过连接传输——ChatGPT 通过一条安全的、受认证与访问控制保护的
**只读** MCP 连接，按需读取当前工作区里它真正需要的那几行代码。

## 一段话安装（默认不使用 Cloudflare）

**直接复制下面整段给 Codex。** 自动完成安装、生成配置、启动连接和网页验证；
只有登录、授权、验证码，以及把密钥保存到本机时需要你操作，不需要自己拼启动命令。

> 本分叉包含 `c2c openai setup`，请使用本页下方指定的下载地址，不要安装尚未包含本功能的原版。
> 需要 Tunnel 使用权限与开发者模式；订阅本身不代表已有这些权限。

```text
请从 https://github.com/simplaj/codex-with-chatgpt 安装本分叉，
为我一键配置“不使用 Cloudflare”的连接，目标是我要工作的项目。
我是非技术用户，请你完成以下步骤，不要只给我操作文档：

1. 先区分工具安装目录和目标项目目录；如果目标不明确，只问我项目路径。
   将 https://github.com/simplaj/codex-with-chatgpt 克隆到 ~/codex-with-chatgpt-openai。
   如果目录已存在，先核实来源与本地修改，复用含 c2c openai setup 的版本；
   不要覆盖修改、切回原版或盲目 git pull。
2. 检查 git、Node.js >= 20、pnpm，按公司允许的方式补齐依赖；安装依赖并构建。
3. 将 skill/SKILL.md 安装到 ~/.codex/skills/codex-with-chatgpt/SKILL.md，
   把 “The codex-with-chatgpt checkout lives at:” 的路径改成当前实际工具目录。
4. 严格执行 Skill 中的 “OpenAI one-paste setup” 全流程：安装独立 runtime，
   获取或创建 Tunnel 并关联正确的使用范围，生成本地配置，启动，检查健康状态，
   在网页创建 Tunnel 连接，并实际验证文件读取和 Git 查询。
5. 禁止安装、启动或回退到 cloudflared；禁止运行旧 c2c setup/doctor 流程。
   密钥不得发到聊天、作为命令行参数或写入目标项目；通过本机私密文件配置。
6. 能自动完成的你自己做。登录、验证码、授权或保存密钥时，先一次给出完整清单，再按我的偏好引导。
   缺少权限时明确告诉我缺什么，不要假装成功，也不要尝试绕过公司网络限制。
7. 完成后展示验证清单，以及以后如何继续、重启和停止。
   必须明确“本机已配置”和“网页已实际连通”是两个不同状态。
```

之后只需要说：**“使用这套无 Cloudflare 连接，帮我实现 XXX。”**
连接断开时说：**“修复无 Cloudflare 连接，不要切换到 Cloudflare。”**

运行方式：当前启动器是持续运行的进程，不会自动注册开机服务。
关闭它所在的终端或重启电脑后，让 Codex 按已保存配置重新启动即可。
完整技术步骤与权限说明见[配置指南](docs/openai-tunnel.md)。

## 完整读写与终端执行（显式开启）

默认只读；如果需要网页直接改文件、运行测试和终端命令，请在安装请求中补充：

> 请启用 `--access full`。我需要读写文件和执行终端命令，理解其权限等同于启动程序的系统用户，不局限于项目目录。停止旧实例、保存配置、重新启动并刷新应用工具后，实际验证读、写和命令执行。

新增 `read_file_full`、`write_file`、`execute_command` 三个工具；原九个工具保持原限制。
完整模式不提供项目沙箱，也不自动获取管理员权限。调用者能够访问系统用户可访问的文件、网络和程序，可能删除数据或读取凭证；仅向可信人员开放，推荐用独立系统用户或容器运行。
已有安装不会自动升级权限。改模式后需要重启连接，并刷新网页应用的工具列表。

## 安装时你需要做的事（一次看全）

1. 确认目标目录；说“当前文件夹”即可，空目录也支持，不需要先初始化 Git。
2. 在连接管理页面创建或选择 Tunnel，关联准备使用的 ChatGPT 工作空间，记下 ID。
3. **在 API keys 设置页创建运行密钥，不是在 Tunnel 详情页找。** 按当前运行程序支持的密钥类型授予 Tunnels Read、Use；创建连接另需 Manage。不要用用户 ID 代替密钥，也不要为了排错改成 All/Admin。
4. 在自己的终端运行工具目录中的 `scripts/save-runtime-key.py`（用 `python3`），按隐藏提示粘贴密钥。密钥不发聊天、不放项目目录。重复保存需要明确加 `--replace`；Windows 使用用户私有 ACL 的本地文件。
5. 助手完成本机配置与启动。只有运行程序健康后才添加网页应用。
6. 打开 [应用管理](https://chatgpt.com/plugins) → Create app；如果没有入口，检查设置中的开发者模式及管理员权限。选择 Connection → Tunnel、对应 ID、Authentication → None，不填密钥或 HTTP 地址。
7. 启用应用，实际调用 `workspace_info`、读取一次随机验证码文件、调用 `git_status`。空目录返回“非 Git 仓库”是正常结果。完整模式再验证创建新测试文件、读取回来及无副作用命令。

助手应分别汇报：安装完成、配置已保存、运行程序健康、网页验收通过。
`appVerified: null` 仅表示本地无法检查网页，不表示失败。没有浏览器自动操作工具时，助手应提前说明并一次给全网页操作清单。
密钥格式错误时先核对保存内容和运行程序兼容性，不要反复盲目重新创建密钥。

## 旧版 Cloudflare 安装（仅显式选择此模式时）

不懂 git、Node、终端？完全不需要懂。把下面这段话原样复制给你的编码
Agent（Codex），然后去倒杯咖啡：

```text
请帮我完整安装并配置 Codex with ChatGPT，全程自动，我是不懂技术的小白，
所有事情你自己做：

1. 环境自检：需要 git 和 Node.js ≥ 20，缺什么就自动安装
  （macOS 用 Homebrew，Windows 用 winget），同时安装 cloudflared。
2. 下载：把 https://github.com/XiaoDuoYa/codex-with-chatgpt 克隆到
   ~/codex-with-chatgpt（已存在就 git pull 更新）。
3. 构建：在该目录里执行 corepack pnpm install 和 corepack pnpm build。
4. 安装 Skill：把仓库里的 skill/SKILL.md 复制到
   ~/.codex/skills/codex-with-chatgpt/SKILL.md，并把文件中
   "The codex-with-chatgpt checkout lives at:" 那一行的路径改成实际克隆路径。
5. 首次配置：按 SKILL.md 里的 first-time setup 流程执行
  （运行 c2c setup，用内置浏览器打开 ChatGPT 配置连接器并输入配对码）。
   全程只用内置浏览器，禁止打开任何第三方浏览器。
6. 只有遇到需要我登录（ChatGPT / Cloudflare）、验证码或两步验证时才叫我，
   而且先一次给出完整清单，再按我的偏好引导。
7. 完成后给我看 ✓ 清单，并确认文件读取测试通过。我不懂 MCP、OAuth、
   Tunnel、端口这些词，不要向我解释；出了问题先自己修。
```

**更新**：此修改版不要自动覆盖为原版。升级前先确认目标版本包含无 Cloudflare 功能，并保留本地修改。

## 旧版 HTTP 配置参考（仅 Cloudflare 模式）

1. 安装 Codex Skill：把 `skill/` 复制到 `~/.codex/skills/codex-with-chatgpt/`。
2. 对 Codex 说：**"使用 Codex with ChatGPT 完成首次配置。"**
3. 之后正常使用：**"使用 Codex with ChatGPT，帮我实现 XXX。"**

说明书到此结束。你不需要知道 MCP、OAuth、Tunnel、端口、localhost 是什么——
Codex 会自动完成所有配置，你只会看到：

```
Codex with ChatGPT

✓ 当前项目已识别
✓ Workspace Bridge 已启动
✓ 安全连接已建立
✓ ChatGPT 已连接
✓ 文件读取测试通过

Ready.
```

唯一可能需要你动手的步骤：登录 ChatGPT（如果要用固定域名，再登录一次 Cloudflare）。**新仓库**还会请你在 ChatGPT 里建一次项目（合集）：名字用仓库名，记忆选「仅限项目记忆」。侧栏如果没有「项目」，把鼠标放在「聊天」上，点右边三个点，选「按项目整理」。之后对话都从合集页开，不用回首页。已经在用的仓库默认还是原来的一条长对话，除非你说要改成 Project。

### 可选的固定域名

默认公网地址是临时的，桥重启后会变。Codex 会删掉这个项目的 ChatGPT 插件再按新地址加回去。

如果你有 Cloudflare 账号，并且域名已经加在 Cloudflare 上，首次配置时（老用户则在下一次编码时问一次）会问你要不要用固定域名，例如 `c2c-<项目>.你的域名`。选是的话，浏览器里授权一次 Cloudflare 即可。之后重启一般不用再改插件。没有账号、不想用、登录失败：继续用临时地址，功能一样，只是修复更慢。

凭证放在系统目录，不进项目。

## 工作原理

默认新模式：网页应用 → 安全隧道 runtime → `mcp-stdio` → 指定项目。
下面的图展示单独保留的旧版 HTTP/Cloudflare 模式。

```
             ┌───────────────────────────┐
             │      ChatGPT 网页版       │
             │   推理 / 规划 / 审查      │
             └──────────┬──────────▲─────┘
                        │          │
               MCP      │          │ Computer Use
              数据面    │          │ 控制面（消息 < 1 KB）
                        ▼          │
             ┌─────────────────────┐
             │      C2C Bridge     │   仅监听本机回环地址
             │  只读 MCP           │   OAuth 2.1 + 一次性配对码
             │  OAuth + 配对       │   Cloudflare Quick Tunnel
             │  Tunnel 管理        │
             └──────────┬──────────┘
                        │  只读
                        ▼
             ┌─────────────────────┐          ┌─────────────────────┐
             │     本地工作区      │◀─────────│    Codex Harness    │
             └─────────────────────┘ 编辑/git │  Shell / 测试 / 修复 │
                                              └─────────────────────┘
```

- **控制面（Computer Use）**：Codex 与 ChatGPT 之间只交换极小的结构化 `[C2C]`
  状态消息——`INIT → PLAN → EXECUTED → REVIEW → DONE`。绝不粘贴 diff、日志
  或文件内容。
- **数据面（MCP）**：ChatGPT 缺什么自己拉什么，共 9 个只读工具：
  `workspace_info`、`list_directory`、`read_file`、`search_workspace`、
  `git_status`、`git_diff`、`test_status`、`execution_summary`、
  `execution_output`。
- **独立审查**：Codex 执行完毕后，ChatGPT 通过 MCP 亲自检查真实的 git diff
  和测试记录——绝不因为 Codex 说"测试全过"就直接相信。

## 安全模型（简版）

- **从构造上只读**：服务端根本不存在写文件/删除/Shell/提交类工具，任何提示
  注入都无法启用它们。
- **一个工作区 = 一道边界**：每个令牌绑定单一工作区；路径校验基于规范化
  realpath（symlink、`../`、绝对路径逃逸全部被拦截并有测试覆盖）。
- **敏感文件永不外泄**：`.env*`、密钥、SSH、各类凭据默认拒绝
  （`.env.example` 放行）；`.c2cignore` 可追加自定义规则。
- **知道 URL 不等于有权限**：公网 MCP 端点强制 OAuth 2.1（PKCE S256、动态
  客户端注册、refresh token 轮换）。无令牌：401；令牌属于别的工作区：403。
- **模型永远接触不到长期凭据**：唯一会出现在浏览器里的秘密是一次性配对码
  （5 分钟有效、限 5 次尝试、限速、用后即毁）。

完整威胁模型：[docs/security.md](docs/security.md)

## 开发者

```bash
pnpm install
pnpm build          # 产出 dist/，暴露 c2c 命令
pnpm test           # vitest：202 个测试（路径安全、OAuth、配对、MCP 端到端）

c2c setup           # 一条命令：Bridge + 隧道 + 配对码
c2c sandbox-allow   # 把本地设置目录加入 Codex 沙箱白名单（macOS / Windows）
c2c status / doctor / pair / unpair / logs / stop
```

环境要求：Node.js >= 20、git；Cloudflare 公网连接需要 `cloudflared`
（自动检测，Skill 会替你安装）。如果 QUIC 被拦截，设置
`C2C_TUNNEL_PROTOCOL=http2` 后重启 Bridge。

文档：[架构](docs/architecture.md) · [协议](docs/protocol.md) ·
[安全](docs/security.md) · [故障排查](docs/troubleshooting.md)

## 目录结构

```
src/
  bridge/     本机回环 HTTP 服务、端口自动恢复、管理 API
  mcp/        9 个只读工具、Streamable HTTP 和 stdio 传输
  auth/       OAuth 2.1（PKCE、动态注册、refresh 轮换、吊销）
  pairing/    一次性配对码（CSPRNG、TTL、限速）
  workspace/  路径收敛、敏感文件策略、搜索、git
  tunnel/     TunnelProvider 抽象 + Cloudflare Quick Tunnel
  execution/  审查闭环所需的执行记录
  process/    守护进程生命周期
  cli/        c2c 命令行
skill/        Codex Skill（真正的 UX 层）
tests/        单元 + 集成测试
docs/         架构 / 协议 / 安全 / 故障排查
```

## 状态与声明

V1。已端到端验证：Bridge、OAuth + 配对、公网隧道、ChatGPT 连接器配置、
零操作首次配置体验。

**非官方社区项目，与 OpenAI 无关联，未获其背书。**

## 许可证

[MIT](LICENSE)
