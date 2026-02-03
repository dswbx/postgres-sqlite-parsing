# POC Plan: PostgreSQL to SQLite Translation

Two proof-of-concept implementations for translating PostgreSQL DDL to SQLite.

## Scope

Both POCs will support:
- `CREATE TABLE` with columns, types, constraints
- `CREATE INDEX`
- Primary keys, foreign keys, unique, not null, default

## POC 1: Kysely Approach

**Goal:** Convert PG AST → Kysely AST → SQLite SQL

### Files to Create

```
poc-kysely/
├── index.js           # Main entry, exports translate()
├── converter.js       # PG AST → Kysely node converter
├── type-map.js        # PG type → SQLite type mapping
└── test.js            # Test cases
```

### Implementation Steps

1. **Type mapping** (`type-map.js`)
   - Map PG types (serial, varchar, int4, etc.) to SQLite types
   - Handle SERIAL → INTEGER + autoIncrement flag

2. **Converter** (`converter.js`)
   - `convertCreateStmt(node)` → Kysely CreateTableNode
   - `convertColumnDef(node)` → Kysely ColumnDefinitionNode
   - `convertConstraint(node)` → constraint flags/nodes
   - `convertIndexStmt(node)` → Kysely CreateIndexNode

3. **Main entry** (`index.js`)
   ```javascript
   import { parse } from 'pgsql-parser';
   import { Kysely, SqliteDialect } from 'kysely';

   export function translate(pgSql) {
     const ast = parse(pgSql);
     const kyselyNode = convert(ast);
     return compile(kyselyNode); // → SQLite SQL
   }
   ```

4. **Tests** (`test.js`)
   - CREATE TABLE with various column types
   - PRIMARY KEY, FOREIGN KEY, UNIQUE, NOT NULL, DEFAULT
   - CREATE INDEX

### Estimated Lines
- converter.js: ~150-200 lines
- type-map.js: ~50 lines
- index.js: ~30 lines
- Total: ~250 lines

---

## POC 2: Fork Deparser Approach

**Goal:** Modify pgsql-deparser to output SQLite syntax

### Files to Create

```
poc-deparser/
├── index.js              # Main entry
├── sqlite-deparser.js    # Modified deparser (forked)
├── type-map.js           # PG type → SQLite type mapping
└── test.js               # Test cases
```

### Implementation Steps

1. **Copy deparser**
   - Copy `node_modules/pgsql-deparser/deparser.js` to `sqlite-deparser.js`

2. **Modify TypeName method** (~line 1698)
   - Replace PG type output with SQLite equivalents
   - Use type-map.js for lookups

3. **Modify CreateStmt method** (~line 2349)
   - Remove PG-specific table options
   - Handle SERIAL → INTEGER PRIMARY KEY AUTOINCREMENT

4. **Modify ColumnDef method** (~line 2492)
   - Adjust constraint output for SQLite

5. **Modify Constraint method** (~line 2531)
   - Simplify FK actions (SQLite subset)
   - Remove unsupported constraint types

6. **Main entry** (`index.js`)
   ```javascript
   import { parse } from 'pgsql-parser';
   import { SQLiteDeparser } from './sqlite-deparser.js';

   export function translate(pgSql) {
     const ast = parse(pgSql);
     return SQLiteDeparser.deparse(ast);
   }
   ```

### Key Modifications

| Method | Line | Change |
|--------|------|--------|
| `TypeName()` | ~1698 | Insert type mapping lookup |
| `CreateStmt()` | ~2349 | Remove PG table options |
| `ColumnDef()` | ~2492 | Handle AUTOINCREMENT |
| `Constraint()` | ~2531 | Simplify FK, remove unsupported |
| `IndexStmt()` | ~3419 | Minor syntax adjustments |

### Estimated Changes
- sqlite-deparser.js: ~100-150 lines modified
- type-map.js: ~50 lines
- index.js: ~20 lines

---

## Test Cases (Both POCs)

```sql
-- Basic table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Foreign key
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL
);

-- Index
CREATE INDEX idx_users_email ON users(email);

-- Composite primary key
CREATE TABLE user_roles (
  user_id INTEGER,
  role_id INTEGER,
  PRIMARY KEY (user_id, role_id)
);
```

### Expected SQLite Output

```sql
CREATE TABLE "users" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "name" TEXT NOT NULL,
  "email" TEXT UNIQUE,
  "created_at" TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "posts" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "user_id" INTEGER REFERENCES "users" ("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL
);

CREATE INDEX "idx_users_email" ON "users" ("email");

CREATE TABLE "user_roles" (
  "user_id" INTEGER,
  "role_id" INTEGER,
  PRIMARY KEY ("user_id", "role_id")
);
```

---

## Verification

1. Run each POC against test cases
2. Compare output SQL
3. Execute output in SQLite to verify validity
4. Compare implementation complexity and maintainability

```bash
# Run POC 1
node poc-kysely/test.js

# Run POC 2
node poc-deparser/test.js

# Verify SQLite validity
sqlite3 :memory: < output.sql
```

---

## Deliverables

| POC | Files | Est. Lines | Est. Effort |
|-----|-------|------------|-------------|
| Kysely | 4 | ~250 | 1 day |
| Deparser | 4 | ~200 (+ fork) | 1 day |

After POCs, evaluate:
- Code complexity
- Maintainability
- SQLite output quality
- Edge case handling
