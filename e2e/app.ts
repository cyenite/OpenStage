import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, type Page } from '@playwright/test'

const appDir = join(import.meta.dirname, '../apps/desktop')

export const tempUserData = () => mkdtempSync(join(tmpdir(), 'openstage-e2e-'))

export async function launch(userData: string) {
  const app = await electron.launch({
    args: [appDir, ...(process.env['OPENSTAGE_NO_SANDBOX'] ? ['--no-sandbox'] : [])],
    env: { ...process.env, OPENSTAGE_USER_DATA: userData, OPENSTAGE_WINDOWED_OUTPUTS: '1' },
  })
  const find = async (fragment: string) => {
    await expect.poll(() => app.windows().some((w) => w.url().includes(fragment)), { timeout: 15_000 }).toBe(true)
    return app.windows().find((w) => w.url().includes(fragment))!
  }
  const operator = await find('operator.html')
  const projector = await find('output=projector')
  const stage = await find('output=stage')
  await expect(operator.locator('.titlebar:not(.titlebar-empty)')).toBeVisible({ timeout: 15_000 })
  return { app, operator, projector, stage }
}

export const mainText = (page: Page) => page.locator('.os-slide:last-child .os-box-main')

/** A service order item, looked up inside the sidebar so the inspector's "Up next" card never matches. */
export const orderItem = (page: Page, name: RegExp) => page.getByRole('navigation', { name: 'Service order' }).getByRole('button', { name })
