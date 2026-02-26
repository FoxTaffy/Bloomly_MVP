<template>
  <div class="min-h-screen bg-brand-bg text-brand-offwhite font-nunito">
    <div class="max-w-2xl mx-auto px-4 py-8 pb-16">

      <!-- Header -->
      <div class="flex items-center gap-3 mb-8">
        <router-link
          to="/"
          class="w-9 h-9 flex items-center justify-center rounded-xl bg-brand-card border border-brand-border text-brand-accent-minus hover:text-brand-offwhite hover:border-brand-accent transition-all"
          aria-label="Back"
        >
          ←
        </router-link>
        <h1 class="text-xl font-extrabold text-brand-offwhite">Редактировать профиль</h1>
      </div>

      <!-- Success banner -->
      <div
        v-if="saved"
        class="mb-6 px-4 py-3 bg-brand-success/10 border border-brand-success/30 text-brand-success rounded-2xl text-sm font-semibold"
      >
        ✓ Профиль сохранён.
      </div>

      <!-- Error banner -->
      <div
        v-if="userStore.error"
        class="mb-6 px-4 py-3 bg-brand-error/10 border border-brand-error/30 text-brand-error rounded-2xl text-sm font-semibold"
      >
        {{ userStore.error }}
      </div>

      <form @submit.prevent="handleSubmit" class="flex flex-col gap-5">

        <!-- Display name -->
        <div>
          <label class="block text-sm font-semibold text-brand-accent-minus mb-1.5">Отображаемое имя</label>
          <input
            v-model="form.display_name"
            type="text"
            maxlength="50"
            placeholder="Ваше имя"
            class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-offwhite placeholder-brand-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all"
          />
          <p class="text-xs text-brand-muted mt-1">{{ form.display_name?.length ?? 0 }} / 50</p>
        </div>

        <!-- Bio -->
        <div>
          <label class="block text-sm font-semibold text-brand-accent-minus mb-1.5">О себе</label>
          <textarea
            v-model="form.bio"
            rows="4"
            maxlength="300"
            placeholder="Расскажите о себе…"
            class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-offwhite placeholder-brand-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all resize-none"
          ></textarea>
          <p class="text-xs text-brand-muted mt-1">{{ form.bio?.length ?? 0 }} / 300</p>
        </div>

        <!-- Status -->
        <div>
          <label class="block text-sm font-semibold text-brand-accent-minus mb-1.5">Статус</label>
          <input
            v-model="form.status"
            type="text"
            maxlength="100"
            placeholder="Чем вы занимаетесь?"
            class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-offwhite placeholder-brand-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all"
          />
        </div>

        <!-- Persona -->
        <div>
          <label class="block text-sm font-semibold text-brand-accent-minus mb-1.5">Персонаж</label>
          <input
            v-model="form.persona"
            type="text"
            placeholder="Напр. Волк, Кот, Лиса…"
            class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-offwhite placeholder-brand-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all"
          />
        </div>

        <!-- Avatar URL -->
        <div>
          <label class="block text-sm font-semibold text-brand-accent-minus mb-1.5">URL аватара</label>
          <input
            v-model="form.avatar_url"
            type="url"
            placeholder="https://…"
            class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-offwhite placeholder-brand-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all"
          />
        </div>

        <!-- Banner URL -->
        <div>
          <label class="block text-sm font-semibold text-brand-accent-minus mb-1.5">URL баннера</label>
          <input
            v-model="form.banner_url"
            type="url"
            placeholder="https://…"
            class="w-full bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-offwhite placeholder-brand-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all"
          />
        </div>

        <!-- Accent color -->
        <div>
          <label class="block text-sm font-semibold text-brand-accent-minus mb-1.5">Акцентный цвет</label>
          <div class="flex items-center gap-3">
            <input
              v-model="form.accent_color"
              type="color"
              class="h-10 w-14 rounded-xl cursor-pointer bg-transparent border border-brand-border p-1"
            />
            <input
              v-model="form.accent_color"
              type="text"
              maxlength="7"
              placeholder="#4C97CF"
              class="flex-1 bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-sm font-mono text-brand-offwhite placeholder-brand-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all"
            />
          </div>
          <p class="text-xs text-brand-muted mt-1">HEX формат: #RRGGBB</p>
        </div>

        <!-- Likes -->
        <div>
          <label class="block text-sm font-semibold text-brand-accent-minus mb-1.5">Нравится</label>
          <div class="flex flex-wrap gap-2 mb-2">
            <span
              v-for="(item, idx) in form.likes"
              :key="idx"
              class="flex items-center gap-1 px-3 py-1 bg-brand-success/10 border border-brand-success/25 text-brand-success text-sm rounded-full font-medium"
            >
              {{ item }}
              <button
                type="button"
                class="ml-1 text-brand-success/60 hover:text-brand-success leading-none"
                @click="removeTag('likes', idx)"
              >×</button>
            </span>
          </div>
          <div class="flex gap-2">
            <input
              v-model="newLike"
              type="text"
              placeholder="Добавить интерес…"
              class="flex-1 bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-offwhite placeholder-brand-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all"
              @keydown.enter.prevent="addTag('likes')"
            />
            <button
              type="button"
              class="px-4 py-3 bg-brand-success/15 border border-brand-success/30 text-brand-success hover:bg-brand-success/25 rounded-xl text-sm font-bold transition-colors"
              @click="addTag('likes')"
            >
              +
            </button>
          </div>
        </div>

        <!-- Dislikes -->
        <div>
          <label class="block text-sm font-semibold text-brand-accent-minus mb-1.5">Не нравится</label>
          <div class="flex flex-wrap gap-2 mb-2">
            <span
              v-for="(item, idx) in form.dislikes"
              :key="idx"
              class="flex items-center gap-1 px-3 py-1 bg-brand-error/10 border border-brand-error/25 text-brand-error text-sm rounded-full font-medium"
            >
              {{ item }}
              <button
                type="button"
                class="ml-1 text-brand-error/60 hover:text-brand-error leading-none"
                @click="removeTag('dislikes', idx)"
              >×</button>
            </span>
          </div>
          <div class="flex gap-2">
            <input
              v-model="newDislike"
              type="text"
              placeholder="Добавить антипатию…"
              class="flex-1 bg-brand-card border border-brand-border rounded-xl px-4 py-3 text-sm text-brand-offwhite placeholder-brand-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all"
              @keydown.enter.prevent="addTag('dislikes')"
            />
            <button
              type="button"
              class="px-4 py-3 bg-brand-error/10 border border-brand-error/25 text-brand-error hover:bg-brand-error/20 rounded-xl text-sm font-bold transition-colors"
              @click="addTag('dislikes')"
            >
              +
            </button>
          </div>
        </div>

        <!-- Submit -->
        <div class="pt-2">
          <button
            type="submit"
            :disabled="userStore.isLoading"
            class="w-full py-3 bg-brand-accent hover:bg-brand-accent-plus disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-sm font-bold text-white transition-colors shadow-lg shadow-brand-accent/25"
          >
            <span v-if="userStore.isLoading">Сохранение…</span>
            <span v-else>Сохранить профиль</span>
          </button>
        </div>

      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { useAuthStore } from '@/stores/auth'

const userStore = useUserStore()
const authStore = useAuthStore()

const saved      = ref(false)
const newLike    = ref('')
const newDislike = ref('')

const form = reactive({
  display_name: '',
  bio:          '',
  status:       '',
  persona:      '',
  avatar_url:   '',
  banner_url:   '',
  accent_color: '#4C97CF',
  likes:        [] as string[],
  dislikes:     [] as string[],
})

onMounted(async () => {
  await userStore.fetchMyProfile()
  const p = userStore.profile
  if (!p) return
  form.display_name = p.display_name ?? ''
  form.bio          = p.bio          ?? ''
  form.status       = p.status       ?? ''
  form.persona      = p.persona      ?? ''
  form.avatar_url   = p.avatar_url   ?? ''
  form.banner_url   = p.banner_url   ?? ''
  form.accent_color = p.accent_color ?? '#4C97CF'
  form.likes        = [...p.likes]
  form.dislikes     = [...p.dislikes]
})

function addTag(field: 'likes' | 'dislikes') {
  const raw  = field === 'likes' ? newLike : newDislike
  const val  = raw.value.trim()
  if (!val || form[field].includes(val)) return
  form[field].push(val)
  if (field === 'likes') newLike.value = ''
  else newDislike.value = ''
}

function removeTag(field: 'likes' | 'dislikes', idx: number) {
  form[field].splice(idx, 1)
}

async function handleSubmit() {
  saved.value = false
  const payload: Record<string, unknown> = {}

  if (form.display_name) payload.display_name = form.display_name
  if (form.bio)          payload.bio           = form.bio
  if (form.status)       payload.status        = form.status
  if (form.persona)      payload.persona       = form.persona
  if (form.avatar_url)   payload.avatar_url    = form.avatar_url
  if (form.banner_url)   payload.banner_url    = form.banner_url
  if (/^#[0-9A-Fa-f]{6}$/.test(form.accent_color)) payload.accent_color = form.accent_color

  payload.likes    = form.likes
  payload.dislikes = form.dislikes

  try {
    await userStore.updateProfile(payload)
    saved.value = true
    setTimeout(() => { saved.value = false }, 3000)
  } catch {
    // error is shown via userStore.error
  }
}
</script>
