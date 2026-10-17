<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useLangStore } from '@/stores/lang'
import type { Lang } from '@/locales/translations'

const langStore = useLangStore()
const open = ref(false)
const containerRef = ref<HTMLElement | null>(null)

const langs: { code: Lang; flag: string; label: string }[] = [
  { code: 'RU', flag: '🇷🇺', label: 'RU' },
  { code: 'EN', flag: '🇬🇧', label: 'EN' },
  { code: 'JP', flag: '🇯🇵', label: 'JP' },
  { code: 'CN', flag: '🇨🇳', label: 'CN' },
  { code: 'DE', flag: '🇩🇪', label: 'DE' },
  { code: 'FR', flag: '🇫🇷', label: 'FR' },
  { code: 'ES', flag: '🇪🇸', label: 'ES' },
  { code: 'PT', flag: '🇵🇹', label: 'PT' },
]

const currentEntry = () => langs.find(l => l.code === langStore.currentLang) ?? langs[0]

function select(code: Lang) {
  langStore.setLang(code)
  open.value = false
}

function onClickOutside(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside))
</script>

<template>
  <div ref="containerRef" class="lang-widget">
    <!-- Trigger button -->
    <button
      @click="open = !open"
      class="lang-trigger"
      :title="currentEntry().label"
    >
      <span class="flag">{{ currentEntry().flag }}</span>
      <span class="label">{{ currentEntry().label }}</span>
      <svg
        class="chevron"
        :class="{ 'is-open': open }"
        viewBox="0 0 20 20" fill="currentColor"
      >
        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd"/>
      </svg>
    </button>

    <!-- Dropdown -->
    <Transition name="popup">
      <div v-if="open" class="lang-popup">
        <button
          v-for="lang in langs"
          :key="lang.code"
          @click="select(lang.code)"
          class="lang-item"
          :class="{ active: langStore.currentLang === lang.code }"
        >
          <span class="item-flag">{{ lang.flag }}</span>
          <span class="item-label">{{ lang.label }}</span>
          <svg v-if="langStore.currentLang === lang.code" class="check" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
          </svg>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.lang-widget {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  font-family: inherit;
}

.lang-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 14px;
  background: rgba(12, 15, 32, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(20px);
  color: rgba(255, 255, 255, 0.75);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  letter-spacing: 0.03em;
}

.lang-trigger:hover {
  background: rgba(76, 103, 207, 0.25);
  border-color: rgba(76, 103, 207, 0.5);
  color: white;
  box-shadow: 0 6px 24px rgba(76, 103, 207, 0.3);
}

.flag { font-size: 18px; line-height: 1; }
.label { font-size: 12px; font-weight: 800; letter-spacing: 0.05em; }

.chevron {
  width: 14px;
  height: 14px;
  opacity: 0.5;
  transition: transform 0.25s ease;
}
.chevron.is-open { transform: rotate(180deg); }

.lang-popup {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  min-width: 120px;
  background: rgba(12, 15, 36, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  backdrop-filter: blur(32px);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(76, 103, 207, 0.12);
  overflow: hidden;
  padding: 6px;
}

.lang-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
}

.lang-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: white;
}

.lang-item.active {
  background: rgba(76, 103, 207, 0.2);
  color: white;
}

.item-flag { font-size: 17px; flex-shrink: 0; }
.item-label { flex: 1; letter-spacing: 0.04em; }

.check {
  width: 14px;
  height: 14px;
  color: #7b9cff;
  flex-shrink: 0;
}

/* Transition */
.popup-enter-active { transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1); }
.popup-leave-active { transition: all 0.15s ease-in; }
.popup-enter-from { opacity: 0; transform: scale(0.92) translateY(6px); transform-origin: bottom right; }
.popup-leave-to   { opacity: 0; transform: scale(0.95) translateY(4px); transform-origin: bottom right; }
</style>
