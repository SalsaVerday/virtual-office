import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('compiled api esm', () => {
  it('loads the built handlers with plain node', () => {
    const output = execFileSync(process.execPath, ['scripts/check-api-esm.mjs'], {
      cwd: frontendRoot,
      encoding: 'utf8',
    })
    expect(output).toMatch(/ok\s+node import health\.js/)
    expect(output).toMatch(/ok\s+node import token\.js/)
  })
})
