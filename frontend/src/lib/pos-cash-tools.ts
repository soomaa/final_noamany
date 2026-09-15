export type CashSettlementStatus = 'empty' | 'short' | 'exact' | 'change';

export interface CashSettlement {
  tenderedCents: number;
  totalCents: number;
  changeCents: number;
  remainingCents: number;
  status: CashSettlementStatus;
}

export type CalculatorKey =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | '.' | '+' | '-' | '×' | '÷' | '='
  | 'clear' | 'backspace' | 'sign';

export interface CalculatorState {
  display: string;
  storedValue: number | null;
  pendingOperator: '+' | '-' | '×' | '÷' | null;
  replaceDisplay: boolean;
}

const calculatorOperators = ['+', '-', '×', '÷'] as const;

function moneyCents(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}

function formatCalculatorNumber(value: number): string {
  if (!Number.isFinite(value)) return 'Error';
  return String(Number(value.toFixed(10)));
}

function calculate(left: number, right: number, operator: NonNullable<CalculatorState['pendingOperator']>): number {
  if (operator === '+') return left + right;
  if (operator === '-') return left - right;
  if (operator === '×') return left * right;
  return right === 0 ? Number.NaN : left / right;
}

export function calculateCashSettlement(total: number, tendered: string): CashSettlement {
  const totalCents = moneyCents(total);
  const normalizedTendered = tendered.trim();
  const tenderedValue = Number(normalizedTendered);
  const hasTendered = normalizedTendered.length > 0 && Number.isFinite(tenderedValue) && tenderedValue >= 0;
  const tenderedCents = hasTendered ? moneyCents(tenderedValue) : 0;

  if (!hasTendered) {
    return { tenderedCents, totalCents, changeCents: 0, remainingCents: totalCents, status: 'empty' };
  }

  const difference = tenderedCents - totalCents;
  return {
    tenderedCents,
    totalCents,
    changeCents: Math.max(0, difference),
    remainingCents: Math.max(0, -difference),
    status: difference > 0 ? 'change' : difference < 0 ? 'short' : 'exact',
  };
}

export function createCalculatorState(): CalculatorState {
  return {
    display: '0',
    storedValue: null,
    pendingOperator: null,
    replaceDisplay: true,
  };
}

export function pressCalculatorKey(state: CalculatorState, key: CalculatorKey): CalculatorState {
  if (key === 'clear') return createCalculatorState();

  const isDigit = key >= '0' && key <= '9';
  if (state.display === 'Error') {
    return isDigit
      ? { ...createCalculatorState(), display: key, replaceDisplay: false }
      : createCalculatorState();
  }

  if (isDigit) {
    const display = state.replaceDisplay || state.display === '0'
      ? key
      : `${state.display}${key}`;
    return { ...state, display, replaceDisplay: false };
  }

  if (key === '.') {
    if (state.replaceDisplay) return { ...state, display: '0.', replaceDisplay: false };
    if (state.display.includes('.')) return state;
    return { ...state, display: `${state.display}.`, replaceDisplay: false };
  }

  if (key === 'backspace') {
    if (state.replaceDisplay) return state;
    const display = state.display.length > 1 ? state.display.slice(0, -1) : '0';
    return { ...state, display: display === '-' ? '0' : display };
  }

  if (key === 'sign') {
    if (state.display === '0') return state;
    return {
      ...state,
      display: state.display.startsWith('-') ? state.display.slice(1) : `-${state.display}`,
      replaceDisplay: false,
    };
  }

  const currentValue = Number(state.display);

  if (calculatorOperators.includes(key as (typeof calculatorOperators)[number])) {
    const operator = key as NonNullable<CalculatorState['pendingOperator']>;
    if (state.pendingOperator && state.storedValue != null && !state.replaceDisplay) {
      const result = calculate(state.storedValue, currentValue, state.pendingOperator);
      return {
        display: formatCalculatorNumber(result),
        storedValue: Number.isFinite(result) ? result : null,
        pendingOperator: Number.isFinite(result) ? operator : null,
        replaceDisplay: true,
      };
    }
    return {
      ...state,
      storedValue: state.storedValue != null && state.replaceDisplay ? state.storedValue : currentValue,
      pendingOperator: operator,
      replaceDisplay: true,
    };
  }

  if (key === '=' && state.pendingOperator && state.storedValue != null) {
    const result = calculate(state.storedValue, currentValue, state.pendingOperator);
    return {
      display: formatCalculatorNumber(result),
      storedValue: null,
      pendingOperator: null,
      replaceDisplay: true,
    };
  }

  return state;
}
