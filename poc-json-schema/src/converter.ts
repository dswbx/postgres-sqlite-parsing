import { mapType, extractTypeName } from './type-map.js';
import { analyzeCheck } from './check-analyzer.js';

export interface JsonSchema {
  $schema: string;
  type: 'object';
  $defs?: Record<string, any>;
  properties: Record<string, TableSchema>;
}

export interface TableSchema {
  type: 'object';
  additionalProperties: boolean;
  properties: Record<string, PropertySchema>;
  required: string[];
}

export interface PropertySchema {
  type?: string;
  format?: string;
  maxLength?: number;
  multipleOf?: number;
  minimum?: number;
  maximum?: number;
  enum?: any[];
  pattern?: string;
  default?: any;
  $default?: string;  // Computed default (e.g., "NOW()", "uuid_generate_v4()")
  $primaryKey?: boolean;
  $index?: true | 'unique';  // Index: true (regular) or "unique" (unique index)
  $ref?: string;
  $onDelete?: string;
  $onUpdate?: string;
  items?: any;
}

interface DefaultValue {
  simple?: any;        // Simple constant value for JSON Schema `default`
  computed?: string;   // Computed expression for custom `$default`
}

function extractDefault(rawExpr: any, originalSql?: string): DefaultValue {
  if (!rawExpr) return {};

  // Handle A_Const values (simple constants)
  if (rawExpr.A_Const) {
    const c = rawExpr.A_Const;

    // Integer value
    if (c.ival !== undefined) {
      if (c.ival.ival !== undefined) return { simple: c.ival.ival };
      if (typeof c.ival === 'number') return { simple: c.ival };
      // Empty object means 0
      if (typeof c.ival === 'object' && Object.keys(c.ival).length === 0) return { simple: 0 };
    }

    // Float value
    if (c.fval !== undefined) {
      if (c.fval.fval !== undefined) return { simple: parseFloat(c.fval.fval) };
      if (typeof c.fval === 'string') return { simple: parseFloat(c.fval) };
      if (typeof c.fval === 'number') return { simple: c.fval };
    }

    // String value
    if (c.sval !== undefined) {
      if (c.sval.sval !== undefined) return { simple: c.sval.sval };
      if (typeof c.sval === 'string') return { simple: c.sval };
    }

    // Boolean value
    if (c.boolval !== undefined) {
      if (c.boolval.boolval !== undefined) return { simple: c.boolval.boolval };
      if (typeof c.boolval === 'boolean') return { simple: c.boolval };
      // Empty object means false
      if (typeof c.boolval === 'object' && Object.keys(c.boolval).length === 0) return { simple: false };
    }
  }

  // Handle string literals
  if (rawExpr.String?.sval) return { simple: rawExpr.String.sval };

  // Handle function calls (computed defaults like NOW(), uuid_generate_v4())
  if (rawExpr.FuncCall) {
    return { computed: serializeDefaultExpr(rawExpr) };
  }

  // Handle SQL value functions (CURRENT_TIMESTAMP, CURRENT_DATE, etc.)
  if (rawExpr.SQLValueFunction) {
    return { computed: serializeDefaultExpr(rawExpr) };
  }

  // Handle TypeCast (e.g., 'now'::timestamp)
  if (rawExpr.TypeCast) {
    return { computed: serializeDefaultExpr(rawExpr) };
  }

  // Any other expression is computed
  if (Object.keys(rawExpr).length > 0) {
    return { computed: serializeDefaultExpr(rawExpr) };
  }

  return {};
}

function serializeDefaultExpr(expr: any): string {
  // FuncCall: NOW(), uuid_generate_v4(), etc.
  if (expr.FuncCall) {
    const funcName = expr.FuncCall.funcname
      ?.map((n: any) => n.String?.sval || '')
      .filter(Boolean)
      .join('.');

    // Handle functions with no arguments
    if (!expr.FuncCall.args || expr.FuncCall.args.length === 0) {
      return `${funcName}()`;
    }

    // Handle functions with arguments (rare for defaults)
    return `${funcName}(...)`;
  }

  // SQLValueFunction: CURRENT_TIMESTAMP, CURRENT_DATE, CURRENT_TIME, etc.
  if (expr.SQLValueFunction) {
    const opMap: Record<string, string> = {
      'SVFOP_CURRENT_DATE': 'CURRENT_DATE',
      'SVFOP_CURRENT_TIME': 'CURRENT_TIME',
      'SVFOP_CURRENT_TIME_N': 'CURRENT_TIME',
      'SVFOP_CURRENT_TIMESTAMP': 'CURRENT_TIMESTAMP',
      'SVFOP_CURRENT_TIMESTAMP_N': 'CURRENT_TIMESTAMP',
      'SVFOP_LOCALTIME': 'LOCALTIME',
      'SVFOP_LOCALTIME_N': 'LOCALTIME',
      'SVFOP_LOCALTIMESTAMP': 'LOCALTIMESTAMP',
      'SVFOP_LOCALTIMESTAMP_N': 'LOCALTIMESTAMP',
      'SVFOP_CURRENT_ROLE': 'CURRENT_ROLE',
      'SVFOP_CURRENT_USER': 'CURRENT_USER',
      'SVFOP_USER': 'USER',
      'SVFOP_SESSION_USER': 'SESSION_USER',
      'SVFOP_CURRENT_CATALOG': 'CURRENT_CATALOG',
      'SVFOP_CURRENT_SCHEMA': 'CURRENT_SCHEMA'
    };
    return opMap[expr.SQLValueFunction.op] || 'SQL_FUNCTION';
  }

  // TypeCast: 'now'::timestamp
  if (expr.TypeCast) {
    if (expr.TypeCast.arg?.A_Const?.sval) {
      const val = expr.TypeCast.arg.A_Const.sval.sval || expr.TypeCast.arg.A_Const.sval;
      return `'${val}'::text`;
    }
  }

  // Fallback: mark as computed expression
  return 'EXPRESSION';
}

interface ForeignKeyInfo {
  table: string;
  column: string;
  onDelete?: string;
  onUpdate?: string;
}

function extractForeignKey(constraint: any): ForeignKeyInfo {
  const fk: ForeignKeyInfo = {
    table: '',
    column: ''
  };

  // Extract referenced table
  if (constraint.pktable?.relname) {
    fk.table = constraint.pktable.relname;
  }

  // Extract referenced column
  if (constraint.pk_attrs?.[0]?.String?.sval) {
    fk.column = constraint.pk_attrs[0].String.sval;
  }

  // Extract ON DELETE action
  if (constraint.fk_del_action) {
    fk.onDelete = mapFkAction(constraint.fk_del_action);
  }

  // Extract ON UPDATE action
  if (constraint.fk_upd_action) {
    fk.onUpdate = mapFkAction(constraint.fk_upd_action);
  }

  return fk;
}

function mapFkAction(action: string): string | undefined {
  const actionMap: Record<string, string> = {
    'c': 'cascade',
    'n': 'set null',
    'd': 'set default',
    'r': 'restrict',
    'a': 'no action'
  };
  return actionMap[action.toLowerCase()];
}

export class PgToJsonSchemaConverter {
  private schema: JsonSchema = {
    $schema: 'https://example.com/postgres-json-schema.json',
    type: 'object',
    properties: {}
  };
  private enumRegistry: Map<string, string[]>;

  constructor(enumRegistry?: Map<string, string[]>) {
    this.enumRegistry = enumRegistry || new Map();
    // Populate $defs from enum registry
    if (this.enumRegistry.size > 0) {
      this.schema.$defs = {};
      for (const [name, values] of this.enumRegistry) {
        this.schema.$defs[name] = { type: 'string', enum: values };
      }
    }
  }

  convertCreateStmt(stmt: any) {
    const table = stmt.relation.relname;
    const tableSchema: TableSchema = {
      type: 'object',
      additionalProperties: false,
      properties: {},
      required: []
    };

    // Process columns and column-level constraints
    for (const elt of stmt.tableElts || []) {
      if (elt.ColumnDef) {
        this.addColumn(tableSchema, elt.ColumnDef);
      }
      // Skip table-level constraints (composite PK/UNIQUE/FK)
      // These don't map naturally to property-level JSON Schema
    }

    this.schema.properties[table] = tableSchema;
  }

  private addColumn(tableSchema: TableSchema, col: any) {
    const name = col.colname;
    const pgType = extractTypeName(col.typeName);
    const arrayBounds = col.typeName?.arrayBounds;

    let prop: PropertySchema;
    let isEnumRef = false;

    // Check if it's a custom enum type
    if (this.enumRegistry.has(pgType)) {
      prop = { $ref: `#/$defs/${pgType}` };
      isEnumRef = true;
    } else {
      const jsonType = mapType(pgType, col.typeName?.typmods, arrayBounds);
      prop = { type: jsonType.type };
      if (jsonType.format) prop.format = jsonType.format;
      if (jsonType.maxLength) prop.maxLength = jsonType.maxLength;
      if (jsonType.multipleOf) prop.multipleOf = jsonType.multipleOf;
      if (jsonType.items) prop.items = jsonType.items;
    }

    let isRequired = false;
    let isPrimaryKey = false;
    let hasForeignKey = false;

    // Process column constraints
    for (const c of col.constraints || []) {
      if (!c.Constraint) continue;

      const contype = c.Constraint.contype;

      switch (contype) {
        case 'CONSTR_NOTNULL':
          isRequired = true;
          break;

        case 'CONSTR_PRIMARY':
          isPrimaryKey = true;
          prop.$primaryKey = true;
          break;

        case 'CONSTR_UNIQUE':
          prop.$index = 'unique';
          break;

        case 'CONSTR_CHECK':
          if (!isEnumRef) {
            const validation = analyzeCheck(c.Constraint.raw_expr, name);
            if (validation) {
              Object.assign(prop, validation);
            }
          }
          break;

        case 'CONSTR_DEFAULT':
          const defaultValue = extractDefault(c.Constraint.raw_expr);
          if (defaultValue.simple !== undefined) {
            prop.default = defaultValue.simple;
          } else if (defaultValue.computed) {
            prop.$default = defaultValue.computed;
          }
          break;

        case 'CONSTR_FOREIGN':
          const fk = extractForeignKey(c.Constraint);
          if (fk.table && fk.column) {
            hasForeignKey = true;
            prop.$ref = `#/properties/${fk.table}/properties/${fk.column}`;
            if (fk.onDelete && fk.onDelete !== 'no action') {
              prop.$onDelete = fk.onDelete;
            }
            if (fk.onUpdate && fk.onUpdate !== 'no action') {
              prop.$onUpdate = fk.onUpdate;
            }
          }
          break;
      }
    }

    // Remove type/format duplication for foreign keys - $ref handles validation
    if (hasForeignKey) {
      delete prop.type;
      delete prop.format;
      delete prop.maxLength;
    }

    // Never require auto-generated primary keys
    if (isRequired && !isPrimaryKey) {
      tableSchema.required.push(name);
    }

    tableSchema.properties[name] = prop;
  }

  getSchema(): JsonSchema {
    return this.schema;
  }
}
