import { expect, test, type ElectronApplication } from '@playwright/test'
import { launch, mainText, tempUserData } from './app'

test('volunteer mode locks to the simple screen, survives a restart and unlocks with the PIN', async () => {
  const userData = tempUserData()
  let app: ElectronApplication | undefined
  try {
    const first = await launch(userData)
    app = first.app
    await first.operator.getByRole('button', { name: 'Volunteer mode' }).click()
    const dialog = first.operator.locator('dialog.pin-dialog')
    await dialog.getByLabel('Choose a PIN, 4 to 8 digits').fill('2580')
    await dialog.getByLabel('The same PIN again').fill('2580')
    await dialog.getByRole('button', { name: 'Set PIN and lock' }).click()
    await expect(first.operator.locator('.volunteer-name')).toHaveText('Volunteer mode')
    await expect(first.operator.getByRole('tab', { name: 'Edit' })).toHaveCount(0)

    await first.operator.getByRole('button', { name: 'Next slide ›' }).click()
    await expect(mainText(first.projector)).toHaveText(/Amazing grace/)
    await first.operator.getByRole('button', { name: 'Next slide ›' }).click()
    await expect(mainText(first.projector)).toHaveText(/I once was lost/)
    await first.operator.getByRole('button', { name: 'Clear the lyrics' }).click()
    await expect(first.projector.locator('.os-slide')).toHaveCount(0)
    await first.operator.getByRole('button', { name: 'Show again' }).click()
    await expect(mainText(first.projector)).toHaveText(/I once was lost/)
    await first.app.close()
    app = undefined

    const second = await launch(userData)
    app = second.app
    const { operator, projector } = second
    await expect(operator.locator('.volunteer-name')).toHaveText('Volunteer mode')

    await operator.getByRole('button', { name: 'Rehearse' }).click()
    await expect(operator.locator('.rehearsal-pill')).toBeVisible()
    await operator.getByRole('button', { name: 'Next slide ›' }).click()
    await expect(operator.locator('.volunteer-now')).toContainText('slide 3 of 8')
    await expect(mainText(projector)).toHaveText(/I once was lost/)
    await operator.locator('.rehearsal-pill').getByRole('button', { name: 'Stop' }).click()
    await expect(operator.locator('.volunteer-now')).toContainText('slide 2 of 8')

    await operator.getByRole('button', { name: 'Unlock full app with PIN' }).click()
    const unlock = operator.locator('dialog.pin-dialog')
    await unlock.getByLabel('PIN').fill('1111')
    await unlock.getByRole('button', { name: 'Unlock' }).click()
    await expect(unlock).toContainText('That PIN is not right.')
    await unlock.getByLabel('PIN').fill('2580')
    await unlock.getByRole('button', { name: 'Unlock' }).click()
    await expect(operator.getByRole('tab', { name: 'Edit' })).toBeVisible()
  } finally {
    await app?.close()
  }
})
