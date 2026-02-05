import { translate } from './index.js';

interface TestCase {
  name: string;
  sql: string;
  expectContains?: string[];
  expectNotContains?: string[];
}

const tests: TestCase[] = [
  // === BASIC TABLE CREATION ===
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
    expectContains: ['INTEGER', 'AUTOINCREMENT', 'TEXT', "(datetime('now'))"],
  },

  // === FOREIGN KEYS ===
  {
    name: 'Foreign key with ON DELETE CASCADE',
    sql: `
      CREATE TABLE posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL
      );
    `,
    expectContains: ['REFERENCES', 'ON DELETE CASCADE'],
    expectNotContains: ['FOREIGN KEY'], // SQLite inline FK uses just REFERENCES
  },

  // === INDEXES ===
  {
    name: 'Create index',
    sql: `CREATE INDEX idx_users_email ON users(email);`,
    expectContains: ['CREATE INDEX'],
  },

  // === COMPOSITE PRIMARY KEY ===
  {
    name: 'Composite primary key',
    sql: `
      CREATE TABLE user_roles (
        user_id INTEGER,
        role_id INTEGER,
        PRIMARY KEY (user_id, role_id)
      );
    `,
    expectContains: ['PRIMARY KEY (user_id, role_id)'],
  },

  // === CHECK CONSTRAINTS ===
  {
    name: 'CHECK constraint - comparison',
    sql: `
      CREATE TABLE products (
        id SERIAL PRIMARY KEY,
        price NUMERIC CHECK (price > 0),
        quantity INTEGER CHECK (quantity >= 0)
      );
    `,
    expectContains: ['CHECK', 'price', 'quantity'],
  },
  {
    name: 'CHECK constraint - BETWEEN',
    sql: `
      CREATE TABLE scores (
        id SERIAL PRIMARY KEY,
        value INTEGER CHECK (value BETWEEN 0 AND 100)
      );
    `,
    expectContains: ['CHECK', 'BETWEEN', '0', '100'],
  },
  {
    name: 'CHECK constraint - IN list (enum simulation)',
    sql: `
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        status TEXT CHECK (status IN ('pending', 'shipped', 'delivered'))
      );
    `,
    expectContains: ['CHECK', 'status', 'IN', 'pending', 'shipped', 'delivered'],
  },
  {
    name: 'Named CHECK constraint',
    sql: `
      CREATE TABLE employees (
        id SERIAL PRIMARY KEY,
        salary NUMERIC CONSTRAINT positive_salary CHECK (salary > 0)
      );
    `,
    expectContains: ['CONSTRAINT', 'positive_salary', 'CHECK'],
  },

  // === INTEGER TYPES ===
  {
    name: 'All integer types',
    sql: `
      CREATE TABLE int_types (
        a SMALLINT,
        b INT2,
        c INTEGER,
        d INT,
        e INT4,
        f BIGINT,
        g INT8
      );
    `,
    expectContains: ['INTEGER'],
    expectNotContains: ['SMALLINT', 'BIGINT', 'INT2', 'INT4', 'INT8'],
  },

  // === SERIAL TYPES ===
  {
    name: 'All serial types',
    sql: `
      CREATE TABLE serial_types (
        a SMALLSERIAL PRIMARY KEY
      );
    `,
    expectContains: ['INTEGER', 'AUTOINCREMENT'],
    expectNotContains: ['SMALLSERIAL'],
  },

  // === FLOAT TYPES ===
  {
    name: 'Float/numeric types',
    sql: `
      CREATE TABLE float_types (
        a REAL,
        b FLOAT4,
        c DOUBLE PRECISION,
        d FLOAT8,
        e NUMERIC(10,2),
        f DECIMAL(5,3)
      );
    `,
    expectContains: ['REAL', 'NUMERIC'],
    expectNotContains: ['DOUBLE PRECISION', 'FLOAT4', 'FLOAT8', 'DECIMAL'],
  },

  // === TEXT TYPES ===
  {
    name: 'Text types with length constraints',
    sql: `
      CREATE TABLE text_types (
        a TEXT,
        b VARCHAR(255),
        c CHAR(10),
        d CHARACTER VARYING(100)
      );
    `,
    expectContains: [
      'TEXT',
      'CHECK (length(b) <= 255)',
      'CHECK (length(c) <= 10)',
      'CHECK (length(d) <= 100)',
    ],
    expectNotContains: ['VARCHAR', 'CHAR(', 'CHARACTER VARYING'],
  },

  // === BOOLEAN TYPE ===
  {
    name: 'Boolean type',
    sql: `
      CREATE TABLE bool_types (
        a BOOLEAN DEFAULT TRUE,
        b BOOL DEFAULT FALSE
      );
    `,
    expectContains: ['INTEGER'],
    expectNotContains: ['BOOLEAN', 'BOOL'],
  },

  // === DATE/TIME TYPES ===
  {
    name: 'Date/time types',
    sql: `
      CREATE TABLE datetime_types (
        a DATE,
        b TIME,
        c TIMESTAMP,
        d TIMESTAMPTZ,
        e INTERVAL
      );
    `,
    expectContains: ['TEXT'],
    expectNotContains: ['DATE', 'TIME', 'TIMESTAMP', 'INTERVAL'],
  },

  // === JSON TYPES ===
  {
    name: 'JSON types',
    sql: `
      CREATE TABLE json_types (
        a JSON,
        b JSONB
      );
    `,
    expectContains: ['TEXT'],
    expectNotContains: ['JSON', 'JSONB'],
  },

  // === BINARY TYPE ===
  {
    name: 'Binary type',
    sql: `
      CREATE TABLE binary_types (
        data BYTEA
      );
    `,
    expectContains: ['BLOB'],
    expectNotContains: ['BYTEA'],
  },

  // === UUID TYPE ===
  {
    name: 'UUID type',
    sql: `
      CREATE TABLE uuid_types (
        id UUID PRIMARY KEY
      );
    `,
    expectContains: ['TEXT'],
    expectNotContains: ['UUID'],
  },

  // === NETWORK TYPES ===
  {
    name: 'Network types',
    sql: `
      CREATE TABLE network_types (
        ip INET,
        network CIDR,
        mac MACADDR
      );
    `,
    expectContains: ['TEXT'],
    expectNotContains: ['INET', 'CIDR', 'MACADDR'],
  },

  // === GEOMETRIC TYPES ===
  {
    name: 'Geometric types',
    sql: `
      CREATE TABLE geo_types (
        location POINT,
        area BOX,
        shape POLYGON,
        ring CIRCLE
      );
    `,
    expectContains: ['TEXT'],
    expectNotContains: ['POINT', 'BOX', 'POLYGON', 'CIRCLE'],
  },

  // === ARRAY TYPES ===
  {
    name: 'Array types',
    sql: `
      CREATE TABLE array_types (
        tags TEXT[],
        scores INTEGER[]
      );
    `,
    expectContains: ['TEXT'],
  },

  // === RANGE TYPES ===
  {
    name: 'Range types',
    sql: `
      CREATE TABLE range_types (
        int_range INT4RANGE,
        date_range DATERANGE
      );
    `,
    expectContains: ['TEXT'],
    expectNotContains: ['INT4RANGE', 'DATERANGE'],
  },

  // === BIT STRING TYPES ===
  {
    name: 'Bit string types',
    sql: `
      CREATE TABLE bit_types (
        flags BIT(8),
        mask BIT VARYING(16)
      );
    `,
    expectContains: ['TEXT'],
    expectNotContains: ['BIT(', 'BIT VARYING'],
  },

  // === TEXT SEARCH TYPES ===
  {
    name: 'Text search types',
    sql: `
      CREATE TABLE search_types (
        doc TSVECTOR,
        query TSQUERY
      );
    `,
    expectContains: ['TEXT'],
    expectNotContains: ['TSVECTOR', 'TSQUERY'],
  },

  // === XML TYPE ===
  {
    name: 'XML type',
    sql: `
      CREATE TABLE xml_types (
        data XML
      );
    `,
    expectContains: ['TEXT'],
    expectNotContains: ['XML'],
  },

  // === DEFAULT VALUES ===
  {
    name: 'Default NOW() function',
    sql: `
      CREATE TABLE with_defaults (
        created_at TIMESTAMP DEFAULT NOW()
      );
    `,
    expectContains: ["(datetime('now'))"], // SQLite requires parens around function calls in DEFAULT
    expectNotContains: ['NOW()'],
  },

  // === DEFERRABLE CONSTRAINTS ===
  {
    name: 'Deferrable constraints removed',
    sql: `
      CREATE TABLE deferred_test (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER REFERENCES deferred_test(id) DEFERRABLE INITIALLY DEFERRED
      );
    `,
    expectContains: ['REFERENCES'],
    expectNotContains: ['DEFERRABLE', 'INITIALLY DEFERRED'],
  },

  // === ENUM TYPE ===
  {
    name: 'Enum type',
    sql: `CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');`,
    expectContains: ['-- ENUM', 'sad', 'ok', 'happy'],
  },

  // === SEQUENCE ===
  {
    name: 'Sequence',
    sql: `CREATE SEQUENCE user_id_seq START 1;`,
    expectContains: ['-- SEQUENCE', 'not supported'],
  },

  // === MULTIPLE CHECK CONSTRAINTS ===
  {
    name: 'Multiple column constraints',
    sql: `
      CREATE TABLE constrained (
        id SERIAL PRIMARY KEY,
        age INTEGER NOT NULL CHECK (age >= 0 AND age <= 150),
        email TEXT UNIQUE NOT NULL
      );
    `,
    expectContains: ['CHECK', 'NOT NULL', 'UNIQUE', 'age', '>=', '<='],
  },

  // === TABLE-LEVEL CONSTRAINTS ===
  {
    name: 'Table-level constraints',
    sql: `
      CREATE TABLE multi_constraint (
        start_date DATE,
        end_date DATE,
        CHECK (end_date > start_date)
      );
    `,
    expectContains: ['CHECK', 'end_date', 'start_date'],
  },

  // === COMPLEX CHECK WITH AND/OR ===
  {
    name: 'Complex CHECK with AND/OR',
    sql: `
      CREATE TABLE complex_check (
        status TEXT CHECK (status = 'active' OR status = 'inactive'),
        value INTEGER CHECK (value > 0 AND value < 1000)
      );
    `,
    expectContains: ['CHECK', 'OR', 'AND', 'status', 'value'],
  },

  // === MONEY TYPE ===
  {
    name: 'Money type',
    sql: `
      CREATE TABLE prices (
        amount MONEY
      );
    `,
    expectContains: ['REAL'],
    expectNotContains: ['MONEY'],
  },
];

async function runTests() {
  console.log('='.repeat(80));
  console.log('PostgreSQL to SQLite Deparser Tests');
  console.log('='.repeat(80));
  console.log();

  let passed = 0;
  let failed = 0;

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

      // Check expectations
      let testPassed = true;
      const errors: string[] = [];

      if (test.expectContains) {
        for (const expected of test.expectContains) {
          if (!result.includes(expected)) {
            testPassed = false;
            errors.push(`Expected to contain: "${expected}"`);
          }
        }
      }

      if (test.expectNotContains) {
        for (const notExpected of test.expectNotContains) {
          if (result.includes(notExpected)) {
            testPassed = false;
            errors.push(`Should NOT contain: "${notExpected}"`);
          }
        }
      }

      if (testPassed) {
        console.log('\n✓ PASSED');
        passed++;
      } else {
        console.log('\n✗ FAILED:');
        errors.forEach((e) => console.log(`  - ${e}`));
        failed++;
      }
    } catch (error) {
      console.log('Error:', (error as Error).message);
      console.log('\n✗ FAILED (error)');
      failed++;
    }

    console.log();
    console.log();
  }

  // Summary
  console.log('='.repeat(80));
  console.log(`Results: ${passed} passed, ${failed} failed, ${tests.length} total`);
  console.log('='.repeat(80));

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
