import type { CommissionDetails } from '@/stores/dealersDen'

// Editable shape: prices may be empty while typing; `draws` are edited as comma lists.
export interface DetailsDraft {
  formats: { name: string; price: number | '' }[]
  addons: { name: string; hint: string; price: number | '' }[]
  draws: string
  doesntDraw: string
  sections: { title: string; items: { label: string; value: string }[] }[]
  terms: { revisions: string; file: string; rights: string; refund: string; languages: string }
}

export function emptyDraft(): DetailsDraft {
  return { formats: [], addons: [], draws: '', doesntDraw: '', sections: [],
    terms: { revisions: '', file: '', rights: '', refund: '', languages: '' } }
}

export function draftFrom(d?: CommissionDetails | null): DetailsDraft {
  const e = emptyDraft()
  if (!d) return e
  return {
    formats: (d.formats ?? []).map(f => ({ ...f })),
    addons: (d.addons ?? []).map(a => ({ name: a.name, hint: a.hint ?? '', price: a.price })),
    draws: (d.draws ?? []).join(', '),
    doesntDraw: (d.doesntDraw ?? []).join(', '),
    sections: (d.sections ?? []).map(s => ({ title: s.title, items: s.items.map(i => ({ ...i })) })),
    terms: { ...e.terms, ...(d.terms ?? {}) },
  }
}

const list = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean)

// Drops blank rows; returns null when nothing is filled so the column stays empty.
export function cleanDraft(d: DetailsDraft, commission: boolean): CommissionDetails | null {
  const out: CommissionDetails = {}
  const sections = d.sections
    .map(s => ({ title: s.title.trim(), items: s.items.map(i => ({ label: i.label.trim(), value: i.value.trim() })).filter(i => i.label && i.value) }))
    .filter(s => s.title && s.items.length)
  if (sections.length) out.sections = sections
  if (commission) {
    const formats = d.formats.filter(f => f.name.trim() && f.price !== '').map(f => ({ name: f.name.trim(), price: Number(f.price) }))
    const addons = d.addons.filter(a => a.name.trim() && a.price !== '')
      .map(a => ({ name: a.name.trim(), ...(a.hint.trim() ? { hint: a.hint.trim() } : {}), price: Number(a.price) }))
    if (formats.length) out.formats = formats
    if (addons.length) out.addons = addons
    if (list(d.draws).length) out.draws = list(d.draws)
    if (list(d.doesntDraw).length) out.doesntDraw = list(d.doesntDraw)
    const terms = Object.fromEntries(Object.entries(d.terms).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v))
    if (Object.keys(terms).length) out.terms = terms
  }
  return Object.keys(out).length ? out : null
}
