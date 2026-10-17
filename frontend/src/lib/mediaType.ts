export function isVideoUrl(url: string): boolean {
  try {
    return /\.(mp4|webm|mov|mkv|ogv|m4v|avi)$/i.test(decodeURIComponent(new URL(url, 'https://local.invalid').pathname));
  } catch {
    return /\.(mp4|webm|mov|mkv|ogv|m4v|avi)$/i.test(url.split(/[?#]/)[0]);
  }
}
