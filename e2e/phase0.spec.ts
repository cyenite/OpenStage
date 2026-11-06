import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication } from '@playwright/test'
import { launch, mainText, orderItem, tempUserData } from './app'

test('the operator window drives both outputs through the engine', async () => {
  const userData = tempUserData()
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
    await expect(stage.locator('.os-stage-current')).toHaveText(/Amazing grace/)
    await expect(stage.locator('.os-stage-next-lines')).toHaveText(/I once was lost/)
    await expect(stage.locator('.os-background')).toHaveCount(0)

    await operator.keyboard.press('ArrowRight')
    await expect(mainText(projector)).toHaveText(/I once was lost/)
    await expect(operator.getByTestId('monitor-live')).toContainText('slide 2')

    await orderItem(operator, /^BK John 3:16-17/).click()
    await operator.getByTestId('slide-0').dblclick()
    await expect(mainText(projector)).toHaveText(/only begotten Son/)
    await expect(projector.locator('.os-slide:last-child .os-box-secondary')).toHaveText(/one and only Son/)

    await operator.getByRole('tab', { name: 'Lower thirds' }).click()
    await operator.getByRole('button', { name: /\[Pastor name\]/ }).click()
    await expect(projector.locator('.os-lower-third-title')).toHaveText('[Pastor name]')

    await operator.keyboard.press('F2')
    await expect(projector.locator('.os-slide')).toHaveCount(0)
    await expect(stage.locator('.os-stage-current')).toHaveText('')
    await expect(operator.getByTestId('layer-slide')).toContainText('Off')
    await expect(projector.locator('.os-background')).toHaveCount(1)
    await expect(projector.locator('.os-lower-third')).toHaveCount(1)

    await operator.getByRole('button', { name: 'Clear Lower third layer (F3)' }).click()
    await expect(projector.locator('.os-lower-third')).toHaveCount(0)

    await operator.keyboard.press('Escape')
    await expect(projector.locator('.os-background')).toHaveCount(0)
    await expect(operator.locator('.pill-in-sync')).toHaveCount(2)

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
  const { app, operator, projector } = await launch(tempUserData())
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
