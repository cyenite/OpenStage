import { deflateRawSync } from 'node:zlib'
import { expect, test } from '@playwright/test'
import { launch, tempUserData } from './app'

/** A small ZIP built in memory, shaped like an eBible.org USFM download. */
function zip(entries: { name: string; data: string }[]): Buffer {
  const parts: Buffer[] = []
  const directory: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const raw = Buffer.from(entry.data)
    const packed = deflateRawSync(raw)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(packed.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(name.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(packed.length, 20)
    central.writeUInt32LE(raw.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    parts.push(local, name, packed)
    directory.push(central, name)
    offset += 30 + name.length + packed.length
  }
  const size = directory.reduce((n, b) => n + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(size, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, ...directory, end])
}

test('songs and a Bible are imported with duplicates flagged and nothing overwritten silently', async () => {
  const { app, operator } = await launch(tempUserData())
  try {
    await operator.getByRole('tab', { name: 'Edit' }).click()
    await operator.locator('.song-library input[type=file]').setInputFiles([
      { name: 'new.cho', mimeType: 'text/plain', buffer: Buffer.from('{title: Mungu ni Mwema}\n{key: D}\n{c: Verse 1}\nMungu ni [D]mwema\n\n{soc}\nAsante\n{eoc}') },
      {
        name: 'grace.xml',
        mimeType: 'text/xml',
        buffer: Buffer.from(
          '<song xmlns="http://openlyrics.info/namespace/2009/song" version="0.9"><properties><titles><title>Amazing Grace</title></titles><ccliNo>22025</ccliNo><key>G</key></properties><lyrics><verse name="v1"><lines>Amazing grace, how sweet the sound</lines></verse></lyrics></song>',
        ),
      },
      { name: 'modern.pro', mimeType: 'application/octet-stream', buffer: Buffer.from([0x0a, 0x24, 0x01, 0x02, 0xff, 0x00]) },
    ])
    const dialog = operator.locator('dialog.import-dialog')
    await expect(dialog.locator('.import-summary')).toHaveText('1 new · 1 already here · 1 can’t be read')
    await expect(dialog.locator('.import-row', { hasText: 'ProPresenter 7' })).toContainText('not supported yet')
    const grace = dialog.locator('.import-row', { hasText: 'Amazing Grace' })
    await expect(grace).toContainText('Same title and first line')
    await grace.getByRole('button', { name: 'Compare' }).click()
    await expect(grace.locator('.compare')).toContainText('In your library')
    await grace.getByRole('combobox').selectOption('merge')
    await dialog.getByRole('button', { name: 'Import 2' }).click()
    await expect(dialog.locator('.import-summary')).toHaveText('1 added · 1 merged · 0 skipped · 1 could not be imported')
    await dialog.getByRole('button', { name: 'Done' }).click()

    await expect(operator.locator('.song-row', { hasText: 'Mungu ni Mwema' })).toBeVisible()
    await expect(operator.locator('.song-row', { hasText: 'Amazing Grace' })).toHaveCount(1)
    await operator.locator('.song-row', { hasText: 'Amazing Grace' }).click()
    await expect(operator.getByRole('textbox', { name: 'CCLI song number' })).toHaveValue('22025')
    await expect(operator.getByRole('textbox', { name: 'Verse 1 lyrics' })).toHaveValue(/That saved a wretch like me/)

    await operator.getByRole('tab', { name: 'Scripture' }).click()
    await operator.locator('.scripture-library input[type=file]').setInputFiles({
      name: 'swhtest_usfm.zip',
      mimeType: 'application/zip',
      buffer: zip([
        { name: '44JHNswhtest.usfm', data: '\\id JHN Test\n\\c 3\n\\v 16 Kwa maana jinsi hii Mungu aliupenda ulimwengu.' },
        { name: 'copr.htm', data: '<p>Test text, CC BY-SA 4.0</p>' },
      ]),
    })
    await expect(dialog.locator('.import-row')).toContainText('1 books · 1 verses')
    await expect(dialog.getByRole('combobox')).toHaveValue('sw')
    const importBible = dialog.getByRole('button', { name: 'Import 1' })
    await expect(importBible).toBeDisabled()
    await dialog.getByRole('checkbox', { name: /right to use the Bible text/ }).check()
    await importBible.click()
    await expect(dialog.locator('.import-summary')).toContainText('1 added')
    await dialog.getByRole('button', { name: 'Done' }).click()

    const reference = operator.getByRole('textbox', { name: 'New passage reference' })
    await reference.fill('Yohana 3:16')
    await reference.press('Enter')
    await operator.getByRole('combobox', { name: 'Add a translation' }).selectOption('SWHTEST')
    await expect(operator.locator('.verse-secondary')).toHaveText('Kwa maana jinsi hii Mungu aliupenda ulimwengu.')
    await expect(operator.locator('.inspector-note', { hasText: 'CC BY-SA 4.0' })).toBeVisible()
  } finally {
    await app.close()
  }
})
