import { mediaUrl, newId, type Id, type MediaItem } from '@openstage/shared'
import { chrome } from '../chrome'
import { dispatch } from '../engine'

/** A media item's URL from the snapshot's media list, for pages drawn in the operator window. */
export const mediaSource = (media: MediaItem[]) => (mediaId: Id) => {
  const item = media.find((m) => m.id === mediaId)
  return item ? mediaUrl(item.file) : null
}

function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    let isDone = false
    const done = (value: number | null) => {
      if (isDone) return
      isDone = true
      URL.revokeObjectURL(url)
      resolve(value)
    }
    video.preload = 'metadata'
    // Many WebM files do not say how long they are until the player seeks past their end.
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) return done(video.duration)
      video.ondurationchange = () => Number.isFinite(video.duration) && done(video.duration)
      video.currentTime = 1e9
      setTimeout(() => done(null), 3000)
    }
    video.onerror = () => done(null)
    video.src = url
  })
}

/** Sends picked or dropped files to the engine, which copies them into the library. Returns the new ids. */
export async function importMediaFiles(files: File[]): Promise<Id[]> {
  const ids: Id[] = []
  for (const file of files) {
    const mediaType = file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null
    const path = chrome?.pathForFile(file)
    if (!mediaType || !path) continue
    const name = file.name.replace(/\.[^.]+$/, '')
    const mediaId = newId(name)
    const duration = mediaType === 'video' ? await videoDuration(file) : null
    dispatch({ type: 'media.import', mediaId, name, path, mediaType, duration })
    ids.push(mediaId)
  }
  return ids
}

export function formatSeconds(total: number): string {
  const seconds = Math.max(0, Math.round(total))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
