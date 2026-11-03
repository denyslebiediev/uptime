import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

const tokens = { TOKEN_CENTRALNA: 'test-centralna', TOKEN_RAYDUZHNA: 'test-rayduzhna' }
// wrangler checks secrets.required only against .dev.vars, .env and process.env, and warns otherwise
Object.assign(process.env, tokens)

export default defineConfig(async () => ({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations'), ...tokens } },
    }),
  ],
  test: { setupFiles: ['./test/setup.ts'] },
}))
