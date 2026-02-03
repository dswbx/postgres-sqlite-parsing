# POC 3: PostgreSQL DDL to JSON Schema

Converts PostgreSQL DDL to JSON Schema with validation metadata.

## Goal

Preserve validation metadata lost in Kysely approach:
- `VARCHAR(50)` → `maxLength: 50`
- CHECK constraints → `minimum`, `maximum`, `enum`, `pattern`
- Relations via `$ref`

## Usage

```typescript
import { convert } from './src/index.js';

const schema = await convert(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL
  );
`);

console.log(schema);
```

## Output Format

The generated schema includes a `$schema` property pointing to the meta-schema that defines the format:

```json
{
  "$schema": "https://example.com/postgres-json-schema.json",
  "type": "object",
  "$defs": {
    "status": {
      "type": "string",
      "enum": ["pending", "completed"]
    }
  },
  "properties": {
    "users": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": {
          "type": "integer",
          "$primaryKey": true
        },
        "email": {
          "type": "string",
          "maxLength": 255,
          "$index": "unique"
        },
        "tags": {
          "type": "array",
          "items": { "type": "string" }
        }
      },
      "required": ["email"]
    },
    "orders": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "user_id": {
          "$ref": "#/properties/users/properties/id",
          "$onDelete": "cascade"
        },
        "status": {
          "$ref": "#/$defs/status"
        },
        "total": {
          "type": "number",
          "multipleOf": 0.01
        }
      },
      "required": []
    }
  }
}
```

**Key design decisions:**
- **No type duplication on FKs**: Fields with `$ref` don't repeat type info (DRY principle)
- **Proper JSON Schema paths**: `$ref: "#/properties/table/properties/column"`
- **PKs not required**: Auto-generated primary keys excluded from required array
- **Default actions omitted**: `$onDelete`/`$onUpdate` only present when not "no action"

## Features

### Type Mapping
- `VARCHAR(n)` → `string` + `maxLength: n`
- `INTEGER/BIGINT` → `integer`
- `NUMERIC/DECIMAL` → `number`
- `NUMERIC(p,s)` → `number` + `multipleOf: 10^(-s)`
- `BOOLEAN` → `boolean`
- `TIMESTAMP` → `string` + `format: "date-time"`
- `DATE` → `string` + `format: "date"`
- `UUID` → `string` + `format: "uuid"`
- `JSONB` → `object`
- `BYTEA` → `string` + `format: "binary"`
- `TEXT[]`, `INTEGER[][]` → `array` + `items` (multi-dimensional supported)
- `CREATE TYPE ... AS ENUM` → `$defs` + `$ref`

### Constraint Mapping
- `NOT NULL` → `required` array (except PKs)
- `UNIQUE` → `$index: "unique"`
- `PRIMARY KEY` → `$primaryKey: true` (NOT in required - auto-generated)
- `DEFAULT 'value'` → `default: "value"` (simple constants)
- `DEFAULT NOW()` → `$default: "now()"` (computed expressions)
- `DEFAULT CURRENT_TIMESTAMP` → `$default: "CURRENT_TIMESTAMP"` (SQL value functions)
- `DEFAULT uuid_generate_v4()` → `$default: "uuid_generate_v4()"` (function calls)
- `CHECK (age >= 18)` → `minimum: 18`
- `CHECK (age BETWEEN 0 AND 150)` → `minimum: 0, maximum: 150`
- `CHECK (status IN (...))` → `enum: [...]`
- `CHECK (email ~ 'regex')` → `pattern: "regex"`
- `FOREIGN KEY` → `$ref: "#/properties/table/properties/col"` (no type duplication)
  - `ON DELETE CASCADE` → `$onDelete: "cascade"` (omitted if "no action")
  - `ON UPDATE CASCADE` → `$onUpdate: "cascade"` (omitted if "no action")

### Default Values

**Simple constants** use standard JSON Schema `default`:
```json
{
  "status": { "type": "string", "default": "pending" },
  "count": { "type": "integer", "default": 0 },
  "active": { "type": "boolean", "default": true }
}
```

**Computed expressions** use custom `$default` (app must handle):
```json
{
  "id": { "type": "string", "format": "uuid", "$default": "uuid_generate_v4()" },
  "created_at": { "type": "string", "format": "date-time", "$default": "CURRENT_TIMESTAMP" },
  "updated_at": { "type": "string", "format": "date-time", "$default": "now()" }
}
```

The `$default` property contains the PostgreSQL expression as-is. Applications should:
- Parse and execute during insert operations
- Ignore if not needed for validation-only schemas
- Use for code generation (ORM defaults, API docs, etc.)

## Support Matrix

| Feature | Status | Notes |
|---------|--------|-------|
| **Types** | | |
| INTEGER, BIGINT, SMALLINT | ✅ | → `integer` |
| SERIAL, BIGSERIAL | ✅ | → `integer` |
| NUMERIC, DECIMAL | ✅ | → `number` |
| NUMERIC(p,s), DECIMAL(p,s) | ✅ | → `number` + `multipleOf` |
| VARCHAR(n), CHAR(n) | ✅ | → `string` + `maxLength` |
| TEXT | ✅ | → `string` |
| BOOLEAN | ✅ | → `boolean` |
| TIMESTAMP, TIMESTAMPTZ | ✅ | → `string` + `date-time` |
| DATE | ✅ | → `string` + `date` |
| TIME, TIMETZ | ✅ | → `string` + `time` |
| UUID | ✅ | → `string` + `uuid` |
| BYTEA | ✅ | → `string` + `binary` |
| JSON, JSONB | ✅ | → `object` |
| ARRAY types | ✅ | → `array` + `items` (multi-dim supported) |
| Custom ENUM | ✅ | → `$defs` + `$ref` |
| LTREE, HSTORE | ❌ | extensions |
| TSTZRANGE, etc | ❌ | range types |
| **Constraints** | | |
| PRIMARY KEY (single) | ✅ | → `$primaryKey` |
| PRIMARY KEY (composite) | ❌ | table-level, complex |
| NOT NULL | ✅ | → `required[]` |
| UNIQUE (column) | ✅ | → `$index: "unique"` |
| UNIQUE (composite) | ❌ | table-level |
| CHECK `>= n` | ✅ | → `minimum` |
| CHECK `<= n` | ✅ | → `maximum` |
| CHECK `IN (...)` | ✅ | → `enum` |
| CHECK `~ 'pattern'` | ✅ | → `pattern` |
| CHECK (multi-column) | ❌ | cross-column logic |
| CHECK (function call) | ❌ | runtime evaluation |
| FOREIGN KEY | ✅ | → `$ref` |
| ON DELETE/UPDATE | ✅ | → `$onDelete/$onUpdate` |
| EXCLUDE | ❌ | complex |
| **Defaults** | | |
| Literal values | ✅ | → `default` |
| NOW(), CURRENT_TIMESTAMP | ✅ | → `$default` |
| uuid_generate_v4(), gen_random_uuid() | ✅ | → `$default` |
| Complex expressions | ⚠️ | → `$default: "EXPRESSION"` |
| GENERATED columns | ❌ | not parsed |
| **DDL Statements** | | |
| CREATE TABLE | ✅ | main entry point |
| CREATE TYPE AS ENUM | ✅ | → `$defs` |
| CREATE INDEX | ❌ | ignored |
| CREATE TYPE (composite) | ❌ | ignored |
| CREATE VIEW | ❌ | ignored |
| CREATE FUNCTION | ❌ | ignored |
| ALTER TABLE | ❌ | ignored |
| CREATE TRIGGER | ❌ | ignored |
| PARTITION BY | ❌ | ignored |

### Limitations
- Composite PRIMARY KEY/UNIQUE not supported (table-level)
- Complex CHECK constraints skipped (can't express naturally in JSON Schema)
- FOREIGN KEY must be inline column constraint (not table-level)

## Meta-Schema

The output format is defined by a JSON Schema meta-schema in `postgres-json-schema.schema.json`. This meta-schema:

- **Extends JSON Schema Draft 2020-12** (latest standard)
- Uses standard JSON Schema properties (type, format, minimum, maximum, enum, pattern, default, items, multipleOf, etc.)
- Adds `$defs` for custom type definitions (e.g., ENUMs)
- Adds PostgreSQL-specific `$`-prefixed properties:
  - `$primaryKey`: boolean (primary key indicator)
  - `$index`: true | "unique" (database index: regular or unique)
  - `$ref`: string (foreign key or custom type reference)
  - `$onDelete`: string (FK ON DELETE action)
  - `$onUpdate`: string (FK ON UPDATE action)
  - `$default`: string (computed default expression)
- Enforces constraints:
  - Foreign key / enum ref columns must have `$ref` and no type duplication
  - Cannot have both `default` and `$default`
  - `$onDelete`/`$onUpdate` only valid with `$ref`
  - Non-ref columns must have `type`

**Validation:**
```typescript
import Ajv2020 from 'ajv/dist/2020';
import metaSchema from './postgres-json-schema.schema.json';
import generatedSchema from './schema.json';

const ajv = new Ajv2020();
const validate = ajv.compile(metaSchema);
const valid = validate(generatedSchema);
```

## Scripts

```bash
bun test              # Run all tests (36 tests)
bun run showcase      # Generate schema.json from complex example
bun run validate      # Validate generated schemas against meta-schema
bun run src/example.ts  # Simple demo
```

The showcase script demonstrates a medium-complexity e-commerce schema with:
- 6 tables, 43 columns
- UUID, VARCHAR, INTEGER, NUMERIC, TIMESTAMP, DATE, BOOLEAN, JSONB, TEXT types
- Email pattern validation, age ranges, rating enums
- Foreign keys with ON DELETE/UPDATE actions
- DEFAULT values and UNIQUE constraints
