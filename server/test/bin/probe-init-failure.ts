// Test helper: characterize the HTTP response when dbReady is rejected.
// VERCEL=1 prevents app.listen; we attach the exported app to a manual server.
import http from 'node:http';

async function main() {
  process.env.VERCEL = '1';

  const { default: app } = await import('../../server');
  const { pool } = await import('../../dbconnect');

  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as any).port;

  // give initDatabase a moment to fail
  await new Promise((r) => setTimeout(r, 3000));

  const res = await fetch(`http://localhost:${port}/api/customers`);
  const body = await res.text();
  console.log(
    JSON.stringify({
      status: res.status,
      contentType: res.headers.get('content-type'),
      bodyPreview: body.slice(0, 120)
    })
  );
  server.close();
  await pool.end().catch(() => {});
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
