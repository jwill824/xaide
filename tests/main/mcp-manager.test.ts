import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { createDb } from '../../src/main/db/client'
import { dbSchema } from '../../src/main/db/schema'
import { McpManager } from '../../src/main/settings/McpManager'
import { rm, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

let manager: McpManager
let workspaceId: string
let tmpDir: string

beforeEach(async () => {
  const raw = createDb(':memory:')
  const db = drizzle(raw, { schema: dbSchema })
  manager = new McpManager(db)
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

describe('McpManager', () => {
  it('lists empty when no servers', async () => {
    expect(await manager.list()).toHaveLength(0)
  })

  it('creates a global MCP server', async () => {
    const srv = await manager.create({
      name: 'my-mcp',
      scope: 'global',
      config: { command: 'npx', args: ['my-mcp-server'] },
    })
    expect(srv.name).toBe('my-mcp')
    expect(srv.scope).toBe('global')
  })

  it('update changes name and enabled', async () => {
    const srv = await manager.create({ name: 'old', scope: 'global', config: { command: 'cmd' } })
    const updated = await manager.update(srv.id, { name: 'new', enabled: false })
    expect(updated.name).toBe('new')
    expect(updated.enabled).toBe(false)
  })

  it('delete removes server', async () => {
    const srv = await manager.create({ name: 'x', scope: 'global', config: { command: 'cmd' } })
    await manager.delete(srv.id)
    expect(await manager.list()).toHaveLength(0)
  })

  it('writeClaudeMcpConfig writes .mcp.json', async () => {
    await manager.create({ name: 'my-tool', scope: 'global', config: { command: 'npx', args: ['my-tool'] } })
    await manager.writeClaudeMcpConfig(tmpDir, workspaceId)
    const raw = await readFile(join(tmpDir, '.mcp.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.mcpServers['my-tool']).toBeDefined()
  })

  it('writeCopilotMcpConfig writes .vscode/mcp.json', async () => {
    await manager.create({ name: 'my-tool', scope: 'global', config: { url: 'http://localhost:3000' } })
    await manager.writeCopilotMcpConfig(tmpDir, workspaceId)
    const raw = await readFile(join(tmpDir, '.vscode', 'mcp.json'), 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.servers['my-tool']).toBeDefined()
  })
})
