import { env } from 'cloudflare:workers'
import { expect, it } from 'vitest'

it('creates span with the spec columns and defaults', async () => {
  const { results } = await env.DB.prepare('PRAGMA table_info(span)').all<{ name: string }>()
  expect(results.map(r => r.name)).toEqual(['id', 'device', 'boot_id', 'boot_at', 'first_seen', 'last_seen', 'alive_until', 'shutdown'])
  await env.DB.prepare("INSERT INTO span (device, boot_id, boot_at, first_seen, last_seen) VALUES ('centralna', 'b', 1, 2, 3)").run()
  expect(await env.DB.prepare('SELECT alive_until, shutdown FROM span').first()).toEqual({ alive_until: null, shutdown: 'none' })
})
it('has only the (device, id) index', async () => {
  const { results } = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'span'").all<{ sql: string }>()
  expect(results.map(r => r.sql)).toEqual(['CREATE INDEX span_device_id ON span(device, id)'])
})
