import { HttpError } from './http.js'

export function toPaisa(amountPkr: number): number {
  if (!Number.isFinite(amountPkr) || amountPkr < 0) throw new HttpError(422, 'INVALID_AMOUNT', 'Amount must be a non-negative finite number')
  const paisa = Math.round((amountPkr + Number.EPSILON) * 100)
  if (!Number.isSafeInteger(paisa)) throw new HttpError(422, 'INVALID_AMOUNT', 'Amount exceeds the supported range')
  return paisa
}

export function fromPaisa(amountPaisa: number): number {
  if (!Number.isSafeInteger(amountPaisa)) throw new HttpError(500, 'INVALID_STORED_AMOUNT', 'Stored money value is invalid')
  return amountPaisa / 100
}

export function addPaisa(...values: number[]): number {
  const total = values.reduce((sum, value) => sum + value, 0)
  if (!Number.isSafeInteger(total)) throw new HttpError(422, 'INVALID_AMOUNT', 'Amount exceeds the supported range')
  return total
}
