<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import BIcon from '@/components/BIcon.vue'
import { useGroupsStore, type EventItem, type TicketTier } from '@/stores/groups'

const props = withDefaults(defineProps<{
  groupId?: string
  showBack?: boolean
}>(), { showBack: false })

const emit = defineEmits<{ back: [] }>()

const groupsStore = useGroupsStore()

const events = ref<EventItem[]>([])
const selectedEventId = ref<string>('')
const loading = ref(false)
const error = ref('')

const showForm = ref(false)
const editingTier = ref<TicketTier | null>(null)
const saving = ref(false)
const deleting = ref<string | null>(null)

const form = ref({
  name: '',
  price: 0,
  currency: 'RUB',
  totalCount: 100,
  description: '',
})

const selectedEvent = computed(() => events.value.find(e => e.id === selectedEventId.value) ?? null)
const tiers = computed(() => selectedEvent.value?.tickets ?? [])

function openCreate() {
  editingTier.value = null
  form.value = { name: '', price: 0, currency: 'RUB', totalCount: 100, description: '' }
  showForm.value = true
}

function openEdit(tier: TicketTier) {
  editingTier.value = tier
  form.value = {
    name: tier.name,
    price: Number(tier.price),
    currency: tier.currency,
    totalCount: tier.total_count,
    description: tier.description ?? '',
  }
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  editingTier.value = null
}

async function saveTier() {
  if (!selectedEventId.value || !form.value.name.trim()) return
  saving.value = true
  try {
    if (editingTier.value) {
      const updated = await groupsStore.updateTicketTier(editingTier.value.id, {
        name: form.value.name,
        price: form.value.price,
        currency: form.value.currency,
        totalCount: form.value.totalCount,
      })
      const ev = events.value.find(e => e.id === selectedEventId.value)
      if (ev?.tickets) {
        const idx = ev.tickets.findIndex(t => t.id === editingTier.value!.id)
        if (idx !== -1) ev.tickets[idx] = updated
      }
    } else {
      const created = await groupsStore.createTicketTier(selectedEventId.value, {
        name: form.value.name,
        price: form.value.price,
        currency: form.value.currency,
        totalCount: form.value.totalCount,
      })
      const ev = events.value.find(e => e.id === selectedEventId.value)
      if (ev) {
        if (!ev.tickets) ev.tickets = []
        ev.tickets.push(created)
      }
    }
    closeForm()
  } catch (e: any) {
    alert('Ошибка: ' + e.message)
  } finally {
    saving.value = false
  }
}

async function deleteTier(tier: TicketTier) {
  if (!confirm(`Удалить билет «${tier.name}»?`)) return
  deleting.value = tier.id
  try {
    await groupsStore.deleteTicketTier(tier.id)
    const ev = events.value.find(e => e.id === selectedEventId.value)
    if (ev?.tickets) ev.tickets = ev.tickets.filter(t => t.id !== tier.id)
  } catch (e: any) {
    alert('Ошибка: ' + e.message)
  } finally {
    deleting.value = null
  }
}

function fmtPrice(price: string | number, currency: string) {
  const n = Number(price)
  if (n === 0) return 'Бесплатно'
  return `${n.toLocaleString('ru')} ${currency}`
}

function soldPct(tier: TicketTier) {
  if (!tier.total_count) return 0
  return Math.round((tier.sold_count / tier.total_count) * 100)
}

async function load() {
  if (!props.groupId) return
  loading.value = true
  try {
    const result = await groupsStore.loadEvents({ groupId: props.groupId })
    events.value = result.events ?? []
    if (events.value.length) selectedEventId.value = events.value[0].id
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

watch(() => props.groupId, () => {
  events.value = []
  selectedEventId.value = ''
  load()
})

onMounted(load)
</script>

<template>
  <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">

    <!-- Header -->
    <div class="px-6 py-5 border-b border-brand-border flex items-center gap-3">
      <div class="w-10 h-10 rounded-2xl bg-brand-accent/15 border border-brand-accent/25 flex items-center justify-center flex-shrink-0">
        <BIcon name="Ticket" class="w-5 h-5 text-brand-accent" />
      </div>
      <div class="flex-1 min-w-0">
        <h1 class="text-lg font-extrabold text-white">Билеты</h1>
        <p class="text-xs text-white/40">Управление тарифами и продажами</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          v-if="selectedEventId"
          @click="openCreate"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-accent/20 border border-brand-accent/30 text-xs font-bold text-brand-accent hover:bg-brand-accent/30 transition-all">
          <BIcon name="Plus" class="w-3.5 h-3.5" /> Добавить
        </button>
        <button
          v-if="showBack && groupId"
          @click="emit('back')"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border text-xs font-semibold text-white/55 hover:text-white hover:border-brand-accent/50 transition-all">
          <BIcon name="ArrowLeft" class="w-3.5 h-3.5" /> Назад
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="px-6 py-16 flex justify-center">
      <div class="w-8 h-8 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="px-6 py-16 text-center text-brand-error text-sm">{{ error }}</div>

    <!-- No group / no events -->
    <div v-else-if="!groupId || !events.length" class="px-6 py-16 flex flex-col items-center gap-3">
      <div class="w-14 h-14 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center">
        <BIcon name="Ticket" class="w-7 h-7 text-white/20" />
      </div>
      <p class="text-white/40 text-sm font-semibold">{{ !groupId ? 'Группа не выбрана' : 'Нет мероприятий' }}</p>
      <p class="text-white/25 text-xs text-center max-w-xs">Сначала создайте мероприятие в настройках группы</p>
    </div>

    <template v-else>
      <!-- Event selector (if multiple) -->
      <div v-if="events.length > 1" class="px-6 pt-4 pb-2 flex gap-2 flex-wrap">
        <button
          v-for="ev in events"
          :key="ev.id"
          @click="selectedEventId = ev.id"
          :class="[
            'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border truncate max-w-[200px]',
            selectedEventId === ev.id
              ? 'bg-brand-accent/20 border-brand-accent/40 text-brand-accent'
              : 'bg-white/4 border-brand-border text-white/50 hover:text-white'
          ]">
          {{ ev.title }}
        </button>
      </div>

      <!-- Tier form (inline modal) -->
      <div v-if="showForm" class="mx-6 my-4 bg-brand-bg border border-brand-border rounded-2xl p-5 space-y-4">
        <p class="text-sm font-bold text-white">{{ editingTier ? 'Редактировать билет' : 'Новый билет' }}</p>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2">
            <label class="block text-xs font-semibold text-white/50 mb-1">Название</label>
            <input
              v-model="form.name"
              placeholder="Стандартный, VIP, Пресс..."
              class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/25 focus:outline-none focus:border-brand-accent/50" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-white/50 mb-1">Цена</label>
            <input
              v-model.number="form.price"
              type="number"
              min="0"
              class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent/50" />
          </div>
          <div>
            <label class="block text-xs font-semibold text-white/50 mb-1">Количество</label>
            <input
              v-model.number="form.totalCount"
              type="number"
              min="1"
              class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent/50" />
          </div>
        </div>

        <div class="flex gap-2 justify-end">
          <button
            @click="closeForm"
            class="px-4 py-2 rounded-xl border border-brand-border text-xs font-semibold text-white/50 hover:text-white transition-all">
            Отмена
          </button>
          <button
            @click="saveTier"
            :disabled="saving || !form.name.trim()"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-accent/20 border border-brand-accent/30 text-xs font-bold text-brand-accent hover:bg-brand-accent/30 transition-all disabled:opacity-40">
            <div v-if="saving" class="w-3.5 h-3.5 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
            {{ editingTier ? 'Сохранить' : 'Создать' }}
          </button>
        </div>
      </div>

      <!-- Tiers list -->
      <div class="p-6 space-y-3">
        <!-- Summary stats -->
        <div v-if="tiers.length" class="grid grid-cols-3 gap-3 mb-4">
          <div class="bg-brand-bg border border-brand-border rounded-2xl p-4 text-center">
            <p class="text-2xl font-extrabold text-white">{{ tiers.length }}</p>
            <p class="text-xs text-white/40 mt-0.5">Тарифов</p>
          </div>
          <div class="bg-brand-bg border border-brand-border rounded-2xl p-4 text-center">
            <p class="text-2xl font-extrabold text-brand-accent">{{ tiers.reduce((s, t) => s + t.sold_count, 0) }}</p>
            <p class="text-xs text-white/40 mt-0.5">Продано</p>
          </div>
          <div class="bg-brand-bg border border-brand-border rounded-2xl p-4 text-center">
            <p class="text-2xl font-extrabold text-white">{{ tiers.reduce((s, t) => s + t.total_count, 0) }}</p>
            <p class="text-xs text-white/40 mt-0.5">Всего</p>
          </div>
        </div>

        <!-- Individual tiers -->
        <div
          v-for="tier in tiers"
          :key="tier.id"
          class="bg-brand-bg border border-brand-border rounded-2xl p-4 flex items-center gap-4">

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <p class="font-bold text-white">{{ tier.name }}</p>
              <span class="text-xs font-bold text-brand-accent">{{ fmtPrice(tier.price, tier.currency) }}</span>
            </div>
            <!-- Progress bar -->
            <div class="flex items-center gap-2">
              <div class="flex-1 h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div
                  class="h-full bg-brand-accent rounded-full transition-all"
                  :style="`width: ${soldPct(tier)}%`" />
              </div>
              <span class="text-[11px] text-white/40 font-semibold flex-shrink-0">
                {{ tier.sold_count }} / {{ tier.total_count }}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-1.5 flex-shrink-0">
            <button
              @click="openEdit(tier)"
              class="p-2 rounded-xl border border-brand-border text-white/40 hover:text-white hover:border-white/20 transition-all">
              <BIcon name="Pencil" class="w-3.5 h-3.5" />
            </button>
            <button
              @click="deleteTier(tier)"
              :disabled="deleting === tier.id"
              class="p-2 rounded-xl border border-brand-border text-white/30 hover:text-red-400 hover:border-red-400/40 transition-all disabled:opacity-40">
              <BIcon v-if="deleting !== tier.id" name="Trash2" class="w-3.5 h-3.5" />
              <div v-else class="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
            </button>
          </div>
        </div>

        <!-- Empty -->
        <div v-if="!tiers.length" class="py-12 flex flex-col items-center gap-3">
          <div class="w-14 h-14 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center">
            <BIcon name="Ticket" class="w-7 h-7 text-white/20" />
          </div>
          <p class="text-white/40 text-sm font-semibold">Нет билетов</p>
          <button
            @click="openCreate"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-accent/15 border border-brand-accent/25 text-xs font-bold text-brand-accent hover:bg-brand-accent/25 transition-all">
            <BIcon name="Plus" class="w-3.5 h-3.5" /> Добавить первый
          </button>
        </div>
      </div>
    </template>

  </div>
</template>
