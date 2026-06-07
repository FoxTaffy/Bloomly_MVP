<template>
  <div class="space-y-5">

    <!-- ── Имя персонажа ─────────────────────────────────── -->
    <div class="relative">
      <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
        </svg>
        {{ t.fursonaName }}
      </label>
      <div class="relative">
        <input
          v-model="form.name"
          type="text"
          maxlength="80"
          :placeholder="t.fursonaNamePlaceholder"
          class="w-full bg-brand-bg border rounded-2xl px-4 py-3 text-base font-semibold text-white placeholder-white/20 focus:outline-none transition-all pr-14"
          :class="form.name
            ? 'border-brand-accent/50 shadow-[0_0_0_3px_rgba(167,139,250,0.08)]'
            : 'border-brand-border focus:border-brand-accent/50 focus:shadow-[0_0_0_3px_rgba(167,139,250,0.08)]'"
        />
        <span class="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-semibold"
          :class="form.name.length > 72 ? 'text-amber-400' : 'text-white/25'">
          {{ form.name.length }}/80
        </span>
      </div>
      <!-- Animated underline when filled -->
      <div class="mt-2 h-0.5 rounded-full overflow-hidden bg-brand-border/40">
        <div class="h-full rounded-full transition-all duration-500"
          style="background:linear-gradient(90deg,#a78bfa,#7c3aed)"
          :style="`width:${Math.min((form.name.length/80)*100,100)}%`"></div>
      </div>
    </div>

    <!-- ── Вид / порода ──────────────────────────────────── -->
    <div class="p-4 bg-brand-bg/60 border border-brand-border/60 rounded-2xl space-y-3">
      <div class="flex items-center justify-between">
        <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
          </svg>
          {{ t.fursonaSpeciesLabel }}
        </p>
        <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          :class="form.species.length >= 5
            ? 'bg-amber-500/15 text-amber-400'
            : 'bg-brand-accent/10 text-brand-accent/70'">
          {{ form.species.length }}/5
        </span>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="sp in FURSONA_SPECIES"
          :key="sp"
          type="button"
          @click="toggleSpecies(sp)"
          class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all select-none"
          :class="form.species.includes(sp)
            ? 'border-brand-accent/50 bg-brand-accent/15 text-brand-accent shadow-[0_0_12px_rgba(167,139,250,0.15)]'
            : 'bg-brand-bg border-brand-border text-white/45 hover:text-white hover:border-white/25'"
        >
          <span v-if="form.species.includes(sp)" class="mr-1 text-[10px]">✓</span>{{ speciesLabel(sp) }}
        </button>
      </div>
    </div>

    <!-- ── Цвета персонажа ──────────────────────────────── -->
    <div class="p-4 bg-brand-bg/60 border border-brand-border/60 rounded-2xl space-y-4">
      <div class="flex items-center justify-between">
        <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/>
          </svg>
          {{ t.fursonaColorsLabel }}
        </p>
        <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          :class="(form.colors?.length ?? 0) >= 10
            ? 'bg-amber-500/15 text-amber-400'
            : 'bg-brand-accent/10 text-brand-accent/70'">
          {{ form.colors?.length ?? 0 }}/10
        </span>
      </div>

      <!-- Выбранные цвета (большие) -->
      <div v-if="form.colors?.length" class="flex flex-wrap gap-2">
        <div
          v-for="(color, idx) in form.colors"
          :key="idx"
          class="group relative"
        >
          <div
            class="w-10 h-10 rounded-xl border-2 border-white/10 shadow-md cursor-pointer transition-transform hover:scale-110"
            :style="`background:${color}`"
            @click="pickingIdx = pickingIdx === idx ? null : idx"
          ></div>
          <!-- Mini hex label -->
          <span class="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-white/40 font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
            {{ color }}
          </span>
          <!-- Remove -->
          <button
            type="button"
            @click.stop="removeColor(idx)"
            class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
          >×</button>
          <!-- Inline color picker popup -->
          <div v-if="pickingIdx === idx"
            class="absolute top-12 left-0 z-20 bg-brand-card border border-brand-border rounded-2xl p-3 shadow-2xl space-y-2"
            style="min-width:180px">
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="p in COLOR_PRESETS"
                :key="p.hex"
                type="button"
                :title="p.label"
                @click="updateColor(idx, p.hex); pickingIdx = null"
                class="w-6 h-6 rounded-lg border-2 transition-transform hover:scale-125"
                :style="`background:${p.hex}`"
                :class="color === p.hex ? 'border-white scale-110' : 'border-transparent'">
              </button>
            </div>
            <div class="flex items-center gap-2 border-t border-brand-border/60 pt-2">
              <div class="w-6 h-6 rounded-lg border border-brand-border flex-shrink-0" :style="`background:${color}`"></div>
              <input
                type="text"
                :value="color"
                maxlength="7"
                placeholder="#a78bfa"
                class="flex-1 bg-brand-bg border border-brand-border rounded-lg px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-brand-accent/50"
                @input="onHexInput(idx, ($event.target as HTMLInputElement).value)"
              />
              <button type="button" @click="pickingIdx = null"
                class="text-white/35 hover:text-white transition-colors text-sm leading-none">✓</button>
            </div>
          </div>
        </div>

        <!-- Add color -->
        <button
          v-if="(form.colors?.length ?? 0) < 10"
          type="button"
          @click="addColor"
          class="w-10 h-10 rounded-xl border-2 border-dashed border-brand-border/60 text-white/25 text-xl flex items-center justify-center hover:border-brand-accent/50 hover:text-brand-accent transition-all hover:scale-110"
        >+</button>
      </div>

      <!-- Preset palette (когда цветов ещё нет или всегда) -->
      <div>
        <p class="text-[11px] text-white/30 mb-2">
          {{ form.colors?.length ? t.fursonaColorsHint : t.fursonaColorsAddHint }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in COLOR_PRESETS"
            :key="p.hex"
            type="button"
            :title="p.label"
            @click="addPresetColor(p.hex)"
            class="w-7 h-7 rounded-xl border-2 transition-all hover:scale-110 hover:shadow-lg"
            :style="`background:${p.hex}`"
            :class="form.colors?.includes(p.hex)
              ? 'border-white scale-105 shadow-md'
              : 'border-transparent hover:border-white/40'"
          >
            <span v-if="form.colors?.includes(p.hex)"
              class="flex items-center justify-center w-full h-full text-[10px] font-bold"
              :style="`color:${contrastColor(p.hex)}`">✓</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ── Симпатии / Антипатии ──────────────────────────── -->
    <div class="p-4 bg-brand-bg/60 border border-brand-border/60 rounded-2xl space-y-4">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-bold text-white">{{ t.fursonaLikesVisibleLabel }}</p>
          <p class="text-[11px] text-white/35 mt-0.5">{{ t.fursonaLikesVisibleHint }}</p>
        </div>
        <button
          type="button"
          :class="['relative w-11 h-6 rounded-full border transition-all flex-shrink-0',
            form.likes_dislikes_visible
              ? 'bg-brand-accent/20 border-brand-accent/60'
              : 'bg-brand-bg border-brand-border']"
          @click="form.likes_dislikes_visible = !form.likes_dislikes_visible"
        >
          <span :class="['absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow transition-all',
            form.likes_dislikes_visible ? 'translate-x-5 bg-brand-accent' : 'translate-x-0 bg-white/40']"></span>
        </button>
      </div>

      <div v-if="form.likes_dislikes_visible" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Нравится -->
        <div class="space-y-2">
          <p class="text-xs font-bold flex items-center gap-1.5" style="color:#22c55e">
            <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
            </svg>
            {{ t.fursonaLikesLabel }}
          </p>
          <div class="flex flex-wrap gap-1.5 min-h-[28px]">
            <span v-for="(item, idx) in form.likes" :key="idx"
              class="flex items-center gap-1 pl-2.5 pr-1 py-0.5 text-xs rounded-full font-semibold"
              style="background:#22c55e15;border:1px solid #22c55e30;color:#22c55e">
              {{ item }}
              <button type="button" @click="removeTag('likes', idx)"
                class="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-emerald-500/20 leading-none">×</button>
            </span>
          </div>
          <div class="flex gap-2">
            <input v-model="newLike" type="text" :placeholder="t.fursonaLikesPlaceholder" maxlength="100"
              class="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-emerald-500/40 transition-all"
              @keydown.enter.prevent="addTag('likes')" />
            <button type="button" @click="addTag('likes')"
              class="w-8 h-8 flex items-center justify-center rounded-xl text-base font-bold border"
              style="background:#22c55e15;border-color:#22c55e30;color:#22c55e">+</button>
          </div>
        </div>
        <!-- Не нравится -->
        <div class="space-y-2">
          <p class="text-xs font-bold flex items-center gap-1.5" style="color:#ef4444">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018a2 2 0 01.485.06l3.76.94m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2"/>
            </svg>
            {{ t.fursonaDislikesLabel }}
          </p>
          <div class="flex flex-wrap gap-1.5 min-h-[28px]">
            <span v-for="(item, idx) in form.dislikes" :key="idx"
              class="flex items-center gap-1 pl-2.5 pr-1 py-0.5 text-xs rounded-full font-semibold"
              style="background:#ef444415;border:1px solid #ef444430;color:#ef4444">
              {{ item }}
              <button type="button" @click="removeTag('dislikes', idx)"
                class="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-rose-500/20 leading-none">×</button>
            </span>
          </div>
          <div class="flex gap-2">
            <input v-model="newDislike" type="text" :placeholder="t.fursonaDislikesPlaceholder" maxlength="100"
              class="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-rose-500/40 transition-all"
              @keydown.enter.prevent="addTag('dislikes')" />
            <button type="button" @click="addTag('dislikes')"
              class="w-8 h-8 flex items-center justify-center rounded-xl text-base font-bold border"
              style="background:#ef444415;border-color:#ef444430;color:#ef4444">+</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Реф-лист ───────────────────────────────────────── -->
    <div class="p-4 bg-brand-bg/60 border border-brand-border/60 rounded-2xl space-y-3">
      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
        {{ t.fursonaRefLabel }}
      </p>
      <div v-if="form.reference_image_url" class="flex items-start gap-3">
        <div class="relative group flex-shrink-0">
          <img
            :src="form.reference_image_url"
            alt="Reference"
            class="w-24 h-24 rounded-xl object-cover border border-brand-border"
            :class="form.reference_is_nsfw ? 'blur-sm' : ''"
            draggable="false"
          />
          <div class="absolute inset-0 rounded-xl bg-black/55 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
            <button type="button" @click="form.reference_image_url = null"
              class="text-white text-xs font-bold px-2 py-1 bg-rose-500/80 rounded-lg">
              {{ t.fursonaRefRemove }}
            </button>
          </div>
        </div>
        <div class="space-y-2.5 pt-0.5">
          <p class="text-[11px] text-white/30 leading-relaxed">{{ t.fursonaRefHint }}</p>
          <!-- NSFW toggle -->
          <div class="flex items-center gap-2.5">
            <button
              type="button"
              :class="['relative w-10 h-5 rounded-full border transition-all flex-shrink-0',
                form.reference_is_nsfw
                  ? 'bg-rose-500/20 border-rose-500/60'
                  : 'bg-brand-bg border-brand-border']"
              @click="form.reference_is_nsfw = !form.reference_is_nsfw"
            >
              <span :class="['absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow transition-all',
                form.reference_is_nsfw ? 'translate-x-5 bg-rose-500' : 'translate-x-0 bg-white/40']"></span>
            </button>
            <div>
              <p class="text-xs font-bold" :class="form.reference_is_nsfw ? 'text-rose-400' : 'text-white/45'">{{ t.fursonaRefNsfw }}</p>
              <p class="text-[11px] text-white/25">{{ t.fursonaRefNsfwHint }}</p>
            </div>
          </div>
          <!-- Художник / автор референса -->
          <div class="space-y-1.5 pt-1">
            <p class="text-[10px] font-bold uppercase tracking-wider text-white/35 flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
              </svg>
              Художник
            </p>
            <input v-model="form.reference_artist_name" type="text" maxlength="100"
              placeholder="Имя художника / ник…"
              class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-brand-accent/50 transition-all" />
            <input v-model="form.reference_artist_url" type="url" maxlength="500"
              placeholder="Ссылка на профиль (https://…)"
              class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/25 focus:outline-none focus:border-brand-accent/50 transition-all" />
          </div>
        </div>
      </div>
      <MediaUpload v-else accept="image/*" folder="fursona" @uploaded="onReferenceUploaded" />
    </div>

    <!-- ── Кнопка сохранения ──────────────────────────────── -->
    <div class="flex items-center gap-3">
      <button
        type="button"
        :disabled="saving"
        @click="save"
        class="flex items-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-bold transition-all"
        style="background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;box-shadow:0 4px 20px #7c3aed25"
        :class="saving ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90 active:scale-95'"
      >
        <span v-if="saving" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
        {{ saving ? t.fursonaSavingBtn : t.fursonaSaveBtn }}
      </button>
      <Transition name="fade-msg">
        <span v-if="successMsg" class="text-emerald-400 text-xs font-semibold flex items-center gap-1">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
          {{ successMsg }}
        </span>
      </Transition>
      <span v-if="errorMsg" class="text-rose-400 text-xs">{{ errorMsg }}</span>
    </div>

  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted, watch, nextTick } from 'vue'
import { useUserStore, FURSONA_SPECIES } from '@/stores/user'
import { useLangStore } from '@/stores/lang'
import type { UpsertFursonaInput } from '@/stores/user'
import type { Lang } from '@/locales/translations'
import MediaUpload from '@/components/MediaUpload.vue'

const emit = defineEmits<{ dirty: [val: boolean] }>()

const userStore = useUserStore()
const langStore = useLangStore()
const t = computed(() => langStore.t)

// ── Переводы видов ────────────────────────────────────────────────────────────
const SPECIES_MAP: Record<string, Record<Lang, string>> = {
  'Canine':             { RU:'Псовые',         EN:'Canine',            JP:'犬系',           CN:'犬系',     DE:'Canide',      FR:'Canidé',      ES:'Cánido',   PT:'Canídeo'   },
  'Feline':             { RU:'Кошачьи',         EN:'Feline',            JP:'猫系',           CN:'猫系',     DE:'Katze',       FR:'Félin',       ES:'Felino',   PT:'Felino'    },
  'Dragon':             { RU:'Дракон',          EN:'Dragon',            JP:'ドラゴン',        CN:'龙',       DE:'Drache',      FR:'Dragon',      ES:'Dragón',   PT:'Dragão'    },
  'Protogen':           { RU:'Протоген',        EN:'Protogen',          JP:'プロトゲン',      CN:'原型犬',   DE:'Protogen',    FR:'Protogen',    ES:'Protogen', PT:'Protogen'  },
  'Avian':              { RU:'Птица',           EN:'Avian',             JP:'鳥系',           CN:'鸟系',     DE:'Vogel',       FR:'Aviaire',     ES:'Aviar',    PT:'Aviário'   },
  'Equine':             { RU:'Лошадь',          EN:'Equine',            JP:'馬系',           CN:'马系',     DE:'Equide',      FR:'Équidé',      ES:'Équido',   PT:'Equídeo'   },
  'Reptile':            { RU:'Рептилия',        EN:'Reptile',           JP:'爬虫類',          CN:'爬虫类',   DE:'Reptil',      FR:'Reptile',     ES:'Reptil',   PT:'Réptil'    },
  'Rodent':             { RU:'Грызун',          EN:'Rodent',            JP:'げっ歯類',        CN:'啮齿类',   DE:'Nagetier',    FR:'Rongeur',     ES:'Roedor',   PT:'Roedor'    },
  'Ursine':             { RU:'Медведь',         EN:'Ursine',            JP:'クマ系',          CN:'熊系',     DE:'Bär',         FR:'Ursidé',      ES:'Ursino',   PT:'Ursino'    },
  'Bovine':             { RU:'Бык/Корова',      EN:'Bovine',            JP:'牛系',           CN:'牛系',     DE:'Rind',        FR:'Bovin',       ES:'Bovino',   PT:'Bovino'    },
  'Cervine':            { RU:'Олень',           EN:'Cervine',           JP:'シカ系',          CN:'鹿系',     DE:'Cervide',     FR:'Cervidé',     ES:'Cérvido',  PT:'Cervídeo'  },
  'Mustelid':           { RU:'Куньи',           EN:'Mustelid',          JP:'イタチ系',        CN:'鼬系',     DE:'Marder',      FR:'Mustélidé',   ES:'Mustélido',PT:'Mustelídeo'},
  'Sergal':             { RU:'Сергал',          EN:'Sergal',            JP:'サーガル',        CN:'瑟格尔',   DE:'Sergal',      FR:'Sergal',      ES:'Sergal',   PT:'Sergal'    },
  'Dutch Angel Dragon': { RU:'Дутч Э. Дракон',  EN:'Dutch Angel Dragon',JP:'ダッチエンジェル',CN:'荷兰天使龙',DE:'Dutch Angel', FR:'Dutch Angel', ES:'Dutch Angel',PT:'Dutch Angel'},
  'Shark':              { RU:'Акула',           EN:'Shark',             JP:'サメ',           CN:'鲨鱼',     DE:'Hai',         FR:'Requin',      ES:'Tiburón',  PT:'Tubarão'   },
  'Bat':                { RU:'Летучая мышь',    EN:'Bat',               JP:'コウモリ',        CN:'蝙蝠',     DE:'Fledermaus',  FR:'Chauve-souris',ES:'Murciélago',PT:'Morcego'  },
  'Fox':                { RU:'Лис',             EN:'Fox',               JP:'キツネ',          CN:'狐狸',     DE:'Fuchs',       FR:'Renard',      ES:'Zorro',    PT:'Raposa'    },
  'Wolf':               { RU:'Волк',            EN:'Wolf',              JP:'オオカミ',        CN:'狼',       DE:'Wolf',        FR:'Loup',        ES:'Lobo',     PT:'Lobo'      },
  'Rabbit':             { RU:'Кролик',          EN:'Rabbit',            JP:'ウサギ',          CN:'兔子',     DE:'Hase',        FR:'Lapin',       ES:'Conejo',   PT:'Coelho'    },
  'Tiger':              { RU:'Тигр',            EN:'Tiger',             JP:'トラ',           CN:'老虎',     DE:'Tiger',       FR:'Tigre',       ES:'Tigre',    PT:'Tigre'     },
  'Hyena':              { RU:'Гиена',           EN:'Hyena',             JP:'ハイエナ',        CN:'鬣狗',     DE:'Hyäne',       FR:'Hyène',       ES:'Hiena',    PT:'Hiena'     },
  'Synth':              { RU:'Синт',            EN:'Synth',             JP:'シンス',          CN:'合成体',   DE:'Synth',       FR:'Synth',       ES:'Synth',    PT:'Synth'     },
  'Wickerbeast':        { RU:'Уикербист',       EN:'Wickerbeast',       JP:'ウィッカービースト',CN:'柳条兽',  DE:'Wickerbeast', FR:'Wickerbeast', ES:'Wickerbeast',PT:'Wickerbeast'},
  'Lion':               { RU:'Лев',             EN:'Lion',              JP:'ライオン',        CN:'狮子',     DE:'Löwe',        FR:'Lion',        ES:'León',     PT:'Leão'      },
  'Leopard':            { RU:'Леопард',         EN:'Leopard',           JP:'ヒョウ',          CN:'豹',       DE:'Leopard',     FR:'Léopard',     ES:'Leopardo', PT:'Leopardo'  },
  'Snow Leopard':       { RU:'Снежный барс',    EN:'Snow Leopard',      JP:'ユキヒョウ',      CN:'雪豹',     DE:'Schneeleopard',FR:'Léopard des neiges',ES:'Leopardo de las nieves',PT:'Leopardo das neves'},
  'Cheetah':            { RU:'Гепард',          EN:'Cheetah',           JP:'チーター',        CN:'猎豹',     DE:'Gepard',      FR:'Guépard',     ES:'Guepardo', PT:'Guepardo'  },
  'Lynx':               { RU:'Рысь',            EN:'Lynx',              JP:'オオヤマネコ',    CN:'猞猁',     DE:'Luchs',       FR:'Lynx',        ES:'Lince',    PT:'Lince'     },
  'Raccoon':            { RU:'Енот',            EN:'Raccoon',           JP:'アライグマ',      CN:'浣熊',     DE:'Waschbär',    FR:'Raton laveur',ES:'Mapache',  PT:'Guaxinim'  },
  'Red Panda':          { RU:'Красная панда',   EN:'Red Panda',         JP:'レッサーパンダ',  CN:'小熊猫',   DE:'Roter Panda', FR:'Panda roux',  ES:'Panda rojo',PT:'Panda vermelho'},
  'Skunk':              { RU:'Скунс',           EN:'Skunk',             JP:'スカンク',        CN:'臭鼬',     DE:'Skunk',       FR:'Mouffette',   ES:'Mofeta',   PT:'Gambá'     },
  'Opossum':            { RU:'Опоссум',         EN:'Opossum',           JP:'オポッサム',      CN:'负鼠',     DE:'Opossum',     FR:'Opossum',     ES:'Zarigüeya',PT:'Gambá'     },
  'Coyote':             { RU:'Койот',           EN:'Coyote',            JP:'コヨーテ',        CN:'土狼',     DE:'Kojote',      FR:'Coyote',      ES:'Coyote',   PT:'Coiote'    },
  'Jackal':             { RU:'Шакал',           EN:'Jackal',            JP:'ジャッカル',      CN:'豺',       DE:'Schakal',     FR:'Chacal',      ES:'Chacal',   PT:'Chacal'    },
  'Panda':              { RU:'Панда',           EN:'Panda',             JP:'パンダ',          CN:'熊猫',     DE:'Panda',       FR:'Panda',       ES:'Panda',    PT:'Panda'     },
  'Dolphin':            { RU:'Дельфин',         EN:'Dolphin',           JP:'イルカ',          CN:'海豚',     DE:'Delfin',      FR:'Dauphin',     ES:'Delfín',   PT:'Golfinho'  },
  'Orca':               { RU:'Косатка',         EN:'Orca',              JP:'シャチ',          CN:'虎鲸',     DE:'Orca',        FR:'Orque',       ES:'Orca',     PT:'Orca'      },
  'Seal':               { RU:'Тюлень',          EN:'Seal',              JP:'アザラシ',        CN:'海豹',     DE:'Robbe',       FR:'Phoque',      ES:'Foca',     PT:'Foca'      },
  'Gryphon':            { RU:'Грифон',          EN:'Gryphon',           JP:'グリフォン',      CN:'狮鹫',     DE:'Greif',       FR:'Griffon',     ES:'Grifo',    PT:'Grifo'     },
  'Phoenix':            { RU:'Феникс',          EN:'Phoenix',           JP:'フェニックス',    CN:'凤凰',     DE:'Phönix',      FR:'Phénix',      ES:'Fénix',    PT:'Fênix'     },
  'Unicorn':            { RU:'Единорог',        EN:'Unicorn',           JP:'ユニコーン',      CN:'独角兽',   DE:'Einhorn',     FR:'Licorne',     ES:'Unicornio',PT:'Unicórnio' },
  'Naga':               { RU:'Нага',            EN:'Naga',              JP:'ナーガ',          CN:'那伽',     DE:'Naga',        FR:'Naga',        ES:'Naga',     PT:'Naga'      },
  'Frog':               { RU:'Лягушка',         EN:'Frog',              JP:'カエル',          CN:'青蛙',     DE:'Frosch',      FR:'Grenouille',  ES:'Rana',     PT:'Sapo'      },
  'Maned Wolf':         { RU:'Гривистый волк',  EN:'Maned Wolf',        JP:'タテガミオオカミ', CN:'鬃狼',     DE:'Mähnenwolf',  FR:'Loup à crinière',ES:'Lobo de crin',PT:'Lobo-guará'},
  'African Wild Dog':   { RU:'Гиеновая собака', EN:'African Wild Dog',  JP:'リカオン',        CN:'非洲野犬', DE:'Wildhund',    FR:'Lycaon',      ES:'Licaón',   PT:'Lycaon'    },
  'Kitsune':            { RU:'Кицунэ',          EN:'Kitsune',           JP:'キツネ（妖狐）',  CN:'狐妖',     DE:'Kitsune',     FR:'Kitsune',     ES:'Kitsune',  PT:'Kitsune'   },
  'Tanuki':             { RU:'Тануки',          EN:'Tanuki',            JP:'たぬき',          CN:'狸',       DE:'Tanuki',      FR:'Tanuki',      ES:'Tanuki',   PT:'Tanuki'    },
  'Kirin':              { RU:'Цилинь',          EN:'Kirin',             JP:'麒麟',            CN:'麒麟',     DE:'Kirin',       FR:'Kirin',       ES:'Kirin',    PT:'Kirin'     },
  'Wyvern':             { RU:'Виверн',          EN:'Wyvern',            JP:'ワイバーン',      CN:'飞龙',     DE:'Wyvern',      FR:'Vouivre',     ES:'Wyvern',   PT:'Wyvern'    },
  'Kangaroo':           { RU:'Кенгуру',         EN:'Kangaroo',          JP:'カンガルー',      CN:'袋鼠',     DE:'Känguru',     FR:'Kangourou',   ES:'Canguro',  PT:'Canguru'   },
  'Hedgehog':           { RU:'Ёж',              EN:'Hedgehog',          JP:'ハリネズミ',      CN:'刺猬',     DE:'Igel',        FR:'Hérisson',    ES:'Erizo',    PT:'Ouriço'    },
  'Otter':              { RU:'Выдра',           EN:'Otter',             JP:'カワウソ',        CN:'水獭',     DE:'Otter',       FR:'Loutre',      ES:'Nutria',   PT:'Lontra'    },
  'Ferret':             { RU:'Хорёк',           EN:'Ferret',            JP:'フェレット',      CN:'貂',       DE:'Frettchen',   FR:'Furet',       ES:'Hurón',    PT:'Furão'     },
  'Meerkat':            { RU:'Сурикат',         EN:'Meerkat',           JP:'ミーアキャット',  CN:'猫鼬',     DE:'Erdmännchen', FR:'Suricate',    ES:'Suricata', PT:'Suricata'  },
  'Axolotl':            { RU:'Аксолотль',       EN:'Axolotl',           JP:'アホロートル',    CN:'六角恐龙', DE:'Axolotl',     FR:'Axolotl',     ES:'Ajolote',  PT:'Axolote'   },
  'Octopus':            { RU:'Осьминог',        EN:'Octopus',           JP:'タコ',            CN:'章鱼',     DE:'Oktopus',     FR:'Pieuvre',     ES:'Pulpo',    PT:'Polvo'     },
  'Salamander':         { RU:'Саламандра',      EN:'Salamander',        JP:'サラマンダー',    CN:'蝾螈',     DE:'Salamander',  FR:'Salamandre',  ES:'Salamandra',PT:'Salamandra'},
  'Primate':            { RU:'Примат',          EN:'Primate',           JP:'霊長類',          CN:'灵长类',   DE:'Primat',      FR:'Primate',     ES:'Primate',  PT:'Primata'   },
  'Demon':              { RU:'Демон',           EN:'Demon',             JP:'デーモン',        CN:'恶魔',     DE:'Dämon',       FR:'Démon',       ES:'Demonio',  PT:'Demônio'   },
  'Angel':              { RU:'Ангел',           EN:'Angel',             JP:'エンジェル',      CN:'天使',     DE:'Engel',       FR:'Ange',        ES:'Ángel',    PT:'Anjo'      },
  'Alien':              { RU:'Инопланетянин',   EN:'Alien',             JP:'エイリアン',      CN:'外星人',   DE:'Alien',       FR:'Alien',       ES:'Alien',    PT:'Alien'     },
  'Kobold':             { RU:'Кобольд',         EN:'Kobold',            JP:'コボルト',        CN:'地精',     DE:'Kobold',      FR:'Kobold',      ES:'Kobold',   PT:'Kobold'    },
  'Sphinx':             { RU:'Сфинкс',          EN:'Sphinx',            JP:'スフィンクス',    CN:'狮身人面兽',DE:'Sphinx',     FR:'Sphinx',      ES:'Esfinge',  PT:'Esfinge'   },
  'Other':              { RU:'Другое',          EN:'Other',             JP:'その他',          CN:'其他',     DE:'Andere',      FR:'Autre',       ES:'Otro',     PT:'Outro'     },
}

function speciesLabel(sp: string): string {
  return SPECIES_MAP[sp]?.[langStore.currentLang] ?? sp
}

// ── Пресеты цветов ────────────────────────────────────────────────────────────
const COLOR_PRESETS = [
  { hex: '#ffffff', label: 'Белый'    },
  { hex: '#e8e8e8', label: 'Светлый'  },
  { hex: '#c0a882', label: 'Бежевый'  },
  { hex: '#a07850', label: 'Tan'      },
  { hex: '#7a4f2c', label: 'Коричн.'  },
  { hex: '#3d1f0a', label: 'Тём.кор.' },
  { hex: '#111111', label: 'Чёрный'   },
  { hex: '#6b7280', label: 'Серый'    },
  { hex: '#f97316', label: 'Оранжев.' },
  { hex: '#ef4444', label: 'Красный'  },
  { hex: '#fbbf24', label: 'Жёлтый'  },
  { hex: '#22c55e', label: 'Зелёный'  },
  { hex: '#06b6d4', label: 'Циан'     },
  { hex: '#3b82f6', label: 'Синий'    },
  { hex: '#8b5cf6', label: 'Фиолет.'  },
  { hex: '#a78bfa', label: 'Лавандов.'},
  { hex: '#ec4899', label: 'Розовый'  },
  { hex: '#f43f5e', label: 'Малиновый'},
]

// Выбирает контрастный цвет текста (чёрный/белый) по hex
function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return (r*299 + g*587 + b*114) / 1000 > 128 ? '#000000' : '#ffffff'
}

// ── Форма ─────────────────────────────────────────────────────────────────────
const form = reactive<UpsertFursonaInput & { species: string[]; colors: string[]; name: string; reference_is_nsfw: boolean }>({  
  name: '',
  species: [],
  colors: [],
  likes_dislikes_visible: true,
  likes: [],
  dislikes: [],
  reference_image_url: null,
  reference_is_nsfw: false,  reference_artist_name: null,
  reference_artist_url: null,})

const saving      = ref(false)
const successMsg  = ref('')
const errorMsg    = ref('')
const newLike     = ref('')
const newDislike  = ref('')
const pickingIdx  = ref<number | null>(null)
const formLoaded  = ref(false)

watch(form, () => {
  if (formLoaded.value) emit('dirty', true)
}, { deep: true })

onMounted(async () => {
  const auth = await import('@/stores/auth').then((m) => m.useAuthStore())
  if (!auth.user?.id) return
  await userStore.fetchFursona(auth.user.id)
  if (userStore.fursona) {
    Object.assign(form, {
      name: userStore.fursona.name || userStore.profile?.fursona_name || '',
      species: [...(userStore.fursona.species ?? [])],
      colors: [...(userStore.fursona.colors ?? [])],
      likes_dislikes_visible: userStore.fursona.likes_dislikes_visible ?? true,
      likes: [...(userStore.fursona.likes ?? [])],
      dislikes: [...(userStore.fursona.dislikes ?? [])],
      reference_image_url: userStore.fursona.reference_image_url ?? null,
      reference_is_nsfw: userStore.fursona.reference_is_nsfw ?? false,
      reference_artist_name: userStore.fursona.reference_artist_name ?? null,
      reference_artist_url: userStore.fursona.reference_artist_url ?? null,
    })
  }
  await nextTick()
  formLoaded.value = true
})

function toggleSpecies(sp: string) {
  const idx = form.species.indexOf(sp)
  if (idx === -1) { if (form.species.length < 5) form.species.push(sp) }
  else { form.species.splice(idx, 1) }
}

function addColor() {
  if (!form.colors) form.colors = []
  if (form.colors.length < 10) { form.colors.push('#a78bfa'); pickingIdx.value = form.colors.length - 1 }
}

function addPresetColor(hex: string) {
  if (!form.colors) form.colors = []
  const idx = form.colors.indexOf(hex)
  if (idx !== -1) { form.colors.splice(idx, 1) }
  else if (form.colors.length < 10) { form.colors.push(hex) }
}

function updateColor(idx: number, value: string) { form.colors[idx] = value }
function removeColor(idx: number) { form.colors.splice(idx, 1); if (pickingIdx.value === idx) pickingIdx.value = null }

function onHexInput(idx: number, val: string) {
  if (/^#[0-9A-Fa-f]{6}$/.test(val)) updateColor(idx, val)
}

function addTag(field: 'likes' | 'dislikes') {
  const input = field === 'likes' ? newLike : newDislike
  const v = input.value.trim().slice(0, 100)
  const arr = form[field] as string[]
  if (v && !arr.includes(v) && arr.length < 30) arr.push(v)
  if (field === 'likes') newLike.value = ''; else newDislike.value = ''
}
function removeTag(field: 'likes' | 'dislikes', idx: number) { ;(form[field] as string[]).splice(idx, 1) }

function onReferenceUploaded(urls: string[]) { form.reference_image_url = urls[0] ?? null }

async function save() {
  saving.value = true; successMsg.value = ''; errorMsg.value = ''
  try {
    await userStore.saveFursona({ ...form })
    successMsg.value = t.value.fursonaSavedMsg
    setTimeout(() => { successMsg.value = '' }, 3000)
    emit('dirty', false)
  } catch (e: any) {
    errorMsg.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  } finally {
    saving.value = false
  }
}

defineExpose({ save })
</script>

<style scoped>
.fade-msg-enter-active, .fade-msg-leave-active { transition: opacity 0.3s; }
.fade-msg-enter-from, .fade-msg-leave-to { opacity: 0; }
</style>
