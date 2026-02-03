export interface JsonSchemaType {
  type: 'string' | 'integer' | 'number' | 'boolean' | 'object';
  format?: string;
  maxLength?: number;
}

const TYPE_MAP: Record<string, JsonSchemaType> = {
  // String types
  varchar: { type: 'string' },
  char: { type: 'string' },
  text: { type: 'string' },
  bpchar: { type: 'string' },

  // Integer types
  int2: { type: 'integer' },
  int4: { type: 'integer' },
  int8: { type: 'integer' },
  smallint: { type: 'integer' },
  integer: { type: 'integer' },
  bigint: { type: 'integer' },
  serial: { type: 'integer' },
  bigserial: { type: 'integer' },

  // Numeric types
  numeric: { type: 'number' },
  decimal: { type: 'number' },
  real: { type: 'number' },
  float4: { type: 'number' },
  float8: { type: 'number' },
  'double precision': { type: 'number' },

  // Boolean
  bool: { type: 'boolean' },
  boolean: { type: 'boolean' },

  // Date/Time with formats
  timestamp: { type: 'string', format: 'date-time' },
  timestamptz: { type: 'string', format: 'date-time' },
  date: { type: 'string', format: 'date' },
  time: { type: 'string', format: 'time' },
  timetz: { type: 'string', format: 'time' },

  // UUID
  uuid: { type: 'string', format: 'uuid' },

  // Binary
  bytea: { type: 'string', format: 'binary' },

  // JSON
  json: { type: 'object' },
  jsonb: { type: 'object' },
};

function extractLength(typmod: any): number | undefined {
  // Extract length from A_Const node
  if (typmod?.A_Const?.ival?.ival !== undefined) {
    return typmod.A_Const.ival.ival;
  }
  if (typmod?.A_Const?.ival !== undefined && typeof typmod.A_Const.ival === 'number') {
    return typmod.A_Const.ival;
  }
  return undefined;
}

export function mapType(pgType: string, typmods?: any[]): JsonSchemaType {
  const normalized = pgType.toLowerCase().trim();
  const base = TYPE_MAP[normalized] || { type: 'string' };

  // Extract VARCHAR(50) → maxLength: 50
  if ((normalized === 'varchar' || normalized === 'char') && typmods?.[0]) {
    const length = extractLength(typmods[0]);
    if (length && length > 0) {
      return { ...base, maxLength: length };
    }
  }

  return base;
}

export function extractTypeName(typeName: any): string {
  if (!typeName) return 'text';

  // Handle array of name parts (e.g., [{ String: { sval: "pg_catalog" }}, { String: { sval: "varchar" }}])
  if (typeName.names && Array.isArray(typeName.names)) {
    const names = typeName.names
      .map((n: any) => n.String?.sval || n.sval || '')
      .filter(Boolean);

    // Use the last element (actual type name, skip schema like pg_catalog)
    return names[names.length - 1] || 'text';
  }

  return 'text';
}
