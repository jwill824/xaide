import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ConfigLoader } from '../../src/main/config/ConfigLoader'

describe('ConfigLoader', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `xaide-config-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('loadGlobal', () => {
    it('returns defaults when file does not exist', () => {
      const loader = new ConfigLoader(join(tmpDir, 'nonexistent.yaml'))
      const config = loader.loadGlobal()
      expect(config.agents).toEqual([])
      expect(config.mcpServers).toEqual([])
      expect(config.sandbox.enabled).toBe(false)
      expect(config.plugins).toEqual([])
      expect(config.hooks).toEqual([])
    })

    it('parses sandbox and plugin config', () => {
      const path = join(tmpDir, 'config.yaml')
      writeFileSync(
        path,
        `
sandbox:
  enabled: true
  image: ubuntu:24.04
plugins:
  - my-plugin
`,
      )
      const config = new ConfigLoader(path).loadGlobal()
      expect(config.sandbox.enabled).toBe(true)
      expect(config.sandbox.image).toBe('ubuntu:24.04')
      expect(config.plugins).toEqual(['my-plugin'])
    })

    it('parses MCP server config', () => {
      const path = join(tmpDir, 'config.yaml')
      writeFileSync(
        path,
        `
mcpServers:
  - name: filesystem
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    scope: global
`,
      )
      const config = new ConfigLoader(path).loadGlobal()
      expect(config.mcpServers).toHaveLength(1)
      expect(config.mcpServers[0].name).toBe('filesystem')
      expect(config.mcpServers[0].args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/tmp'])
    })

    it('throws ZodError for structurally invalid config', () => {
      const path = join(tmpDir, 'config.yaml')
      writeFileSync(path, `sandbox: "not-an-object"`)
      expect(() => new ConfigLoader(path).loadGlobal()).toThrow()
    })
  })

  describe('loadWorkspace', () => {
    it('returns defaults when .agentapp/config.yaml does not exist', () => {
      const config = new ConfigLoader(join(tmpDir, 'global.yaml')).loadWorkspace(tmpDir)
      expect(config.sourceAdapter).toBeUndefined()
      expect(config.methodologyAdapter).toBeUndefined()
      expect(config.hooks).toEqual([])
    })

    it('parses adapter selections', () => {
      mkdirSync(join(tmpDir, '.agentapp'))
      writeFileSync(
        join(tmpDir, '.agentapp', 'config.yaml'),
        `
sourceAdapter: github-issues
methodologyAdapter: spec-kit
`,
      )
      const config = new ConfigLoader(join(tmpDir, 'global.yaml')).loadWorkspace(tmpDir)
      expect(config.sourceAdapter).toBe('github-issues')
      expect(config.methodologyAdapter).toBe('spec-kit')
    })
  })
})
