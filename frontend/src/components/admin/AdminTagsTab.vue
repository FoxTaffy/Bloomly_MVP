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
    <div class="rounded-3xl border border-brand-border p-5 mb-5" style="background:#1F223C">
      <p class="text-sm font-bold text-white/85 mb-1">Добавить синоним</p>
      <p class="text-xs text-white/40 mb-4">
        Теги в постах не меняются. Синонимы объединяются в популярных тегах и в поиске, если включён переключатель «Синонимы тегов».
        Варианты, отличающиеся только «_» и «-» (furry_art, furry-art, furryart), склеиваются автоматически.
      </p>
      <form class="flex flex-col sm:flex-row gap-2" @submit.prevent="add">
        <input v-model="form.alias" type="text" placeholder="Синонимы через запятую: лиса, лисица, foxes"
          class="adm-input flex-1 min-w-0" />
        <div class="flex items-center justify-center text-white/30"><BIcon name="ArrowRight" class="w-4 h-4 rotate-90 sm:rotate-0" /></div>
        <input v-model="form.canonical" type="text" placeholder="Основной тег: fox" class="adm-input sm:w-48" />
        <button type="submit" :disabled="saving"
          class="px-4 py-2 rounded-xl text-xs font-bold bg-brand-accent text-white disabled:opacity-50 hover:brightness-110 transition-all shrink-0">
          {{ saving ? 'Сохранение…' : 'Добавить' }}
        </button>
      </form>
      <p v-if="error" class="text-xs text-brand-error mt-3">{{ error }}</p>
    </div>

    <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
      <div class="px-5 py-3 border-b border-brand-border flex items-center gap-3">
        <BIcon name="Search" class="w-4 h-4 text-white/30" />
        <input v-model="filter" type="text" placeholder="Найти тег" class="flex-1 bg-transparent text-sm text-white placeholder-white/25 outline-hidden" />
        <span class="text-xs text-white/30">{{ synonyms.length }}</span>
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
