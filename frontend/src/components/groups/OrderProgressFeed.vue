<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import BIcon from '@/components/BIcon.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import { useGroupsStore, type OrderProgressEntry, type TodoStatus } from '@/stores/groups'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorMessage, errorMessage } from '@/lib/apiError'
import { ORDER_STAGES, ORDER_STAGE_LABEL, ORDER_STAGE_COLOR } from '@/lib/orderStages'

// Лента этапов работы над заказом: художник выкладывает скетчи, WIP и комментарии, заказчик следит за стадией.
const props = defineProps<{
  groupId: string
  orderId: string
  /** Текущий этап заказа — предлагается по умолчанию для нового этапа */
  currentStage: TodoStatus
  /** Художник (персонал группы): может выкладывать и удалять этапы */
  canManage: boolean
  /** Уже загруженная лента (страница заказа) — без лишнего запроса */
  initial?: OrderProgressEntry[]
}>()
const emit = defineEmits<{ (e: 'changed', entries: OrderProgressEntry[]): void }>()

const groupsStore = useGroupsStore()
const { confirmDialog } = useConfirm()

const entries = ref<OrderProgressEntry[]>(props.initial ?? [])
const loading = ref(false)
const posting = ref(false)
const error = ref('')

const text = ref('')
const images = ref<string[]>([])
const stage = ref<TodoStatus>(props.currentStage)

const MAX_IMAGES = 6
const canPost = computed(() => !posting.value && (text.value.trim().length > 0 || images.value.length > 0))
// Свежие этапы сверху: заказчик первым делом видит, что нового
const newestFirst = computed(() => [...entries.value].reverse())

async function load() {
  loading.value = true
  try {
    entries.value = await groupsStore.fetchOrderProgress(props.groupId, props.orderId)
  } catch (e) {
    error.value = apiErrorMessage(e) ?? 'Не удалось загрузить этапы'
  } finally {
    loading.value = false
  }
}
onMounted(() => { if (!props.initial) load() })
watch(() => props.initial, (v) => { if (v) entries.value = v })
watch(() => props.currentStage, (v) => { stage.value = v })

// streaming: каждый загруженный файл приходит отдельно, а список картинок этапа ведём здесь
function onUploaded(urls: string[]) {
  images.value = [...images.value, ...urls.filter(u => !images.value.includes(u))].slice(0, MAX_IMAGES)
}

async function post() {
  if (!canPost.value) return
  posting.value = true
  error.value = ''
  try {
    const entry = await groupsStore.addOrderProgress(props.groupId, props.orderId, {
      text: text.value.trim() || undefined,
      imageUrls: images.value,
      stage: stage.value,
    })
    entries.value = [...entries.value, entry]
    text.value = ''
    images.value = []
    emit('changed', entries.value)
  } catch (e) {
    error.value = apiErrorMessage(e) ?? errorMessage(e) ?? 'Не удалось выложить этап'
  } finally {
    posting.value = false
  }
}

async function remove(entry: OrderProgressEntry) {
  if (!(await confirmDialog('Удалить этот этап?', { danger: true }))) return
  try {
    await groupsStore.deleteOrderProgress(props.groupId, props.orderId, entry.id)
    entries.value = entries.value.filter(e => e.id !== entry.id)
    emit('changed', entries.value)
  } catch (e) {
    error.value = apiErrorMessage(e) ?? 'Не удалось удалить'
  }
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="stack-y-4">
    <!-- Форма художника -->
    <div v-if="canManage" class="rounded-2xl border border-brand-border bg-brand-bg p-3.5 stack-y-3">
      <div class="flex flex-wrap gap-1.5">
        <button v-for="s in ORDER_STAGES" :key="s" type="button" @click="stage = s"
          class="text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all"
          :class="stage === s ? 'bg-brand-accent/20 text-brand-accent border-brand-accent/40' : 'bg-brand-card text-white/40 border-brand-border hover:text-white/70'">
          <span class="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" :style="{ background: ORDER_STAGE_COLOR[s] }" />
          {{ ORDER_STAGE_LABEL[s] }}
        </button>
      </div>
      <textarea v-model="text" rows="2" maxlength="1000" placeholder="Комментарий к этапу (необязательно)"
        class="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-hidden focus:border-brand-accent/60 transition-colors resize-none" />
      <div v-if="images.length" class="flex flex-wrap gap-2">
        <div v-for="(url, i) in images" :key="url" class="relative">
          <img :src="url" class="w-16 h-16 rounded-xl object-cover border border-white/10" />
          <button type="button" class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-brand-error text-white flex items-center justify-center"
            @click="images.splice(i, 1)"><BIcon name="X" class="w-3 h-3" /></button>
        </div>
      </div>
      <MediaUpload v-if="images.length < MAX_IMAGES" type="posts" accept="image/*" multiple streaming :max-files="MAX_IMAGES - images.length" @uploaded="onUploaded" />
      <p v-if="error" class="text-xs text-brand-error">{{ error }}</p>
      <button type="button" :disabled="!canPost" @click="post"
        class="bg-brand-gradient w-full py-2 rounded-xl text-white font-extrabold text-sm disabled:opacity-40 hover:opacity-90 transition-all">
        {{ posting ? 'Публикуем…' : 'Выложить этап' }}
      </button>
      <p class="text-[10px] text-white/35 leading-snug">Заказчик получит уведомление и увидит этап на странице заказа.</p>
    </div>

    <p v-else-if="error" class="text-xs text-brand-error">{{ error }}</p>

    <!-- Лента -->
    <div v-if="loading" class="flex justify-center py-4">
      <BIcon name="Loader2" class="w-5 h-5 text-white/30 animate-spin" />
    </div>
    <p v-else-if="!entries.length" class="text-sm text-white/40">
      {{ canManage ? 'Пока ничего не выложено — покажите заказчику скетч или WIP.' : 'Художник пока ничего не выложил — здесь появятся скетчи и промежуточные результаты.' }}
    </p>
    <ol v-else class="relative stack-y-4 pl-5">
      <li v-for="(e, i) in newestFirst" :key="e.id" class="relative">
        <span class="absolute -left-5 top-1 w-2.5 h-2.5 rounded-full" :style="{ background: e.stage ? ORDER_STAGE_COLOR[e.stage] : '#6b7280' }" />
        <span v-if="i < newestFirst.length - 1" class="absolute -left-[17px] top-4 w-px h-full bg-white/10" />
        <div class="flex items-center gap-2 flex-wrap">
          <span v-if="e.stage" class="text-[10px] font-bold px-2 py-0.5 rounded-md border"
            :style="{ color: ORDER_STAGE_COLOR[e.stage], borderColor: ORDER_STAGE_COLOR[e.stage] + '40', background: ORDER_STAGE_COLOR[e.stage] + '1f' }">
            {{ ORDER_STAGE_LABEL[e.stage] }}
          </span>
          <span class="text-[11px] text-white/40">{{ fmt(e.created_at) }}</span>
          <button v-if="canManage" type="button" @click="remove(e)" class="ml-auto text-white/25 hover:text-brand-error transition-colors" aria-label="Удалить этап">
            <BIcon name="Trash2" class="w-3.5 h-3.5" />
          </button>
        </div>
        <p v-if="e.text" class="text-sm text-white/80 leading-relaxed whitespace-pre-wrap break-words mt-1.5">{{ e.text }}</p>
        <div v-if="e.image_urls.length" class="flex flex-wrap gap-2 mt-2">
          <a v-for="url in e.image_urls" :key="url" :href="url" target="_blank" rel="noopener" class="block">
            <img :src="url" class="w-24 h-24 md:w-28 md:h-28 rounded-xl object-cover border border-white/10 hover:border-brand-accent/50 transition-colors" />
          </a>
        </div>
      </li>
    </ol>
  </div>
</template>
