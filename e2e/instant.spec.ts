import { expect, test } from '@playwright/test'
import { launch, mainText, orderItem, tempUserData } from './app'

process.env['OPENSTAGE_OFFLINE'] = '1'

test('songs and verses open in the slide grid from the Library, show with one click, and join the service only on request', async () => {
  const { app, operator, projector } = await launch(tempUserData())
  try {
    const order = operator.getByRole('navigation', { name: 'Service order' }).locator('.order-name')
    const grid = operator.getByRole('region', { name: 'Slides' })
    const verse = (n: number) => operator.getByRole('list', { name: 'Verses' }).getByRole('button', { name: `Verse ${n}` })
    await expect(order).toHaveCount(3)

    await operator.getByRole('tab', { name: 'Songs' }).click()
    await operator.getByRole('list', { name: 'Songs' }).getByRole('button', { name: /It Is Well/ }).click()
    await expect(grid.locator('.show-head')).toContainText('From library')
    await expect(projector.locator('.os-slide')).toHaveCount(0)
    await grid.getByTestId('slide-1').click()
    await expect(mainText(projector)).toHaveText(/Whatever my lot/)
    await expect(grid.getByTestId('slide-1')).toContainText('LIVE')
    await operator.keyboard.press('ArrowRight')
    await expect(mainText(projector)).not.toHaveText(/Whatever my lot/)
    await operator.keyboard.press('c')
    await expect(grid.locator('.jump-chip.is-current')).toContainText('Chorus')
    await expect(order).toHaveCount(3)

    await operator.getByRole('tab', { name: 'Bible' }).click()
    await operator.getByRole('combobox', { name: 'Bible version', exact: true }).selectOption('KJV')
    await operator.getByRole('combobox', { name: 'Second Bible version' }).selectOption('WEB')
    const reference = operator.getByRole('textbox', { name: 'Go to reference' })
    await reference.fill('jn 3 16')
    await reference.press('Enter')
    await expect(grid.locator('.show-head')).toContainText('John 3')
    await expect(mainText(projector)).not.toHaveText(/For God so loved/)
    await verse(17).dblclick()
    await expect(mainText(projector)).toHaveText(/God sent not his Son into the world/)
    await expect(verse(17)).toContainText('LIVE')
    await expect(order).toHaveCount(3)

    await verse(16).click()
    await verse(18).click({ modifiers: ['Shift'] })
    await operator.getByRole('button', { name: /Add John 3:16-18 to the service/ }).click()
    await expect(orderItem(operator, /^BK John 3:16-18/)).toBeVisible()
    await expect(order).toHaveCount(4)

    await operator.getByRole('button', { name: /Manage versions/ }).click()
    const versions = operator.getByRole('dialog', { name: 'Bible versions' })
    await expect(versions.locator('.version-row', { hasText: 'King James' })).toContainText('Included')
    await expect(versions).toContainText('The catalogue is not available.')
    await versions.getByRole('button', { name: 'Done' }).click()
    await expect(versions).toHaveCount(0)
    await expect(mainText(projector)).toHaveText(/God sent not his Son/)

    await operator.getByRole('tab', { name: 'Songs' }).click()
    await operator.getByRole('searchbox', { name: 'Search songs and lyrics' }).fill('abide with me')
    await expect(operator.getByRole('list', { name: 'Songs' }).getByRole('button', { name: /^Abide With Me/ })).toBeVisible()
    await operator.getByRole('button', { name: 'Get more songs…' }).click()
    const getSongs = operator.getByRole('dialog', { name: 'Get songs' })
    await expect(getSongs).toContainText('The song catalogue is not available.')
    await expect(getSongs.getByRole('button', { name: /^Import/ })).toBeDisabled()
    await getSongs.getByRole('button', { name: 'Cancel' }).click()
    await expect(getSongs).toHaveCount(0)
  } finally {
    await app.close()
  }
})
