import { execFileSync, execSync } from 'node:child_process'
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
    // Check for standalone `copilot` binary (GitHub Copilot CLI)
    const copilotBin = this.which('copilot')
    if (copilotBin) {
      return {
        id: 'copilot',
        name: 'GitHub Copilot',
        command: 'copilot',
        args: [],
        installed: true,
        configPath: join(homedir(), '.config', 'gh'),
      }
    }

    // Fallback: check for `gh copilot` subcommand via gh extension
    const gh = this.which('gh')
    let installed = false
    if (gh) {
      try {
        const out = execSync('gh extension list', { encoding: 'utf8' })
        installed = out.includes('copilot')
      } catch {
        installed = false
      }
      // Also try invoking `gh copilot --version` as a direct check
      if (!installed) {
        try {
          execSync('gh copilot --version', { encoding: 'utf8', stdio: 'pipe' })
          installed = true
        } catch {
          installed = false
        }
      }
    }

    return {
      id: 'copilot',
      name: 'GitHub Copilot',
      command: gh ? 'gh' : 'copilot',
      args: gh && installed ? ['copilot'] : [],
      installed,
      configPath: gh ? join(homedir(), '.config', 'gh') : null,
    }
  }
}
