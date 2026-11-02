export function allocateDiscountPaisa(grossLines: number[], discountPaisa: number): number[] {
  const subtotal = grossLines.reduce((sum, amount) => sum + amount, 0)
  if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(discountPaisa) || discountPaisa < 0 || discountPaisa > subtotal) {
    throw new RangeError('Discount must be a non-negative integer within the subtotal')
  }
  if (grossLines.some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
    throw new RangeError('Line totals must be non-negative integer paisa')
  }
  let allocated = 0
  return grossLines.map((gross, index) => {
    const lineDiscount = index === grossLines.length - 1
      ? discountPaisa - allocated
      : subtotal === 0 ? 0 : Number(BigInt(discountPaisa) * BigInt(gross) / BigInt(subtotal))
    allocated += lineDiscount
    return gross - lineDiscount
  })
}

export function returnLineAmountPaisa(lineTotal: number, quantityBefore: number, quantityReturned: number, quantitySold: number): number {
  if (![lineTotal, quantityBefore, quantityReturned, quantitySold].every(Number.isSafeInteger)
    || lineTotal < 0 || quantityBefore < 0 || quantityReturned <= 0 || quantitySold <= 0
    || quantityBefore + quantityReturned > quantitySold) {
    throw new RangeError('Return quantity must be within the sold quantity')
  }
  const roundRatio = (quantity: number) => Number(
    (BigInt(lineTotal) * BigInt(quantity) + BigInt(quantitySold) / 2n) / BigInt(quantitySold),
  )
  const before = roundRatio(quantityBefore)
  const after = roundRatio(quantityBefore + quantityReturned)
  return after - before
}
