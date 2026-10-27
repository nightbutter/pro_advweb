// Test helper: invoke initDatabase() twice concurrently, print JSON outcome.
import { initDatabase, pool } from '../../dbconnect';

Promise.allSettled([initDatabase(), initDatabase()])
  .then(async (results) => {
    const rejected = results.filter((r) => r.status === 'rejected');
    const firstErr = rejected.length
      ? ((rejected[0] as PromiseRejectedResult).reason as any)?.code ?? 'unknown'
      : null;
    console.log(JSON.stringify({ rejected: rejected.length, error: firstErr }));
    await pool.end();
    process.exit(0);
  })
  .catch(() => process.exit(1));
