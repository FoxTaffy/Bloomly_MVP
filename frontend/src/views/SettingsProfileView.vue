<template>
  <div class="min-h-screen bg-brand-bg text-brand-offwhite font-nunito">

    <!-- ─── Toast notification ──────────────────────────────────────── -->
    <Transition name="toast">
      <div
        v-if="toast.show"
        class="fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold border backdrop-blur-lg pointer-events-none"
        :class="toast.type === 'success'
          ? 'bg-brand-success/10 border-brand-success/30 text-brand-success'
          : 'bg-brand-error/10 border-brand-error/30 text-brand-error'"
      >
        <svg v-if="toast.type === 'success'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
        <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
        {{ toast.message }}
      </div>
    </Transition>

    <!-- ─── Floating save/reset bar (dirty) ──────────────────────────── -->
    <Transition name="floatbar">
      <div
        v-if="isDirty"
        class="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-50 flex items-center gap-2 p-1.5 rounded-2xl shadow-2xl border transition-all"
        :class="[
          shaking ? 'animate-shake' : '',
          unsavedWarning
            ? 'bg-brand-error/15 border-brand-error/40 shadow-brand-error/20'
            : 'bg-brand-card/90 border-brand-border backdrop-blur-xl'
        ]"
      >
        <!-- Unsaved badge -->
        <div class="px-3 py-1.5 flex items-center gap-2"
          :class="unsavedWarning ? 'text-brand-error' : 'text-white/55'">
          <div class="w-2 h-2 rounded-full animate-pulse"
            :class="unsavedWarning ? 'bg-brand-error' : 'bg-amber-400'"></div>
          <span class="text-xs font-bold">{{ unsavedWarning ? 'Не сохранено!' : 'Есть изменения' }}</span>
        </div>
        <!-- Reset -->
        <button type="button" @click="resetForm"
          class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all text-white/55 hover:text-white hover:bg-white/10 border border-transparent hover:border-brand-border">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          Сбросить
        </button>
        <!-- Save -->
        <button type="button" @click="handleSubmit" :disabled="userStore.isLoading"
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50 shadow-lg"
          :style="unsavedWarning
            ? 'background:#ef4444;box-shadow:0 4px 20px rgba(239,68,68,0.4)'
            : `background:${form.accent_color};box-shadow:0 4px 20px ${form.accent_color}44`">
          <span v-if="userStore.isLoading" class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
          {{ userStore.isLoading ? 'Сохранение…' : 'Сохранить' }}
        </button>
      </div>
    </Transition>

    <!-- ─── Crop modal ──────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div v-if="cropModal.show"
          class="fixed inset-0 z-[200] flex items-center justify-center p-4"
          @mousemove="onCropMouseMove" @mouseup="onCropMouseUp"
          @touchmove.prevent="onCropTouchMove" @touchend.prevent="onCropMouseUp">
          <!-- backdrop -->
          <div class="absolute inset-0 bg-black/85 backdrop-blur-sm" @click="cancelCrop"></div>
          <!-- modal card -->
          <div class="relative z-10 bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full overflow-hidden select-none"
            :style="`max-width:${CROP_CONTAINER_W + 48}px`">
            <!-- header -->
            <div class="px-6 py-4 border-b border-brand-border flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center" style="background:rgba(76,151,207,0.18)">
                  <svg class="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                </div>
                <div>
                  <h3 class="font-bold text-white text-sm">
                    {{ cropModal.type === 'avatar' ? 'Обрезать аватар' : 'Обрезать баннер' }}
                  </h3>
                  <p class="text-[11px] text-white/55">
                    {{ cropModal.type === 'avatar' ? 'Квадрат 1:1 · Перемещайте и масштабируйте' : 'Прямоугольник · Перемещайте и масштабируйте' }}
                  </p>
                </div>
              </div>
              <button @click="cancelCrop"
                class="w-8 h-8 rounded-xl flex items-center justify-center text-white/55 hover:text-white hover:bg-white/10 transition-all">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <!-- crop area -->
            <div class="p-4 flex justify-center">
              <div id="crop-container"
                class="relative overflow-hidden rounded-2xl bg-black cursor-crosshair"
                :style="`width:${CROP_CONTAINER_W}px;height:${CROP_CONTAINER_H}px;max-width:100%`"
                @mousedown="onCropMouseDown"
                @touchstart.prevent="onCropTouchStart">
                <!-- source image -->
                <img :src="cropModal.src"
                  class="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  @load="onCropImageLoad" crossorigin="anonymous"/>
                <!-- dark overlay strips -->
                <template v-if="cropModal.imgW > 0">
                  <div class="absolute bg-black/65 pointer-events-none" :style="`left:0;top:0;right:0;height:${cropModal.cy}px`"></div>
                  <div class="absolute bg-black/65 pointer-events-none" :style="`left:0;bottom:0;right:0;top:${cropModal.cy+cropModal.ch}px`"></div>
                  <div class="absolute bg-black/65 pointer-events-none" :style="`left:0;top:${cropModal.cy}px;width:${cropModal.cx}px;height:${cropModal.ch}px`"></div>
                  <div class="absolute bg-black/65 pointer-events-none" :style="`right:0;top:${cropModal.cy}px;left:${cropModal.cx+cropModal.cw}px;height:${cropModal.ch}px`"></div>
                  <!-- crop border -->
                  <div class="absolute border-2 border-white/90 pointer-events-none"
                    :style="`left:${cropModal.cx}px;top:${cropModal.cy}px;width:${cropModal.cw}px;height:${cropModal.ch}px`">
                    <!-- rule-of-thirds -->
                    <div class="absolute inset-0 pointer-events-none opacity-25">
                      <div class="absolute left-1/3 top-0 bottom-0 border-l border-white"></div>
                      <div class="absolute left-2/3 top-0 bottom-0 border-l border-white"></div>
                      <div class="absolute top-1/3 left-0 right-0 border-t border-white"></div>
                      <div class="absolute top-2/3 left-0 right-0 border-t border-white"></div>
                    </div>
                  </div>
                  <!-- corner handles -->
                  <div class="absolute w-5 h-5 pointer-events-auto cursor-nw-resize flex items-start justify-start"
                    :style="`left:${cropModal.cx-4}px;top:${cropModal.cy-4}px`"
                    @mousedown.stop="startResize($event,'nw')" @touchstart.stop.prevent="startResizeTouch($event,'nw')">
                    <div class="w-3.5 h-3.5 bg-white rounded-sm shadow-md border border-black/20"></div>
                  </div>
                  <div class="absolute w-5 h-5 pointer-events-auto cursor-ne-resize flex items-start justify-end"
                    :style="`left:${cropModal.cx+cropModal.cw-17}px;top:${cropModal.cy-4}px`"
                    @mousedown.stop="startResize($event,'ne')" @touchstart.stop.prevent="startResizeTouch($event,'ne')">
                    <div class="w-3.5 h-3.5 bg-white rounded-sm shadow-md border border-black/20"></div>
                  </div>
                  <div class="absolute w-5 h-5 pointer-events-auto cursor-sw-resize flex items-end justify-start"
                    :style="`left:${cropModal.cx-4}px;top:${cropModal.cy+cropModal.ch-17}px`"
                    @mousedown.stop="startResize($event,'sw')" @touchstart.stop.prevent="startResizeTouch($event,'sw')">
                    <div class="w-3.5 h-3.5 bg-white rounded-sm shadow-md border border-black/20"></div>
                  </div>
                  <div class="absolute w-5 h-5 pointer-events-auto cursor-se-resize flex items-end justify-end"
                    :style="`left:${cropModal.cx+cropModal.cw-17}px;top:${cropModal.cy+cropModal.ch-17}px`"
                    @mousedown.stop="startResize($event,'se')" @touchstart.stop.prevent="startResizeTouch($event,'se')">
                    <div class="w-3.5 h-3.5 bg-white rounded-sm shadow-md border border-black/20"></div>
                  </div>
                </template>
              </div>
            </div>
            <!-- footer -->
            <div class="px-6 py-4 border-t border-brand-border flex items-center justify-between">
              <p class="text-xs text-white/35">
                {{ cropModal.type === 'avatar' ? 'Квадрат · Выход 400 × 400 px' : 'Прямоугольник · Выход 1200 px ширина' }}
              </p>
              <div class="flex gap-3">
                <button type="button" @click="cancelCrop"
                  class="px-4 py-2 text-xs font-bold rounded-xl border border-brand-border text-white/55 hover:text-white hover:border-brand-muted/40 transition-all">
                  Отмена
                </button>
                <button type="button" @click="confirmCrop" :disabled="cropUploading"
                  class="px-4 py-2 text-xs font-bold rounded-xl text-white transition-all disabled:opacity-50 shadow-lg flex items-center gap-2"
                  :style="`background:${form.accent_color};box-shadow:0 4px 16px ${form.accent_color}44`">
                  <span v-if="cropUploading" class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                  </svg>
                  {{ cropUploading ? 'Загрузка…' : 'Применить' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ─── App Header ──────────────────────────────────────────────── -->
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-6 pb-28 md:pb-10">

      <!-- ─── Left: App navigation hub ─────────────────────────────── -->
      <AppSidebar />

      <!-- ─── Settings area ────────────────────────────────────────── -->
      <main class="flex-1 min-w-0">
        <div class="flex flex-row-reverse gap-6 items-start">

          <!-- ── Left sticky section nav ────────────────────────────── -->
          <aside class="w-56 hidden xl:flex flex-col gap-3 sticky top-24 self-start flex-shrink-0">

            <!-- Mini profile preview card -->
            <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
              <div class="h-16 relative"
                :style="form.banner_url
                  ? `background-image:url(${form.banner_url});background-size:cover;background-position:center`
                  : `background:linear-gradient(135deg,${form.accent_color}33,${form.accent_color}0a)`">
              </div>
              <div class="px-4 pb-4 -mt-6 relative">
                <div class="w-12 h-12 rounded-full border-[3px] overflow-hidden mb-2 shadow-lg"
                  :style="`border-color:${form.accent_color}66`">
                  <img v-if="form.avatar_url" :src="form.avatar_url" class="w-full h-full object-cover" />
                  <div v-else class="w-full h-full flex items-center justify-center font-bold text-lg"
                    :style="`background:${form.accent_color}26;color:${form.accent_color}`">
                    {{ (form.display_name || authStore.user?.username || '?')[0].toUpperCase() }}
                  </div>
                </div>
                <p class="font-bold text-white text-sm truncate leading-tight">{{ form.display_name || authStore.user?.username }}</p>
                <p class="text-xs text-white/55 truncate">@{{ authStore.user?.username }}</p>
              </div>
            </div>

            <!-- Section scroll-spy nav -->
            <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
              <div class="px-4 py-3 border-b border-brand-border">
                <h4 class="text-[11px] font-bold text-white/55 uppercase tracking-widest">Разделы</h4>
              </div>
              <nav class="p-2 space-y-0.5">
                <button
                  v-for="sec in sections.filter(s => s.id !== 'sec-ad')" :key="sec.id"
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
                <h1 class="text-2xl font-extrabold text-white tracking-tight">Настройки</h1>
                <p class="text-sm text-white/55 mt-0.5">{{ sections.find(s => s.id === openSection)?.label ?? 'Профиль' }}</p>
              </div>
            </div>

            <!-- Mobile section tabs (xl+ uses the sticky sidebar instead) -->
            <div class="flex gap-2 overflow-x-auto pb-1 xl:hidden no-scrollbar">
              <button
                v-for="sec in sections.filter(s => s.id !== 'sec-ad')" :key="sec.id"
                @click="openSec(sec.id)"
                class="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all"
                :class="openSection === sec.id ? 'text-white border-transparent shadow-lg' : 'text-white/55 border-brand-border hover:border-white/20 bg-brand-card'"
                :style="openSection === sec.id ? `background:${sec.color};box-shadow:0 4px 12px ${sec.color}44` : ''">
                {{ sec.label }}
              </button>
            </div>

            <form @submit.prevent="handleSubmit" class="space-y-5">

              <!-- ── § 1: ОСНОВНОЕ + МЕДИА ──────────────────────────── -->
              <section v-show="openSection === sections[0].id" :id="sections[0].id" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                  :style="`background:linear-gradient(90deg,${sections[0].color}0c 0%,transparent 100%)`">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${sections[0].color}1a`">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${sections[0].color}`">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="sections[0].iconPath"/>
                    </svg>
                  </div>
                  <h2 class="font-bold text-white text-sm">{{ sections[0].label }}</h2>
                </div>
                <div class="p-0">

                  <!-- Hidden file inputs (sr-only for mobile compatibility) -->
                  <input ref="avatarFileRef" type="file" accept="image/*" class="sr-only" @change="onAvatarFileChange"/>
                  <input ref="bannerFileRef" type="file" accept="image/*" class="sr-only" @change="onBannerFileChange"/>

                  <!-- ── Combined banner + avatar preview ── -->
                  <div class="relative">
                    <!-- Banner drag-drop + click zone -->
                    <div
                      class="relative w-full h-48 overflow-hidden cursor-pointer group transition-all"
                      :class="bannerDragOver ? 'ring-2 ring-inset ring-sky-400' : ''"
                      :style="form.banner_url
                        ? `background-image:url(${form.banner_url});background-size:cover;background-position:center`
                        : `background:linear-gradient(135deg,${form.accent_color}30 0%,${form.accent_color}08 60%,transparent 100%)`"
                      @click="bannerFileRef?.click()"
                      @dragover.prevent="bannerDragOver = true"
                      @dragleave.self="bannerDragOver = false"
                      @drop.prevent="onBannerDrop">
                      <!-- grid overlay for empty state -->
                      <div v-if="!form.banner_url"
                        class="absolute inset-0 pointer-events-none"
                        style="background-image:repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,0.025) 39px,rgba(255,255,255,0.025) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,0.025) 39px,rgba(255,255,255,0.025) 40px)">
                      </div>
                      <!-- hover / drag-over overlay -->
                      <div class="absolute inset-0 transition-all duration-200 flex flex-col items-center justify-center gap-2 pointer-events-none"
                        :class="bannerDragOver ? 'bg-sky-500/20 opacity-100' : 'bg-black/50 opacity-0 group-hover:opacity-100'">
                        <div class="w-10 h-10 rounded-2xl border flex items-center justify-center backdrop-blur transition-all"
                          :class="bannerDragOver ? 'bg-sky-500/30 border-sky-400/60' : 'bg-white/15 border-white/25'">
                          <svg v-if="!bannerDragOver" class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                          </svg>
                          <svg v-else class="w-5 h-5 text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                          </svg>
                        </div>
                        <span class="text-white text-xs font-bold">
                          {{ bannerDragOver ? 'Отпустите файл' : (form.banner_url ? 'Изменить баннер' : 'Добавить баннер') }}
                        </span>
                        <span v-if="!bannerDragOver" class="text-white/50 text-[10px]">Клик или перетащите изображение</span>
                      </div>
                      <!-- action buttons top-right -->
                      <div class="absolute top-3 right-3 flex gap-1.5">
                        <Transition name="fade">
                          <button v-if="form.banner_url" type="button"
                            @click.stop="reopenCrop('banner')"
                            class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/55 border border-white/20 backdrop-blur text-white/75 hover:text-white hover:bg-black/80 transition-all text-[10px] font-bold">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                            Кадр
                          </button>
                        </Transition>
                        <Transition name="fade">
                          <button v-if="form.banner_url" type="button"
                            @click.stop="form.banner_url = ''"
                            class="w-7 h-7 rounded-full bg-black/55 border border-white/20 backdrop-blur flex items-center justify-center text-white/70 hover:text-white hover:bg-black/80 transition-all">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                          </button>
                        </Transition>
                      </div>
                    </div>

                    <!-- Avatar drag-drop zone over banner bottom -->
                    <div class="absolute left-6 -bottom-10">
                      <label
                        class="relative w-20 h-20 rounded-full cursor-pointer group/av transition-all block"
                        :class="avatarDragOver ? 'scale-105' : ''"
                        @click.prevent="avatarFileRef?.click()"
                        @dragover.prevent="avatarDragOver = true"
                        @dragleave.self="avatarDragOver = false"
                        @drop.prevent="onAvatarDrop">
                        <div class="w-20 h-20 rounded-full overflow-hidden border-[3px] shadow-xl transition-all"
                          :style="`border-color:${avatarDragOver ? '#38bdf8' : form.accent_color + '66'}`">
                          <img v-if="form.avatar_url" :src="form.avatar_url" class="w-full h-full object-cover"/>
                          <div v-else class="w-full h-full flex items-center justify-center font-bold text-3xl"
                            :style="`background:${form.accent_color}26;color:${form.accent_color}`">
                            {{ (form.display_name || authStore.user?.username || '?')[0].toUpperCase() }}
                          </div>
                        </div>
                        <!-- GIF badge -->
                        <span v-if="form.avatar_url && form.avatar_url.toLowerCase().includes('.gif')" class="absolute -top-1 -left-1 text-[9px] font-extrabold bg-brand-accent text-white px-1.5 py-0.5 rounded-full border border-brand-card shadow z-10">GIF</span>
                        <!-- Loading overlay for GIF upload -->
                        <div v-if="uploadingGifAvatar" class="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                          <span class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        </div>
                        <!-- hover / drag overlay -->
                        <div class="absolute inset-0 rounded-full transition-all duration-200 flex items-center justify-center"
                          :class="avatarDragOver ? 'bg-sky-500/45 opacity-100' : 'bg-black/55 opacity-0 group-hover/av:opacity-100'">
                          <svg v-if="!avatarDragOver" class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                          </svg>
                          <svg v-else class="w-6 h-6 text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                          </svg>
                        </div>
                        <!-- remove avatar -->
                        <button v-if="form.avatar_url" type="button"
                          @click.stop="form.avatar_url = ''"
                          class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-brand-error border-2 border-brand-card flex items-center justify-center text-white shadow-lg opacity-0 group-hover/av:opacity-100 transition-all">
                          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </label>
                    </div>
                  </div>

                  <!-- Spacer + action row -->
                  <div class="pt-12 px-6 pb-4 flex items-end justify-between">
                    <div>
                      <p class="font-bold text-white text-sm">{{ form.display_name || authStore.user?.username }}</p>
                      <p class="text-xs text-white/55">@{{ authStore.user?.username }}</p>
                    </div>
                    <div class="flex flex-wrap gap-2 text-xs text-white/35 font-semibold">
                      <button type="button" @click="avatarFileRef?.click()"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border hover:border-brand-accent/50 hover:text-white transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        Аватар
                      </button>
                      <button type="button" @click="bannerFileRef?.click()"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border hover:border-brand-accent/50 hover:text-white transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        Баннер
                      </button>
                      <button v-if="form.avatar_url" type="button" @click="reopenCrop('avatar')"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border hover:border-sky-400/50 hover:text-sky-300 transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                        Кадр аватар
                      </button>
                    </div>
                  </div>

                  <!-- ── Поля формы ── -->
                  <div class="p-6 space-y-5 border-t border-brand-border/40">

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <!-- Display name -->
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider">Отображаемое имя</label>
                        <span class="text-[11px] tabular-nums" :class="(form.display_name?.length??0) > 45 ? 'text-brand-error/80' : 'text-white/35'">
                          {{ form.display_name?.length ?? 0 }}<span class="opacity-50">/50</span>
                        </span>
                      </div>
                      <input v-model="form.display_name" type="text" maxlength="50" placeholder="Ваше имя" class="field-input"/>
                      <p v-if="savedForm.display_name" class="text-[11px] text-white/35 mt-1.5 truncate">
                        Сейчас: <span class="text-white/35 font-semibold">{{ savedForm.display_name }}</span>
                      </p>
                    </div>
                    <!-- Status -->
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider">Статус</label>
                        <span class="text-[11px] tabular-nums" :class="(form.status?.length??0) > 90 ? 'text-brand-error/80' : 'text-white/35'">
                          {{ form.status?.length ?? 0 }}<span class="opacity-50">/100</span>
                        </span>
                      </div>
                      <input v-model="form.status" type="text" maxlength="100" placeholder="Чем вы занимаетесь?" class="field-input"/>
                      <p v-if="savedForm.status" class="text-[11px] text-white/35 mt-1.5 truncate">
                        Сейчас: <span class="text-white/35 font-semibold">{{ savedForm.status }}</span>
                      </p>
                    </div>
                  </div>

                  <!-- Bio -->
                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider">О себе</label>
                      <span class="text-[11px] tabular-nums" :class="(form.bio?.length??0) > 270 ? 'text-brand-error/80' : 'text-white/35'">
                        {{ form.bio?.length ?? 0 }}<span class="opacity-50">/300</span>
                      </span>
                    </div>
                    <textarea v-model="form.bio" rows="4" maxlength="300" placeholder="Расскажите о себе…" class="field-input resize-none"></textarea>
                    <p v-if="savedForm.bio" class="text-[11px] text-white/35 mt-1.5 line-clamp-1">
                      Сейчас: <span class="text-white/35 font-semibold">{{ savedForm.bio }}</span>
                    </p>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <!-- Job title -->
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">Должность / Занятие</label>
                      <input v-model="form.job_title" type="text" placeholder="Напр. Цифровой художник" class="field-input"/>
                      <p v-if="savedForm.job_title" class="text-[11px] text-white/35 mt-1.5 truncate">
                        Сейчас: <span class="text-white/35 font-semibold">{{ savedForm.job_title }}</span>
                      </p>
                    </div>
                    <!-- Pronouns -->
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">Местоимения</label>
                      <div class="flex gap-2">
                        <input v-model="form.pronouns" type="text" placeholder="он/его, она/её…" class="field-input flex-1"/>
                        <div class="flex gap-1.5 items-center flex-shrink-0">
                          <button v-for="p in pronounPresets" :key="p" type="button" @click="form.pronouns = p"
                            class="px-2 py-1 rounded-xl text-[10px] font-bold transition-all border"
                            :class="form.pronouns === p ? 'border-transparent text-white' : 'bg-brand-bg border-brand-border text-white/55 hover:text-white'"
                            :style="form.pronouns === p ? `background:${form.accent_color};border-color:${form.accent_color}` : ''">
                            {{ p.split('/')[0] }}
                          </button>
                        </div>
                      </div>
                      <p v-if="savedForm.pronouns" class="text-[11px] text-white/35 mt-1.5 truncate">
                        Сейчас: <span class="text-white/35 font-semibold">{{ savedForm.pronouns }}</span>
                      </p>
                    </div>
                  </div>

                  <!-- Birth date + NSFW note -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">Дата рождения</label>
                      <input v-model="form.birth_date" type="date" class="field-input"
                        :max="new Date().toISOString().substring(0,10)" />
                      <p class="text-[11px] mt-1.5"
                        :class="birthAge !== null && birthAge < 18 ? 'text-brand-error/80' : 'text-white/35'">
                        <template v-if="birthAge !== null">
                          {{ birthAge }} лет
                          <span v-if="birthAge < 18"> · NSFW-контент недоступен (менее 18 лет)</span>
                        </template>
                        <template v-else>Используется для проверки доступа к NSFW-контенту</template>
                      </p>
                    </div>
                  </div>

                </div><!-- /p-6 form fields -->
                </div><!-- /p-0 outer -->
              </section>

              <!-- ── § 2: CONTACTS ───────────────────────────────────── -->
              <section v-show="openSection === sections[1].id" :id="sections[1].id" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                  :style="`background:linear-gradient(90deg,${sections[1].color}0c 0%,transparent 100%)`">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${sections[1].color}1a`">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${sections[1].color}`">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="sections[1].iconPath"/>
                    </svg>
                  </div>
                  <h2 class="font-bold text-white text-sm">{{ sections[1].label }}</h2>
                </div>
                <div class="p-6 space-y-5">

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <!-- Website -->
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">Веб-сайт</label>
                      <div class="relative">
                        <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
                        </svg>
                        <input v-model="form.website" type="url" placeholder="https://yoursite.com" class="field-input !pl-10"/>
                      </div>
                    </div>

                    <!-- Country combobox -->
                    <div class="relative">
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">Страна</label>
                      <div class="relative">
                        <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 004 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064"/>
                        </svg>
                        <input
                          v-model="countrySearch"
                          type="text"
                          placeholder="Выбрать страну…"
                          class="field-input !pl-10 pr-8"
                          @focus="countryDropOpen = true"
                          @blur="onCountryBlur"
                          @input="countryDropOpen = true"
                        />
                        <svg v-if="form.country" class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color:#22c55e">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                        </svg>
                      </div>
                      <Transition name="fade">
                        <div v-if="countryDropOpen && filteredCountries.length"
                          class="absolute z-30 mt-1 w-full bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-y-auto max-h-52">
                          <button v-for="c in filteredCountries" :key="c" type="button"
                            class="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-all"
                            :class="c === form.country ? 'text-white font-bold' : 'text-white/55'"
                            @mousedown.prevent="selectCountry(c)">
                            {{ c }}
                          </button>
                        </div>
                      </Transition>
                    </div>

                    <!-- City combobox -->
                    <div class="relative">
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">Город</label>
                      <div class="relative">
                        <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                        <input
                          v-model="citySearch"
                          type="text"
                          placeholder="Введите или выберите…"
                          class="field-input !pl-10"
                          @focus="cityDropOpen = filteredCities.length > 0"
                          @blur="onCityBlur"
                          @input="cityDropOpen = filteredCities.length > 0; form.location = citySearch"
                        />
                      </div>
                      <Transition name="fade">
                        <div v-if="cityDropOpen && filteredCities.length"
                          class="absolute z-30 mt-1 w-full bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-y-auto max-h-52">
                          <button v-for="c in filteredCities" :key="c" type="button"
                            class="w-full text-left px-4 py-2.5 text-sm hover:bg-white/5 transition-all"
                            :class="c === form.location ? 'text-white font-bold' : 'text-white/55'"
                            @mousedown.prevent="selectCity(c)">
                            {{ c }}
                          </button>
                        </div>
                      </Transition>
                    </div>

                    <!-- Relationship status -->
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">Семейное положение</label>
                      <div class="grid grid-cols-2 gap-1.5">
                        <button v-for="rs in relationshipOptions" :key="rs.value" type="button"
                          @click="form.relationship_status = form.relationship_status === rs.value ? '' : rs.value"
                          class="py-2 px-3 rounded-xl text-xs font-semibold transition-all border text-center"
                          :class="form.relationship_status === rs.value
                            ? 'text-white border-transparent'
                            : 'bg-brand-bg border-brand-border text-white/55 hover:text-white'"
                          :style="form.relationship_status === rs.value
                            ? `background:${form.accent_color}30;border-color:${form.accent_color}55;color:${form.accent_color}`
                            : ''">
                          {{ rs.label }}
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- Partner picker (shown when applicable status) -->
                  <Transition name="fade">
                    <div v-if="showPartnerPicker" class="p-4 bg-brand-bg/60 border border-brand-border/60 rounded-2xl space-y-3">
                      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color:#ec4899">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                        </svg>
                        Партнёр (из друзей)
                      </p>

                      <!-- Current partner chip -->
                      <div v-if="selectedPartner" class="flex items-center gap-3 p-3 rounded-xl border border-brand-border bg-brand-card">
                        <img v-if="selectedPartner.avatar_url" :src="selectedPartner.avatar_url" class="w-8 h-8 rounded-full object-cover flex-shrink-0"/>
                        <div v-else class="w-8 h-8 rounded-full bg-brand-border flex items-center justify-center text-xs font-bold text-white/55 flex-shrink-0">
                          {{ (selectedPartner.display_name ?? selectedPartner.username)[0].toUpperCase() }}
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-bold text-white truncate">{{ selectedPartner.display_name ?? selectedPartner.username }}</p>
                          <p class="text-xs text-white/55 truncate">@{{ selectedPartner.username }}</p>
                        </div>
                        <button type="button" @click="clearPartner"
                          class="w-7 h-7 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-white/10 transition-all flex-shrink-0">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>

                      <!-- Search / select -->
                      <div class="relative">
                        <input
                          v-model="partnerSearch"
                          type="text"
                          placeholder="Найти по имени или @логину…"
                          class="field-input"
                          @focus="partnerDropOpen = true"
                          @blur="onPartnerBlur"
                        />
                        <Transition name="fade">
                          <div v-if="partnerDropOpen && filteredPartners.length"
                            class="absolute z-30 mt-1 w-full bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-y-auto max-h-48">
                            <button v-for="u in filteredPartners" :key="u.id" type="button"
                              class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-all"
                              @mousedown.prevent="selectPartner(u)">
                              <img v-if="u.avatar_url" :src="u.avatar_url" class="w-7 h-7 rounded-full object-cover flex-shrink-0"/>
                              <div v-else class="w-7 h-7 rounded-full bg-brand-border flex items-center justify-center text-xs font-bold text-white/55 flex-shrink-0">
                                {{ (u.display_name ?? u.username)[0].toUpperCase() }}
                              </div>
                              <div class="flex-1 min-w-0 text-left">
                                <p class="text-sm font-semibold text-white truncate">{{ u.display_name ?? u.username }}</p>
                                <p class="text-xs text-white/55 truncate">@{{ u.username }}</p>
                              </div>
                            </button>
                            <p v-if="!filteredPartners.length" class="text-xs text-white/55 px-4 py-3">Никого не найдено</p>
                          </div>
                        </Transition>
                      </div>
                      <p v-if="!followingList.length" class="text-xs text-white/35">Вы пока ни на кого не подписаны</p>
                    </div>
                  </Transition>

                  <!-- ── Соцсети ────────────────────────────── -->
                  <div class="pt-2">
                    <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-3">Соцсети</label>
                    <div class="space-y-2">
                      <div v-for="net in socialNetworks" :key="net.key" class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border"
                          :style="{ backgroundColor: net.color + '22', borderColor: net.color + '44' }">
                          <span class="w-5 h-5 flex items-center justify-center" :style="{ color: net.color }" v-html="net.svg"></span>
                        </div>
                        <div class="flex-1">
                          <label class="block text-[11px] font-semibold text-white/45 mb-1">{{ net.label }}</label>
                          <input
                            :value="form.social_links[net.key] ?? ''"
                            @input="form.social_links = { ...form.social_links, [net.key]: ($event.target as HTMLInputElement).value }"
                            type="text"
                            :placeholder="net.key === 'telegram' ? '@username' : net.key === 'discord' ? 'username#0000' : net.key === 'other' ? 'https://example.com' : '@username'"
                            class="field-input"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </section>

              <!-- ── § 3: FURSONA ────────────────────────────────────── -->
              <section v-show="openSection === sections[2].id" :id="sections[2].id" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                  :style="`background:linear-gradient(90deg,${sections[2].color}0c 0%,transparent 100%)`">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${sections[2].color}1a`">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${sections[2].color}`">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="sections[2].iconPath"/>
                    </svg>
                  </div>
                  <h2 class="font-bold text-white text-sm">{{ sections[2].label }}</h2>
                </div>
                <div class="p-6 space-y-5">
                  <FursonaSettings ref="fursonaRef" @dirty="fursonaIsDirty = $event" />
                  <FursuitSettings />
                </div>
              </section>

              <!-- ── § 4: APPEARANCE ─────────────────────────────────── -->

              <!-- ── Section 4: Profile style ──────────────────────── -->
              <section v-show="openSection === sections[3].id" :id="sections[3].id" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                  :style="`background:linear-gradient(90deg,${sections[3].color}0c 0%,transparent 100%)`">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${sections[3].color}1a`">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${sections[3].color}`">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="sections[3].iconPath"/>
                    </svg>
                  </div>
                  <div>
                    <h2 class="font-bold text-white text-sm">{{ sections[3].label }}</h2>
                  </div>
                  <!-- Plan badge -->
                  <router-link to="/subscriptions"
                    class="ml-auto text-[9px] font-extrabold uppercase tracking-wider px-2 py-1 rounded-full border transition-all hover:opacity-80"
                    :class="(authStore.user as any)?.subscription_tier === 'pro' || (authStore.user as any)?.subscription_tier === 'business'
                      ? 'text-brand-accent border-brand-accent/30 bg-brand-accent/5'
                      : 'text-amber-400 border-amber-400/30 bg-amber-400/5'">
                    {{ (authStore.user as any)?.subscription_tier === 'free' ? 'Lite+ для тем' : (authStore.user as any)?.subscription_tier?.toUpperCase() }}
                  </router-link>
                </div>

                <div class="p-6 space-y-7">

                  <!-- ── Theme selector (Lite+) ────────────────────────── -->
                  <div>
                    <div class="flex items-center justify-between mb-3">
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider">Тема профиля</label>
                      <span class="text-[10px] text-amber-400 font-bold bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">Lite+</span>
                    </div>
                    <div v-if="['free'].includes((authStore.user as any)?.subscription_tier ?? 'free')"
                      class="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 flex items-center gap-3">
                      <BIcon name="Lock" class="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <p class="text-xs text-white/55">Темы профиля доступны с подпиской <router-link to="/subscriptions" class="text-amber-400 hover:underline font-bold">Lite</router-link>.</p>
                    </div>
                    <div v-else class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <button v-for="(theme, id) in PROFILE_THEMES" :key="id" type="button"
                        @click="form.profile_theme = id"
                        class="relative rounded-2xl p-3 border-2 transition-all text-left overflow-hidden"
                        :class="form.profile_theme === id
                          ? 'border-brand-accent shadow-lg shadow-brand-accent/20'
                          : 'border-brand-border hover:border-white/20'"
                        :style="`background:${theme.bg}`">
                        <!-- Accent dot -->
                        <div class="w-5 h-5 rounded-full mb-2 border-2 border-white/10"
                          :style="`background:${theme.accent}`" />
                        <p class="text-xs font-bold text-white">{{ theme.label }}</p>
                        <!-- Checkmark -->
                        <div v-if="form.profile_theme === id"
                          class="absolute top-2 right-2 w-5 h-5 rounded-full bg-brand-accent flex items-center justify-center">
                          <BIcon name="Check" class="w-3 h-3 text-white" />
                        </div>
                      </button>
                    </div>
                  </div>

                  <!-- ── Avatar frame (Pro+) ────────────────────────────── -->
                  <div>
                    <div class="flex items-center justify-between mb-3">
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider">Рамка аватара</label>
                      <span class="text-[10px] text-brand-accent font-bold bg-brand-accent/10 px-2 py-0.5 rounded-full border border-brand-accent/20">Pro+</span>
                    </div>
                    <div v-if="!['pro', 'business'].includes((authStore.user as any)?.subscription_tier ?? 'free')"
                      class="rounded-2xl border border-brand-accent/20 bg-brand-accent/5 px-4 py-3 flex items-center gap-3">
                      <BIcon name="Lock" class="w-4 h-4 text-brand-accent flex-shrink-0" />
                      <p class="text-xs text-white/55">Рамки аватара доступны с подпиской <router-link to="/subscriptions" class="text-brand-accent hover:underline font-bold">Pro</router-link>.</p>
                    </div>
                    <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <button v-for="(frame, id) in PROFILE_FRAMES" :key="id" type="button"
                        @click="form.profile_frame = id"
                        class="relative flex items-center gap-3 rounded-2xl px-4 py-3 border-2 transition-all"
                        :class="form.profile_frame === id
                          ? 'border-brand-accent bg-brand-accent/10'
                          : 'border-brand-border hover:border-white/20 bg-brand-bg'">
                        <!-- Mini avatar preview with frame -->
                        <div class="w-10 h-10 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-sm flex-shrink-0"
                          :class="frame.style || ''">
                          B
                        </div>
                        <span class="text-xs font-bold text-white">{{ frame.label }}</span>
                        <BIcon v-if="form.profile_frame === id" name="Check" class="w-4 h-4 text-brand-accent ml-auto flex-shrink-0" />
                      </button>
                    </div>
                  </div>

                  <!-- ── Custom background (Pro+) ──────────────────────── -->
                  <div>
                    <div class="flex items-center justify-between mb-3">
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider">Фон профиля (URL)</label>
                      <span class="text-[10px] text-brand-accent font-bold bg-brand-accent/10 px-2 py-0.5 rounded-full border border-brand-accent/20">Pro+</span>
                    </div>
                    <div v-if="!['pro', 'business'].includes((authStore.user as any)?.subscription_tier ?? 'free')"
                      class="rounded-2xl border border-brand-accent/20 bg-brand-accent/5 px-4 py-3 flex items-center gap-3">
                      <BIcon name="Lock" class="w-4 h-4 text-brand-accent flex-shrink-0" />
                      <p class="text-xs text-white/55">Кастомный фон доступен с <router-link to="/subscriptions" class="text-brand-accent hover:underline font-bold">Pro</router-link>.</p>
                    </div>
                    <div v-else>
                      <input ref="bgFileRef" type="file" accept="image/*" class="hidden" @change="onBgChange" />
                      <div class="relative rounded-2xl overflow-hidden border border-brand-border h-32 bg-brand-bg cursor-pointer group"
                        @click="bgFileRef?.click()">
                        <img v-if="form.profile_bg_url" :src="form.profile_bg_url" class="w-full h-full object-cover" @error="form.profile_bg_url = ''" />
                        <div class="absolute inset-0 flex items-center justify-center gap-2"
                          :class="form.profile_bg_url ? 'bg-black/55 opacity-0 group-hover:opacity-100 transition-all' : 'bg-white/5'">
                          <span v-if="uploadingBg" class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <svg v-else class="w-5 h-5 text-white/55" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                          <span class="text-white/55 text-sm font-bold">{{ form.profile_bg_url ? 'Изменить фон' : 'Загрузить фон' }}</span>
                        </div>
                        <div v-if="form.profile_bg_url" class="absolute inset-0 bg-black/40 flex items-end p-3 pointer-events-none opacity-0 group-hover:opacity-0">
                        </div>
                        <button v-if="form.profile_bg_url" type="button" @click.stop="form.profile_bg_url = ''"
                          class="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white/80 opacity-0 group-hover:opacity-100 transition-all">
                          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              </section>

              <!-- ── § 5: VERIFICATION ──────────────────────────────── -->
              <section v-show="openSection === sections[4].id" :id="sections[4].id" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                  :style="`background:linear-gradient(90deg,${sections[4].color}0c 0%,transparent 100%)`">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${sections[4].color}1a`">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${sections[4].color}`">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="sections[4].iconPath"/>
                    </svg>
                  </div>
                  <div>
                    <h2 class="font-bold text-white text-sm">{{ sections[4].label }}</h2>
                    <p class="text-[10px] text-white/40">Честная верификация — подтвердите свою деятельность</p>
                  </div>
                </div>

                <div class="p-6 space-y-6">

                  <!-- Loading state -->
                  <div v-if="isLoadingVerification" class="flex items-center justify-center py-8">
                    <div class="w-6 h-6 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
                  </div>

                  <template v-else>
                    <!-- Already verified -->
                    <div v-if="verificationStatus?.isVerified" class="text-center py-6">
                      <div class="w-16 h-16 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                        </svg>
                      </div>
                      <h3 class="text-lg font-bold text-white mb-1">Аккаунт верифицирован</h3>
                      <p class="text-sm text-white/55">Подтверждено {{ verificationStatus.verifiedAt ? new Date(verificationStatus.verifiedAt).toLocaleDateString('ru-RU') : '' }}</p>
                      <div v-if="verificationStatus.verificationType" class="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold"
                        :class="{
                          'bg-purple-500/10 border border-purple-500/20 text-purple-400': verificationStatus.verificationType === 'artist',
                          'bg-amber-500/10 border border-amber-500/20 text-amber-400': verificationStatus.verificationType === 'master',
                          'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400': verificationStatus.verificationType === 'event',
                        }">
                        <img :src="`/icons/badges/${verificationStatus.verificationType}.svg`" class="w-4 h-4" />
                        {{ { artist: 'Художник', master: 'Мастер', event: 'Мероприятие' }[verificationStatus.verificationType as string] }}
                      </div>
                      <div class="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                        Донаты доступны
                      </div>
                    </div>

                    <!-- Pending request -->
                    <div v-else-if="verificationStatus?.latestRequest?.status === 'pending'" class="text-center py-6">
                      <div class="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center mx-auto mb-4">
                        <svg class="w-8 h-8 text-amber-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                      </div>
                      <h3 class="text-lg font-bold text-white mb-1">Заявка на рассмотрении</h3>
                      <p class="text-sm text-white/55">Модераторы вручную проверяют вашу заявку. Обычно это занимает 1-3 дня.</p>
                      <p class="text-xs text-white/40 mt-2">Отправлено {{ new Date(verificationStatus.latestRequest.created_at).toLocaleDateString('ru-RU') }}</p>
                      <div v-if="verificationStatus.latestRequest.verification_type" class="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold">
                        {{ { artist: 'Художник', master: 'Мастер', event: 'Мероприятие' }[verificationStatus.latestRequest.verification_type as string] }}
                      </div>
                    </div>

                    <!-- Rejected request -->
                    <div v-else-if="verificationStatus?.latestRequest?.status === 'rejected'" class="space-y-4">
                      <div class="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3">
                        <svg class="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"/>
                        </svg>
                        <div>
                          <p class="text-sm font-bold text-rose-400">Заявка отклонена</p>
                          <p v-if="verificationStatus.latestRequest.reason" class="text-xs text-white/55 mt-1">{{ verificationStatus.latestRequest.reason }}</p>
                          <p class="text-xs text-white/40 mt-1">Вы можете исправить замечания и подать заявку повторно.</p>
                        </div>
                      </div>
                    </div>

                    <!-- Show form (not verified, no pending request or has rejected) -->
                    <template v-if="!verificationStatus?.isVerified && verificationStatus?.latestRequest?.status !== 'pending'">

                      <!-- Profile completeness -->
                      <div>
                        <h3 class="font-bold text-sm text-white mb-3 flex items-center gap-2">
                          <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                          </svg>
                          Заполненность профиля
                          <span class="ml-auto text-xs font-bold"
                            :class="profileCompleteness?.canSubmit ? 'text-emerald-400' : 'text-amber-400'">
                            {{ profileCompleteness?.percentage ?? 0 }}%
                          </span>
                        </h3>
                        <div class="w-full h-3 bg-brand-bg rounded-full overflow-hidden border border-brand-border">
                          <div class="h-full rounded-full transition-all duration-500"
                            :class="profileCompleteness?.canSubmit ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-amber-500 to-amber-400'"
                            :style="`width: ${profileCompleteness?.percentage ?? 0}%`"></div>
                        </div>
                        <div class="grid grid-cols-2 gap-2 mt-3">
                          <div v-for="field in completenessFields" :key="field.key"
                            class="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs"
                            :class="field.met ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-brand-bg border-brand-border text-white/40'">
                            <svg v-if="field.met" class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                            <svg v-else class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                            {{ field.label }}
                          </div>
                        </div>
                        <p v-if="!profileCompleteness?.canSubmit" class="text-xs text-amber-400/80 mt-2 flex items-center gap-1.5">
                          <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01"/></svg>
                          Заполните профиль минимум на 80%, чтобы подать заявку
                        </p>
                      </div>

                      <!-- Criteria checklist -->
                      <div>
                        <h3 class="font-bold text-sm text-white mb-3 flex items-center gap-2">
                          <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                          </svg>
                          Критерии верификации
                        </h3>
                        <div class="space-y-2">
                          <div v-for="(cr, i) in verCriteriaList" :key="i"
                            class="flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all"
                            :class="cr.met ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-brand-bg border-brand-border'">
                            <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                              :class="cr.met ? 'bg-emerald-500/20' : 'bg-white/5'">
                              <svg v-if="cr.met" class="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                              </svg>
                              <svg v-else class="w-3.5 h-3.5 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                              </svg>
                            </div>
                            <span class="text-sm font-semibold flex-1" :class="cr.met ? 'text-white' : 'text-white/55'">{{ cr.label }}</span>
                            <span v-if="cr.detail" class="text-xs font-bold" :class="cr.met ? 'text-emerald-400' : 'text-white/40'">{{ cr.detail }}</span>
                          </div>
                        </div>
                      </div>

                      <!-- Verification type selector -->
                      <div>
                        <h3 class="font-bold text-sm text-white mb-3 flex items-center gap-2">
                          <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
                          </svg>
                          Тип верификации
                        </h3>
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <!-- Artist -->
                          <button type="button" @click="selectedVerType = 'artist'"
                            class="relative p-4 rounded-2xl border-2 transition-all text-left group"
                            :class="selectedVerType === 'artist' ? 'border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/10' : 'border-brand-border bg-brand-bg hover:border-purple-500/40'">
                            <div class="flex items-center gap-2 mb-2">
                              <img src="/icons/badges/artist.svg" class="w-6 h-6" />
                              <span class="font-bold text-sm" :class="selectedVerType === 'artist' ? 'text-purple-400' : 'text-white'">Художник</span>
                            </div>
                            <p class="text-[11px] text-white/50 leading-relaxed">Скриншот слоёв или видео процесса рисования</p>
                            <div v-if="selectedVerType === 'artist'" class="absolute top-2 right-2 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                              <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                            </div>
                          </button>
                          <!-- Master -->
                          <button type="button" @click="selectedVerType = 'master'"
                            class="relative p-4 rounded-2xl border-2 transition-all text-left group"
                            :class="selectedVerType === 'master' ? 'border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10' : 'border-brand-border bg-brand-bg hover:border-amber-500/40'">
                            <div class="flex items-center gap-2 mb-2">
                              <img src="/icons/badges/master.svg" class="w-6 h-6" />
                              <span class="font-bold text-sm" :class="selectedVerType === 'master' ? 'text-amber-400' : 'text-white'">Мастер</span>
                            </div>
                            <p class="text-[11px] text-white/50 leading-relaxed">Фото работы с сигной: «Bloomly», дата, ваш ID</p>
                            <div v-if="selectedVerType === 'master'" class="absolute top-2 right-2 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                              <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                            </div>
                          </button>
                          <!-- Event -->
                          <button type="button" @click="selectedVerType = 'event'"
                            class="relative p-4 rounded-2xl border-2 transition-all text-left group"
                            :class="selectedVerType === 'event' ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10' : 'border-brand-border bg-brand-bg hover:border-emerald-500/40'">
                            <div class="flex items-center gap-2 mb-2">
                              <img src="/icons/badges/event.svg" class="w-6 h-6" />
                              <span class="font-bold text-sm" :class="selectedVerType === 'event' ? 'text-emerald-400' : 'text-white'">Мероприятие</span>
                            </div>
                            <p class="text-[11px] text-white/50 leading-relaxed">Фото билета или селфи на месте мероприятия</p>
                            <div v-if="selectedVerType === 'event'" class="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                              <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                            </div>
                          </button>
                        </div>
                      </div>

                      <!-- Evidence upload -->
                      <div v-if="selectedVerType">
                        <h3 class="font-bold text-sm text-white mb-3 flex items-center gap-2">
                          <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                          </svg>
                          Доказательства
                          <span class="text-[10px] text-white/40 font-normal ml-1">{{ evidenceUrls.length }}/5</span>
                        </h3>

                        <!-- Evidence description per type -->
                        <div class="bg-blue-500/5 border border-blue-500/15 rounded-2xl px-4 py-3 mb-3">
                          <p class="text-xs text-white/55">
                            <span class="text-blue-400 font-bold">Требования:</span>
                            <span v-if="selectedVerType === 'artist'"> Загрузите скриншот с видимыми слоями проекта или ссылку на видео процесса рисования. Это докажет, что работа создана вами, а не ИИ.</span>
                            <span v-else-if="selectedVerType === 'master'"> Загрузите фото вашей работы рядом с бумажкой, на которой написано «Bloomly», текущая дата и ваш ID ({{ authStore.user?.id?.slice(0,8) }}).</span>
                            <span v-else-if="selectedVerType === 'event'"> Загрузите фото билета/бейджа мероприятия или селфи на локации мероприятия.</span>
                          </p>
                        </div>

                        <!-- Uploaded evidence preview -->
                        <div v-if="evidenceUrls.length > 0" class="grid grid-cols-3 gap-2 mb-3">
                          <div v-for="(url, idx) in evidenceUrls" :key="idx" class="relative group rounded-xl overflow-hidden border border-brand-border aspect-square">
                            <img :src="url" class="w-full h-full object-cover" />
                            <button type="button" @click="evidenceUrls.splice(idx, 1)"
                              class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                          </div>
                        </div>

                        <!-- Upload button -->
                        <button v-if="evidenceUrls.length < 5" type="button" @click="evidenceInput?.click()"
                          :disabled="isUploadingEvidence"
                          class="w-full py-3 rounded-2xl border-2 border-dashed border-brand-border hover:border-blue-500/40 bg-brand-bg text-sm text-white/55 hover:text-white transition-all flex items-center justify-center gap-2">
                          <span v-if="isUploadingEvidence" class="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
                          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
                          {{ isUploadingEvidence ? 'Загрузка…' : 'Загрузить файл' }}
                        </button>
                        <input ref="evidenceInput" type="file" accept="image/*,video/*" class="hidden" @change="onEvidenceUpload" />
                      </div>

                      <!-- Anti-AI notice -->
                      <div class="bg-rose-500/5 border border-rose-500/15 rounded-2xl px-4 py-3">
                        <p class="text-xs text-white/55">
                          <span class="text-rose-400 font-bold">Важно:</span>
                          Все заявки проверяются модераторами вручную. Автоматическая верификация отсутствует. Использование AI-генераций в качестве доказательств запрещено и приведёт к отклонению заявки.
                        </p>
                      </div>

                      <!-- Submit button -->
                      <button type="button" @click="requestVerification"
                        :disabled="isRequestingVerification || !selectedVerType || evidenceUrls.length === 0 || !profileCompleteness?.canSubmit"
                        class="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        style="background: linear-gradient(135deg, #3b82f6, #2563eb); box-shadow: 0 4px 20px rgba(59,130,246,0.35)">
                        <span v-if="isRequestingVerification" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                        </svg>
                        {{ isRequestingVerification ? 'Отправка…' : !profileCompleteness?.canSubmit ? 'Заполните профиль (≥80%)' : !selectedVerType ? 'Выберите тип верификации' : evidenceUrls.length === 0 ? 'Загрузите доказательства' : 'Отправить на верификацию' }}
                      </button>
                    </template>
                  </template>

                </div>
              </section>

              <!-- ── § LANG: Язык интерфейса ───────────────────────── -->
              <section v-show="openSection === 'sec-lang'" id="sec-lang" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3" style="background:linear-gradient(90deg,rgba(245,158,11,0.07) 0%,transparent 100%)">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(245,158,11,0.18)">
                    <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
                    </svg>
                  </div>
                  <div>
                    <h2 class="font-bold text-white text-sm">{{ langStore.t.interfaceLanguage }}</h2>
                    <p class="text-xs text-white/40 mt-0.5">{{ langStore.t.chooseLanguage }}</p>
                  </div>
                </div>
                <div class="p-6">
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <button
                      v-for="opt in langOptions" :key="opt.code"
                      @click="langStore.setLang(opt.code)"
                      class="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all"
                      :class="langStore.currentLang === opt.code
                        ? 'border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-400/10'
                        : 'border-brand-border bg-brand-bg/40 hover:border-amber-400/40 hover:bg-amber-400/5'">
                      <span class="text-3xl leading-none">{{ opt.flag }}</span>
                      <span class="text-sm font-bold" :class="langStore.currentLang === opt.code ? 'text-amber-400' : 'text-white/70'">{{ opt.name }}</span>
                      <div v-if="langStore.currentLang === opt.code" class="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center">
                        <BIcon name="Check" class="w-3 h-3 text-black" />
                      </div>
                      <div v-else class="w-5 h-5 rounded-full border-2 border-brand-border"></div>
                    </button>
                  </div>
                </div>

                <!-- ── Автоперевод ── -->
                <div class="px-6 pb-6">
                  <div class="rounded-2xl border border-brand-border bg-brand-bg/40 overflow-hidden">
                    <!-- Toggle row -->
                    <div class="flex items-center justify-between p-4">
                      <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(245,158,11,0.12)">
                          <svg class="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
                          </svg>
                        </div>
                        <div>
                          <p class="text-sm font-semibold text-white">{{ langStore.t.autoTranslateSection }}</p>
                          <p class="text-xs text-white/40 mt-0.5">{{ langStore.t.autoTranslateDesc }}</p>
                        </div>
                      </div>
                      <!-- Toggle switch -->
                      <button
                        @click="langStore.setAutoTranslate(!langStore.autoTranslateEnabled)"
                        class="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200"
                        :class="langStore.autoTranslateEnabled ? 'bg-amber-400' : 'bg-white/15'"
                      >
                        <span
                          class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200"
                          :class="langStore.autoTranslateEnabled ? 'left-[22px]' : 'left-0.5'"
                        />
                      </button>
                    </div>

                    <!-- Target language selector (shown only when enabled) -->
                    <Transition name="slide-down">
                      <div v-if="langStore.autoTranslateEnabled" class="px-4 pb-4 border-t border-brand-border pt-3">
                        <p class="text-xs text-white/40 mb-3">{{ langStore.t.autoTranslateTarget }}</p>
                        <div class="grid grid-cols-4 sm:grid-cols-8 gap-2">
                          <button
                            v-for="opt in langOptions" :key="opt.code"
                            @click="langStore.setAutoTranslateLang(opt.code)"
                            class="flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all"
                            :class="langStore.autoTranslateLang === opt.code
                              ? 'border-amber-400 bg-amber-400/10'
                              : 'border-brand-border bg-brand-bg/40 hover:border-amber-400/30'"
                          >
                            <span class="text-xl leading-none">{{ opt.flag }}</span>
                            <span class="text-[11px] font-bold" :class="langStore.autoTranslateLang === opt.code ? 'text-amber-400' : 'text-white/50'">{{ opt.code }}</span>
                          </button>
                        </div>
                      </div>
                    </Transition>
                  </div>
                </div>
              </section>

              <!-- ── § 6: БЕЗОПАСНОСТЬ / Способы входа ─────────────── -->
              <section v-show="openSection === 'sec-security'" id="sec-security" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3" style="background:linear-gradient(90deg,rgba(16,185,129,0.07) 0%,transparent 100%)">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(16,185,129,0.15)">
                    <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                    </svg>
                  </div>
                  <h2 class="font-bold text-white text-sm">Безопасность и способы входа</h2>
                </div>
                <div class="p-6 space-y-3">
                  <!-- Email/пароль -->
                  <div class="flex items-center justify-between p-4 rounded-2xl border border-brand-border bg-brand-bg/60">
                    <div class="flex items-center gap-3">
                      <div class="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                        <svg class="w-4.5 h-4.5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                        </svg>
                      </div>
                      <div>
                        <p class="text-sm font-semibold text-white">Email и пароль</p>
                        <p class="text-xs text-white/45">{{ authStore.user?.email }}</p>
                      </div>
                    </div>
                    <span class="px-2.5 py-1 rounded-lg text-xs font-bold" style="background:rgba(16,185,129,0.15);color:#34d399">Активен</span>
                  </div>

                  <!-- OAuth провайдеры -->
                  <div v-if="linkedAccountsLoading" class="flex justify-center py-6">
                    <span class="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></span>
                  </div>
                  <template v-else>
                    <div
                      v-for="p in oauthProviders"
                      :key="p.key"
                      class="flex items-center justify-between p-4 rounded-2xl border transition-all"
                      :class="linkedAccounts.includes(p.key) ? 'border-brand-border bg-brand-bg/60' : 'border-brand-border/50 bg-brand-bg/30'"
                    >
                      <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${p.color}22`">
                          <svg class="w-5 h-5" :fill="p.iconFill ? p.color : 'none'" :stroke="p.iconFill ? 'none' : p.color" :stroke-width="p.iconFill ? '0' : '1.8'" viewBox="0 0 24 24">
                            <path :d="p.iconPath" />
                          </svg>
                        </div>
                        <div>
                          <p class="text-sm font-semibold text-white">{{ p.label }}</p>
                          <p class="text-xs text-white/45">{{ linkedAccounts.includes(p.key) ? 'Привязан' : 'Не привязан' }}</p>
                        </div>
                      </div>
                      <button
                        v-if="!linkedAccounts.includes(p.key)"
                        @click="linkProvider(p.key)"
                        :disabled="linkingProvider === p.key"
                        class="px-4 py-1.5 rounded-xl text-xs font-bold text-white border border-brand-border hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all disabled:opacity-50"
                      >
                        <span v-if="linkingProvider === p.key" class="flex items-center gap-1.5">
                          <span class="w-3 h-3 border border-t-transparent border-white rounded-full animate-spin"></span>Подключение…
                        </span>
                        <span v-else>Привязать</span>
                      </button>
                      <button
                        v-else
                        @click="unlinkProvider(p.key)"
                        :disabled="unlinkingProvider === p.key"
                        class="px-4 py-1.5 rounded-xl text-xs font-bold text-red-400 border border-red-500/20 hover:border-red-500/50 bg-red-500/5 hover:bg-red-500/10 transition-all disabled:opacity-50"
                      >
                        <span v-if="unlinkingProvider === p.key" class="flex items-center gap-1.5">
                          <span class="w-3 h-3 border border-t-transparent border-red-400 rounded-full animate-spin"></span>
                        </span>
                        <span v-else>Отвязать</span>
                      </button>
                    </div>
                  </template>
                </div>
              </section>

              <!-- ── § 7: DANGER ZONE ────────────────────────────────── -->
              <section v-show="openSection === 'sec-danger'" id="sec-danger" class="bg-brand-card border border-red-500/30 rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                <div class="px-6 py-4 border-b border-red-500/20 flex items-center gap-3" style="background:linear-gradient(90deg,rgba(239,68,68,0.07) 0%,transparent 100%)">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(239,68,68,0.15)">
                    <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                  </div>
                  <h2 class="font-bold text-white text-sm">Аккаунт</h2>
                </div>
                <div class="p-6 space-y-4">
                  <div class="p-4 rounded-2xl border border-red-500/25 bg-red-500/5">
                    <h3 class="text-sm font-bold text-red-400 mb-1">Удалить аккаунт</h3>
                    <p class="text-xs text-white/50 mb-4">Все данные, посты, сообщения и подписки будут безвозвратно удалены. Это действие нельзя отменить.</p>
                    <button type="button" @click="showDeleteModal = true"
                      class="px-5 py-2.5 rounded-2xl text-sm font-bold text-white bg-red-500/20 hover:bg-red-500/35 border border-red-500/40 hover:border-red-500/70 transition-all">
                      Удалить мой аккаунт
                    </button>
                  </div>
                </div>
              </section>

              <!-- ── Submit (mobile / tablet) ───────────────────────── -->
              <div class="flex items-center justify-between gap-4 pt-2 xl:hidden">
                <router-link :to="`/profile/${authStore.user?.username}`"
                  class="px-6 py-3 bg-brand-card border border-brand-border hover:border-brand-muted/40 text-white/55 hover:text-white rounded-2xl text-sm font-bold transition-all">
                  Отмена
                </router-link>
                <button type="submit" :disabled="userStore.isLoading"
                  class="flex-1 max-w-xs py-3 text-sm font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2 rounded-2xl disabled:opacity-50"
                  :style="`background:${form.accent_color};box-shadow:0 4px 24px ${form.accent_color}44`">
                  <span v-if="userStore.isLoading" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  {{ userStore.isLoading ? 'Сохранение…' : 'Сохранить профиль' }}
                </button>
              </div>

            </form>
          </div>
          <!-- end form column -->

        </div>
      </main>
    </div>
  </div>

  <!-- ── Delete Account Modal ─────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="showDeleteModal" class="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" @click.self="showDeleteModal = false">
        <div class="bg-brand-card border border-red-500/40 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
          <div class="px-6 py-4 border-b border-red-500/20 flex items-center gap-3" style="background:linear-gradient(90deg,rgba(239,68,68,0.1) 0%,transparent 100%)">
            <div class="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h3 class="font-bold text-white text-sm">Удаление аккаунта</h3>
          </div>
          <div class="p-6 space-y-4">
            <p class="text-sm text-white/70">Это действие <strong class="text-red-400">необратимо</strong>. Все твои данные, посты, сообщения и подписки будут удалены навсегда.</p>
            <div>
              <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2">Для подтверждения введи слово <span class="text-red-400 font-black">УДАЛИТЬ</span></label>
              <input v-model="deleteConfirmText" type="text" placeholder="УДАЛИТЬ"
                class="w-full bg-brand-bg border border-red-500/30 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-none focus:border-red-500/60 transition-all"
                @keydown.enter="handleDeleteAccount" />
            </div>
            <div class="flex gap-3 pt-1">
              <button type="button" @click="showDeleteModal = false; deleteConfirmText = ''"
                class="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white/55 hover:text-white bg-brand-bg border border-brand-border hover:border-white/20 transition-all">
                Отмена
              </button>
              <button type="button" @click="handleDeleteAccount" :disabled="deleteConfirmText !== 'УДАЛИТЬ' || isDeletingAccount"
                class="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style="background:rgba(239,68,68,0.8)" :class="deleteConfirmText === 'УДАЛИТЬ' ? 'hover:bg-red-600' : ''">
                <span v-if="isDeletingAccount" class="flex items-center justify-center gap-2">
                  <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>Удаление…
                </span>
                <span v-else>Удалить навсегда</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import FursonaSettings from '@/components/profile/FursonaSettings.vue'
import FursuitSettings from '@/components/profile/FursuitSettings.vue'
import api from '@/api'
import { PROFILE_THEMES, PROFILE_FRAMES } from '@/lib/utils'

const userStore  = useUserStore()
const authStore  = useAuthStore()
const langStore  = useLangStore()
const route      = useRoute()
const router     = useRouter()

const langOptions = [
  { code: 'RU' as const, flag: '🇷🇺', name: 'Русский' },
  { code: 'EN' as const, flag: '🇺🇸', name: 'English' },
  { code: 'JP' as const, flag: '🇯🇵', name: '日本語' },
  { code: 'CN' as const, flag: '🇨🇳', name: '中文' },
  { code: 'DE' as const, flag: '🇩🇪', name: 'Deutsch' },
  { code: 'FR' as const, flag: '🇫🇷', name: 'Français' },
  { code: 'ES' as const, flag: '🇪🇸', name: 'Español' },
  { code: 'PT' as const, flag: '🇧🇷', name: 'Português' },
]

// ── Delete account modal ─────────────────────────────────────────────────────
const showDeleteModal    = ref(false)
const deleteConfirmText  = ref('')
const isDeletingAccount  = ref(false)

async function handleDeleteAccount() {
  if (deleteConfirmText.value !== 'УДАЛИТЬ') return
  isDeletingAccount.value = true
  try {
    await api.delete('/users/me/account')
    await authStore.logout()
    router.replace({ name: 'login' })
  } catch (e: any) {
    showToast('error', e.response?.data?.error?.message ?? 'Ошибка удаления')
  } finally {
    isDeletingAccount.value = false
    showDeleteModal.value = false
    deleteConfirmText.value = ''
  }
}

// ── Toast ──────────────────────────────────────────────────────────────────
const toast = reactive({ show: false, type: 'success' as 'success' | 'error', message: '' })
let toastTimer = 0
function showToast(type: 'success' | 'error', message: string) {
  clearTimeout(toastTimer)
  Object.assign(toast, { show: true, type, message })
  toastTimer = window.setTimeout(() => { toast.show = false }, 3500)
}

// ── Linked OAuth accounts ──────────────────────────────────────────────────
const linkedAccounts        = ref<string[]>([])
const linkedAccountsLoading = ref(false)
const linkingProvider       = ref<string | null>(null)
const unlinkingProvider     = ref<string | null>(null)

const oauthProviders = [
  {
    key: 'yandex', label: 'Яндекс', color: '#fc3f1d', iconFill: true,
    iconPath: 'M14.155 4H12.25c-2.77 0-4.455 1.514-4.455 4.006 0 2.148 1.022 3.395 3.074 4.7L13 13.945 8.5 20H11l4.795-6.64-1.396-.894c-1.713-1.1-2.487-1.934-2.487-3.558C11.912 7.48 12.804 6.5 14.155 6.5V4zM14.5 4v16h2.5V4h-2.5z',
  },
  {
    key: 'google', label: 'Google', color: '#4285f4', iconFill: true,
    iconPath: 'M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 110-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0012.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z',
  },
  {
    key: 'twitter', label: 'X (Twitter)', color: '#ffffff', iconFill: true,
    iconPath: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L2.25 2.25h6.918l4.259 5.63 4.817-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    key: 'twitch', label: 'Twitch', color: '#9146ff', iconFill: true,
    iconPath: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z',
  },
]

async function loadLinkedAccounts() {
  linkedAccountsLoading.value = true
  try {
    const { data } = await api.get('/auth/linked-accounts')
    linkedAccounts.value = data.data.accounts.map((a: { provider: string }) => a.provider)
  } catch { /* ignore */ } finally {
    linkedAccountsLoading.value = false
  }
}

async function linkProvider(provider: string) {
  linkingProvider.value = provider
  try {
    const { data } = await api.get(`/auth/link-init/${provider}`)
    window.location.href = data.data.url
  } catch (e: any) {
    showToast('error', e.response?.data?.error?.message ?? 'Ошибка привязки')
    linkingProvider.value = null
  }
}

async function unlinkProvider(provider: string) {
  unlinkingProvider.value = provider
  try {
    await api.delete(`/auth/linked-accounts/${provider}`)
    linkedAccounts.value = linkedAccounts.value.filter(p => p !== provider)
    showToast('success', 'Аккаунт отвязан')
  } catch (e: any) {
    showToast('error', e.response?.data?.error?.message ?? 'Ошибка отвязки')
  } finally {
    unlinkingProvider.value = null
  }
}

// ── Tag inputs ──────────────────────────────────────────────────────────────
const newLike    = ref('')
const newDislike = ref('')

// ── Media file refs + drag state ───────────────────────────────────────────
const avatarFileRef       = ref<HTMLInputElement | null>(null)
const bannerFileRef       = ref<HTMLInputElement | null>(null)
const fursonaPhotoRef     = ref<HTMLInputElement | null>(null)
const avatarDragOver      = ref(false)
const bannerDragOver      = ref(false)
const uploadingFursonaPhoto = ref(false)

// ── Original source data-URLs (always the pre-crop file) ──────────────────
// Stored the moment a file is picked from disk or dropped — never replaced by
// the cropped/uploaded result, so re-cropping always starts from the original.
const avatarOriginalSrc = ref<string>('')
const bannerOriginalSrc = ref<string>('')

// ── Shake / unsaved warning state ──────────────────────────────────────────
const shaking        = ref(false)
const unsavedWarning = ref(false)

// ── Form ───────────────────────────────────────────────────────────────────
const form = reactive({
  display_name:        '',
  bio:                 '',
  status:              '',
  persona:             '',
  fursona_name:        '',
  avatar_url:          '',
  banner_url:          '',
  accent_color:        '#4C97CF',
  website:             '',
  location:            '',
  pronouns:            '',
  job_title:           '',
  relationship_status: '',
  relationship_with:   '',
  country:             '',
  fursona_color:       '',
  fursona_photo_url:   '',
  has_fursuit:         false,
  fursuit_photo_url:   '' as string,
  fursuit_description: '' as string,
  fursuit_maker:       '' as string,
  birth_date:          '',
  likes:               [] as string[],
  dislikes:            [] as string[],
  profile_theme:       '' as string,
  profile_bg_url:      '' as string,
  profile_frame:       '' as string,
  social_links:        {} as Record<string, string>,
})

// ── Saved snapshot ─────────────────────────────────────────────────────────
const savedForm = reactive({
  display_name:        '',
  bio:                 '',
  status:              '',
  persona:             '',
  fursona_name:        '',
  avatar_url:          '',
  banner_url:          '',
  accent_color:        '#4C97CF',
  website:             '',
  location:            '',
  pronouns:            '',
  job_title:           '',
  relationship_status: '',
  relationship_with:   '',
  country:             '',
  fursona_color:       '',
  fursona_photo_url:   '',
  has_fursuit:         false,
  fursuit_photo_url:   '' as string,
  fursuit_description: '' as string,
  fursuit_maker:       '' as string,
  birth_date:          '',
  likes:               [] as string[],
  dislikes:            [] as string[],
  profile_theme:       '' as string,
  profile_bg_url:      '' as string,
  profile_frame:       '' as string,
  social_links:        {} as Record<string, string>,
})

function snapshotToSaved() {
  savedForm.display_name        = form.display_name
  savedForm.bio                 = form.bio
  savedForm.status              = form.status
  savedForm.persona             = form.persona
  savedForm.fursona_name        = form.fursona_name
  savedForm.avatar_url          = form.avatar_url
  savedForm.banner_url          = form.banner_url
  savedForm.accent_color        = form.accent_color
  savedForm.website             = form.website
  savedForm.location            = form.location
  savedForm.pronouns            = form.pronouns
  savedForm.job_title           = form.job_title
  savedForm.relationship_status = form.relationship_status
  savedForm.relationship_with   = form.relationship_with
  savedForm.country             = form.country
  savedForm.fursona_color       = form.fursona_color
  savedForm.fursona_photo_url   = form.fursona_photo_url
  savedForm.has_fursuit         = form.has_fursuit
  savedForm.fursuit_photo_url   = form.fursuit_photo_url
  savedForm.fursuit_description = form.fursuit_description
  savedForm.fursuit_maker       = form.fursuit_maker
  savedForm.birth_date          = form.birth_date
  savedForm.likes               = [...form.likes]
  savedForm.dislikes            = [...form.dislikes]
  savedForm.profile_theme       = form.profile_theme
  savedForm.profile_bg_url      = form.profile_bg_url
  savedForm.profile_frame       = form.profile_frame
  savedForm.social_links        = { ...form.social_links }
}

function resetForm() {
  form.display_name        = savedForm.display_name
  form.bio                 = savedForm.bio
  form.status              = savedForm.status
  form.persona             = savedForm.persona
  form.fursona_name        = savedForm.fursona_name
  form.avatar_url          = savedForm.avatar_url
  form.banner_url          = savedForm.banner_url
  form.accent_color        = savedForm.accent_color
  form.website             = savedForm.website
  form.location            = savedForm.location
  form.pronouns            = savedForm.pronouns
  form.job_title           = savedForm.job_title
  form.relationship_status = savedForm.relationship_status
  form.relationship_with   = savedForm.relationship_with
  form.country             = savedForm.country
  form.fursona_color       = savedForm.fursona_color
  form.fursona_photo_url   = savedForm.fursona_photo_url
  form.has_fursuit         = savedForm.has_fursuit
  form.fursuit_photo_url   = savedForm.fursuit_photo_url
  form.fursuit_description = savedForm.fursuit_description
  form.fursuit_maker       = savedForm.fursuit_maker
  form.birth_date          = savedForm.birth_date
  form.likes               = [...savedForm.likes]
  form.dislikes            = [...savedForm.dislikes]
  form.profile_theme       = savedForm.profile_theme
  form.profile_bg_url      = savedForm.profile_bg_url
  form.profile_frame       = savedForm.profile_frame
  form.social_links        = { ...savedForm.social_links }
  // Clear originals so re-crop picks up the reverted server images
  avatarOriginalSrc.value = ''
  bannerOriginalSrc.value = ''
}

// ── isDirty ────────────────────────────────────────────────────────────────
const fursonaIsDirty = ref(false)
const fursonaRef     = ref<{ save: () => Promise<void> } | null>(null)

const isDirty = computed(() => {
  const fieldsChanged = (
    form.display_name        !== savedForm.display_name ||
    form.bio                 !== savedForm.bio ||
    form.status              !== savedForm.status ||
    form.persona             !== savedForm.persona ||
    form.fursona_name        !== savedForm.fursona_name ||
    form.avatar_url          !== savedForm.avatar_url ||
    form.banner_url          !== savedForm.banner_url ||
    form.accent_color        !== savedForm.accent_color ||
    form.website             !== savedForm.website ||
    form.location            !== savedForm.location ||
    form.pronouns            !== savedForm.pronouns ||
    form.job_title           !== savedForm.job_title ||
    form.relationship_status !== savedForm.relationship_status ||
    form.relationship_with   !== savedForm.relationship_with ||
    form.country             !== savedForm.country ||
    form.fursona_color       !== savedForm.fursona_color ||
    form.fursona_photo_url   !== savedForm.fursona_photo_url ||
    form.has_fursuit         !== savedForm.has_fursuit ||
    form.fursuit_photo_url   !== savedForm.fursuit_photo_url ||
    form.fursuit_description !== savedForm.fursuit_description ||
    form.fursuit_maker       !== savedForm.fursuit_maker ||
    form.birth_date          !== savedForm.birth_date ||
    form.profile_theme       !== savedForm.profile_theme ||
    form.profile_bg_url      !== savedForm.profile_bg_url ||
    form.profile_frame       !== savedForm.profile_frame
  )
  return fieldsChanged ||
    JSON.stringify(form.likes)         !== JSON.stringify(savedForm.likes) ||
    JSON.stringify(form.dislikes)      !== JSON.stringify(savedForm.dislikes) ||
    JSON.stringify(form.social_links)  !== JSON.stringify(savedForm.social_links) ||
    fursonaIsDirty.value
})

onMounted(async () => {
  await userStore.fetchMyProfile()
  const p = userStore.profile
  if (!p) return
  form.display_name        = p.display_name        ?? ''
  form.bio                 = p.bio                 ?? ''
  form.status              = p.status              ?? ''
  form.persona             = p.persona             ?? ''
  form.fursona_name        = p.fursona_name           ?? ''
  form.avatar_url          = p.avatar_url          ?? ''
  form.banner_url          = p.banner_url          ?? ''
  form.accent_color        = p.accent_color        ?? '#4C97CF'
  form.website             = p.website             ?? ''
  form.location            = p.location            ?? ''
  form.pronouns            = p.pronouns            ?? ''
  form.job_title           = p.job_title           ?? ''
  form.relationship_status = p.relationship_status ?? ''
  form.relationship_with   = p.relationship_with   ?? ''
  form.country             = p.country             ?? ''
  form.fursona_color       = p.fursona_color        ?? ''
  form.fursona_photo_url   = p.fursona_photo_url    ?? ''
  form.has_fursuit         = (p as any).has_fursuit        ?? false
  form.fursuit_photo_url   = (p as any).fursuit_photo_url  ?? ''
  form.fursuit_description = (p as any).fursuit_description ?? ''
  form.fursuit_maker       = (p as any).fursuit_maker      ?? ''
  form.birth_date          = p.birth_date ? p.birth_date.substring(0, 10) : ''
  form.likes               = [...p.likes]
  form.dislikes            = [...p.dislikes]
  form.profile_theme       = (p as any).profile_theme  ?? ''
  form.profile_bg_url      = (p as any).profile_bg_url ?? ''
  form.profile_frame       = (p as any).profile_frame  ?? ''
  form.social_links        = { ...((p as any).social_links ?? {}) }
  snapshotToSaved()
  // Pre-fill combobox search inputs with saved values
  countrySearch.value = form.country
  citySearch.value    = form.location
  // Load following list for partner picker
  loadFollowing()
  // Load verification data
  fetchVerificationData()
  // Navigate to a specific section if ?section= param is present
  const sectionParam = route.query.section as string | undefined
  if (sectionParam) {
    const valid = [...sections.map(s => s.id)]
    if (valid.includes(sectionParam)) {
      openSec(sectionParam)
    }
  }
  // Загружаем привязанные аккаунты
  loadLinkedAccounts()
  // Тосты после OAuth привязки
  const linkedParam = route.query.linked as string | undefined
  const errorParam  = route.query.error  as string | undefined
  if (linkedParam) {
    const providerLabel = oauthProviders.find(p => p.key === linkedParam)?.label ?? linkedParam
    showToast('success', `${providerLabel} успешно привязан!`)
    // убираем парам из URL
    router.replace({ query: { ...route.query, linked: undefined, error: undefined } })
  } else if (errorParam === 'already_taken') {
    showToast('error', 'Этот аккаунт уже привязан к другому пользователю')
    router.replace({ query: { ...route.query, linked: undefined, error: undefined } })
  }
})

// ── Navigation guard ───────────────────────────────────────────────────────
onBeforeRouteLeave((_to, _from, next) => {
  if (!isDirty.value) return next()
  unsavedWarning.value = true
  shaking.value = true
  setTimeout(() => { shaking.value = false }, 600)
  setTimeout(() => { unsavedWarning.value = false }, 3000)
  next(false)
})

// ── Media uploads ──────────────────────────────────────────────────────────
const bgFileRef         = ref<HTMLInputElement | null>(null)
const uploadingBg       = ref(false)

async function onBgChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingBg.value = true
  try {
    const fd = new FormData()
    fd.append('file', file, file.name)
    const res = await api.post('/media/upload?folder=backgrounds', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    form.profile_bg_url = res.data.data.url
    showToast('success', 'Фон профиля загружен!')
  } catch { showToast('error', 'Ошибка загрузки фона') }
  finally { uploadingBg.value = false; if (bgFileRef.value) bgFileRef.value.value = '' }
}

// ── File picking ───────────────────────────────────────────────────────────
const uploadingGifAvatar = ref(false)

async function uploadGifAvatar(file: File) {
  uploadingGifAvatar.value = true
  try {
    const fd = new FormData()
    fd.append('file', file, file.name)
    const result = await api.post('/media/upload?folder=avatars', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    form.avatar_url = result.data.data.url
    showToast('success', '🎥 GIF-аватар загружен!')
  } catch {
    showToast('error', 'Ошибка загрузки GIF')
  } finally {
    uploadingGifAvatar.value = false
    if (avatarFileRef.value) avatarFileRef.value.value = ''
  }
}
function onAvatarFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) {
    if (file.type === 'image/gif') { uploadGifAvatar(file); return }
    openCrop(file, 'avatar')
  }
  if (avatarFileRef.value) avatarFileRef.value.value = ''
}
function onBannerFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) openCrop(file, 'banner')
  if (bannerFileRef.value) bannerFileRef.value.value = ''
}
function onAvatarDrop(e: DragEvent) {
  avatarDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  if (file.type === 'image/gif') { uploadGifAvatar(file); return }
  openCrop(file, 'avatar')
}
function onBannerDrop(e: DragEvent) {
  bannerDragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && file.type.startsWith('image/')) openCrop(file, 'banner')
}

// ── Fursona photo upload ───────────────────────────────────────────────────
async function onFursonaPhotoChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (fursonaPhotoRef.value) fursonaPhotoRef.value.value = ''
  uploadingFursonaPhoto.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post('/media/upload?folder=fursona', fd,
      { headers: { 'Content-Type': 'multipart/form-data' } })
    if (res.data.success && res.data.data?.url) {
      form.fursona_photo_url = res.data.data.url
      showToast('success', 'Фото фурсоны загружено!')
    }
  } catch {
    showToast('error', 'Ошибка загрузки фото')
  } finally {
    uploadingFursonaPhoto.value = false
  }
}

// ── Fursuit photo upload ───────────────────────────────────────────────────
const fursuiPhotoRef        = ref<HTMLInputElement | null>(null)
const uploadingFursuiPhoto  = ref(false)

async function onFursuiPhotoChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (fursuiPhotoRef.value) fursuiPhotoRef.value.value = ''
  uploadingFursuiPhoto.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post('/media/upload?folder=fursuit', fd,
      { headers: { 'Content-Type': 'multipart/form-data' } })
    if (res.data.success && res.data.data?.url) {
      form.fursuit_photo_url = res.data.data.url
      showToast('success', '🐾 Фото фурсьюта загружено!')
    }
  } catch {
    showToast('error', 'Ошибка загрузки фото')
  } finally {
    uploadingFursuiPhoto.value = false
  }
}

// ── Crop modal ─────────────────────────────────────────────────────────────
const CROP_CONTAINER_W = computed(() => Math.min(600, window.innerWidth - 64))
const CROP_CONTAINER_H = computed(() => Math.round(CROP_CONTAINER_W.value * (2 / 3)))

const cropModal = reactive({
  show:     false,
  type:     'avatar' as 'avatar' | 'banner',
  src:      '',
  naturalW: 0,
  naturalH: 0,
  imgX:     0,
  imgY:     0,
  imgW:     0,
  imgH:     0,
  cx: 0,
  cy: 0,
  cw: 0,
  ch: 0,
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
    // Always store the original data URL so re-cropping uses the full source
    if (type === 'avatar') avatarOriginalSrc.value = src
    else                   bannerOriginalSrc.value = src
    cropModal.src  = src
    cropModal.type = type
    cropModal.imgW = 0
    cropModal.show = true
  }
  reader.readAsDataURL(file)
}

/**
 * Re-open the crop modal for an already-selected image.
 * Uses the stored original data URL so we never crop from a cropped result.
 * Falls back to fetching the current URL if no local original exists.
 */
async function reopenCrop(type: 'avatar' | 'banner') {
  const localSrc = type === 'avatar' ? avatarOriginalSrc.value : bannerOriginalSrc.value
  if (localSrc) {
    // Use the original file data URL — no quality loss
    cropModal.src  = localSrc
    cropModal.type = type
    cropModal.imgW = 0
    cropModal.show = true
    return
  }
  // No local original yet — fetch from server (this will be the cropped version,
  // which is unavoidable for images uploaded in a previous session)
  const url = type === 'avatar' ? form.avatar_url : form.banner_url
  if (!url) return
  try {
    const res  = await fetch(url)
    const blob = await res.blob()
    openCrop(new File([blob], 'image.jpg', { type: blob.type }), type)
  } catch {
    cropModal.src  = url
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
  const imageAspect     = cropModal.naturalW / cropModal.naturalH
  let iw: number, ih: number
  if (imageAspect > containerAspect) {
    iw = cw
    ih = cw / imageAspect
  } else {
    ih = ch
    iw = ch * imageAspect
  }
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
  const container = document.getElementById('crop-container')!
  const rect = container.getBoundingClientRect()
  cropModal.resizing = corner
  cropModal.resStart = {
    mx: e.clientX - rect.left,
    my: e.clientY - rect.top,
    cx: cropModal.cx,
    cy: cropModal.cy,
    cw: cropModal.cw,
    ch: cropModal.ch,
  }
}

function onCropMouseMove(e: MouseEvent) {
  if (!cropModal.show || (!cropModal.dragging && !cropModal.resizing)) return
  const container = document.getElementById('crop-container')
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

    // clamp to image bounds
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

// ── Touch support for crop modal ──────────────────────────────────────────
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
  const container = document.getElementById('crop-container')!
  const rect = container.getBoundingClientRect()
  cropModal.resizing = corner
  cropModal.resStart = {
    mx: touch.clientX - rect.left,
    my: touch.clientY - rect.top,
    cx: cropModal.cx,
    cy: cropModal.cy,
    cw: cropModal.cw,
    ch: cropModal.ch,
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
    if (type === 'avatar') {
      canvas.width  = 400
      canvas.height = 400
    } else {
      canvas.width  = 1200
      canvas.height = Math.round(1200 * (srcH / srcW))
    }

    const ctx = canvas.getContext('2d')!
    await new Promise<void>((res, rej) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload  = () => { ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, canvas.width, canvas.height); res() }
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

    if (type === 'avatar') {
      form.avatar_url = result.data.data.url
    } else {
      form.banner_url = result.data.data.url
    }
    cropModal.show = false
    showToast('success', type === 'avatar' ? 'Аватар загружен!' : 'Баннер загружен!')
  } catch (err) {
    console.error(err)
    showToast('error', 'Ошибка загрузки изображения')
  } finally {
    cropUploading.value = false
  }
}

function cancelCrop() {
  cropModal.show = false
}

// ── Tags ───────────────────────────────────────────────────────────────────
function addTagFromInput(field: 'likes' | 'dislikes') {
  const raw = field === 'likes' ? newLike : newDislike
  const val = raw.value.trim()
  if (!val || form[field].includes(val)) return
  form[field].push(val)
  raw.value = ''
}

function removeTag(field: 'likes' | 'dislikes', idx: number) {
  form[field].splice(idx, 1)
}

// ── Submit ─────────────────────────────────────────────────────────────────
async function handleSubmit() {
  // ── Handle relationship partner changes separately ─────────────────────
  const newPartner  = form.relationship_with  || null
  const savedPartner = savedForm.relationship_with || null

  if (newPartner !== savedPartner) {
    if (!newPartner && savedPartner) {
      // User cleared their partner → break up (unlinks both sides)
      try {
        await api.delete('/relationships/partner')
        showToast('success', 'Отношения завершены')
      } catch {
        showToast('error', 'Ошибка при сбросе партнёра')
        return
      }
    } else if (newPartner) {
      // New partner selected → send a relationship request
      try {
        await api.post('/relationships/request', { toId: newPartner })
        showToast('success', 'Запрос отправлен партнёру 💕')
      } catch (e: any) {
        const msg = e?.response?.data?.error?.message ?? 'Ошибка отправки запроса'
        showToast('error', msg)
        return
      }
    }
  }

  // ── Save all other profile fields (relationship_with excluded — managed by request system) ──
  const payload: Record<string, unknown> = {
    display_name:        form.display_name,
    bio:                 form.bio,
    status:              form.status,
    persona:             form.persona,
    fursona_name:        form.fursona_name,
    avatar_url:          form.avatar_url,
    banner_url:          form.banner_url,
    website:             form.website,
    location:            form.location,
    pronouns:            form.pronouns,
    job_title:           form.job_title,
    relationship_status: form.relationship_status,
    country:             form.country,
    fursona_color:       form.fursona_color || null,
    fursona_photo_url:   form.fursona_photo_url || null,
    has_fursuit:         form.has_fursuit,
    fursuit_photo_url:   form.fursuit_photo_url  || null,
    fursuit_description: form.fursuit_description || null,
    fursuit_maker:       form.fursuit_maker       || null,
    birth_date:          form.birth_date || null,
    likes:               form.likes,
    dislikes:            form.dislikes,
    profile_theme:       form.profile_theme  || null,
    profile_bg_url:      form.profile_bg_url || null,
    profile_frame:       form.profile_frame  || null,
    social_links:        form.social_links,
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(form.accent_color)) payload.accent_color = form.accent_color

  try {
    await userStore.updateProfile(payload)
    snapshotToSaved()
    // Also save fursona if it has unsaved changes
    if (fursonaIsDirty.value && fursonaRef.value) {
      await fursonaRef.value.save()
    }
    if (newPartner === savedPartner) showToast('success', 'Профиль успешно сохранён!')
  } catch {
    showToast('error', userStore.error ?? 'Ошибка сохранения')
  }
}

// ── Sections ───────────────────────────────────────────────────────────────
const sections = [
  { id: 'sec-basic',         label: 'Основное',       color: '#60a5fa', iconPath: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { id: 'sec-contacts',      label: 'Контакты',       color: '#34d399', iconPath: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { id: 'sec-fursona',       label: 'Фурсона',        color: '#a78bfa', iconPath: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'sec-profile-style', label: 'Стиль профиля',  color: '#f59e0b', iconPath: 'M5 3a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h14v14H5V5zm2 2v2h10V7H7zm0 4v2h7v-2H7z' },
  { id: 'sec-verification',  label: 'Верификация',    color: '#3b82f6', iconPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { id: 'sec-lang',          label: 'Язык',          color: '#f59e0b', iconPath: 'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129' },
  { id: 'sec-security',      label: 'Безопасность',      color: '#10b981', iconPath: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  { id: 'sec-danger',        label: 'Аккаунт',        color: '#ef4444', iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
]

const lockedSettings = [
  { label: 'Уведомления', d: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { label: 'Безопасность',  d: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { label: 'Подписка',      d: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { label: 'Приватность',   d: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
]

const pronounPresets = ['он/его', 'она/её', 'они/их']

// ── Verification ────────────────────────────────────────────────────────────
const verificationStatus = ref<any>(null)
const verificationCriteria = ref<any>(null)
const profileCompleteness = ref<any>(null)
const isLoadingVerification = ref(false)
const isRequestingVerification = ref(false)
const selectedVerType = ref<'artist' | 'master' | 'event' | ''>('')
const evidenceUrls = ref<string[]>([])
const evidenceInput = ref<HTMLInputElement | null>(null)
const isUploadingEvidence = ref(false)

async function fetchVerificationData() {
  isLoadingVerification.value = true
  try {
    const [statusRes, criteriaRes, completenessRes] = await Promise.all([
      api.get('/verification/status'),
      api.get('/verification/criteria'),
      api.get('/verification/completeness'),
    ])
    if (statusRes.data.success) verificationStatus.value = statusRes.data.data
    if (criteriaRes.data.success) verificationCriteria.value = criteriaRes.data.data
    if (completenessRes.data.success) profileCompleteness.value = completenessRes.data.data
  } catch {} finally { isLoadingVerification.value = false }
}

async function onEvidenceUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || evidenceUrls.value.length >= 5) return
  isUploadingEvidence.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post('/media/upload?folder=evidence', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    if (res.data?.data?.url) evidenceUrls.value.push(res.data.data.url)
  } catch (err: any) {
    showToast('error', 'Ошибка загрузки файла')
  } finally {
    isUploadingEvidence.value = false
    if (evidenceInput.value) evidenceInput.value.value = ''
  }
}

async function requestVerification() {
  if (!selectedVerType.value || evidenceUrls.value.length === 0) return
  isRequestingVerification.value = true
  try {
    const res = await api.post('/verification/request', {
      verificationType: selectedVerType.value,
      evidenceUrls: evidenceUrls.value,
    })
    if (res.data.success) {
      showToast('success', 'Заявка отправлена на проверку модераторам')
      selectedVerType.value = ''
      evidenceUrls.value = []
      await fetchVerificationData()
    }
  } catch (e: any) {
    showToast('error', e.response?.data?.error?.message ?? e.response?.data?.error ?? 'Ошибка отправки заявки')
  } finally { isRequestingVerification.value = false }
}

const verCriteriaList = computed(() => {
  const c = verificationCriteria.value
  if (!c) return []
  return [
    { label: 'Аккаунт старше 14 дней', met: c.accountAgeDays >= 14, detail: `${c.accountAgeDays} дн.` },
    { label: '3+ публикаций', met: c.postCount >= 3, detail: `${c.postCount} постов` },
    { label: 'Аватар установлен', met: c.hasAvatar, detail: '' },
    { label: 'Био заполнено', met: c.hasBio, detail: '' },
    { label: 'Email привязан', met: c.hasEmail, detail: '' },
    { label: '5+ подписчиков', met: c.followerCount >= 5, detail: `${c.followerCount} подписчиков` },
  ]
})

const completenessFields = computed(() => {
  const c = profileCompleteness.value
  if (!c) return []
  return [
    { key: 'avatar', label: 'Аватар', met: c.hasAvatar },
    { key: 'email', label: 'Email', met: c.hasEmail },
    { key: 'bio', label: 'Био', met: c.hasBio },
    { key: 'fursonaName', label: 'Имя фурсоны', met: c.hasFursonaName },
    { key: 'fursonaSpecies', label: 'Вид фурсоны', met: c.hasFursonaSpecies },
    { key: 'fursonaGender', label: 'Пол фурсоны', met: c.hasFursonaGender },
    { key: 'fursonaDesc', label: 'Описание фурсоны', met: c.hasFursonaDescription },
  ]
})

// ── Birth date helpers ─────────────────────────────────────────────────────
const birthAge = computed<number | null>(() => {
  if (!form.birth_date) return null
  const birthYear  = new Date(form.birth_date)
  const now        = new Date()
  let age = now.getFullYear() - birthYear.getFullYear()
  const m = now.getMonth() - birthYear.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birthYear.getDate())) age--
  return age
})

// ── Fursona species helpers ────────────────────────────────────────────────
const fursonaSpeciesList = [
  'Волк', 'Лис', 'Дракон', 'Кошка', 'Собака', 'Кролик', 'Олень', 'Выдра',
  'Медведь', 'Рысь', 'Тигр', 'Лошадь', 'Летучая мышь', 'Гиена', 'Ящерица',
  'Птица', 'Змея', 'Панда', 'Белка', 'Сергал', 'Мышь', 'Акула', 'Лев', 'Енот',
]
const customSpeciesInput = ref('')
const selectedSpecies = computed(() =>
  form.persona ? form.persona.split(',').map(s => s.trim()).filter(Boolean) : [],
)
function toggleSpecies(sp: string) {
  const cur = selectedSpecies.value
  if (cur.includes(sp)) {
    form.persona = cur.filter(s => s !== sp).join(', ')
  } else {
    form.persona = [...cur, sp].join(', ')
  }
}
function addCustomSpecies() {
  const v = customSpeciesInput.value.trim()
  if (!v) return
  if (!selectedSpecies.value.includes(v)) {
    form.persona = [...selectedSpecies.value, v].join(', ')
  }
  customSpeciesInput.value = ''
}

const fursonaColorSwatches = [
  { label: 'Белый',          color: '#f5f5f5' },
  { label: 'Светло-серый',   color: '#d1d5db' },
  { label: 'Серый',          color: '#6b7280' },
  { label: 'Чёрный',         color: '#1c1c1e' },
  { label: 'Коричневый',     color: '#92400e' },
  { label: 'Рыжий',          color: '#c2410c' },
  { label: 'Рыжий-лис',     color: '#ea580c' },
  { label: 'Золотой',        color: '#d97706' },
  { label: 'Жёлтый',        color: '#ca8a04' },
  { label: 'Кремовый',       color: '#fef3c7' },
  { label: 'Тёмно-золот.',   color: '#b45309' },
  { label: 'Красный',        color: '#dc2626' },
  { label: 'Розовый',        color: '#ec4899' },
  { label: 'Фиолетовый',     color: '#7c3aed' },
  { label: 'Синий',          color: '#2563eb' },
  { label: 'Голубой',        color: '#0ea5e9' },
  { label: 'Бирюзовый',      color: '#0d9488' },
  { label: 'Зелёный',        color: '#16a34a' },
  { label: 'Серебристый',    color: '#94a3b8' },
]

const socialNetworks = [
  { key: 'telegram',    label: 'Telegram',      color: '#2AABEE', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>` },
  { key: 'twitter',     label: 'X / Twitter',   color: '#fff',    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.907-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>` },
  { key: 'instagram',   label: 'Instagram',     color: '#E4405F', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>` },
  { key: 'youtube',     label: 'YouTube',       color: '#FF0000', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>` },
  { key: 'twitch',      label: 'Twitch',        color: '#9146FF', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>` },
  { key: 'furaffinity', label: 'FurAffinity',   color: '#FAAF3A', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm.75 4.5c.414 0 .75.336.75.75s-.336.75-.75.75-.75-.336-.75-.75.336-.75.75-.75zM9 6.75A.75.75 0 0 1 9.75 6h4.5a.75.75 0 0 1 0 1.5H9.75A.75.75 0 0 1 9 6.75zm-.75 3a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 0 1.5h-6a.75.75 0 0 1-.75-.75zm9 4.5c0 2.9-2.35 5.25-5.25 5.25S6.75 17.15 6.75 14.25c0-.414.336-.75.75-.75s.75.336.75.75c0 2.07 1.68 3.75 3.75 3.75s3.75-1.68 3.75-3.75a.75.75 0 0 1 1.5 0z"/></svg>` },
  { key: 'vk',          label: 'ВКонтакте',     color: '#4C75A3', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.391 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.523-2.049-1.714-1.033-1.01-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.566c0 .424-.135.678-1.252.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.677.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.204.17-.407.44-.407h2.743c.372 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.252-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.763-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.202 1.253.745.847 1.32 1.558 1.473 2.049.17.474-.085.716-.576.716z"/></svg>` },
  { key: 'discord',     label: 'Discord',       color: '#7289DA', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>` },
  { key: 'github',      label: 'GitHub',        color: '#fff',    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>` },
  { key: 'other',       label: 'Другое / Сайт', color: '#6366f1', svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>` },
]

const relationshipOptions = [
  { value: 'single',          label: 'Свободен' },
  { value: 'in_relationship', label: 'В отношениях' },
  { value: 'married',      label: 'Женат/Замужем' },
  { value: 'open',         label: 'Открытые' },
  { value: 'complicated',  label: 'Сложно' },
  { value: 'secret',       label: 'Секрет' },
]

const colorSwatches = [
  { name: 'Sky',    color: '#4C97CF' },
  { name: 'Blue',   color: '#3b82f6' },
  { name: 'Indigo', color: '#6366f1' },
  { name: 'Violet', color: '#8b5cf6' },
  { name: 'Purple', color: '#a855f7' },
  { name: 'Pink',   color: '#ec4899' },
  { name: 'Rose',   color: '#f43f5e' },
  { name: 'Orange', color: '#f97316' },
  { name: 'Amber',  color: '#f59e0b' },
  { name: 'Green',  color: '#22c55e' },
  { name: 'Teal',   color: '#14b8a6' },
  { name: 'Slate',  color: '#64748b' },
]

// ── Country / City data ────────────────────────────────────────────────────
const COUNTRIES = [
  'Австралия','Австрия','Азербайджан','Аргентина','Беларусь','Бельгия','Бразилия',
  'Великобритания','Венгрия','Германия','Греция','Грузия','Дания','Египет',
  'Израиль','Индия','Индонезия','Иран','Ирландия','Испания','Италия','Казахстан',
  'Канада','Китай','Колумбия','Латвия','Литва','Мексика','Нидерланды','Новая Зеландия',
  'Норвегия','ОАЭ','Пакистан','Польша','Португалия','Россия','Румыния','Сербия',
  'Сингапур','Словакия','США','Таиланд','Турция','Узбекистан','Украина','Финляндия',
  'Франция','Чехия','Швейцария','Швеция','Япония',
]

const CITIES_BY_COUNTRY: Record<string, string[]> = {
  'Россия': ['Москва','Санкт-Петербург','Новосибирск','Екатеринбург','Нижний Новгород','Казань','Челябинск','Омск','Самара','Ростов-на-Дону','Уфа','Красноярск','Пермь','Воронеж','Волгоград','Краснодар','Тюмень','Саратов','Тольятти','Ижевск','Барнаул','Иркутск','Хабаровск','Владивосток','Ярославль','Томск'],
  'Украина': ['Киев','Харьков','Одесса','Днепр','Донецк','Запорожье','Львов','Кривой Рог','Николаев','Мариуполь'],
  'Беларусь': ['Минск','Гомель','Могилев','Витебск','Гродно','Брест','Бобруйск','Барановичи'],
  'Казахстан': ['Алматы','Астана','Шымкент','Актобе','Таραз','Павлодар','Усть-Каменогорск','Семей'],
  'Германия': ['Берлин','Гамбург','Мюнхен','Кёльн','Франкфурт','Штутгарт','Дюссельдорф','Дортмунд','Лейпциг','Бремен'],
  'США': ['Нью-Йорк','Лос-Анджелес','Чикаго','Хьюстон','Феникс','Филадельфия','Сан-Антонио','Сан-Диего','Даллас','Джексонвилл','Сан-Хосе','Остин','Сан-Франциско','Сиэтл','Денвер','Бостон','Вашингтон','Майами','Атланта'],
  'Великобритания': ['Лондон','Бирмингем','Манчестер','Лидс','Глазго','Ливерпуль','Эдинбург','Шеффилд','Бристоль','Ньюкасл'],
  'Франция': ['Париж','Марсель','Лион','Тулуза','Ницца','Нант','Монпелье','Страсбург','Бордо','Лилль'],
  'Италия': ['Рим','Милан','Неаполь','Турин','Палермо','Генуя','Болонья','Флоренция','Бари','Катания'],
  'Испания': ['Мадрид','Барселона','Валенсия','Севилья','Сарагоса','Малага','Мурсия','Пальма','Лас-Пальмас','Бильбао'],
  'Канада': ['Торонто','Монреаль','Ванкувер','Калгари','Эдмонтон','Оттава','Виннипег','Квебек'],
  'Австралия': ['Сидней','Мельбурн','Брисбен','Перт','Аделаида','Канберра','Голд-Кост'],
  'Япония': ['Токио','Йокогама','Осака','Нагоя','Саппоро','Кобе','Кото','Кавасаки','Сайтама','Хиросима'],
  'Китай': ['Пекин','Шанхай','Гуанчжоу','Шэньчжэнь','Чэнду','Ухань','Чунцин','Тяньцзинь','Нанкин','Сиань'],
  'Индия': ['Мумбаи','Дели','Бангалор','Хайдарабад','Ченнай','Калькутта','Ахмадабад','Пуна','Сурат','Джайпур'],
  'Польша': ['Варшава','Краков','Лодзь','Вроцлав','Познань','Гданьск','Щецин','Катовице','Люблин'],
  'Türkiye': ['Стамбул','Анкара','Измир','Бурса','Адана','Газиантеп','Конья','Анталья'],
  'Нидерланды': ['Амстердам','Роттердам','Гаага','Утрехт','Эйндховен','Тилбург','Гронинген'],
  'Швеция': ['Стокгольм','Гётеборг','Мальмё','Уппсала','Вестерос','Эребру'],
  'Норвегия': ['Осло','Берген','Ставангер','Трондхейм','Драммен'],
  'Финляндия': ['Хельсинки','Эспоо','Тампере','Вантаа','Оулу','Турку'],
  'Австрия': ['Вена','Грац','Линц','Зальцбург','Инсбрук'],
  'Швейцария': ['Цюрих','Женева','Базель','Берн','Лозанна'],
  'Чехия': ['Прага','Брно','Острава','Пльзень','Либерец'],
  'Португалия': ['Лиссабон','Порту','Брага','Сетубал','Коимбра'],
  'Греция': ['Афины','Салоники','Патры','Пирей','Ираклион'],
  'ОАЭ': ['Дубай','Абу-Даби','Шарджа','Аджман','Рас-эль-Хайма'],
  'Грузия': ['Тбилиси','Кутаиси','Батуми','Рустави','Гори'],
  'Азербайджан': ['Баку','Гянджа','Сумгайыт','Нахчыван','Лянкяран'],
  'Узбекистан': ['Ташкент','Самарканд','Наманган','Андижан','Нукус','Бухара'],
  'Израиль': ['Тель-Авив','Иерусалим','Хайфа','Ришон-ле-Цион','Петах-Тиква'],
  'Бразилия': ['Сан-Паулу','Рио-де-Жанейро','Бразилиа','Салвадор','Форталеза','Белу-Оризонти','Манаус'],
  'Аргентина': ['Буэнос-Айрес','Кордова','Росарио','Мендоса','Тукуман','Ла-Плата'],
  'Мексика': ['Мехико','Гвадалахара','Монтеррей','Пуэбла','Тихуана','Леон'],
  'Сингапур': ['Сингапур'],
}

// ── Country & city combobox state ─────────────────────────────────────────
const countrySearch   = ref('')
const countryDropOpen = ref(false)
const citySearch      = ref('')
const cityDropOpen    = ref(false)

const filteredCountries = computed(() => {
  const q = countrySearch.value.toLowerCase()
  return q ? COUNTRIES.filter(c => c.toLowerCase().includes(q)) : COUNTRIES
})

const filteredCities = computed(() => {
  const cities = CITIES_BY_COUNTRY[form.country] ?? []
  const q = citySearch.value.toLowerCase()
  return q ? cities.filter(c => c.toLowerCase().includes(q)) : cities
})

function selectCountry(name: string) {
  form.country      = name
  countrySearch.value = name
  countryDropOpen.value = false
  // Reset city if country changed
  form.location     = ''
  citySearch.value  = ''
}

function selectCity(name: string) {
  form.location    = name
  citySearch.value = name
  cityDropOpen.value = false
}

function onCountryBlur() {
  setTimeout(() => {
    countryDropOpen.value = false
    // If typed text isn't in list, revert to last confirmed value
    if (!COUNTRIES.includes(countrySearch.value)) {
      countrySearch.value = form.country
    }
  }, 180)
}

function onCityBlur() {
  setTimeout(() => {
    cityDropOpen.value = false
    citySearch.value   = form.location
  }, 180)
}

function onPartnerBlur() {
  setTimeout(() => { partnerDropOpen.value = false }, 180)
}

// ── Following / partner picker ────────────────────────────────────────────
interface FollowUser { id: string; username: string; display_name: string | null; avatar_url: string | null }
const followingList   = ref<FollowUser[]>([])
const partnerSearch   = ref('')
const partnerDropOpen = ref(false)

async function loadFollowing() {
  const auth = authStore
  if (!auth.user?.id) return
  try {
    // Load mutual friends for partner picker
    const res  = await fetch(`/api/follows/${auth.user.id}/friends`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    const data = await res.json()
    if (data.success) followingList.value = data.data.users ?? []
  } catch { /* ignore */ }
}

const filteredPartners = computed(() => {
  const q = partnerSearch.value.toLowerCase()
  if (!q) return followingList.value
  return followingList.value.filter(u =>
    (u.display_name ?? u.username).toLowerCase().includes(q) ||
    u.username.toLowerCase().includes(q),
  )
})

const showPartnerPicker = computed(() =>
  ['in_relationship', 'relationship', 'married', 'open', 'open_relationship'].includes(form.relationship_status),
)

const selectedPartner = computed(() =>
  followingList.value.find(u => u.id === form.relationship_with) ?? null,
)

function selectPartner(u: FollowUser) {
  form.relationship_with = u.id
  partnerSearch.value    = u.display_name ?? u.username
  partnerDropOpen.value  = false
}

function clearPartner() {
  form.relationship_with = ''
  partnerSearch.value    = ''
}

// ── Fursona steps ─────────────────────────────────────────────────────────
const fursonaSteps = computed(() => [
  { label: 'Вид',      done: !!form.persona,                                    locked: false },
  { label: 'Имя',      done: !!form.fursona_name,                               locked: !form.persona },
  { label: 'Характер', done: form.likes.length > 0 || form.dislikes.length > 0, locked: !form.persona },
  { label: 'Фото',     done: false,                                              locked: true },
])

// ── Active section (accordion) ────────────────────────────────────────────
const openSection = ref('sec-basic')

function openSec(id: string) {
  openSection.value = id
  // Scroll the form column to the top so newly opened section is visible
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<style scoped>
/* stylelint-disable */
.field-input {
  @apply w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/50 focus:outline-none transition-all;
}

/* ── Accordion section transition ───────────────────────────────────────── */
.accordion-enter-active, .accordion-leave-active { transition: all 0.25s ease; }
.accordion-enter-from, .accordion-leave-to { opacity: 0; max-height: 0; overflow: hidden; }

/* ── No scrollbar (mobile tabs) ─────────────────────────────────────────── */
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }

/* ── Toast ─────────────────────────────────────────────────────────────── */
.toast-enter-active, .toast-leave-active { transition: all 0.4s cubic-bezier(0.34,1.56,0.64,1); }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.88); }

/* ── Floating bar ──────────────────────────────────────────────────────── */
.floatbar-enter-active, .floatbar-leave-active { transition: all 0.4s cubic-bezier(0.34,1.56,0.64,1); }
.floatbar-enter-from, .floatbar-leave-to { opacity: 0; transform: translateY(20px) scale(0.92); }

/* ── Slide down ────────────────────────────────────────────────────────── */
.slide-down-enter-active, .slide-down-leave-active { transition: all 0.25s ease; overflow: hidden; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; max-height: 0; }
.slide-down-enter-to, .slide-down-leave-from { opacity: 1; max-height: 300px; }

/* ── Crop modal ────────────────────────────────────────────────────────── */
.modal-fade-enter-active, .modal-fade-leave-active { transition: all 0.25s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; transform: scale(0.96); }

/* ── Swatch check ──────────────────────────────────────────────────────── */
.swatch-check-enter-active, .swatch-check-leave-active { transition: all 0.2s ease; }
.swatch-check-enter-from, .swatch-check-leave-to { opacity: 0; transform: scale(0.5); }

/* ── Fade ──────────────────────────────────────────────────────────────── */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ── Shake ─────────────────────────────────────────────────────────────── */
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
