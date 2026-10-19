/**
 * Единая «шторка» вместо системного выпадающего списка для всех <select> на сайте.
 * Нативный <select> остаётся в DOM (v-model продолжает работать): при открытии мы
 * перехватываем событие, показываем свою панель, а выбор пишем обратно в select
 * и шлём input/change. Исключения: multiple, size>1 и select с data-native.
 */

let panel: HTMLDivElement | null = null
let current: HTMLSelectElement | null = null
let active = -1

function eligible(el: EventTarget | null): el is HTMLSelectElement {
  return el instanceof HTMLSelectElement && !el.multiple && el.size <= 1 && !el.disabled && !('native' in el.dataset)
}

function close() {
  if (!panel) return
  panel.remove()
  panel = null
  current?.focus({ preventScroll: true })
  current = null
  active = -1
}

function items(): HTMLElement[] {
  return panel ? Array.from(panel.querySelectorAll<HTMLElement>('[data-opt]:not([data-disabled])')) : []
}

function highlight(i: number) {
  const list = items()
  if (!list.length) return
  active = (i + list.length) % list.length
  list.forEach((n, idx) => n.classList.toggle('bsel-active', idx === active))
  list[active].scrollIntoView({ block: 'nearest' })
}

function choose(select: HTMLSelectElement, index: number) {
  if (select.selectedIndex !== index) {
    select.selectedIndex = index
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }
  close()
}

function build(select: HTMLSelectElement) {
  const el = document.createElement('div')
  el.className = 'bsel-panel'
  el.setAttribute('role', 'listbox')

  const addOption = (opt: HTMLOptionElement, parent: HTMLElement) => {
    const row = document.createElement('div')
    row.className = 'bsel-opt'
    row.dataset.opt = String(opt.index)
    row.setAttribute('role', 'option')
    if (opt.disabled || opt.parentElement instanceof HTMLOptGroupElement && opt.parentElement.disabled) {
      row.dataset.disabled = '1'
    }
    const selected = opt.index === select.selectedIndex
    if (selected) row.classList.add('bsel-selected')
    const text = document.createElement('span')
    text.className = 'bsel-text'
    text.textContent = opt.textContent
    row.appendChild(text)
    if (selected) {
      const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      check.setAttribute('viewBox', '0 0 24 24')
      check.setAttribute('class', 'bsel-check')
      check.innerHTML = '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'
      row.appendChild(check)
    }
    parent.appendChild(row)
  }

  for (const child of Array.from(select.children)) {
    if (child instanceof HTMLOptGroupElement) {
      const label = document.createElement('div')
      label.className = 'bsel-group'
      label.textContent = child.label
      el.appendChild(label)
      Array.from(child.children).forEach(o => o instanceof HTMLOptionElement && addOption(o, el))
    } else if (child instanceof HTMLOptionElement) {
      addOption(child, el)
    }
  }
  return el
}

function open(select: HTMLSelectElement) {
  if (panel) close()
  current = select
  panel = build(select)
  document.body.appendChild(panel)

  const r = select.getBoundingClientRect()
  const gap = 6
  const margin = 12
  const below = window.innerHeight - r.bottom - margin
  const above = r.top - margin
  const flip = below < 200 && above > below
  const maxH = Math.max(140, Math.min(320, flip ? above - gap : below - gap))
  const width = Math.max(r.width, 180)
  const left = Math.min(Math.max(margin / 2, r.left), window.innerWidth - width - margin / 2)

  panel.style.width = `${width}px`
  panel.style.left = `${left}px`
  panel.style.maxHeight = `${maxH}px`
  if (flip) {
    panel.style.bottom = `${window.innerHeight - r.top + gap}px`
    panel.classList.add('bsel-up')
  } else {
    panel.style.top = `${r.bottom + gap}px`
  }

  const sel = panel.querySelector<HTMLElement>('.bsel-selected')
  highlight(sel ? items().indexOf(sel) : 0)
}

export function installCustomSelect() {
  document.addEventListener('mousedown', (e) => {
    const target = e.target as Element | null
    if (panel && target && panel.contains(target)) { e.stopPropagation(); return }
    const select = target?.closest?.('select') ?? null
    if (eligible(select)) {
      e.preventDefault()
      if (panel && current === select) close()
      else open(select)
      return
    }
    if (panel) close()
  }, true)

  document.addEventListener('click', (e) => {
    const t = e.target as Element | null
    if (t?.closest?.('select') && eligible(t.closest('select'))) e.preventDefault()
    const row = t?.closest?.<HTMLElement>('.bsel-opt')
    if (row && panel) {
      // панель вне модалок: не даём click-outside закрыть окно под ней
      e.stopPropagation()
      if (current && !row.dataset.disabled) choose(current, Number(row.dataset.opt))
    }
  }, true)

  document.addEventListener('mousemove', (e) => {
    const row = (e.target as Element | null)?.closest?.<HTMLElement>('.bsel-opt')
    if (row && !row.dataset.disabled) highlight(items().indexOf(row))
  })

  document.addEventListener('keydown', (e) => {
    if (panel && current) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
      else if (e.key === 'ArrowDown') { e.preventDefault(); highlight(active + 1) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(active - 1) }
      else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const row = items()[active]
        if (row) choose(current, Number(row.dataset.opt))
      } else if (e.key === 'Tab') close()
      return
    }
    if (eligible(e.target) && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      open(e.target)
    }
  }, true)

  window.addEventListener('resize', close)
  window.addEventListener('scroll', (e) => {
    if (panel && !(e.target instanceof Node && panel.contains(e.target))) close()
  }, true)
}
