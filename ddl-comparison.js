import { parse } from 'pgsql-parser';
import { Kysely, SqliteDialect } from 'kysely';

// Parse a CREATE TABLE with PG parser
const pgAst = await parse(`
  CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email TEXT UNIQUE,
    age INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    org_id INTEGER REFERENCES orgs(id) ON DELETE CASCADE
  )
`);

console.log('=== PostgreSQL AST (CreateStmt) ===');
console.log(JSON.stringify(pgAst.stmts[0].stmt.CreateStmt, null, 2));

// Build equivalent with Kysely
const db = new Kysely({
  dialect: new SqliteDialect({
    database: async () => ({
      execute: async () => ({ rows: [] }),
      close: async () => {}
    })
  })
});

const kyselyQuery = db.schema
  .createTable('users')
  .addColumn('id', 'integer', col => col.primaryKey().autoIncrement())
  .addColumn('name', 'varchar(255)', col => col.notNull())
  .addColumn('email', 'text', col => col.unique())
  .addColumn('age', 'integer', col => col.defaultTo(0))
  .addColumn('created_at', 'text', col => col.defaultTo('CURRENT_TIMESTAMP'))
  .addColumn('org_id', 'integer', col => col.references('orgs.id').onDelete('cascade'));

console.log('\n=== Kysely AST (CreateTableNode) ===');
console.log(JSON.stringify(kyselyQuery.toOperationNode(), null, 2));

console.log('\n=== Kysely compiled SQL (SQLite) ===');
console.log(kyselyQuery.compile().sql);
