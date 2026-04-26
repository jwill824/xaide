import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, chmodSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { HookRunner } from '../../src/main/worktree/HookRunner'

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xaide-hook-'))
  return dir
}

describe('HookRunner', () => {
  let repoPath: string
  let runner: HookRunner

  beforeEach(() => {
    repoPath = makeRepo()
    runner = new HookRunner()
  })

  afterEach(() => {
    rmSync(repoPath, { recursive: true, force: true })
  })

  it('silently skips when no hooks dir exists', async () => {
    await expect(
      runner.run('worktree.created', {
        repoPath,
        branch: 'xaide/test-1',
        worktreePath: '/tmp/wt',
      }),
    ).resolves.toBeUndefined()
  })

  it('silently skips when no matching script exists', async () => {
    mkdirSync(join(repoPath, '.agentapp', 'hooks'), { recursive: true })
    await expect(
      runner.run('worktree.created', {
        repoPath,
        branch: 'xaide/test-1',
        worktreePath: '/tmp/wt',
      }),
    ).resolves.toBeUndefined()
  })

  it('runs a .sh hook script and passes env vars', async () => {
    const hooksDir = join(repoPath, '.agentapp', 'hooks')
    mkdirSync(hooksDir, { recursive: true })
    const outFile = join(repoPath, 'hook.out')
    const scriptPath = join(hooksDir, 'worktree-created.sh')
    writeFileSync(
      scriptPath,
      `#!/bin/sh\necho "$XAIDE_BRANCH:$XAIDE_WORKTREE_PATH" > "${outFile}"\n`,
    )
    chmodSync(scriptPath, 0o755)

    await runner.run('worktree.created', {
      repoPath,
      branch: 'xaide/my-branch',
      worktreePath: '/tmp/test-wt',
    })

    const output = readFileSync(outFile, 'utf8').trim()
    expect(output).toBe('xaide/my-branch:/tmp/test-wt')
  })

  it('throws when hook script exits with non-zero', async () => {
    const hooksDir = join(repoPath, '.agentapp', 'hooks')
    mkdirSync(hooksDir, { recursive: true })
    const scriptPath = join(hooksDir, 'worktree-created.sh')
    writeFileSync(scriptPath, '#!/bin/sh\nexit 1\n')
    chmodSync(scriptPath, 0o755)

    await expect(
      runner.run('worktree.created', {
        repoPath,
        branch: 'xaide/test',
        worktreePath: '/tmp/wt',
      }),
    ).rejects.toThrow()
  })
})
