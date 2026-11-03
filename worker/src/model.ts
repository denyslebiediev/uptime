export type Shutdown = 'none' | 'reboot' | 'poweroff'
export type Kind = 'power_off' | 'no_connection' | 'reboot' | 'device_off' | 'no_signal'
export type Flag = 'provisional' | 'connecting' | 'after_shutdown' | 'stale'
export type LiveState = 'on' | 'no_signal' | 'rebooting' | 'device_off' | 'unknown'
export interface Span { id: number; device: string; boot_id: string; boot_at: number; first_seen: number; last_seen: number; alive_until: number | null; shutdown: Shutdown }
export interface Interval { device: string; kind: Kind; start: number; end: number | null; flags: Flag[] }
export interface Live { state: LiveState; since: number | null; seen: number | null; flags: Flag[] }
export interface Heartbeat { boot: string; up: number; ev?: 'reboot' | 'poweroff'; pb?: string; pu?: number; pc?: Shutdown }
export interface Device { id: string; name: { uk: string; en: string }; short: { uk: string; en: string } }
export interface StatusDevice extends Device, Live { today: [number, number | null, Kind][] }   // intervals clipped to [day.start, day.end]
export interface StatusBody { now: number; day: { start: number; end: number }; devices: StatusDevice[] }
export interface EventsDevice extends Device, Live { first_seen: number | null }
export interface EventsBody { now: number; from: number; to: number; devices: EventsDevice[]; iv: [string, Kind, number, number | null, Flag[]][] } // iv rows: [device, kind, start, end, flags], unclipped, sorted by start
export const GAP = 120, WRITE_CAP = 10, REBOOT_WINDOW = 600, STALE_AFTER = 86_400, STALE_TOLERANCE = 30, MAX_BODY = 512, UP_MAX = 3.2e8
export const EVENTS_DEFAULT_DAYS = 35, EVENTS_MAX_DAYS = 400
