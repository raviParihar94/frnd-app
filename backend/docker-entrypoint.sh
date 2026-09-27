#!/bin/sh
set -e

echo "Waiting for database to accept connections..."
node -e "
const { Client } = require('pg');
const url = process.env.DATABASE_URL;
const maxAttempts = 30;
let attempt = 0;

function tryConnect() {
  attempt++;
  const client = new Client({ connectionString: url });
  client.connect()
    .then(() => client.query('SELECT 1').then(() => client.end()).then(() => process.exit(0)))
    .catch((err) => {
      client.end().catch(() => {});
      if (attempt >= maxAttempts) {
        console.error('Database did not become ready in time:', err.message);
        process.exit(1);
      }
      console.log(\`DB not ready yet (attempt \${attempt}/\${maxAttempts}), retrying in 2s...\`);
      setTimeout(tryConnect, 2000);
    });
}

tryConnect();
"

echo "Database is up. Running migrations..."
node dist/db/migrate.js

echo "Starting application..."
exec "$@"
