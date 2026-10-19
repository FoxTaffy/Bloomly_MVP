<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-999 flex items-center justify-center p-4" @click.self="emit('close')">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-xs" />
      <div class="relative bg-brand-card border border-brand-border rounded-3xl p-6 max-w-md w-full shadow-2xl z-10 max-h-[90vh] overflow-y-auto">
        <button class="absolute top-3 right-3 w-8 h-8 rounded-xl bg-brand-bg/60 flex items-center justify-center hover:bg-brand-bg transition-colors z-20"
          @click="emit('close')">
          <BIcon name="X" class="w-4 h-4 text-white/50" />
        </button>

        <div class="flex items-center gap-3 mb-5 pr-10">
          <div class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-lg"
            style="background: linear-gradient(135deg, #4C67CF, #7c3aed)">
            <BIcon name="Pencil" class="w-5 h-5 text-white" />
          </div>
          <div class="min-w-0">
            <h2 class="text-xl font-extrabold text-white leading-tight">Заказ</h2>
            <p class="text-white/40 text-xs truncate">{{ order.title }} · {{ order.customer.display_name || order.customer.username }}</p>
          </div>
        </div>

        <div class="stack-y-5">
          <!-- Deadline -->
          <div class="stack-y-2">
            <label class="text-[10px] font-bold text-white/40 uppercase tracking-widest block">Дедлайн</label>
            <input v-model="date" type="date"
              class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm focus:border-brand-accent focus:outline-hidden transition-colors" />
            <p v-if="!order.started_at" class="text-[11px] text-white/35">Можно оставить пустым — срок попросим поставить, когда вы возьмёте заказ в работу.</p>
          </div>

          <!-- Description -->
          <div class="stack-y-2">
            <label class="text-[10px] font-bold text-white/40 uppercase tracking-widest block">Описание</label>
            <textarea v-model="description" rows="4" maxlength="2000"
              class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-white text-sm focus:border-brand-accent focus:outline-hidden resize-none transition-colors" />
          </div>

          <!-- Characters from the application -->
          <div v-if="order.characters?.length" class="stack-y-2">
            <label class="text-[10px] font-bold text-white/40 uppercase tracking-widest block">Персонажи заказчика</label>
            <div v-for="(c, i) in order.characters" :key="i" class="rounded-2xl border border-brand-border bg-brand-bg p-3">
              <p class="text-sm font-bold text-white">{{ c.fursona?.name || c.user.display_name || c.user.username }}
                <RouterLink :to="`/profile/${c.user.username}`" class="text-[11px] text-white/40 hover:text-brand-accent font-medium ml-1">@{{ c.user.username }}</RouterLink>
              </p>
              <div v-if="c.images.length || c.extraImages.length" class="flex flex-wrap gap-1.5 mt-2">
                <a v-for="img in [...c.images.map(i => i.url), ...c.extraImages]" :key="img" :href="img" target="_blank" rel="noopener">
                  <img :src="img" class="w-14 h-14 rounded-lg object-cover border border-white/10" />
                </a>
              </div>
              <p v-else class="text-[11px] text-white/35 mt-1">Рефа нет — смотрите профиль</p>
            </div>
          </div>

          <!-- Artist references -->
          <div class="stack-y-2">
            <label class="text-[10px] font-bold text-white/40 uppercase tracking-widest block">Референсы к заказу</label>
            <div class="flex flex-wrap gap-2">
              <div v-for="(url, i) in references" :key="url" class="relative">
                <img :src="url" class="w-16 h-16 rounded-xl object-cover border border-white/10" />
                <button type="button" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-brand-error text-white flex items-center justify-center"
                  @click="references.splice(i, 1)"><BIcon name="X" class="w-3 h-3" /></button>
              </div>
            </div>
            <MediaUpload v-if="references.length < 20" type="posts" accept="image/*" :max-files="1"
              @uploaded="(urls: string[]) => references.push(...urls)" />
          </div>

          <p v-if="error" class="text-xs text-brand-error bg-brand-error/8 border border-brand-error/15 rounded-xl px-4 py-2.5">{{ error }}</p>
        </div>

        <div class="flex gap-3 mt-6">
          <button class="px-5 py-3 rounded-2xl bg-brand-bg border border-brand-border text-white/60 font-bold text-sm hover:bg-brand-border/50 transition-colors"
            @click="emit('close')">Отмена</button>
          <button class="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-white font-extrabold text-sm transition-all hover:opacity-90 disabled:opacity-40"
            style="background: linear-gradient(135deg, #4C67CF, #7c3aed)" :disabled="saving" @click="save">
            <span v-if="saving" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Сохранить
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import BIcon from '@/components/BIcon.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import { useGroupsStore, type Order } from '@/stores/groups'
import { errorMessage } from '@/lib/apiError'

const props = defineProps<{ groupId: string; order: Order }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved', order: Order): void }>()

const groupsStore = useGroupsStore()
const pad = (n: number) => String(n).padStart(2, '0')
const toLocal = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

const date = ref(props.order.deadline_at ? toLocal(props.order.deadline_at) : '')
const description = ref(props.order.description ?? '')
const references = ref<string[]>([...(props.order.references ?? [])])
const saving = ref(false)
const error = ref('')

async function save() {
  saving.value = true
  error.value = ''
  try {
    const payload: { deadlineAt?: string | null; description: string | null; references: string[] } = {
      description: description.value.trim() || null,
      references: references.value,
    }
    const current = props.order.deadline_at ? toLocal(props.order.deadline_at) : ''
    if (date.value !== current) {
      if (date.value) { const [y, m, d] = date.value.split('-').map(Number); payload.deadlineAt = new Date(y, m - 1, d, 23, 59, 0).toISOString() }
      else payload.deadlineAt = null
    }
    emit('saved', await groupsStore.updateOrder(props.groupId, props.order.id, payload))
  } catch (e) {
    error.value = errorMessage(e) ?? 'Не удалось сохранить'
  } finally {
    saving.value = false
  }
}
</script>
