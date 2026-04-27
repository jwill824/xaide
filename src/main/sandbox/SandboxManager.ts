import { execFileSync } from 'node:child_process'

export interface SandboxCreateOptions {
  name: string
  worktreePath: string
}

export interface SandboxInfo {
  sandboxName: string
  worktreePath: string
}

// Forward-compatibility hook for future agent name translation (e.g. 'gpt' → 'openai').
// Currently all entries are identity mappings; unknown agents fall through unchanged.
const SBX_AGENT_MAP: Record<string, string> = {
  claude: 'claude',
  copilot: 'copilot',
}

export class SandboxManager {
  isSbxAvailable(): boolean {
    try {
      execFileSync('sbx', ['--version'], { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }

  create(options: SandboxCreateOptions): SandboxInfo {
    execFileSync(
      'sbx',
      ['create', '--name', options.name, '--workspace', options.worktreePath],
      { stdio: 'pipe' },
    )
    return { sandboxName: options.name, worktreePath: options.worktreePath }
  }

  stop(sandboxName: string): void {
    try {
      execFileSync('sbx', ['stop', sandboxName], { stdio: 'pipe' })
    } catch {
      // Sandbox may already be stopped or removed
    }
  }

  remove(sandboxName: string): void {
    try {
      execFileSync('sbx', ['rm', sandboxName], { stdio: 'pipe' })
    } catch {
      // Sandbox may already be removed
    }
  }

  runArgs(sandboxName: string, agentId: string): { command: string; args: string[] } {
    const sbxAgent = SBX_AGENT_MAP[agentId] ?? agentId
    return {
      command: 'sbx',
      args: ['run', sbxAgent, '--name', sandboxName],
    }
  }
}
