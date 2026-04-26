# Xaide — Design Specification

**Date:** 2026-04-24  
**Status:** Draft — pending user review

---

## Problem & Approach

Existing agent orchestration tools (emdash, Conductor) provide solid multi-agent workflows but lack extensibility — you're limited to the features they ship. Terminal multiplexers (cmux) offer great workspace/pane UX but have no worktree or agent orchestration. No single tool combines both with a layered plugin system, Docker sandboxing, and generic SDD methodology support.

**Xaide** is a cross-platform Electron desktop application that:
- Orchestrates AI coding agents (Claude, Copilot, and others) in isolated git worktrees
- Provides a Zed/VSCode-Agents-inspired UI with pane splitting, browser panel, and workspace switching
- Ships a three-layer extensibility system (config → script hooks → npm plugins)
- Supports optional Docker sandboxing per worktree, agent-agnostic
- Adapts to any task source (GitHub Issues, Linear, Jira) and any SDD methodology (spec-kit, bmad, superpowers, gsd) via a two-tier adapter system
- Ships a community plugin registry for extending agents, adapters, and UI panels

---

## MVP Scope (v1)

**Agents (built-in):** Claude Code, GitHub Copilot CLI

**Methodology adapters (built-in):** spec-kit, bmad, superpowers (obra/superpowers), gsd (get-shit-done)

**Multi-agent workflow integration (built-in):** Squad (`@bradygaster/squad-cli`) — team orchestration, role-based parallel agents, Ralph watch mode

**Source adapters (built-in):** GitHub Issues, Linear, Jira, plain markdown

**Extensibility:** All three plugin layers ship in v1 (config, script hooks, npm plugins) + community plugin registry

**Platforms:** macOS (arm64 + x64); Windows and Linux follow in v1.x

---



| Layer | Choice | Rationale |
|---|---|---|
| Shell | Electron + TypeScript | Cross-platform (macOS, Windows, Linux); same stack as emdash |
| UI | React 18 + Vite + Tailwind + Radix UI | Fast iteration, accessible primitives |
| Terminal | xterm.js + node-pty | Cross-platform PTY, proven in emdash |
| Database | SQLite + Drizzle ORM | Local-first, no server required |
| Browser panel | Electron `<webview>` | Sandboxed, ships with Electron |
| Docker | dockerode (Docker SDK for Node) | Full container lifecycle from main process |
| Git | isomorphic-git + simple-git | Worktree operations, diff, PR creation |
| State | TanStack React Query | Server-state sync between main and renderer |
| IPC | Typed preload bridge (schema-validated) | Safe, maintainable renderer↔main contract |

---

## Architecture

### Process Model

```
Renderer (React SPA)
  └── IPC bridge (typed preload)
        └── Main process (Node.js)
              ├── WorkspaceManager
              ├── AgentOrchestrator
              ├── WorktreeManager
              ├── SandboxManager
              ├── PluginSystem
              ├── MCPRegistry
              ├── TaskAdapterSystem
              └── ReviewWorkflow
```

- **Main process** owns all side effects: worktree/sandbox lifecycle, agent PTYs, git, Docker, plugin loading, hook execution.
- **Renderer** is purely UI: layout, terminal display (xterm.js), diff viewer, browser panel, all React components.
- **IPC bridge** is the only communication channel — fully typed, no raw `ipcRenderer.send`.

### Core Subsystems

#### WorkspaceManager
Manages projects/repos as workspaces. Each workspace has:
- A repo path and base config (`.agentapp/config.yaml`)
- A saved pane layout (restored on switch)
- Active task adapter + source adapter selections
- Sandbox defaults (inherit from global, override locally)

#### AgentOrchestrator
- **Detection on startup** (and rescan on demand): probes `$PATH` and known config locations for installed agents

| Agent | Detection | Config loaded |
|---|---|---|
| Claude Code | `which claude` | `~/.claude/settings.json`, `CLAUDE.md`, MCP servers |
| GitHub Copilot CLI | `which gh` + extension check | `~/.config/gh/`, Copilot settings |
| Codex | `which codex` | `~/.codex/config.yaml` |
| Others | Plugin-registered paths | Plugin-defined config loader |

- Detected agents populate the global registry; undetected agents are shown as "not installed".
- Spawns agent processes via node-pty. Each session gets its own PTY, stdout/stderr streamed to xterm.js in the renderer.
- Supports multiple agents per task via the **best-of-n** pattern (see below).

#### WorktreeManager
- Creates a git branch + worktree for each agent session: `feat/auth-claude-1`, `feat/auth-claude-2`, etc.
- All sessions within a best-of-n task start from the same base commit.
- Fires `worktree.created` hook after creation (init scripts, dep installs, env seeding).
- Tears down worktrees on session discard; keeps worktree alive until user picks a winner.

#### SandboxManager
Docker sandboxing is opt-in, configurable at three levels (later overrides earlier):
1. Global default (`~/.config/xaide/config.yaml`)
2. Workspace default (`.agentapp/config.yaml`)
3. Per-agent-session override at launch time

When enabled:
- `SandboxManager` starts a Docker container (via dockerode), bind-mounting the worktree path
- Agent process runs **inside** the container via `docker exec`
- Container lifecycle is tied to the agent session; torn down on finish unless `keepAlive: true`
- Image source: `Dockerfile` in `.agentapp/`, named image in config, or built-in default image

#### PluginSystem
Three-layer extensibility (each layer is independent; all three can coexist):

**Layer 1 — Config** (`~/.config/xaide/config.yaml` and `.agentapp/config.yaml`)
Declarative YAML: register agents, MCP servers, env vars, sandbox defaults, adapter selections, hook paths.

**Layer 2 — Script Hooks** (`.agentapp/hooks/`)
Shell scripts or JS files executed at lifecycle events:

| Hook event | Fires when |
|---|---|
| `worktree.created` | New worktree created |
| `agent.started` | Agent process spawned |
| `agent.idle` | Agent waiting for input |
| `agent.finished` | Agent session completed |
| `sandbox.ready` | Docker container accepting connections |
| `pr.created` | PR opened from the app |
| `task.loaded` | A task was loaded into a session |
| `task.parallel.launched` | Parallel task group fanned out |

**Layer 3 — npm Plugins** (declared in config, loaded from `~/.config/xaide/plugins/` or node_modules)

Plugin manifest:
```ts
export default {
  name: 'my-plugin',
  hooks: {
    'agent.started': async (ctx: HookContext) => { ... }
  },
  panels: [{ id: 'my-panel', component: './Panel.jsx' }],
  agents: [{
    id: 'amp',
    command: 'amp',
    args: ['--worktree', '{path}'],
    configLoader: (dir) => { ... }
  }],
  sourceAdapters: [{ ... }],
  methodologyAdapters: [{ ... }]
}
```

#### MCPRegistry
- Maintains a catalog of known MCP servers (built-in list + user-defined).
- Each MCP server has a scope: global or per-workspace.
- Lifecycle managed per agent session: MCP servers are started/stopped alongside the agent.
- UI: Extensions panel → MCP tab (browse catalog, add custom, enable per workspace or globally).

#### TaskAdapterSystem
Two-tier adapter architecture:

**Source adapters** — normalize *where* tasks come from into a common `Task` object:
- `github-issues` — GitHub Issues API
- `linear` — Linear API
- `jira` — Jira REST API
- `markdown` — plain `.md` files / task lists
- Custom via plugin

**Methodology adapters** — define *how* work is structured and executed:
```ts
interface MethodologyAdapter {
  id: string
  detect(dir: string): boolean
  loadTaskGraph(dir: string): TaskGraph        // tasks + dependency edges
  getParallelGroups(graph: TaskGraph): Task[][] // tasks that can run simultaneously
  formatPrompt(task: Task, agent: AgentConfig): string
  terminology: Record<string, string>          // override display labels
  onTaskComplete(task: Task, result: TaskResult): void
}
```

- Parallel groups are surfaced in the UI as suggested best-of-n launches.
- `terminology` maps generic labels (`task`, `phase`) to framework-specific terms (`story`, `epic`).
- **MVP built-in methodology adapters**: `spec-kit`, `bmad`, `superpowers` (obra/superpowers — agent-agnostic composable skill/workflow system supporting Claude Code, Copilot CLI, Codex, Gemini CLI, Cursor, and others), `gsd` (get-shit-done) — all ship with v1.
- **Detection vs. management distinction**: Xaide distinguishes between things it *can manage* (MCP servers, superpowers plugins/skills, npm-based integrations, supported agent installs) and things it *detects but does not manage* (spec-kit, bmad, gsd — external CLIs the developer installs and owns via `uv`/`pipx`/npm). For detected-only tools, Xaide shows installation status and detected extensions but does not attempt to install or upgrade them; it points the user to external install instructions.
- **Methodology extension detection**: Each adapter exposes an optional extensions sub-system. Xaide scans on workspace open and rescan. Examples: spec-kit extensions are discovered from the project's loaded `catalog.community.json` entries and any configured extension dirs; bmad agent configs from `.bmad/`; superpowers skills from installed plugin marketplaces; gsd hooks/commands from `.plans/hooks/` and `.plans/commands/`. Detected extensions appear in the Extensions panel under the adapter's own tab as "active" or "available". Extensions Xaide can install (npm-based, superpowers marketplace) are one-click; others show "install manually" with a documentation link.
- **Squad integration** — Squad (`@bradygaster/squad-cli`) is a multi-agent team orchestration runtime, not a methodology. It defines specialist agent roles (frontend, backend, tester, lead) as files in `.squad/`, runs them in parallel, and accumulates team knowledge in git across sessions. Xaide integrates with Squad as a first-class workflow: detect `.squad/team.md` and surface the team roster in the left panel; launch each Squad role as a best-of-n participant with its own worktree; render `.squad/decisions.md` and team history as context panels alongside the terminal; optionally integrate with Ralph watch mode (`squad triage --execute`) to auto-dispatch sessions from GitHub Issues. Ships in v1 as a bundled plugin.
- **Community plugin support**: a plugin registry (npm-based, curated catalog) ships in v1 so the community can publish additional source and methodology adapters, agent types, and UI panels.
- Source and methodology adapters compose independently — mix and match per workspace.

**Kanban view**: a UI view mode on top of the active source adapter's task list. Tasks can also be viewed as a flat list or table. Selecting a task pre-fills the agent session prompt via the active methodology adapter's `formatPrompt`.

#### ReviewWorkflow
- Inline diff viewer per agent session (files changed, +/− stats, line-level diff).
- GitHub/GitLab/Bitbucket PR creation from within the app.
- **CI/workflow run status** shown live in the session view (GitHub Actions run statuses, check suite results; clicking a failing run shows log summary inline).
- Linear/Jira/GitHub Issues linked at task creation → auto-populate PR description.
- **Best-of-n pick**: one-click to merge the chosen branch, discard remaining worktrees and containers.

---

## UI Layout

**Option A — Zed/VSCode Agents hybrid** (selected)

```
┌──────────────────────────────────────────────────────┐
│ [icon rail] │ [workspace + task panel] │ [main area] │
│             │                          │             │
│  ● Agents   │  Workspaces              │ [tab bar]   │
│  ○ Tasks    │  > my-api ←active        │ claude-1 │ claude-2 │ copilot-1 │
│  ○ Exts     │    frontend              │─────────────────────────────────│
│  ○ Settings │                          │ [terminal]  │ [changes]        │
│             │  Tasks                   │             │                  │
│             │  > feat/auth (3 agents)  │             │ + jwt.ts         │
│             │    fix/login             │             │ ~ middleware.ts   │
│             │  + New task              │             │ − old/auth.ts    │
│             │                          │             │                  │
│             │                          │─────────────────────────────────│
│             │                          │ [broadcast input bar]           │
└──────────────────────────────────────────────────────┘
```

**Key layout behaviors:**
- Slim icon rail (36px) + collapsible left panel (workspace/task list)
- **Workspace tabs**: multiple workspaces can be open simultaneously as top-level tabs in the main area, not just switched — each retains its own layout and active sessions
- Tab bar per workspace showing agent sessions; best-of-n task = multiple tabs
- Each tab: terminal (xterm.js) left + changes/diff panel right
- **Broadcast input bar** at bottom of main area when a best-of-n task is active — sends same message to all agents in the group
- **Browser panel**: toggled via toolbar button, opens as bottom or right split, persists per workspace
- **Free pane splitting**: any pane H or V split, drag to resize, keyboard shortcuts (Zed/tmux style), layout saved per workspace
- **CI status**: shown as icon in the tab and expanded in the changes panel
- **Open in external app**: right-click any worktree/session → "Open in…" menu: cmux, Ghostty, Terminal, VSCode, Zed, Cursor (detected from installed apps; extensible via plugin)
- **Kanban view**: toggled from the Tasks section in the left panel — renders the active source adapter's tasks as a kanban board; columns map to task status; selecting a card opens a new agent session pre-filled with the task prompt

**Extensions panel** (icon rail → 4th icon):

| Tab | Purpose |
|---|---|
| Agents | Detected agents, install status, config path, register custom |
| MCP Servers | Catalog + custom, enable per workspace or globally; one-click install for npm-published servers |
| Methodologies | Per-adapter sub-tabs (spec-kit, bmad, superpowers, gsd, Squad, community); shows detected extensions as "active" or "available"; installable extensions are one-click, others show "install manually" with doc link |
| Skills | Browse/enable superpowers skills per agent session; install from marketplace |
| Hooks | Visual hook editor: event → script path or inline JS |
| Plugins | Installed Xaide npm plugins, enable/disable |

**Workspace Settings** (per workspace):
- General: repo path, base branch, display name
- Sandbox: enable/disable Docker, image/Dockerfile, env vars, port mappings, `keepAlive`
- Adapters: active source adapter + methodology adapter
- Agents: per-workspace agent overrides

---

## Data Model

```sql
workspaces        id, name, repo_path, config_json, sandbox_defaults, layout_json
tasks             id, workspace_id, title, source_adapter, methodology_adapter,
                  prompt, status, base_commit, parallel_group_id
agent_sessions    id, task_id, agent_id, branch, worktree_path, container_id, status
events            id, session_id, type, payload, timestamp  -- hook/audit log
mcp_servers       id, name, scope, config_json, enabled
plugins           id, name, version, enabled, config_json
```

---

## Config Hierarchy

```
~/.config/xaide/config.yaml          ← global defaults
  agents, MCP, sandbox defaults, plugin list, global hooks

<repo>/.agentapp/config.yaml         ← workspace overrides
  spec adapter, methodology adapter, sandbox image, hooks, custom agents

<repo>/.agentapp/hooks/              ← lifecycle scripts
  worktree.created.sh
  agent.finished.js
  task.parallel.launched.sh
  ...
```

---

## Best-of-N Workflow

1. User creates a task, selects N agents (e.g. Claude ×2 + Copilot ×1)
2. App creates N branches + worktrees from the same base commit
3. Each agent spawns in its own PTY with sandbox (if configured)
4. UI shows agent tabs across the top; shared broadcast input bar at the bottom
5. Changes panel shows all agents' diff stats for at-a-glance comparison
6. User picks winner → chosen branch merged, remaining worktrees + containers torn down
7. Cap: 5 agents per task group (configurable)

**Methodology-driven parallel launch**: when the active methodology adapter returns parallel task groups, the app offers to auto-fan-out — creating one task group per parallel set.

---

## Error Handling

- Agent crash: session marked failed, PTY output preserved, user notified with restart option
- Docker unavailable: sandbox silently falls back to native with a warning banner
- Hook failure: logged to events table, shown in session view; non-blocking by default (configurable to block)
- Worktree conflict: detected before creation, user offered rebase or force options
- Plugin error: plugin disabled with error surfaced in Extensions panel; app continues

---

## Out of Scope (v1)

- Windows/Linux Docker support (macOS Docker Desktop first; Linux later)
- Built-in code editor (use terminal + external editor; open in VSCode/Zed/cursor from context menu)
- Real-time collaboration / multiplayer
- Cloud sync of workspaces or sessions
- Mobile/web UI
