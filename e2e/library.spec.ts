import { expect, test } from '@playwright/test'
import { background, launch, mainText, orderItem, tempUserData } from './app'

test('the Library adds after the selected item and sets backgrounds without leaving Present', async () => {
  const { app, operator, projector } = await launch(tempUserData())
  try {
    const order = operator.getByRole('navigation', { name: 'Service order' }).locator('.order-name')
    await orderItem(operator, /^SG Amazing Grace/).click()
    await operator.keyboard.press('Space')
    await expect(mainText(projector)).toHaveText(/Amazing grace/i)

    await operator.keyboard.press('Control+k')
    const quickAdd = operator.getByRole('dialog', { name: 'Add to the service' })
    await quickAdd.getByRole('textbox', { name: 'Search everything to add' }).fill('it is well')
    await operator.keyboard.press('Enter')
    await expect(quickAdd).toHaveCount(0)
    await expect(order).toHaveCount(4)
    await expect(order.nth(1)).toHaveText('It Is Well with My Soul')

    await operator.keyboard.press('Control+k')
    await quickAdd.getByRole('textbox', { name: 'Search everything to add' }).fill('sermon')
    await operator.keyboard.press('Enter')
    await expect(order.nth(2)).toHaveText('Sermon')

    await operator.keyboard.press('Control+k')
    await operator.keyboard.press('Escape')
    await expect(quickAdd).toHaveCount(0)
    await expect(mainText(projector)).toHaveText(/Amazing grace/i)

    await orderItem(operator, /^SG Amazing Grace/).click()
    await operator.getByRole('button', { name: 'Amazing Grace settings' }).click()
    await operator.getByRole('radiogroup', { name: 'Background for Amazing Grace' }).getByRole('radio', { name: 'Forest light' }).click()
    await expect(orderItem(operator, /^SG Amazing Grace/).getByRole('img', { name: 'Forest light background' })).toBeVisible()
    await expect(background(projector)).toHaveCSS('background-image', /rgb\(29, 58, 38\)/)
    await expect(mainText(projector)).toHaveText(/Amazing grace/i)
    await operator.keyboard.press('Escape')
    await expect(operator.getByRole('dialog', { name: 'Amazing Grace settings' })).toHaveCount(0)
    await expect(projector.locator('.os-slide')).not.toHaveCount(0)

    await operator.getByRole('tab', { name: 'Backgrounds' }).click()
    await operator.getByRole('button', { name: 'Show Night blue on the screen now' }).click()
    await expect(background(projector)).toHaveCSS('background-color', 'rgb(16, 32, 51)')
    await expect(mainText(projector)).toHaveText(/Amazing grace/i)
    await operator.keyboard.press('Control+k')
    await operator.getByRole('textbox', { name: 'Search everything to add' }).fill('grace')
    await operator.keyboard.press('Escape')
    await operator.getByRole('button', { name: 'Amazing Grace settings' }).click()
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
