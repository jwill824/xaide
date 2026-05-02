import simpleGit from 'simple-git'
import type { StatusResult, DiffResult, CommitInfo, LogResult, Hunk } from './types'

export class GitManager {
  private git: ReturnType<typeof simpleGit>
  private repoPath: string

  constructor(repoPath: string) {
    this.repoPath = repoPath
    this.git = simpleGit(repoPath)
  }

  async status(): Promise<StatusResult> {
    try {
      const s = await this.git.status()
      return {
        branch: s.current,
        ahead: s.ahead,
        behind: s.behind,
        staged: s.staged,
        unstaged: s.modified,
        untracked: s.not_added,
      }
    } catch (e: any) {
      throw new Error(`Failed to get status: ${e.message}`)
    }
  }

  async diff(filePath: string, staged: boolean): Promise<DiffResult> {
    try {
      const unifiedMode = staged
        ? await this.git.diff(['--staged', filePath])
        : await this.git.diff([filePath])
      const splitMode = { hunks: parseDiffHunks(unifiedMode) }
      return { filePath, splitMode, unifiedMode }
    } catch (e: any) {
      throw new Error(`Failed to get diff: ${e.message}`)
    }
  }

  async log(limit = 20, branchName?: string, baseBranchName?: string): Promise<LogResult> {
    try {
      const branch = branchName || (await this.git.revparse(['--abbrev-ref', 'HEAD']))
      const base = baseBranchName || 'main'
      const branchCommitsRaw = await this.git.log({ n: limit, from: branch })
      const branchCommits: CommitInfo[] = branchCommitsRaw.all.map(c => ({
        hash: c.hash,
        author: c.author_name,
        date: c.date,
        message: c.message,
      }))
      let baseContextCommits: CommitInfo[] = []
      try {
        const baseCommitsRaw = await this.git.log({ n: 5, from: base })
        baseContextCommits = baseCommitsRaw.all.map(c => ({
          hash: c.hash,
          author: c.author_name,
          date: c.date,
          message: c.message,
        }))
      } catch {}
      return { branchCommits, baseContextCommits }
    } catch (e: any) {
      throw new Error(`Failed to get log: ${e.message}`)
    }
  }

  async stage(files: string[]): Promise<void> {
    try {
      await this.git.add(files)
    } catch (e: any) {
      throw new Error(`Failed to stage files: ${e.message}`)
    }
  }

  async unstage(files: string[]): Promise<void> {
    try {
      await this.git.reset(['--', ...files])
    } catch (e: any) {
      throw new Error(`Failed to unstage files: ${e.message}`)
    }
  }

  async discard(files: string[]): Promise<void> {
    try {
      await this.git.checkout(files)
    } catch (e: any) {
      throw new Error(`Failed to discard changes: ${e.message}`)
    }
  }

  async commit(message: string, amend = false): Promise<string> {
    try {
      const res = await this.git.commit(message, undefined, amend ? ['--amend'] : undefined)
      return res.commit
    } catch (e: any) {
      throw new Error(`Failed to commit: ${e.message}`)
    }
  }

  async push(setUpstream = false): Promise<string> {
    try {
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD'])
      const args = setUpstream ? ['--set-upstream', 'origin', branch] : []
      const res = await this.git.push(args)
      return typeof res === 'string' ? res : JSON.stringify(res)
    } catch (e: any) {
      throw new Error(`Failed to push: ${e.message}`)
    }
  }
}

function parseDiffHunks(diff: string): Hunk[] {
  const lines = diff.split('\n')
  const hunks: Hunk[] = []
  let hunkLines: string[] = []
  let oldStart = 0, oldLines = 0, newStart = 0, newLines = 0
  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (hunkLines.length) {
        hunks.push({ oldStart, oldLines, newStart, newLines, content: hunkLines.join('\n') })
        hunkLines = []
      }
      const m = /@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(line)
      if (m) {
        oldStart = parseInt(m[1], 10)
        oldLines = parseInt(m[2], 10)
        newStart = parseInt(m[3], 10)
        newLines = parseInt(m[4], 10)
      }
    }
    if (line.startsWith('@@') || hunkLines.length) hunkLines.push(line)
  }
  if (hunkLines.length) {
    hunks.push({ oldStart, oldLines, newStart, newLines, content: hunkLines.join('\n') })
  }
  return hunks
}
