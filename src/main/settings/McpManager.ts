import { randomUUID } from 'node:crypto'
import { eq, isNull, or } from 'drizzle-orm'
import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { DrizzleDb } from '../db/schema'
import { mcpServers } from '../db/schema'

export type McpServer = typeof mcpServers.$inferSelect

export interface McpServerConfig {
  command?: string
  url?: string
  args?: string[]
  env?: Record<string, string>
  workspaceId?: string
}

export class McpManager {
  constructor(private db: DrizzleDb) {}

  async list(workspaceId?: string): Promise<McpServer[]> {
    if (workspaceId) {
      return this.db
        .select()
        .from(mcpServers)
        .where(or(isNull(mcpServers.workspaceId), eq(mcpServers.workspaceId, workspaceId)))
    }
    return this.db.select().from(mcpServers).where(isNull(mcpServers.workspaceId))
  }

  async create(input: {
    name: string
    scope: 'global' | 'workspace'
    config: McpServerConfig
  }): Promise<McpServer> {
    const rows = await this.db
      .insert(mcpServers)
      .values({
        id: randomUUID(),
        name: input.name,
        scope: input.scope,
        workspaceId: input.config.workspaceId ?? null,
        configJson: JSON.stringify(input.config),
        enabled: true,
        createdAt: new Date().toISOString(),
      })
      .returning()
    return rows[0]
  }

  async update(
    id: string,
    input: { name?: string; config?: McpServerConfig; enabled?: boolean },
  ): Promise<McpServer> {
    const existing = await this.db
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.id, id))
      .limit(1)
    if (!existing[0]) throw new Error(`MCP server not found: ${id}`)
    const rows = await this.db
      .update(mcpServers)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.config !== undefined ? { configJson: JSON.stringify(input.config) } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      })
      .where(eq(mcpServers.id, id))
      .returning()
    return rows[0]
  }

  async delete(id: string): Promise<void> {
    const result = await this.db.delete(mcpServers).where(eq(mcpServers.id, id)).returning()
    if (result.length === 0) throw new Error(`MCP server not found: ${id}`)
  }

  async writeClaudeMcpConfig(repoPath: string, workspaceId: string): Promise<void> {
    const servers = (await this.list(workspaceId)).filter((s) => s.enabled)
    const mcpConfig: Record<string, unknown> = {}
    for (const s of servers) {
      const cfg = JSON.parse(s.configJson) as McpServerConfig
      mcpConfig[s.name] = cfg.url
        ? { type: 'sse', url: cfg.url, ...(cfg.env ? { env: cfg.env } : {}) }
        : {
            type: 'stdio',
            command: cfg.command!,
            args: cfg.args ?? [],
            ...(cfg.env ? { env: cfg.env } : {}),
          }
    }
    await writeFile(
      join(repoPath, '.mcp.json'),
      JSON.stringify({ mcpServers: mcpConfig }, null, 2),
      'utf-8',
    )
  }

  async writeCopilotMcpConfig(repoPath: string, workspaceId: string): Promise<void> {
    const servers = (await this.list(workspaceId)).filter((s) => s.enabled)
    const inputs: Record<string, unknown> = {}
    for (const s of servers) {
      const cfg = JSON.parse(s.configJson) as McpServerConfig
      inputs[s.name] = cfg.url
        ? { type: 'sse', url: cfg.url, ...(cfg.env ? { env: cfg.env } : {}) }
        : { type: 'stdio', command: cfg.command!, args: cfg.args ?? [] }
    }
    await mkdir(join(repoPath, '.vscode'), { recursive: true })
    await writeFile(
      join(repoPath, '.vscode', 'mcp.json'),
      JSON.stringify({ servers: inputs }, null, 2),
      'utf-8',
    )
  }
}
