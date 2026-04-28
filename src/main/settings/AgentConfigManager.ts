import { randomUUID } from 'node:crypto'
import { eq, and, isNull } from 'drizzle-orm'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { DrizzleDb } from '../db/schema'
import { agentConfigs } from '../db/schema'

export type AgentConfig = typeof agentConfigs.$inferSelect

const XAIDE_START = '<!-- xaide:start -->'
const XAIDE_END = '<!-- xaide:end -->'

export class AgentConfigManager {
  constructor(private db: DrizzleDb) {}

  async getGlobal(): Promise<AgentConfig | null> {
    const rows = await this.db
      .select()
      .from(agentConfigs)
      .where(and(eq(agentConfigs.scope, 'global'), isNull(agentConfigs.workspaceId)))
      .limit(1)
    return rows[0] ?? null
  }

  async getForWorkspace(workspaceId: string): Promise<AgentConfig | null> {
    const rows = await this.db
      .select()
      .from(agentConfigs)
      .where(and(eq(agentConfigs.scope, 'workspace'), eq(agentConfigs.workspaceId, workspaceId)))
      .limit(1)
    return rows[0] ?? null
  }

  async upsert(input: {
    scope: 'global' | 'workspace'
    workspaceId?: string
    agentType?: 'claude' | 'copilot' | 'all'
    systemPromptAdditions?: string
    configJson?: string
  }): Promise<AgentConfig> {
    const now = new Date().toISOString()
    const existing =
      input.scope === 'global'
        ? await this.getGlobal()
        : await this.getForWorkspace(input.workspaceId!)

    if (existing) {
      const rows = await this.db
        .update(agentConfigs)
        .set({
          agentType: input.agentType ?? existing.agentType,
          systemPromptAdditions: input.systemPromptAdditions ?? existing.systemPromptAdditions,
          configJson: input.configJson ?? existing.configJson,
          updatedAt: now,
        })
        .where(eq(agentConfigs.id, existing.id))
        .returning()
      return rows[0]
    }

    const rows = await this.db
      .insert(agentConfigs)
      .values({
        id: randomUUID(),
        scope: input.scope,
        workspaceId: input.workspaceId ?? null,
        agentType: input.agentType ?? 'all',
        systemPromptAdditions: input.systemPromptAdditions ?? '',
        configJson: input.configJson ?? '{}',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    return rows[0]
  }

  async readClaudeConfig(repoPath: string): Promise<{ external: string; xaideManaged: string }> {
    const path = join(repoPath, 'CLAUDE.md')
    if (!existsSync(path)) return { external: '', xaideManaged: '' }
    const content = await readFile(path, 'utf-8')
    return this._parseMarkers(content)
  }

  async writeClaudeConfig(repoPath: string, xaideContent: string): Promise<void> {
    const { external } = await this.readClaudeConfig(repoPath)
    const parts = [...(external ? [external] : []), XAIDE_START, xaideContent, XAIDE_END]
    await writeFile(join(repoPath, 'CLAUDE.md'), parts.join('\n\n') + '\n', 'utf-8')
  }

  async readCopilotConfig(repoPath: string): Promise<{ external: string; xaideManaged: string }> {
    const path = join(repoPath, '.github', 'copilot-instructions.md')
    if (!existsSync(path)) return { external: '', xaideManaged: '' }
    const content = await readFile(path, 'utf-8')
    return this._parseMarkers(content)
  }

  async writeCopilotConfig(repoPath: string, xaideContent: string): Promise<void> {
    const { external } = await this.readCopilotConfig(repoPath)
    await mkdir(join(repoPath, '.github'), { recursive: true })
    const parts = [...(external ? [external] : []), XAIDE_START, xaideContent, XAIDE_END]
    await writeFile(
      join(repoPath, '.github', 'copilot-instructions.md'),
      parts.join('\n\n') + '\n',
      'utf-8',
    )
  }

  private _parseMarkers(content: string): { external: string; xaideManaged: string } {
    const startIdx = content.indexOf(XAIDE_START)
    const endIdx = content.indexOf(XAIDE_END)
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      return { external: content.trim(), xaideManaged: '' }
    }
    const external = content.slice(0, startIdx).trim()
    const xaideManaged = content.slice(startIdx + XAIDE_START.length, endIdx).trim()
    return { external, xaideManaged }
  }
}
