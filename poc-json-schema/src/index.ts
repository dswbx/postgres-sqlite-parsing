import { parse } from 'pgsql-parser';
import { PgToJsonSchemaConverter } from './converter.js';

export async function convert(pgSql: string) {
  const ast = await parse(pgSql);

  // Build enum registry from CREATE TYPE statements
  const enumRegistry = new Map<string, string[]>();
  for (const stmt of ast.stmts) {
    if (stmt.stmt.CreateEnumStmt) {
      const name = stmt.stmt.CreateEnumStmt.typeName?.[0]?.String?.sval;
      const vals = stmt.stmt.CreateEnumStmt.vals?.map((v: any) => v.String?.sval).filter(Boolean);
      if (name && vals?.length) enumRegistry.set(name, vals);
    }
  }

  const converter = new PgToJsonSchemaConverter(enumRegistry);

  for (const stmt of ast.stmts) {
    if (stmt.stmt.CreateStmt) {
      converter.convertCreateStmt(stmt.stmt.CreateStmt);
    }
  }

  return converter.getSchema();
}

export { PgToJsonSchemaConverter } from './converter.js';
export type { JsonSchema, TableSchema, PropertySchema } from './converter.js';
export { mapType, extractTypeName } from './type-map.js';
export { analyzeCheck } from './check-analyzer.js';
export { jsonSchemaToSqlite } from './to-sqlite.js';
