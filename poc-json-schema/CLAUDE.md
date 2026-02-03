# pg-to-json-schema

Converts PostgreSQL DDL to JSON Schema Draft 2020-12.

## After Any Feature Change

1. **Update tests** in `src/index.test.ts`
2. **Update showcase** in `src/example.ts` - demo new capabilities
3. **Run `bun test`** - all tests must pass (includes meta-schema validation)
4. **Update support matrix** in BOTH files (keep in sync):
   - `DDL-TEST-SCHEMAS.md` - full matrix with examples
   - `README.md` - same matrix for quick reference

## File Overview

- `src/index.ts` - Entry point, parses DDL, builds enum registry
- `src/converter.ts` - Converts CreateStmt to JSON Schema
- `src/type-map.ts` - Maps PG types to JSON Schema types
- `src/check-analyzer.ts` - Extracts CHECK constraints
- `src/example.ts` - Runnable showcase (`bun run src/example.ts`)
- `src/index.test.ts` - Unit tests
- `src/validate-schema.test.ts` - Meta-schema validation tests
- `postgres-json-schema.schema.json` - Meta-schema (update if adding new properties)
- `DDL-TEST-SCHEMAS.md` - Support matrix documentation

## Commands

```bash
bun test              # run all tests
bun run src/example.ts  # run showcase
```
