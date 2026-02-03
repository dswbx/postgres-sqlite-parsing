# POC 2: Kysely Approach

Converts PostgreSQL DDL to SQLite via Kysely.

## How It Works

```
PG SQL → pgsql-parser → PG AST → Converter → Kysely AST → SQLite SQL
```

## Proven

- ✓ Direct AST mapping works (~10 node types)
- ✓ Kysely handles SQLite dialect
- ✓ 72/77 tests passing (94%)
- ✓ Type-safe, battle-tested

## Trade-offs

- Loses VARCHAR(n) length info
- Cannot express CHECK constraints
- Extra dependency (Kysely 6.3MB)

## Run

```bash
bun test
```

## See Also

[TEST_COVERAGE.md](./TEST_COVERAGE.md)
