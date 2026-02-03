export interface ValidationRules {
  minimum?: number;
  maximum?: number;
  enum?: any[];
  pattern?: string;
}

function unwrapExpr(expr: any): any {
  // Unwrap common wrapper nodes
  if (expr?.A_Expr) return expr.A_Expr;
  if (expr?.BoolExpr) return expr.BoolExpr;
  if (expr?.List?.items) return expr.List.items;
  return expr;
}

function unwrapBoolArgs(expr: any): any[] {
  if (expr?.boolop && expr?.args) {
    return expr.args.map(unwrapExpr);
  }
  return [];
}

function extractColumnRef(node: any): string | null {
  if (node?.ColumnRef?.fields) {
    const field = node.ColumnRef.fields[0];
    return field?.String?.sval || null;
  }
  return null;
}

function extractConstValue(node: any): any {
  if (node?.A_Const) {
    const c = node.A_Const;

    // Integer value
    if (c.ival !== undefined) {
      if (c.ival.ival !== undefined) return c.ival.ival;
      if (typeof c.ival === 'number') return c.ival;
      // Empty object means 0
      if (typeof c.ival === 'object' && Object.keys(c.ival).length === 0) return 0;
    }

    // Float value
    if (c.fval !== undefined) {
      if (c.fval.fval !== undefined) return parseFloat(c.fval.fval);
      if (typeof c.fval === 'string') return parseFloat(c.fval);
      if (typeof c.fval === 'number') return c.fval;
    }

    // String value
    if (c.sval !== undefined) {
      if (c.sval.sval !== undefined) return c.sval.sval;
      if (typeof c.sval === 'string') return c.sval;
    }

    // Boolean value
    if (c.boolval !== undefined) {
      if (c.boolval.boolval !== undefined) return c.boolval.boolval;
      if (typeof c.boolval === 'boolean') return c.boolval;
    }
  }
  return null;
}

function getOperatorName(expr: any): string | null {
  if (expr?.name && Array.isArray(expr.name) && expr.name[0]?.String?.sval) {
    return expr.name[0].String.sval;
  }
  return expr?.kind || null;
}

function isRangeCheck(expr: any, colName: string): boolean {
  expr = unwrapExpr(expr);

  const op = getOperatorName(expr);

  // Check for >= or <= operators
  if (op === '>=' || op === '<=' || op === '>' || op === '<') {
    const leftCol = extractColumnRef(expr.lexpr);
    return leftCol === colName;
  }

  // Check for BETWEEN or AND expression with range checks
  if (expr?.boolop === 'AND_EXPR') {
    return true; // Simplified detection
  }

  return false;
}

function extractMin(expr: any): number | undefined {
  expr = unwrapExpr(expr);

  const op = getOperatorName(expr);

  if (op === '>=' || op === '>') {
    const val = extractConstValue(expr.rexpr);
    if (typeof val === 'number') {
      return op === '>' ? val + 1 : val;
    }
  }

  // AND expression handling (age >= 0 AND age <= 150)
  if (expr?.boolop === 'AND_EXPR') {
    const args = unwrapBoolArgs(expr);
    for (const arg of args) {
      const argOp = getOperatorName(arg);
      if (argOp === '>=' || argOp === '>') {
        const val = extractConstValue(arg.rexpr);
        if (typeof val === 'number') {
          return argOp === '>' ? val + 1 : val;
        }
      }
    }
  }

  return undefined;
}

function extractMax(expr: any): number | undefined {
  expr = unwrapExpr(expr);

  const op = getOperatorName(expr);

  if (op === '<=' || op === '<') {
    const val = extractConstValue(expr.rexpr);
    if (typeof val === 'number') {
      return op === '<' ? val - 1 : val;
    }
  }

  // AND expression handling (age >= 0 AND age <= 150)
  if (expr?.boolop === 'AND_EXPR') {
    const args = unwrapBoolArgs(expr);
    for (const arg of args) {
      const argOp = getOperatorName(arg);
      if (argOp === '<=' || argOp === '<') {
        const val = extractConstValue(arg.rexpr);
        if (typeof val === 'number') {
          return argOp === '<' ? val - 1 : val;
        }
      }
    }
  }

  return undefined;
}

function isEnumCheck(expr: any, colName: string): boolean {
  expr = unwrapExpr(expr);

  // Check for IN operator: kind: "AEXPR_IN"
  if (expr?.kind === 'AEXPR_IN' && expr?.rexpr?.List) {
    const leftCol = extractColumnRef(expr.lexpr);
    return leftCol === colName;
  }

  // Check for OR chain: col = 'a' OR col = 'b' OR col = 'c'
  if (expr?.boolop === 'OR_EXPR') {
    return true; // Simplified detection
  }

  return false;
}

function extractValues(expr: any): any[] {
  expr = unwrapExpr(expr);
  const values: any[] = [];

  // IN operator with list: kind: "AEXPR_IN"
  if (expr?.kind === 'AEXPR_IN' && expr?.rexpr?.List?.items) {
    for (const item of expr.rexpr.List.items) {
      const val = extractConstValue(item);
      if (val !== null) values.push(val);
    }
  }

  // OR chain
  if (expr?.boolop === 'OR_EXPR' && expr?.args) {
    for (const arg of expr.args) {
      const unwrapped = unwrapExpr(arg);
      const op = getOperatorName(unwrapped);
      if (op === '=') {
        const val = extractConstValue(unwrapped.rexpr);
        if (val !== null) values.push(val);
      }
    }
  }

  return values;
}

function isPatternCheck(expr: any, colName: string): boolean {
  expr = unwrapExpr(expr);

  const op = getOperatorName(expr);

  // Check for ~ (regex match) operator
  if (op === '~') {
    const leftCol = extractColumnRef(expr.lexpr);
    return leftCol === colName;
  }

  return false;
}

function extractPattern(expr: any): string | undefined {
  expr = unwrapExpr(expr);

  const op = getOperatorName(expr);

  if (op === '~') {
    const pattern = extractConstValue(expr.rexpr);
    if (typeof pattern === 'string') return pattern;
  }

  return undefined;
}

export function analyzeCheck(expr: any, colName: string): ValidationRules | null {
  // Try range check first (age >= 18, age BETWEEN 0 AND 150)
  if (isRangeCheck(expr, colName)) {
    const rules: ValidationRules = {};
    const min = extractMin(expr);
    const max = extractMax(expr);

    if (min !== undefined) rules.minimum = min;
    if (max !== undefined) rules.maximum = max;

    if (Object.keys(rules).length > 0) return rules;
  }

  // Try enum check (status IN ('pending', 'completed'))
  if (isEnumCheck(expr, colName)) {
    const values = extractValues(expr);
    if (values.length > 0) {
      return { enum: values };
    }
  }

  // Try pattern check (email ~ '^[a-z]+@')
  if (isPatternCheck(expr, colName)) {
    const pattern = extractPattern(expr);
    if (pattern) {
      return { pattern };
    }
  }

  // Complex check that can't be expressed naturally
  return null;
}
