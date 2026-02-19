import { test, expect, describe } from 'bun:test';
import { convert } from './index.js';
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Schema Validation', () => {
  test('Generated schema conforms to postgres-json-schema meta-schema', async () => {
    const metaSchemaPath = join(import.meta.dir, '..', 'postgres-json-schema.schema.json');
    const metaSchema = JSON.parse(readFileSync(metaSchemaPath, 'utf-8'));

    const schema = await convert(`
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        age INTEGER CHECK (age >= 18),
        status TEXT CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        total NUMERIC CHECK (total >= 0) NOT NULL,
        shipped BOOLEAN DEFAULT false
      );
    `);

    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(metaSchema);
    const valid = validate(schema);

    if (!valid) {
      console.error('Validation errors:', JSON.stringify(validate.errors, null, 2));
    }

    expect(valid).toBe(true);
  });

  test('Schema with ARRAY types conforms to meta-schema', async () => {
    const metaSchemaPath = join(import.meta.dir, '..', 'postgres-json-schema.schema.json');
    const metaSchema = JSON.parse(readFileSync(metaSchemaPath, 'utf-8'));

    const schema = await convert(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        tags TEXT[],
        matrix INTEGER[][],
        names VARCHAR(100)[]
      );
    `);

    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(metaSchema);
    const valid = validate(schema);

    if (!valid) {
      console.error('Validation errors:', JSON.stringify(validate.errors, null, 2));
    }

    expect(valid).toBe(true);
    expect(schema.properties.products.properties.tags).toEqual({
      type: 'array',
      items: { type: 'string' }
    });
    expect(schema.properties.products.properties.matrix).toEqual({
      type: 'array',
      items: { type: 'array', items: { type: 'integer' } }
    });
  });

  test('Schema with custom ENUM types conforms to meta-schema', async () => {
    const metaSchemaPath = join(import.meta.dir, '..', 'postgres-json-schema.schema.json');
    const metaSchema = JSON.parse(readFileSync(metaSchemaPath, 'utf-8'));

    const schema = await convert(`
      CREATE TYPE status AS ENUM ('pending', 'active', 'closed');
      CREATE TYPE priority AS ENUM ('low', 'medium', 'high');

      CREATE TABLE tasks (
        id INTEGER PRIMARY KEY,
        status status NOT NULL,
        priority priority DEFAULT 'medium'
      );
    `);

    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(metaSchema);
    const valid = validate(schema);

    if (!valid) {
      console.error('Validation errors:', JSON.stringify(validate.errors, null, 2));
    }

    expect(valid).toBe(true);
    expect((schema as any).$defs).toBeUndefined();
    expect(schema.properties.tasks.properties.status).toEqual({
      type: 'string',
      enum: ['pending', 'active', 'closed']
    });
    expect(schema.properties.tasks.properties.priority).toEqual({
      type: 'string',
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    });
  });

  test('Schema with NUMERIC precision conforms to meta-schema', async () => {
    const metaSchemaPath = join(import.meta.dir, '..', 'postgres-json-schema.schema.json');
    const metaSchema = JSON.parse(readFileSync(metaSchemaPath, 'utf-8'));

    const schema = await convert(`
      CREATE TABLE prices (
        id INTEGER PRIMARY KEY,
        price NUMERIC(10,2),
        rate DECIMAL(5,3),
        amount NUMERIC
      );
    `);

    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(metaSchema);
    const valid = validate(schema);

    if (!valid) {
      console.error('Validation errors:', JSON.stringify(validate.errors, null, 2));
    }

    expect(valid).toBe(true);
    expect(schema.properties.prices.properties.price).toMatchObject({
      type: 'number',
      multipleOf: 0.01
    });
    expect(schema.properties.prices.properties.rate).toMatchObject({
      type: 'number',
      multipleOf: 0.001
    });
    expect(schema.properties.prices.properties.amount).toEqual({ type: 'number' });
  });

  test('Invalid schema is rejected by meta-schema', async () => {
    const metaSchemaPath = join(import.meta.dir, '..', 'postgres-json-schema.schema.json');
    const metaSchema = JSON.parse(readFileSync(metaSchemaPath, 'utf-8'));

    // Create an invalid schema (FK with type duplication)
    const invalidSchema = {
      $schema: 'https://example.com/postgres-json-schema.json',
      type: 'object',
      properties: {
        orders: {
          type: 'object',
          additionalProperties: false,
          properties: {
            user_id: {
              type: 'string',  // Should NOT have type when $ref is present
              $ref: '#/properties/users/properties/id'
            }
          },
          required: []
        }
      }
    };

    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(metaSchema);
    const valid = validate(invalidSchema);

    expect(valid).toBe(false);
    expect(validate.errors).toBeDefined();
  });

  test('Enum column with wrong type is rejected', async () => {
    const metaSchemaPath = join(import.meta.dir, '..', 'postgres-json-schema.schema.json');
    const metaSchema = JSON.parse(readFileSync(metaSchemaPath, 'utf-8'));

    const invalidSchema = {
      $schema: 'https://example.com/postgres-json-schema.json',
      type: 'object',
      properties: {
        t: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: {
              type: 'string',
              $ref: '#/properties/users/properties/id'  // has both type and $ref
            }
          },
          required: []
        }
      }
    };

    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(metaSchema);
    const valid = validate(invalidSchema);

    expect(valid).toBe(false);
  });
});
