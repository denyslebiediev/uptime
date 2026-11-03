import { expect, it } from 'vitest'
import { kyivDayBounds } from '../src/kyiv'

const u = (y: number, m: number, d: number, h: number) => Date.UTC(y, m, d, h) / 1000

it('normal day', () => {
  expect(kyivDayBounds(u(2026, 10, 3, 10))).toEqual({ start: u(2026, 10, 2, 22), end: u(2026, 10, 3, 22) })
})
it('2026-03-29 is 23 h', () => {
  expect(kyivDayBounds(u(2026, 2, 29, 12))).toEqual({ start: u(2026, 2, 28, 22), end: u(2026, 2, 29, 21) })
})
it('2026-10-25 is 25 h', () => {
  expect(kyivDayBounds(u(2026, 9, 25, 12))).toEqual({ start: u(2026, 9, 24, 21), end: u(2026, 9, 25, 22) })
})
it('midnight starts the new day', () => {
  expect(kyivDayBounds(u(2026, 10, 2, 22)).start).toBe(u(2026, 10, 2, 22))
  expect(kyivDayBounds(u(2026, 10, 2, 22) - 1).end).toBe(u(2026, 10, 2, 22))
})
