// PostgreSQL to SQLite type mapping

export const PG_TO_SQLITE: Record<string, string> = {
  // Integers
  int2: 'integer',
  smallint: 'integer',
  int4: 'integer',
  integer: 'integer',
  int: 'integer',
  int8: 'integer',
  bigint: 'integer',
  serial: 'integer',
  bigserial: 'integer',
  smallserial: 'integer',

  // Floats
  float4: 'real',
  real: 'real',
  float8: 'real',
  'double precision': 'real',
  numeric: 'real',
  decimal: 'real',

  // Text
  text: 'text',
  varchar: 'text',
  'character varying': 'text',
  char: 'text',
  character: 'text',
  bpchar: 'text',

  // Binary
  bytea: 'blob',

  // Boolean
  bool: 'integer',
  boolean: 'integer',

  // Date/Time
  date: 'text',
  time: 'text',
  timetz: 'text',
  timestamp: 'text',
  timestamptz: 'text',
  interval: 'text',

  // JSON
  json: 'text',
  jsonb: 'text',

  // Other
  uuid: 'text',
  money: 'real',
  inet: 'text',
  cidr: 'text',
  macaddr: 'text',
};

export function mapType(pgType: string): string {
  const normalized = pgType.toLowerCase();
  return PG_TO_SQLITE[normalized] || 'text';
}

export function isSerialType(pgType: string): boolean {
  const normalized = pgType.toLowerCase();
  return normalized === 'serial' || normalized === 'bigserial' || normalized === 'smallserial';
}
