import type { Device } from './model'

export const devices = (env: Env): Device[] => env.DEVICES
export const tokenName = (id: string) => 'TOKEN_' + id.toUpperCase()
