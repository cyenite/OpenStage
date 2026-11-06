import { expect, test } from '@playwright/test'
import { launch, mainText, orderItem, tempUserData } from './app'

test('a service planned from a template is filled, staffed and presented', async () => {
  const { app, operator, projector } = await launch(tempUserData())
  try {
    await operator.getByRole('tab', { name: 'Plan' }).click()
    await expect(operator.locator('.calendar-event', { hasText: 'Sunday Service' })).toBeVisible()

    await operator.getByRole('button', { name: 'New service', exact: true }).click()
    const dialog = operator.locator('dialog')
    await dialog.getByRole('combobox').selectOption('youth')
    await expect(dialog.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Youth night')
    await dialog.locator('input[type=date]').fill('2026-12-04')
    await dialog.getByRole('button', { name: 'Create service' }).click()

    await expect(operator.getByRole('textbox', { name: 'Service name' })).toHaveValue('Youth night')
    await expect(operator.locator('.plan-item')).toHaveCount(4)
    await operator.getByRole('combobox', { name: 'Choose the song for Worship' }).selectOption({ label: 'It Is Well with My Soul' })
    await expect(operator.locator('.plan-item.is-open')).toHaveCount(0)
    const notes = operator.getByRole('textbox', { name: 'Notes for Talk' })
    await notes.fill('Keep it to 20 minutes')
    await notes.blur()
    await operator.getByRole('button', { name: '‹ Calendar' }).click()

    await operator.locator('.calendar-event', { hasText: 'Youth night' }).click()
    const card = operator.locator('.service-card', { hasText: 'Youth night' })
    await expect(card).toContainText('operator not assigned')
    await card.getByRole('textbox', { name: 'Operator for Youth night' }).fill('Amina')
    await card.getByRole('textbox', { name: 'Operator for Youth night' }).press('Enter')
    await expect(card).toContainText('Ready')

    await card.getByRole('button', { name: 'Open to present' }).click()
    await expect(operator.getByRole('tab', { name: 'Present' })).toHaveAttribute('aria-selected', 'true')
    await expect(operator.locator('.titlebar-name')).toHaveText('Youth night')
    await expect(operator.locator('.order-item')).toHaveCount(4)
    await expect(operator.locator('.timeline-item')).toHaveCount(4)
    await orderItem(operator, /^SG It Is Well/).click()
    await operator.getByRole('button', { name: /Send to live/ }).click()
    await expect(mainText(projector)).toHaveText(/When peace like a river/)
    await expect(operator.locator('.timeline-item.is-live')).toHaveText('It Is Well with My Soul')
  } finally {
    await app.close()
  }
})
