export interface ParsedScaleBarcode {
  isWeighable: boolean;
  productCode: string;
  embeddedValue: number; // Value in R$ (e.g. 4.50) or weight in kg depending on flag
  rawBarcode: string;
}

/**
 * Parses Brazilian standard weighable barcodes (EAN-13 starting with '2')
 * Standard pattern: 2 CCCCC VVVVV D
 * - Prefix '2': 1 digit
 * - Product code: 5 digits (indexes 1..6)
 * - Value (price or grams): 5 digits (indexes 6..11) / 100
 * - Check digit: index 12
 */
export function parseScaleBarcode(barcode: string): ParsedScaleBarcode {
  const clean = barcode.trim();
  if ((clean.length === 12 || clean.length === 13) && clean.startsWith('2')) {
    const productCode = clean.substring(1, 6);
    const rawValue = parseInt(clean.substring(6, 11), 10);
    const embeddedValue = isNaN(rawValue) ? 0 : rawValue / 100;

    return {
      isWeighable: true,
      productCode,
      embeddedValue,
      rawBarcode: clean,
    };
  }

  return {
    isWeighable: false,
    productCode: clean,
    embeddedValue: 0,
    rawBarcode: clean,
  };
}

export interface CreditLimitResult {
  allowed: boolean;
  currentDebt: number;
  creditLimit: number;
  newDebt: number;
  availableCredit: number;
  exceededBy: number;
}

/**
 * Validates whether a customer can make a purchase using 'Fiado' (Store Credit)
 */
export function checkCustomerCreditLimit(
  currentDebt: number,
  creditLimit: number,
  purchaseAmount: number
): CreditLimitResult {
  const availableCredit = Math.max(0, creditLimit - currentDebt);
  const newDebt = currentDebt + purchaseAmount;
  const allowed = newDebt <= creditLimit;
  const exceededBy = allowed ? 0 : Number((newDebt - creditLimit).toFixed(2));

  return {
    allowed,
    currentDebt,
    creditLimit,
    newDebt,
    availableCredit,
    exceededBy,
  };
}
