// PostgreSQL to SQLite type mapping

export const PG_TO_SQLITE: Record<string, string> = {
  // Integers
  int2: 'INTEGER',
  smallint: 'INTEGER',
  int4: 'INTEGER',
  integer: 'INTEGER',
  int: 'INTEGER',
  int8: 'INTEGER',
  bigint: 'INTEGER',
  serial: 'INTEGER',
  bigserial: 'INTEGER',
  smallserial: 'INTEGER',

  // Floats
  float4: 'REAL',
  real: 'REAL',
  float8: 'REAL',
  'double precision': 'REAL',
  numeric: 'REAL',
  decimal: 'REAL',

  // Text
  text: 'TEXT',
  varchar: 'TEXT',
  'character varying': 'TEXT',
  char: 'TEXT',
  character: 'TEXT',
  bpchar: 'TEXT',

  // Binary
  bytea: 'BLOB',

  // Boolean
  bool: 'INTEGER',
  boolean: 'INTEGER',

  // Date/Time
  date: 'TEXT',
  time: 'TEXT',
  timetz: 'TEXT',
  timestamp: 'TEXT',
  timestamptz: 'TEXT',
  interval: 'TEXT',

  // JSON
  json: 'TEXT',
  jsonb: 'TEXT',

  // Other
  uuid: 'TEXT',
  money: 'REAL',
  inet: 'TEXT',
  cidr: 'TEXT',
  macaddr: 'TEXT',
};

export function mapTypeToSQLite(pgType: string): string {
  const normalized = pgType.toLowerCase();
  return PG_TO_SQLITE[normalized] || 'TEXT';
}

export function isSerialType(pgType: string): boolean {
  const normalized = pgType.toLowerCase();
  return normalized === 'serial' || normalized === 'bigserial' || normalized === 'smallserial';
}
