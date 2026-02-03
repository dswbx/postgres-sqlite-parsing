import { parse } from 'pgsql-parser';
import { sql, SqliteDialect, Kysely } from 'kysely';

// PostgreSQL AST example
const pgAst = await parse('SELECT id, name FROM users WHERE age > 18');
console.log('=== PostgreSQL AST ===');
console.log(JSON.stringify(pgAst, null, 2));

// Show what Kysely AST would look like
// Kysely builds AST through query builder, not direct construction
const db = new Kysely({
  dialect: new SqliteDialect({
    database: async () => ({
      execute: async () => ({ rows: [] }),
      close: async () => {}
    })
  })
});

// Generate Kysely query
const query = db.selectFrom('users').select(['id', 'name']).where('age', '>', 18);
const compiled = query.compile();
console.log('\n=== Kysely compiled (SQLite) ===');
console.log('SQL:', compiled.sql);
console.log('Parameters:', compiled.parameters);

// Access internal node (if possible)
console.log('\n=== Kysely internal node ===');
console.log(JSON.stringify(query.toOperationNode(), null, 2));
