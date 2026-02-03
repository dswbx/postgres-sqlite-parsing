# PostgreSQL DDL Parsing

Parse PostgreSQL DDL for cross-dialect use.

## POCs

| POC                                   | Approach            | Output      | Pros                               | Cons                                 |
| ------------------------------------- | ------------------- | ----------- | ---------------------------------- | ------------------------------------ |
| [poc-deparser](./poc-deparser/)       | Fork pgsql-deparser | SQLite SQL  | Direct, no deps                    | Large codebase (~10k lines)          |
| [poc-kysely](./poc-kysely/)           | Kysely intermediate | SQLite SQL  | Battle-tested, type-safe           | Extra dep, loses validation metadata |
| [poc-json-schema](./poc-json-schema/) | JSON Schema         | JSON Schema | Preserves validation, LLM-friendly | Needs separate SQL generator         |

---

## Technical Details

### AST Mapping (PG → Kysely)

| PG Node                 | Kysely Node            | Complexity |
| ----------------------- | ---------------------- | ---------- |
| `CreateStmt`            | `CreateTableNode`      | Low        |
| `ColumnDef`             | `ColumnDefinitionNode` | Low        |
| `Constraint` (PK)       | `primaryKey: true`     | Trivial    |
| `Constraint` (FK)       | `ReferencesNode`       | Low        |
| `Constraint` (UNIQUE)   | `unique: true`         | Trivial    |
| `Constraint` (NOT NULL) | `notNull: true`        | Trivial    |
| `Constraint` (DEFAULT)  | `DefaultValueNode`     | Low        |
| `TypeName`              | `DataTypeNode`         | Low        |
| `IndexStmt`             | `CreateIndexNode`      | Low        |

### Type Mapping (PG → SQLite)

```javascript
const PG_TO_SQLITE = {
   // Integers
   int2: "INTEGER",
   smallint: "INTEGER",
   int4: "INTEGER",
   integer: "INTEGER",
   int: "INTEGER",
   int8: "INTEGER",
   bigint: "INTEGER",
   serial: "INTEGER", // + AUTOINCREMENT if PK
   bigserial: "INTEGER",

   // Floats
   float4: "REAL",
   real: "REAL",
   float8: "REAL",
   "double precision": "REAL",
   numeric: "REAL",
   decimal: "REAL",

   // Text
   text: "TEXT",
   varchar: "TEXT",
   "character varying": "TEXT",
   char: "TEXT",
   bpchar: "TEXT",

   // Other
   bytea: "BLOB",
   bool: "INTEGER",
   boolean: "INTEGER",
   date: "TEXT",
   time: "TEXT",
   timestamp: "TEXT",
   json: "TEXT",
   jsonb: "TEXT",
   uuid: "TEXT",
};
```

### Bundle Sizes

| Package             | Size    | Notes         |
| ------------------- | ------- | ------------- |
| `@pgsql/parser/v17` | ~240 KB | JS + WASM     |
| `pgsql-deparser`    | 1.0 MB  | Pure TS       |
| `kysely`            | 6.3 MB  | Query builder |

## Why JSON Schema?

SQLite lacks many PG DDL features (CHECK constraints, VARCHAR lengths). Validation must move to app layer regardless.

JSON Schema:

- Naturally understood by LLMs
- Portable, language-agnostic
- Allows direct schema definition or DSL (a la Drizzle)
- PG DDL → JSON Schema OR direct JSON Schema input
