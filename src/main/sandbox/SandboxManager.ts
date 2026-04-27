import { execFileSync } from 'node:child_process'

export interface SandboxCreateOptions {
  image: string
  worktreePath: string
  branch: string
}

export interface SandboxInfo {
  containerId: string
  image: string
  worktreePath: string
}

export class SandboxManager {
  isDockerAvailable(): boolean {
    try {
      execFileSync('docker', ['info'], { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }

  create(options: SandboxCreateOptions): SandboxInfo {
    const args = [
      'create',
      '--rm',
      '-v', `${options.worktreePath}:/workspace`,
      '-w', '/workspace',
      '--label', `xaide.branch=${options.branch}`,
      options.image,
      'sleep', 'infinity',
    ]
    const output = execFileSync('docker', args, { stdio: 'pipe', encoding: 'utf8' })
    const containerId = output.trim()
    return { containerId, image: options.image, worktreePath: options.worktreePath }
  }

  start(containerId: string): void {
    execFileSync('docker', ['start', containerId], { stdio: 'pipe' })
  }

  stop(containerId: string): void {
    try {
      execFileSync('docker', ['stop', '-t', '5', containerId], { stdio: 'pipe' })
    } catch {
      // Container may already be stopped or removed
    }
  }

  remove(containerId: string): void {
    try {
      execFileSync('docker', ['rm', '-f', containerId], { stdio: 'pipe' })
    } catch {
      // Container may already be removed
    }
  }

  execArgs(containerId: string): { command: string; prefixArgs: string[] } {
    return {
      command: 'docker',
      prefixArgs: ['exec', '-i', containerId],
    }
  }
}
