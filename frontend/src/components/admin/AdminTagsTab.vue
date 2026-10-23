<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import api from '@/api'
import { apiErrorMessage } from '@/lib/apiError'
import BIcon from '@/components/BIcon.vue'

// Синонимы хештегов: «лиса → fox». Теги в постах не меняются — синонимы объединяются
// в популярных тегах и в поиске с включённым переключателем «Синонимы тегов».
interface Synonym { alias: string; canonical: string; created_at: string }

const synonyms = ref<Synonym[]>([])
const loading = ref(false)
const error = ref('')
const form = ref({ alias: '', canonical: '' })
const saving = ref(false)
const filter = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.get('/tags/synonyms')
    synonyms.value = res.data.data?.synonyms ?? []
  } catch (e) {
    error.value = apiErrorMessage(e) ?? 'Не удалось загрузить синонимы'
  } finally {
    loading.value = false
  }
}
onMounted(load)

// Группы по основному тегу: fox ← лиса, лисица, foxes
const groups = computed(() => {
  const q = filter.value.trim().toLowerCase().replace(/^#/, '')
  const map = new Map<string, string[]>()
  for (const s of synonyms.value) {
    if (q && !s.alias.includes(q) && !s.canonical.includes(q)) continue
    if (!map.has(s.canonical)) map.set(s.canonical, [])
    map.get(s.canonical)!.push(s.alias)
  }
  return [...map.entries()].map(([canonical, aliases]) => ({ canonical, aliases }))
})

const previewAliases = computed(() =>
  form.value.alias.split(',').map((a) => a.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '_')).filter(Boolean).slice(0, 12))

async function add() {
  // Несколько синонимов через запятую: «лиса, лисица, foxes» → fox
  const aliases = form.value.alias.split(',').map((a) => a.trim()).filter(Boolean)
  const canonical = form.value.canonical.trim()
  if (!aliases.length || !canonical) { error.value = 'Укажите синонимы и основной тег'; return }
  saving.value = true
  error.value = ''
  const failed: string[] = []
  for (const alias of aliases) {
    try {
      await api.post('/tags/synonyms', { alias, canonical })
    } catch (e) {
      failed.push(`${alias}: ${apiErrorMessage(e) ?? 'ошибка'}`)
    }
  }
  saving.value = false
  if (failed.length) error.value = failed.join('; ')
  else form.value.alias = ''
  await load()
}

async function remove(alias: string) {
  try {
    await api.delete(`/tags/synonyms/${encodeURIComponent(alias)}`)
    synonyms.value = synonyms.value.filter((s) => s.alias !== alias)
  } catch (e) {
    error.value = apiErrorMessage(e) ?? 'Не удалось удалить синоним'
  }
}
</script>

<template>
  <div>
    <div class="rounded-3xl border border-brand-border p-4 sm:p-5 mb-5" style="background:#1F223C">
      <div class="flex items-start gap-3 mb-4">
        <div class="w-9 h-9 rounded-xl bg-brand-accent/15 flex items-center justify-center shrink-0">
          <BIcon name="Hash" class="w-4 h-4 text-brand-accent" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-bold text-white/90">Добавить синоним</p>
          <p class="text-xs text-white/40 mt-0.5 leading-relaxed">
            Теги в постах не меняются: синонимы объединяются в популярных тегах и в поиске. Варианты, отличающиеся только «_» и «-» (furry_art, furry-art, furryart), склеиваются сами.
          </p>
        </div>
      </div>
      <form class="grid grid-cols-1 md:grid-cols-[1fr_auto_minmax(0,14rem)_auto] gap-3 md:items-end" @submit.prevent="add">
        <label class="block min-w-0">
          <span class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Синонимы</span>
          <input v-model="form.alias" type="text" placeholder="лиса, лисица, foxes" class="adm-input" />
        </label>
        <div class="hidden md:flex h-[42px] items-center text-white/30"><BIcon name="ArrowRight" class="w-4 h-4" /></div>
        <label class="block min-w-0">
          <span class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Основной тег</span>
          <input v-model="form.canonical" type="text" placeholder="fox" class="adm-input" />
        </label>
        <button type="submit" :disabled="saving"
          class="h-[42px] px-5 rounded-2xl text-sm font-bold bg-brand-accent text-white disabled:opacity-50 hover:brightness-110 transition-all">
          {{ saving ? 'Сохранение…' : 'Добавить' }}
        </button>
      </form>
      <div v-if="previewAliases.length" class="flex flex-wrap items-center gap-1.5 mt-3">
        <span class="text-[11px] text-white/35">Будет объединено:</span>
        <span v-for="a in previewAliases" :key="a" class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white/5 border border-white/8 text-white/65">#{{ a }}</span>
        <BIcon name="ArrowRight" class="w-3 h-3 text-white/30" />
        <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-brand-accent/15 border border-brand-accent/25 text-brand-accent">#{{ form.canonical.trim().replace(/^#/, '').toLowerCase() || '…' }}</span>
      </div>
      <p v-if="error" class="text-xs text-brand-error mt-3">{{ error }}</p>
    </div>

    <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
      <div class="px-5 py-3 border-b border-brand-border flex items-center gap-3">
        <BIcon name="Search" class="w-4 h-4 text-white/30" />
        <input v-model="filter" type="text" placeholder="Найти тег" class="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-hidden" />
        <span class="text-xs text-white/30 shrink-0">{{ groups.length }} тегов · {{ synonyms.length }} синонимов</span>
      </div>
      <div v-if="loading" class="p-5 text-xs text-white/40">Загрузка…</div>
      <div v-else-if="!groups.length" class="p-8 text-center text-sm text-white/40">
        {{ filter ? 'Ничего не найдено' : 'Синонимов пока нет' }}
      </div>
      <div v-else class="divide-y divide-brand-border">
        <div v-for="g in groups" :key="g.canonical" class="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
          <span class="text-sm font-bold text-white sm:w-48 shrink-0">#{{ g.canonical }}</span>
          <div class="flex flex-wrap gap-1.5">
            <span v-for="a in g.aliases" :key="a"
              class="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-xs font-semibold bg-white/5 border border-white/8 text-white/70">
              #{{ a }}
              <button type="button" :title="`Убрать синоним #${a}`" @click="remove(a)"
                class="w-4 h-4 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-rose-500/60">
                <BIcon name="X" class="w-3 h-3" />
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./admin-shared.css"></style>
