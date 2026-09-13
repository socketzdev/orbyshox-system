import { describe, it, expect } from 'vitest';
import {
  parseScaleBarcode,
  checkCustomerCreditLimit,
} from './barcode-scale';

describe('Supermarket POS Utilities (Scale Barcode & Fiado Limits)', () => {
  it('parses weighable scale barcodes starting with 2 and calculates embedded price', () => {
    // Standard scale barcode: 2 (prefix) + 00123 (code) + 00450 (R$ 4,50) + 9 (check)
    const rawBarcode = '200123004509';
    const parsed = parseScaleBarcode(rawBarcode);

    expect(parsed.isWeighable).toBe(true);
    expect(parsed.productCode).toBe('00123');
    expect(parsed.embeddedValue).toBe(4.5);
  });

  it('detects standard non-weighable retail EAN barcodes', () => {
    const rawBarcode = '7891000100101';
    const parsed = parseScaleBarcode(rawBarcode);

    expect(parsed.isWeighable).toBe(false);
    expect(parsed.productCode).toBe('7891000100101');
    expect(parsed.embeddedValue).toBe(0);
  });

  it('authorizes fiado purchase when customer is within credit limit', () => {
    const currentDebt = 100.0;
    const creditLimit = 300.0;
    const purchaseAmount = 150.0;

    const result = checkCustomerCreditLimit(currentDebt, creditLimit, purchaseAmount);

    expect(result.allowed).toBe(true);
    expect(result.availableCredit).toBe(200.0);
    expect(result.newDebt).toBe(250.0);
    expect(result.exceededBy).toBe(0);
  });

  it('blocks fiado purchase when customer exceeds approved credit limit', () => {
    const currentDebt = 280.0;
    const creditLimit = 300.0;
    const purchaseAmount = 50.0; // New debt = 330.0 -> exceeds by 30.0

    const result = checkCustomerCreditLimit(currentDebt, creditLimit, purchaseAmount);

    expect(result.allowed).toBe(false);
    expect(result.availableCredit).toBe(20.0);
    expect(result.newDebt).toBe(330.0);
    expect(result.exceededBy).toBe(30.0);
  });
});
