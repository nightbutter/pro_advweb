// Test helper: run initDatabase() once in a clean process, then exit.
import { initDatabase, pool } from '../../dbconnect';

initDatabase()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
