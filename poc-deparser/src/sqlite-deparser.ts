import { Deparser as PgDeparser } from 'pgsql-deparser';
import { mapTypeToSQLite, isSerialType, isLengthConstrainedType, isBooleanType, isTimestampType, isDateType, isTimeType, isNumericType, isJsonType, mapFunctionToSQLite } from './type-map.js';

/**
 * SQLite Deparser - extends PostgreSQL deparser with SQLite-specific modifications
 *
 * Key changes:
 * - TypeName: Maps PG types to SQLite types
 * - ColumnDef: Handles SERIAL → INTEGER + AUTOINCREMENT
 * - Constraint: Removes unsupported features, translates CHECK constraints
 * - FuncCall: Translates PG functions to SQLite equivalents
 * - A_Expr: Translates PG operators to SQLite equivalents
 */
export class SQLiteDeparser extends PgDeparser {
  // Enum registry: type name → list of quoted values
  private enumRegistry = new Map<string, string[]>();

  /**
   * Pre-scan AST to collect enum definitions before deparsing
   */
  collectEnums(ast: any): void {
    const stmts = ast?.stmts ?? ast ?? [];
    for (const entry of Array.isArray(stmts) ? stmts : []) {
      const node = entry?.stmt?.CreateEnumStmt ?? entry?.RawStmt?.stmt?.CreateEnumStmt;
      if (!node) continue;
      const typeName = node.typeName
        ?.map((n: any) => n.String?.sval || n.String?.str)
        .filter(Boolean)
        .join('.');
      if (!typeName || !node.vals) continue;
      const vals = (Array.isArray(node.vals) ? node.vals : [])
        .map((v: any) => v.String?.sval || v.String?.str)
        .filter(Boolean);
      this.enumRegistry.set(typeName.toLowerCase(), vals);
    }
  }

  /**
   * Override CreateStmt to append STRICT
   */
  CreateStmt(node: any, context: any): string {
    let result = super.CreateStmt(node, context);
    return result + ' STRICT';
  }

  /**
   * Override TypeName to map PostgreSQL types to SQLite types
   */
  TypeName(node: any, _context: any): string {
    if (!node.names) {
      return '';
    }

    const names = node.names
      .map((name: any) => {
        if (name.String) {
          return name.String.sval || name.String.str;
        }
        return '';
      })
      .filter(Boolean);

    if (names.length === 0) {
      return '';
    }

    // Extract PG type
    const pgType = names.length === 2 && names[0] === 'pg_catalog' ? names[1] : names.join('.');

    // Check for array type modifier
    if (node.arrayBounds && node.arrayBounds.length > 0) {
      return 'TEXT'; // Arrays stored as JSON
    }

    // Enum types → TEXT
    if (this.enumRegistry.has(pgType.toLowerCase())) {
      return 'TEXT';
    }

    // Map to SQLite type
    return mapTypeToSQLite(pgType);
  }

  /**
   * Override ColumnDef to handle SERIAL → INTEGER + AUTOINCREMENT
   * and add CHECK constraints for VARCHAR/CHAR length enforcement
   */
  ColumnDef(node: any, context: any): string {
    const parts: string[] = [];
    const colname = node.colname;

    if (colname) {
      // @ts-ignore - use quoteIfNeeded from base class
      parts.push(this.quoteIfNeeded(colname));
    }

    // Check if SERIAL type and extract type info for constraints
    let isSerial = false;
    let hasPrimaryKey = false;
    let lengthConstraint: { maxLen: number } | null = null;
    let numericConstraint: { precision: number; scale: number } | null = null;
    let pgType: string | null = null;
    let isArray = false;

    if (node.typeName) {
      const names = node.typeName.names?.map((n: any) => n.String?.sval || n.String?.str).filter(Boolean);
      pgType = names && (names.length === 2 && names[0] === 'pg_catalog' ? names[1] : names[0]);
      isSerial = Boolean(pgType && isSerialType(pgType));
      isArray = node.typeName.arrayBounds && node.typeName.arrayBounds.length > 0;

      const typmods = Array.isArray(node.typeName.typmods) ? node.typeName.typmods : [];
      const getTypmod = (i: number) => typmods[i]?.A_Const?.ival?.ival ?? typmods[i]?.A_Const?.val?.ival?.ival;

      // Check for length-constrained string types (varchar, char, bpchar)
      if (pgType && isLengthConstrainedType(pgType) && typmods.length > 0) {
        const len = getTypmod(0);
        if (typeof len === 'number' && len > 0) {
          lengthConstraint = { maxLen: len };
        }
      }

      // Check for numeric(precision, scale)
      if (pgType && isNumericType(pgType) && typmods.length >= 2) {
        const precision = getTypmod(0);
        const scale = getTypmod(1);
        if (typeof precision === 'number' && typeof scale === 'number' && precision > 0 && scale >= 0) {
          numericConstraint = { precision, scale };
        }
      }

      if (node.constraints) {
        // Check for PRIMARY KEY in constraints
        const constraintList = Array.isArray(node.constraints) ? node.constraints : [];
        hasPrimaryKey = constraintList.some((c: any) => c.Constraint?.contype === 'CONSTR_PRIMARY');
      }

      parts.push(this.TypeName(node.typeName, context));
    }

    if (node.constraints) {
      const constraintList = Array.isArray(node.constraints) ? node.constraints : [];
      const constraintStrs = constraintList.map((constraint: any) => {
        // @ts-ignore
        return this.visit(constraint, context);
      });
      parts.push(...constraintStrs.filter(Boolean));

      // Add AUTOINCREMENT for SERIAL + PRIMARY KEY
      if (isSerial && hasPrimaryKey) {
        parts.push('AUTOINCREMENT');
      }
    }

    // Add CHECK constraint for length-constrained string types
    if (lengthConstraint && colname) {
      parts.push(`CHECK (length(${colname}) <= ${lengthConstraint.maxLen})`);
    }

    // Add CHECK constraint for numeric(precision, scale)
    if (numericConstraint && colname) {
      const { precision, scale } = numericConstraint;
      const multiplier = Math.pow(10, scale);
      const maxInt = Math.pow(10, precision - scale);
      parts.push(`CHECK (ABS(ROUND(${colname} * ${multiplier}) - ${colname} * ${multiplier}) < 0.0001 AND ABS(${colname}) < ${maxInt})`);
    }

    // Add type-validation CHECK constraints
    if (colname && isArray) {
      parts.push(`CHECK (${colname} IS NULL OR (json_valid(${colname}) AND json_type(${colname}) = 'array'))`);
    } else if (pgType && colname) {
      const enumVals = this.enumRegistry.get(pgType.toLowerCase());
      if (enumVals) {
        const quoted = enumVals.map((v) => `'${v}'`).join(', ');
        parts.push(`CHECK (${colname} IN (${quoted}))`);
      } else if (isBooleanType(pgType)) {
        parts.push(`CHECK (${colname} IN (0, 1))`);
      } else if (isJsonType(pgType)) {
        parts.push(`CHECK (${colname} IS NULL OR json_valid(${colname}))`);
      } else if (isTimestampType(pgType)) {
        parts.push(`CHECK (${colname} IS NULL OR datetime(${colname}) IS ${colname})`);
      } else if (isDateType(pgType)) {
        parts.push(`CHECK (${colname} IS NULL OR date(${colname}) IS ${colname})`);
      } else if (isTimeType(pgType)) {
        parts.push(`CHECK (${colname} IS NULL OR time(${colname}) IS ${colname})`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Override Constraint to handle CHECK constraints and remove SQLite-unsupported features
   */
  Constraint(node: any, context: any): string {
    // Skip deferrable constraints - SQLite doesn't support
    if (
      node.contype === 'CONSTR_ATTR_DEFERRABLE' ||
      node.contype === 'CONSTR_ATTR_NOT_DEFERRABLE' ||
      node.contype === 'CONSTR_ATTR_DEFERRED' ||
      node.contype === 'CONSTR_ATTR_IMMEDIATE'
    ) {
      return '';
    }

    // Handle CHECK constraints specially - translate expressions
    if (node.contype === 'CONSTR_CHECK' && node.raw_expr) {
      const parts: string[] = [];

      if (node.conname) {
        // @ts-ignore - use quoteIfNeeded from base class
        parts.push('CONSTRAINT', this.quoteIfNeeded(node.conname));
      }

      parts.push('CHECK');

      // @ts-ignore - visit the expression
      const expr = this.visit(node.raw_expr, context);
      parts.push(`(${expr})`);

      return parts.join(' ');
    }

    // Handle DEFAULT constraints - wrap function calls in parentheses for SQLite
    if (node.contype === 'CONSTR_DEFAULT' && node.raw_expr) {
      // @ts-ignore
      const expr = this.visit(node.raw_expr, context);
      // SQLite requires DEFAULT expressions with function calls to be in parentheses
      if (expr.includes('(') && !expr.startsWith('(')) {
        return `DEFAULT (${expr})`;
      }
      return `DEFAULT ${expr}`;
    }

    // Handle FOREIGN KEY constraints - for inline constraints, omit "FOREIGN KEY" prefix
    if (node.contype === 'CONSTR_FOREIGN') {
      const parts: string[] = [];

      // Only add FOREIGN KEY for table-level constraints (when pktable is specified without being inline)
      // For column-level constraints, just use REFERENCES
      if (node.pktable) {
        // @ts-ignore
        const tableName = this.quoteIfNeeded(node.pktable.relname);

        parts.push('REFERENCES', tableName);

        if (node.pk_attrs && node.pk_attrs.length > 0) {
          const cols = node.pk_attrs.map((a: any) => a.String?.sval || a.String?.str).filter(Boolean);
          parts.push(`(${cols.join(', ')})`);
        }

        // ON DELETE action
        if (node.fk_del_action && node.fk_del_action !== 'a') {
          const action = this.getFkAction(node.fk_del_action);
          if (action) {
            parts.push('ON DELETE', action);
          }
        }

        // ON UPDATE action
        if (node.fk_upd_action && node.fk_upd_action !== 'a') {
          const action = this.getFkAction(node.fk_upd_action);
          if (action) {
            parts.push('ON UPDATE', action);
          }
        }

        return parts.join(' ');
      }
    }

    // Call parent implementation
    let result = super.Constraint(node, context);

    // Remove NOT VALID, NO INHERIT (not supported in SQLite)
    result = result.replace(/\s+NOT\s+VALID/gi, '');
    result = result.replace(/\s+NO\s+INHERIT/gi, '');
    result = result.replace(/\s+MATCH\s+(FULL|PARTIAL|SIMPLE)/gi, '');
    // Remove "FOREIGN KEY" from inline constraints (SQLite uses just REFERENCES)
    result = result.replace(/\s*FOREIGN\s+KEY\s+REFERENCES/gi, 'REFERENCES');

    return result;
  }

  /**
   * Convert PostgreSQL FK action code to SQLite action
   */
  private getFkAction(action: string): string | null {
    switch (action) {
      case 'a': return null; // NO ACTION (default)
      case 'r': return 'RESTRICT';
      case 'c': return 'CASCADE';
      case 'n': return 'SET NULL';
      case 'd': return 'SET DEFAULT';
      default: return null;
    }
  }

  /**
   * Override FuncCall to translate PostgreSQL functions to SQLite equivalents
   */
  FuncCall(node: any, context: any): string {
    // Get function name
    const funcnames = node.funcname || [];
    const names = funcnames
      .map((n: any) => n.String?.sval || n.String?.str)
      .filter(Boolean);

    if (names.length > 0) {
      const funcName = names[names.length - 1].toLowerCase();

      // Handle NOW() → datetime('now')
      if (funcName === 'now' && (!node.args || node.args.length === 0)) {
        return "datetime('now')";
      }

      // Handle CURRENT_TIMESTAMP
      if (funcName === 'current_timestamp') {
        return "datetime('now')";
      }

      // Handle gen_random_uuid() and uuid_generate_v4()
      if (funcName === 'gen_random_uuid' || funcName === 'uuid_generate_v4') {
        return mapFunctionToSQLite(funcName);
      }
    }

    // Fall back to parent implementation
    return super.FuncCall(node, context);
  }

  /**
   * Override A_Expr to translate PostgreSQL operators to SQLite equivalents
   */
  A_Expr(node: any, context: any): string {
    // Get the operator
    if (node.name && node.name.length > 0) {
      const opName = node.name[0]?.String?.sval || node.name[0]?.String?.str;

      if (opName) {
        // Handle ~~ (LIKE) operator
        if (opName === '~~' || opName === '~~*') {
          // @ts-ignore
          const left = this.visit(node.lexpr, context);
          // @ts-ignore
          const right = this.visit(node.rexpr, context);
          return `${left} LIKE ${right}`;
        }

        // Handle !~~ (NOT LIKE) operator
        if (opName === '!~~' || opName === '!~~*') {
          // @ts-ignore
          const left = this.visit(node.lexpr, context);
          // @ts-ignore
          const right = this.visit(node.rexpr, context);
          return `${left} NOT LIKE ${right}`;
        }

        // Handle regex operators (requires SQLite extension)
        if (opName === '~' || opName === '~*') {
          // @ts-ignore
          const left = this.visit(node.lexpr, context);
          // @ts-ignore
          const right = this.visit(node.rexpr, context);
          // SQLite doesn't have native REGEXP, so we use GLOB or comment
          return `${left} GLOB ${right}`;
        }
      }
    }

    // Fall back to parent implementation
    return super.A_Expr(node, context);
  }

  /**
   * Override TypeCast to handle PostgreSQL type casts
   */
  TypeCast(node: any, context: any): string {
    if (!node.arg || !node.typeName) {
      return super.TypeCast(node, context);
    }

    // @ts-ignore
    const arg = this.visit(node.arg, context);
    const sqliteType = this.TypeName(node.typeName, context);

    // SQLite CAST syntax
    return `CAST(${arg} AS ${sqliteType})`;
  }

  /**
   * Handle BETWEEN expressions
   */
  BetweenExpr(node: any, context: any): string {
    // This is handled by A_Expr in pgsql-deparser
    return super.A_Expr(node, context);
  }

  /**
   * Override CreateEnumStmt - SQLite doesn't have ENUM, create CHECK constraint table instead
   */
  CreateEnumStmt(_node: any, _context: any): string {
    // Enum values are inlined as CHECK constraints on columns — nothing to emit
    return '';
  }

  /**
   * Override to handle CREATE DOMAIN as a comment (SQLite doesn't support domains)
   */
  CreateDomainStmt(node: any, _context: any): string {
    const domainName = node.domainname
      ?.map((n: any) => n.String?.sval || n.String?.str)
      .filter(Boolean)
      .join('.');

    return `-- DOMAIN ${domainName || 'unknown'} not supported in SQLite`;
  }

  /**
   * Override CreateSeqStmt - SQLite doesn't have sequences
   */
  CreateSeqStmt(node: any, _context: any): string {
    const seqName = node.sequence?.relname || 'unknown';
    return `-- SEQUENCE ${seqName} not supported in SQLite (use AUTOINCREMENT)`;
  }

  /**
   * Override AlterSeqStmt
   */
  AlterSeqStmt(node: any, _context: any): string {
    const seqName = node.sequence?.relname || 'unknown';
    return `-- ALTER SEQUENCE ${seqName} not supported in SQLite`;
  }
}

export function deparse(ast: any): string {
  const deparser = new SQLiteDeparser(ast);
  deparser.collectEnums(ast);
  // @ts-ignore - access internal method
  const result = deparser.deparseQuery();
  // Remove empty statements (e.g. from suppressed CREATE TYPE)
  return result.replace(/^\s*;\s*\n*/gm, '').trim() + '\n';
}
