export interface PlayerProfile {
  id: string
  nickname: string
  avatar: string | null
}

export interface PublicPlayer {
  id: string
  nickname: string
  avatar: string | null
  peerId: string
}

const STORAGE_KEY = 'party-games:profile'
export const MAX_NICKNAME_LEN = 16
export const MAX_AVATAR_BYTES = 30 * 1024

export function loadProfile(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as PlayerProfile
    if (!p.id || !p.nickname) return null
    return p
  } catch {
    return null
  }
}

export function saveProfile(profile: PlayerProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
}

export function createProfile(nickname: string, avatar: string | null): PlayerProfile {
  const profile: PlayerProfile = {
    id: crypto.randomUUID(),
    nickname: nickname.slice(0, MAX_NICKNAME_LEN),
    avatar,
  }
  saveProfile(profile)
  return profile
}

export function updateProfile(patch: Partial<Pick<PlayerProfile, 'nickname' | 'avatar'>>): PlayerProfile | null {
  const existing = loadProfile()
  if (!existing) return null
  const updated: PlayerProfile = {
    ...existing,
    ...(patch.nickname !== undefined ? { nickname: patch.nickname.slice(0, MAX_NICKNAME_LEN) } : {}),
    ...(patch.avatar !== undefined ? { avatar: patch.avatar } : {}),
  }
  saveProfile(updated)
  return updated
}

export function compressAvatar(file: File, maxSize = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const size = Math.min(maxSize, img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      const sx = (img.width - Math.min(img.width, img.height)) / 2
      const sy = (img.height - Math.min(img.width, img.height)) / 2
      const sMin = Math.min(img.width, img.height)
      ctx.drawImage(img, sx, sy, sMin, sMin, 0, 0, size, size)
      let quality = 0.85
      let dataUrl = canvas.toDataURL('image/jpeg', quality)
      while (dataUrl.length > MAX_AVATAR_BYTES * 1.37 && quality > 0.3) {
        quality -= 0.1
        dataUrl = canvas.toDataURL('image/jpeg', quality)
      }
      resolve(dataUrl)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }
    img.src = url
  })
}
