# POC: Kysely Schema Builder Approach

## Why

Need PG→SQLite translation without maintaining deparser fork. Kysely provides battle-tested SQLite dialect + schema builder API. Solution: convert PG AST to Kysely builder calls, let Kysely generate SQLite SQL.

## How It Works

```
PG SQL → pgsql-parser → PG AST → Converter → Kysely Builder → SQLite SQL
```

## PG Parser AST Example

Input SQL:
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL
);
```

Parsed AST (simplified):
```json
{
  "stmts": [{
    "stmt": {
      "CreateStmt": {
        "relation": { "relname": "users" },
        "tableElts": [
          {
            "ColumnDef": {
              "colname": "id",
              "typeName": {
                "names": [{ "String": { "sval": "serial" } }]
              },
              "constraints": [{
                "Constraint": { "contype": "CONSTR_PRIMARY" }
              }]
            }
          },
          {
            "ColumnDef": {
              "colname": "name",
              "typeName": {
                "names": [{ "String": { "sval": "varchar" } }],
                "typmods": [{ "A_Const": { "ival": { "ival": 255 } } }]
              },
              "constraints": [{
                "Constraint": { "contype": "CONSTR_NOTNULL" }
              }]
            }
          }
        ]
      }
    }
  }]
}
```

## Implementation Pattern

Map PG AST nodes to Kysely builder methods:

```typescript
import { Kysely, SqliteAdapter, SqliteQueryCompiler } from 'kysely';

class PgToKyselyConverter {
  constructor(private db: Kysely<any>) {}

  convertCreateStmt(pgStmt) {
    let builder = db.schema.createTable(pgStmt.relation.relname);

    // Map columns
    for (const colDef of pgStmt.tableElts) {
      const pgType = extractType(colDef.typeName);
      const sqliteType = mapType(pgType);  // varchar → text, int8 → integer

      builder = builder.addColumn(colDef.colname, sqliteType, (col) => {
        // Map constraints: NOT NULL, UNIQUE, DEFAULT, FK
        if (isSerial(pgType) && hasPK(colDef)) {
          return col.primaryKey().autoIncrement();
        }
        return applyConstraints(col, colDef.constraints);
      });
    }

    return builder;
  }

  convertIndexStmt(pgStmt) {
    return db.schema
      .createIndex(pgStmt.idxname)
      .on(pgStmt.relation.relname)
      .columns(extractColumns(pgStmt.indexParams));
  }
}

// Generate SQLite SQL
const builder = converter.convertCreateStmt(pgAst);
const sqliteSQL = builder.compile().sql;
```

## Pros

- **Clean separation**: PG AST → generic builder API → SQLite SQL
- **Battle-tested**: Kysely handles SQLite quirks, edge cases, quoting
- **Simple mapping**: ~10 node types, straightforward conversions
- **Type-safe**: Full TypeScript types from both pgsql-parser and Kysely
- **Proven**: 72/77 tests passing (94%)
- **No maintenance burden**: Don't maintain deparser fork

## Cons

- **Metadata loss**: Kysely API can't express all PG features:
  - VARCHAR(255) → TEXT (length info dropped)
  - CHECK constraints unsupported in builder API
  - Some PG-specific constraints lost
- **Extra dependency**: Kysely adds 6.3MB (~130KB gzipped)
- **Abstraction overhead**: Two-step conversion (AST → builder → SQL)
- **Limited expressiveness**: Constrained by Kysely's builder API surface

## Run

```bash
bun test
```

## See Also

[TEST_COVERAGE.md](./TEST_COVERAGE.md)
