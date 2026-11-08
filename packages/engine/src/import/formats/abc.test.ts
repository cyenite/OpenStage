import { describe, expect, it } from 'vitest'
import { readFiles } from '../detect'
import type { ImportedSong } from '../types'
import { abcHymn, isAbc } from './abc'

const bytes = (text: string) => new TextEncoder().encode(text)
const texts = (song: ImportedSong) => song.sections.map((s) => [s.label, s.slides.map((slide) => slide.map((l) => l.text))])

const header = `%%%%%%%%%%%%%%%%
% Open Hymnal Project, 2008 Edition
%%%%%%%%%%%%%%%%
%OHAUTHOR Lyte, Henry F. (1793-1847)
%OHTRANSLATOR none
%OHARRANGER Monk, William Henry (1823-1889)

X: 1
T: Abide With Me
C: Words: Henry F. Lyte, 1847.  Music: 'Eventide' William H. Monk, 1861.
C: copyright: public domain.  This score is a part of the Open Hymnal Project, 2008 Revision.
M: 4/4 % time signature
V: S1V1 clef=treble
V: S1V2
K: Eb % key signature
`

const hymn = `${header}% 1
[V: S1V1] [Q:1/4=100] G2 G F | E2 B2 |
w: 1.~A- bide with me; fast falls the ev- en-
w: 2.~Swift to its close ebbs out life's lit- tle
w: 3.~Not a brief glance I beg, a pass- ing
[V: S1V2]  E2 D D | E2 E2 |
w: this | duplicates * the first voice
% 3
[V: S1V1]  c2 B2 | A F G =A |
w: tide; The dark- ness deep- ens.
w: day; Earth's joys grow dim. _
w: word; But as Thou dwell'st.
[V: S1V2]  E2 E2 | E F E E |
W: 4.I need Thy presence every passing hour.
W: What but Thy grace can foil the tempter's power?
W:
W: 5.I fear no foe, with Thee at hand to bless;
W: Ills have no weight.
`

describe('abcHymn', () => {
  it('reads the details, rebuilds each verse from the first voice and appends the W: verses', () => {
    const { song, isPublicDomain } = abcHymn('file', hymn)
    expect(isPublicDomain).toBe(true)
    expect(song).toMatchObject({ title: 'Abide With Me', authors: ['Henry F. Lyte'], copyright: 'Public domain', key: 'Eb', languages: ['en'], order: [] })
    expect(texts(song)).toEqual([
      ['Verse 1', [['Abide with me; fast falls the eventide;', 'The darkness deepens.']]],
      ['Verse 2', [['Swift to its close ebbs out life\'s little day;', 'Earth\'s joys grow dim.']]],
      ['Verse 3', [['Not a brief glance I beg, a passing word;', 'But as Thou dwell\'st.']]],
      ['Verse 4', [['I need Thy presence every passing hour.', 'What but Thy grace can foil the tempter\'s power?']]],
      ['Verse 5', [['I fear no foe, with Thee at hand to bless;', 'Ills have no weight.']]],
    ])
  })

  it('re-flows words into sung lines at their punctuation, and splits four or more lines into slides of two', () => {
    const { song } = abcHymn('file', `${header}[V: S1V1] c2 |
w: A might- y for- tress is our God, a bul- wark
[V: S1V1] c2 |
w: nev- er fail- ing; Our help- er He, a- mid the flood
[V: S1V1] c2 |
w: of mor- tal ills pre- vail- ing: For still our an- cient
[V: S1V1] c2 |
w: foe doth seek to work us woe;
`)
    expect(texts(song)).toEqual([
      [
        'Verse 1',
        [
          ['A mighty fortress is our God,', 'a bulwark never failing;'],
          ['Our helper He,', 'amid the flood of mortal ills prevailing:'],
          ['For still our ancient foe doth seek to work us woe;'],
        ],
      ],
    ])
  })

  it('makes a system with one line of words in a hymn of several verses the chorus, sung after every verse', () => {
    const { song } = abcHymn('Jesus Loves Me', `${header.replace('T: Abide With Me', 'T: Jesus Loves Me')}[V: S1V1] c2 |
w: 1.~Je- sus loves me! This I know,
w: 2.~Je- sus loves me! He who died,
[V: S1V1] c2 |
w: Yes, Je- sus loves me!
[V: S1V1] c2 |
w: * * *
w: The Bi- ble tells me so.
`)
    expect(texts(song)).toEqual([
      ['Verse 1', [['Jesus loves me! This I know,']]],
      ['Verse 2', [['Jesus loves me! He who died,']]],
      ['Chorus', [['Yes, Jesus loves me!', 'The Bible tells me so.']]],
    ])
    expect(song.order).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Chorus'])
  })

  it('keeps a numbered line on its own verse and ignores placeholders, bars and alternate lines', () => {
    const { song } = abcHymn('file', `${header}[V: S1V1] c2 |
w: 1.~First| verse * here _
w: 2.~Second verse
w: 3.~Third verse
w: 1(alt).~Other first
[V: S1V1] c2 |
w: 2.~Sec- ond
w: 3.~Thi- rd
`)
    expect(texts(song)).toEqual([
      ['Verse 1', [['First verse here']]],
      ['Verse 2', [['Second verse Second']]],
      ['Verse 3', [['Third verse Third']]],
    ])
  })

  it('joins syllables across spaces, keeps escaped hyphens and moves a split word onto one line', () => {
    const { song } = abcHymn('file', `${header}[V: S1V1] c2 |
w: Ho- - ly_ One~of heav- y\\- hear- ted ev- 'ry bed\\- Je- sus
[V: S1V1] c2 |
w: and some- thing a- ble
[V: S1V1] c2 |
w: Hal- le-
[V: S1V1] c2 |
w: lu- jah!
`)
    expect(texts(song)).toEqual([
      ['Verse 1', [['Holy One of heavy-hearted ev\'ry bed -', 'Jesus and something able Hallelujah!']]],
    ])
  })

  it('takes the copyright line as written when the score is not marked public domain', () => {
    const { song, isPublicDomain } = abcHymn('file', `X: 1
T: New Song
C: copyright: Words: Copyright 2009, Brian L. Penney. These lyrics may be freely reproduced.
K: G
w: One
`)
    expect(isPublicDomain).toBe(false)
    expect(song).toMatchObject({ copyright: 'Words: Copyright 2009, Brian L. Penney. These lyrics may be freely reproduced.', key: 'G' })
  })

  it('names authors and translators first name first and falls back to the Words: credit', () => {
    const named = abcHymn('file', `%OHAUTHOR Oatman, Jr., Johnson (1856-1922);Latin;Luther, Martin (1483-1546)
%OHTRANSLATOR Winkworth, Catherine (1827-1878);Luther, Martin (1483-1546);unknown
X: 1
T: Hymn
K: Am
w: One
`)
    expect(named.song.authors).toEqual(['Johnson Oatman, Jr.', 'Martin Luther', 'Catherine Winkworth'])
    expect(named.song.key).toBe('Am')
    const credited = abcHymn('file', 'X: 1\nT: Hymn\nC: Words: Henry F. Lyte, 1847.  Music: William H. Monk, 1861.\nK: Dorian\n').song
    expect(credited.authors).toEqual(['Henry F. Lyte'])
    expect(credited.key).toBeUndefined()
  })

  it('falls back to the file title and has no verses when there are no words', () => {
    const { song } = abcHymn('From the file', 'X: 1\nT:\nK: C\nC2 |\n')
    expect(song.title).toBe('From the file')
    expect(song.sections).toEqual([])
  })
})

describe('isAbc', () => {
  it('needs an X: line followed by a T: line near the top', () => {
    expect(isAbc(hymn)).toBe(true)
    expect(isAbc('X:1\nT:Title\nK:G\n')).toBe(true)
    expect(isAbc('T:Title\nK:G\n')).toBe(false)
    expect(isAbc('Title\n\nVerse 1\nLine one\n')).toBe(false)
  })
})

describe('file detection', () => {
  it('reads a dropped .abc file as an ABC song and warns when it is not marked public domain', () => {
    const [read] = readFiles([{ name: 'Hymns/Abide_With_Me-Eventide.abc', bytes: bytes(hymn) }])
    expect(read).toMatchObject({ kind: 'song', format: 'ABC', song: { title: 'Abide With Me' } })
    expect(read).not.toHaveProperty('caution')

    const [other] = readFiles([{ name: 'New.abc', bytes: bytes('X: 1\nT: New\nC: copyright: Copyright 2010, Someone.\nK: G\nw: One\n') }])
    expect(other).toMatchObject({ kind: 'song', format: 'ABC' })
    expect((other as { caution?: string }).caution).toMatch(/public domain/)
  })

  it('reads a Latin-1 file whose accents would not decode as UTF-8', () => {
    const latin1 = Uint8Array.from(Buffer.from('X: 1\nT: Gläubig\nC: copyright: public domain.\nK: G\nw: Gläu- big\n', 'latin1'))
    const [read] = readFiles([{ name: 'a.abc', bytes: latin1 }])
    expect(read).toMatchObject({ kind: 'song', format: 'ABC', song: { title: 'Gläubig' } })
    expect(texts((read as { song: ImportedSong }).song)).toEqual([['Verse 1', [['Gläubig']]]])
  })
})
