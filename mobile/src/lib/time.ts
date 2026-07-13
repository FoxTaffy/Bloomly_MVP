export function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 60) return `${sec}с`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}м`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}ч`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}д`;
  const date = new Date(iso);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
