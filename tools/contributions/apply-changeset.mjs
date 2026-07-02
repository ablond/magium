#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { applyTranslationChangeset } from './changesets.mjs'

const args = parseArgs(process.argv.slice(2))

if (!args.changeset) {
  console.error('Usage: node tools/contributions/apply-changeset.mjs --changeset /path/to/changeset.json [--root /repo] [--stale-report /tmp/stale.json]')
  process.exit(64)
}

const root = args.root ? path.resolve(args.root) : process.cwd()
const changeset = JSON.parse(await fs.readFile(args.changeset, 'utf8'))
const result = await applyTranslationChangeset({ root, changeset })

if (args.staleReport && result.stale.length > 0) {
  await fs.writeFile(args.staleReport, `${JSON.stringify({ stale: result.stale }, null, 2)}\n`)
}

if (result.stale.length > 0) {
  console.error(`Changeset is stale: ${result.stale.map((item) => item.messageId).join(', ')}`)
  process.exit(2)
}

console.log(`Applied ${result.updated.length} translation correction(s).`)

function parseArgs(values) {
  const parsed = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (value === '--changeset') parsed.changeset = values[++index]
    if (value === '--root') parsed.root = values[++index]
    if (value === '--stale-report') parsed.staleReport = values[++index]
  }
  return parsed
}
