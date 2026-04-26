import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { DetectedAgent } from './types'

export class AgentRegistry {
  detect(): DetectedAgent[] {
    return [this.detectClaude(), this.detectCopilot()]
  }

  private which(cmd: string): string | null {
    try {
      const out = execSync(`which ${cmd}`)
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
    const ghBin = this.which('gh')
    if (!ghBin) {
      return {
        id: 'copilot',
        name: 'GitHub Copilot',
        command: 'gh',
        args: ['copilot'],
        installed: false,
        configPath: null,
      }
    }
    let hasCopilotExt = false
    try {
      const output = execSync('gh extension list', { encoding: 'utf8', stdio: 'pipe' })
      hasCopilotExt = output.includes('github/gh-copilot')
    } catch {
      hasCopilotExt = false
    }
    return {
      id: 'copilot',
      name: 'GitHub Copilot',
      command: 'gh',
      args: ['copilot'],
      installed: hasCopilotExt,
      configPath: hasCopilotExt ? join(homedir(), '.config', 'gh') : null,
    }
  }
}
