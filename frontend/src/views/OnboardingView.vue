<template>
  <div class="min-h-screen bg-[#0f0f18] flex flex-col items-center justify-center px-4 py-8">

    <!-- Header -->
    <div class="mb-8 text-center">
      <img src="/bloomly.png" alt="Bloomly" class="h-10 mx-auto mb-3" />
      <p class="text-purple-400 text-sm tracking-wide">Добро пожаловать в Bloomly!</p>
    </div>

    <!-- Шаги-прогресс-бар -->
    <div class="flex items-center gap-2 mb-8">
      <template v-for="i in TOTAL_STEPS" :key="i">
        <div
          class="h-2 rounded-full transition-all duration-300"
          :class="[
            i <= step ? 'bg-purple-500' : 'bg-white/10',
            i === step ? 'w-8' : 'w-4',
          ]"
        />
      </template>
    </div>

    <!-- Карточка -->
    <div class="w-full max-w-md bg-[#1a1a2e] rounded-2xl p-8 shadow-xl border border-white/5">

      <!-- ══ ШАГ 1: Основное ══ -->
      <Transition name="fade" mode="out-in">
        <div v-if="step === 1" key="step1">
          <h2 class="text-white text-2xl font-bold mb-1">Расскажи о себе</h2>
          <p class="text-white/50 text-sm mb-6">Как тебя называть на Bloomly?</p>

          <div class="space-y-4">
            <!-- Отображаемое имя -->
            <div>
              <label class="text-sm text-white/60 mb-1.5 block">Отображаемое имя <span class="text-purple-400">*</span></label>
              <input
                v-model="form.display_name"
                maxlength="50"
                placeholder="Имя или псевдоним"
                class="input-field"
                autofocus
              />
              <p class="text-xs text-white/30 mt-1">{{ form.display_name.length }}/50</p>
            </div>

            <!-- Местоимения -->
            <div>
              <label class="text-sm text-white/60 mb-1.5 block">Местоимения</label>
              <div class="flex flex-wrap gap-2 mb-2">
                <button
                  v-for="p in PRONOUNS_OPTIONS"
                  :key="p"
                  type="button"
                  @click="form.pronouns = p"
                  class="pronouns-chip"
                  :class="form.pronouns === p ? 'pronouns-chip--active' : ''"
                >{{ p }}</button>
              </div>
              <input
                v-model="form.pronouns"
                maxlength="30"
                placeholder="или введи свои..."
                class="input-field text-sm"
              />
            </div>

            <!-- Описание -->
            <div>
              <label class="text-sm text-white/60 mb-1.5 block">О себе</label>
              <textarea
                v-model="form.bio"
                maxlength="300"
                rows="3"
                placeholder="Пару слов о себе..."
                class="input-field resize-none"
              />
              <p class="text-xs text-white/30 mt-1">{{ form.bio.length }}/300</p>
            </div>
          </div>
        </div>
      </Transition>

      <!-- ══ ШАГ 2: Фурсона ══ -->
      <Transition name="fade" mode="out-in">
        <div v-if="step === 2" key="step2">
          <h2 class="text-white text-2xl font-bold mb-1">Твой фурсона</h2>
          <p class="text-white/50 text-sm mb-6">Необязательно, можно пропустить</p>

          <div class="space-y-4">
            <!-- Имя фурсоны -->
            <div>
              <label class="text-sm text-white/60 mb-1.5 block">Имя фурсоны</label>
              <input
                v-model="form.fursona_name"
                maxlength="80"
                placeholder="Как зовут твоего персонажа?"
                class="input-field"
              />
            </div>

            <!-- Вид/пол фурсоны -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm text-white/60 mb-1.5 block">Вид</label>
                <select v-model="form.fursona_gender" class="input-field">
                  <option value="">— не указан —</option>
                  <option v-for="s in SPECIES_OPTIONS" :key="s" :value="s">{{ s }}</option>
                </select>
              </div>
              <div>
                <label class="text-sm text-white/60 mb-1.5 block">Основной цвет</label>
                <div class="flex items-center gap-2">
                  <input
                    type="color"
                    v-model="form.fursona_color"
                    class="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0 p-0.5"
                  />
                  <input
                    v-model="form.fursona_color"
                    maxlength="50"
                    placeholder="#a855f7"
                    class="input-field flex-1 text-sm font-mono"
                  />
                </div>
              </div>
            </div>

            <!-- Описание фурсоны -->
            <div>
              <label class="text-sm text-white/60 mb-1.5 block">Описание</label>
              <textarea
                v-model="form.fursona_description"
                rows="3"
                maxlength="500"
                placeholder="Расскажи о персонаже..."
                class="input-field resize-none"
              />
            </div>
          </div>
        </div>
      </Transition>

      <!-- ══ ШАГ 3: Интересы ══ -->
      <Transition name="fade" mode="out-in">
        <div v-if="step === 3" key="step3">
          <h2 class="text-white text-2xl font-bold mb-1">Интересы</h2>
          <p class="text-white/50 text-sm mb-6">Выбери то, что тебе близко</p>

          <div class="flex flex-wrap gap-2 max-h-72 overflow-y-auto pr-1 custom-scroll">
            <button
              v-for="tag in INTERESTS_OPTIONS"
              :key="tag"
              type="button"
              @click="toggleInterest(tag)"
              class="interest-chip"
              :class="form.interests.includes(tag) ? 'interest-chip--active' : ''"
            >
              {{ tag }}
            </button>
          </div>
          <p class="text-xs text-white/30 mt-3">Выбрано: {{ form.interests.length }}</p>
        </div>
      </Transition>

      <!-- ══ ШАГ 4: Готово ══ -->
      <Transition name="fade" mode="out-in">
        <div v-if="step === 4" key="step4" class="text-center py-4">
          <div class="text-6xl mb-4">🌸</div>
          <h2 class="text-white text-2xl font-bold mb-2">Всё готово!</h2>
          <p class="text-white/50 text-sm mb-2">
            Добро пожаловать, <span class="text-purple-300 font-medium">{{ form.display_name || auth.user?.username }}</span>!
          </p>
          <p class="text-white/30 text-xs">Сохраняем твой профиль...</p>
          <div v-if="saveError" class="mt-4 text-red-400 text-sm bg-red-500/10 rounded-lg px-4 py-3">{{ saveError }}</div>
        </div>
      </Transition>

      <!-- Ошибка валидации -->
      <p v-if="validationError" class="text-red-400 text-sm mt-4 text-center">{{ validationError }}</p>

      <!-- Кнопки навигации -->
      <div class="flex items-center justify-between mt-8" v-if="step < 4">
        <button
          v-if="step > 1"
          @click="step--"
          class="text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          ← Назад
        </button>
        <div v-else />

        <div class="flex items-center gap-3">
          <!-- Пропустить (шаги 2, 3) -->
          <button
            v-if="step > 1"
            @click="nextStep(true)"
            class="text-sm text-white/40 hover:text-white/60 transition-colors"
          >
            Пропустить
          </button>
          <!-- Далее / Завершить -->
          <button
            @click="nextStep(false)"
            :disabled="isLoading"
            class="btn-primary"
          >
            <span v-if="step < TOTAL_STEPS - 1">Далее →</span>
            <span v-else>Завершить 🌸</span>
          </button>
        </div>
      </div>

      <!-- Retry на шаге 4 при ошибке -->
      <div v-if="step === 4 && saveError" class="flex justify-center mt-4">
        <button @click="saveProfile" class="btn-primary">
          Попробовать снова
        </button>
      </div>
    </div>

    <!-- Пропустить всё -->
    <button
      v-if="step < 4"
      @click="skipAll"
      class="mt-6 text-xs text-white/20 hover:text-white/40 transition-colors"
    >
      Пропустить настройку профиля
    </button>
  </div>
</template>

<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/api'

const router = useRouter()
const auth   = useAuthStore()

const TOTAL_STEPS = 4
const step     = ref(1)
const isLoading   = ref(false)
const saveError   = ref<string | null>(null)
const validationError = ref<string | null>(null)

const form = ref({
  display_name:        auth.user?.display_name ?? '',
  pronouns:            '',
  bio:                 '',
  fursona_name:        '',
  fursona_gender:      '',
  fursona_color:       '#a855f7',
  fursona_description: '',
  interests:           [] as string[],
})

const PRONOUNS_OPTIONS = ['он/его', 'она/её', 'они/их', 'оно/его', 'без местоимений']

const SPECIES_OPTIONS = [
  'Волк', 'Лис', 'Дракон', 'Кот/Кошка', 'Собака', 'Медведь', 'Лошадь', 'Кролик',
  'Пантера', 'Тигр', 'Лев', 'Ворона/Ворон', 'Змея', 'Ящерица', 'Акула', 'Выдра',
  'Белка', 'Скунс', 'Енот', 'Летучая мышь', 'Лось', 'Гибрид', 'Другой',
]

const INTERESTS_OPTIONS = [
  'Рисование', 'Анимация', 'Комиксы', 'Написание историй', 'Поэзия',
  'Видеоигры', 'RPG', 'Аниме', 'Косплей', 'Музыка', 'Танцы',
  'Программирование', 'Технологии', 'Скульптура', 'Вязание/Шитьё',
  'Фотография', 'Видеосъёмка', 'Кулинария', 'Природа', 'Животные',
  'Фурсьюты', 'Создание костюмов', 'DIY', 'Научная фантастика',
  'Фэнтези', 'D&D / Настольные игры', 'Кино', 'Мультфильмы', 'Стриминг',
  'Спорт', 'Фитнес', 'Путешествия', 'Чтение', 'Астрономия',
]

function toggleInterest(tag: string) {
  const idx = form.value.interests.indexOf(tag)
  if (idx === -1) form.value.interests.push(tag)
  else form.value.interests.splice(idx, 1)
}

function validate(): boolean {
  validationError.value = null
  if (step.value === 1) {
    if (!form.value.display_name.trim()) {
      validationError.value = 'Укажи отображаемое имя'
      return false
    }
  }
  return true
}

function nextStep(skip: boolean) {
  if (!skip && !validate()) return
  if (step.value < TOTAL_STEPS - 1) {
    step.value++
  } else {
    step.value = TOTAL_STEPS
    saveProfile()
  }
}

async function saveProfile() {
  isLoading.value  = true
  saveError.value  = null
  step.value       = TOTAL_STEPS

  try {
    const payload: Record<string, any> = {
      onboarding_done: true,
    }

    if (form.value.display_name.trim())
      payload.display_name = form.value.display_name.trim()
    if (form.value.pronouns.trim())
      payload.pronouns = form.value.pronouns.trim()
    if (form.value.bio.trim())
      payload.bio = form.value.bio.trim()
    if (form.value.fursona_name.trim())
      payload.fursona_name = form.value.fursona_name.trim()
    if (form.value.fursona_gender)
      payload.fursona_gender = form.value.fursona_gender
    if (form.value.fursona_color)
      payload.fursona_color = form.value.fursona_color
    if (form.value.fursona_description.trim())
      payload.fursona_description = form.value.fursona_description.trim()
    if (form.value.interests.length)
      payload.interests = form.value.interests

    const { data } = await api.patch('/users/me', payload)
    if (!data.success) throw new Error('Не удалось сохранить профиль')

    // обновляем user в сторе
    auth.user = { ...auth.user!, ...data.data.user, onboarding_done: true }
    const stored = localStorage.getItem('auth_user') ? localStorage : sessionStorage
    stored.setItem('auth_user', JSON.stringify(auth.user))

    // пауза для анимации
    await new Promise((r) => setTimeout(r, 1200))
    router.push({ name: 'home' })
  } catch (e: any) {
    saveError.value = e.response?.data?.error?.message || e.message || 'Ошибка сохранения'
  } finally {
    isLoading.value = false
  }
}

async function skipAll() {
  // Просто ставим флаг без данных
  try {
    await api.patch('/users/me', { onboarding_done: true })
    auth.user = { ...auth.user!, onboarding_done: true }
    const stored = localStorage.getItem('auth_user') ? localStorage : sessionStorage
    stored.setItem('auth_user', JSON.stringify(auth.user))
  } catch { /* ignore */ }
  router.push({ name: 'home' })
}

onMounted(() => {
  // Если онбординг уже пройден — сразу дальше
  if (auth.user?.onboarding_done) {
    router.push({ name: 'home' })
  }
})
</script>

<style scoped>
.input-field {
  @apply w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-white/30
         focus:outline-none focus:border-purple-500/60 focus:bg-white/10 transition-colors text-sm;
}

.btn-primary {
  @apply bg-purple-600 hover:bg-purple-500 disabled:opacity-60 disabled:cursor-not-allowed
         text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors;
}

.pronouns-chip {
  @apply text-xs px-3 py-1.5 rounded-lg bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80
         border border-white/10 transition-colors cursor-pointer;
}
.pronouns-chip--active {
  @apply bg-purple-600/30 text-purple-300 border-purple-500/50;
}

.interest-chip {
  @apply text-xs px-3 py-1.5 rounded-lg bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80
         border border-white/10 transition-colors cursor-pointer;
}
.interest-chip--active {
  @apply bg-purple-600/30 text-purple-200 border-purple-500/50;
}

.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-track { background: transparent; }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(168,85,247,.3); border-radius: 9999px; }

.fade-enter-active, .fade-leave-active { transition: opacity .2s, transform .2s; }
.fade-enter-from { opacity: 0; transform: translateX(12px); }
.fade-leave-to   { opacity: 0; transform: translateX(-12px); }
</style>
