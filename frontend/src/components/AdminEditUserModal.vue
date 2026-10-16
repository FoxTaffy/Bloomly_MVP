<script setup lang="ts">
import { apiErrorMessage } from '@/lib/apiError'
import { ref, computed } from 'vue'
import api from '../api'
import BIcon from './BIcon.vue'

// Staff editor for another user's public profile. Only changed fields are sent.
const props = defineProps<{ user: any }>()
const emit = defineEmits<{ close: []; saved: [patch: Record<string, string>] }>()

const FIELDS: { key: string; label: string; multiline?: boolean; max: number }[] = [
  { key: 'username',     label: 'Никнейм',          max: 30 },
  { key: 'display_name', label: 'Отображаемое имя', max: 50 },
  { key: 'status',       label: 'Статус',           max: 100 },
  { key: 'bio',          label: 'О себе',           max: 300, multiline: true },
  { key: 'pronouns',     label: 'Местоимения',      max: 30 },
  { key: 'location',     label: 'Местоположение',   max: 100 },
  { key: 'country',      label: 'Страна',           max: 80 },
  { key: 'job_title',    label: 'Должность',        max: 80 },
  { key: 'website',      label: 'Сайт',             max: 200 },
]

const form = ref<Record<string, string>>(
  Object.fromEntries(FIELDS.map(f => [f.key, props.user?.[f.key] ?? '']))
)
const isSaving = ref(false)
const error = ref('')

const changedPatch = computed(() => {
  const patch: Record<string, string> = {}
  for (const f of FIELDS) {
    const next = (form.value[f.key] ?? '').trim()
    const prev = (props.user?.[f.key] ?? '').toString().trim()
    if (next !== prev) patch[f.key] = next
  }
  return patch
})

const save = async () => {
  const patch = changedPatch.value
  if (Object.keys(patch).length === 0) { emit('close'); return }
  if (patch.username !== undefined && !/^[a-z0-9_]{3,30}$/.test(patch.username)) {
    error.value = 'Никнейм: 3–30 символов, только латиница в нижнем регистре, цифры и _'
    return
  }
  isSaving.value = true
  error.value = ''
  try {
    await api.patch(`/admin/users/${props.user.id}/profile`, patch)
    emit('saved', patch)
    emit('close')
  } catch (e) {
    error.value = apiErrorMessage(e) || 'Не удалось сохранить профиль'
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" @mousedown.self="emit('close')">
      <div class="w-full max-w-lg rounded-2xl bg-[#161F40] border border-white/10 shadow-2xl shadow-black/50 flex flex-col max-h-[90vh]">
        <div class="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div class="min-w-0">
            <p class="font-extrabold text-white text-sm">Редактирование профиля</p>
            <p class="text-xs text-white/40 truncate">@{{ user.username }}</p>
          </div>
          <button type="button" @click="emit('close')" class="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5">
            <BIcon name="X" class="w-4 h-4" />
          </button>
        </div>

        <div class="px-5 py-4 space-y-3 overflow-y-auto">
          <label v-for="f in FIELDS" :key="f.key" class="block">
            <span class="block text-[10px] font-extrabold uppercase tracking-wider text-white/40 mb-1">{{ f.label }}</span>
            <textarea v-if="f.multiline" v-model="form[f.key]" :maxlength="f.max" rows="3"
              class="w-full rounded-xl bg-white/[0.04] border border-white/10 focus:border-violet-400/50 outline-none px-3 py-2 text-sm text-white resize-none" />
            <input v-else v-model="form[f.key]" :maxlength="f.max" type="text"
              class="w-full rounded-xl bg-white/[0.04] border border-white/10 focus:border-violet-400/50 outline-none px-3 py-2 text-sm text-white" />
          </label>
          <p v-if="error" class="text-xs font-semibold text-rose-400">{{ error }}</p>
        </div>

        <div class="flex justify-end gap-2 px-5 py-4 border-t border-white/10">
          <button type="button" @click="emit('close')" class="px-4 py-2 rounded-xl text-xs font-bold text-white/60 hover:text-white hover:bg-white/5">
            Отмена
          </button>
          <button type="button" @click="save" :disabled="isSaving"
            class="px-4 py-2 rounded-xl text-xs font-bold bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white">
            {{ isSaving ? 'Сохранение…' : 'Сохранить' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
