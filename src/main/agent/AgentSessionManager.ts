import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { WebContents } from 'electron'
import type { DrizzleDb } from '../db/schema'
import { agentSessions } from '../db/schema'
import type { PtyManager } from '../pty/PtyManager'
import type { HookRunner } from '../worktree/HookRunner'
import type { SandboxManager } from '../sandbox/SandboxManager'
import type { AgentSessionRecord, CreateAgentSessionInput } from './types'
import { PTY_CHANNELS } from '../../preload/ipc-types'

const AGENT_COMMANDS: Record<string, { command: string; args: string[] }> = {
  claude: { command: 'claude', args: [] },
  copilot: { command: 'copilot', args: [] },
}

interface PendingSpawnConfig {
  ptyCommand: string
  ptyArgs: string[]
  worktreePath: string
  workspaceId: string
  sandboxName?: string
}

export class AgentSessionManager {
  private webContents?: WebContents
  /** Sessions whose PTY has not been spawned yet — waiting for terminal-ready signal. */
  private pendingSpawns = new Map<string, PendingSpawnConfig>()

  constructor(
    private db: DrizzleDb,
    private pty: PtyManager,
    private hookRunner: HookRunner,
    private sandbox?: SandboxManager,
  ) {}

  setWebContents(wc: WebContents): void {
    this.webContents = wc
  }

  /**
   * Create the DB record and return a pre-allocated ptySessionId.
   * The PTY process is NOT started here — call spawn() once the terminal is sized.
   */
  async create(input: CreateAgentSessionInput): Promise<AgentSessionRecord> {
    const id = randomUUID()
    // Pre-allocate the ptySessionId so the renderer can subscribe to data events
    // before the process starts.
    const ptySessionId = randomUUID()

    let sandboxName: string | undefined
    if (input.sandboxName && this.sandbox) {
      this.sandbox.create({
        name: input.sandboxName,
        worktreePath: input.worktreePath,
      })
      sandboxName = input.sandboxName
    }

    let ptyCommand: string
    let ptyArgs: string[]
    if (sandboxName && this.sandbox) {
      const { command, args } = this.sandbox.runArgs(sandboxName, input.agentId)
      ptyCommand = command
      ptyArgs = args
    } else {
      const agentCmd = AGENT_COMMANDS[input.agentId] ?? { command: input.agentId, args: [] }
      ptyCommand = agentCmd.command
      ptyArgs = agentCmd.args
    }

    let record: AgentSessionRecord
    try {
      const [inserted] = await this.db
        .insert(agentSessions)
        .values({
          id,
          taskId: input.taskId ?? null,
          agentId: input.agentId,
          branch: input.branch,
          worktreePath: input.worktreePath,
          ptySessionId,
          containerId: sandboxName ?? null,
          status: 'pending',
        })
        .returning()
      record = inserted as AgentSessionRecord
    } catch (err) {
      if (sandboxName && this.sandbox) {
        this.sandbox.remove(sandboxName)
      }
      throw err
    }

    this.pendingSpawns.set(ptySessionId, {
      ptyCommand,
      ptyArgs,
      worktreePath: input.worktreePath,
      workspaceId: input.repoPath ?? input.worktreeId ?? '',
      sandboxName,
    })

    return record as AgentSessionRecord
  }

  /**
   * Spawn the agent process for a session created with create().
   * Called by the renderer once the terminal has been fitted and reports its actual size.
   */
  async spawn(ptySessionId: string, cols: number, rows: number): Promise<void> {
    const config = this.pendingSpawns.get(ptySessionId)
    if (!config) throw new Error(`No pending spawn for PTY session: ${ptySessionId}`)
    this.pendingSpawns.delete(ptySessionId)

    const ptyResult = this.pty.create({
      id: ptySessionId,
      workspaceId: config.workspaceId,
      cols,
      rows,
      cwd: config.worktreePath,
      command: config.ptyCommand,
      args: config.ptyArgs,
    })

    if (this.webContents) {
      const wc = this.webContents
      ptyResult.process.onData((data: string) => {
        if (!wc.isDestroyed()) wc.send(PTY_CHANNELS.DATA, ptySessionId, data)
      })
      ptyResult.process.onExit(() => {
        if (!wc.isDestroyed()) wc.send(PTY_CHANNELS.EXIT, ptySessionId)
      })
    }

    await this.db
      .update(agentSessions)
      .set({ status: 'running', updatedAt: new Date().toISOString() })
      .where(eq(agentSessions.ptySessionId, ptySessionId))

    this.hookRunner
      .run('agent.started', {
        repoPath: config.workspaceId,
        branch: '',
        worktreePath: config.worktreePath,
      })
      .catch(() => {})
  }

  async list(): Promise<AgentSessionRecord[]> {
    const rows = await this.db.select().from(agentSessions)
    return rows as AgentSessionRecord[]
  }

  async kill(sessionId: string, ptySessionId: string, sandboxName?: string): Promise<void> {
    // Cancel a pending spawn if it hasn't started yet.
    this.pendingSpawns.delete(ptySessionId)
    try {
      this.pty.kill(ptySessionId)
    } catch {
      // PTY may already be dead or never started
    }
    if (sandboxName && this.sandbox) {
      this.sandbox.stop(sandboxName)
    }
    await this.db
      .update(agentSessions)
      .set({ status: 'finished', updatedAt: new Date().toISOString() })
      .where(eq(agentSessions.id, sessionId))
  }
}
