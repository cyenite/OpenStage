import { expect, test } from '@playwright/test'
import { launch, tempUserData } from './app'

test('the booth sends messages and runs a countdown on the stage screen', async () => {
  const { app, operator, stage } = await launch(tempUserData())
  try {
    await operator.keyboard.press('Space')
    await expect(stage.locator('.os-stage-title')).toHaveText('Amazing Grace · Verse 1')
    await expect(stage.locator('.os-stage-section.is-current')).toHaveText('V1')
    await expect(stage.locator('.os-stage-clock')).not.toBeEmpty()

    await operator.getByRole('tab', { name: 'Stage' }).click()
    await operator.getByRole('button', { name: 'Chorus again' }).click()
    await expect(stage.locator('.os-stage-message-text')).toHaveText('Chorus again')
    await expect(stage.locator('.os-stage-message-age')).toContainText('from the booth')
    await operator.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(stage.locator('.os-stage-message')).toHaveCount(0)

    await operator.getByRole('tab', { name: 'Timer' }).click()
    await operator.getByRole('button', { name: '10 min' }).click()
    await expect(stage.locator('.os-stage-timer-value')).toHaveText('10:00')
    await operator.getByRole('button', { name: 'Start' }).click()
    await expect(stage.locator('.os-stage-timer')).toHaveClass(/is-running/)
    await expect(stage.locator('.os-stage-timer-value')).toHaveText(/^9:5\d$/, { timeout: 4000 })

    await operator.getByRole('tab', { name: 'Stage' }).click()
    await operator.getByRole('radio', { name: 'Clock' }).click()
    await expect(stage.locator('.os-stage-screen')).toHaveAttribute('data-layout', 'clock')
    await expect(stage.locator('.os-stage-current')).toBeHidden()
  } finally {
    await app.close()
  }
})
