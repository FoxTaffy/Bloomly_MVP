<script setup lang="ts">
import BIcon from '@/components/BIcon.vue'
import { onMounted } from 'vue'
import { apiErrorMessage } from '@/lib/apiError'
import { usePushNotifications } from '@/composables/usePushNotifications'

// Системные уведомления браузера (Web Push): сообщения и события, даже когда вкладка закрыта.
const emit = defineEmits<{ (e: 'toast', type: 'success' | 'error', message: string): void }>()
const push = usePushNotifications()

async function toggle() {
  try {
    if (push.enabled.value) {
      await push.disable()
      emit('toast', 'success', 'Уведомления в браузере выключены')
      return
    }
    const r = await push.enable()
    if (r === 'ok') emit('toast', 'success', 'Уведомления в браузере включены')
    else if (r === 'denied') emit('toast', 'error', 'Разрешите уведомления для сайта в настройках браузера')
    else if (r === 'unsupported') emit('toast', 'error', 'Браузер не поддерживает уведомления')
    else emit('toast', 'error', 'Уведомления на сервере не настроены')
  } catch (e) {
    emit('toast', 'error', apiErrorMessage(e) || 'Не удалось изменить уведомления')
  }
}

async function togglePref(key: 'messages' | 'events') {
  try { await push.setPref(key, !push.prefs.value[key]) }
  catch (e) { emit('toast', 'error', apiErrorMessage(e) || 'Не удалось сохранить настройку') }
}

onMounted(() => { void push.refresh(); void push.loadPrefs() })
</script>

<template>
  <section id="sec-notifications" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
    <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3">
      <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-brand-accent/15">
        <BIcon name="Bell" class="w-4 h-4 text-brand-accent" />
      </div>
      <div>
        <h2 class="font-bold text-white text-sm">Уведомления в браузере</h2>
        <p class="text-xs text-white/40 mt-0.5">Сообщения и события приходят системным уведомлением, даже если вкладка закрыта</p>
      </div>
    </div>
    <div class="p-6">
      <p v-if="!push.supported" data-testid="push-unsupported" class="text-sm text-white/50">Этот браузер не поддерживает push-уведомления.</p>
      <template v-else>
        <div class="flex items-center gap-4">
          <div class="flex-1 min-w-0 text-sm text-white/60">
            <template v-if="push.permission.value === 'denied'">Уведомления заблокированы в браузере: разрешите их для этого сайта в настройках.</template>
            <template v-else-if="push.enabled.value">Включены на этом устройстве.</template>
            <template v-else>Выключены на этом устройстве.</template>
          </div>
          <button type="button" data-testid="push-toggle" :disabled="push.busy.value" @click="toggle"
            class="px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            :class="push.enabled.value ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-brand-accent text-white hover:opacity-90'">
            {{ push.enabled.value ? 'Выключить' : 'Включить' }}
          </button>
        </div>
        <div v-if="push.enabled.value" class="mt-5 space-y-3 border-t border-brand-border pt-5">
          <label v-for="row in [
            { key: 'messages', title: 'Новые сообщения', desc: 'Личные сообщения и беседы' },
            { key: 'events', title: 'События', desc: 'Подписки, комментарии, заявки, Dealers\' Den' },
          ] as const" :key="row.key" class="flex items-center gap-4 cursor-pointer">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold text-white">{{ row.title }}</div>
              <div class="text-xs text-white/40">{{ row.desc }}</div>
            </div>
            <input type="checkbox" :data-testid="'push-pref-' + row.key" :checked="push.prefs.value[row.key]" @change="togglePref(row.key)"
              class="w-5 h-5 accent-brand-accent" />
          </label>
          <p class="text-xs text-white/30">Уведомления от модерации и администрации приходят всегда.</p>
        </div>
      </template>
    </div>
  </section>
</template>
