import { Deparser as PgDeparser } from 'pgsql-deparser';
import { mapTypeToSQLite, isSerialType } from './type-map.js';

/**
 * SQLite Deparser - extends PostgreSQL deparser with SQLite-specific modifications
 *
 * Key changes:
 * - TypeName: Maps PG types to SQLite types
 * - ColumnDef: Handles SERIAL → INTEGER + AUTOINCREMENT
 * - Constraint: Removes unsupported features (DEFERRABLE, NOT VALID, etc.)
 */
export class SQLiteDeparser extends PgDeparser {
  /**
   * Override TypeName to map PostgreSQL types to SQLite types
   */
  TypeName(node: any, context: any): string {
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
    const pgType = names.length === 2 && names[0] === 'pg_catalog' ? names[1] : names[0];

    // Map to SQLite type
    return mapTypeToSQLite(pgType);
  }

  /**
   * Override ColumnDef to handle SERIAL → INTEGER + AUTOINCREMENT
   */
  ColumnDef(node: any, context: any): string {
    const parts: string[] = [];

    if (node.colname) {
      // @ts-ignore - accessing private method
      parts.push(this.quoteIdentifier(node.colname));
    }

    // Check if SERIAL type
    let isSerial = false;
    let hasPrimaryKey = false;

    if (node.typeName) {
      const names = node.typeName.names?.map((n: any) => n.String?.sval || n.String?.str).filter(Boolean);
      const pgType = names && (names.length === 2 && names[0] === 'pg_catalog' ? names[1] : names[0]);
      isSerial = pgType && isSerialType(pgType);

      if (node.constraints) {
        // @ts-ignore
        const constraints = this.unwrapList(node.constraints);
        hasPrimaryKey = constraints.some((c: any) => c.Constraint?.contype === 'CONSTR_PRIMARY');
      }

      parts.push(this.TypeName(node.typeName, context));
    }

    if (node.constraints) {
      // @ts-ignore
      const constraints = this.unwrapList(node.constraints);
      const constraintStrs = constraints.map((constraint: any) => {
        // @ts-ignore
        const columnConstraintContext = context.spawn('ColumnDef', { isColumnConstraint: true });
        // @ts-ignore
        return this.visit(constraint, columnConstraintContext);
      });
      parts.push(...constraintStrs);

      // Add AUTOINCREMENT for SERIAL + PRIMARY KEY
      if (isSerial && hasPrimaryKey) {
        parts.push('AUTOINCREMENT');
      }
    }

    return parts.join(' ');
  }

  /**
   * Override Constraint to remove SQLite-unsupported features
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

    // Call parent implementation
    let result = super.Constraint(node, context);

    // Remove NOT VALID, NO INHERIT (not supported in SQLite)
    result = result.replace(/\s+NOT\s+VALID/gi, '');
    result = result.replace(/\s+NO\s+INHERIT/gi, '');
    result = result.replace(/\s+MATCH\s+(FULL|PARTIAL|SIMPLE)/gi, '');

    return result;
  }
}

export function deparse(ast: any): string {
  return SQLiteDeparser.deparse(ast);
}
