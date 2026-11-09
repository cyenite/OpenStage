import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { expect, test } from '@playwright/test'
import { deckSlide, launch, tempUserData } from './app'

/** A small solid PNG written by hand, so the test needs no image fixture in the repository. */
function writePng(path: string): void {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (bytes: Buffer) => {
    let c = 0xffffffff
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc(body), body.length + 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(64, 0)
  header.writeUInt32BE(36, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const rows = Buffer.concat(Array.from({ length: 36 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(64 * 3, 0x80)])))
  writeFileSync(path, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]))
}

test('slides are designed in Edit, added to the service and shown, with overlays and media on their own layers', async () => {
  const userData = tempUserData()
  const { app, operator, projector } = await launch(userData)
  try {
    await operator.getByRole('tab', { name: 'Edit' }).click()
    await operator.getByRole('tab', { name: 'Slides' }).click()
    await operator.getByRole('button', { name: 'New slides' }).click()
    await operator.getByRole('textbox', { name: 'Slides title' }).fill('Harvest Sunday')
    await operator.getByRole('textbox', { name: 'Slides title' }).press('Enter')
    await operator.getByRole('toolbar', { name: 'Insert and arrange' }).getByRole('button', { name: 'Text', exact: true }).click()
    const text = operator.getByRole('textbox', { name: 'Text', exact: true })
    await text.fill('Harvest thanksgiving')
    await text.blur()
    await operator.getByRole('toolbar', { name: 'Insert and arrange' }).getByRole('button', { name: 'QR code' }).click()
    const data = operator.getByRole('textbox', { name: 'Link or text in the code' })
    await data.fill('https://example.org/give')
    await data.blur()
    await expect(operator.getByRole('list', { name: 'Layers on this page' }).getByRole('listitem')).toHaveCount(2)
    await operator.keyboard.press('Control+z')
    await expect(operator.getByRole('textbox', { name: 'Link or text in the code' })).toHaveValue('https://')
    await operator.getByRole('button', { name: 'Add to the service', exact: true }).click()

    await operator.getByRole('tab', { name: 'Present' }).click()
    await deckSlide(operator, /Harvest Sunday/, 0).click()
    await expect(projector.locator('.os-el-text')).toHaveText('Harvest thanksgiving')
    await expect(projector.locator('.os-el-qr svg path')).toHaveCount(1)

    await operator.getByRole('tab', { name: 'Overlays' }).click()
    await operator.getByRole('button', { name: 'Show Announcements on the screen' }).click()
    await operator.getByRole('button', { name: 'Show Corner clock on the screen' }).click()
    await expect(projector.locator('.os-overlay')).toHaveCount(2)
    await expect(projector.locator('.os-overlay-label')).toHaveText('NEWS')
    await operator.keyboard.press('F6')
    await expect(projector.locator('.os-overlay:not(.is-leaving)')).toHaveCount(0)

    const image = join(userData, 'logo.png')
    writePng(image)
    await operator.getByRole('tab', { name: 'Edit' }).click()
    await operator.getByRole('tab', { name: 'Media' }).click()
    await operator.getByLabel('Media files to add').setInputFiles(image)
    await expect(operator.getByRole('heading', { name: 'logo' })).toBeVisible()
    await operator.getByRole('button', { name: 'Show on the screens now' }).click()
    await expect(projector.locator('img.os-media')).toHaveJSProperty('naturalWidth', 64)
    await expect(projector.locator('.os-el-text')).toHaveCount(0)
    await operator.getByRole('tab', { name: 'Present' }).click()
    await expect(operator.getByRole('region', { name: 'Media playing' })).toContainText('logo')
    await operator.keyboard.press('F5')
    await expect(projector.locator('.os-media')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
