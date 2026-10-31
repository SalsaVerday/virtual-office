/**
 * Compile the API with tsc (NodeNext) and import the handlers with plain node.
 * Vercel runs these files as Node ESM. An extensionless relative import fails
 * there with ERR_MODULE_NOT_FOUND, and typecheck alone does not execute them.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, '.api-dist')
const require = createRequire(path.join(root, 'package.json'))
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
const dependencies = new Set(Object.keys(pkg.dependencies ?? {}))

const specifierRe = /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s+)?['"]([^'"]+)['"]/g

function specifiers(source) {
  return [...source.matchAll(specifierRe)].map((match) => match[1])
}

function resolveRelative(fromFile, specifier) {
  const target = path.resolve(path.dirname(fromFile), specifier)
  const stem = target.replace(/\.js$/, '')
  for (const candidate of [target, `${stem}.ts`, `${stem}.tsx`, `${stem}.js`]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

function walkRuntime(entry) {
  const pending = [entry]
  const seen = new Set()
  while (pending.length > 0) {
    const file = pending.pop()
    if (!file || seen.has(file)) continue
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    for (const specifier of specifiers(source)) {
      if (specifier.startsWith('.')) {
        if (!specifier.endsWith('.js')) {
          throw new Error(`${path.relative(root, file)} imports ${specifier} without a .js extension`)
        }
        const next = resolveRelative(file, specifier)
        if (!next) throw new Error(`${path.relative(root, file)} cannot resolve ${specifier}`)
        pending.push(next)
        continue
      }
      if (specifier.startsWith('node:')) continue
      const bare = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
      if (bare.startsWith('@/') || bare.startsWith('#') || specifier.startsWith('@/')) {
        throw new Error(`${path.relative(root, file)} uses a path alias: ${specifier}`)
      }
      if (!dependencies.has(bare)) {
        throw new Error(`${path.relative(root, file)} imports ${specifier}, which is not a runtime dependency`)
      }
    }
  }
  return seen
}

const entries = [path.join(root, 'api/health.ts'), path.join(root, 'api/token.ts')]
const graph = new Set()
for (const entry of entries) {
  for (const file of walkRuntime(entry)) graph.add(file)
}
if (![...graph].some((file) => file.endsWith(`${path.sep}devUserId.ts`))) {
  throw new Error('API graph did not reach src/usage/devUserId.ts')
}

rmSync(outDir, { recursive: true, force: true })
const tsc = require.resolve('typescript/lib/tsc.js')
const compiled = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.api.emit.json'], {
  cwd: root,
  encoding: 'utf8',
})
if (compiled.status !== 0) {
  process.stderr.write(compiled.stdout ?? '')
  process.stderr.write(compiled.stderr ?? '')
  process.exit(compiled.status ?? 1)
}

function jsFiles(dir) {
  const found = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) found.push(...jsFiles(full))
    else if (name.endsWith('.js')) found.push(full)
  }
  return found
}

for (const file of jsFiles(outDir)) {
  const source = readFileSync(file, 'utf8')
  for (const specifier of specifiers(source)) {
    if (specifier.startsWith('.') && !specifier.endsWith('.js')) {
      throw new Error(`compiled ${path.relative(root, file)} imports ${specifier} without a .js extension`)
    }
  }
}

for (const name of ['health.js', 'token.js']) {
  const file = path.join(outDir, 'api', name)
  const loaded = await import(pathToFileURL(file).href)
  if (typeof loaded.default !== 'function') {
    throw new Error(`${name} default export is not a function`)
  }
  console.log(`ok  node import ${name}`)
}
