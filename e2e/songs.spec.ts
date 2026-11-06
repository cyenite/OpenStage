import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication } from '@playwright/test'
import { launch, mainText, orderItem, tempUserData } from './app'

const lyrics = '[Verse 1]\nG       C\nYesu ni wangu\nRafiki yangu\n\n[Kiitikio]\nNitamsifu\n\n[Chorus]\n'

test('a pasted song can be created, added to the service, shown and edited live', async () => {
  const userData = tempUserData()
  let app: ElectronApplication | undefined
  try {
    const session = await launch(userData)
    app = session.app
    const { operator, projector } = session

    await operator.getByRole('tab', { name: 'Edit' }).click()
    await operator.getByRole('button', { name: 'New song' }).first().click()
    const dialog = operator.locator('dialog')
    await dialog.getByRole('textbox', { name: 'Title' }).fill('Yesu ni Wangu')
    await dialog.getByRole('combobox', { name: 'Language' }).selectOption('sw')
    await dialog.locator('textarea').fill(lyrics)
    await expect(dialog.locator('.parse-preview')).toContainText('2 sections · 2 slides')
    await dialog.getByRole('button', { name: 'Create song' }).click()

    await expect(operator.getByRole('textbox', { name: 'Song title' })).toHaveValue('Yesu ni Wangu')
    await expect(operator.getByRole('textbox', { name: 'Verse 1 lyrics' })).toHaveValue('[G]Yesu ni [C]wangu\nRafiki yangu')
    await expect(operator.locator('.song-row', { hasText: 'Yesu ni Wangu' })).toBeVisible()
    await operator.getByRole('button', { name: 'Add to service' }).click()
    await expect(operator.locator('.song-row', { hasText: 'Yesu ni Wangu' })).toContainText('in this service')

    await operator.getByRole('tab', { name: 'Present' }).click()
    await orderItem(operator, /^SG Yesu ni Wangu/).click()
    await operator.getByTestId('slide-0').dblclick()
    await expect(mainText(projector)).toHaveText(/Yesu ni wangu/)

    await operator.getByRole('tab', { name: 'Edit' }).click()
    const verse = operator.getByRole('textbox', { name: 'Verse 1 lyrics' })
    await verse.fill('Yesu ni rafiki\nRafiki yangu')
    await verse.blur()
    await expect(mainText(projector)).toHaveText(/Yesu ni rafiki/)
    await operator.getByRole('button', { name: 'Undo' }).click()
    await expect(mainText(projector)).toHaveText(/Yesu ni wangu/)

    await operator.getByRole('searchbox', { name: 'Search songs or lyrics' }).fill('nitamsifu')
    await expect(operator.locator('.song-row')).toHaveCount(1)
    await expect(operator.locator('.song-row mark')).toHaveText('Nitamsifu')

    expect(readdirSync(join(userData, 'library', 'songs')).filter((name) => name.endsWith('.json'))).toHaveLength(3)
    await app.close()
    app = undefined

    const restarted = await launch(userData)
    app = restarted.app
    await expect(mainText(restarted.projector)).toHaveText(/Yesu ni wangu/)
    await expect(orderItem(restarted.operator, /^SG Yesu ni Wangu/)).toBeVisible()
  } finally {
    await app?.close()
  }
})

test('the title bar is the window frame and switches appearance', async () => {
  const { app, operator } = await launch(tempUserData())
  try {
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((w) => w.webContents.getURL().includes('operator') && w.isMenuBarVisible() === false))).toBe(true)
    await expect(operator.getByRole('button', { name: 'Close window' })).toBeVisible()
    await operator.getByRole('button', { name: 'Dark', exact: true }).click()
    await expect(operator.locator('html')).toHaveAttribute('data-theme', 'dark')
    expect(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('dark')
    await operator.getByRole('button', { name: 'Auto', exact: true }).click()
    await expect(operator.locator('html')).not.toHaveAttribute('data-theme', /./)
    await operator.keyboard.press('Control+k')
    await expect(operator.getByRole('searchbox', { name: 'Search songs or lyrics' })).toBeFocused()
  } finally {
    await app.close()
  }
})
