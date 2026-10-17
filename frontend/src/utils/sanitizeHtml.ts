// Minimal allow-list HTML sanitizer for admin-authored rich text (Bloomly updates).
// Keeps only basic formatting tags and strips everything else (scripts, attributes, event handlers).
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'UL', 'OL', 'LI', 'DIV', 'P', 'SPAN'])

export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return ''
  const template = document.createElement('template')
  template.innerHTML = html

  const clean = (parent: Node) => {
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) continue
      if (node.nodeType !== Node.ELEMENT_NODE) {
        parent.removeChild(node)
        continue
      }
      const el = node as HTMLElement
      // Clean descendants before unwrapping: newly inserted siblings are absent
      // from the snapshot above and otherwise keep their event attributes.
      clean(el)
      if (!ALLOWED_TAGS.has(el.tagName)) {
        // Unwrap disallowed elements — keep their text/children, drop the tag itself
        while (el.firstChild) parent.insertBefore(el.firstChild, el)
        parent.removeChild(el)
        continue
      }
      for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name)
    }
  }
  clean(template.content)
  return template.innerHTML
}

// Plain-text preview (e.g. for line-clamped list rows in the admin panel)
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  const template = document.createElement('template')
  template.innerHTML = html
  return (template.content.textContent ?? '').trim()
}
