const FALLBACK = '/icons/badges/NN.jpg'

export function onAvatarError(e: Event) {
  const img = e.target as HTMLImageElement
  if (img.src !== window.location.origin + FALLBACK) {
    img.src = FALLBACK
  }
}
