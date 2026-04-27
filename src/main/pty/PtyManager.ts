import * as pty from 'node-pty'
import { randomUUID } from 'crypto'

export interface PtyCreateOptions {
  workspaceId: string
  cols: number
  rows: number
  cwd: string
  env?: Record<string, string>
  /** If provided, spawn this command instead of the default shell. */
  command?: string
  /** Args to pass when `command` is provided. Defaults to []. */
  args?: string[]
}

interface PtySession {
  id: string
  workspaceId: string
  process: pty.IPty
}

export class PtyManager {
  private sessions = new Map<string, PtySession>()

  create(options: PtyCreateOptions): { id: string; process: pty.IPty } {
    const shell =
      options.command ??
      (process.platform === 'win32'
        ? 'powershell.exe'
        : (process.env['SHELL'] ?? '/bin/zsh'))
    const args = options.command ? (options.args ?? []) : []
    const id = randomUUID()
    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-color',
      cols: options.cols,
      rows: options.rows,
      cwd: options.cwd,
      env: { ...process.env, ...options.env } as Record<string, string>,
    })
    this.sessions.set(id, { id, workspaceId: options.workspaceId, process: ptyProcess })
    ptyProcess.onExit(() => {
      this.sessions.delete(id)
    })
    return { id, process: ptyProcess }
  }

  write(id: string, data: string): void {
    const session = this.sessions.get(id)
    if (!session) throw new Error(`PTY session not found: ${id}`)
    session.process.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (!session) throw new Error(`PTY session not found: ${id}`)
    session.process.resize(cols, rows)
  }

  kill(id: string): void {
    const session = this.sessions.get(id)
    if (!session) throw new Error(`PTY session not found: ${id}`)
    this.sessions.delete(id)
    session.process.kill()
  }

  has(id: string): boolean {
    return this.sessions.has(id)
  }

  killAll(): void {
    for (const session of this.sessions.values()) {
      try { session.process.kill() } catch { /* ignore — process may already be dead */ }
    }
    this.sessions.clear()
  }
}
