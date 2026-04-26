"use strict";
const electron = require("electron");
const path = require("path");
const betterSqlite3 = require("drizzle-orm/better-sqlite3");
const Database = require("better-sqlite3");
const sqliteCore = require("drizzle-orm/sqlite-core");
const drizzleOrm = require("drizzle-orm");
const fs = require("fs");
const os = require("os");
const yaml = require("yaml");
const zod = require("zod");
const crypto = require("crypto");
const simpleGit = require("simple-git");
const child_process = require("child_process");
const util = require("util");
const pty = require("node-pty");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const pty__namespace = /* @__PURE__ */ _interopNamespaceDefault(pty);
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    repo_path TEXT NOT NULL,
    config_json TEXT NOT NULL DEFAULT '{}',
    sandbox_defaults TEXT NOT NULL DEFAULT '{}',
    layout_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    source_adapter TEXT NOT NULL,
    methodology_adapter TEXT,
    prompt TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','in_progress','done','blocked')),
    base_commit TEXT,
    parallel_group_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    branch TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    container_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','running','idle','finished','failed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES agent_sessions(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'global'
      CHECK(scope IN ('global','workspace')),
    config_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plugins (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    config_json TEXT NOT NULL DEFAULT '{}',
    installed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_workspace_id
    ON tasks(workspace_id);

  CREATE INDEX IF NOT EXISTS idx_agent_sessions_task_id
    ON agent_sessions(task_id);

  CREATE INDEX IF NOT EXISTS idx_events_session_id
    ON events(session_id);

  CREATE TABLE IF NOT EXISTS worktrees (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    repo_path TEXT NOT NULL,
    branch TEXT NOT NULL,
    base_branch TEXT NOT NULL DEFAULT 'HEAD',
    worktree_path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK(status IN ('active','merged','discarded')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_worktrees_workspace_id
    ON worktrees(workspace_id);
`;
function createDb(path2) {
  const db = new Database(path2);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}
const workspaces = sqliteCore.sqliteTable("workspaces", {
  id: sqliteCore.text("id").primaryKey(),
  name: sqliteCore.text("name").notNull(),
  repoPath: sqliteCore.text("repo_path").notNull(),
  configJson: sqliteCore.text("config_json").notNull().default("{}"),
  sandboxDefaults: sqliteCore.text("sandbox_defaults").notNull().default("{}"),
  layoutJson: sqliteCore.text("layout_json").notNull().default("{}"),
  createdAt: sqliteCore.text("created_at").notNull().default(drizzleOrm.sql`(datetime('now'))`),
  updatedAt: sqliteCore.text("updated_at").notNull().default(drizzleOrm.sql`(datetime('now'))`)
});
const tasks = sqliteCore.sqliteTable(
  "tasks",
  {
    id: sqliteCore.text("id").primaryKey(),
    workspaceId: sqliteCore.text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    title: sqliteCore.text("title").notNull(),
    sourceAdapter: sqliteCore.text("source_adapter").notNull(),
    methodologyAdapter: sqliteCore.text("methodology_adapter"),
    prompt: sqliteCore.text("prompt").notNull().default(""),
    status: sqliteCore.text("status", { enum: ["pending", "in_progress", "done", "blocked"] }).notNull().default("pending"),
    baseCommit: sqliteCore.text("base_commit"),
    parallelGroupId: sqliteCore.text("parallel_group_id"),
    createdAt: sqliteCore.text("created_at").notNull().default(drizzleOrm.sql`(datetime('now'))`),
    updatedAt: sqliteCore.text("updated_at").notNull().default(drizzleOrm.sql`(datetime('now'))`)
  },
  (t) => [sqliteCore.index("idx_tasks_workspace_id").on(t.workspaceId)]
);
const agentSessions = sqliteCore.sqliteTable(
  "agent_sessions",
  {
    id: sqliteCore.text("id").primaryKey(),
    taskId: sqliteCore.text("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    agentId: sqliteCore.text("agent_id").notNull(),
    branch: sqliteCore.text("branch").notNull(),
    worktreePath: sqliteCore.text("worktree_path").notNull(),
    containerId: sqliteCore.text("container_id"),
    status: sqliteCore.text("status", {
      enum: ["pending", "running", "idle", "finished", "failed"]
    }).notNull().default("pending"),
    createdAt: sqliteCore.text("created_at").notNull().default(drizzleOrm.sql`(datetime('now'))`),
    updatedAt: sqliteCore.text("updated_at").notNull().default(drizzleOrm.sql`(datetime('now'))`)
  },
  (t) => [sqliteCore.index("idx_agent_sessions_task_id").on(t.taskId)]
);
const events = sqliteCore.sqliteTable(
  "events",
  {
    id: sqliteCore.text("id").primaryKey(),
    sessionId: sqliteCore.text("session_id").references(() => agentSessions.id, {
      onDelete: "set null"
    }),
    type: sqliteCore.text("type").notNull(),
    payload: sqliteCore.text("payload").notNull().default("{}"),
    timestamp: sqliteCore.text("timestamp").notNull().default(drizzleOrm.sql`(datetime('now'))`)
  },
  (t) => [sqliteCore.index("idx_events_session_id").on(t.sessionId)]
);
const mcpServers = sqliteCore.sqliteTable("mcp_servers", {
  id: sqliteCore.text("id").primaryKey(),
  name: sqliteCore.text("name").notNull(),
  scope: sqliteCore.text("scope", { enum: ["global", "workspace"] }).notNull().default("global"),
  configJson: sqliteCore.text("config_json").notNull().default("{}"),
  enabled: sqliteCore.integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: sqliteCore.text("created_at").notNull().default(drizzleOrm.sql`(datetime('now'))`)
});
const plugins = sqliteCore.sqliteTable("plugins", {
  id: sqliteCore.text("id").primaryKey(),
  name: sqliteCore.text("name").notNull(),
  version: sqliteCore.text("version").notNull(),
  enabled: sqliteCore.integer("enabled", { mode: "boolean" }).notNull().default(true),
  configJson: sqliteCore.text("config_json").notNull().default("{}"),
  installedAt: sqliteCore.text("installed_at").notNull().default(drizzleOrm.sql`(datetime('now'))`)
});
const worktrees = sqliteCore.sqliteTable(
  "worktrees",
  {
    id: sqliteCore.text("id").primaryKey(),
    workspaceId: sqliteCore.text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    repoPath: sqliteCore.text("repo_path").notNull(),
    branch: sqliteCore.text("branch").notNull(),
    baseBranch: sqliteCore.text("base_branch").notNull().default("HEAD"),
    worktreePath: sqliteCore.text("worktree_path").notNull(),
    status: sqliteCore.text("status", { enum: ["active", "merged", "discarded"] }).notNull().default("active"),
    createdAt: sqliteCore.text("created_at").notNull().default(drizzleOrm.sql`(datetime('now'))`),
    updatedAt: sqliteCore.text("updated_at").notNull().default(drizzleOrm.sql`(datetime('now'))`)
  },
  (t) => [sqliteCore.index("idx_worktrees_workspace_id").on(t.workspaceId)]
);
const schema = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  agentSessions,
  events,
  mcpServers,
  plugins,
  tasks,
  workspaces,
  worktrees
}, Symbol.toStringTag, { value: "Module" }));
const SandboxConfigSchema = zod.z.object({
  enabled: zod.z.boolean().default(false),
  image: zod.z.string().optional(),
  dockerfile: zod.z.string().optional(),
  env: zod.z.record(zod.z.string()).default({}),
  ports: zod.z.array(zod.z.string()).default([]),
  keepAlive: zod.z.boolean().default(false)
});
const AgentOverrideSchema = zod.z.object({
  id: zod.z.string(),
  command: zod.z.string(),
  args: zod.z.array(zod.z.string()).default([]),
  enabled: zod.z.boolean().default(true)
});
const McpServerConfigSchema = zod.z.object({
  name: zod.z.string(),
  command: zod.z.string(),
  args: zod.z.array(zod.z.string()).default([]),
  scope: zod.z.enum(["global", "workspace"]).default("global"),
  enabled: zod.z.boolean().default(true)
});
const HookConfigSchema = zod.z.object({
  event: zod.z.string(),
  path: zod.z.string()
});
const GlobalConfigSchema = zod.z.object({
  agents: zod.z.array(AgentOverrideSchema).default([]),
  mcpServers: zod.z.array(McpServerConfigSchema).default([]),
  sandbox: SandboxConfigSchema.default({}),
  plugins: zod.z.array(zod.z.string()).default([]),
  hooks: zod.z.array(HookConfigSchema).default([])
});
const WorkspaceConfigSchema = zod.z.object({
  sourceAdapter: zod.z.string().optional(),
  methodologyAdapter: zod.z.string().optional(),
  sandbox: SandboxConfigSchema.partial().optional(),
  agents: zod.z.array(AgentOverrideSchema).default([]),
  hooks: zod.z.array(HookConfigSchema).default([])
});
const DEFAULT_GLOBAL_CONFIG_PATH = path.join(os.homedir(), ".config", "xaide", "config.yaml");
class ConfigLoader {
  constructor(globalConfigPath = DEFAULT_GLOBAL_CONFIG_PATH) {
    this.globalConfigPath = globalConfigPath;
  }
  loadGlobal() {
    if (!fs.existsSync(this.globalConfigPath)) {
      return GlobalConfigSchema.parse({});
    }
    const raw = fs.readFileSync(this.globalConfigPath, "utf8");
    return GlobalConfigSchema.parse(yaml.parse(raw) ?? {});
  }
  loadWorkspace(repoPath) {
    const configPath = path.join(repoPath, ".agentapp", "config.yaml");
    if (!fs.existsSync(configPath)) {
      return WorkspaceConfigSchema.parse({});
    }
    const raw = fs.readFileSync(configPath, "utf8");
    return WorkspaceConfigSchema.parse(yaml.parse(raw) ?? {});
  }
}
class WorkspaceManager {
  constructor(db, configLoader) {
    this.db = db;
    this.configLoader = configLoader;
  }
  list() {
    return this.db.select().from(workspaces).all();
  }
  get(id) {
    return this.db.select().from(workspaces).where(drizzleOrm.eq(workspaces.id, id)).get() ?? null;
  }
  create(input) {
    if (!fs.existsSync(input.repoPath)) {
      throw new Error(`Repo path does not exist: ${input.repoPath}`);
    }
    const wsConfig = this.configLoader.loadWorkspace(input.repoPath);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const row = this.db.insert(workspaces).values({
      id: crypto.randomUUID(),
      name: input.name,
      repoPath: input.repoPath,
      configJson: JSON.stringify(wsConfig),
      sandboxDefaults: JSON.stringify(wsConfig.sandbox ?? {}),
      layoutJson: "{}",
      createdAt: now,
      updatedAt: now
    }).returning().get();
    if (!row) throw new Error("Failed to create workspace");
    return row;
  }
  update(id, input) {
    if (!this.get(id)) throw new Error(`Workspace not found: ${id}`);
    if (input.repoPath !== void 0 && !fs.existsSync(input.repoPath)) {
      throw new Error(`Repo path does not exist: ${input.repoPath}`);
    }
    const extra = {};
    if (input.repoPath !== void 0) {
      const wsConfig = this.configLoader.loadWorkspace(input.repoPath);
      extra.configJson = JSON.stringify(wsConfig);
    }
    const row = this.db.update(workspaces).set({
      ...input.name !== void 0 && { name: input.name },
      ...input.repoPath !== void 0 && { repoPath: input.repoPath },
      ...extra,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }).where(drizzleOrm.eq(workspaces.id, id)).returning().get();
    if (!row) throw new Error(`Update failed for workspace: ${id}`);
    return row;
  }
  delete(id) {
    if (!this.get(id)) throw new Error(`Workspace not found: ${id}`);
    this.db.delete(workspaces).where(drizzleOrm.eq(workspaces.id, id)).run();
  }
  saveLayout(id, layoutJson) {
    if (!this.get(id)) throw new Error(`Workspace not found: ${id}`);
    this.db.update(workspaces).set({ layoutJson, updatedAt: (/* @__PURE__ */ new Date()).toISOString() }).where(drizzleOrm.eq(workspaces.id, id)).run();
  }
}
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function worktreePath(workspaceId, branchSlug) {
  return path.join(os.homedir(), ".xaide", "worktrees", workspaceId, branchSlug);
}
class WorktreeManager {
  constructor(db) {
    this.db = db;
  }
  async create(input) {
    const { workspaceId, repoPath, label, baseBranch = "HEAD" } = input;
    const shortId = crypto.randomUUID().slice(0, 8);
    const branch = input.branch ?? `xaide/${slugify(label)}-${shortId}`;
    const branchSlug = branch.replace(/\//g, "-");
    const wtPath = worktreePath(workspaceId, branchSlug);
    fs.mkdirSync(wtPath, { recursive: true });
    const git = simpleGit(repoPath);
    await git.raw(["worktree", "add", "-b", branch, wtPath, baseBranch]);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const row = this.db.insert(worktrees).values({
      id: crypto.randomUUID(),
      workspaceId,
      repoPath,
      branch,
      baseBranch,
      worktreePath: wtPath,
      status: "active",
      createdAt: now,
      updatedAt: now
    }).returning().get();
    if (!row) throw new Error("Failed to persist worktree record");
    return row;
  }
  list(workspaceId) {
    return this.db.select().from(worktrees).where(drizzleOrm.eq(worktrees.workspaceId, workspaceId)).all();
  }
  get(id) {
    return this.db.select().from(worktrees).where(drizzleOrm.eq(worktrees.id, id)).get() ?? null;
  }
  async delete(input) {
    const { worktreeId, deleteBranch = false } = input;
    const record = this.get(worktreeId);
    if (!record) throw new Error(`Worktree not found: ${worktreeId}`);
    const git = simpleGit(record.repoPath);
    try {
      await git.raw(["worktree", "remove", "--force", record.worktreePath]);
    } catch {
      fs.rmSync(record.worktreePath, { recursive: true, force: true });
    }
    if (deleteBranch) {
      try {
        await git.deleteLocalBranch(record.branch, true);
      } catch {
      }
    }
    this.db.delete(worktrees).where(drizzleOrm.eq(worktrees.id, worktreeId)).run();
  }
}
const execFileAsync = util.promisify(child_process.execFile);
function eventToFilename(event) {
  return event.replace(/\./g, "-");
}
class HookRunner {
  async run(event, ctx) {
    const hooksDir = path.join(ctx.repoPath, ".agentapp", "hooks");
    if (!fs.existsSync(hooksDir)) return;
    const stem = eventToFilename(event);
    for (const ext of [".sh", ".js", ""]) {
      const scriptPath = path.join(hooksDir, stem + ext);
      if (fs.existsSync(scriptPath)) {
        await this.runScript(scriptPath, ctx);
        return;
      }
    }
  }
  async runScript(scriptPath, ctx) {
    const env = {
      ...process.env,
      XAIDE_REPO_PATH: ctx.repoPath,
      XAIDE_BRANCH: ctx.branch,
      XAIDE_WORKTREE_PATH: ctx.worktreePath
    };
    await execFileAsync(scriptPath, [], { env });
  }
}
class PtyManager {
  sessions = /* @__PURE__ */ new Map();
  create(options) {
    const shell = process.platform === "win32" ? "powershell.exe" : process.env["SHELL"] ?? "/bin/zsh";
    const id = crypto.randomUUID();
    const ptyProcess = pty__namespace.spawn(shell, [], {
      name: "xterm-color",
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: { ...process.env, ...options.env }
    });
    this.sessions.set(id, { id, workspaceId: options.workspaceId, process: ptyProcess });
    return { id, process: ptyProcess };
  }
  write(id, data) {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`PTY session not found: ${id}`);
    session.process.write(data);
  }
  resize(id, cols, rows) {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`PTY session not found: ${id}`);
    session.process.resize(cols, rows);
  }
  kill(id) {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`PTY session not found: ${id}`);
    session.process.kill();
    this.sessions.delete(id);
  }
  has(id) {
    return this.sessions.has(id);
  }
  killAll() {
    for (const session of this.sessions.values()) {
      session.process.kill();
    }
    this.sessions.clear();
  }
}
const IPC_CHANNELS = {
  WORKSPACE_LIST: "workspace:list",
  WORKSPACE_CREATE: "workspace:create",
  WORKSPACE_GET: "workspace:get",
  WORKSPACE_UPDATE: "workspace:update",
  WORKSPACE_DELETE: "workspace:delete"
};
const PTY_CHANNELS = {
  CREATE: "pty:create",
  WRITE: "pty:write",
  RESIZE: "pty:resize",
  KILL: "pty:kill",
  DATA: "pty:data",
  WORKSPACE_SAVE_LAYOUT: "workspace:save-layout"
};
const WORKTREE_CHANNELS = {
  LIST: "worktree:list",
  CREATE: "worktree:create",
  DELETE: "worktree:delete"
};
function registerWorkspaceHandlers(manager) {
  electron.ipcMain.handle(IPC_CHANNELS.WORKSPACE_LIST, () => manager.list());
  electron.ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_CREATE,
    (_, input) => manager.create(input)
  );
  electron.ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET, (_, id) => manager.get(id));
  electron.ipcMain.handle(
    IPC_CHANNELS.WORKSPACE_UPDATE,
    (_, id, input) => manager.update(id, input)
  );
  electron.ipcMain.handle(IPC_CHANNELS.WORKSPACE_DELETE, (_, id) => manager.delete(id));
  electron.ipcMain.handle(
    PTY_CHANNELS.WORKSPACE_SAVE_LAYOUT,
    (_, id, layoutJson) => manager.saveLayout(id, layoutJson)
  );
}
function registerPtyHandlers(manager, webContents) {
  electron.ipcMain.handle(PTY_CHANNELS.CREATE, (_, options) => {
    const { id, process: process2 } = manager.create(options);
    process2.onData((data) => {
      if (!webContents.isDestroyed()) {
        webContents.send(PTY_CHANNELS.DATA, id, data);
      }
    });
    return id;
  });
  electron.ipcMain.handle(PTY_CHANNELS.WRITE, (_, sessionId, data) => {
    manager.write(sessionId, data);
  });
  electron.ipcMain.handle(
    PTY_CHANNELS.RESIZE,
    (_, sessionId, cols, rows) => {
      manager.resize(sessionId, cols, rows);
    }
  );
  electron.ipcMain.handle(PTY_CHANNELS.KILL, (_, sessionId) => {
    manager.kill(sessionId);
  });
}
function registerWorktreeHandlers(manager, hookRunner) {
  electron.ipcMain.handle(
    WORKTREE_CHANNELS.LIST,
    (_, workspaceId) => manager.list(workspaceId)
  );
  electron.ipcMain.handle(WORKTREE_CHANNELS.CREATE, async (_, options) => {
    const wt = await manager.create(options);
    await hookRunner.run("worktree.created", {
      repoPath: options.repoPath,
      branch: wt.branch,
      worktreePath: wt.worktreePath
    });
    return wt;
  });
  electron.ipcMain.handle(
    WORKTREE_CHANNELS.DELETE,
    (_, worktreeId, deleteBranch = false) => manager.delete({ worktreeId, deleteBranch })
  );
}
let sqlite = null;
let ptyManager = null;
function createWindow() {
  const win = new electron.BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  });
  if (process.env["ELECTRON_RENDERER_URL"]) {
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return win;
}
electron.app.whenReady().then(() => {
  sqlite = createDb(path.join(electron.app.getPath("userData"), "xaide.db"));
  const db = betterSqlite3.drizzle(sqlite, { schema });
  const configLoader = new ConfigLoader();
  const workspaceManager = new WorkspaceManager(db, configLoader);
  const worktreeManager = new WorktreeManager(db);
  const hookRunner = new HookRunner();
  ptyManager = new PtyManager();
  registerWorkspaceHandlers(workspaceManager);
  registerWorktreeHandlers(worktreeManager, hookRunner);
  const win = createWindow();
  registerPtyHandlers(ptyManager, win.webContents);
  win.on("close", () => ptyManager?.killAll());
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      const w = createWindow();
      if (ptyManager) registerPtyHandlers(ptyManager, w.webContents);
    }
  });
});
electron.app.on("before-quit", () => {
  sqlite?.close();
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
