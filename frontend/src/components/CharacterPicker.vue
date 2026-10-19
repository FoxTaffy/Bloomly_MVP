<template>
  <div class="stack-y-2">
    <label class="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center justify-between">
      <span>Персонажи <span class="normal-case tracking-normal font-medium text-white/25">· необязательно</span></span>
      <span class="normal-case tracking-normal font-medium text-white/25 tabular-nums">{{ modelValue.length }}/{{ MAX }}</span>
    </label>

    <!-- Выбранные -->
    <div v-for="(c, i) in modelValue" :key="i" class="rounded-2xl border border-brand-border bg-brand-bg p-3">
      <div class="flex items-center gap-3">
        <img v-if="info(c)?.user.avatar_url" :src="info(c)!.user.avatar_url!" class="w-10 h-10 rounded-xl object-cover shrink-0" />
        <div v-else class="w-10 h-10 rounded-xl bg-brand-accent/20 flex items-center justify-center text-sm font-extrabold text-brand-accent shrink-0">
          {{ (info(c)?.user.display_name || info(c)?.user.username || '?')[0].toUpperCase() }}
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold text-white truncate">
            {{ fursonaOf(c)?.name || info(c)?.user.display_name || info(c)?.user.username }}
            <span v-if="info(c)?.isSelf" class="text-[10px] text-brand-accent font-bold ml-1">это вы</span>
          </p>
          <p class="text-xs text-white/40 truncate">@{{ info(c)?.user.username }}</p>
        </div>
        <button type="button" class="w-7 h-7 rounded-lg text-white/30 hover:text-brand-error hover:bg-brand-error/10 flex items-center justify-center transition-colors"
          @click="remove(i)"><BIcon name="X" class="w-4 h-4" /></button>
      </div>

      <!-- Несколько персонажей у пользователя -->
      <div v-if="(info(c)?.fursonas.length ?? 0) > 1" class="flex flex-wrap gap-1.5 mt-2.5">
        <button v-for="f in info(c)!.fursonas" :key="f.id" type="button" @click="setFursona(i, f.id)"
          :class="['text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors',
            (c.fursonaId ?? info(c)!.fursonas[0].id) === f.id ? 'border-brand-accent/60 bg-brand-accent/15 text-brand-accent' : 'border-brand-border bg-white/4 text-white/55 hover:text-white']">
          {{ f.name || 'Без имени' }}
        </button>
      </div>

      <!-- Реф подключён автоматически / или профиль + добавить реф -->
      <div class="mt-2.5">
        <div v-if="refCount(c) > 0" class="flex items-center gap-2">
          <img v-if="fursonaOf(c)?.cover" :src="fursonaOf(c)!.cover!" class="w-12 h-12 rounded-lg object-cover border border-white/10" />
          <p class="text-[11px] text-brand-success flex items-center gap-1">
            <BIcon name="CheckCircle2" class="w-3.5 h-3.5" /> Реф подключён из профиля ({{ refCount(c) }})
          </p>
        </div>
        <p v-else class="text-[11px] text-white/45 leading-relaxed">
          У персонажа нет рефа — художник увидит профиль @{{ info(c)?.user.username }}. Можно добавить реф сюда:
        </p>
        <div v-if="refCount(c) === 0" class="mt-2 flex flex-wrap items-center gap-2">
          <img v-for="u in c.extraImages" :key="u" :src="u" class="w-12 h-12 rounded-lg object-cover border border-white/10" />
          <MediaUpload v-if="c.extraImages.length < 4" type="posts" accept="image/*" :max-files="1"
            @uploaded="(urls: string[]) => addExtra(i, urls)" />
        </div>
      </div>
    </div>

    <!-- Выбор -->
    <div v-if="picking" class="rounded-2xl border border-brand-accent/30 bg-brand-bg p-2 max-h-56 overflow-y-auto">
      <div v-if="loading" class="py-4 flex justify-center"><div class="w-5 h-5 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" /></div>
      <p v-else-if="!available.length" class="text-xs text-white/40 text-center py-3">Больше некого добавить</p>
      <button v-for="o in available" :key="o.user.id" type="button" @click="add(o)"
        class="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-white/5 transition-colors text-left">
        <img v-if="o.user.avatar_url" :src="o.user.avatar_url" class="w-8 h-8 rounded-lg object-cover shrink-0" />
        <div v-else class="w-8 h-8 rounded-lg bg-brand-accent/20 flex items-center justify-center text-xs font-extrabold text-brand-accent shrink-0">{{ (o.user.display_name || o.user.username)[0].toUpperCase() }}</div>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold text-white truncate">{{ o.isSelf ? 'Я сам(а)' : (o.user.display_name || o.user.username) }}</p>
          <p class="text-[11px] text-white/35 truncate">
            {{ o.fursonas.length ? o.fursonas.map(f => f.name || 'Без имени').join(', ') : 'персонажа нет — будет профиль' }}
          </p>
        </div>
      </button>
    </div>

    <button v-if="modelValue.length < MAX" type="button" @click="togglePicking"
      class="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-dashed border-brand-border text-white/50 text-xs font-bold hover:border-brand-accent/50 hover:text-white transition-colors">
      <BIcon :name="picking ? 'ChevronUp' : 'Plus'" class="w-4 h-4" /> {{ picking ? 'Свернуть' : 'Добавить персонажа' }}
    </button>
    <p v-if="!modelValue.length && !picking" class="text-[11px] text-white/30 leading-relaxed">Выберите себя или друга — его реф подключится сам.</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import BIcon from '@/components/BIcon.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import { useListingApplicationsStore, type CharacterDraft, type CharacterOption } from '@/stores/listingApplications'

const MAX = 5
const props = defineProps<{ modelValue: CharacterDraft[] }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: CharacterDraft[]): void }>()

const store = useListingApplicationsStore()
const options = ref<CharacterOption[]>([])
const loading = ref(false)
const picking = ref(false)

const available = computed(() => options.value.filter(o => !props.modelValue.some(c => c.userId === o.user.id)))
const info = (c: CharacterDraft) => options.value.find(o => o.user.id === c.userId)
const fursonaOf = (c: CharacterDraft) => {
  const o = info(c)
  return o ? (o.fursonas.find(f => f.id === c.fursonaId) ?? o.fursonas[0]) : undefined
}
const refCount = (c: CharacterDraft) => fursonaOf(c)?.refCount ?? 0

async function togglePicking() {
  picking.value = !picking.value
  if (picking.value && !options.value.length) {
    loading.value = true
    try { options.value = await store.fetchCharacterOptions() } catch { options.value = [] } finally { loading.value = false }
  }
}

function add(o: CharacterOption) {
  emit('update:modelValue', [...props.modelValue, { userId: o.user.id, fursonaId: o.fursonas[0]?.id ?? null, extraImages: [] }])
  picking.value = false
}
function remove(i: number) { emit('update:modelValue', props.modelValue.filter((_, idx) => idx !== i)) }
function setFursona(i: number, id: string) {
  emit('update:modelValue', props.modelValue.map((c, idx) => idx === i ? { ...c, fursonaId: id, extraImages: [] } : c))
}
function addExtra(i: number, urls: string[]) {
  emit('update:modelValue', props.modelValue.map((c, idx) => idx === i ? { ...c, extraImages: [...c.extraImages, ...urls].slice(0, 4) } : c))
}
</script>
