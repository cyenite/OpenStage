import { expect, test } from '@playwright/test'
import { launch, mainText, orderItem, tempUserData } from './app'

test('the Library adds after the selected item and sets backgrounds without leaving Present', async () => {
  const { app, operator, projector } = await launch(tempUserData())
  try {
    const order = operator.getByRole('navigation', { name: 'Service order' }).locator('.order-name')
    await orderItem(operator, /^SG Amazing Grace/).click()
    await operator.getByRole('button', { name: /Send to live/ }).click()
    await expect(mainText(projector)).toHaveText(/Amazing grace/i)

    await operator.keyboard.press('Control+k')
    const quickAdd = operator.getByRole('dialog', { name: 'Add to the service' })
    await quickAdd.getByRole('textbox', { name: 'Search everything to add' }).fill('it is well')
    await operator.keyboard.press('Enter')
    await expect(quickAdd).toHaveCount(0)
    await expect(order).toHaveCount(4)
    await expect(order.nth(1)).toHaveText('It Is Well with My Soul')

    await operator.getByRole('tab', { name: 'Parts' }).click()
    await operator.getByRole('button', { name: 'Add Sermon after It Is Well with My Soul' }).click()
    await expect(order.nth(2)).toHaveText('Sermon')

    await operator.keyboard.press('Control+k')
    await operator.keyboard.press('Escape')
    await expect(quickAdd).toHaveCount(0)
    await expect(mainText(projector)).toHaveText(/Amazing grace/i)

    await orderItem(operator, /^SG Amazing Grace/).click()
    await operator.getByRole('radiogroup', { name: 'Background for Amazing Grace' }).getByRole('radio', { name: 'Candle' }).click()
    await expect(orderItem(operator, /^SG Amazing Grace/).getByRole('img', { name: 'Candle background' })).toBeVisible()
    await expect(projector.locator('.os-slide').last()).toHaveCSS('background-image', /linear-gradient/)

    await operator.getByRole('tab', { name: 'Backgrounds' }).click()
    await operator.keyboard.press('Control+k')
    await operator.getByRole('textbox', { name: 'Search everything to add' }).fill('grace')
    await operator.keyboard.press('Escape')
    await operator.getByRole('button', { name: 'Edit lyrics' }).click()
    await expect(operator.getByRole('dialog', { name: 'Edit song' })).toBeVisible()
    await operator.getByRole('button', { name: 'Done' }).click()
    await expect(operator.getByRole('dialog', { name: 'Edit song' })).toHaveCount(0)
    await expect(mainText(projector)).toHaveText(/Amazing grace/i)

    await operator.locator('.library-card', { hasText: 'Night blue' }).dragTo(orderItem(operator, /^BK John 3:16/))
    await expect(orderItem(operator, /^BK John 3:16/).getByRole('img', { name: 'Night blue background' })).toBeVisible()
  } finally {
    await app.close()
  }
})
