import { parse } from 'pgsql-parser';
import { Kysely, DummyDriver, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely';
import { PgToKyselyConverter } from './converter.js';

const db = new Kysely({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

export async function translate(pgSql: string): Promise<string> {
  const ast = await parse(pgSql);

  if (!ast || !ast.stmts || ast.stmts.length === 0) {
    throw new Error('No statements to translate');
  }

  const converter = new PgToKyselyConverter(db);
  const results: string[] = [];

  for (const rawStmt of ast.stmts) {
    const stmt = rawStmt.stmt;

    if (stmt.CreateStmt) {
      const builder = converter.convertCreateStmt(stmt.CreateStmt);
      results.push(builder.compile().sql);
    } else if (stmt.IndexStmt) {
      const builder = converter.convertIndexStmt(stmt.IndexStmt);
      results.push(builder.compile().sql);
    } else {
      console.warn('Unsupported statement type:', Object.keys(stmt)[0]);
    }
  }

  return results.join(';\n\n') + ';';
}
