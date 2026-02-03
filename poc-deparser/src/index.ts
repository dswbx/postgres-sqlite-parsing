import { parse } from 'pgsql-parser';
import { deparse } from './sqlite-deparser.js';

export async function translate(pgSql: string): Promise<string> {
  const ast = await parse(pgSql);
  return deparse(ast);
}
