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

export class AgentSessionManager {
  private webContents?: WebContents

  constructor(
    private db: DrizzleDb,
    private pty: PtyManager,
    private hookRunner: HookRunner,
    private sandbox?: SandboxManager,
  ) {}

  setWebContents(wc: WebContents): void {
    this.webContents = wc
  }
  async create(input: CreateAgentSessionInput): Promise<AgentSessionRecord> {
    const id = randomUUID()

    let sandboxName: string | undefined
    if (input.sandboxName && this.sandbox) {
      this.sandbox.create({
        name: input.sandboxName,
        worktreePath: input.worktreePath,
        // branch intentionally omitted — sbx uses worktreePath as the workspace root
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

    const ptyResult = this.pty.create({
      workspaceId: input.repoPath ?? input.worktreeId ?? '',
      cols: input.cols ?? 80,
      rows: input.rows ?? 24,
      cwd: input.worktreePath,
      command: ptyCommand,
      args: ptyArgs,
    })

    // Forward PTY output to the renderer window.
    if (this.webContents) {
      const wc = this.webContents
      ptyResult.process.onData((data: string) => {
        if (!wc.isDestroyed()) wc.send(PTY_CHANNELS.DATA, ptyResult.id, data)
      })
      ptyResult.process.onExit(() => {
        if (!wc.isDestroyed()) wc.send(PTY_CHANNELS.EXIT, ptyResult.id)
      })
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
          ptySessionId: ptyResult.id,
          containerId: sandboxName ?? null,   // DB column repurposed: stores sbx sandbox name
          status: 'running',
        })
        .returning()
      record = inserted as AgentSessionRecord
    } catch (err) {
      try { this.pty.kill(ptyResult.id) } catch { /* already dead */ }
      if (sandboxName && this.sandbox) {
        this.sandbox.remove(sandboxName)
      }
      throw err
    }

    this.hookRunner
      .run('agent.started', {
        repoPath: input.repoPath ?? input.worktreePath,
        branch: input.branch,
        worktreePath: input.worktreePath,
      })
      .catch(() => {})

    return record as AgentSessionRecord
  }

  async list(): Promise<AgentSessionRecord[]> {
    const rows = await this.db.select().from(agentSessions)
    return rows as AgentSessionRecord[]
  }

  async kill(sessionId: string, ptySessionId: string, sandboxName?: string): Promise<void> {
    try {
      this.pty.kill(ptySessionId)
    } catch {
      // PTY may already be dead
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
