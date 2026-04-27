import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DrizzleDb } from '../db/schema'
import { agentSessions } from '../db/schema'
import type { PtyManager } from '../pty/PtyManager'
import type { HookRunner } from '../worktree/HookRunner'
import type { SandboxManager } from '../sandbox/SandboxManager'
import type { AgentSessionRecord, CreateAgentSessionInput } from './types'

const AGENT_COMMANDS: Record<string, { command: string; args: string[] }> = {
  claude: { command: 'claude', args: [] },
  copilot: { command: 'gh', args: ['copilot'] },
}

export class AgentSessionManager {
  constructor(
    private db: DrizzleDb,
    private pty: PtyManager,
    private hookRunner: HookRunner,
    private sandbox?: SandboxManager,
  ) {}

  async create(input: CreateAgentSessionInput): Promise<AgentSessionRecord> {
    const id = randomUUID()
    const agentCmd = AGENT_COMMANDS[input.agentId] ?? { command: input.agentId, args: [] }

    let containerId: string | undefined
    if (input.sandboxImage && this.sandbox) {
      const info = this.sandbox.create({
        image: input.sandboxImage,
        worktreePath: input.worktreePath,
        branch: input.branch ?? 'main',
      })
      this.sandbox.start(info.containerId)
      containerId = info.containerId
    }

    let ptyCommand: string
    let ptyArgs: string[]
    if (containerId && this.sandbox) {
      const { command, prefixArgs } = this.sandbox.execArgs(containerId)
      ptyCommand = command
      ptyArgs = [...prefixArgs, agentCmd.command, ...agentCmd.args]
    } else {
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
          containerId: containerId ?? null,
          status: 'running',
        })
        .returning()
      record = inserted as AgentSessionRecord
    } catch (err) {
      try { this.pty.kill(ptyResult.id) } catch { /* already dead */ }
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

  async kill(sessionId: string, ptySessionId: string, containerId?: string): Promise<void> {
    try {
      this.pty.kill(ptySessionId)
    } catch {
      // PTY may already be dead
    }
    if (containerId && this.sandbox) {
      this.sandbox.stop(containerId)
    }
    await this.db
      .update(agentSessions)
      .set({ status: 'finished', updatedAt: new Date().toISOString() })
      .where(eq(agentSessions.id, sessionId))
  }
}
