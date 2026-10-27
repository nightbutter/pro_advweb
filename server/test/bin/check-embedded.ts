// Test helper: boot a disposable embedded Postgres and run the real
// check-connection diagnostic against it. Proves the diagnostic works
// end-to-end without needing Neon credentials.
import path from 'node:path';
import { execFile } from 'node:child_process';
import EmbeddedPostgres from 'embedded-postgres';

async function main() {
  const dir = path.resolve(__dirname, '../../.embedded-pg/check-embedded');
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: 'postgres',
    password: 'postgres',
    port: 56210,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
    onError: () => {}
  });
  await pg.initialise();
  await pg.start();
  const url = 'postgres://postgres:postgres@localhost:56210/postgres?sslmode=disable';

  const child = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', path.resolve(__dirname, '../../scripts/check-connection.ts')],
      { env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url }, timeout: 60_000 },
      (err, stdout, stderr) => {
        const code = err && typeof (err as any).code === 'number' ? (err as any).code : err ? 1 : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      }
    );
  });
  console.log('--- check-connection output ---');
  console.log(child.stdout.trim());
  if (child.stderr.trim()) console.log('stderr:', child.stderr.trim());
  console.log('exit code:', child.code);

  await pg.stop().catch(() => {});
  process.exit(child.code === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
