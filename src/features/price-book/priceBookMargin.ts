export type PriceBookMargin = {
  grossProfitCents: number;
  grossMarginPercent: number | null;
};

export function derivePriceBookMargin(
  sellingPriceCents: number | null | undefined,
  internalCostCents: number | null | undefined,
): PriceBookMargin | null {
  if (internalCostCents === null || internalCostCents === undefined) return null;
  if (sellingPriceCents === null || sellingPriceCents === undefined) return null;

  const grossProfitCents = sellingPriceCents - internalCostCents;
  return {
    grossProfitCents,
    grossMarginPercent: sellingPriceCents === 0
      ? null
      : (grossProfitCents / sellingPriceCents) * 100,
  };
}

export function formatGrossMarginPercent(value: number | null) {
  if (value === null) return 'Margin unavailable';
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value)}% margin`;
}

export function formatSignedMoney(cents: number) {
  const amount = Math.abs(cents) / 100;
  const formatted = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${cents < 0 ? '-' : ''}$${formatted}`;
}
