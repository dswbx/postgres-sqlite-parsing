# PostgreSQL → SQLite Schema Translator

Translates PostgreSQL DDL into SQLite-compatible SQL using **STRICT tables** and **CHECK constraints** to enforce type integrity that SQLite would otherwise ignore.

## Usage

```bash
npx tsx src/pg2sqlite.ts "CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100));"
npx tsx src/pg2sqlite.ts schema.sql
cat schema.sql | npx tsx src/pg2sqlite.ts -
```

## How it works

```
PG SQL → pgsql-parser → PG AST → SQLiteDeparser → SQLite SQL
```

We parse PG DDL into an AST via `pgsql-parser`, then walk it with `SQLiteDeparser` (extends `pgsql-deparser`). The deparser overrides specific AST node handlers to emit SQLite-compatible SQL. Adding support for new PG DDL features means adding/modifying a node handler in `sqlite-deparser.ts`.

### Architecture

| File | Purpose |
|------|---------|
| `type-map.ts` | PG→SQLite type mapping (90+ types), type classification helpers |
| `sqlite-deparser.ts` | AST node overrides — the core translation logic |
| `index.ts` | `translate()` entry point: parse → deparse |
| `test.ts` | Unit tests (string matching on output) |
| `test-sqlite-valid.ts` | Runs generated SQL through `sqlite3 :memory:` to verify validity |

### Deparser overrides

Each override corresponds to a PG AST node type. To handle new PG DDL, add a new override.

| Override | What it does |
|----------|-------------|
| `CreateStmt` | Appends `STRICT` to all CREATE TABLE |
| `TypeName` | Maps PG types → SQLite types (INTEGER/REAL/TEXT/BLOB), resolves enums → TEXT |
| `ColumnDef` | Core column translation: SERIAL→AUTOINCREMENT, emits type-validation CHECKs |
| `Constraint` | Translates CHECK/DEFAULT/FK, strips DEFERRABLE/NOT VALID/MATCH |
| `FuncCall` | `NOW()`→`datetime('now')`, `gen_random_uuid()`→hex expression |
| `A_Expr` | `~~`→LIKE, `!~~`→NOT LIKE, `~`→GLOB |
| `TypeCast` | PG casts → `CAST(x AS type)` |
| `CreateEnumStmt` | Suppressed (enum values inlined as CHECKs on columns) |
| `CreateDomainStmt` | → comment |
| `CreateSeqStmt` | → comment |
| `AlterSeqStmt` | → comment |

## Translation reference

### STRICT tables

All tables emit `CREATE TABLE ... (...) STRICT`. STRICT mode restricts column types to `INTEGER`, `REAL`, `TEXT`, `BLOB`, and `ANY` — no other type names allowed. This gives us actual type enforcement at the storage layer, unlike regular SQLite where types are suggestions.

### Type mapping

STRICT constrains us to 5 types. Everything maps to one of them:

| PG type | SQLite type | Notes |
|---------|-------------|-------|
| `INTEGER`, `INT`, `SMALLINT`, `BIGINT`, `INT2/4/8` | `INTEGER` | |
| `SERIAL`, `BIGSERIAL`, `SMALLSERIAL` | `INTEGER` | + `AUTOINCREMENT` when PK |
| `REAL`, `FLOAT4`, `FLOAT8`, `DOUBLE PRECISION` | `REAL` | |
| `NUMERIC`, `DECIMAL` | `REAL` | `NUMERIC` not allowed in STRICT |
| `MONEY` | `REAL` | |
| `BOOLEAN`, `BOOL` | `INTEGER` | CHECK enforces 0/1 |
| `TEXT`, `VARCHAR`, `CHAR`, `CHARACTER VARYING` | `TEXT` | |
| `DATE`, `TIME`, `TIMESTAMP`, `TIMESTAMPTZ`, `INTERVAL` | `TEXT` | |
| `JSON`, `JSONB` | `TEXT` | |
| `UUID` | `TEXT` | |
| `BYTEA` | `BLOB` | |
| `INET`, `CIDR`, `MACADDR`, `POINT`, `BOX`, etc. | `TEXT` | |
| `TSVECTOR`, `TSQUERY`, `XML` | `TEXT` | |
| `INT4RANGE`, `DATERANGE`, etc. | `TEXT` | |
| `BIT`, `BIT VARYING` | `TEXT` | |
| Any array (`TEXT[]`, `INTEGER[]`, etc.) | `TEXT` | Stored as JSON array |
| User-defined ENUM types | `TEXT` | CHECK enforces allowed values |

### CHECK constraints for type validation

SQLite's STRICT mode enforces storage types but not semantic types. We use CHECK constraints to bridge the gap. These are emitted automatically based on the PG type:

| PG type | Generated CHECK | Purpose |
|---------|----------------|---------|
| `BOOLEAN` | `CHECK (col IN (0, 1))` | Enforce bool semantics |
| `TIMESTAMP`/`TIMESTAMPTZ` | `CHECK (col IS NULL OR datetime(col) IS col)` | Validate ISO datetime format |
| `DATE` | `CHECK (col IS NULL OR date(col) IS col)` | Validate ISO date format |
| `TIME`/`TIMETZ` | `CHECK (col IS NULL OR time(col) IS col)` | Validate time format |
| `VARCHAR(n)`/`CHAR(n)` | `CHECK (length(col) <= n)` | Enforce max length |
| `NUMERIC(p,s)` | `CHECK (ABS(ROUND(col*10^s)-col*10^s) < 0.0001 AND ABS(col) < 10^(p-s))` | Enforce precision/scale |
| `JSON`/`JSONB` | `CHECK (col IS NULL OR json_valid(col))` | Validate JSON |
| Arrays (`*[]`) | `CHECK (col IS NULL OR (json_valid(col) AND json_type(col) = 'array'))` | Validate JSON array |
| ENUM types | `CHECK (col IN ('val1', 'val2', ...))` | Enforce allowed values |

The `IS NULL OR` pattern ensures NULLable columns pass the CHECK (NULL in a CHECK evaluates to UNKNOWN, which passes, but explicit IS NULL is clearer).

### ENUM translation

`CREATE TYPE ... AS ENUM` is pre-scanned before deparsing to build a registry. The `CREATE TYPE` statement itself is suppressed (no output). When a column references the enum type, it becomes `TEXT CHECK (col IN ('v1', 'v2', ...))`.

```sql
-- PG input
CREATE TYPE status AS ENUM ('pending', 'shipped', 'delivered');
CREATE TABLE orders (id SERIAL PRIMARY KEY, status status DEFAULT 'pending');

-- SQLite output
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'shipped', 'delivered'))
) STRICT;
```

### Constraints

| PG feature | SQLite handling |
|-----------|----------------|
| `PRIMARY KEY` | Preserved |
| `SERIAL` + `PRIMARY KEY` | `INTEGER PRIMARY KEY AUTOINCREMENT` |
| `NOT NULL` | Preserved (enforced natively) |
| `UNIQUE` | Preserved (enforced natively) |
| `DEFAULT expr` | Preserved, function calls wrapped in `()` |
| `CHECK (expr)` | Preserved, expressions translated |
| Named constraints | Preserved (`CONSTRAINT name CHECK (...)`) |
| `FOREIGN KEY` / `REFERENCES` | Preserved (needs `PRAGMA foreign_keys=ON`) |
| `ON DELETE/UPDATE` | CASCADE, SET NULL, RESTRICT, SET DEFAULT |
| `DEFERRABLE` | Stripped (unsupported) |
| `NOT VALID` | Stripped |
| `MATCH FULL/PARTIAL` | Stripped |

### Functions

| PG function | SQLite equivalent |
|------------|-------------------|
| `NOW()` | `datetime('now')` |
| `CURRENT_TIMESTAMP` | `datetime('now')` |
| `CURRENT_DATE` | `date('now')` |
| `CURRENT_TIME` | `time('now')` |
| `gen_random_uuid()` | hex/randomblob expression |

### Unsupported DDL (emitted as comments)

| PG feature | Output |
|-----------|--------|
| `CREATE DOMAIN` | `-- DOMAIN ... not supported in SQLite` |
| `CREATE SEQUENCE` | `-- SEQUENCE ... not supported in SQLite (use AUTOINCREMENT)` |
| `ALTER SEQUENCE` | `-- ALTER SEQUENCE ... not supported in SQLite` |

## Adding new translations

1. **New type**: add to `PG_TO_SQLITE` map in `type-map.ts`
2. **New type-validation CHECK**: add a type classifier (`isXxxType()`) in `type-map.ts`, then add the CHECK logic in `ColumnDef` in `sqlite-deparser.ts`
3. **New function**: add to `PG_FUNC_TO_SQLITE` in `type-map.ts`, or handle in `FuncCall` override
4. **New DDL statement**: add a new override method in `SQLiteDeparser` matching the AST node name (e.g. `CreateExtensionStmt`)
5. **New operator**: add to `PG_OP_TO_SQLITE` in `type-map.ts`, or handle in `A_Expr` override

Tests: add cases to `test.ts` (string matching) and `test-sqlite-valid.ts` (sqlite3 validation).

## Tests

```bash
npm run test          # unit tests (33)
npm run test:sqlite   # sqlite3 validation (10)
```

## Caveats

- **NUMERIC precision/scale CHECK** uses float-safe epsilon (`< 0.0001`) since SQLite REAL is IEEE 754 double
- **Array element types** are not validated — `INTEGER[]` becomes a JSON array CHECK but element types aren't enforced. App layer responsibility.
- **INTERVAL** has no CHECK — no SQLite function to validate interval format
- **ALTER TABLE** can't add/drop CHECK constraints in SQLite — must recreate the table
- **FOREIGN KEYS** require `PRAGMA foreign_keys = ON` (off by default in SQLite)
