import { translate } from './index.js';

const tests = [
  {
    name: 'Basic table with SERIAL',
    sql: `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email TEXT UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `,
  },
  {
    name: 'Foreign key',
    sql: `
      CREATE TABLE posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL
      );
    `,
  },
  {
    name: 'Index',
    sql: `CREATE INDEX idx_users_email ON users(email);`,
  },
  {
    name: 'Composite primary key',
    sql: `
      CREATE TABLE user_roles (
        user_id INTEGER,
        role_id INTEGER,
        PRIMARY KEY (user_id, role_id)
      );
    `,
  },
];

console.log('='.repeat(80));
console.log('POC 1: Kysely Approach (TypeScript)');
console.log('='.repeat(80));
console.log();

(async () => {
  for (const test of tests) {
    console.log(`Test: ${test.name}`);
    console.log('-'.repeat(80));
    console.log('Input:');
    console.log(test.sql.trim());
    console.log();

    try {
      const result = await translate(test.sql);
      console.log('Output:');
      console.log(result);
    } catch (error) {
      console.log('Error:', (error as Error).message);
    }

    console.log();
    console.log();
  }
})();
