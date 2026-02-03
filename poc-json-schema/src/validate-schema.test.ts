import { test, expect, describe } from 'bun:test';
import { convert } from './index.js';
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Schema Validation', () => {
  test('Generated schema conforms to postgres-json-schema meta-schema', async () => {
    // Load the meta-schema
    const metaSchemaPath = join(import.meta.dir, '..', 'postgres-json-schema.schema.json');
    const metaSchema = JSON.parse(readFileSync(metaSchemaPath, 'utf-8'));

    // Generate a schema
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

    // Validate against meta-schema
    const ajv = new Ajv2020({ strict: false });
    const validate = ajv.compile(metaSchema);
    const valid = validate(schema);

    if (!valid) {
      console.error('Validation errors:', JSON.stringify(validate.errors, null, 2));
    }

    expect(valid).toBe(true);
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
});
