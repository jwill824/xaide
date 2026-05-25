#!/usr/bin/env node
// verify-s02.js — Static checks for Slice S02 (Task Creation and Agent Launch)
// Uses only Node built-ins: fs.readFileSync + process.exit. No shell, no spawn.

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

const checks = [
  {
    label: 'AgentLauncher empty-state',
    file: 'src/renderer/src/components/AgentLauncher.tsx',
    pattern: /No worktrees/,
  },
  {
    label: 'MainArea launch error state',
    file: 'src/renderer/src/components/MainArea.tsx',
    pattern: /launchError/,
  },
  {
    label: 'MainArea inline error render',
    file: 'src/renderer/src/components/MainArea.tsx',
    pattern: /launchError &&/,
  },
  {
    label: 'MainArea pendingSpawns',
    file: 'src/renderer/src/components/MainArea.tsx',
    pattern: /pendingSpawns/,
  },
  {
    label: 'MainArea addAgentSession',
    file: 'src/renderer/src/components/MainArea.tsx',
    pattern: /addAgentSession/,
  },
  {
    label: 'SessionTabBar agent launcher button',
    file: 'src/renderer/src/components/SessionTabBar.tsx',
    pattern: /onOpenAgentLauncher/,
  },
  {
    label: 'useLaunchAgent mutation',
    file: 'src/renderer/src/hooks/useAgents.ts',
    pattern: /useLaunchAgent/,
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
