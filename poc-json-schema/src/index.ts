import { parse } from 'pgsql-parser';
import { PgToJsonSchemaConverter } from './converter.js';

export async function convert(pgSql: string) {
  const ast = await parse(pgSql);
  const converter = new PgToJsonSchemaConverter();

  for (const stmt of ast.stmts) {
    if (stmt.stmt.CreateStmt) {
      converter.convertCreateStmt(stmt.stmt.CreateStmt);
    }
  }

  return converter.getSchema();
}

export { PgToJsonSchemaConverter } from './converter.js';
export { mapType, extractTypeName } from './type-map.js';
export { analyzeCheck } from './check-analyzer.js';
