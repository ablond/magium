import type { AtomicCondition, ConditionExpression, PrimitiveValue } from './types'

export function evaluateCondition(expression: ConditionExpression, variables: Record<string, PrimitiveValue>): boolean {
  if (!expression) {
    return true
  }
  if (expression.anyOf.length === 0) {
    return false
  }
  return expression.anyOf.some((group) => group.allOf.every((condition) => evaluateAtomic(condition, variables)))
}

function evaluateAtomic(condition: AtomicCondition, variables: Record<string, PrimitiveValue>): boolean {
  if (condition.type === 'true') {
    return true
  }
  if (condition.type === 'false') {
    return false
  }

  const actual = normalizeValue(variables[condition.variable] ?? 0)
  const expected = normalizeValue(condition.value)

  switch (condition.operator) {
    case '<':
      return Number(actual) < Number(expected)
    case '>':
      return Number(actual) > Number(expected)
    case '<=':
      return Number(actual) <= Number(expected)
    case '>=':
      return Number(actual) >= Number(expected)
    case '==':
      return actual == expected
    case '!=':
      return actual != expected
  }
}

function normalizeValue(value: PrimitiveValue): PrimitiveValue {
  if (typeof value === 'string' && /^[-+]?\d+$/.test(value)) {
    return Number(value)
  }
  return value
}
