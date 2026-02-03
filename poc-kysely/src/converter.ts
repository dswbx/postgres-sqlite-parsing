import type { Kysely } from 'kysely';
import { mapType, isSerialType } from './type-map.js';

type PgNode = any; // PG AST types are complex, using any for POC

export class PgToKyselyConverter {
  constructor(private db: Kysely<any>) {}

  convertCreateStmt(createStmt: any) {
    const tableName = createStmt.relation.relname;
    let builder = this.db.schema.createTable(tableName);

    if (createStmt.if_not_exists) {
      builder = builder.ifNotExists();
    }

    const tableConstraints: any[] = [];

    for (const elt of createStmt.tableElts || []) {
      if (elt.ColumnDef) {
        builder = this.addColumn(builder, elt.ColumnDef);
      } else if (elt.Constraint) {
        tableConstraints.push(elt.Constraint);
      }
    }

    for (const constraint of tableConstraints) {
      builder = this.addTableConstraint(builder, constraint);
    }

    return builder;
  }

  private addColumn(builder: any, columnDef: any) {
    const colName = columnDef.colname;
    const pgType = this.extractTypeName(columnDef.typeName);
    const sqliteType = mapType(pgType);
    const isSerial = isSerialType(pgType);

    return builder.addColumn(colName, sqliteType, (col: any) => {
      let colBuilder = col;

      const hasPrimaryKey = columnDef.constraints?.some(
        (c: any) => c.Constraint?.contype === 'CONSTR_PRIMARY'
      );

      if (isSerial && hasPrimaryKey) {
        colBuilder = colBuilder.primaryKey().autoIncrement();
      } else {
        for (const constraint of columnDef.constraints || []) {
          if (constraint.Constraint) {
            colBuilder = this.applyColumnConstraint(colBuilder, constraint.Constraint, isSerial);
          }
        }
      }

      return colBuilder;
    });
  }

  private extractTypeName(typeName: any): string {
    if (!typeName || !typeName.names) return 'text';

    const names = typeName.names.map((n: any) => n.String?.sval).filter(Boolean);

    if (names.length > 1 && names[0] === 'pg_catalog') {
      return names[1];
    }

    return names[0] || 'text';
  }

  private applyColumnConstraint(colBuilder: any, constraint: any, isSerial: boolean) {
    switch (constraint.contype) {
      case 'CONSTR_PRIMARY':
        if (isSerial) {
          return colBuilder.primaryKey().autoIncrement();
        }
        return colBuilder.primaryKey();

      case 'CONSTR_NOTNULL':
        return colBuilder.notNull();

      case 'CONSTR_UNIQUE':
        return colBuilder.unique();

      case 'CONSTR_DEFAULT':
        const defaultValue = this.extractDefaultValue(constraint.raw_expr);
        return colBuilder.defaultTo(defaultValue);

      case 'CONSTR_FOREIGN':
        return this.applyForeignKey(colBuilder, constraint);

      default:
        return colBuilder;
    }
  }

  private extractDefaultValue(expr: any): any {
    if (!expr) return null;

    if (expr.A_Const) {
      if (expr.A_Const.ival !== undefined) {
        return expr.A_Const.ival.ival ?? 0;
      }
      if (expr.A_Const.sval !== undefined) {
        return expr.A_Const.sval.sval;
      }
      if (expr.A_Const.fval !== undefined) {
        return parseFloat(expr.A_Const.fval.fval);
      }
      if (expr.A_Const.boolval !== undefined) {
        return expr.A_Const.boolval.boolval ? 1 : 0;
      }
    }

    if (expr.FuncCall) {
      const funcName = expr.FuncCall.funcname?.[0]?.String?.sval?.toLowerCase();
      if (funcName === 'now') {
        return 'CURRENT_TIMESTAMP';
      }
    }

    if (expr.ColumnRef) {
      const colName = expr.ColumnRef.fields?.[0]?.String?.sval?.toUpperCase();
      if (colName === 'CURRENT_TIMESTAMP') {
        return 'CURRENT_TIMESTAMP';
      }
    }

    return null;
  }

  private applyForeignKey(colBuilder: any, constraint: any) {
    const targetTable = constraint.pktable?.relname;
    const targetColumn = constraint.pk_attrs?.[0]?.String?.sval;

    if (!targetTable || !targetColumn) {
      return colBuilder;
    }

    let fkBuilder = colBuilder.references(`${targetTable}.${targetColumn}`);

    if (constraint.fk_del_action === 'c') {
      fkBuilder = fkBuilder.onDelete('cascade');
    } else if (constraint.fk_del_action === 'n') {
      fkBuilder = fkBuilder.onDelete('set null');
    } else if (constraint.fk_del_action === 'r') {
      fkBuilder = fkBuilder.onDelete('restrict');
    }

    if (constraint.fk_upd_action === 'c') {
      fkBuilder = fkBuilder.onUpdate('cascade');
    } else if (constraint.fk_upd_action === 'n') {
      fkBuilder = fkBuilder.onUpdate('set null');
    } else if (constraint.fk_upd_action === 'r') {
      fkBuilder = fkBuilder.onUpdate('restrict');
    }

    return fkBuilder;
  }

  private addTableConstraint(builder: any, constraint: any) {
    switch (constraint.contype) {
      case 'CONSTR_PRIMARY': {
        const columns = constraint.keys?.map((k: any) => k.String?.sval).filter(Boolean) || [];
        const name = constraint.conname || `pk_${columns.join('_')}`;
        return builder.addPrimaryKeyConstraint(name, columns);
      }

      case 'CONSTR_UNIQUE': {
        const columns = constraint.keys?.map((k: any) => k.String?.sval).filter(Boolean) || [];
        const name = constraint.conname || `unique_${columns.join('_')}`;
        return builder.addUniqueConstraint(name, columns);
      }

      case 'CONSTR_FOREIGN': {
        const columns = constraint.fk_attrs?.map((k: any) => k.String?.sval).filter(Boolean) || [];
        const targetTable = constraint.pktable?.relname;
        const targetColumns = constraint.pk_attrs?.map((k: any) => k.String?.sval).filter(Boolean) || [];
        const name = constraint.conname || `fk_${columns.join('_')}`;

        return builder.addForeignKeyConstraint(
          name,
          columns,
          targetTable,
          targetColumns,
          (cb: any) => {
            let fkBuilder = cb;

            if (constraint.fk_del_action === 'c') {
              fkBuilder = fkBuilder.onDelete('cascade');
            }
            if (constraint.fk_upd_action === 'c') {
              fkBuilder = fkBuilder.onUpdate('cascade');
            }

            return fkBuilder;
          }
        );
      }

      default:
        return builder;
    }
  }

  convertIndexStmt(indexStmt: any) {
    const indexName = indexStmt.idxname;
    const tableName = indexStmt.relation.relname;
    const unique = indexStmt.unique || false;

    const columns = indexStmt.indexParams?.map((param: any) => {
      if (param.IndexElem) {
        return param.IndexElem.name;
      }
      return null;
    }).filter(Boolean) || [];

    let builder = this.db.schema.createIndex(indexName).on(tableName);

    if (unique) {
      builder = builder.unique();
    }

    for (const col of columns) {
      builder = builder.column(col);
    }

    return builder;
  }
}
