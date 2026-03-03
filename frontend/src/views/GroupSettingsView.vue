<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import { useGroupsStore } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import api from '@/api'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const authStore = useAuthStore()

const nsfwMode = ref(localStorage.getItem('bloomly_nsfw') === 'true')
const activeNav = ref('groups')
const saving = ref(false)

const group = computed(() => groupsStore.currentGroup)
const isOwner = computed(() => group.value?.owner_id === authStore.user?.id)

// ── Toast ───────────────────────────────────────────────────────────────────
const toast = reactive({ show: false, type: 'success' as 'success' | 'error', message: '' })
let toastTimer = 0
function showToast(type: 'success' | 'error', message: string) {
  clearTimeout(toastTimer)
  Object.assign(toast, { show: true, type, message })
  toastTimer = window.setTimeout(() => { toast.show = false }, 3500)
}

// ── Shake / unsaved warning state ───────────────────────────────────────────
const shaking = ref(false)
const unsavedWarning = ref(false)

// ── Sections (colored, with iconPath like SettingsProfileView) ──────────────
const baseSections = [
  { id: 'sec-general',    label: 'Основные',     color: '#60a5fa', iconPath: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { id: 'sec-appearance', label: 'Внешний вид',  color: '#f59e0b', iconPath: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'sec-content',    label: 'Контент',       color: '#a78bfa', iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
]

const eventSections = [
  { id: 'sec-event',      label: 'Мероприятие',   color: '#34d399', iconPath: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { id: 'sec-organizers', label: 'Организаторы',  color: '#38bdf8', iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
]

const creativeSections = [
  { id: 'sec-commissions', label: 'Заказы',       color: '#f472b6', iconPath: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01' },
  { id: 'sec-prices',      label: 'Прайс',        color: '#34d399', iconPath: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
]

const shopSections = [
  { id: 'sec-prices',     label: 'Каталог',       color: '#34d399', iconPath: 'M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z' },
]

const tailSections = [
  { id: 'sec-social',     label: 'Ссылки',        color: '#38bdf8', iconPath: 'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z' },
  { id: 'sec-danger',     label: 'Опасная зона',  color: '#ef4444', iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
]

const sections = computed(() => {
  const s = [...baseSections]
  if (group.value?.type === 'event') s.push(...eventSections)
  if (group.value?.type === 'creative') s.push(...creativeSections)
  if (group.value?.type === 'shop') s.push(...shopSections)
  s.push(...tailSections)
  return s
})

// ── Active section (accordion) ──────────────────────────────────────────────
const openSection = ref('sec-general')
function openSec(id: string) {
  openSection.value = id
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── Form State ──────────────────────────────────────────────────────────────
const form = reactive({
  name: '',
  slug: '',
  description: '',
  aboutText: '',
  accentColor: '#4C67CF',
  isPublic: true,
  isNsfw: false,
  rulesText: '',
  faq: [] as { q: string; a: string }[],
  contactPhone: '',
  contactEmail: '',
  schedule: [] as { time: string; label: string }[],
  whatToBring: [] as string[],
  productionTime: '',
  deliveryInfo: '',
  completedWorks: 0,
  guaranteeText: '',
  socialTelegram: '',
  socialDiscord: '',
  socialTwitter: '',
  socialVk: '',
  socialWebsite: '',
})

const savedForm = reactive({
  name: '', slug: '', description: '', aboutText: '', accentColor: '#4C67CF',
  isPublic: true, isNsfw: false, rulesText: '',
  faq: [] as { q: string; a: string }[],
  contactPhone: '', contactEmail: '',
  schedule: [] as { time: string; label: string }[],
  whatToBring: [] as string[],
  productionTime: '', deliveryInfo: '', completedWorks: 0, guaranteeText: '',
  socialTelegram: '', socialDiscord: '', socialTwitter: '', socialVk: '', socialWebsite: '',
})

function snapshotToSaved() {
  Object.assign(savedForm, {
    name: form.name, slug: form.slug, description: form.description, aboutText: form.aboutText,
    accentColor: form.accentColor, isPublic: form.isPublic, isNsfw: form.isNsfw, rulesText: form.rulesText,
    faq: JSON.parse(JSON.stringify(form.faq)),
    contactPhone: form.contactPhone, contactEmail: form.contactEmail,
    schedule: JSON.parse(JSON.stringify(form.schedule)),
    whatToBring: [...form.whatToBring],
    productionTime: form.productionTime, deliveryInfo: form.deliveryInfo,
    completedWorks: form.completedWorks, guaranteeText: form.guaranteeText,
    socialTelegram: form.socialTelegram, socialDiscord: form.socialDiscord,
    socialTwitter: form.socialTwitter, socialVk: form.socialVk, socialWebsite: form.socialWebsite,
  })
}

function resetForm() {
  Object.assign(form, {
    name: savedForm.name, slug: savedForm.slug, description: savedForm.description, aboutText: savedForm.aboutText,
    accentColor: savedForm.accentColor, isPublic: savedForm.isPublic, isNsfw: savedForm.isNsfw, rulesText: savedForm.rulesText,
    faq: JSON.parse(JSON.stringify(savedForm.faq)),
    contactPhone: savedForm.contactPhone, contactEmail: savedForm.contactEmail,
    schedule: JSON.parse(JSON.stringify(savedForm.schedule)),
    whatToBring: [...savedForm.whatToBring],
    productionTime: savedForm.productionTime, deliveryInfo: savedForm.deliveryInfo,
    completedWorks: savedForm.completedWorks, guaranteeText: savedForm.guaranteeText,
    socialTelegram: savedForm.socialTelegram, socialDiscord: savedForm.socialDiscord,
    socialTwitter: savedForm.socialTwitter, socialVk: savedForm.socialVk, socialWebsite: savedForm.socialWebsite,
  })
  avatarOriginalSrc.value = ''
  bannerOriginalSrc.value = ''
}

const isDirty = computed(() => {
  return (
    form.name !== savedForm.name || form.description !== savedForm.description ||
    form.aboutText !== savedForm.aboutText || form.accentColor !== savedForm.accentColor ||
    form.isPublic !== savedForm.isPublic || form.isNsfw !== savedForm.isNsfw ||
    form.rulesText !== savedForm.rulesText || form.contactPhone !== savedForm.contactPhone ||
    form.contactEmail !== savedForm.contactEmail || form.productionTime !== savedForm.productionTime ||
    form.deliveryInfo !== savedForm.deliveryInfo || form.completedWorks !== savedForm.completedWorks ||
    form.guaranteeText !== savedForm.guaranteeText ||
    form.socialTelegram !== savedForm.socialTelegram || form.socialDiscord !== savedForm.socialDiscord ||
    form.socialTwitter !== savedForm.socialTwitter || form.socialVk !== savedForm.socialVk ||
    form.socialWebsite !== savedForm.socialWebsite ||
    JSON.stringify(form.faq) !== JSON.stringify(savedForm.faq) ||
    JSON.stringify(form.schedule) !== JSON.stringify(savedForm.schedule) ||
    JSON.stringify(form.whatToBring) !== JSON.stringify(savedForm.whatToBring)
  )
})

// Commission form
const commForm = ref({
  status: 'closed' as 'open' | 'closed' | 'waitlist',
  currency: 'USD',
  maxQueue: 5,
  rushSlots: 0,
  rushMax: 0,
  turnaroundDays: '',
  tosText: '',
  basePrices: {} as Record<string, number>,
  priceList: [] as { name: string; price: number; description: string }[],
})

// File inputs
const avatarInput = ref<HTMLInputElement | null>(null)
const bannerInput = ref<HTMLInputElement | null>(null)
const avatarPreview = ref('')
const bannerPreview = ref('')
const avatarOriginalSrc = ref('')
const bannerOriginalSrc = ref('')

const presetColors = ['#4C67CF', '#66C770', '#E14664', '#FFC01F', '#CD83F5', '#E76F51', '#F7A9E2', '#00D4AA', '#FF6B6B', '#A855F7']

// ── Crop Modal ──────────────────────────────────────────────────────────────
const CROP_CONTAINER_W = computed(() => Math.min(600, window.innerWidth - 64))
const CROP_CONTAINER_H = computed(() => Math.round(CROP_CONTAINER_W.value * (2 / 3)))

const cropModal = reactive({
  show: false,
  type: 'avatar' as 'avatar' | 'banner',
  src: '',
  naturalW: 0,
  naturalH: 0,
  imgX: 0,
  imgY: 0,
  imgW: 0,
  imgH: 0,
  cx: 0, cy: 0, cw: 0, ch: 0,
  dragging: false,
  dragOffX: 0,
  dragOffY: 0,
  resizing: '' as '' | 'nw' | 'ne' | 'sw' | 'se',
  resStart: { mx: 0, my: 0, cx: 0, cy: 0, cw: 0, ch: 0 },
})
const cropUploading = ref(false)

function openCrop(file: File, type: 'avatar' | 'banner') {
  const reader = new FileReader()
  reader.onload = (e) => {
    const src = e.target!.result as string
    if (type === 'avatar') avatarOriginalSrc.value = src
    else bannerOriginalSrc.value = src
    cropModal.src = src
    cropModal.type = type
    cropModal.imgW = 0
    cropModal.show = true
  }
  reader.readAsDataURL(file)
}

async function reopenCrop(type: 'avatar' | 'banner') {
  const localSrc = type === 'avatar' ? avatarOriginalSrc.value : bannerOriginalSrc.value
  if (localSrc) {
    cropModal.src = localSrc
    cropModal.type = type
    cropModal.imgW = 0
    cropModal.show = true
    return
  }
  const url = type === 'avatar' ? avatarPreview.value : bannerPreview.value
  if (!url) return
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    openCrop(new File([blob], 'image.jpg', { type: blob.type }), type)
  } catch {
    cropModal.src = url
    cropModal.type = type
    cropModal.imgW = 0
    cropModal.show = true
  }
}

function onCropImageLoad(e: Event) {
  const img = e.target as HTMLImageElement
  cropModal.naturalW = img.naturalWidth
  cropModal.naturalH = img.naturalHeight
  const cw = CROP_CONTAINER_W.value
  const ch = CROP_CONTAINER_H.value
  const containerAspect = cw / ch
  const imageAspect = cropModal.naturalW / cropModal.naturalH
  let iw: number, ih: number
  if (imageAspect > containerAspect) { iw = cw; ih = cw / imageAspect }
  else { ih = ch; iw = ch * imageAspect }
  cropModal.imgW = iw
  cropModal.imgH = ih
  cropModal.imgX = (cw - iw) / 2
  cropModal.imgY = (ch - ih) / 2
  if (cropModal.type === 'avatar') {
    const size = Math.min(iw, ih) * 0.82
    cropModal.cx = cropModal.imgX + (iw - size) / 2
    cropModal.cy = cropModal.imgY + (ih - size) / 2
    cropModal.cw = size
    cropModal.ch = size
  } else {
    const bw = iw * 0.92
    const bh = Math.min(bw / 3, ih * 0.92)
    cropModal.cx = cropModal.imgX + (iw - bw) / 2
    cropModal.cy = cropModal.imgY + (ih - bh) / 2
    cropModal.cw = bw
    cropModal.ch = bh
  }
}

function onCropMouseDown(e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  if (mx >= cropModal.cx && mx <= cropModal.cx + cropModal.cw &&
      my >= cropModal.cy && my <= cropModal.cy + cropModal.ch) {
    cropModal.dragging = true
    cropModal.dragOffX = mx - cropModal.cx
    cropModal.dragOffY = my - cropModal.cy
  }
}

function startResize(e: MouseEvent, corner: 'nw' | 'ne' | 'sw' | 'se') {
  e.stopPropagation()
  const container = document.getElementById('group-crop-container')!
  const rect = container.getBoundingClientRect()
  cropModal.resizing = corner
  cropModal.resStart = {
    mx: e.clientX - rect.left,
    my: e.clientY - rect.top,
    cx: cropModal.cx, cy: cropModal.cy,
    cw: cropModal.cw, ch: cropModal.ch,
  }
}

function onCropMouseMove(e: MouseEvent) {
  if (!cropModal.show || (!cropModal.dragging && !cropModal.resizing)) return
  const container = document.getElementById('group-crop-container')
  if (!container) return
  const rect = container.getBoundingClientRect()
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const { imgX, imgY, imgW, imgH } = cropModal
  const minSize = 30
  const isAvatar = cropModal.type === 'avatar'
  if (cropModal.dragging) {
    let nx = mx - cropModal.dragOffX
    let ny = my - cropModal.dragOffY
    nx = Math.max(imgX, Math.min(imgX + imgW - cropModal.cw, nx))
    ny = Math.max(imgY, Math.min(imgY + imgH - cropModal.ch, ny))
    cropModal.cx = nx
    cropModal.cy = ny
  } else {
    const { mx: smx, my: smy, cx, cy, cw, ch } = cropModal.resStart
    const dx = mx - smx
    const dy = my - smy
    let nx = cx, ny = cy, nw = cw, nh = ch
    if (cropModal.resizing === 'se') {
      nw = Math.max(minSize, cw + dx)
      nh = isAvatar ? nw : Math.max(minSize, ch + dy)
    } else if (cropModal.resizing === 'sw') {
      nw = Math.max(minSize, cw - dx)
      nh = isAvatar ? nw : Math.max(minSize, ch + dy)
      nx = cx + cw - nw
    } else if (cropModal.resizing === 'ne') {
      nw = Math.max(minSize, cw + dx)
      nh = isAvatar ? nw : Math.max(minSize, ch - dy)
      ny = isAvatar ? cy + ch - nw : cy + ch - nh
    } else if (cropModal.resizing === 'nw') {
      nw = Math.max(minSize, cw - dx)
      nh = isAvatar ? nw : Math.max(minSize, ch - dy)
      nx = cx + cw - nw
      ny = cy + ch - nh
    }
    nx = Math.max(imgX, nx)
    ny = Math.max(imgY, ny)
    nw = Math.min(nw, imgX + imgW - nx)
    nh = Math.min(nh, imgY + imgH - ny)
    cropModal.cx = nx
    cropModal.cy = ny
    cropModal.cw = nw
    cropModal.ch = nh
  }
}

function onCropMouseUp() {
  cropModal.dragging = false
  cropModal.resizing = ''
}

function onCropTouchStart(e: TouchEvent) {
  const touch = e.touches[0]
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const mx = touch.clientX - rect.left
  const my = touch.clientY - rect.top
  if (mx >= cropModal.cx && mx <= cropModal.cx + cropModal.cw &&
      my >= cropModal.cy && my <= cropModal.cy + cropModal.ch) {
    cropModal.dragging = true
    cropModal.dragOffX = mx - cropModal.cx
    cropModal.dragOffY = my - cropModal.cy
  }
}

function startResizeTouch(e: TouchEvent, corner: 'nw' | 'ne' | 'sw' | 'se') {
  const touch = e.touches[0]
  const container = document.getElementById('group-crop-container')!
  const rect = container.getBoundingClientRect()
  cropModal.resizing = corner
  cropModal.resStart = {
    mx: touch.clientX - rect.left,
    my: touch.clientY - rect.top,
    cx: cropModal.cx, cy: cropModal.cy,
    cw: cropModal.cw, ch: cropModal.ch,
  }
}

function onCropTouchMove(e: TouchEvent) {
  if (!e.touches.length) return
  const touch = e.touches[0]
  onCropMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent)
}

async function confirmCrop() {
  cropUploading.value = true
  try {
    const { imgX, imgY, imgW, imgH, naturalW, naturalH, cx, cy, cw, ch, type } = cropModal
    const relX = (cx - imgX) / imgW
    const relY = (cy - imgY) / imgH
    const relW = cw / imgW
    const relH = ch / imgH
    const srcX = relX * naturalW
    const srcY = relY * naturalH
    const srcW = relW * naturalW
    const srcH = relH * naturalH
    const canvas = document.createElement('canvas')
    if (type === 'avatar') { canvas.width = 400; canvas.height = 400 }
    else { canvas.width = 1200; canvas.height = Math.round(1200 * (srcH / srcW)) }
    const ctx = canvas.getContext('2d')!
    await new Promise<void>((res, rej) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => { ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height); res() }
      img.onerror = rej
      img.src = cropModal.src
    })
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.92))
    if (!blob) throw new Error('Canvas toBlob failed')
    const fd = new FormData()
    fd.append('file', blob, type === 'avatar' ? 'avatar.jpg' : 'banner.jpg')
    const result = await api.post(
      `/media/upload?folder=${type === 'avatar' ? 'avatars' : 'banners'}`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    const url = result.data.data.url
    if (type === 'avatar') {
      avatarPreview.value = url
      if (group.value) await groupsStore.updateGroup(group.value.id, { avatarUrl: url })
    } else {
      bannerPreview.value = url
      if (group.value) await groupsStore.updateGroup(group.value.id, { bannerUrl: url })
    }
    cropModal.show = false
  } catch (err) {
    console.error(err)
  } finally {
    cropUploading.value = false
  }
}

function cancelCrop() { cropModal.show = false }

// ── Load ────────────────────────────────────────────────────────────────────
async function load() {
  await groupsStore.loadGroup(route.params.slugOrId as string)
  if (!group.value) return
  const g = group.value as any
  form.name = g.name || ''
  form.slug = g.slug || ''
  form.description = g.description || ''
  form.aboutText = g.about_text || ''
  form.accentColor = g.accent_color || '#4C67CF'
  form.isPublic = g.is_public ?? true
  form.isNsfw = g.is_nsfw ?? false
  form.rulesText = g.rules_text || ''
  form.faq = Array.isArray(g.faq) ? [...g.faq] : []
  form.contactPhone = g.contact_phone || ''
  form.contactEmail = g.contact_email || ''
  form.schedule = Array.isArray(g.schedule) ? [...g.schedule] : []
  form.whatToBring = Array.isArray(g.what_to_bring) ? [...g.what_to_bring] : []
  form.productionTime = g.production_time || ''
  form.deliveryInfo = g.delivery_info || ''
  form.completedWorks = g.completed_works || 0
  form.guaranteeText = g.guarantee_text || ''
  avatarPreview.value = g.avatar_url || ''
  bannerPreview.value = g.banner_url || ''
  const sl = (g.social_links || {}) as Record<string, string>
  form.socialTelegram = sl.telegram || ''
  form.socialDiscord = sl.discord || ''
  form.socialTwitter = sl.twitter || ''
  form.socialVk = sl.vk || ''
  form.socialWebsite = sl.website || ''
  if (g.commissionInfo) {
    const c = g.commissionInfo
    commForm.value.status = c.status || 'closed'
    commForm.value.currency = c.currency || 'USD'
    commForm.value.maxQueue = c.max_queue || 5
    commForm.value.rushSlots = c.rush_slots || 0
    commForm.value.rushMax = c.rush_max || 0
    commForm.value.turnaroundDays = c.turnaround_days || ''
    commForm.value.tosText = c.tos_text || ''
    commForm.value.basePrices = { ...(c.base_prices || {}) }
    commForm.value.priceList = Array.isArray(c.price_list) ? [...c.price_list] : []
  }
  snapshotToSaved()
}
onMounted(load)

// ── File handlers (open crop instead of direct upload) ──────────────────────
function onAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  openCrop(file, 'avatar')
  if (avatarInput.value) avatarInput.value.value = ''
}
function onBannerChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  openCrop(file, 'banner')
  if (bannerInput.value) bannerInput.value.value = ''
}

// ── FAQ helpers ─────────────────────────────────────────────────────────────
function addFaq() { form.faq.push({ q: '', a: '' }) }
function removeFaq(i: number) { form.faq.splice(i, 1) }

// ── Schedule helpers ────────────────────────────────────────────────────────
function addSchedule() { form.schedule.push({ time: '', label: '' }) }
function removeSchedule(i: number) { form.schedule.splice(i, 1) }

// ── What to bring helpers ───────────────────────────────────────────────────
const newBringItem = ref('')
function addBringItem() {
  if (newBringItem.value.trim()) {
    form.whatToBring.push(newBringItem.value.trim())
    newBringItem.value = ''
  }
}
function removeBringItem(i: number) { form.whatToBring.splice(i, 1) }

// ── Price list helpers ──────────────────────────────────────────────────────
function addPriceItem() { commForm.value.priceList.push({ name: '', price: 0, description: '' }) }
function removePriceItem(i: number) { commForm.value.priceList.splice(i, 1) }

const basePriceKeys = ['headshot', 'halfbody', 'fullbody', 'ref_sheet']
const basePriceLabels: Record<string, string> = { headshot: 'Хэдшот', halfbody: 'Полтела', fullbody: 'В полный рост', ref_sheet: 'Рефшит' }

// ── Save ────────────────────────────────────────────────────────────────────
async function save() {
  if (!group.value) return
  saving.value = true
  try {
    const socialLinks: Record<string, string> = {}
    if (form.socialTelegram.trim()) socialLinks.telegram = form.socialTelegram.trim()
    if (form.socialDiscord.trim()) socialLinks.discord = form.socialDiscord.trim()
    if (form.socialTwitter.trim()) socialLinks.twitter = form.socialTwitter.trim()
    if (form.socialVk.trim()) socialLinks.vk = form.socialVk.trim()
    if (form.socialWebsite.trim()) socialLinks.website = form.socialWebsite.trim()
    await groupsStore.updateGroup(group.value.id, {
      name: form.name,
      description: form.description,
      aboutText: form.aboutText,
      accentColor: form.accentColor,
      isPublic: form.isPublic,
      isNsfw: form.isNsfw,
      rulesText: form.rulesText,
      faq: form.faq.filter((f: { q: string; a: string }) => f.q.trim()),
      contactPhone: form.contactPhone,
      contactEmail: form.contactEmail,
      schedule: form.schedule.filter((s: { time: string; label: string }) => s.time.trim()),
      whatToBring: form.whatToBring.filter(Boolean),
      socialLinks,
      productionTime: form.productionTime,
      deliveryInfo: form.deliveryInfo,
      completedWorks: form.completedWorks,
      guaranteeText: form.guaranteeText,
    })
    if (group.value.type === 'creative') {
      await groupsStore.updateCommission(group.value.id, {
        status: commForm.value.status,
        currency: commForm.value.currency,
        maxQueue: commForm.value.maxQueue,
        rushSlots: commForm.value.rushSlots,
        rushMax: commForm.value.rushMax,
        turnaroundDays: commForm.value.turnaroundDays,
        tosText: commForm.value.tosText,
        basePrices: commForm.value.basePrices,
        priceList: commForm.value.priceList.filter((p: { name: string }) => p.name.trim()),
      })
    }
    snapshotToSaved()
    showToast('success', 'Настройки группы сохранены!')
  } catch (err) {
    showToast('error', 'Ошибка сохранения')
  } finally { saving.value = false }
}

// ── Delete ──────────────────────────────────────────────────────────────────
const showDeleteConfirm = ref(false)
async function deleteGroup() {
  if (!group.value) return
  await groupsStore.deleteGroup(group.value.id)
  router.push({ name: 'groups' })
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-brand-offwhite font-nunito">

    <!-- ─── Toast notification ──────────────────────────────────────── -->
    <Transition name="toast">
      <div v-if="toast.show"
        class="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold border backdrop-blur-lg pointer-events-none"
        :class="toast.type === 'success' ? 'bg-brand-success/10 border-brand-success/30 text-brand-success' : 'bg-brand-error/10 border-brand-error/30 text-brand-error'">
        <svg v-if="toast.type === 'success'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
        <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
        {{ toast.message }}
      </div>
    </Transition>

    <!-- ─── Floating save/reset bar (dirty) ──────────────────────────── -->
    <Transition name="floatbar">
      <div v-if="isDirty"
        class="fixed bottom-6 right-6 z-50 flex items-center gap-2 p-1.5 rounded-2xl shadow-2xl border transition-all"
        :class="[shaking ? 'animate-shake' : '', unsavedWarning ? 'bg-brand-error/15 border-brand-error/40 shadow-brand-error/20' : 'bg-brand-card/90 border-brand-border backdrop-blur-xl']">
        <div class="px-3 py-1.5 flex items-center gap-2" :class="unsavedWarning ? 'text-brand-error' : 'text-white/55'">
          <div class="w-2 h-2 rounded-full animate-pulse" :class="unsavedWarning ? 'bg-brand-error' : 'bg-amber-400'"></div>
          <span class="text-xs font-bold">{{ unsavedWarning ? 'Не сохранено!' : 'Есть изменения' }}</span>
        </div>
        <button type="button" @click="resetForm"
          class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all text-white/55 hover:text-white hover:bg-white/10 border border-transparent hover:border-brand-border">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          Сбросить
        </button>
        <button type="button" @click="save" :disabled="saving"
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50 shadow-lg"
          :style="unsavedWarning ? 'background:#ef4444;box-shadow:0 4px 20px rgba(239,68,68,0.4)' : `background:${form.accentColor};box-shadow:0 4px 20px ${form.accentColor}44`">
          <span v-if="saving" class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
          {{ saving ? 'Сохранение…' : 'Сохранить' }}
        </button>
      </div>
    </Transition>

    <!-- ═══════ CROP MODAL ═══════ -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="cropModal.show" class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          @mousemove="onCropMouseMove" @mouseup="onCropMouseUp"
          @touchmove.prevent="onCropTouchMove" @touchend.prevent="onCropMouseUp">
          <div class="absolute inset-0 bg-black/85 backdrop-blur-sm" @click="cancelCrop"></div>
          <div class="relative z-10 bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full overflow-hidden select-none"
            :style="`max-width:${CROP_CONTAINER_W + 48}px`">
            <div class="px-6 py-4 border-b border-brand-border flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center bg-brand-accent/20">
                  <BIcon name="Crop" class="w-4 h-4 text-brand-accent" />
                </div>
                <div>
                  <h3 class="font-bold text-white text-sm">{{ cropModal.type === 'avatar' ? 'Обрезать аватар' : 'Обрезать баннер' }}</h3>
                  <p class="text-[11px] text-white/55">{{ cropModal.type === 'avatar' ? 'Квадрат 1:1 · Перемещайте и масштабируйте' : 'Прямоугольник · Перемещайте и масштабируйте' }}</p>
                </div>
              </div>
              <button @click="cancelCrop" class="w-8 h-8 rounded-xl flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-all">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>
            <div class="p-4 flex justify-center">
              <div id="group-crop-container"
                class="relative overflow-hidden rounded-2xl bg-black cursor-crosshair"
                :style="`width:${CROP_CONTAINER_W}px;height:${CROP_CONTAINER_H}px;max-width:100%`"
                @mousedown="onCropMouseDown" @touchstart.prevent="onCropTouchStart">
                <img :src="cropModal.src" class="absolute inset-0 w-full h-full object-contain pointer-events-none" @load="onCropImageLoad" crossorigin="anonymous"/>
                <template v-if="cropModal.imgW > 0">
                  <div class="absolute bg-black/65 pointer-events-none" :style="`left:0;top:0;right:0;height:${cropModal.cy}px`"></div>
                  <div class="absolute bg-black/65 pointer-events-none" :style="`left:0;bottom:0;right:0;top:${cropModal.cy+cropModal.ch}px`"></div>
                  <div class="absolute bg-black/65 pointer-events-none" :style="`left:0;top:${cropModal.cy}px;width:${cropModal.cx}px;height:${cropModal.ch}px`"></div>
                  <div class="absolute bg-black/65 pointer-events-none" :style="`right:0;top:${cropModal.cy}px;left:${cropModal.cx+cropModal.cw}px;height:${cropModal.ch}px`"></div>
                  <div class="absolute border-2 border-white/90 pointer-events-none"
                    :style="`left:${cropModal.cx}px;top:${cropModal.cy}px;width:${cropModal.cw}px;height:${cropModal.ch}px`">
                    <div class="absolute inset-0 pointer-events-none opacity-25">
                      <div class="absolute left-1/3 top-0 bottom-0 border-l border-white"></div>
                      <div class="absolute left-2/3 top-0 bottom-0 border-l border-white"></div>
                      <div class="absolute top-1/3 left-0 right-0 border-t border-white"></div>
                      <div class="absolute top-2/3 left-0 right-0 border-t border-white"></div>
                    </div>
                  </div>
                  <div v-for="corner in (['nw','ne','sw','se'] as const)" :key="corner"
                    class="absolute w-5 h-5 pointer-events-auto" :class="`cursor-${corner}-resize`"
                    :style="`left:${corner.includes('w') ? cropModal.cx - 4 : cropModal.cx + cropModal.cw - 17}px;top:${corner.includes('n') ? cropModal.cy - 4 : cropModal.cy + cropModal.ch - 17}px`"
                    @mousedown.stop="startResize($event, corner)" @touchstart.stop.prevent="startResizeTouch($event, corner)">
                    <div class="w-3.5 h-3.5 bg-white rounded-sm shadow-md border border-black/20"
                      :class="{ 'ml-0 mt-0': corner === 'nw', 'ml-auto mt-0': corner === 'ne', 'ml-0 mt-auto': corner === 'sw', 'ml-auto mt-auto': corner === 'se' }"></div>
                  </div>
                </template>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-brand-border flex items-center justify-between">
              <p class="text-xs text-white/35">{{ cropModal.type === 'avatar' ? 'Квадрат · Выход 400 × 400 px' : 'Прямоугольник · Выход 1200 px ширина' }}</p>
              <div class="flex gap-3">
                <button @click="cancelCrop" class="px-4 py-2 text-xs font-bold rounded-xl border border-brand-border text-white/55 hover:text-white hover:border-brand-muted/40 transition-all">Отмена</button>
                <button @click="confirmCrop" :disabled="cropUploading"
                  class="px-4 py-2 text-xs font-bold rounded-xl text-white transition-all disabled:opacity-50 shadow-lg flex items-center gap-2"
                  :style="`background:${form.accentColor};box-shadow:0 4px 16px ${form.accentColor}44`">
                  <span v-if="cropUploading" class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  {{ cropUploading ? 'Загрузка…' : 'Применить' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <AppHeader v-model:nsfwMode="nsfwMode" />
    <input ref="avatarInput" type="file" accept="image/*" class="sr-only" @change="onAvatarChange" />
    <input ref="bannerInput" type="file" accept="image/*" class="sr-only" @change="onBannerChange" />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-6 pb-20">
      <AppSidebar v-model:activeNav="activeNav" />

      <!-- ─── Settings area ────────────────────────────────────────── -->
      <main class="flex-1 min-w-0">
        <button class="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-4 transition-colors"
          @click="router.push({ name: 'group-detail', params: { slugOrId: route.params.slugOrId } })">
          <BIcon name="ArrowLeft" class="w-4 h-4" /> Назад к группе
        </button>

        <div v-if="!group" class="text-center py-16">
          <div class="h-8 w-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>

        <template v-else-if="isOwner">
          <div class="flex flex-row-reverse gap-6 items-start">

            <!-- ── Right sticky sidebar ──────────────────────────────── -->
            <aside class="w-56 hidden xl:flex flex-col gap-3 sticky top-24 self-start flex-shrink-0">

              <!-- Mini group preview card -->
              <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
                <div class="h-16 relative"
                  :style="bannerPreview ? `background-image:url(${bannerPreview});background-size:cover;background-position:center` : `background:linear-gradient(135deg,${form.accentColor}33,${form.accentColor}0a)`">
                </div>
                <div class="px-4 pb-4 -mt-6 relative">
                  <div class="w-12 h-12 rounded-full border-[3px] overflow-hidden mb-2 shadow-lg" :style="`border-color:${form.accentColor}66`">
                    <img v-if="avatarPreview" :src="avatarPreview" class="w-full h-full object-cover" />
                    <div v-else class="w-full h-full flex items-center justify-center font-bold text-lg" :style="`background:${form.accentColor}26;color:${form.accentColor}`">
                      {{ (form.name || '?')[0].toUpperCase() }}
                    </div>
                  </div>
                  <p class="font-bold text-white text-sm truncate leading-tight">{{ form.name || 'Группа' }}</p>
                  <p class="text-xs text-white/55 truncate">@{{ form.slug }}</p>
                </div>
              </div>

              <!-- Section scroll-spy nav -->
              <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
                <div class="px-4 py-3 border-b border-brand-border">
                  <h4 class="text-[11px] font-bold text-white/55 uppercase tracking-widest">Разделы</h4>
                </div>
                <nav class="p-2 space-y-0.5">
                  <button v-for="sec in sections" :key="sec.id"
                    @click="openSec(sec.id)"
                    class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all group"
                    :class="openSection === sec.id ? 'text-white' : 'text-white/55 hover:text-white'"
                    :style="openSection === sec.id ? `background:${sec.color}20;box-shadow:inset 0 0 0 1px ${sec.color}30` : ''">
                    <div class="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all"
                      :style="openSection === sec.id ? `background:${sec.color}30` : ''"
                      :class="openSection !== sec.id ? 'group-hover:bg-white/5' : ''">
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        :style="openSection === sec.id ? `color:${sec.color}` : ''"
                        :class="openSection !== sec.id ? 'text-white/55 group-hover:text-white' : ''">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="sec.iconPath" />
                      </svg>
                    </div>
                    <span class="flex-1 text-left">{{ sec.label }}</span>
                    <div v-if="openSection === sec.id" class="w-1.5 h-1.5 rounded-full flex-shrink-0" :style="`background:${sec.color}`"></div>
                  </button>
                </nav>
              </div>
            </aside>

            <!-- ── Form column ─────────────────────────────────────────── -->
            <div class="flex-1 min-w-0 space-y-5">

              <!-- Page header -->
              <div class="flex items-center gap-4">
                <div>
                  <h1 class="text-2xl font-extrabold text-white tracking-tight">Настройки группы</h1>
                  <p class="text-sm text-white/55 mt-0.5">{{ sections.find((s: any) => s.id === openSection)?.label ?? 'Группа' }}</p>
                </div>
              </div>

              <!-- Mobile section tabs (xl+ uses the sticky sidebar instead) -->
              <div class="flex gap-2 overflow-x-auto pb-1 xl:hidden no-scrollbar">
                <button v-for="sec in sections" :key="sec.id"
                  @click="openSec(sec.id)"
                  class="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all"
                  :class="openSection === sec.id ? 'text-white border-transparent shadow-lg' : 'text-white/55 border-brand-border hover:border-white/20 bg-brand-card'"
                  :style="openSection === sec.id ? `background:${sec.color};box-shadow:0 4px 12px ${sec.color}44` : ''">
                  {{ sec.label }}
                </button>
              </div>

              <form @submit.prevent="save" class="space-y-5">

                <!-- ═══ § GENERAL ═══════════════════════════════════════ -->
                <section v-show="openSection === 'sec-general'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${baseSections[0].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${baseSections[0].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${baseSections[0].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="baseSections[0].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ baseSections[0].label }}</h2>
                  </div>
                  <div class="p-6 space-y-5">
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Название</label>
                      <input v-model="form.name" class="field-input" placeholder="Название группы" />
                    </div>
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Ссылка (slug)</label>
                      <div class="relative">
                        <span class="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 text-sm">@</span>
                        <input v-model="form.slug" disabled class="field-input pl-8 text-white/40 cursor-not-allowed" />
                      </div>
                      <p class="text-white/25 text-xs mt-1.5">Slug нельзя изменить после создания</p>
                    </div>
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Краткое описание</label>
                      <textarea v-model="form.description" rows="2" class="field-input resize-none" />
                    </div>
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Подробное описание</label>
                      <textarea v-model="form.aboutText" rows="5" placeholder="Расскажите подробнее о группе..." class="field-input resize-none" />
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label class="flex items-center gap-3 cursor-pointer select-none bg-brand-bg/40 border border-brand-border rounded-2xl p-3">
                        <button type="button" class="w-10 h-6 rounded-full transition-colors flex items-center p-0.5 shrink-0"
                          :class="form.isPublic ? 'bg-brand-success' : 'bg-brand-muted'" @click="form.isPublic = !form.isPublic">
                          <span class="w-5 h-5 rounded-full bg-white shadow-md transition-transform" :class="form.isPublic ? 'translate-x-4' : 'translate-x-0'" />
                        </button>
                        <div><p class="text-white text-sm font-semibold">{{ form.isPublic ? 'Публичная' : 'Закрытая' }}</p><p class="text-white/30 text-xs">{{ form.isPublic ? 'Все видят' : 'По приглашению' }}</p></div>
                      </label>
                      <label class="flex items-center gap-3 cursor-pointer select-none bg-brand-bg/40 border border-brand-border rounded-2xl p-3">
                        <button type="button" class="w-10 h-6 rounded-full transition-colors flex items-center p-0.5 shrink-0"
                          :class="form.isNsfw ? 'bg-brand-error' : 'bg-brand-muted'" @click="form.isNsfw = !form.isNsfw">
                          <span class="w-5 h-5 rounded-full bg-white shadow-md transition-transform" :class="form.isNsfw ? 'translate-x-4' : 'translate-x-0'" />
                        </button>
                        <div><p class="text-white text-sm font-semibold">NSFW (18+)</p><p class="text-white/30 text-xs">Контент для взрослых</p></div>
                      </label>
                    </div>
                  </div>
                </section>

                <!-- ═══ § APPEARANCE ═══════════════════════════════════ -->
                <section v-show="openSection === 'sec-appearance'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${baseSections[1].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${baseSections[1].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${baseSections[1].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="baseSections[1].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ baseSections[1].label }}</h2>
                  </div>
                  <div class="p-0">
                    <!-- Combined banner + avatar preview -->
                    <div class="relative">
                      <div class="relative w-full h-48 overflow-hidden cursor-pointer group transition-all"
                        :style="bannerPreview ? `background-image:url(${bannerPreview});background-size:cover;background-position:center` : `background:linear-gradient(135deg,${form.accentColor}30 0%,${form.accentColor}08 60%,transparent 100%)`"
                        @click="bannerInput?.click()">
                        <div v-if="!bannerPreview" class="absolute inset-0 pointer-events-none"
                          style="background-image:repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,0.025) 39px,rgba(255,255,255,0.025) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,0.025) 39px,rgba(255,255,255,0.025) 40px)"></div>
                        <div class="absolute inset-0 transition-all duration-200 flex flex-col items-center justify-center gap-2 pointer-events-none bg-black/50 opacity-0 group-hover:opacity-100">
                          <div class="w-10 h-10 rounded-2xl border bg-white/15 border-white/25 flex items-center justify-center backdrop-blur">
                            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                          </div>
                          <span class="text-white text-xs font-bold">{{ bannerPreview ? 'Изменить баннер' : 'Добавить баннер' }}</span>
                        </div>
                        <div v-if="bannerPreview" class="absolute top-3 right-3 flex gap-1.5">
                          <button type="button" @click.stop="reopenCrop('banner')"
                            class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/55 border border-white/20 backdrop-blur text-white/75 hover:text-white hover:bg-black/80 transition-all text-[10px] font-bold">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                            Кадр
                          </button>
                          <button type="button" @click.stop="bannerPreview = ''; bannerOriginalSrc = ''; groupsStore.updateGroup(group!.id, { bannerUrl: '' })"
                            class="w-7 h-7 rounded-full bg-black/55 border border-white/20 backdrop-blur flex items-center justify-center text-white/70 hover:text-white hover:bg-black/80 transition-all">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </div>
                      </div>
                      <!-- Avatar -->
                      <div class="absolute left-6 -bottom-10">
                        <div class="relative w-20 h-20 rounded-full cursor-pointer group/av" @click="avatarInput?.click()">
                          <div class="w-20 h-20 rounded-full overflow-hidden border-[3px] shadow-xl" :style="`border-color:${form.accentColor}66`">
                            <img v-if="avatarPreview" :src="avatarPreview" class="w-full h-full object-cover"/>
                            <div v-else class="w-full h-full flex items-center justify-center font-bold text-3xl" :style="`background:${form.accentColor}26;color:${form.accentColor}`">
                              {{ (form.name || '?')[0].toUpperCase() }}
                            </div>
                          </div>
                          <div class="absolute inset-0 rounded-full transition-all duration-200 flex items-center justify-center bg-black/55 opacity-0 group-hover/av:opacity-100">
                            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                          </div>
                          <button v-if="avatarPreview" type="button"
                            @click.stop="avatarPreview = ''; avatarOriginalSrc = ''; groupsStore.updateGroup(group!.id, { avatarUrl: '' })"
                            class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-brand-error border-2 border-brand-card flex items-center justify-center text-white shadow-lg opacity-0 group-hover/av:opacity-100 transition-all">
                            <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                    <!-- Actions -->
                    <div class="pt-12 px-6 pb-4 flex items-end justify-between">
                      <div>
                        <p class="font-bold text-white text-sm">{{ form.name || 'Название' }}</p>
                        <p class="text-xs text-white/55">@{{ form.slug }}</p>
                      </div>
                      <div class="flex flex-wrap gap-2 text-xs text-white/35 font-semibold">
                        <button type="button" @click="avatarInput?.click()"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border hover:border-brand-accent/50 hover:text-white transition-all">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                          Аватар
                        </button>
                        <button type="button" @click="bannerInput?.click()"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border hover:border-brand-accent/50 hover:text-white transition-all">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                          Баннер
                        </button>
                        <button v-if="avatarPreview" type="button" @click="reopenCrop('avatar')"
                          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border hover:border-sky-400/50 hover:text-sky-300 transition-all">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                          Кадр аватар
                        </button>
                      </div>
                    </div>

                    <!-- Accent color -->
                    <div class="px-6 pb-6 space-y-5 border-t border-brand-border/40 pt-5 mt-2">
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Акцентный цвет</label>
                        <div class="flex flex-wrap gap-2">
                          <button v-for="c in presetColors" :key="c" type="button" class="w-9 h-9 rounded-xl border-2 transition-all duration-200 hover:scale-110"
                            :class="form.accentColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'"
                            :style="{ backgroundColor: c }" @click="form.accentColor = c" />
                          <label class="w-9 h-9 rounded-xl border-2 border-dashed border-brand-border hover:border-brand-accent/40 flex items-center justify-center cursor-pointer transition-colors">
                            <BIcon name="Pipette" class="w-4 h-4 text-white/30" />
                            <input v-model="form.accentColor" type="color" class="sr-only" />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <!-- ═══ § CONTENT ════════════════════════════════════════ -->
                <section v-show="openSection === 'sec-content'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${baseSections[2].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${baseSections[2].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${baseSections[2].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="baseSections[2].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ baseSections[2].label }}</h2>
                  </div>
                  <div class="p-6 space-y-5">
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Правила</label>
                      <textarea v-model="form.rulesText" rows="6" placeholder="Напишите правила группы…" class="field-input resize-none" />
                    </div>
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider">FAQ</label>
                        <button type="button" class="text-xs font-semibold hover:text-brand-accent-plus transition-colors" :style="`color:${baseSections[2].color}`" @click="addFaq">+ Добавить</button>
                      </div>
                      <div class="space-y-3">
                        <div v-for="(item, idx) in form.faq" :key="idx" class="bg-brand-bg/40 border border-brand-border rounded-2xl p-3 space-y-2 relative">
                          <button type="button" class="absolute top-2 right-2 w-6 h-6 rounded-lg bg-brand-error/10 flex items-center justify-center hover:bg-brand-error/20 transition-colors" @click="removeFaq(idx)">
                            <BIcon name="X" class="w-3 h-3 text-brand-error" />
                          </button>
                          <input v-model="item.q" placeholder="Вопрос" class="field-input" />
                          <textarea v-model="item.a" rows="2" placeholder="Ответ" class="field-input resize-none" />
                        </div>
                      </div>
                      <p v-if="!form.faq.length" class="text-white/25 text-xs mt-1.5">Нажмите «Добавить» чтобы создать FAQ</p>
                    </div>
                  </div>
                </section>

                <!-- ═══ § EVENT ══════════════════════════════════════════ -->
                <section v-if="group.type === 'event'" v-show="openSection === 'sec-event'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${eventSections[0].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${eventSections[0].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${eventSections[0].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="eventSections[0].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ eventSections[0].label }}</h2>
                  </div>
                  <div class="p-6 space-y-5">
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider">Расписание</label>
                        <button type="button" class="text-xs font-semibold" :style="`color:${eventSections[0].color}`" @click="addSchedule">+ Добавить</button>
                      </div>
                      <div class="space-y-2">
                        <div v-for="(item, idx) in form.schedule" :key="idx" class="flex items-center gap-2">
                          <input v-model="item.time" placeholder="09:30 - 10:00" class="w-32 field-input font-mono" />
                          <input v-model="item.label" placeholder="Описание" class="flex-1 field-input" />
                          <button type="button" class="w-8 h-8 rounded-lg bg-brand-error/10 flex items-center justify-center hover:bg-brand-error/20 shrink-0" @click="removeSchedule(idx)">
                            <BIcon name="X" class="w-3 h-3 text-brand-error" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Что взять с собой</label>
                      <div class="flex flex-wrap gap-2 mb-2">
                        <span v-for="(item, idx) in form.whatToBring" :key="idx"
                          class="flex items-center gap-1.5 bg-brand-bg/60 border border-brand-border rounded-xl px-3 py-1.5 text-white text-xs">
                          {{ item }}
                          <button type="button" class="text-brand-error hover:text-brand-error/70" @click="removeBringItem(idx)"><BIcon name="X" class="w-3 h-3" /></button>
                        </span>
                      </div>
                      <div class="flex gap-2">
                        <input v-model="newBringItem" placeholder="Коврик, вода…" class="flex-1 field-input" @keyup.enter="addBringItem" />
                        <button type="button" class="px-3 py-2 rounded-xl text-white text-xs font-bold" :style="`background:${eventSections[0].color}`" @click="addBringItem">Добавить</button>
                      </div>
                    </div>
                  </div>
                </section>

                <!-- ═══ § ORGANIZERS ═════════════════════════════════════ -->
                <section v-if="group.type === 'event'" v-show="openSection === 'sec-organizers'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${eventSections[1].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${eventSections[1].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${eventSections[1].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="eventSections[1].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ eventSections[1].label }}</h2>
                  </div>
                  <div class="p-6 space-y-5">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Телефон</label>
                        <input v-model="form.contactPhone" placeholder="+7 (999) 123-45-67" class="field-input" />
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Email</label>
                        <input v-model="form.contactEmail" placeholder="event@example.com" class="field-input" />
                      </div>
                    </div>
                  </div>
                </section>

                <!-- ═══ § COMMISSIONS ════════════════════════════════════ -->
                <section v-if="group.type === 'creative'" v-show="openSection === 'sec-commissions'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${creativeSections[0].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${creativeSections[0].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${creativeSections[0].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="creativeSections[0].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ creativeSections[0].label }}</h2>
                  </div>
                  <div class="p-6 space-y-5">
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Статус приёма заказов</label>
                      <div class="grid grid-cols-3 gap-2">
                        <button v-for="s in [
                          { value: 'open' as const, label: 'Открыт', cls: 'brand-success' },
                          { value: 'waitlist' as const, label: 'Ожидание', cls: 'brand-yellow' },
                          { value: 'closed' as const, label: 'Закрыт', cls: 'brand-error' },
                        ]" :key="s.value" type="button"
                          class="py-2.5 rounded-xl border text-xs font-bold transition-all"
                          :class="commForm.status === s.value ? `bg-${s.cls}/10 border-${s.cls}/40 text-${s.cls}` : 'bg-brand-bg/40 border-brand-border text-white/40'"
                          @click="commForm.status = s.value">
                          {{ s.label }}
                        </button>
                      </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Макс. очередь</label>
                        <input v-model.number="commForm.maxQueue" type="number" min="1" class="field-input" />
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Валюта</label>
                        <select v-model="commForm.currency" class="field-input appearance-none">
                          <option value="USD">USD ($)</option><option value="EUR">EUR (€)</option><option value="RUB">RUB (₽)</option>
                        </select>
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Быстрых мест</label>
                        <input v-model.number="commForm.rushSlots" type="number" min="0" class="field-input" />
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Срок выполнения</label>
                        <input v-model="commForm.turnaroundDays" placeholder="5-7 дней" class="field-input" />
                      </div>
                    </div>
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Условия (ToS)</label>
                      <textarea v-model="commForm.tosText" rows="4" placeholder="Условия приёма заказов…" class="field-input resize-none" />
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Срок изготовления</label>
                        <input v-model="form.productionTime" placeholder="2-3 месяца" class="field-input" />
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Выполнено работ</label>
                        <input v-model.number="form.completedWorks" type="number" min="0" class="field-input" />
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Доставка</label>
                        <input v-model="form.deliveryInfo" placeholder="По всему миру" class="field-input" />
                      </div>
                      <div>
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Гарантия</label>
                        <input v-model="form.guaranteeText" placeholder="Гарантия качества" class="field-input" />
                      </div>
                    </div>
                  </div>
                </section>

                <!-- ═══ § PRICES ═════════════════════════════════════════ -->
                <section v-if="group.type === 'creative' || group.type === 'shop'" v-show="openSection === 'sec-prices'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3" style="background:linear-gradient(90deg,#34d3990c 0%,transparent 100%)">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:#34d3991a">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color:#34d399">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">Прайс-лист</h2>
                  </div>
                  <div class="p-6 space-y-5">
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 block">Базовые цены</label>
                      <div class="space-y-2">
                        <div v-for="key in basePriceKeys" :key="key" class="flex items-center gap-3 bg-brand-bg/40 border border-brand-border rounded-xl px-3 py-2">
                          <span class="text-white text-xs font-semibold flex-1">{{ basePriceLabels[key] }}</span>
                          <input v-model.number="commForm.basePrices[key]" type="number" min="0" placeholder="0"
                            class="w-24 bg-brand-bg border border-brand-border rounded-lg px-3 py-1.5 text-white text-xs text-right focus:border-brand-accent focus:outline-none" />
                          <span class="text-white/30 text-xs w-8">{{ commForm.currency }}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider">Детальный прайс</label>
                        <button type="button" class="text-xs font-semibold" style="color:#34d399" @click="addPriceItem">+ Добавить</button>
                      </div>
                      <div class="space-y-2">
                        <div v-for="(item, idx) in commForm.priceList" :key="idx" class="bg-brand-bg/40 border border-brand-border rounded-2xl p-3 space-y-2 relative">
                          <button type="button" class="absolute top-2 right-2 w-6 h-6 rounded-lg bg-brand-error/10 flex items-center justify-center" @click="removePriceItem(idx)">
                            <BIcon name="X" class="w-3 h-3 text-brand-error" />
                          </button>
                          <div class="flex gap-2">
                            <input v-model="item.name" placeholder="Название" class="flex-1 field-input" />
                            <input v-model.number="item.price" type="number" min="0" placeholder="Цена" class="w-24 field-input text-right" />
                          </div>
                          <input v-model="item.description" placeholder="Описание (опционально)" class="field-input text-xs" />
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <!-- ═══ § SOCIAL LINKS ═══════════════════════════════════ -->
                <section v-show="openSection === 'sec-social'" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                    :style="`background:linear-gradient(90deg,${tailSections[0].color}0c 0%,transparent 100%)`">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${tailSections[0].color}1a`">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${tailSections[0].color}`">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="tailSections[0].iconPath"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-white text-sm">{{ tailSections[0].label }}</h2>
                  </div>
                  <div class="p-6 space-y-4">
                    <div v-for="link in [
                      { key: 'socialTelegram', label: 'Telegram', placeholder: 'https://t.me/...', d: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z' },
                      { key: 'socialDiscord', label: 'Discord', placeholder: 'https://discord.gg/...', d: 'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z' },
                      { key: 'socialTwitter', label: 'Twitter / X', placeholder: 'https://x.com/...', d: 'M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z' },
                      { key: 'socialVk', label: 'VK', placeholder: 'https://vk.com/...', d: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20' },
                      { key: 'socialWebsite', label: 'Сайт', placeholder: 'https://...', d: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9' },
                    ]" :key="link.key" class="flex items-center gap-3">
                      <div class="w-9 h-9 rounded-xl bg-brand-bg border border-brand-border flex items-center justify-center shrink-0">
                        <svg class="w-4 h-4 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="link.d"/></svg>
                      </div>
                      <div class="flex-1">
                        <label class="text-xs font-semibold text-white/55 mb-0.5 block">{{ link.label }}</label>
                        <input v-model="(form as any)[link.key]" :placeholder="link.placeholder" class="field-input" />
                      </div>
                    </div>
                  </div>
                </section>

                <!-- ═══ § DANGER ZONE ════════════════════════════════════ -->
                <section v-show="openSection === 'sec-danger'" class="bg-brand-card border border-brand-error/20 rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                  <div class="px-6 py-4 border-b border-brand-error/20 flex items-center gap-3"
                    style="background:linear-gradient(90deg,rgba(239,68,68,0.05) 0%,transparent 100%)">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(239,68,68,0.1)">
                      <svg class="w-4 h-4 text-brand-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                      </svg>
                    </div>
                    <h2 class="font-bold text-brand-error text-sm">Опасная зона</h2>
                  </div>
                  <div class="p-6 space-y-5">
                    <p class="text-white/40 text-sm">Эти действия необратимы. Будьте осторожны.</p>
                    <div class="bg-brand-bg/40 border border-brand-error/20 rounded-2xl p-4 flex items-center justify-between">
                      <div>
                        <p class="text-white font-bold text-sm">Удалить группу</p>
                        <p class="text-white/40 text-xs">Все данные, события и подписчики будут удалены</p>
                      </div>
                      <button v-if="!showDeleteConfirm" type="button" class="px-4 py-2 rounded-xl bg-brand-error/10 text-brand-error text-xs font-bold hover:bg-brand-error/20 transition-colors"
                        @click="showDeleteConfirm = true">Удалить</button>
                      <div v-else class="flex gap-2">
                        <button type="button" class="px-3 py-2 rounded-xl bg-brand-bg border border-brand-border text-white/50 text-xs font-bold" @click="showDeleteConfirm = false">Отмена</button>
                        <button type="button" class="px-3 py-2 rounded-xl bg-brand-error text-white text-xs font-bold" @click="deleteGroup">Подтвердить</button>
                      </div>
                    </div>
                  </div>
                </section>

              </form>
            </div><!-- /form column -->
          </div><!-- /flex-row-reverse -->
        </template>

        <div v-else class="text-center py-16">
          <BIcon name="Lock" class="w-12 h-12 text-brand-error mx-auto mb-4" />
          <p class="text-white/40 text-sm">У вас нет доступа к настройкам этой группы</p>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
.field-input {
  @apply w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/50 focus:outline-none transition-all;
}
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
.toast-enter-active, .toast-leave-active { transition: all 0.4s cubic-bezier(0.34,1.56,0.64,1); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.88); }
.floatbar-enter-active, .floatbar-leave-active { transition: all 0.4s cubic-bezier(0.34,1.56,0.64,1); }
.floatbar-enter-from, .floatbar-leave-to { opacity: 0; transform: translateY(20px) scale(0.92); }
.modal-fade-enter-active, .modal-fade-leave-active { transition: all 0.25s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; transform: scale(0.96); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
@keyframes shake {
  0%,100% { transform: translateX(0); }
  15%     { transform: translateX(-6px); }
  30%     { transform: translateX(6px); }
  45%     { transform: translateX(-5px); }
  60%     { transform: translateX(5px); }
  75%     { transform: translateX(-3px); }
  90%     { transform: translateX(3px); }
}
.animate-shake { animation: shake 0.55s ease; }
</style>