import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication } from '@playwright/test'
import { background, launch, mainText, tempUserData } from './app'

test('a song takes a theme, and editing the theme updates the live screen', async () => {
  const userData = tempUserData()
  let app: ElectronApplication | undefined
  try {
    const session = await launch(userData)
    app = session.app
    const { operator, projector } = session
    expect(readdirSync(join(userData, 'library', 'themes'))).toContain('paper.json')

    await operator.keyboard.press('Space')
    await expect(mainText(projector)).toHaveText(/Amazing grace/)
    await expect(projector.locator('.os-slide:last-child')).not.toHaveAttribute('style', /background/)
    await expect(background(projector)).toHaveCSS('background-image', /linear-gradient/)

    await operator.getByRole('tab', { name: 'Edit' }).click()
    await operator.getByRole('button', { name: /Amazing Grace/ }).click()
    await operator.getByRole('button', { name: 'Paper theme' }).click()
    await expect(background(projector)).toHaveAttribute('style', /background: rgb\(244, 239, 230\)/)
    await expect(projector.locator('.os-slide:last-child .os-box-main')).toHaveCSS('color', 'rgb(26, 26, 26)')
    await expect(projector.locator('.os-slide:last-child .os-box-main')).toHaveCSS('font-family', /Newsreader Variable/)

    await operator.getByRole('button', { name: /Edit “Paper”/ }).click()
    await expect(operator.getByRole('textbox', { name: 'Theme name' })).toHaveValue('Paper')
    const size = operator.getByRole('spinbutton', { name: 'Text size as a percentage of screen height' })
    await size.fill('5')
    await size.blur()
    await operator.getByRole('radio', { name: 'Left' }).click()
    await expect(projector.locator('.os-slide:last-child .os-box-main')).toHaveCSS('text-align', 'left')
    await expect(operator.locator('.theme-preview .os-box-main')).toHaveCSS('text-align', 'left')
    await operator.getByRole('button', { name: 'Undo' }).click()
    await expect(projector.locator('.os-slide:last-child .os-box-main')).toHaveCSS('text-align', 'center')
    await expect(operator.getByRole('button', { name: 'Delete' })).toBeDisabled()

    await app.close()
    app = undefined
    const restarted = await launch(userData)
    app = restarted.app
    await expect(background(restarted.projector)).toHaveAttribute('style', /background: rgb\(244, 239, 230\)/)
  } finally {
    await app?.close()
  }
})
