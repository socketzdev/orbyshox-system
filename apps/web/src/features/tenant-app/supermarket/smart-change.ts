export interface CashBreakdownItem {
  type: 'BILL' | 'COIN';
  valueCents: number;
  count: number;
  label: string;
}

export interface SmartTip {
  askCents: number;
  resultingChangeCents: number;
  explanation: string;
}

export interface SmartChangeResult {
  changeCents: number;
  isExact: boolean;
  isShort: boolean;
  shortCents: number;
  breakdown: CashBreakdownItem[];
  smartTip?: SmartTip;
}

const DENOMINATIONS: { type: 'BILL' | 'COIN'; valueCents: number; label: string }[] = [
  { type: 'BILL', valueCents: 20000, label: 'R$ 200' },
  { type: 'BILL', valueCents: 10000, label: 'R$ 100' },
  { type: 'BILL', valueCents: 5000, label: 'R$ 50' },
  { type: 'BILL', valueCents: 2000, label: 'R$ 20' },
  { type: 'BILL', valueCents: 1000, label: 'R$ 10' },
  { type: 'BILL', valueCents: 500, label: 'R$ 5' },
  { type: 'BILL', valueCents: 200, label: 'R$ 2' },
  { type: 'COIN', valueCents: 100, label: 'R$ 1' },
  { type: 'COIN', valueCents: 50, label: '50¢' },
  { type: 'COIN', valueCents: 25, label: '25¢' },
  { type: 'COIN', valueCents: 10, label: '10¢' },
  { type: 'COIN', valueCents: 5, label: '5¢' },
  { type: 'COIN', valueCents: 1, label: '1¢' },
];

/**
 * Decomposes a change amount in cents into the minimum set of Brazilian bills and coins
 */
export function calculateCashBreakdown(changeCents: number): CashBreakdownItem[] {
  if (changeCents <= 0) return [];

  let remaining = changeCents;
  const breakdown: CashBreakdownItem[] = [];

  for (const denom of DENOMINATIONS) {
    if (remaining >= denom.valueCents) {
      const count = Math.floor(remaining / denom.valueCents);
      remaining = remaining % denom.valueCents;
      breakdown.push({
        type: denom.type,
        valueCents: denom.valueCents,
        count,
        label: denom.label,
      });
    }
    if (remaining === 0) break;
  }

  return breakdown;
}

/**
 * Calculates smart change suggestions and notes/coins decomposition
 */
export function calculateSmartChange(totalCents: number, cashGivenCents: number): SmartChangeResult {
  if (cashGivenCents <= 0) {
    return {
      changeCents: 0,
      isExact: false,
      isShort: false,
      shortCents: 0,
      breakdown: [],
    };
  }

  const diff = cashGivenCents - totalCents;

  if (diff === 0) {
    return {
      changeCents: 0,
      isExact: true,
      isShort: false,
      shortCents: 0,
      breakdown: [],
    };
  }

  if (diff < 0) {
    return {
      changeCents: 0,
      isExact: false,
      isShort: true,
      shortCents: Math.abs(diff),
      breakdown: [],
    };
  }

  const changeCents = diff;
  const breakdown = calculateCashBreakdown(changeCents);

  // Troco Facilitado / Dica inteligente
  let smartTip: SmartTip | undefined = undefined;

  const totalCentsFraction = totalCents % 100;
  const cashGivenFraction = cashGivenCents % 100;

  // Se o cliente pagou com nota inteira e o total tem centavos (ex: total R$ 23,40 e deu R$ 50,00)
  if (cashGivenFraction === 0 && totalCentsFraction > 0) {
    const askCentavos = totalCentsFraction;
    const newChange = changeCents + askCentavos;
    // O novo troco agora é redondo em reais (ex: R$ 27,00)
    smartTip = {
      askCents: askCentavos,
      resultingChangeCents: newChange,
      explanation: `Se o cliente entregar + ${(askCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}, o troco fica redondo em ${(newChange / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (sem moedas pequenas).`,
    };
  } else if (changeCents > 0 && changeCents % 500 !== 0) {
    // Se o troco puder ser facilitado para nota de R$ 5, 10 ou 20
    const extraSmall = changeCents % 1000;
    if (extraSmall > 0 && extraSmall <= 300) {
      const askAmount = 1000 - extraSmall;
      if (askAmount <= 500) {
        const newChange = changeCents + askAmount;
        smartTip = {
          askCents: askAmount,
          resultingChangeCents: newChange,
          explanation: `Peça ${(askAmount / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} para devolver ${(newChange / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} redondo.`,
        };
      }
    }
  }

  return {
    changeCents,
    isExact: false,
    isShort: false,
    shortCents: 0,
    breakdown,
    smartTip,
  };
}

/**
 * Generates quick banknote preset options based on total
 */
export function getQuickCashPresets(totalCents: number): { label: string; amount: number; isExact?: boolean }[] {
  if (totalCents <= 0) return [];

  const total = totalCents / 100;
  const presets: { label: string; amount: number; isExact?: boolean }[] = [];

  // 1. Exact amount
  presets.push({
    label: `Exato (${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`,
    amount: total,
    isExact: true,
  });

  // 2. Next nearest rounded bank values
  const roundedOptions = [
    Math.ceil(total / 5) * 5,
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 20) * 20,
    Math.ceil(total / 50) * 50,
    Math.ceil(total / 100) * 100,
    100,
    200,
  ];

  const uniqueHigher = Array.from(new Set(roundedOptions))
    .filter((val) => val > total)
    .sort((a, b) => a - b)
    .slice(0, 4);

  for (const val of uniqueHigher) {
    presets.push({
      label: `R$ ${val.toFixed(2).replace('.', ',')}`,
      amount: val,
    });
  }

  return presets;
}
