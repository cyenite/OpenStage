import { expect, test } from '@playwright/test'
import { launch, mainText, orderItem, tempUserData } from './app'

test('a typed reference and passage sets use the bundled Bibles', async () => {
  const { app, operator, projector } = await launch(tempUserData())
  try {
    await operator.keyboard.press('Control+k')
    const search = operator.getByRole('textbox', { name: 'Search everything to add' })
    await search.fill('ps 23 1')
    await expect(operator.locator('.quick-add-row').first()).toContainText('Psalms 23:1')
    await search.press('Enter')
    await expect(orderItem(operator, /^BK Psalms 23:1/)).toBeVisible()
    await operator.keyboard.press('Space')
    await expect(mainText(projector)).toHaveText(/The LORD is my shepherd/)

    await operator.getByRole('tab', { name: 'Edit' }).click()
    await operator.getByRole('tab', { name: 'Scripture' }).click()
    const reference = operator.getByRole('textbox', { name: 'New passage reference' })
    await reference.fill('Yohana 3:16-17')
    await expect(operator.locator('.reference-hint')).toContainText('John 3:16-17')
    await reference.press('Enter')
    await expect(operator.locator('.passage-title')).toHaveText('John 3:16-17')
    await expect(operator.locator('.verse-row')).toHaveCount(2)
    await expect(operator.locator('.verse-main').first()).toContainText('For God so loved the world')

    await operator.getByRole('combobox', { name: 'Add a translation' }).selectOption('BSB')
    await expect(operator.locator('.verse-secondary').first()).toContainText('one and only Son')
    await operator.getByRole('radio', { name: '2' }).click()
    await expect(operator.locator('.verse-row')).toHaveCount(1)
    await operator.getByRole('button', { name: 'Undo' }).click()
    await expect(operator.locator('.verse-row')).toHaveCount(2)

    await operator.getByRole('textbox', { name: 'Change the passage' }).fill('esther 8 9')
    await operator.getByRole('textbox', { name: 'Change the passage' }).press('Enter')
    await expect(operator.locator('.passage-title')).toHaveText('Esther 8:9')
    await expect(operator.locator('.verse-label').first()).toHaveText('9a')
    await expect(operator.locator('.inspector-note', { hasText: 'Berean Standard Bible' })).toBeVisible()
  } finally {
    await app.close()
  }
})
