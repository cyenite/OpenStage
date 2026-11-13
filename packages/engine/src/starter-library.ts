import { cleanOverlay, cleanPage, defaultTextStyle, plainLine, starterThemes, type Library, type Overlay, type Page } from '@openstage/shared'
import { starterTemplates } from './starter-templates'

const plain = (...texts: string[]) => texts.map(plainLine)
const look = (overrides: Partial<typeof defaultTextStyle>) => ({ ...defaultTextStyle, ...overrides })
const still = { effect: 'none', durationMs: 600, delayMs: 0 }
const rising = (delayMs: number) => ({ effect: 'rise', durationMs: 900, delayMs })

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
  presentations: {
    'welcome-loop': { id: 'welcome-loop', title: 'Welcome loop', isLooping: true, pages: welcomePages() },
  },
  overlays: Object.fromEntries(starterOverlays().map((o) => [o.id, o])),
  media: {},
}


/** A walk-in loop that shows off pages: an animated welcome, a countdown to the service and a giving page with a QR code. */
function welcomePages(): Page[] {
  const pages = [
    {
      id: 'welcome',
      name: 'Welcome',
      advanceAfter: 12,
      background: { kind: 'animated', preset: 'aurora', colors: ['#1B2B4B', '#3A1C4A', '#0E3B3A'], speed: 1 },
      elements: [
        { id: 'title', name: 'Title', kind: 'text', text: 'Karibu · Welcome', frame: { x: 0.08, y: 0.28, w: 0.84, h: 0.22 }, enter: rising(0), style: look({ family: 'newsreader', size: 0.12, weight: 600 }) },
        { id: 'line', name: 'Second line', kind: 'text', text: "We're glad you're here", frame: { x: 0.1, y: 0.5, w: 0.8, h: 0.1 }, enter: rising(300), style: look({ size: 0.05, weight: 500, color: '#F7E3B5' }) },
        { id: 'clock', name: 'Clock', kind: 'clock', mode: 'time', frame: { x: 0.78, y: 0.04, w: 0.18, h: 0.08 }, enter: still, style: look({ size: 0.04, align: 'right', weight: 500 }) },
        { id: 'news', name: 'Announcements', kind: 'ticker', text: 'Please silence your phones · Sunday school meets after the service · Tea and mandazi in the hall', frame: { x: 0, y: 0.9, w: 1, h: 0.08 }, enter: still, speed: 6, style: look({ size: 0.04, weight: 500, hasShadow: false, backing: 'rgba(0, 0, 0, 0.55)' }) },
      ],
    },
    {
      id: 'countdown',
      name: 'Countdown',
      advanceAfter: 12,
      background: { kind: 'animated', preset: 'drift', colors: ['#2B1D12', '#4A2E14', '#1B2B4B'], speed: 0.8 },
      elements: [
        { id: 'label', name: 'Label', kind: 'text', text: 'The service begins in', frame: { x: 0.1, y: 0.26, w: 0.8, h: 0.1 }, enter: still, style: look({ size: 0.05, weight: 500, isUppercase: true, letterSpacing: 0.12 }) },
        { id: 'timer', name: 'Countdown', kind: 'clock', mode: 'countdownTo', target: '09:00', endText: 'Welcome!', frame: { x: 0.2, y: 0.38, w: 0.6, h: 0.26 }, enter: { effect: 'zoom', durationMs: 700, delayMs: 0 }, style: look({ size: 0.2, weight: 700 }) },
      ],
    },
    {
      id: 'give',
      name: 'Giving',
      advanceAfter: 12,
      background: { kind: 'gradient', from: '#0E3B3A', to: '#08120C', angle: 200 },
      elements: [
        { id: 'heading', name: 'Heading', kind: 'text', text: 'Giving', frame: { x: 0.08, y: 0.18, w: 0.5, h: 0.14 }, enter: rising(0), style: look({ family: 'newsreader', size: 0.1, align: 'left' }) },
        { id: 'how', name: 'How to give', kind: 'text', text: 'M-Pesa Paybill: your number\nAccount: your church name', frame: { x: 0.08, y: 0.36, w: 0.5, h: 0.3 }, enter: rising(250), style: look({ size: 0.05, weight: 500, align: 'left', valign: 'top' }) },
        { id: 'panel', name: 'QR panel', kind: 'shape', frame: { x: 0.64, y: 0.2, w: 0.28, h: 0.6 }, enter: still, fill: 'rgba(255, 255, 255, 0.08)', radius: 0.03 },
        { id: 'qr', name: 'QR code', kind: 'qr', data: 'Replace this with your giving link', frame: { x: 0.68, y: 0.27, w: 0.2, h: 0.36 }, enter: { effect: 'fade', durationMs: 800, delayMs: 400 } },
        { id: 'scan', name: 'Scan caption', kind: 'text', text: 'Scan to give online', frame: { x: 0.64, y: 0.66, w: 0.28, h: 0.08 }, enter: still, style: look({ size: 0.03, weight: 500 }) },
      ],
    },
  ]
  return pages.map((page) => cleanPage({ notes: '', ...page })!)
}

function starterOverlays(): Overlay[] {
  return [
    { id: 'announcements', kind: 'ticker', name: 'Announcements', label: 'NEWS', text: 'Youth meeting on Saturday at 2 PM · Bible study on Wednesday at 6 PM · Welcome to all our visitors' },
    { id: 'sermon-title', kind: 'banner', name: 'Sermon title', title: 'Grace that holds', subtitle: 'Sunday sermon', hideAfter: 12 },
    { id: 'church-mark', kind: 'watermark', name: 'Church name', text: 'Our church', corner: 'bottomRight', size: 0.04, opacity: 0.55 },
    { id: 'corner-clock', kind: 'clock', name: 'Corner clock', corner: 'topRight' },
  ].map((raw) => cleanOverlay(raw)!)
}
