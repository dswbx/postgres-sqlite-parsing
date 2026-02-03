import { test, expect, describe } from 'bun:test';
import { convert } from './index.js';

describe('Type Mapping', () => {
  test('VARCHAR(50) preserves maxLength', async () => {
    const schema = await convert('CREATE TABLE t (name VARCHAR(50));');
    expect(schema.properties.t.properties.name).toMatchObject({
      type: 'string',
      maxLength: 50
    });
  });

  test('TEXT has no maxLength', async () => {
    const schema = await convert('CREATE TABLE t (name TEXT);');
    expect(schema.properties.t.properties.name).toEqual({
      type: 'string'
    });
  });

  test('INTEGER maps to integer', async () => {
    const schema = await convert('CREATE TABLE t (age INTEGER);');
    expect(schema.properties.t.properties.age).toEqual({
      type: 'integer'
    });
  });

  test('NUMERIC maps to number', async () => {
    const schema = await convert('CREATE TABLE t (price NUMERIC);');
    expect(schema.properties.t.properties.price).toEqual({
      type: 'number'
    });
  });

  test('BOOLEAN maps to boolean', async () => {
    const schema = await convert('CREATE TABLE t (active BOOLEAN);');
    expect(schema.properties.t.properties.active).toEqual({
      type: 'boolean'
    });
  });

  test('TIMESTAMP has date-time format', async () => {
    const schema = await convert('CREATE TABLE t (created TIMESTAMP);');
    expect(schema.properties.t.properties.created).toMatchObject({
      type: 'string',
      format: 'date-time'
    });
  });

  test('DATE has date format', async () => {
    const schema = await convert('CREATE TABLE t (birth DATE);');
    expect(schema.properties.t.properties.birth).toMatchObject({
      type: 'string',
      format: 'date'
    });
  });

  test('UUID has uuid format', async () => {
    const schema = await convert('CREATE TABLE t (id UUID);');
    expect(schema.properties.t.properties.id).toMatchObject({
      type: 'string',
      format: 'uuid'
    });
  });

  test('JSONB maps to object', async () => {
    const schema = await convert('CREATE TABLE t (data JSONB);');
    expect(schema.properties.t.properties.data).toEqual({
      type: 'object'
    });
  });

  test('BYTEA has binary format', async () => {
    const schema = await convert('CREATE TABLE t (file BYTEA);');
    expect(schema.properties.t.properties.file).toMatchObject({
      type: 'string',
      format: 'binary'
    });
  });
});

describe('CHECK Constraints', () => {
  test('CHECK (age >= 18) → minimum', async () => {
    const schema = await convert(
      'CREATE TABLE t (age INTEGER CHECK (age >= 18));'
    );
    expect(schema.properties.t.properties.age).toMatchObject({
      type: 'integer',
      minimum: 18
    });
  });

  test('CHECK (age <= 150) → maximum', async () => {
    const schema = await convert(
      'CREATE TABLE t (age INTEGER CHECK (age <= 150));'
    );
    expect(schema.properties.t.properties.age).toMatchObject({
      type: 'integer',
      maximum: 150
    });
  });

  test('CHECK with range → minimum and maximum', async () => {
    const schema = await convert(
      'CREATE TABLE t (age INTEGER CHECK (age >= 0 AND age <= 150));'
    );
    expect(schema.properties.t.properties.age).toMatchObject({
      type: 'integer',
      minimum: 0,
      maximum: 150
    });
  });

  test('CHECK IN enum → enum array', async () => {
    const schema = await convert(
      "CREATE TABLE t (status TEXT CHECK (status IN ('pending', 'completed', 'cancelled')));"
    );
    expect(schema.properties.t.properties.status).toMatchObject({
      type: 'string',
      enum: ['pending', 'completed', 'cancelled']
    });
  });

  test('CHECK with pattern → pattern', async () => {
    const schema = await convert(
      "CREATE TABLE t (email TEXT CHECK (email ~ '^[a-z]+@'));"
    );
    expect(schema.properties.t.properties.email).toMatchObject({
      type: 'string',
      pattern: '^[a-z]+@'
    });
  });
});

describe('Constraints', () => {
  test('NOT NULL → required array', async () => {
    const schema = await convert('CREATE TABLE t (name TEXT NOT NULL);');
    expect(schema.properties.t.required).toContain('name');
  });

  test('PRIMARY KEY → $primaryKey but NOT required (auto-generated)', async () => {
    const schema = await convert('CREATE TABLE t (id INTEGER PRIMARY KEY);');
    expect(schema.properties.t.properties.id).toMatchObject({
      type: 'integer',
      $primaryKey: true
    });
    // Auto-generated PKs should NOT be in required array
    expect(schema.properties.t.required).not.toContain('id');
    expect(schema.properties.t.required).toEqual([]);
  });

  test('UNIQUE → $index: "unique"', async () => {
    const schema = await convert('CREATE TABLE t (email TEXT UNIQUE);');
    expect(schema.properties.t.properties.email).toMatchObject({
      type: 'string',
      $index: 'unique'
    });
  });

  test('DEFAULT value', async () => {
    const schema = await convert(
      "CREATE TABLE t (status TEXT DEFAULT 'pending');"
    );
    expect(schema.properties.t.properties.status).toMatchObject({
      type: 'string',
      default: 'pending'
    });
  });

  test('DEFAULT numeric value', async () => {
    const schema = await convert('CREATE TABLE t (count INTEGER DEFAULT 0);');
    expect(schema.properties.t.properties.count).toMatchObject({
      type: 'integer',
      default: 0
    });
  });

  test('DEFAULT computed value → $default', async () => {
    const schema = await convert('CREATE TABLE t (created TIMESTAMP DEFAULT NOW());');
    expect(schema.properties.t.properties.created).toMatchObject({
      type: 'string',
      format: 'date-time',
      $default: 'now()'
    });
    // Should NOT have standard `default` property
    expect(schema.properties.t.properties.created.default).toBeUndefined();
  });

  test('DEFAULT CURRENT_TIMESTAMP → $default', async () => {
    const schema = await convert('CREATE TABLE t (created TIMESTAMP DEFAULT CURRENT_TIMESTAMP);');
    expect(schema.properties.t.properties.created).toMatchObject({
      type: 'string',
      format: 'date-time',
      $default: 'CURRENT_TIMESTAMP'
    });
  });

  test('DEFAULT uuid_generate_v4() → $default', async () => {
    const schema = await convert('CREATE TABLE t (id UUID DEFAULT uuid_generate_v4());');
    expect(schema.properties.t.properties.id).toMatchObject({
      type: 'string',
      format: 'uuid',
      $default: 'uuid_generate_v4()'
    });
  });

  test('DEFAULT boolean values', async () => {
    const schema = await convert('CREATE TABLE t (active BOOLEAN DEFAULT true, enabled BOOLEAN DEFAULT false);');
    expect(schema.properties.t.properties.active).toEqual({
      type: 'boolean',
      default: true
    });
    expect(schema.properties.t.properties.enabled).toEqual({
      type: 'boolean',
      default: false
    });
  });
});

describe('Foreign Keys', () => {
  test('FK → $ref without type duplication', async () => {
    const schema = await convert(`
      CREATE TABLE users (id INTEGER PRIMARY KEY);
      CREATE TABLE posts (user_id INTEGER REFERENCES users(id));
    `);
    expect(schema.properties.posts.properties.user_id).toEqual({
      $ref: '#/properties/users/properties/id'
    });
    // Should NOT have type field (no duplication)
    expect(schema.properties.posts.properties.user_id.type).toBeUndefined();
  });

  test('FK with ON DELETE CASCADE → $onDelete', async () => {
    const schema = await convert(`
      CREATE TABLE users (id INTEGER PRIMARY KEY);
      CREATE TABLE posts (user_id INTEGER REFERENCES users(id) ON DELETE CASCADE);
    `);
    expect(schema.properties.posts.properties.user_id).toEqual({
      $ref: '#/properties/users/properties/id',
      $onDelete: 'cascade'
    });
  });

  test('FK with ON UPDATE CASCADE → $onUpdate', async () => {
    const schema = await convert(`
      CREATE TABLE users (id INTEGER PRIMARY KEY);
      CREATE TABLE posts (user_id INTEGER REFERENCES users(id) ON UPDATE CASCADE);
    `);
    expect(schema.properties.posts.properties.user_id).toEqual({
      $ref: '#/properties/users/properties/id',
      $onUpdate: 'cascade'
    });
  });

  test('FK with both ON DELETE and ON UPDATE', async () => {
    const schema = await convert(`
      CREATE TABLE users (id INTEGER PRIMARY KEY);
      CREATE TABLE posts (
        user_id INTEGER REFERENCES users(id)
        ON DELETE CASCADE
        ON UPDATE RESTRICT
      );
    `);
    expect(schema.properties.posts.properties.user_id).toEqual({
      $ref: '#/properties/users/properties/id',
      $onDelete: 'cascade',
      $onUpdate: 'restrict'
    });
  });

  test('FK with NO ACTION should not include $onDelete/$onUpdate', async () => {
    const schema = await convert(`
      CREATE TABLE users (id INTEGER PRIMARY KEY);
      CREATE TABLE posts (user_id INTEGER REFERENCES users(id) ON DELETE NO ACTION);
    `);
    expect(schema.properties.posts.properties.user_id).toEqual({
      $ref: '#/properties/users/properties/id'
    });
    // Should NOT have $onDelete or $onUpdate (default behavior)
    expect(schema.properties.posts.properties.user_id.$onDelete).toBeUndefined();
    expect(schema.properties.posts.properties.user_id.$onUpdate).toBeUndefined();
  });
});

describe('Complex Schemas', () => {
  test('Multiple tables with relations', async () => {
    const schema = await convert(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        created TIMESTAMP
      );

      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        status TEXT CHECK (status IN ('pending', 'completed', 'cancelled')) DEFAULT 'pending',
        total NUMERIC CHECK (total >= 0)
      );
    `);

    // Check users table
    expect(schema.properties.users.properties.id).toMatchObject({
      type: 'integer',
      $primaryKey: true
    });
    expect(schema.properties.users.properties.email).toMatchObject({
      type: 'string',
      $index: 'unique'
    });
    // PK not required (auto-generated), only email is required
    expect(schema.properties.users.required).toEqual(['email']);

    // Check orders table
    expect(schema.properties.orders.properties.user_id).toEqual({
      $ref: '#/properties/users/properties/id',
      $onDelete: 'cascade'
    });
    expect(schema.properties.orders.properties.status).toMatchObject({
      type: 'string',
      enum: ['pending', 'completed', 'cancelled'],
      default: 'pending'
    });
    expect(schema.properties.orders.properties.total).toMatchObject({
      type: 'number',
      minimum: 0
    });
  });

  test('Table with additionalProperties: false', async () => {
    const schema = await convert('CREATE TABLE t (id INTEGER);');
    expect(schema.properties.t.additionalProperties).toBe(false);
  });

  test('Multiple constraints on single column', async () => {
    const schema = await convert(
      "CREATE TABLE t (email VARCHAR(255) NOT NULL UNIQUE CHECK (email ~ '@'));"
    );
    expect(schema.properties.t.properties.email).toMatchObject({
      type: 'string',
      maxLength: 255,
      $index: 'unique',
      pattern: '@'
    });
    expect(schema.properties.t.required).toContain('email');
  });
});

describe('Schema Structure', () => {
  test('Root schema has correct structure with $schema', async () => {
    const schema = await convert('CREATE TABLE t (id INTEGER);');
    expect(schema).toMatchObject({
      $schema: 'https://example.com/postgres-json-schema.json',
      type: 'object',
      properties: {
        t: {
          type: 'object',
          additionalProperties: false,
          properties: expect.any(Object),
          required: expect.any(Array)
        }
      }
    });
  });

  test('Empty required array for nullable columns', async () => {
    const schema = await convert('CREATE TABLE t (name TEXT);');
    expect(schema.properties.t.required).toEqual([]);
  });
});
