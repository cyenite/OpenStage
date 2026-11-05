import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const appDir = join(import.meta.dirname, '../apps/desktop')

async function launch(userData: string) {
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
  await expect(operator.getByRole('button', { name: /Send to live/ })).toBeEnabled()
  return { app, operator, projector, stage }
}

const mainText = (page: Page) => page.locator('.os-slide:last-child .os-box-main')

test('the operator window drives both outputs through the engine', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'openstage-e2e-'))
  let app: ElectronApplication | undefined
  try {
    const session = await launch(userData)
    app = session.app
    const { operator, projector, stage } = session
    expect(readdirSync(join(userData, 'library', 'songs')).sort()).toEqual(['amazing-grace.json', 'it-is-well.json'])

    await expect(projector.locator('.os-background')).toHaveCount(1)
    await expect(projector.locator('.os-slide')).toHaveCount(0)

    await operator.getByRole('button', { name: /Send to live/ }).click()
    await expect(mainText(projector)).toHaveText(/Amazing grace, how sweet the sound/)
    await expect(mainText(stage)).toHaveText(/Amazing grace/)
    await expect(stage.locator('.os-slide:last-child .os-box-next')).toHaveText(/I once was lost/)
    await expect(stage.locator('.os-background')).toHaveCount(0)

    await operator.keyboard.press('ArrowRight')
    await expect(mainText(projector)).toHaveText(/I once was lost/)
    await expect(operator.getByTestId('monitor-live')).toContainText('slide 2')

    await operator.getByRole('button', { name: /John 3:16-17/ }).click()
    await operator.getByTestId('slide-0').dblclick()
    await expect(mainText(projector)).toHaveText(/only begotten Son/)
    await expect(projector.locator('.os-slide:last-child .os-box-secondary')).toHaveText(/one and only Son/)

    await operator.getByRole('tab', { name: 'Lower thirds' }).click()
    await operator.getByRole('button', { name: /\[Pastor name\]/ }).click()
    await expect(projector.locator('.os-lower-third-title')).toHaveText('[Pastor name]')

    await operator.keyboard.press('F2')
    await expect(projector.locator('.os-slide')).toHaveCount(0)
    await expect(stage.locator('.os-slide')).toHaveCount(0)
    await expect(operator.getByTestId('layer-slide')).toContainText('Off')
    await expect(projector.locator('.os-background')).toHaveCount(1)
    await expect(projector.locator('.os-lower-third')).toHaveCount(1)

    await operator.getByRole('button', { name: 'Clear Lower third layer (F3)' }).click()
    await expect(projector.locator('.os-lower-third')).toHaveCount(0)

    await operator.keyboard.press('Escape')
    await expect(projector.locator('.os-background')).toHaveCount(0)
    await expect(operator.locator('.chip-in-sync')).toHaveCount(2)

    await operator.keyboard.press('Space')
    await expect(mainText(projector)).toHaveText(/God sent not his Son/)
    await app.close()
    app = undefined

    const restarted = await launch(userData)
    app = restarted.app
    await expect(mainText(restarted.projector)).toHaveText(/God sent not his Son/)
    await expect(restarted.operator.getByTestId('layer-slide')).toContainText('John 3:16-17')
  } finally {
    await app?.close()
  }
})

test('outputs keep their last frame and reconnect when the engine process dies', async () => {
  test.skip(process.platform !== 'linux', 'finds the engine process with pgrep')
  const { app, operator, projector } = await launch(mkdtempSync(join(tmpdir(), 'openstage-e2e-')))
  try {
    await operator.keyboard.press('Space')
    await expect(mainText(projector)).toHaveText(/Amazing grace/)

    const enginePid = execFileSync('pgrep', ['-P', String(app.process().pid), '-f', 'node.mojom.NodeService']).toString().trim()
    process.kill(Number(enginePid), 'SIGKILL')
    await expect(mainText(projector)).toHaveText(/Amazing grace/)

    await expect(async () => {
      await operator.keyboard.press('ArrowRight')
      await expect(mainText(projector)).toHaveText(/I once was lost/, { timeout: 500 })
    }).toPass({ timeout: 10_000 })
  } finally {
    await app.close()
  }
})
