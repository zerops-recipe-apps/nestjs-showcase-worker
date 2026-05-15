import { Client } from 'pg';

async function migrate(): Promise<void> {
  const client = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS job_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        subject VARCHAR(128) NOT NULL,
        payload JSONB,
        status VARCHAR(32) NOT NULL DEFAULT 'received',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_job_log_subject ON job_log (subject);`,
    );
    // eslint-disable-next-line no-console
    console.log('Worker migration applied (job_log table ensured).');
  } finally {
    await client.end();
  }
}

migrate().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Worker migration failed:', err);
  process.exit(1);
});
