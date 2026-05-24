import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import os from 'os'
import simpleGit from 'simple-git'
import { GitManager } from '../../../src/main/git/GitManager'

function tmpRepo() {
  const dir = mkdtempSync(join(os.tmpdir(), 'gitman-'))
  const git = simpleGit(dir)
  return { dir, git }
}

describe('GitManager', () => {
  let repoDir: string
  let git: ReturnType<typeof simpleGit>
  let mgr: GitManager

  beforeEach(async () => {
    const { dir, git: g } = tmpRepo()
    repoDir = dir
    git = g
    await git.init()
    writeFileSync(join(repoDir, 'a.txt'), 'hello\n')
    await git.add(['a.txt'])
    await git.commit('init')
    mgr = new GitManager(repoDir)
  })

  afterEach(() => {
    rmSync(repoDir, { recursive: true, force: true })
  })

  it('status(): branch, ahead/behind, staged/unstaged', async () => {
    writeFileSync(join(repoDir, 'b.txt'), 'b\n')
    await mgr.stage(['b.txt'])
    writeFileSync(join(repoDir, 'a.txt'), 'hello world\n')
    const s = await mgr.status()
    // git init defaults to 'main' on most systems now, but can be 'master' on older configs
    expect(['main', 'master']).toContain(s.branch)
    expect(typeof s.ahead).toBe('number')
    expect(typeof s.behind).toBe('number')
    expect(s.staged).toContain('b.txt')
    expect(s.unstaged).toContain('a.txt')
    expect(Array.isArray(s.untracked)).toBe(true)
  })

  it('diff(): hunks parsed, split/unified', async () => {
    writeFileSync(join(repoDir, 'a.txt'), 'hello world\n')
    const diff = await mgr.diff('a.txt', false)
    expect(diff.filePath).toBe('a.txt')
    expect(diff.unifiedMode).toMatch(/@@/) // unified diff
    expect(diff.splitMode.hunks.length).toBeGreaterThan(0)
    // staged diff
    await mgr.stage(['a.txt'])
    const stagedDiff = await mgr.diff('a.txt', true)
    expect(stagedDiff.unifiedMode).toMatch(/@@/)
  })

  it('log(): branchCommits and baseContextCommits', async () => {
    writeFileSync(join(repoDir, 'b.txt'), 'b\n')
    await mgr.stage(['b.txt'])
    await mgr.commit('add b')
    const log = await mgr.log(5)
    expect(log.branchCommits.length).toBeGreaterThan(0)
    expect(Array.isArray(log.baseContextCommits)).toBe(true)
  })

  it('stage(): files added to staged', async () => {
    writeFileSync(join(repoDir, 'c.txt'), 'c\n')
    await mgr.stage(['c.txt'])
    const s = await mgr.status()
    expect(s.staged).toContain('c.txt')
  })

  it('unstage(): files removed from staged', async () => {
    writeFileSync(join(repoDir, 'd.txt'), 'd\n')
    await mgr.stage(['d.txt'])
    await mgr.unstage(['d.txt'])
    const s = await mgr.status()
    expect(s.staged).not.toContain('d.txt')
  })

  it('discard(): changes are discarded', async () => {
    writeFileSync(join(repoDir, 'a.txt'), 'changed\n')
    await mgr.discard(['a.txt'])
    const content = require('fs').readFileSync(join(repoDir, 'a.txt'), 'utf8')
    expect(content).toBe('hello\n')
  })

  it('commit(): commit is created', async () => {
    writeFileSync(join(repoDir, 'e.txt'), 'e\n')
    await mgr.stage(['e.txt'])
    const hash = await mgr.commit('add e')
    expect(typeof hash).toBe('string')
    expect(hash.length).toBeGreaterThan(0)
  })

  it('push(): push output (no remote)', async () => {
    // Should throw or return error since no remote
    let threw = false
    try {
      await mgr.push()
    } catch (e: any) {
      threw = true
      expect(e.message).toMatch(/Failed to push/)
    }
    expect(threw).toBe(true)
  })
})
