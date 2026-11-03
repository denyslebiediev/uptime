import { devices, tokenName } from './config'

const sha256 = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))

// Spec §7: constant time, so every device is checked and the loop never exits early.
export async function authDevice(header: string | null, env: Env): Promise<string | null> {
  const got = await sha256(header ?? '')
  let device: string | null = null
  for (const { id } of devices(env)) {
    const secret = (env as unknown as Record<string, unknown>)[tokenName(id)]
    // an unset or empty secret costs the same and never matches
    const want = await sha256('Bearer ' + (typeof secret === 'string' && secret ? secret : crypto.randomUUID()))
    if (crypto.subtle.timingSafeEqual(got, want)) device = id
  }
  return device
}
