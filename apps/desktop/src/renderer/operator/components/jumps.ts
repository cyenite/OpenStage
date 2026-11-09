import { sectionKinds, type Deck, type OperatorSnapshot, type SectionKind, type SlideRef } from '@openstage/shared'
import { dispatch } from '../engine'

/** The key that jumps to each kind of section; verses use their number instead. Declaration order is chip order. */
const jumpKeys = [
  { kind: 'intro', key: 'I' },
  { kind: 'preChorus', key: 'P' },
  { kind: 'chorus', key: 'C' },
  { kind: 'bridge', key: 'B' },
  { kind: 'tag', key: 'T' },
  { kind: 'outro', key: 'E' },
] as const satisfies readonly { kind: SectionKind; key: string }[]

export interface Jump {
  key: string
  label: string
  kind: SectionKind
  /** Every slide a run of this section starts on, in order. */
  starts: number[]
}

/** One chip per section of a song: verses by number (1-9), the others by letter. Scripture and parts have none. */
export function sectionJumps(deck: Deck | undefined): Jump[] {
  if (!deck || deck.kind !== 'song') return []
  const jumps: Jump[] = []
  let verses = 0
  deck.slides.forEach((slide, index) => {
    if (index > 0 && deck.slides[index - 1]!.label === slide.label) return
    let key: string | undefined
    if (slide.kind === 'verse') {
      const numbered = Number(/\d+/.exec(slide.label)?.[0])
      key = String(Number.isInteger(numbered) && numbered > 0 ? numbered : ++verses)
      if (Number(key) > 9) return
    } else {
      key = jumpKeys.find((j) => j.kind === slide.kind)?.key
    }
    if (!key) return
    const existing = jumps.find((j) => j.key === key)
    if (existing) existing.starts.push(index)
    else jumps.push({ key, kind: slide.kind, starts: [index], label: slide.kind === 'verse' ? `V${key}` : slide.label || sectionKinds.find((k) => k.key === slide.kind)!.label })
  })
  return jumps
}

/** A repeated section jumps to its next run after the slide on screen, wrapping round to the first. */
export function jumpTarget(jump: Jump, liveIndex: number): number {
  return jump.starts.find((start) => start > liveIndex) ?? jump.starts[0]!
}

/** Puts a slide on screen now, whether it belongs to the service or was opened from the Library. */
export function showNow(snapshot: OperatorSnapshot, ref: SlideRef): void {
  const source = snapshot.state.instant[ref.itemId]
  if (source) dispatch({ type: 'instant.show', source, index: ref.index, isLive: true })
  else dispatch({ type: 'live.show', ref })
}

/** The deck the jump keys act on: the one on screen, else the selected service item. */
export function jumpDeck({ state, decks, instant }: OperatorSnapshot): Deck | undefined {
  const itemId = state.live.slide?.itemId ?? state.selectedItemId
  return [...decks, ...instant].find((d) => d.itemId === itemId)
}
