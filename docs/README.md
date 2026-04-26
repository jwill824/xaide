# Xaide

> A cross-platform Electron IDE that orchestrates AI coding agents in isolated git worktrees — combining emdash's multi-agent UX with cmux's terminal multiplexer feel.

## What it does

Xaide lets you run Claude, Copilot, and other AI agents in parallel — each in its own git worktree — from a single desktop app. Switch between workspaces, split panes, open a browser panel, track task progress, and wire everything together with hooks, plugins, and SDD methodology adapters.

**Key features:**
- 🤖 **Agent orchestration** — Claude Code + GitHub Copilot CLI, with community plugins for more
- 🌿 **Git worktree isolation** — each agent gets its own branch and working tree
- 🖥️ **Terminal multiplexer UI** — tabbed sessions, H/V pane splits with drag-to-resize
- 🌐 **Browser panel** — sandboxed Electron webview alongside your terminal
- 📋 **Task adapters** — GitHub Issues, Linear, Jira, or plain markdown as your backlog
- 🧩 **Methodology adapters** — spec-kit, bmad, superpowers, gsd, Squad
- 🔌 **Three-layer extensibility** — config → script hooks → npm plugins → community registry
- 💾 **Layout persistence** — workspace layouts saved to local SQLite

## Quick start

### Prerequisites

- Node.js 20+ (or 22+ recommended)
- macOS arm64 or x64 (Windows/Linux in v1.x)
- Git 2.x

### Install & run

```bash
git clone https://github.com/jwill824/xaide.git
cd xaide
npm install
npm run dev
```

> **Note:** `npm install` runs `electron-builder install-app-deps` automatically via `postinstall`, which rebuilds native modules (`better-sqlite3`, `node-pty`) for Electron. This is required before running the app.

### Run tests

```bash
# Main process tests (Vitest, Node environment)
npm test

# Renderer tests (Vitest, jsdom environment)
npm run test:renderer

# All tests
npm run test:all
```

> **Tip — native module ABI:** If renderer tests fail with a `better-sqlite3` ABI mismatch after running `npm install`, run `npm rebuild better-sqlite3` to rebuild for your system Node version.

### Build for distribution

```bash
npm run build
```

Output goes to `dist/`. To preview the production build without packaging:

```bash
npm run preview
```

## Project structure

```
xaide/
├── src/
│   ├── main/               # Electron main process
│   │   ├── db/             # SQLite schema + Drizzle client
│   │   ├── config/         # Config loader (.xaide.yml)
│   │   ├── workspace/      # WorkspaceManager
│   │   ├── pty/            # PtyManager (node-pty sessions)
│   │   └── ipc/            # Typed IPC handlers
│   ├── preload/            # Context bridge (ipc-types + index)
│   └── renderer/src/
│       ├── components/     # React UI (MainArea, TerminalPane, PaneSplit, …)
│       ├── hooks/          # React Query + zustand hooks
│       ├── store/          # zustand uiStore
│       └── types/          # PaneNode, webview declarations
├── tests/
│   ├── main/               # Main process unit tests
│   └── renderer/           # Renderer component tests
└── docs/
    ├── README.md           # This file
    ├── CONTRIBUTING.md     # Dev workflow
    └── superpowers/
        ├── specs/          # Design specifications
        └── plans/          # Implementation plans
```

## Tech stack

| Layer | Choice |
|---|---|
| Shell | Electron 31 + TypeScript 5 |
| UI | React 18 + Vite + Tailwind CSS |
| Terminal | xterm.js + node-pty |
| Database | SQLite + Drizzle ORM |
| State | TanStack React Query + zustand |
| Browser panel | Electron `<webview>` |
| Build | electron-vite + electron-builder |
| Testing | Vitest + Testing Library |

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full dev workflow, branch conventions, and PR guidelines.
