# PostgreSQL to SQLite Schema Translator

Translates PostgreSQL DDL to SQLite-compatible SQL with constraint enforcement via CHECK constraints.

## Usage

```bash
# Direct SQL string
npm run pg2sqlite -- "CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100));"

# From file
npm run pg2sqlite -- schema.sql

# From stdin
cat schema.sql | npm run pg2sqlite -- -
echo "CREATE TABLE t (id INT);" | npm run pg2sqlite -- -

# With npx directly
npx tsx src/pg2sqlite.ts "CREATE TABLE users (id SERIAL PRIMARY KEY);"
npx tsx src/pg2sqlite.ts schema.sql

# After build
npm run build
node dist/pg2sqlite.js "CREATE TABLE t (id INT);"
```

## Key Insight: CHECK Constraints Work, Type Enforcement Doesn't

**SQLite does NOT enforce data types.** You can insert `'hello'` into an INTEGER column. SQLite uses "type affinity" - types are suggestions, not constraints.

**SQLite DOES enforce CHECK constraints.** This is the key to making PostgreSQL constraints work in SQLite.

This translator converts PostgreSQL type constraints into SQLite CHECK constraints:

```sql
-- PostgreSQL
CREATE TABLE users (
  age INTEGER CHECK (age >= 0),        -- CHECK works in both
  status TEXT CHECK (status IN ('a','b')),  -- CHECK works in both
  name VARCHAR(100)                    -- Length NOT enforced in SQLite!
);

-- Translated SQLite
CREATE TABLE users (
  age INTEGER CHECK (age >= 0),        -- Works natively
  status TEXT CHECK (status IN ('a','b')),  -- Works natively
  name TEXT CHECK (length(name) <= 100)     -- Now enforced via CHECK!
);
```

### What Gets Translated to CHECK Constraints

| PostgreSQL | SQLite Translation | Enforced? |
|------------|-------------------|-----------|
| `CHECK (expr)` | `CHECK (expr)` | ✅ Native |
| `VARCHAR(n)` | `TEXT CHECK (length(col) <= n)` | ✅ Via CHECK |
| `CHAR(n)` | `TEXT CHECK (length(col) <= n)` | ✅ Via CHECK |
| `status IN ('a','b')` | Same | ✅ Native |
| `price > 0` | Same | ✅ Native |
| `BETWEEN x AND y` | Same | ✅ Native |
| `col1 AND col2` | Same | ✅ Native |

### What's NOT Enforced (even after translation)

| PostgreSQL | SQLite | Why |
|------------|--------|-----|
| `INTEGER` type | `INTEGER` | SQLite allows any value |
| `NOT NULL` | `NOT NULL` | ✅ This one IS enforced |
| `UNIQUE` | `UNIQUE` | ✅ This one IS enforced |
| `FOREIGN KEY` | `FOREIGN KEY` | ✅ Enforced if `PRAGMA foreign_keys=ON` |

## ⚠️ SQLite ALTER TABLE Limitations

**SQLite cannot add/modify/drop CHECK constraints on existing tables.**

```sql
-- This does NOT work in SQLite:
ALTER TABLE users ADD CONSTRAINT check_age CHECK (age >= 0);
ALTER TABLE users DROP CONSTRAINT check_age;
```

### Workaround: Recreate the Table

To modify CHECK constraints on an existing table:

```sql
-- 1. Create new table with desired constraints
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY,
  age INTEGER CHECK (age >= 0 AND age <= 150),  -- modified constraint
  name TEXT CHECK (length(name) <= 100)
);

-- 2. Copy data (will fail if existing data violates new constraints!)
INSERT INTO users_new SELECT * FROM users;

-- 3. Drop old table
DROP TABLE users;

-- 4. Rename new table
ALTER TABLE users_new RENAME TO users;

-- 5. Recreate indexes, triggers, etc.
```

**Important:** Step 2 will fail if existing data violates the new constraints. Clean data first if needed.

## Supported Features

### Data Types (90+ mapped)

| PostgreSQL | SQLite | Notes |
|------------|--------|-------|
| INTEGER, INT, INT2, INT4, INT8, SMALLINT, BIGINT | INTEGER | |
| SERIAL, BIGSERIAL, SMALLSERIAL | INTEGER | + AUTOINCREMENT when PK |
| REAL, FLOAT4, FLOAT8, DOUBLE PRECISION | REAL | |
| NUMERIC, DECIMAL | NUMERIC | |
| MONEY | REAL | |
| TEXT, VARCHAR, CHAR, CHARACTER VARYING | TEXT | Length enforced via CHECK |
| BOOLEAN, BOOL | INTEGER | 0/1 |
| DATE, TIME, TIMESTAMP, TIMESTAMPTZ, INTERVAL | TEXT | ISO format |
| JSON, JSONB | TEXT | |
| UUID | TEXT | |
| BYTEA | BLOB | |
| INET, CIDR, MACADDR | TEXT | |
| POINT, LINE, BOX, POLYGON, CIRCLE | TEXT | Store as JSON |
| TSVECTOR, TSQUERY | TEXT | |
| INT4RANGE, DATERANGE, etc. | TEXT | Store as JSON |
| BIT, BIT VARYING | TEXT | |
| XML | TEXT | |
| Arrays (TEXT[], INTEGER[], etc.) | TEXT | Store as JSON |

### Constraints

| Feature | Status | Notes |
|---------|--------|-------|
| PRIMARY KEY | ✅ | |
| AUTOINCREMENT | ✅ | SERIAL + PK |
| NOT NULL | ✅ | Natively enforced |
| UNIQUE | ✅ | Natively enforced |
| DEFAULT | ✅ | Function calls wrapped in () |
| CHECK (comparisons) | ✅ | `CHECK (price > 0)` |
| CHECK (BETWEEN) | ✅ | `CHECK (age BETWEEN 0 AND 150)` |
| CHECK (IN list) | ✅ | Simulates ENUMs |
| CHECK (AND/OR) | ✅ | Complex expressions |
| Named constraints | ✅ | `CONSTRAINT name CHECK (...)` |
| VARCHAR(n) length | ✅ | Translated to `CHECK (length(col) <= n)` |
| FOREIGN KEY | ✅ | Requires `PRAGMA foreign_keys=ON` |
| ON DELETE/UPDATE | ✅ | CASCADE, SET NULL, etc. |

### Functions

| PostgreSQL | SQLite |
|------------|--------|
| NOW() | (datetime('now')) |
| CURRENT_TIMESTAMP | (datetime('now')) |
| gen_random_uuid() | UUID generation expression |

### Unsupported (gracefully handled)

| Feature | Handling |
|---------|----------|
| ENUM types | Comment with CHECK hint |
| SEQUENCES | Comment |
| DEFERRABLE | Stripped |
| NOT VALID | Stripped |
| MATCH FULL/PARTIAL | Stripped |
| DOMAIN types | Comment |

## Tests

```bash
# Unit tests (32 tests)
npm run test

# SQLite validation tests (10 tests) - verifies output is valid SQLite
npm run test:sqlite
```

## How It Works

```
PG SQL → pgsql-parser → PG AST → SQLiteDeparser → SQLite SQL
```

Extends pgsql-deparser and overrides:
- `TypeName` - maps PG types to SQLite
- `ColumnDef` - handles SERIAL, adds length CHECK constraints
- `Constraint` - translates CHECK, handles FK, removes unsupported
- `FuncCall` - translates NOW() → datetime('now')
- `CreateEnumStmt` - outputs comment with CHECK hint
