import type { JsonSchema, PropertySchema } from './converter.js';

// SQLite reserved words that need quoting
const RESERVED = new Set([
  'abort', 'action', 'add', 'after', 'all', 'alter', 'always', 'analyze',
  'and', 'as', 'asc', 'attach', 'autoincrement', 'before', 'begin',
  'between', 'by', 'cascade', 'case', 'cast', 'check', 'collate', 'column',
  'commit', 'conflict', 'constraint', 'create', 'cross', 'current',
  'current_date', 'current_time', 'current_timestamp', 'database', 'default',
  'deferrable', 'deferred', 'delete', 'desc', 'detach', 'distinct', 'do',
  'drop', 'each', 'else', 'end', 'escape', 'except', 'exclude', 'exclusive',
  'exists', 'explain', 'fail', 'filter', 'first', 'following', 'for',
  'foreign', 'from', 'full', 'generated', 'glob', 'group', 'groups',
  'having', 'if', 'ignore', 'immediate', 'in', 'index', 'indexed',
  'initially', 'inner', 'insert', 'instead', 'intersect', 'into', 'is',
  'isnull', 'join', 'key', 'last', 'left', 'like', 'limit', 'match',
  'materialized', 'natural', 'no', 'not', 'nothing', 'notnull', 'null',
  'nulls', 'of', 'offset', 'on', 'or', 'order', 'others', 'outer', 'over',
  'partition', 'plan', 'pragma', 'preceding', 'primary', 'query', 'raise',
  'range', 'recursive', 'references', 'regexp', 'reindex', 'release',
  'rename', 'replace', 'restrict', 'returning', 'right', 'rollback', 'row',
  'rows', 'savepoint', 'select', 'set', 'table', 'temp', 'temporary',
  'then', 'ties', 'to', 'transaction', 'trigger', 'unbounded', 'union',
  'unique', 'update', 'using', 'vacuum', 'values', 'view', 'virtual',
  'when', 'where', 'window', 'with', 'without',
]);

function needsQuoting(name: string): boolean {
  return RESERVED.has(name.toLowerCase()) || /[^a-zA-Z0-9_]/.test(name);
}

function q(name: string): string {
  return needsQuoting(name) ? `"${name}"` : name;
}

function resolveType(prop: PropertySchema, schema: JsonSchema): string {
  if (prop.$ref) {
    // FK ref → resolve referenced column's type
    const match = prop.$ref.match(
      /^#\/properties\/([^/]+)\/properties\/([^/]+)$/
    );
    if (match) {
      const [, table, col] = match;
      const refProp = schema.properties[table]?.properties[col];
      if (refProp) return resolveType(refProp, schema);
    }
    return 'TEXT';
  }

  const typeMap: Record<string, string> = {
    string: 'TEXT',
    integer: 'INTEGER',
    number: 'REAL',
    boolean: 'INTEGER',
    object: 'TEXT',
    array: 'TEXT',
  };
  return typeMap[prop.type || ''] || 'TEXT';
}

function resolveFk(
  ref: string
): { table: string; column: string } | null {
  const match = ref.match(
    /^#\/properties\/([^/]+)\/properties\/([^/]+)$/
  );
  if (!match) return null;
  return { table: match[1], column: match[2] };
}

interface IndexDef {
  table: string;
  column: string;
  unique: boolean;
}

export function jsonSchemaToSqlite(schema: JsonSchema): string {
  const tables: string[] = [];
  const indices: IndexDef[] = [];

  for (const [tableName, tableSchema] of Object.entries(schema.properties)) {
    const cols: string[] = [];

    for (const [colName, prop] of Object.entries(tableSchema.properties)) {
      const parts: string[] = [q(colName), resolveType(prop, schema)];

      // Primary key
      if (prop.$primaryKey) {
        if (resolveType(prop, schema) === 'INTEGER') {
          parts.push('PRIMARY KEY AUTOINCREMENT');
        } else {
          parts.push('PRIMARY KEY');
        }
      }

      // NOT NULL from required array
      if (tableSchema.required?.includes(colName)) {
        parts.push('NOT NULL');
      }

      // Foreign key from $ref
      if (prop.$ref) {
        const fk = resolveFk(prop.$ref);
        if (fk) {
          let fkClause = `REFERENCES ${q(fk.table)}(${q(fk.column)})`;
          if (prop.$onDelete) fkClause += ` ON DELETE ${prop.$onDelete.toUpperCase()}`;
          if (prop.$onUpdate) fkClause += ` ON UPDATE ${prop.$onUpdate.toUpperCase()}`;
          parts.push(fkClause);
        }
      }

      cols.push('  ' + parts.join(' '));

      // Collect index
      if (prop.$index) {
        indices.push({
          table: tableName,
          column: colName,
          unique: prop.$index === 'unique',
        });
      }
    }

    tables.push(
      `CREATE TABLE ${q(tableName)} (\n${cols.join(',\n')}\n);`
    );
  }

  const indexStatements = indices.map((idx) => {
    const prefix = idx.unique ? 'CREATE UNIQUE INDEX' : 'CREATE INDEX';
    const name = `idx_${idx.table}_${idx.column}`;
    return `${prefix} ${q(name)} ON ${q(idx.table)}(${q(idx.column)});`;
  });

  const parts = [...tables];
  if (indexStatements.length) {
    parts.push(indexStatements.join('\n'));
  }
  return parts.join('\n\n');
}
