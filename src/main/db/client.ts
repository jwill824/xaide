import Database from 'better-sqlite3'

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
    task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    branch TEXT NOT NULL,
    worktree_path TEXT NOT NULL,
    pty_session_id TEXT,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE
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

  CREATE TABLE IF NOT EXISTS agent_configs (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL DEFAULT 'global'
      CHECK(scope IN ('global','workspace')),
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    agent_type TEXT NOT NULL DEFAULT 'all'
      CHECK(agent_type IN ('claude','copilot','all')),
    system_prompt_additions TEXT NOT NULL DEFAULT '',
    config_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS hooks (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL DEFAULT 'global'
      CHECK(scope IN ('global','workspace')),
    workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
    event TEXT NOT NULL
      CHECK(event IN ('agent.start','agent.stop','agent.commit','agent.error')),
    command TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_agent_configs_workspace_id
    ON agent_configs(workspace_id);

  CREATE INDEX IF NOT EXISTS idx_hooks_workspace_id
    ON hooks(workspace_id);
`

export type RawDb = Database.Database

/**
 * Opens (or creates) a SQLite database at `path`, applies WAL mode,
 * enables foreign keys, and runs the bootstrap DDL.
 *
 * Caller owns the connection. Call `db.close()` when done.
 * For production use, call this once at app startup and pass
 * the instance via dependency injection.
 *
 * @param path - File path or `':memory:'` for an in-memory database.
 */
export function createDb(path: string): RawDb {
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  try {
    db.exec('ALTER TABLE mcp_servers ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE')
  } catch {
    // column already exists — safe to ignore
  }
  try {
    db.exec('ALTER TABLE agent_sessions ADD COLUMN pty_session_id TEXT')
  } catch {
    // column already exists — safe to ignore
  }

  // If task_id was created NOT NULL in an older schema, reconstruct the table to make it nullable.
  const cols = db.prepare("PRAGMA table_info('agent_sessions')").all() as Array<{ name: string; notnull: number }>
  const taskIdCol = cols.find((c) => c.name === 'task_id')
  if (taskIdCol?.notnull === 1) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE agent_sessions_new (
        id TEXT PRIMARY KEY,
        task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL,
        branch TEXT NOT NULL,
        worktree_path TEXT NOT NULL,
        pty_session_id TEXT,
        container_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK(status IN ('pending','running','idle','finished','failed')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO agent_sessions_new SELECT id, task_id, agent_id, branch, worktree_path, pty_session_id, container_id, status, created_at, updated_at FROM agent_sessions;
      DROP TABLE agent_sessions;
      ALTER TABLE agent_sessions_new RENAME TO agent_sessions;
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_task_id ON agent_sessions(task_id);
      PRAGMA foreign_keys = ON;
    `)
  }

  return db
}
