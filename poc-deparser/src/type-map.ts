// PostgreSQL to SQLite type mapping - comprehensive coverage

export const PG_TO_SQLITE: Record<string, string> = {
  // === Integers ===
  int2: 'INTEGER',
  smallint: 'INTEGER',
  int4: 'INTEGER',
  integer: 'INTEGER',
  int: 'INTEGER',
  int8: 'INTEGER',
  bigint: 'INTEGER',
  serial: 'INTEGER',
  serial4: 'INTEGER',
  bigserial: 'INTEGER',
  serial8: 'INTEGER',
  smallserial: 'INTEGER',
  serial2: 'INTEGER',

  // === Floating point ===
  float4: 'REAL',
  real: 'REAL',
  float8: 'REAL',
  'double precision': 'REAL',
  numeric: 'NUMERIC', // SQLite NUMERIC has affinity rules
  decimal: 'NUMERIC',
  money: 'REAL',

  // === Text ===
  text: 'TEXT',
  varchar: 'TEXT',
  'character varying': 'TEXT',
  char: 'TEXT',
  character: 'TEXT',
  bpchar: 'TEXT',
  name: 'TEXT', // PG internal 63-char type
  citext: 'TEXT', // case-insensitive text extension

  // === Binary ===
  bytea: 'BLOB',

  // === Boolean ===
  bool: 'INTEGER',
  boolean: 'INTEGER',

  // === Date/Time ===
  date: 'TEXT',
  time: 'TEXT',
  'time without time zone': 'TEXT',
  timetz: 'TEXT',
  'time with time zone': 'TEXT',
  timestamp: 'TEXT',
  'timestamp without time zone': 'TEXT',
  timestamptz: 'TEXT',
  'timestamp with time zone': 'TEXT',
  interval: 'TEXT',

  // === JSON ===
  json: 'TEXT',
  jsonb: 'TEXT',

  // === UUID ===
  uuid: 'TEXT',

  // === Network types ===
  inet: 'TEXT',
  cidr: 'TEXT',
  macaddr: 'TEXT',
  macaddr8: 'TEXT',

  // === Bit strings ===
  bit: 'TEXT',
  'bit varying': 'TEXT',
  varbit: 'TEXT',

  // === Geometric types (store as TEXT/JSON) ===
  point: 'TEXT',
  line: 'TEXT',
  lseg: 'TEXT',
  box: 'TEXT',
  path: 'TEXT',
  polygon: 'TEXT',
  circle: 'TEXT',

  // === Text search ===
  tsvector: 'TEXT',
  tsquery: 'TEXT',

  // === Range types (store as TEXT/JSON) ===
  int4range: 'TEXT',
  int8range: 'TEXT',
  numrange: 'TEXT',
  tsrange: 'TEXT',
  tstzrange: 'TEXT',
  daterange: 'TEXT',

  // === Multirange types (PG14+) ===
  int4multirange: 'TEXT',
  int8multirange: 'TEXT',
  nummultirange: 'TEXT',
  tsmultirange: 'TEXT',
  tstzmultirange: 'TEXT',
  datemultirange: 'TEXT',

  // === XML ===
  xml: 'TEXT',

  // === OID types ===
  oid: 'INTEGER',
  regclass: 'TEXT',
  regcollation: 'TEXT',
  regconfig: 'TEXT',
  regdictionary: 'TEXT',
  regnamespace: 'TEXT',
  regoper: 'TEXT',
  regoperator: 'TEXT',
  regproc: 'TEXT',
  regprocedure: 'TEXT',
  regrole: 'TEXT',
  regtype: 'TEXT',
  xid: 'INTEGER',
  xid8: 'INTEGER',
  cid: 'INTEGER',
  tid: 'TEXT',

  // === LSN ===
  pg_lsn: 'TEXT',

  // === Pseudo-types that might appear ===
  void: 'TEXT',
  record: 'TEXT',
  any: 'TEXT',
  anyarray: 'TEXT',
  anyelement: 'TEXT',
  anyenum: 'TEXT',
  anynonarray: 'TEXT',
  anyrange: 'TEXT',
  anymultirange: 'TEXT',
  anycompatible: 'TEXT',
  anycompatiblearray: 'TEXT',
  anycompatiblenonarray: 'TEXT',
  anycompatiblerange: 'TEXT',
  anycompatiblemultirange: 'TEXT',

  // === Internal types ===
  internal: 'BLOB',
  language_handler: 'TEXT',
  fdw_handler: 'TEXT',
  index_am_handler: 'TEXT',
  table_am_handler: 'TEXT',
  tsm_handler: 'TEXT',
  trigger: 'TEXT',
  event_trigger: 'TEXT',
};

// PostgreSQL functions that need SQLite equivalents
export const PG_FUNC_TO_SQLITE: Record<string, string> = {
  // Date/time
  now: "datetime('now')",
  current_timestamp: "datetime('now')",
  current_date: "date('now')",
  current_time: "time('now')",
  localtime: "time('now', 'localtime')",
  localtimestamp: "datetime('now', 'localtime')",

  // Math
  random: 'random()',

  // String
  length: 'length',
  lower: 'lower',
  upper: 'upper',
  substr: 'substr',
  substring: 'substr',
  trim: 'trim',
  ltrim: 'ltrim',
  rtrim: 'rtrim',
  replace: 'replace',
  coalesce: 'coalesce',
  nullif: 'nullif',

  // Aggregates
  count: 'count',
  sum: 'sum',
  avg: 'avg',
  min: 'min',
  max: 'max',

  // Type casts
  'gen_random_uuid':
    "lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))",
  uuid_generate_v4:
    "lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))),2) || '-' || substr('89ab',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || '-' || lower(hex(randomblob(6)))",
};

// PostgreSQL operators that need translation
export const PG_OP_TO_SQLITE: Record<string, string> = {
  '~~': 'LIKE',
  '~~*': 'LIKE', // case-insensitive LIKE (SQLite LIKE is case-insensitive for ASCII)
  '!~~': 'NOT LIKE',
  '!~~*': 'NOT LIKE',
  '~': 'REGEXP', // requires SQLite regexp extension
  '~*': 'REGEXP',
  '!~': 'NOT REGEXP',
  '!~*': 'NOT REGEXP',
  '||': '||', // string concat - same
  '@>': 'json_each', // containment - needs transformation
  '<@': 'json_each',
  '?': 'json_extract', // key exists
  '?|': 'json_extract',
  '?&': 'json_extract',
};

export function mapTypeToSQLite(pgType: string): string {
  const normalized = pgType.toLowerCase().trim();

  // Handle array types - PG uses _typename for arrays
  if (normalized.startsWith('_')) {
    return 'TEXT'; // Store arrays as JSON text
  }

  // Handle array notation
  if (normalized.endsWith('[]')) {
    return 'TEXT';
  }

  return PG_TO_SQLITE[normalized] || 'TEXT';
}

export function isSerialType(pgType: string): boolean {
  const normalized = pgType.toLowerCase();
  return ['serial', 'serial4', 'bigserial', 'serial8', 'smallserial', 'serial2'].includes(normalized);
}

export function isLengthConstrainedType(pgType: string): boolean {
  const normalized = pgType.toLowerCase();
  return ['varchar', 'character varying', 'char', 'character', 'bpchar'].includes(normalized);
}

export function mapFunctionToSQLite(pgFunc: string): string {
  const normalized = pgFunc.toLowerCase();
  return PG_FUNC_TO_SQLITE[normalized] || pgFunc;
}

export function mapOperatorToSQLite(pgOp: string): string {
  return PG_OP_TO_SQLITE[pgOp] || pgOp;
}
