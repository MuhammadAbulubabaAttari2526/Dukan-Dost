import { describe, expect, it } from 'vitest'
import { fromPaisa, toPaisa } from '../src/utils/money.js'
import { allocateDiscountPaisa, returnLineAmountPaisa } from '../src/utils/accounting.js'

describe('money conversion', () => {
  it('converts PKR to integer paisa and back', () => {
    expect(toPaisa(12.34)).toBe(1234)
    expect(fromPaisa(1234)).toBe(12.34)
  })

  describe('transaction accounting allocations', () => {
    it('allocates all discount paisa so saved sale lines equal the sale total', () => {
      const lineTotals = allocateDiscountPaisa([1001, 2003, 3007], 101)
      expect(lineTotals.reduce((sum, value) => sum + value, 0)).toBe(5910)
      expect(lineTotals).toEqual([985, 1970, 2955])
    })

    it('makes sequential partial-return amounts reconcile exactly to the saved line total', () => {
      const first = returnLineAmountPaisa(1001, 0, 1, 3)
      const second = returnLineAmountPaisa(1001, 1, 1, 3)
      const final = returnLineAmountPaisa(1001, 2, 1, 3)
      expect(first + second + final).toBe(1001)
      expect(() => returnLineAmountPaisa(1001, 2, 2, 3)).toThrow()
    })
  })

  it('rejects invalid amounts', () => {
    expect(() => toPaisa(Number.NaN)).toThrow()
    expect(() => toPaisa(-0.01)).toThrow()
  })
})
