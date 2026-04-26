import { existsSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export type HookEvent =
  | 'worktree.created'
  | 'agent.started'
  | 'agent.idle'
  | 'agent.finished'
  | 'sandbox.ready'
  | 'pr.created'
  | 'task.loaded'
  | 'task.parallel.launched'

export type HookContext = {
  repoPath: string
  branch: string
  worktreePath: string
}

function eventToFilename(event: HookEvent): string {
  return event.replace(/\./g, '-')
}

export class HookRunner {
  async run(event: HookEvent, ctx: HookContext): Promise<void> {
    const hooksDir = join(ctx.repoPath, '.agentapp', 'hooks')
    if (!existsSync(hooksDir)) return

    const stem = eventToFilename(event)
    for (const ext of ['.sh', '.js', '']) {
      const scriptPath = join(hooksDir, stem + ext)
      if (existsSync(scriptPath)) {
        await this.runScript(scriptPath, ctx)
        return
      }
    }
  }

  private async runScript(scriptPath: string, ctx: HookContext): Promise<void> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      XAIDE_REPO_PATH: ctx.repoPath,
      XAIDE_BRANCH: ctx.branch,
      XAIDE_WORKTREE_PATH: ctx.worktreePath,
    }
    await execFileAsync(scriptPath, [], { env })
  }
}
