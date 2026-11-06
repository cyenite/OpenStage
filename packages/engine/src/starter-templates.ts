import type { ItemKind, ServiceTemplate, TemplateSlot } from '@openstage/shared'

const slot = (id: string, kind: ItemKind, title: string, minutes: number, rule = ''): TemplateSlot => ({ id, kind, title, minutes, rule })

/** The starter templates from the phase 1 plan. Titles are the parts of a service; songs and readings are chosen per service. */
export const starterTemplates: ServiceTemplate[] = [
  {
    id: 'sunday',
    name: 'Sunday service',
    color: '#F2A93B',
    time: '09:00',
    slots: [
      slot('welcome', 'welcome', 'Countdown and welcome', 5, 'Always the same'),
      slot('opening', 'song', 'Opening song', 6, 'Pick: not used in the last 3 weeks'),
      slot('notices', 'announcements', 'Announcements', 6, 'This week’s notices'),
      slot('worship', 'song', 'Worship set', 12, 'Pick on the day'),
      slot('reading', 'scripture', 'Scripture reading', 4, 'Follows the sermon series'),
      slot('sermon', 'sermon', 'Sermon', 30, 'Notes on the stage screen'),
      slot('closing', 'song', 'Closing song', 4, 'Pick on the day'),
      slot('blessing', 'benediction', 'Benediction', 2),
    ],
  },
  {
    id: 'swahili',
    name: 'Ibada ya Kiswahili',
    color: '#5C9CFF',
    time: '11:30',
    slots: [
      slot('karibu', 'welcome', 'Karibu', 5),
      slot('wimbo', 'song', 'Wimbo wa kuabudu', 6, 'Pick on the day'),
      slot('matangazo', 'announcements', 'Matangazo', 6),
      slot('sifa', 'song', 'Nyimbo za sifa', 12, 'Pick on the day'),
      slot('somo', 'scripture', 'Somo la Biblia', 4),
      slot('mahubiri', 'sermon', 'Mahubiri', 30),
      slot('sadaka', 'offering', 'Sadaka', 5),
      slot('mwisho', 'song', 'Wimbo wa mwisho', 4, 'Pick on the day'),
      slot('baraka', 'benediction', 'Baraka', 2),
    ],
  },
  {
    id: 'bible-study',
    name: 'Midweek Bible study',
    color: '#34C77B',
    time: '18:30',
    slots: [
      slot('opening-prayer', 'prayer', 'Opening prayer', 5),
      slot('song', 'song', 'Song', 5, 'Pick on the day'),
      slot('passage', 'scripture', 'Passage', 10, 'Next in the study'),
      slot('study', 'sermon', 'Study and discussion', 40),
      slot('closing-prayer', 'prayer', 'Closing prayer', 5),
    ],
  },
  {
    id: 'youth',
    name: 'Youth night',
    color: '#C481FF',
    time: '19:00',
    slots: [
      slot('welcome', 'welcome', 'Welcome and games', 15),
      slot('worship', 'song', 'Worship', 15, 'Pick on the day'),
      slot('talk', 'sermon', 'Talk', 20),
      slot('prayer', 'prayer', 'Prayer', 5),
    ],
  },
  {
    id: 'wedding',
    name: 'Wedding',
    color: '#FF5A5F',
    time: '14:00',
    slots: [
      slot('processional', 'welcome', 'Processional', 5),
      slot('hymn', 'song', 'Hymn', 5, 'The couple’s choice'),
      slot('reading', 'scripture', 'Reading', 5, 'The couple’s choice'),
      slot('message', 'sermon', 'Message', 15),
      slot('vows', 'other', 'Vows and rings', 10),
      slot('prayer', 'prayer', 'Prayer', 5),
      slot('register', 'other', 'Signing the register', 10),
      slot('recessional', 'song', 'Recessional', 5),
    ],
  },
  {
    id: 'funeral',
    name: 'Funeral and memorial',
    color: '#8A8A92',
    time: '10:00',
    slots: [
      slot('welcome', 'welcome', 'Welcome', 5),
      slot('hymn', 'song', 'Hymn', 5, 'The family’s choice'),
      slot('tribute', 'other', 'Tribute', 15),
      slot('reading', 'scripture', 'Reading', 5),
      slot('message', 'sermon', 'Message', 15),
      slot('prayer', 'prayer', 'Prayer', 5),
      slot('closing', 'song', 'Closing hymn', 5, 'The family’s choice'),
    ],
  },
]
