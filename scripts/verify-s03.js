#!/usr/bin/env node
// verify-s03.js — Static checks for Slice S03 (Live Terminal Output)
// Uses only Node built-ins: fs.readFileSync + process.exit. No shell, no spawn.

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

const checks = [
  {
    label: 'AgentSessionManager onData sends PTY_CHANNELS.DATA',
    file: 'src/main/agent/AgentSessionManager.ts',
    pattern: /\.send\(PTY_CHANNELS\.DATA/,
  },
  {
    label: 'AgentSessionManager onExit sends PTY_CHANNELS.EXIT',
    file: 'src/main/agent/AgentSessionManager.ts',
    pattern: /\.send\(PTY_CHANNELS\.EXIT/,
  },
  {
    label: 'PtyManager duplicate-ID guard',
    file: 'src/main/pty/PtyManager.ts',
    pattern: /already exists/,
  },
  {
    label: 'TerminalPane subscribes to onData',
    file: 'src/renderer/src/components/TerminalPane.tsx',
    pattern: /window\.xaide\.pty\.onData/,
  },
  {
    label: 'TerminalPane subscribes to onExit',
    file: 'src/renderer/src/components/TerminalPane.tsx',
    pattern: /window\.xaide\.pty\.onExit/,
  },
  {
    label: 'TerminalPane keyboard input: pty.write',
    file: 'src/renderer/src/components/TerminalPane.tsx',
    pattern: /window\.xaide\.pty\.write/,
  },
  {
    label: 'TerminalPane writes [Process exited] on exit',
    file: 'src/renderer/src/components/TerminalPane.tsx',
    pattern: /Process exited/,
  },
  {
    label: 'MainArea onReady calls agent.spawnSession',
    file: 'src/renderer/src/components/MainArea.tsx',
    pattern: /agent\.spawnSession/,
  },
  {
    label: 'main/index.ts sets webContents on activate',
    file: 'src/main/index.ts',
    pattern: /setWebContents/,
  },
]

const failures = []

for (const { label, file, pattern } of checks) {
  const filePath = path.join(root, file)
  let content
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    console.log(`FAIL  [${label}] — could not read ${file}: ${err.message}`)
    failures.push(label)
    continue
  }

  const ok = typeof pattern === 'string' ? content.includes(pattern) : pattern.test(content)
  if (ok) {
    console.log(`PASS  [${label}]`)
  } else {
    console.log(`FAIL  [${label}] — pattern not found in ${file}`)
    failures.push(label)
  }
}

console.log('')
if (failures.length === 0) {
  console.log(`All ${checks.length} checks passed.`)
  process.exit(0)
} else {
  console.log(`${failures.length} of ${checks.length} checks FAILED: ${failures.join(', ')}`)
  process.exit(1)
}
