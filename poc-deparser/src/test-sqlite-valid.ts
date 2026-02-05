import { translate } from './index.js';
import { execSync } from 'child_process';

/**
 * Tests that verify the generated SQLite SQL is actually valid
 * by running it through sqlite3
 */

const validSchemas = [
  {
    name: 'Basic table with all common types',
    pg: `
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email TEXT UNIQUE,
        age INTEGER CHECK (age >= 0),
        balance NUMERIC(10,2),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `,
  },
  {
    name: 'Foreign key relationships',
    pg: `
      CREATE TABLE posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT
      );
    `,
  },
  {
    name: 'CHECK with IN clause (enum simulation)',
    pg: `
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        status TEXT CHECK (status IN ('pending', 'processing', 'shipped', 'delivered'))
      );
    `,
  },
  {
    name: 'BETWEEN constraint',
    pg: `
      CREATE TABLE scores (
        id SERIAL PRIMARY KEY,
        value INTEGER CHECK (value BETWEEN 0 AND 100)
      );
    `,
  },
  {
    name: 'Multiple CHECK constraints',
    pg: `
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        price NUMERIC CHECK (price > 0),
        quantity INTEGER CHECK (quantity >= 0),
        discount NUMERIC CHECK (discount >= 0 AND discount <= 1)
      );
    `,
  },
  {
    name: 'Table-level CHECK constraint',
    pg: `
      CREATE TABLE events (
        id SERIAL PRIMARY KEY,
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        CHECK (end_time > start_time)
      );
    `,
  },
  {
    name: 'Composite primary key',
    pg: `
      CREATE TABLE user_roles (
        user_id INTEGER,
        role_id INTEGER,
        PRIMARY KEY (user_id, role_id)
      );
    `,
  },
  {
    name: 'Array types as TEXT',
    pg: `
      CREATE TABLE tagged_items (
        id SERIAL PRIMARY KEY,
        tags TEXT[],
        metadata JSONB
      );
    `,
  },
  {
    name: 'Named constraints',
    pg: `
      CREATE TABLE employees (
        id SERIAL PRIMARY KEY,
        salary NUMERIC CONSTRAINT positive_salary CHECK (salary > 0),
        hire_date DATE NOT NULL
      );
    `,
  },
  {
    name: 'UUID primary key',
    pg: `
      CREATE TABLE sessions (
        id UUID PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at TIMESTAMP NOT NULL
      );
    `,
  },
];

async function runValidationTests() {
  console.log('='.repeat(80));
  console.log('SQLite Validation Tests');
  console.log('Verifying generated SQL is valid SQLite syntax');
  console.log('='.repeat(80));
  console.log();

  let passed = 0;
  let failed = 0;

  for (const test of validSchemas) {
    console.log(`Test: ${test.name}`);
    console.log('-'.repeat(80));

    try {
      const sqlite = await translate(test.pg);
      console.log('Generated SQLite:');
      console.log(sqlite);

      // Run through sqlite3 to validate
      try {
        execSync(`sqlite3 :memory: "${sqlite.replace(/"/g, '\\"')}"`, {
          encoding: 'utf-8',
        });
        console.log('\n✓ PASSED - SQLite accepted the schema');
        passed++;
      } catch (e: any) {
        console.log('\n✗ FAILED - SQLite rejected:');
        console.log(e.stderr || e.message);
        failed++;
      }
    } catch (error) {
      console.log('Translation error:', (error as Error).message);
      console.log('\n✗ FAILED (translation error)');
      failed++;
    }

    console.log();
    console.log();
  }

  console.log('='.repeat(80));
  console.log(`SQLite Validation: ${passed} passed, ${failed} failed, ${validSchemas.length} total`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

runValidationTests();
