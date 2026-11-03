import { expect, it } from 'vitest'
import { derive, live } from '../src/derive'
import type { Flag, Kind, Span } from '../src/model'

const T = 1_800_000_000
const sp = (p: Partial<Span> = {}): Span => ({ id: 1, device: 'centralna', boot_id: 'a', boot_at: T - 3600, first_seen: T - 3600, last_seen: T, alive_until: null, shutdown: 'none', ...p })
const B = (p: Partial<Span> = {}) => sp({ id: 2, boot_id: 'b', boot_at: T + 1800, first_seen: T + 1860, last_seen: T + 1900, ...p })
const iv = (kind: Kind, start: number, end: number | null, flags: Flag[] = []) => ({ device: 'centralna', kind, start, end, flags })
const at = T + 1900
const conn = iv('no_connection', T + 1800, T + 1860, ['connecting'])

it('same boot after a gap → no_connection only', () => {
  expect(derive([sp(), B({ boot_id: 'a', boot_at: T - 3600 })], at)).toEqual([iv('no_connection', T, T + 1860)])
})
it('new boot → power_off up to kernel start, then connecting', () => {
  expect(derive([sp(), B()], at)).toEqual([iv('power_off', T, T + 1800), conn])
})
it('alive_until: internet died first, power later', () => {
  expect(derive([sp({ alive_until: T + 600 }), B()], at)).toEqual([iv('no_connection', T, T + 600), iv('power_off', T + 600, T + 1800), conn])
})
it('reboot marker and back − gone = 600 → reboot', () => {
  expect(derive([sp({ shutdown: 'reboot' }), B({ boot_at: T + 600, first_seen: T + 600 })], at)).toEqual([iv('reboot', T, T + 600)])
})
it('reboot marker and back − gone = 601 → power_off after_shutdown', () => {
  expect(derive([sp({ shutdown: 'reboot' }), B({ boot_at: T + 601, first_seen: T + 601 })], at)).toEqual([iv('power_off', T, T + 601, ['after_shutdown'])])
})
it('poweroff marker → device_off', () => {
  expect(derive([sp({ shutdown: 'poweroff' }), B()], at)).toEqual([iv('device_off', T, T + 1800), conn])
})
it('a boot change always yields an interval (rule 7), back clamped to A.last_seen', () => {
  expect(derive([sp(), B({ boot_at: T - 20, first_seen: T + 30 })], at)).toEqual([iv('power_off', T, T), iv('no_connection', T, T + 30, ['connecting'])])
})
it('alive_until before A.last_seen is ignored', () => {
  expect(derive([sp({ alive_until: T - 500 }), B()], at)).toEqual([iv('power_off', T, T + 1800), conn])
})
it('alive_until after back is clamped to back', () => {
  expect(derive([sp({ alive_until: T + 5000 }), B()], at)).toEqual([iv('no_connection', T, T + 1800), iv('power_off', T + 1800, T + 1800), conn])
})
it('live([]) is unknown with nulls', () => {
  expect(live([], T)).toEqual({ state: 'unknown', since: null, seen: null, flags: [] })
  expect(derive([], T)).toEqual([])
})
it('on while now − last_seen ≤ 120, since boot_at', () => {
  expect(live([sp()], T + 120)).toEqual({ state: 'on', since: T - 3600, seen: T, flags: [] })
  expect(derive([sp()], T + 120)).toEqual([])
})
it('on wins over a fresh reboot marker', () => {
  expect(live([sp({ shutdown: 'reboot' })], T + 60).state).toEqual('on')
})
it('no_signal after 120 s is an open provisional interval', () => {
  expect(live([sp()], T + 121)).toEqual({ state: 'no_signal', since: T, seen: T, flags: [] })
  expect(derive([sp()], T + 121)).toEqual([iv('no_signal', T, null, ['provisional'])])
})
it('rebooting up to 600 s after a reboot marker', () => {
  const R = [sp({ shutdown: 'reboot' })]
  expect(live(R, T + 600)).toEqual({ state: 'rebooting', since: T, seen: T, flags: [] })
  expect(derive(R, T + 600)).toEqual([iv('reboot', T, null)])
  expect(live(R, T + 601).state).toEqual('no_signal')
})
it('poweroff marker → device_off, never stale', () => {
  const O = [sp({ shutdown: 'poweroff' })]
  expect(live(O, T + 90_000)).toEqual({ state: 'device_off', since: T, seen: T, flags: [] })
  expect(derive(O, T + 90_000)).toEqual([iv('device_off', T, null)])
})
it('stale only after more than 24 h', () => {
  expect(live([sp()], T + 86_400).flags).toEqual([])
  expect(live([sp()], T + 86_401).flags).toEqual(['stale'])
  expect(derive([sp()], T + 86_401)).toEqual([iv('no_signal', T, null, ['provisional', 'stale'])])
})
