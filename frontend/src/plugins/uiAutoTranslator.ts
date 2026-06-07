/**
 * DOM-level UI auto-translator.
 *
 * When the app language is not Russian, this plugin:
 * 1. Scans text nodes for Cyrillic and translates via MyMemory API
 * 2. Caches results in localStorage — repeat visits are instant
 * 3. Handles Vue re-renders (characterData mutations)
 * 4. Restores originals when switching languages (CN→JP restores RU first, then re-translates)
 */

import { ref, watch } from 'vue'
import { useLangStore } from '@/stores/lang'
import { translateText } from '@/composables/useAutoTranslate'
import { lookupLocal } from '@/locales/uiDict'
import type { Lang } from '@/locales/translations'

// Reactive flag — true while API calls are in progress
export const isTranslatingUI = ref(false)

// ─── Config ───────────────────────────────────────────────────────────────────

const CACHE_KEY = 'bloomly_ui_tc_v2'
const CYRILLIC = /[Ѐ-ӿ]/
const MIN_LEN   = 2
const MAX_LEN   = 250   // MyMemory free tier limit
const DELAY_MS  = 220   // min gap between API calls

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'CANVAS',
  'INPUT', 'TEXTAREA', 'SELECT', 'OPTION',
  'CODE', 'PRE', 'KBD', 'SAMP',
])

// ─── Cache ────────────────────────────────────────────────────────────────────

let mem: Record<string, string> = {}
let savePending = false

function loadCache() {
  try { mem = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') } catch { mem = {} }
}

function saveCache() {
  if (savePending) return
  savePending = true
  setTimeout(() => {
    try {
      // Evict oldest 20 % if over 2 000 entries
      const keys = Object.keys(mem)
      if (keys.length > 2000) keys.slice(0, 400).forEach(k => delete mem[k])
      localStorage.setItem(CACHE_KEY, JSON.stringify(mem))
    } catch { /* full – ignore */ }
    savePending = false
  }, 1000)
}

const ck = (text: string, lang: string) => `${lang}|${text.trim()}`

// ─── State ────────────────────────────────────────────────────────────────────

// node → original full textContent (before any translation)
const origMap = new Map<Text, string>()

const queue: Text[] = []
let draining = false
let flushT: ReturnType<typeof setTimeout> | null = null
let mo: MutationObserver | null = null
let lang: Lang = 'RU'

// ─── Observer control ─────────────────────────────────────────────────────────

function pause(fn: () => void) {
  mo?.disconnect()
  fn()
  reconnect()
}

function reconnect() {
  mo?.observe(document.body, { childList: true, subtree: true, characterData: true })
}

// ─── Apply / restore ──────────────────────────────────────────────────────────

function applyToNode(node: Text, translated: string) {
  // Save full original on first translation
  if (!origMap.has(node)) origMap.set(node, node.textContent ?? '')

  const orig = origMap.get(node)!
  const trimmedOrig = orig.trim()

  // Replace trimmed part while preserving surrounding whitespace
  const newText = orig.replace(trimmedOrig, translated)

  pause(() => { if (node.isConnected) node.textContent = newText })
}

function restoreAll() {
  pause(() => {
    origMap.forEach((orig, node) => {
      if (node.isConnected) node.textContent = orig
    })
    origMap.clear()
  })
}

// ─── Queue & drain ─────────────────────────────────────────────────────────────

function enqueue(node: Text) {
  if (!queue.includes(node)) queue.push(node)
}

function flush() {
  if (flushT) clearTimeout(flushT)
  flushT = setTimeout(() => drain(), 120)
}

async function drain() {
  if (draining || lang === 'RU' || !queue.length) return
  draining = true
  isTranslatingUI.value = true

  const target = lang  // capture — user may change mid-drain

  while (queue.length && lang === target) {
    const node = queue.shift()!
    if (!node.isConnected) continue

    const fullText = node.textContent ?? ''
    const trimmed  = fullText.trim()

    if (!trimmed || trimmed.length < MIN_LEN || !CYRILLIC.test(trimmed)) continue

    const key = ck(trimmed, target)

    // 1. Local dictionary — instant, no network
    const local = lookupLocal(trimmed, target as Exclude<Lang, 'RU'>)
    if (local) {
      applyToNode(node, local)
      mem[key] = local  // also store in mem cache for characterData re-renders
      continue
    }

    // 2. Memory / localStorage cache — instant
    if (mem[key]) {
      applyToNode(node, mem[key])
      continue
    }

    // 3. MyMemory API — only for strings not in local dict
    const result = await translateText(trimmed.slice(0, MAX_LEN), target)
    if (result && node.isConnected && lang === target) {
      mem[key] = result
      saveCache()
      applyToNode(node, result)
    }

    await new Promise<void>(r => setTimeout(r, DELAY_MS))
  }

  draining = false
  isTranslatingUI.value = false

  // New nodes may have appeared while draining
  if (queue.length && lang !== 'RU') drain()
}

// ─── DOM walker ───────────────────────────────────────────────────────────────

function shouldSkip(node: Text): boolean {
  let el: Element | null = node.parentElement
  while (el) {
    if (SKIP_TAGS.has(el.tagName)) return true
    if ((el as HTMLElement).dataset?.noTranslate !== undefined) return true
    el = el.parentElement
  }
  return false
}

function walk(root: Node) {
  if (lang === 'RU') return

  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (shouldSkip(node as Text)) return NodeFilter.FILTER_REJECT
      const t = (node.textContent ?? '').trim()
      if (!t || t.length < MIN_LEN || !CYRILLIC.test(t)) return NodeFilter.FILTER_SKIP
      return NodeFilter.FILTER_ACCEPT
    },
  })

  const found: Text[] = []
  let cur: Node | null
  while ((cur = tw.nextNode())) found.push(cur as Text)

  if (found.length) {
    found.forEach(enqueue)
    flush()
  }
}

// ─── MutationObserver ─────────────────────────────────────────────────────────

function onMutations(muts: MutationRecord[]) {
  if (lang === 'RU') return
  let dirty = false

  for (const m of muts) {
    if (m.type === 'childList') {
      m.addedNodes.forEach(n => {
        if (n.nodeType === Node.TEXT_NODE) {
          const t = (n.textContent ?? '').trim()
          if (t && CYRILLIC.test(t) && !shouldSkip(n as Text)) { enqueue(n as Text); dirty = true }
        } else if (n.nodeType === Node.ELEMENT_NODE) {
          walk(n); dirty = true
        }
      })
    } else if (m.type === 'characterData') {
      const node = m.target as Text
      const cur  = node.textContent ?? ''
      const orig = origMap.get(node)

      if (orig && CYRILLIC.test(cur)) {
        // Vue re-rendered original Russian — re-apply translation
        const origTrimmed = orig.trim()
        const local = lookupLocal(origTrimmed, lang as Exclude<Lang, 'RU'>)
        if (local) {
          applyToNode(node, local)
        } else {
          const key = ck(origTrimmed, lang)
          if (mem[key]) {
            applyToNode(node, mem[key])
          } else {
            enqueue(node); dirty = true
          }
        }
      } else if (!orig && CYRILLIC.test(cur) && !shouldSkip(node)) {
        enqueue(node); dirty = true
      }
    }
  }

  if (dirty) flush()
}

// ─── Public init ──────────────────────────────────────────────────────────────

export function initUIAutoTranslator() {
  loadCache()

  const langStore = useLangStore()
  lang = langStore.currentLang

  watch(() => langStore.currentLang, (newLang) => {
    lang = newLang

    // Stop any running drain
    queue.length = 0
    draining = false
    if (flushT) { clearTimeout(flushT); flushT = null }

    // Always restore originals first (handles CN→JP correctly)
    restoreAll()

    if (newLang !== 'RU') {
      // Re-scan after Vue has re-rendered (langStore.t keys have updated)
      setTimeout(() => walk(document.body), 250)
    }
  })

  // Initial scan if already on a non-RU language
  if (lang !== 'RU') {
    setTimeout(() => walk(document.body), 400)
  }

  // Boot observer
  mo = new MutationObserver(onMutations)
  reconnect()
}
