#!/usr/bin/env node
// scripts/verify-s01.js — S01 acceptance verification
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')

function check(filePath, needle, label) {
  const abs = path.join(root, filePath)
  if (!fs.existsSync(abs)) {
    console.error(`FAIL [${label}] file not found: ${filePath}`)
    process.exit(1)
  }
  const content = fs.readFileSync(abs, 'utf8')
  if (!content.includes(needle)) {
    console.error(`FAIL [${label}] '${needle}' not found in ${filePath}`)
    process.exit(1)
  }
  console.log(`PASS [${label}] '${needle}' found in ${filePath}`)
}

check('src/renderer/src/hooks/useWorkspaces.ts', 'useCreateWorkspace', 'hook export')
check('src/renderer/src/components/LeftPanel.tsx', 'useCreateWorkspace', 'form in LeftPanel')

console.log('\nAll checks passed.')
process.exit(0)
