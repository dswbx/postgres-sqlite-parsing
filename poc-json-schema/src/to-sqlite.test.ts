import { test, expect, describe } from 'bun:test';
import { jsonSchemaToSqlite } from './to-sqlite.js';
import { convert } from './index.js';
import type { JsonSchema } from './converter.js';

// Helper: minimal schema with one table/column
function oneCol(col: string, props: any): JsonSchema {
  return {
    $schema: 'https://example.com/postgres-json-schema.json',
    type: 'object',
    properties: {
      t: {
        type: 'object',
        additionalProperties: false,
        properties: { [col]: props },
        required: [],
      },
    },
  };
}

describe('Type mapping', () => {
  test('string → TEXT', () => {
    const out = jsonSchemaToSqlite(oneCol('name', { type: 'string' }));
    expect(out).toContain('name TEXT');
  });

  test('integer → INTEGER', () => {
    const out = jsonSchemaToSqlite(oneCol('age', { type: 'integer' }));
    expect(out).toContain('age INTEGER');
  });

  test('number → REAL', () => {
    const out = jsonSchemaToSqlite(oneCol('price', { type: 'number' }));
    expect(out).toContain('price REAL');
  });

  test('boolean → INTEGER', () => {
    const out = jsonSchemaToSqlite(oneCol('active', { type: 'boolean' }));
    expect(out).toContain('active INTEGER');
  });

  test('object → TEXT', () => {
    const out = jsonSchemaToSqlite(oneCol('data', { type: 'object' }));
    expect(out).toContain('data TEXT');
  });

  test('array → TEXT', () => {
    const out = jsonSchemaToSqlite(oneCol('tags', { type: 'array' }));
    expect(out).toContain('tags TEXT');
  });
});

describe('$ref resolution', () => {
  test('$ref to $defs enum → TEXT', () => {
    const schema: JsonSchema = {
      $schema: 'https://example.com/postgres-json-schema.json',
      type: 'object',
      $defs: { status: { type: 'string', enum: ['a', 'b'] } },
      properties: {
        t: {
          type: 'object',
          additionalProperties: false,
          properties: { status: { $ref: '#/$defs/status' } },
          required: [],
        },
      },
    };
    const out = jsonSchemaToSqlite(schema);
    expect(out).toContain('status TEXT');
    expect(out).not.toContain('REFERENCES');
  });

  test('$ref FK → resolves type + REFERENCES', () => {
    const schema: JsonSchema = {
      $schema: 'https://example.com/postgres-json-schema.json',
      type: 'object',
      properties: {
        users: {
          type: 'object',
          additionalProperties: false,
          properties: { id: { type: 'integer', $primaryKey: true } },
          required: [],
        },
        orders: {
          type: 'object',
          additionalProperties: false,
          properties: {
            user_id: {
              $ref: '#/properties/users/properties/id',
              $onDelete: 'cascade',
            },
          },
          required: [],
        },
      },
    };
    const out = jsonSchemaToSqlite(schema);
    expect(out).toContain('user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
  });
});

describe('NOT NULL', () => {
  test('column in required[] → NOT NULL', () => {
    const schema = oneCol('email', { type: 'string' });
    schema.properties.t.required = ['email'];
    const out = jsonSchemaToSqlite(schema);
    expect(out).toContain('email TEXT NOT NULL');
  });

  test('column not in required[] → no NOT NULL', () => {
    const out = jsonSchemaToSqlite(oneCol('email', { type: 'string' }));
    expect(out).not.toContain('NOT NULL');
  });
});

describe('PRIMARY KEY', () => {
  test('INTEGER PK → PRIMARY KEY AUTOINCREMENT', () => {
    const out = jsonSchemaToSqlite(
      oneCol('id', { type: 'integer', $primaryKey: true })
    );
    expect(out).toContain('id INTEGER PRIMARY KEY AUTOINCREMENT');
  });

  test('non-INTEGER PK → PRIMARY KEY (no AUTOINCREMENT)', () => {
    const out = jsonSchemaToSqlite(
      oneCol('id', { type: 'string', $primaryKey: true })
    );
    expect(out).toContain('id TEXT PRIMARY KEY');
    expect(out).not.toContain('AUTOINCREMENT');
  });
});

describe('No defaults in output', () => {
  test('default value not emitted', () => {
    const out = jsonSchemaToSqlite(
      oneCol('status', { type: 'string', default: 'pending' })
    );
    expect(out).not.toContain('DEFAULT');
    expect(out).not.toContain('pending');
  });

  test('$default not emitted', () => {
    const out = jsonSchemaToSqlite(
      oneCol('created', { type: 'string', $default: 'NOW()' })
    );
    expect(out).not.toContain('DEFAULT');
    expect(out).not.toContain('NOW');
  });
});

describe('Indices', () => {
  test('$index: "unique" → CREATE UNIQUE INDEX (separate)', () => {
    const out = jsonSchemaToSqlite(
      oneCol('email', { type: 'string', $index: 'unique' })
    );
    expect(out).toContain('CREATE UNIQUE INDEX idx_t_email ON t(email);');
    // UNIQUE only in index statement, not inline in CREATE TABLE
    const tableBlock = out.split(';\n\n')[0];
    expect(tableBlock).not.toContain('UNIQUE');
  });

  test('$index: true → CREATE INDEX (separate)', () => {
    const out = jsonSchemaToSqlite(
      oneCol('name', { type: 'string', $index: true })
    );
    expect(out).toContain('CREATE INDEX idx_t_name ON t(name);');
    expect(out).not.toContain('CREATE UNIQUE INDEX');
  });
});

describe('Multi-table', () => {
  test('multiple tables separated by blank lines', () => {
    const schema: JsonSchema = {
      $schema: 'https://example.com/postgres-json-schema.json',
      type: 'object',
      properties: {
        users: {
          type: 'object',
          additionalProperties: false,
          properties: { id: { type: 'integer', $primaryKey: true } },
          required: [],
        },
        posts: {
          type: 'object',
          additionalProperties: false,
          properties: { id: { type: 'integer', $primaryKey: true } },
          required: [],
        },
      },
    };
    const out = jsonSchemaToSqlite(schema);
    expect(out).toContain('CREATE TABLE users');
    expect(out).toContain('CREATE TABLE posts');
    // Tables separated by blank line
    expect(out).toContain(';\n\nCREATE TABLE');
  });

  test('all indices after all tables', () => {
    const schema: JsonSchema = {
      $schema: 'https://example.com/postgres-json-schema.json',
      type: 'object',
      properties: {
        a: {
          type: 'object',
          additionalProperties: false,
          properties: { x: { type: 'string', $index: true } },
          required: [],
        },
        b: {
          type: 'object',
          additionalProperties: false,
          properties: { y: { type: 'string', $index: 'unique' } },
          required: [],
        },
      },
    };
    const out = jsonSchemaToSqlite(schema);
    const lastTable = out.lastIndexOf('CREATE TABLE');
    const firstIndex = out.indexOf('CREATE INDEX');
    const firstUniqueIndex = out.indexOf('CREATE UNIQUE INDEX');
    expect(firstIndex).toBeGreaterThan(lastTable);
    expect(firstUniqueIndex).toBeGreaterThan(lastTable);
  });
});

describe('Identifier quoting', () => {
  test('reserved word gets quoted', () => {
    const out = jsonSchemaToSqlite(
      oneCol('order', { type: 'string' })
    );
    expect(out).toContain('"order" TEXT');
  });

  test('normal identifier not quoted', () => {
    const out = jsonSchemaToSqlite(oneCol('name', { type: 'string' }));
    expect(out).toContain('name TEXT');
    expect(out).not.toContain('"name"');
  });
});

describe('End-to-end with convert()', () => {
  test('PG DDL → JSON Schema → SQLite DDL', async () => {
    const pgSql = `
      CREATE TYPE order_status AS ENUM ('pending', 'shipped');

      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        active BOOLEAN
      );

      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status order_status DEFAULT 'pending',
        total NUMERIC(10,2) NOT NULL
      );
    `;

    const schema = await convert(pgSql);
    const sqlite = jsonSchemaToSqlite(schema);

    // Tables
    expect(sqlite).toContain('CREATE TABLE users');
    expect(sqlite).toContain('CREATE TABLE orders');

    // PK
    expect(sqlite).toContain('id INTEGER PRIMARY KEY AUTOINCREMENT');

    // NOT NULL
    expect(sqlite).toContain('email TEXT NOT NULL');
    expect(sqlite).toContain('total REAL NOT NULL');

    // FK
    expect(sqlite).toContain('REFERENCES users(id) ON DELETE CASCADE');

    // Enum → TEXT
    expect(sqlite).toContain('status TEXT');

    // No defaults
    expect(sqlite).not.toContain('DEFAULT');

    // Unique index separate
    expect(sqlite).toContain('CREATE UNIQUE INDEX idx_users_email ON users(email);');
  });
});
