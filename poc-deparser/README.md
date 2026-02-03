# POC 1: Parser Fork Approach

Extends pgsql-deparser with SQLite-specific output.

## How It Works

```
PG SQL → pgsql-parser → PG AST → SQLiteDeparser → SQLite SQL
```

## Proven

- ✓ Single AST, direct output
- ✓ Override specific methods for SQLite
- ✓ No extra runtime dependency

## Trade-offs

- Large codebase to maintain (~10,500 lines, ~200 handlers)
- Need to modify methods per feature
- Same validation metadata limitation as Kysely

## Run

```bash
bun run src/test.ts
```
