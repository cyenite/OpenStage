import { plainLine, starterThemes, type Library } from '@openstage/shared'
import { starterTemplates } from './starter-templates'

const plain = (...texts: string[]) => texts.map(plainLine)

/**
 * Written into an empty library on first start. All public domain: hymns by John Newton (1779)
 * and Horatio Spafford (1873). The passage only points at John 3; its words come from the bundled Bibles.
 */
export const starterLibrary: Library = {
  songs: {
    'amazing-grace': {
      id: 'amazing-grace',
      title: 'Amazing Grace',
      languages: ['en'],
      meta: { authors: ['John Newton'], copyright: 'Public domain' },
      sections: {
        v1: {
          id: 'v1',
          kind: 'verse',
          label: 'Verse 1',
          slides: [
            { lines: plain('Amazing grace, how sweet the sound', 'That saved a wretch like me') },
            { lines: plain('I once was lost, but now am found', 'Was blind, but now I see') },
          ],
        },
        v2: {
          id: 'v2',
          kind: 'verse',
          label: 'Verse 2',
          slides: [
            { lines: plain('’Twas grace that taught my heart to fear', 'And grace my fears relieved') },
            { lines: plain('How precious did that grace appear', 'The hour I first believed') },
          ],
        },
        v3: {
          id: 'v3',
          kind: 'verse',
          label: 'Verse 3',
          slides: [
            { lines: plain('Through many dangers, toils and snares', 'I have already come') },
            { lines: plain('’Tis grace hath brought me safe thus far', 'And grace will lead me home') },
          ],
        },
        end: {
          id: 'end',
          kind: 'outro',
          label: 'Verse 4',
          slides: [
            { lines: plain('When we’ve been there ten thousand years', 'Bright shining as the sun') },
            { lines: plain('We’ve no less days to sing God’s praise', 'Than when we’d first begun') },
          ],
        },
      },
      arrangements: [
        { id: 'sunday', name: 'Sunday', sectionIds: ['v1', 'v2', 'v3', 'end'] },
        { id: 'short', name: 'Short', sectionIds: ['v1', 'end'] },
      ],
    },
    'it-is-well': {
      id: 'it-is-well',
      title: 'It Is Well with My Soul',
      languages: ['en'],
      meta: { authors: ['Horatio Spafford'], copyright: 'Public domain' },
      sections: {
        v1: {
          id: 'v1',
          kind: 'verse',
          label: 'Verse 1',
          slides: [
            { lines: plain('When peace like a river attendeth my way', 'When sorrows like sea billows roll') },
            { lines: plain('Whatever my lot, Thou hast taught me to say', 'It is well, it is well with my soul') },
          ],
        },
        chorus: {
          id: 'chorus',
          kind: 'chorus',
          label: 'Chorus',
          slides: [{ lines: plain('It is well with my soul', 'It is well, it is well with my soul') }],
        },
        v2: {
          id: 'v2',
          kind: 'verse',
          label: 'Verse 2',
          slides: [
            { lines: plain('Though Satan should buffet, though trials should come', 'Let this blest assurance control') },
            { lines: plain('That Christ has regarded my helpless estate', 'And hath shed His own blood for my soul') },
          ],
        },
      },
      arrangements: [{ id: 'sunday', name: 'Sunday', sectionIds: ['v1', 'chorus', 'v2', 'chorus'] }],
    },
  },
  passages: {
    'john-3-16': {
      id: 'john-3-16',
      ref: { book: 'JHN', startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 17 },
      translations: ['KJV', 'WEB'],
      versesPerSlide: 1,
      splitLong: true,
    },
  },
  services: {
    sunday: {
      id: 'sunday',
      name: 'Sunday Service',
      themeId: 'classic',
      translations: ['KJV'],
      items: [
        { id: 'item-amazing-grace', type: 'song', songId: 'amazing-grace', arrangementId: 'sunday' },
        { id: 'item-john-3', type: 'scripture', passageId: 'john-3-16' },
        { id: 'item-it-is-well', type: 'song', songId: 'it-is-well', arrangementId: 'sunday' },
      ],
    },
  },
  backgrounds: {
    'night-blue': { id: 'night-blue', name: 'Night blue', render: { kind: 'color', color: '#102033' } },
    'slow-clouds': { id: 'slow-clouds', name: 'Slow clouds', render: { kind: 'gradient', from: '#22324A', to: '#0B1220', angle: 160 } },
    candle: { id: 'candle', name: 'Candle', render: { kind: 'gradient', from: '#4A2E14', to: '#140C06', angle: 180 } },
    'forest-light': { id: 'forest-light', name: 'Forest light', render: { kind: 'gradient', from: '#1D3A26', to: '#08120C', angle: 200 } },
    'plum-still': { id: 'plum-still', name: 'Plum still', render: { kind: 'color', color: '#1B1430' } },
  },
  lowerThirds: {
    pastor: { id: 'pastor', title: '[Pastor name]', subtitle: 'Senior pastor' },
    welcome: { id: 'welcome', title: 'Karibu · Welcome', subtitle: '[Church name]' },
  },
  audioCues: { 'walk-in': { id: 'walk-in', name: 'Walk-in music' } },
  themes: Object.fromEntries(starterThemes.map((theme) => [theme.id, theme])),
  templates: Object.fromEntries(starterTemplates.map((template) => [template.id, template])),
}
