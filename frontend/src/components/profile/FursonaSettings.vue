<template>
  <div class="stack-y-4">

    <!-- ── Шапка секции ──────────────────────────────────── -->
    <div class="flex items-center justify-between">
      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-2">
        <span class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style="background:rgba(167,139,250,0.16)">
          <BIcon name="PawPrint" class="w-3.5 h-3.5 text-brand-accent" />
        </span>
        {{ t.fursonaSettingsTitle }}
        <span class="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-accent/10 text-brand-accent/60 normal-case tracking-normal">
          {{ userStore.fursonas.length }}/10
        </span>
      </p>
      <button
        v-if="!showForm"
        type="button"
        :disabled="userStore.fursonas.length >= 10"
        @click="openCreateForm"
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all text-brand-accent border-brand-accent/40 bg-brand-accent/10 hover:bg-brand-accent/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brand-accent/10"
      >{{ t.fursonaAddBtn }}</button>
    </div>

    <!-- Loading -->
    <div v-if="userStore.fursonasLoading" class="flex justify-center py-8">
      <div class="w-6 h-6 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
    </div>

    <!-- Empty state -->
    <div v-else-if="!showForm && userStore.fursonas.length === 0"
      class="p-7 border border-dashed border-brand-accent/25 rounded-2xl text-center stack-y-2"
      style="background:linear-gradient(135deg,rgba(167,139,250,0.08),transparent 65%)">
      <div class="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center shadow-inner" style="background:rgba(167,139,250,0.14)">
        <BIcon name="PawPrint" class="w-7 h-7 text-brand-accent/60" />
      </div>
      <p class="text-sm text-white/45 font-semibold">{{ t.fursonaEmptyMsg }}</p>
      <button type="button" @click="openCreateForm"
        class="text-xs font-bold text-brand-accent hover:text-brand-accent/80 transition-colors">
        {{ t.fursonaAddBtn }}
      </button>
    </div>

    <!-- ── Список персонажей ──────────────────────────────── -->
    <div v-else-if="!showForm" class="stack-y-2">
      <div
        v-for="f in userStore.fursonas"
        :key="f.id"
        class="flex items-center gap-3 p-3 bg-brand-bg/60 border border-brand-border/60 rounded-2xl transition-all hover:border-brand-accent/30 hover:shadow-lg hover:shadow-black/20"
      >
        <div class="relative shrink-0">
          <div class="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden" style="background:rgba(167,139,250,0.12)">
            <img v-if="f.cover_image_url" :src="f.cover_image_url" alt="" class="w-full h-full object-cover" draggable="false" />
            <svg v-else class="w-6 h-6 text-brand-accent/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <circle cx="8.5" cy="9" r="1.6"/>
              <path d="M6 15c0-2 1.2-3 2.5-3s2.5 1 2.5 3"/>
              <circle cx="15.5" cy="9" r="1.6"/>
              <path d="M13 15c0-2 1.2-3 2.5-3s2.5 1 2.5 3"/>
            </svg>
          </div>
          <span v-if="f.is_primary"
            class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-brand-accent text-white text-[10px] font-bold flex items-center justify-center shadow-sm leading-none">★</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-bold text-white truncate">{{ f.name || '—' }}</p>
          <p v-if="f.species.length" class="text-[11px] text-white/35 truncate">
            {{ f.species.map(speciesLabel).join(', ') }}
          </p>
          <p v-if="f.is_primary" class="text-[10px] text-brand-accent/70 font-bold mt-0.5">{{ t.fursonaPrimaryLabel }}</p>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button
            v-if="!f.is_primary"
            type="button"
            @click="handleSetPrimary(f.id)"
            :title="t.fursonaSetPrimaryBtn"
            class="w-8 h-8 flex items-center justify-center rounded-xl bg-brand-bg border border-brand-border text-white/35 hover:text-brand-accent hover:border-brand-accent/40 transition-all text-sm">
            ☆
          </button>
          <button type="button" @click="openEditForm(f)"
            class="w-8 h-8 flex items-center justify-center rounded-xl bg-brand-bg border border-brand-border text-white/55 hover:text-white hover:border-brand-accent/40 transition-all">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button type="button" @click="handleDelete(f.id)"
            class="w-8 h-8 flex items-center justify-center rounded-xl bg-brand-bg border border-brand-border text-white/35 hover:text-rose-400 hover:border-rose-500/40 transition-all">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- ── Форма создания / редактирования ──────────────── -->
    <div v-if="showForm" class="stack-y-5">

      <div class="flex items-center justify-between">
        <p class="text-xs font-bold text-brand-accent uppercase tracking-wider flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="9" r="1.6"/>
            <path d="M6 15c0-2 1.2-3 2.5-3s2.5 1 2.5 3"/>
            <circle cx="15.5" cy="9" r="1.6"/>
            <path d="M13 15c0-2 1.2-3 2.5-3s2.5 1 2.5 3"/>
          </svg>
          {{ editingId ? t.fursonaEditTitle : t.fursonaNewTitle }}
        </p>
        <button type="button" @click="closeForm"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-white/35 hover:text-white hover:bg-brand-border/30 transition-all text-xl leading-none">
          ×
        </button>
      </div>

      <!-- Имя персонажа -->
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
            class="w-full bg-brand-bg border rounded-2xl px-4 py-3 text-base font-semibold text-white placeholder-white/20 focus:outline-hidden transition-all pr-14"
            :class="form.name
              ? 'border-brand-accent/50 shadow-[0_0_0_3px_rgba(167,139,250,0.08)]'
              : 'border-brand-border focus:border-brand-accent/50 focus:shadow-[0_0_0_3px_rgba(167,139,250,0.08)]'"
          />
          <span class="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-semibold"
            :class="form.name.length > 72 ? 'text-amber-400' : 'text-white/25'">
            {{ form.name.length }}/80
          </span>
        </div>
        <div class="mt-2 h-0.5 rounded-full overflow-hidden bg-brand-border/40">
          <div class="h-full rounded-full transition-all duration-500"
            style="background:linear-gradient(90deg,#a78bfa,#7c3aed)"
            :style="`width:${Math.min((form.name.length/80)*100,100)}%`"></div>
        </div>
      </div>

      <!-- Вид / порода -->
      <div class="p-4 bg-brand-bg/60 border border-brand-border/60 rounded-2xl stack-y-3">
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
        <div class="relative">
          <div class="relative">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              v-model="speciesSearch"
              type="text"
              :placeholder="t.fursonaSpeciesSearchPlaceholder"
              class="w-full bg-brand-bg border border-brand-border rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-white/25 focus:outline-hidden focus:border-brand-accent/50 transition-all"
              @focus="speciesDropOpen = true"
              @blur="onSpeciesBlur"
            />
          </div>
          <Transition name="fade">
            <div v-if="speciesDropOpen && (filteredSpecies.length || showCustomSpeciesOption)"
              class="absolute z-30 mt-1 w-full bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-y-auto max-h-52">
              <button
                v-for="sp in filteredSpecies"
                :key="sp"
                type="button"
                class="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-all flex items-center justify-between"
                :class="form.species.includes(sp) ? 'text-brand-accent font-bold' : 'text-white/70'"
                @mousedown.prevent="toggleSpecies(sp)"
              >
                {{ speciesLabel(sp) }}
                <span v-if="form.species.includes(sp)" class="text-[10px]">✓</span>
              </button>
              <button
                v-if="showCustomSpeciesOption"
                type="button"
                class="w-full text-left px-4 py-2.5 text-sm text-brand-accent font-semibold hover:bg-brand-accent/10 transition-all flex items-center gap-2"
                :class="filteredSpecies.length ? 'border-t border-brand-border/60' : ''"
                @mousedown.prevent="addCustomSpecies"
              >
                <span class="text-[10px]">＋</span>
                {{ t.fursonaSpeciesAddCustom }} «{{ speciesSearch.trim() }}»
              </button>
            </div>
          </Transition>
        </div>
        <div v-if="form.species.length" class="flex flex-wrap gap-1.5">
          <span
            v-for="sp in form.species"
            :key="sp"
            class="flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-xl text-xs font-bold border border-brand-accent/50 bg-brand-accent/15 text-brand-accent shadow-[0_0_12px_rgba(167,139,250,0.15)]"
          >
            {{ speciesLabel(sp) }}
            <button type="button" @click="toggleSpecies(sp)"
              class="w-4 h-4 flex items-center justify-center rounded-full hover:bg-brand-accent/25 leading-none">×</button>
          </span>
        </div>
        <Transition
          enter-active-class="transition-all duration-200 ease-out"
          enter-from-class="opacity-0 -translate-y-1 max-h-0"
          enter-to-class="opacity-100 translate-y-0 max-h-20"
          leave-active-class="transition-all duration-150 ease-in"
          leave-from-class="opacity-100 translate-y-0 max-h-20"
          leave-to-class="opacity-0 -translate-y-1 max-h-0"
        >
          <div v-if="form.species.includes('Other')" class="overflow-hidden">
            <input
              v-model="form.species_other"
              type="text"
              maxlength="50"
              :placeholder="t.fursonaSpeciesOtherPlaceholder"
              class="w-full bg-brand-bg border border-brand-border rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white placeholder-white/20 focus:outline-hidden focus:border-brand-accent/50 focus:shadow-[0_0_0_3px_rgba(167,139,250,0.08)] transition-all"
            />
          </div>
        </Transition>
      </div>

      <!-- Цвета персонажа -->
      <div class="p-4 bg-brand-bg/60 border border-brand-border/60 rounded-2xl stack-y-4">
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
            <span class="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-white/40 font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
              {{ color }}
            </span>
            <button
              type="button"
              @click.stop="removeColor(idx)"
              class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
            >×</button>
            <div v-if="pickingIdx === idx"
              class="absolute top-12 left-0 z-20 bg-brand-card border border-brand-border rounded-2xl p-3 shadow-2xl stack-y-2"
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
                <label class="relative w-6 h-6 rounded-lg border border-brand-border shrink-0 cursor-pointer overflow-hidden" :style="`background:${color}`" title="Свой цвет">
                  <input
                    type="color"
                    :value="color"
                    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    @input="updateColor(idx, ($event.target as HTMLInputElement).value)"
                  />
                </label>
                <button
                  v-if="eyedropperSupported"
                  type="button"
                  title="Пипетка — выбрать цвет с экрана"
                  @click="pickWithEyedropper(idx)"
                  class="w-6 h-6 rounded-lg border border-brand-border shrink-0 flex items-center justify-center text-white/45 hover:text-brand-accent hover:border-brand-accent/50 transition-colors"
                >
                  <Pipette class="w-3.5 h-3.5" />
                </button>
                <input
                  type="text"
                  :value="color"
                  maxlength="7"
                  placeholder="#a78bfa"
                  class="flex-1 min-w-0 bg-brand-bg border rounded-lg px-2 py-1 text-xs text-white font-mono focus:outline-hidden transition-colors"
                  :class="isValidHex(color) ? 'border-brand-border focus:border-brand-accent/50' : 'border-rose-500/60'"
                  @input="onHexInput(idx, ($event.target as HTMLInputElement).value)"
                />
                <button type="button" @click="pickingIdx = null"
                  class="text-white/35 hover:text-white transition-colors text-sm leading-none">✓</button>
              </div>
            </div>
          </div>

          <button
            v-if="(form.colors?.length ?? 0) < 10"
            type="button"
            @click="addColor"
            class="w-10 h-10 rounded-xl border-2 border-dashed border-brand-border/60 text-white/25 text-xl flex items-center justify-center hover:border-brand-accent/50 hover:text-brand-accent transition-all hover:scale-110"
          >+</button>
        </div>

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

      <!-- Симпатии / Антипатии -->
      <div class="p-4 bg-brand-bg/60 border border-brand-border/60 rounded-2xl stack-y-4">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-xs font-bold text-white">{{ t.fursonaLikesVisibleLabel }}</p>
            <p class="text-[11px] text-white/35 mt-0.5">{{ t.fursonaLikesVisibleHint }}</p>
          </div>
          <button
            type="button"
            :class="['relative w-11 h-6 rounded-full border transition-all shrink-0',
              form.likes_dislikes_visible
                ? 'bg-brand-accent/20 border-brand-accent/60'
                : 'bg-brand-bg border-brand-border']"
            @click="form.likes_dislikes_visible = !form.likes_dislikes_visible"
          >
            <span :class="['absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow-sm transition-all',
              form.likes_dislikes_visible ? 'translate-x-5 bg-brand-accent' : 'translate-x-0 bg-white/40']"></span>
          </button>
        </div>

        <div v-if="form.likes_dislikes_visible" class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="stack-y-2">
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
                class="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/25 focus:outline-hidden focus:border-emerald-500/40 transition-all"
                @keydown.enter.prevent="addTag('likes')" />
              <button type="button" @click="addTag('likes')"
                class="w-8 h-8 flex items-center justify-center rounded-xl text-base font-bold border"
                style="background:#22c55e15;border-color:#22c55e30;color:#22c55e">+</button>
            </div>
          </div>
          <div class="stack-y-2">
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
                class="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/25 focus:outline-hidden focus:border-rose-500/40 transition-all"
                @keydown.enter.prevent="addTag('dislikes')" />
              <button type="button" @click="addTag('dislikes')"
                class="w-8 h-8 flex items-center justify-center rounded-xl text-base font-bold border"
                style="background:#ef444415;border-color:#ef444430;color:#ef4444">+</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Реф-лист (галерея, только для уже сохранённого персонажа) -->
      <div v-if="editingId" class="p-4 bg-brand-bg/60 border border-brand-border/60 rounded-2xl stack-y-3">
        <div class="flex items-center justify-between">
          <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
            <svg class="w-3.5 h-3.5 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            {{ t.fursonaRefLabel }}
          </p>
          <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
            :class="userStore.referenceImages.length >= 12
              ? 'bg-amber-500/15 text-amber-400'
              : 'bg-brand-accent/10 text-brand-accent/70'">
            {{ userStore.referenceImages.length }}/12
          </span>
        </div>
        <p class="text-[11px] text-white/30 leading-relaxed">{{ t.fursonaRefHint }}</p>

        <div v-if="userStore.referenceImages.length" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div v-for="item in userStore.referenceImages" :key="item.id"
            class="group relative p-2 bg-brand-bg border border-brand-border rounded-xl stack-y-1.5">
            <div class="relative">
              <img :src="item.image_url" alt="Reference"
                class="w-full aspect-square rounded-lg object-cover"
                :class="item.is_nsfw ? 'blur-xs' : ''"
                draggable="false" />
              <span v-if="item.is_nsfw"
                class="absolute top-1 left-1 text-[9px] font-bold px-1 py-0.5 rounded-sm bg-rose-600/90 text-white leading-none">18+</span>
              <button type="button" @click="removeReference(item.id)"
                class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">×</button>
            </div>
            <button type="button" @click="toggleReferenceNsfw(item)"
              class="w-full py-1 rounded-lg text-[9px] font-bold border transition-all"
              :class="item.is_nsfw
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                : 'bg-brand-bg border-brand-border text-white/40 hover:text-white'">
              {{ t.fursonaRefNsfw }}
            </button>
            <input v-model="item.artist_name" @blur="persistReferenceMeta(item)" type="text" maxlength="100"
              placeholder="Художник…"
              class="w-full bg-brand-bg border border-brand-border rounded-lg px-2 py-1 text-[10px] text-white placeholder-white/25 focus:outline-hidden focus:border-brand-accent/50 transition-all" />
          </div>
        </div>

        <MediaUpload v-if="userStore.referenceImages.length < 12" ref="refUploadEl" accept="image/*" folder="fursona" multiple @uploaded="onReferenceUploaded" />
        <p v-if="referenceError" class="text-[11px] text-rose-400">{{ referenceError }}</p>
      </div>
      <p v-else class="text-[11px] text-white/30 px-1">{{ t.fursonaMustSaveFirstHint }}</p>

      <!-- Кнопки сохранения -->
      <div class="flex items-center gap-2 pt-1">
        <button
          type="button"
          :disabled="saving"
          @click="submitForm"
          class="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold transition-all"
          style="background:linear-gradient(135deg,#a78bfa,#7c3aed);color:#fff;box-shadow:0 4px 16px #7c3aed20"
          :class="saving ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90 active:scale-95'"
        >
          <span v-if="saving" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          {{ saving ? t.fursonaSavingBtn : (editingId ? t.fursonaUpdateBtn : t.fursonaCreateBtn) }}
        </button>
        <button type="button" @click="closeForm"
          class="px-4 py-2 rounded-xl text-xs font-bold text-white/30 hover:text-white transition-colors">
          {{ t.cancel }}
        </button>
        <span v-if="formError" class="text-rose-400 text-xs ml-1">{{ formError }}</span>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { apiErrorMessage, errorMessage } from '@/lib/apiError'
import { reactive, ref, computed, onMounted, watch, nextTick } from 'vue'
import { useUserStore, FURSONA_SPECIES } from '@/stores/user'
import { useLangStore } from '@/stores/lang'
import { useConfirm } from '@/composables/useConfirm'
import type { UpsertFursonaInput, Fursona, FursonaReferenceImage } from '@/stores/user'
import MediaUpload from '@/components/MediaUpload.vue'
import BIcon from '@/components/BIcon.vue'
import { speciesLabel as speciesLabelFor } from '@/lib/fursonaSpecies'
import { Pipette } from 'lucide-vue-next'

const emit = defineEmits<{ dirty: [val: boolean] }>()

const userStore = useUserStore()
const langStore = useLangStore()
const { confirmDialog } = useConfirm()
const t = computed(() => langStore.t)

function speciesLabel(sp: string): string {
  return speciesLabelFor(sp, langStore.currentLang)
}

// ── Species search combobox ────────────────────────────────────────────────────
const speciesSearch   = ref('')
const speciesDropOpen = ref(false)

const filteredSpecies = computed(() => {
  const q = speciesSearch.value.trim().toLowerCase()
  if (!q) return FURSONA_SPECIES as unknown as string[]
  return (FURSONA_SPECIES as unknown as string[]).filter((sp) => speciesLabel(sp).toLowerCase().includes(q))
})

// Typed text that doesn't match any preset species → offer to add it as a free-text ("Other") variant
const showCustomSpeciesOption = computed(() => {
  const q = speciesSearch.value.trim()
  if (!q || form.species.length >= 5) return false
  const qLower = q.toLowerCase()
  return !(FURSONA_SPECIES as unknown as string[]).some((sp) => speciesLabel(sp).toLowerCase() === qLower)
})

function addCustomSpecies() {
  const val = speciesSearch.value.trim().slice(0, 50)
  if (!val || form.species.length >= 5) return
  if (!form.species.includes('Other')) form.species.push('Other')
  form.species_other = val
  speciesSearch.value = ''
  speciesDropOpen.value = false
}

function onSpeciesBlur() {
  setTimeout(() => { speciesDropOpen.value = false }, 180)
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

// Chrome/Edge only — feature-detected, no polyfill for unsupported browsers
const eyedropperSupported = typeof window !== 'undefined' && 'EyeDropper' in window

async function pickWithEyedropper(idx: number) {
  try {
    const result = await new (window as any).EyeDropper().open()
    if (result?.sRGBHex) updateColor(idx, result.sRGBHex)
  } catch {
    // User cancelled the pick (Escape) — nothing to do
  }
}

function isValidHex(val: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(val)
}

// Выбирает контрастный цвет текста (чёрный/белый) по hex
function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1,3),16)
  const g = parseInt(hex.slice(3,5),16)
  const b = parseInt(hex.slice(5,7),16)
  return (r*299 + g*587 + b*114) / 1000 > 128 ? '#000000' : '#ffffff'
}

// ── List/form shell ──────────────────────────────────────────────────────────
const showForm  = ref(false)
const editingId = ref<string | null>(null)
const saving    = ref(false)
const formError = ref('')

const form = reactive<UpsertFursonaInput & { species: string[]; colors: string[]; name: string }>({
  name: '',
  species: [],
  species_other: null,
  colors: [],
  likes_dislikes_visible: true,
  likes: [],
  dislikes: [],
})

const referenceError = ref('')
const newLike     = ref('')
const newDislike  = ref('')
const pickingIdx  = ref<number | null>(null)
const processedRefUrls = new Set<string>()
const refUploadEl = ref<InstanceType<typeof MediaUpload> | null>(null)

// Only report unsaved changes while a form is actually open and being edited —
// list-level actions (create/update/delete/set-primary) already persist immediately.
const suppressDirty = ref(true)
watch(form, () => {
  if (showForm.value && !suppressDirty.value) emit('dirty', true)
}, { deep: true })

async function currentUserId(): Promise<string | undefined> {
  const auth = await import('@/stores/auth').then((m) => m.useAuthStore())
  return auth.user?.id
}

onMounted(async () => {
  const userId = await currentUserId()
  if (!userId) return
  await userStore.fetchFursonas(userId)
})

function resetFormFields() {
  Object.assign(form, {
    name: '',
    species: [],
    species_other: null,
    colors: [],
    likes_dislikes_visible: true,
    likes: [],
    dislikes: [],
  })
  pickingIdx.value = null
  speciesSearch.value = ''
  formError.value = ''
  referenceError.value = ''
}

function openCreateForm() {
  if (userStore.fursonas.length >= 10) return
  suppressDirty.value = true
  editingId.value = null
  resetFormFields()
  userStore.referenceImages.length = 0
  showForm.value = true
  nextTick(() => { suppressDirty.value = false })
}

async function openEditForm(f: Fursona) {
  suppressDirty.value = true
  editingId.value = f.id
  resetFormFields()
  Object.assign(form, {
    name: f.name || '',
    species: [...(f.species ?? [])],
    species_other: f.species_other ?? null,
    colors: [...(f.colors ?? [])],
    likes_dislikes_visible: f.likes_dislikes_visible ?? true,
    likes: [...(f.likes ?? [])],
    dislikes: [...(f.dislikes ?? [])],
  })
  showForm.value = true
  const userId = await currentUserId()
  if (userId) await userStore.fetchReferenceImages(userId, f.id)
  nextTick(() => { suppressDirty.value = false })
}

function closeForm() {
  suppressDirty.value = true
  showForm.value = false
  editingId.value = null
  emit('dirty', false)
}

/** Discard local edits: close any open form without saving, refresh the list from the server. */
async function reset() {
  suppressDirty.value = true
  showForm.value = false
  editingId.value = null
  emit('dirty', false)
  const userId = await currentUserId()
  if (userId) await userStore.fetchFursonas(userId)
}

function toggleSpecies(sp: string) {
  const idx = form.species.indexOf(sp)
  if (idx === -1) { if (form.species.length < 5) form.species.push(sp) }
  else {
    form.species.splice(idx, 1)
    if (sp === 'Other') form.species_other = null
  }
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
  const withHash = val.startsWith('#') ? val : `#${val}`
  const expanded = /^#[0-9A-Fa-f]{3}$/.test(withHash)
    ? `#${withHash[1]}${withHash[1]}${withHash[2]}${withHash[2]}${withHash[3]}${withHash[3]}`
    : withHash
  if (isValidHex(expanded)) updateColor(idx, expanded)
}

function addTag(field: 'likes' | 'dislikes') {
  const input = field === 'likes' ? newLike : newDislike
  const v = input.value.trim().slice(0, 100)
  const arr = form[field] as string[]
  if (v && !arr.includes(v) && arr.length < 30) arr.push(v)
  if (field === 'likes') newLike.value = ''; else newDislike.value = ''
}
function removeTag(field: 'likes' | 'dislikes', idx: number) { ;(form[field] as string[]).splice(idx, 1) }

async function onReferenceUploaded(urls: string[]) {
  if (!urls.length || !editingId.value) return
  referenceError.value = ''
  for (const url of urls) {
    if (processedRefUrls.has(url) || userStore.referenceImages.length >= 12) continue
    processedRefUrls.add(url)
    try {
      await userStore.addReferenceImage(editingId.value, { image_url: url })
    } catch (e) {
      referenceError.value = apiErrorMessage(e) ?? errorMessage(e) ?? 'Error'
    }
  }
  refUploadEl.value?.clearAll()
}

function toggleReferenceNsfw(item: FursonaReferenceImage) {
  if (!editingId.value) return
  userStore.updateReferenceImage(editingId.value, item.id, { is_nsfw: !item.is_nsfw }).catch((e: any) => {
    referenceError.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  })
}

function persistReferenceMeta(item: FursonaReferenceImage) {
  if (!editingId.value) return
  userStore.updateReferenceImage(editingId.value, item.id, { artist_name: item.artist_name || null }).catch((e: any) => {
    referenceError.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  })
}

function removeReference(id: string) {
  if (!editingId.value) return
  userStore.deleteReferenceImage(editingId.value, id).catch((e: any) => {
    referenceError.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  })
}

async function submitForm() {
  saving.value = true
  formError.value = ''
  try {
    const payload: UpsertFursonaInput = {
      name: form.name,
      species: form.species,
      species_other: form.species.includes('Other') ? form.species_other : null,
      colors: form.colors,
      likes_dislikes_visible: form.likes_dislikes_visible,
      likes: form.likes,
      dislikes: form.dislikes,
    }
    if (editingId.value) {
      await userStore.updateFursona(editingId.value, payload)
      closeForm()
    } else {
      // Stay in the form (now in edit mode) instead of closing, so the reference
      // gallery — which needs a real fursona_id — becomes usable right away.
      const created = await userStore.createFursona(payload)
      editingId.value = created.id
      const userId = await currentUserId()
      if (userId) await userStore.fetchReferenceImages(userId, created.id)
      suppressDirty.value = true
      emit('dirty', false)
      await nextTick()
      suppressDirty.value = false
    }
  } catch (e) {
    formError.value = apiErrorMessage(e) ?? errorMessage(e) ?? 'Error'
  } finally {
    saving.value = false
  }
}

async function handleSetPrimary(id: string) {
  try {
    await userStore.setPrimaryFursona(id)
  } catch (e) {
    alert(apiErrorMessage(e) ?? 'Failed to set primary character')
  }
}

async function handleDelete(id: string) {
  if (!(await confirmDialog(t.value.fursonaDeleteConfirm, { danger: true }))) return
  try {
    await userStore.deleteFursona(id)
  } catch (e) {
    alert(apiErrorMessage(e) ?? 'Failed to delete fursona')
  }
}

/** Called by the parent's global save bar when this section was marked dirty. */
async function save() {
  if (!showForm.value) return
  await submitForm()
}

defineExpose({ save, reset })
</script>

<style scoped>
.fade-msg-enter-active, .fade-msg-leave-active { transition: opacity 0.3s; }
.fade-msg-enter-from, .fade-msg-leave-to { opacity: 0; }
</style>
