/**
 * Apply supabase/migrations/*.sql in filename order.
 *
 * Connection string (not printed): SUPABASE_DB_URL, or DATABASE_URL.
 * That is the Postgres URI from Supabase → Project Settings → Database.
 * --dry-run lists the files and does not connect.
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'supabase', 'migrations')
const dryRun = process.argv.includes('--dry-run')

export async function migrationFiles() {
  const names = (await readdir(dir)).filter((name) => name.endsWith('.sql')).sort()
  return names.map((name) => path.join(dir, name))
}

function connectionString() {
  const url = process.env.SUPABASE_DB_URL?.trim() || process.env.DATABASE_URL?.trim()
  if (!url) {
    console.error('Set SUPABASE_DB_URL to the Postgres URI (Supabase → Project Settings → Database). DATABASE_URL is also accepted.')
    process.exit(1)
  }
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    console.error('SUPABASE_DB_URL must be a postgres:// or postgresql:// URI.')
    process.exit(1)
  }
  return url
}

async function main() {
  const files = await migrationFiles()
  if (files.length === 0) {
    console.error(`No SQL files in ${dir}`)
    process.exit(1)
  }
  if (dryRun) {
    for (const file of files) console.log(path.basename(file))
    return
  }
  const url = connectionString()
  const pg = await import('pg')
  const client = new pg.default.Client({ connectionString: url })
  try {
    await client.connect()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Could not connect to the database (${message.replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgresql://***')})`)
    process.exit(1)
  }
  try {
    await client.query(`
      create table if not exists public.schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `)
    const applied = await client.query('select filename from public.schema_migrations')
    const done = new Set(applied.rows.map((row) => row.filename))
    for (const file of files) {
      const name = path.basename(file)
      if (done.has(name)) {
        console.log(`skip ${name}`)
        continue
      }
      const sql = await readFile(file, 'utf8')
      try {
        await client.query('begin')
        await client.query(sql)
        await client.query('insert into public.schema_migrations (filename) values ($1)', [name])
        await client.query('commit')
      } catch (error) {
        await client.query('rollback')
        const message = error instanceof Error ? error.message : String(error)
        console.error(`Failed on ${name}: ${message}`)
        process.exitCode = 1
        return
      }
      console.log(`applied ${name}`)
    }
  } finally {
    await client.end()
  }
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirect) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
