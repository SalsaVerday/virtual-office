/**
 * Fill STAGING_URL in teams/manifest.json and zip a sideload package.
 * Usage: node scripts/package-teams.mjs https://staging.example.com
 * The placeholder in git is the literal host STAGING_URL. This script does not upload anything.
 */
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { validateTeamsManifest } from './validate-teams-manifest.mjs'

const require = createRequire(import.meta.url)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const teamsDir = path.join(root, 'teams')
const dist = path.join(teamsDir, 'dist')
const staging = path.join(dist, 'app')

const originArg = (process.argv[2] || process.env.STAGING_URL || '').trim().replace(/\/$/, '')
if (!originArg) {
  console.error('Pass the staging origin: ./scripts/package-teams.sh https://<preview-host>')
  process.exit(1)
}
let origin
try {
  origin = new URL(originArg)
} catch {
  console.error('STAGING_URL must be an https origin, for example https://office.vercel.app')
  process.exit(1)
}
if (origin.protocol !== 'https:' || !origin.hostname || origin.hostname === 'STAGING_URL') {
  console.error('STAGING_URL must be an https origin with a real host, for example https://office.vercel.app')
  process.exit(1)
}
const host = origin.hostname
const base = origin.origin

const raw = await readFile(path.join(teamsDir, 'manifest.json'), 'utf8')
const filled = raw.replaceAll('https://STAGING_URL', base).replaceAll('STAGING_URL', host)
const manifest = JSON.parse(filled)
if (!String(manifest.staticTabs?.[0]?.contentUrl || '').includes('zone=standup')) {
  console.error('contentUrl lost the standup deep link')
  process.exit(1)
}
const errors = validateTeamsManifest(manifest)
if (errors.length > 0) {
  console.error(errors.join('\n'))
  process.exit(1)
}
const Ajv = require('ajv-draft-04')
const schema = JSON.parse(readFileSync(path.join(teamsDir, 'MicrosoftTeams.schema.json'), 'utf8'))
delete schema.$schema
const ajv = new Ajv({ allErrors: true, strict: false, logger: false })
const validate = ajv.compile(schema)
if (!validate(manifest)) {
  console.error(JSON.stringify(validate.errors, null, 2))
  process.exit(1)
}

await rm(staging, { recursive: true, force: true })
await mkdir(staging, { recursive: true })
await writeFile(path.join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
for (const icon of ['color.png', 'outline.png', 'color32x32.png']) {
  await copyFile(path.join(teamsDir, icon), path.join(staging, icon))
}

const zipPath = path.join(dist, 'virtual-office-teams.zip')
await rm(zipPath, { force: true })
const zip = spawnSync('zip', ['-j', zipPath, 'manifest.json', 'color.png', 'outline.png', 'color32x32.png'], {
  cwd: staging,
  encoding: 'utf8',
})
if (zip.status !== 0) {
  console.error(zip.stderr || 'zip failed')
  process.exit(zip.status || 1)
}
console.log(`wrote ${path.relative(root, zipPath)} for ${base}/?zone=standup&entry=teams_tab`)
