import { expect, it } from 'vitest'
import { validate } from '../src/validate'

const U = '0b5e7c3a-1f2d-4e6b-9a8c-7d1e2f3a4b5c'
const P = 'c4d3e2f1-a0b9-4c8d-8e7f-6a5b4c3d2e1f'
const report = { boot: U, up: 1, pb: P, pu: 1, pc: 'none' }
const j = (o: object) => JSON.stringify(o)

it('keeps known fields and drops ts and device (rule 1)', () => {
  expect(validate(j({ boot: U, up: 12.5, ts: 1, device: 'rayduzhna' }))).toEqual({ boot: U, up: 12.5 })
})
it('accepts a shutdown marker with a full previous-boot report at the limits', () => {
  const hb = { boot: U, up: 0, ev: 'poweroff', pb: P, pu: 3.2e8, pc: 'reboot' }
  expect(validate(j(hb))).toEqual(hb)
})
it.each([
  ['not JSON', 'nope'],
  ['an array', '[]'],
  ['null', 'null'],
  ['an uppercase boot', j({ boot: U.toUpperCase(), up: 1 })],
  ['a missing up', j({ boot: U })],
  ['a negative up', j({ boot: U, up: -1 })],
  ['an up over 3.2e8', j({ boot: U, up: 320000001 })],
  ['a string up', j({ boot: U, up: '5' })],
  ['an infinite up', `{"boot":"${U}","up":1e309}`],
  ['an unknown ev', j({ boot: U, up: 1, ev: 'shutdown' })],
  ['pb without pu and pc', j({ boot: U, up: 1, pb: P })],
  ['a bad pb', j({ ...report, pb: 'not-a-uuid' })],
  ['a negative pu', j({ ...report, pu: -1 })],
  ['an unknown pc', j({ ...report, pc: 'maybe' })],
])('rejects %s', (_, raw) => {
  expect(validate(raw)).toBeNull()
})
