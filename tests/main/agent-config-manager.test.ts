import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from '../../src/main/db/client'
import { dbSchema } from '../../src/main/db/schema'
import { AgentConfigManager } from '../../src/main/settings/AgentConfigManager'
import { writeFile, rm, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

let manager: AgentConfigManager
let workspaceId: string
let tmpDir: string

beforeEach(async () => {
  const raw = createDb(':memory:')
  const db = drizzle(raw, { schema: dbSchema })
  manager = new AgentConfigManager(db)
  tmpDir = join(tmpdir(), randomUUID())
  await mkdir(tmpDir, { recursive: true })

  const ws = await db
    .insert(dbSchema.workspaces)
    .values({ id: 'ws-1', name: 'WS', repoPath: tmpDir, configJson: '{}', sandboxDefaults: '{}', layoutJson: '{}' })
    .returning()
  workspaceId = ws[0].id
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('AgentConfigManager', () => {
  it('returns null when no global config exists', async () => {
    expect(await manager.getGlobal()).toBeNull()
  })

  it('upsert creates a new global config', async () => {
    const cfg = await manager.upsert({ scope: 'global', systemPromptAdditions: 'Be concise.' })
    expect(cfg.scope).toBe('global')
    expect(cfg.systemPromptAdditions).toBe('Be concise.')
  })

  it('upsert updates existing global config', async () => {
    await manager.upsert({ scope: 'global', systemPromptAdditions: 'First.' })
    const updated = await manager.upsert({ scope: 'global', systemPromptAdditions: 'Second.' })
    expect(updated.systemPromptAdditions).toBe('Second.')
    expect(await manager.getGlobal()).not.toBeNull()
  })

  it('upsert creates per-workspace config', async () => {
    const cfg = await manager.upsert({ scope: 'workspace', workspaceId, systemPromptAdditions: 'WS only.' })
    expect(cfg.workspaceId).toBe(workspaceId)
  })

  it('readClaudeConfig returns empty when CLAUDE.md missing', async () => {
    const result = await manager.readClaudeConfig(tmpDir)
    expect(result).toEqual({ external: '', xaideManaged: '' })
  })

  it('writeClaudeConfig creates CLAUDE.md with markers', async () => {
    await manager.writeClaudeConfig(tmpDir, 'My xaide content.')
    const result = await manager.readClaudeConfig(tmpDir)
    expect(result.xaideManaged).toBe('My xaide content.')
    expect(result.external).toBe('')
  })

  it('writeClaudeConfig preserves existing external content', async () => {
    await writeFile(join(tmpDir, 'CLAUDE.md'), '# Existing content\n\nKeep this.\n', 'utf-8')
    await manager.writeClaudeConfig(tmpDir, 'Xaide additions.')
    const result = await manager.readClaudeConfig(tmpDir)
    expect(result.external).toContain('Keep this.')
    expect(result.xaideManaged).toBe('Xaide additions.')
  })

  it('writeCopilotConfig creates .github/copilot-instructions.md', async () => {
    await manager.writeCopilotConfig(tmpDir, 'Copilot instructions.')
    const result = await manager.readCopilotConfig(tmpDir)
    expect(result.xaideManaged).toBe('Copilot instructions.')
  })
})
