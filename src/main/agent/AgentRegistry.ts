import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { DetectedAgent } from './types'

export class AgentRegistry {
  detect(): DetectedAgent[] {
    return [this.detectClaude(), this.detectCopilot()]
  }

  private which(cmd: string): string | null {
    try {
      const out = execFileSync('which', [cmd])
      return Buffer.isBuffer(out) ? out.toString('utf8').trim() : String(out).trim()
    } catch {
      return null
    }
  }

  private detectClaude(): DetectedAgent {
    const bin = this.which('claude')
    return {
      id: 'claude',
      name: 'Claude Code',
      command: 'claude',
      args: [],
      installed: bin !== null,
      configPath: bin ? join(homedir(), '.claude', 'settings.json') : null,
    }
  }

  private detectCopilot(): DetectedAgent {
    const bin = this.which('copilot')
    return {
      id: 'copilot',
      name: 'GitHub Copilot',
      command: 'copilot',
      args: [],
      installed: bin !== null,
      configPath: bin ? join(homedir(), '.config', 'gh') : null,
    }
  }
}
