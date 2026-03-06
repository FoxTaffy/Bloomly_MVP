<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDealersDenStore, type DealerListing, type ListingCategory, type ListingType } from '@/stores/dealersDen'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import MediaUpload from '@/components/MediaUpload.vue'

const router = useRouter()
const auth   = useAuthStore()
const store  = useDealersDenStore()

// ── Tabs / filters ─────────────────────────────────────────────────────────────
type MainTab = 'browse' | 'my'
const activeTab = ref<MainTab>('browse')

const CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'all',     label: 'Всё',         icon: 'ShoppingBag' },
  { key: 'art',     label: 'Арт',         icon: 'Palette' },
  { key: 'fursuit', label: 'Фурсьют',     icon: 'Star' },
  { key: 'badge',   label: 'Значки',      icon: 'Award' },
  { key: 'print',   label: 'Принты',      icon: 'Image' },
  { key: 'music',   label: 'Музыка',      icon: 'Music' },
  { key: 'craft',   label: 'Handmade',    icon: 'Scissors' },
  { key: 'merch',   label: 'Мерч',        icon: 'Package' },
  { key: 'other',   label: 'Другое',      icon: 'MoreHorizontal' },
]

const selectedCategory = ref('all')
const selectedType     = ref<'' | 'digital' | 'physical' | 'both'>('')
const searchQuery      = ref('')

// ── Listings ──────────────────────────────────────────────────────────────────
const displayListings = computed<DealerListing[]>(() => {
  if (activeTab.value === 'my') return store.myListings
  return store.listings
})

async function loadData() {
  await Promise.all([
    store.loadListings({
      category: selectedCategory.value !== 'all' ? selectedCategory.value : undefined,
      type: selectedType.value || undefined,
      search: searchQuery.value || undefined,
    }),
    auth.user ? store.loadMyListings() : Promise.resolve(),
  ])
}

onMounted(loadData)

function applyFilter() { loadData() }

function selectCategory(key: string) {
  selectedCategory.value = key
  loadData()
}

// ── Create listing modal ───────────────────────────────────────────────────────
const showCreateModal = ref(false)
const isCreating      = ref(false)
const form = ref({
  title:       '',
  description: '',
  price:       0,
  currency:    'USD',
  category:    'other' as ListingCategory,
  type:        'physical' as ListingType,
  quantity:    1,
  isNsfw:      false,
  tags:        '',
  status:      'active' as 'active' | 'draft',
  images:      [] as string[],
})

function openCreateModal() {
  form.value = {
    title: '', description: '', price: 0, currency: 'USD',
    category: 'other', type: 'physical', quantity: 1,
    isNsfw: false, tags: '', status: 'active', images: [],
  }
  showCreateModal.value = true
}

async function submitCreate() {
  if (!form.value.title.trim() || form.value.price < 0) return
  isCreating.value = true
  try {
    await store.createListing({
      title:       form.value.title.trim(),
      description: form.value.description.trim() || undefined,
      price:       form.value.price,
      currency:    form.value.currency,
      category:    form.value.category,
      type:        form.value.type,
      quantity:    form.value.quantity,
      isNsfw:      form.value.isNsfw,
      tags:        form.value.tags.split(',').map(t => t.trim()).filter(Boolean),
      status:      form.value.status,
      images:      form.value.images,
    })
    showCreateModal.value = false
    activeTab.value = 'my'
  } finally {
    isCreating.value = false
  }
}

// ── Edit / delete helpers ─────────────────────────────────────────────────────
const showEditModal   = ref(false)
const editingListing  = ref<DealerListing | null>(null)
const isUpdating      = ref(false)
const editForm = ref({ title: '', description: '', price: 0, currency: 'USD', status: 'active' as string, quantity: 1 })

function openEdit(listing: DealerListing) {
  editingListing.value = listing
  editForm.value = {
    title:       listing.title,
    description: listing.description ?? '',
    price:       parseFloat(listing.price),
    currency:    listing.currency,
    status:      listing.status,
    quantity:    listing.quantity,
  }
  showEditModal.value = true
}

async function submitEdit() {
  if (!editingListing.value) return
  isUpdating.value = true
  try {
    await store.updateListing(editingListing.value.id, {
      title:       editForm.value.title,
      description: editForm.value.description || undefined,
      price:       editForm.value.price,
      currency:    editForm.value.currency,
      status:      editForm.value.status as any,
      quantity:    editForm.value.quantity,
    })
    showEditModal.value = false
  } finally {
    isUpdating.value = false
  }
}

async function deleteListing(id: string) {
  if (!confirm('Удалить объявление?')) return
  await store.deleteListing(id)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const CURRENCIES = ['USD', 'EUR', 'RUB', 'GBP', 'JPY', 'CNY']
const TYPE_LABELS: Record<string, string> = {
  digital: 'Цифровое', physical: 'Физическое', both: 'Оба варианта',
}
const CAT_LABELS: Record<string, string> = {
  art: 'Арт', fursuit: 'Фурсьют', badge: 'Значок', print: 'Принт',
  music: 'Музыка', craft: 'Handmade', merch: 'Мерч', other: 'Другое',
}
const TYPE_COLOR: Record<string, string> = {
  digital: 'text-brand-accent bg-brand-accent/10 border-brand-accent/30',
  physical: 'text-brand-success bg-brand-success/10 border-brand-success/30',
  both: 'text-brand-yellow bg-brand-yellow/10 border-brand-yellow/30',
}

function isSoldOut(l: DealerListing) {
  return l.status === 'sold' || (l.quantity > 0 && l.quantity_sold >= l.quantity)
}

function formatPrice(price: string, currency: string) {
  return `${parseFloat(price).toLocaleString()} ${currency}`
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <!-- ─── Left sidebar ──────────────────────────────────────────── -->
      <AppSidebar />

      <!-- ─── Main content ─────────────────────────────────────────── -->
      <main class="flex-1 min-w-0 pb-28 md:pb-20 space-y-4">

        <!-- Header card -->
        <div class="bg-brand-card border border-brand-border rounded-3xl px-6 py-5 shadow-xl">
          <div class="flex items-center justify-between gap-4 flex-wrap">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-brand-yellow/15 flex items-center justify-center">
                <BIcon name="ShoppingBag" class="w-5 h-5 text-brand-yellow" />
              </div>
              <div>
                <h1 class="text-xl font-extrabold text-white">Dealers' Den</h1>
                <p class="text-xs text-white/55 mt-0.5">
                  {{ store.isLoading ? '…' : `${store.total} объявлений` }}
                </p>
              </div>
            </div>

            <!-- Search -->
            <div class="flex-1 min-w-[180px] max-w-xs flex items-center gap-2 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2">
              <BIcon name="Search" class="w-4 h-4 text-white/40 shrink-0" />
              <input
                v-model="searchQuery"
                placeholder="Поиск…"
                @keyup.enter="applyFilter"
                class="bg-transparent text-sm text-white placeholder-white/35 outline-none w-full" />
            </div>

            <!-- Create button -->
            <button
              v-if="auth.user"
              @click="openCreateModal"
              class="flex items-center gap-2 px-4 py-2 bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold rounded-2xl transition-all shadow-md shadow-brand-accent/25">
              <BIcon name="Plus" class="w-4 h-4" />
              Продать
            </button>
          </div>

          <!-- Tab switcher -->
          <div class="flex gap-2 mt-4">
            <button
              :class="activeTab === 'browse'
                ? 'bg-brand-accent text-white'
                : 'bg-brand-bg text-white/55 hover:text-white border border-brand-border'"
              class="px-4 py-1.5 rounded-full text-sm font-semibold transition-all"
              @click="activeTab = 'browse'; loadData()">
              Витрина
            </button>
            <button
              v-if="auth.user"
              :class="activeTab === 'my'
                ? 'bg-brand-accent text-white'
                : 'bg-brand-bg text-white/55 hover:text-white border border-brand-border'"
              class="px-4 py-1.5 rounded-full text-sm font-semibold transition-all"
              @click="activeTab = 'my'; store.loadMyListings()">
              Мои объявления
              <span
                v-if="store.myListings.length"
                class="ml-1.5 bg-white/15 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {{ store.myListings.length }}
              </span>
            </button>
          </div>
        </div>

        <!-- Category pill tabs -->
        <div v-if="activeTab === 'browse'" class="flex gap-2 overflow-x-auto hide-scrollbar">
          <button
            v-for="cat in CATEGORIES"
            :key="cat.key"
            @click="selectCategory(cat.key)"
            class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 transition-all"
            :class="selectedCategory === cat.key
              ? 'bg-brand-accent text-white shadow-md shadow-brand-accent/25'
              : 'bg-brand-card border border-brand-border text-white/55 hover:text-white hover:border-brand-accent/40'">
            <BIcon :name="cat.icon" class="w-3.5 h-3.5" />
            {{ cat.label }}
          </button>
        </div>

        <!-- Loading skeleton -->
        <div v-if="store.isLoading" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <div
            v-for="n in 6"
            :key="n"
            class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden animate-pulse">
            <div class="w-full h-48 bg-brand-border" />
            <div class="p-4 space-y-3">
              <div class="h-4 bg-brand-border rounded-full w-3/4" />
              <div class="h-3 bg-brand-border rounded-full w-1/2" />
              <div class="h-5 bg-brand-border rounded-full w-1/3" />
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div
          v-else-if="displayListings.length === 0"
          class="text-center py-20 bg-brand-card border border-brand-border rounded-3xl shadow-xl">
          <div class="w-20 h-20 bg-brand-border rounded-full flex items-center justify-center mx-auto mb-5">
            <BIcon name="ShoppingBag" class="w-10 h-10 text-white/40" />
          </div>
          <h3 class="text-2xl font-bold text-white mb-2">
            {{ activeTab === 'my' ? 'Нет объявлений' : 'Ничего не найдено' }}
          </h3>
          <p class="text-white/55 text-sm mb-6">
            {{ activeTab === 'my' ? 'Ты ещё ничего не выставил на продажу.' : 'Попробуй другую категорию или сбрось фильтры.' }}
          </p>
          <button
            v-if="activeTab === 'my' && auth.user"
            @click="openCreateModal"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold rounded-xl transition-all">
            <BIcon name="Plus" class="w-4 h-4" />
            Создать объявление
          </button>
        </div>

        <!-- Listings grid -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <div
            v-for="listing in displayListings"
            :key="listing.id"
            class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl hover:border-brand-accent/40 transition-all cursor-pointer group"
            @click="router.push({ name: 'dealer-listing', params: { id: listing.id } })">

            <!-- Image area -->
            <div class="relative w-full h-48 bg-brand-bg overflow-hidden">
              <img
                v-if="listing.images[0]"
                :src="listing.images[0]"
                :alt="listing.title"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              <div
                v-else
                class="w-full h-full flex items-center justify-center">
                <BIcon name="Image" class="w-12 h-12 text-brand-border" />
              </div>

              <!-- Sold out overlay -->
              <div
                v-if="isSoldOut(listing)"
                class="absolute inset-0 bg-black/60 flex items-center justify-center">
                <span class="bg-brand-error text-white text-sm font-extrabold px-4 py-1.5 rounded-full">Продано</span>
              </div>

              <!-- NSFW blur -->
              <div
                v-else-if="listing.is_nsfw"
                class="absolute inset-0 backdrop-blur-xl flex items-center justify-center">
                <span class="bg-brand-error/90 text-white text-xs font-bold px-3 py-1 rounded-full">18+</span>
              </div>

              <!-- Category badge -->
              <div class="absolute top-2 left-2">
                <span class="bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2.5 py-1 rounded-full capitalize">
                  {{ CAT_LABELS[listing.category] ?? listing.category }}
                </span>
              </div>

              <!-- Type badge -->
              <div class="absolute top-2 right-2">
                <span :class="TYPE_COLOR[listing.type]" class="border text-[10px] font-bold px-2.5 py-1 rounded-full">
                  {{ TYPE_LABELS[listing.type] }}
                </span>
              </div>

              <!-- Draft badge -->
              <div v-if="listing.status === 'draft'" class="absolute bottom-2 left-2">
                <span class="bg-brand-warning/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">Черновик</span>
              </div>

              <!-- My listing actions -->
              <div
                v-if="activeTab === 'my'"
                class="absolute bottom-2 right-2 flex gap-1.5"
                @click.stop>
                <button
                  @click="openEdit(listing)"
                  class="w-7 h-7 bg-brand-card/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-brand-accent transition-all">
                  <BIcon name="Pencil" class="w-3.5 h-3.5 text-white" />
                </button>
                <button
                  @click="deleteListing(listing.id)"
                  class="w-7 h-7 bg-brand-card/90 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-brand-error transition-all">
                  <BIcon name="Trash2" class="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>

            <!-- Info -->
            <div class="p-4 space-y-2">
              <h3 class="font-bold text-white text-sm leading-snug line-clamp-2">{{ listing.title }}</h3>
              <p v-if="listing.description" class="text-xs text-white/55 line-clamp-2">{{ listing.description }}</p>

              <!-- Seller -->
              <div class="flex items-center gap-2">
                <img
                  v-if="listing.seller.avatar_url"
                  :src="listing.seller.avatar_url"
                  class="w-5 h-5 rounded-full object-cover" />
                <div
                  v-else
                  class="w-5 h-5 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-[10px] font-bold">
                  {{ (listing.seller.display_name ?? listing.seller.username)[0].toUpperCase() }}
                </div>
                <span class="text-xs text-white/55 truncate">
                  {{ listing.seller.display_name ?? listing.seller.username }}
                </span>
                <BIcon v-if="listing.seller.is_verified" name="BadgeCheck" class="w-3.5 h-3.5 text-brand-accent shrink-0" />
              </div>

              <!-- Price + quantity -->
              <div class="flex items-center justify-between pt-1">
                <span class="text-brand-yellow font-extrabold text-base">
                  {{ formatPrice(listing.price, listing.currency) }}
                </span>
                <span v-if="listing.quantity > 1 && !isSoldOut(listing)" class="text-xs text-white/40">
                  осталось {{ listing.quantity - listing.quantity_sold }}
                </span>
              </div>
            </div>
          </div>
        </div>

      </main>

      <!-- ─── Right sidebar ─────────────────────────────────────────── -->
      <aside class="w-52 hidden xl:flex flex-col gap-4 sticky top-24 self-start flex-shrink-0">

        <!-- Create button -->
        <button
          v-if="auth.user"
          @click="openCreateModal"
          class="w-full flex items-center justify-center gap-2 py-3 bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold rounded-2xl transition-all shadow-lg shadow-brand-accent/30">
          <BIcon name="Plus" class="w-4 h-4" />
          Продать товар
        </button>

        <!-- Filters -->
        <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
          <div class="px-4 py-3 border-b border-brand-border">
            <h4 class="text-xs font-bold text-white/55 uppercase tracking-wider">Тип товара</h4>
          </div>
          <nav class="p-2 space-y-1">
            <button
              v-for="opt in [{ key: '', label: 'Все', icon: 'LayoutGrid' }, { key: 'digital', label: 'Цифровое', icon: 'Download' }, { key: 'physical', label: 'Физическое', icon: 'Package' }, { key: 'both', label: 'Оба', icon: 'Layers' }]"
              :key="opt.key"
              @click="selectedType = opt.key as any; applyFilter()"
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all"
              :class="selectedType === opt.key
                ? 'bg-brand-accent/15 text-brand-accent'
                : 'text-white/55 hover:bg-brand-bg hover:text-white'">
              <BIcon :name="opt.icon" class="w-4 h-4 shrink-0" />
              <span class="flex-1 text-left">{{ opt.label }}</span>
            </button>
          </nav>
        </div>

        <!-- Stats mini-card -->
        <div class="bg-brand-card border border-brand-border rounded-3xl p-4 shadow-xl space-y-2">
          <h4 class="text-xs font-bold text-white/55 uppercase tracking-wider mb-3">Статистика</h4>
          <div class="flex items-center justify-between">
            <span class="text-xs text-white/55">Объявлений</span>
            <span class="text-sm font-bold text-white">{{ store.total }}</span>
          </div>
          <div v-if="auth.user" class="flex items-center justify-between">
            <span class="text-xs text-white/55">Мои</span>
            <span class="text-sm font-bold text-white">{{ store.myListings.length }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-white/55">Продано</span>
            <span class="text-sm font-bold text-white">
              {{ store.listings.filter(l => l.status === 'sold').length }}
            </span>
          </div>
        </div>

      </aside>
    </div>

    <!-- ═══════════════════════════════════════════════
         Create Listing Modal
    ════════════════════════════════════════════════ -->
    <Teleport to="body">
      <div
        v-if="showCreateModal"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        @click.self="showCreateModal = false">
        <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

          <!-- Modal header -->
          <div class="sticky top-0 bg-brand-card border-b border-brand-border px-6 py-4 flex items-center justify-between rounded-t-3xl z-10">
            <div class="flex items-center gap-2">
              <BIcon name="ShoppingBag" class="w-5 h-5 text-brand-yellow" />
              <h2 class="text-lg font-extrabold text-white">Новое объявление</h2>
            </div>
            <button
              @click="showCreateModal = false"
              class="w-8 h-8 rounded-full bg-brand-bg hover:bg-brand-border flex items-center justify-center transition-all">
              <BIcon name="X" class="w-4 h-4 text-white/70" />
            </button>
          </div>

          <!-- Form -->
          <div class="p-6 space-y-5">

            <!-- Images upload -->
            <div>
              <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Фотографии</label>
              <MediaUpload
                type="posts"
                :multiple="true"
                @uploaded="(urls) => form.images.push(...urls)" />
              <!-- Preview uploaded images -->
              <div v-if="form.images.length" class="flex gap-2 flex-wrap mt-2">
                <div
                  v-for="(img, i) in form.images"
                  :key="i"
                  class="relative w-16 h-16 rounded-xl overflow-hidden border border-brand-border">
                  <img :src="img" class="w-full h-full object-cover" />
                  <button
                    @click="form.images.splice(i, 1)"
                    class="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center">
                    <BIcon name="X" class="w-3 h-3 text-white" />
                  </button>
                </div>
              </div>
            </div>

            <!-- Title -->
            <div>
              <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Название *</label>
              <input
                v-model="form.title"
                maxlength="200"
                placeholder="Что продаёшь?"
                class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-white/35 outline-none focus:border-brand-accent transition-colors" />
            </div>

            <!-- Description -->
            <div>
              <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Описание</label>
              <textarea
                v-model="form.description"
                rows="3"
                placeholder="Опиши товар подробно…"
                class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-white/35 outline-none focus:border-brand-accent transition-colors resize-none" />
            </div>

            <!-- Price + Currency row -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Цена *</label>
                <input
                  v-model.number="form.price"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-white/35 outline-none focus:border-brand-accent transition-colors" />
              </div>
              <div>
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Валюта</label>
                <select
                  v-model="form.currency"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-brand-accent transition-colors">
                  <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
                </select>
              </div>
            </div>

            <!-- Category + Type row -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Категория</label>
                <select
                  v-model="form.category"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-brand-accent transition-colors">
                  <option v-for="cat in CATEGORIES.slice(1)" :key="cat.key" :value="cat.key">{{ cat.label }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Тип</label>
                <select
                  v-model="form.type"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-brand-accent transition-colors">
                  <option value="physical">Физическое</option>
                  <option value="digital">Цифровое</option>
                  <option value="both">Оба варианта</option>
                </select>
              </div>
            </div>

            <!-- Quantity + Status row -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Кол-во</label>
                <input
                  v-model.number="form.quantity"
                  type="number"
                  min="1"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-brand-accent transition-colors" />
              </div>
              <div>
                <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Статус</label>
                <select
                  v-model="form.status"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-brand-accent transition-colors">
                  <option value="active">Активно</option>
                  <option value="draft">Черновик</option>
                </select>
              </div>
            </div>

            <!-- Tags -->
            <div>
              <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Теги (через запятую)</label>
              <input
                v-model="form.tags"
                placeholder="арт, фурри, значок"
                class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-white/35 outline-none focus:border-brand-accent transition-colors" />
            </div>

            <!-- NSFW toggle -->
            <label class="flex items-center gap-3 cursor-pointer">
              <div
                @click="form.isNsfw = !form.isNsfw"
                class="w-10 h-5 rounded-full transition-colors relative"
                :class="form.isNsfw ? 'bg-brand-error' : 'bg-brand-border'">
                <div
                  class="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all"
                  :class="form.isNsfw ? 'left-5' : 'left-0.5'" />
              </div>
              <span class="text-sm text-white/70">Контент 18+</span>
            </label>

            <!-- Submit -->
            <div class="flex gap-3 pt-2">
              <button
                @click="showCreateModal = false"
                class="flex-1 py-3 bg-brand-bg hover:bg-brand-border border border-brand-border text-white/70 text-sm font-bold rounded-2xl transition-all">
                Отмена
              </button>
              <button
                @click="submitCreate"
                :disabled="isCreating || !form.title.trim()"
                class="flex-1 py-3 bg-brand-accent hover:bg-brand-accent-plus disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-2xl transition-all shadow-md shadow-brand-accent/25">
                <span v-if="isCreating">Создание…</span>
                <span v-else>Опубликовать</span>
              </button>
            </div>

          </div>
        </div>
      </div>
    </Teleport>

    <!-- ═══════════════════════════════════════════════
         Edit Listing Modal
    ════════════════════════════════════════════════ -->
    <Teleport to="body">
      <div
        v-if="showEditModal"
        class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        @click.self="showEditModal = false">
        <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-md">

          <div class="border-b border-brand-border px-6 py-4 flex items-center justify-between">
            <h2 class="text-lg font-extrabold text-white">Редактировать</h2>
            <button
              @click="showEditModal = false"
              class="w-8 h-8 rounded-full bg-brand-bg hover:bg-brand-border flex items-center justify-center transition-all">
              <BIcon name="X" class="w-4 h-4 text-white/70" />
            </button>
          </div>

          <div class="p-6 space-y-4">
            <input
              v-model="editForm.title"
              maxlength="200"
              placeholder="Название"
              class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-white/35 outline-none focus:border-brand-accent transition-colors" />
            <textarea
              v-model="editForm.description"
              rows="3"
              placeholder="Описание"
              class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-white/35 outline-none focus:border-brand-accent transition-colors resize-none" />
            <div class="grid grid-cols-2 gap-3">
              <input
                v-model.number="editForm.price"
                type="number"
                min="0"
                step="0.01"
                placeholder="Цена"
                class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-brand-accent transition-colors" />
              <select
                v-model="editForm.currency"
                class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-brand-accent transition-colors">
                <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <input
                v-model.number="editForm.quantity"
                type="number"
                min="1"
                placeholder="Кол-во"
                class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-brand-accent transition-colors" />
              <select
                v-model="editForm.status"
                class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white outline-none focus:border-brand-accent transition-colors">
                <option value="active">Активно</option>
                <option value="sold">Продано</option>
                <option value="draft">Черновик</option>
                <option value="archived">Архив</option>
              </select>
            </div>
            <div class="flex gap-3 pt-2">
              <button
                @click="showEditModal = false"
                class="flex-1 py-3 bg-brand-bg hover:bg-brand-border border border-brand-border text-white/70 text-sm font-bold rounded-2xl transition-all">
                Отмена
              </button>
              <button
                @click="submitEdit"
                :disabled="isUpdating"
                class="flex-1 py-3 bg-brand-accent hover:bg-brand-accent-plus disabled:opacity-50 text-white text-sm font-bold rounded-2xl transition-all">
                <span v-if="isUpdating">Сохранение…</span>
                <span v-else>Сохранить</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    </Teleport>

  </div>
</template>
