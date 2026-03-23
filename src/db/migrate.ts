import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       TEXT        PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query<{ name: string }>('SELECT name FROM _migrations ORDER BY name');
    const applied = new Set(rows.map((r) => r.name));

    const migrationsDir = join(process.cwd(), 'drizzle');
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  skip  ${file}`);
        continue;
      }

      process.stdout.write(`  apply ${file} ... `);
      const sql = await readFile(join(migrationsDir, file), 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log('done');
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('FAILED');
        throw err;
      }
    }

    console.log(`\n${count} migration(s) applied.`);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
