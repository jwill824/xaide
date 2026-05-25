#!/usr/bin/env node
// verify-s04.js — Static checks for Slice S04 (Git Panel Status and Diff)
// Uses only Node built-ins: fs.readFileSync + process.exit. No shell, no spawn.

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

const checks = [
  {
    label: 'main/index.ts — synchronous .get() query for worktree',
    file: 'src/main/index.ts',
    pattern: /\.get\(\)/,
  },
  {
    label: 'main/index.ts — eq(worktrees.id usage',
    file: 'src/main/index.ts',
    pattern: /eq\(worktrees\.id/,
  },
  {
    label: 'git.ipc.ts — registerGitHandlers exported',
    file: 'src/main/git/git.ipc.ts',
    pattern: /export function registerGitHandlers/,
  },
  {
    label: 'GitPanel.tsx — WorktreeSelector rendered',
    file: 'src/renderer/src/components/GitPanel.tsx',
    pattern: /WorktreeSelector/,
  },
  {
    label: 'GitPanel.tsx — GitFileList rendered',
    file: 'src/renderer/src/components/GitPanel.tsx',
    pattern: /GitFileList/,
  },
  {
    label: 'GitPanel.tsx — CommitForm rendered',
    file: 'src/renderer/src/components/GitPanel.tsx',
    pattern: /CommitForm/,
  },
  {
    label: 'GitPanel.tsx — DiffViewer rendered',
    file: 'src/renderer/src/components/GitPanel.tsx',
    pattern: /DiffViewer/,
  },
  {
    label: 'useGit.ts — useGitStatus exported',
    file: 'src/renderer/src/hooks/useGit.ts',
    pattern: /export function useGitStatus/,
  },
  {
    label: 'useGit.ts — useGitCommit exported',
    file: 'src/renderer/src/hooks/useGit.ts',
    pattern: /export function useGitCommit/,
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
