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
          <span class="text-xs font-bold">{{ unsavedWarning ? langStore.t.settingsProfileUnsavedBadge : langStore.t.settingsProfileHasChanges }}</span>
        </div>
        <!-- Reset -->
        <button type="button" @click="resetForm"
          class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all text-white/55 hover:text-white hover:bg-white/10 border border-transparent hover:border-brand-border">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
          {{ langStore.t.settingsProfileResetBtn }}
        </button>
        <!-- Save -->
        <button type="button" @click="handleSubmit" :disabled="userStore.isLoading || birthDateInvalid"
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50 shadow-lg"
          :style="unsavedWarning
            ? 'background:#ef4444;box-shadow:0 4px 20px rgba(239,68,68,0.4)'
            : `background:${form.accent_color};box-shadow:0 4px 20px ${form.accent_color}44`">
          <span v-if="userStore.isLoading" class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
          <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
          {{ userStore.isLoading ? langStore.t.savingProfile : langStore.t.saveProfile }}
        </button>
      </div>
    </Transition>

    <!-- ─── Crop modal ──────────────────────────────────────────────── -->
    <ImageCropModal
      :show="cropModal.show"
      :src="cropModal.src"
      :type="cropModal.type"
      :accent-color="form.accent_color"
      :uploading="cropUploading"
      :hint="cropModal.type === 'avatar' && cropModal.isGif ? langStore.t.settingsProfileGifHint : undefined"
      @cancel="cancelCrop"
      @confirm="confirmCrop"
    />

    <!-- ─── App Header ──────────────────────────────────────────────── -->
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-6 pb-28 md:pb-10">

      <!-- ─── Left: App navigation hub ─────────────────────────────── -->
      <AppSidebar />

      <!-- ─── Settings area ────────────────────────────────────────── -->
      <main class="flex-1 min-w-0">
        <div class="flex flex-row-reverse gap-6 items-start">

          <!-- ── Left sticky section nav ────────────────────────────── -->
          <aside class="w-56 hidden xl:flex flex-col gap-3 sticky top-24 self-start shrink-0">

            <!-- Mini profile preview card -->
            <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
              <div class="h-16 relative"
                :style="form.banner_url
                  ? `background-image:url(${form.banner_url});background-size:cover;background-position:center`
                  : `background:linear-gradient(135deg,${form.accent_color}33,${form.accent_color}0a)`">
                <span v-if="userStore.primaryFursona?.species?.length"
                  class="absolute bottom-1 right-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold backdrop-blur-xs"
                  style="background:rgba(0,0,0,0.55);color:#fff">
                  <span class="leading-none">🐾</span>
                  {{ primarySpeciesLabel }}
                </span>
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
                <p class="text-xs text-white/70 truncate">@{{ authStore.user?.username }}</p>
              </div>
            </div>

            <!-- Section scroll-spy nav -->
            <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
              <div class="px-4 py-3 border-b border-brand-border">
                <h4 class="text-[11px] font-bold text-white/55 uppercase tracking-widest">{{ langStore.t.sectionsHeader }}</h4>
              </div>
              <nav class="p-2 stack-y-0.5">
                <button
                  v-for="sec in sections.filter(s => s.id !== 'sec-ad')" :key="sec.id"
                  @click="openSec(sec.id)"
                  class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold transition-all group"
                  :class="openSection === sec.id ? 'text-white' : 'text-white/55 hover:text-white'"
                  :style="openSection === sec.id ? `background:${sec.color}20;box-shadow:inset 0 0 0 1px ${sec.color}30` : ''">
                  <div class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all"
                    :style="openSection === sec.id ? `background:${sec.color}30` : ''"
                    :class="openSection !== sec.id ? 'group-hover:bg-white/5' : ''">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      :style="openSection === sec.id ? `color:${sec.color}` : ''"
                      :class="openSection !== sec.id ? 'text-white/55 group-hover:text-white' : ''">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="sec.iconPath" />
                    </svg>
                  </div>
                  <span class="flex-1 text-left">{{ sec.label }}</span>
                  <div v-if="openSection === sec.id" class="w-1.5 h-1.5 rounded-full shrink-0" :style="`background:${sec.color}`"></div>
                </button>
              </nav>
            </div>

          </aside>

          <!-- ── Form column ─────────────────────────────────────────── -->
          <div class="flex-1 min-w-0 stack-y-5">

            <!-- Page header -->
            <div class="flex items-center gap-4">
              <div>
                <h1 class="text-2xl font-extrabold text-white tracking-tight">{{ langStore.t.settings }}</h1>
                <p class="text-sm text-white/55 mt-0.5">{{ sections.find(s => s.id === openSection)?.label ?? langStore.t.settings }}</p>
              </div>
            </div>

            <!-- Mobile section tabs (xl+ uses the sticky sidebar instead) -->
            <div class="flex gap-2 overflow-x-auto pb-1 xl:hidden no-scrollbar max-md:-mx-3 max-md:px-3">
              <button
                v-for="sec in sections.filter(s => s.id !== 'sec-ad')" :key="sec.id"
                @click="openSec(sec.id)"
                class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all"
                :class="openSection === sec.id ? 'text-white border-transparent shadow-lg' : 'text-white/55 border-brand-border hover:border-white/20 bg-brand-card'"
                :style="openSection === sec.id ? `background:${sec.color};box-shadow:0 4px 12px ${sec.color}44` : ''">
                {{ sec.label }}
              </button>
            </div>

            <form @submit.prevent="handleSubmit" class="stack-y-5">

              <!-- ── § 1: ОСНОВНОЕ + МЕДИА ──────────────────────────── -->
              <section v-show="openSection === sections[0].id" :id="sections[0].id" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl scroll-mt-28">
                <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3 rounded-t-3xl"
                  :style="`background:linear-gradient(90deg,${sections[0].color}0c 0%,transparent 100%)`">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" :style="`background:${sections[0].color}1a`">
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
                        <div class="w-10 h-10 rounded-2xl border flex items-center justify-center backdrop-blur-sm transition-all"
                          :class="bannerDragOver ? 'bg-sky-500/30 border-sky-400/60' : 'bg-white/15 border-white/25'">
                          <svg v-if="!bannerDragOver" class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                          </svg>
                          <svg v-else class="w-5 h-5 text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                          </svg>
                        </div>
                        <span class="text-white text-xs font-bold">
                          {{ bannerDragOver ? langStore.t.settingsProfileDropFile : (form.banner_url ? langStore.t.changeBanner : langStore.t.addBanner) }}
                        </span>
                        <span v-if="!bannerDragOver" class="text-white/50 text-[10px]">{{ langStore.t.bannerDragHint }}</span>
                      </div>
                      <!-- action buttons top-right -->
                      <div class="absolute top-3 right-3 flex gap-1.5">
                        <Transition name="fade">
                          <button v-if="form.banner_url" type="button"
                            @click.stop="reopenCrop('banner')"
                            class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/55 border border-white/20 backdrop-blur-sm text-white/75 hover:text-white hover:bg-black/80 transition-all text-[10px] font-bold">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                            {{ langStore.t.settingsProfileCropBtn }}
                          </button>
                        </Transition>
                        <Transition name="fade">
                          <button v-if="form.banner_url" type="button"
                            @click.stop="form.banner_url = ''"
                            class="w-7 h-7 rounded-full bg-black/55 border border-white/20 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-white hover:bg-black/80 transition-all">
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
                        <!-- GIF badge (animated avatar has a WebM counterpart) -->
                        <span v-if="form.avatar_video_url" class="absolute -top-1 -left-1 text-[9px] font-extrabold bg-brand-accent text-white px-1.5 py-0.5 rounded-full border border-brand-card shadow-sm z-10">GIF</span>
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
                          @click.stop="form.avatar_url = ''; form.avatar_video_url = ''"
                          class="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-brand-error border-2 border-brand-card flex items-center justify-center text-white shadow-lg opacity-0 group-hover/av:opacity-100 transition-all">
                          <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </label>
                    </div>
                  </div>

                  <!-- Spacer + action row -->
                  <div class="pt-12 px-6 pb-4 flex items-end justify-between max-md:px-4 max-md:flex-col max-md:items-stretch max-md:gap-3">
                    <div class="max-md:min-w-0">
                      <p class="font-bold text-white text-sm max-md:truncate">{{ form.display_name || authStore.user?.username }}</p>
                      <p class="text-xs text-white/70 max-md:truncate">@{{ authStore.user?.username }}</p>
                    </div>
                    <div class="flex flex-wrap gap-2 text-xs text-white/35 font-semibold max-md:flex-nowrap max-md:gap-1.5 max-md:*:flex-1 max-md:*:justify-center max-md:*:min-w-0 max-md:*:py-2 max-md:*:px-1.5 max-md:*:text-center max-md:*:leading-tight max-[379px]:[&>*>svg]:hidden">
                      <button type="button" @click="avatarFileRef?.click()"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border hover:border-brand-accent/50 hover:text-white transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        {{ langStore.t.avatarBtnLabel }}
                      </button>
                      <button type="button" @click="bannerFileRef?.click()"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border hover:border-brand-accent/50 hover:text-white transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                        {{ langStore.t.bannerBtnLabel }}
                      </button>
                      <button v-if="form.avatar_url" type="button" @click="reopenCrop('avatar')"
                        class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-brand-border hover:border-sky-400/50 hover:text-sky-300 transition-all">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                        {{ langStore.t.cropAvatarBtn }}
                      </button>
                    </div>
                  </div>

                  <!-- ── История аватаров ── -->
                  <div class="border-t border-brand-border/40">
                    <button type="button"
                      @click="showAvatarHistory = !showAvatarHistory"
                      class="w-full flex items-center justify-between px-6 py-3 text-xs font-bold text-white/45 hover:text-white/70 transition-colors">
                      <span class="flex items-center gap-2">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        {{ langStore.t.avatarHistoryLabel }}
                        <span v-if="avatarHistory.length" class="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10">{{ avatarHistory.length }}</span>
                      </span>
                      <svg class="w-3.5 h-3.5 transition-transform" :class="showAvatarHistory ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
                      </svg>
                    </button>
                    <Transition name="fade">
                      <div v-if="showAvatarHistory" class="px-6 pb-5">
                        <div v-if="avatarHistoryLoading" class="flex justify-center py-4">
                          <span class="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></span>
                        </div>
                        <div v-else-if="!avatarHistory.length" class="text-xs text-white/35 text-center py-4">
                          {{ langStore.t.avatarHistoryEmpty }}
                        </div>
                        <div v-else class="grid grid-cols-5 sm:grid-cols-8 gap-2">
                          <div
                            v-for="item in avatarHistory" :key="item.id"
                            class="group relative aspect-square rounded-xl overflow-hidden border-2 transition-all"
                            :class="form.avatar_url === item.url
                              ? 'border-brand-accent shadow-lg shadow-brand-accent/30'
                              : 'border-transparent hover:border-white/30'"
                            :title="new Date(item.created_at).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang])">
                            <img :src="item.url" class="w-full h-full object-cover cursor-pointer" loading="lazy" @click="applyHistoryAvatar(item)"/>
                            <span v-if="item.video_url" class="absolute bottom-0.5 left-0.5 w-3.5 h-3.5 bg-black/70 rounded-full flex items-center justify-center pointer-events-none">
                              <svg viewBox="0 0 24 24" class="w-2 h-2 text-white" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                            </span>
                            <!-- Hover overlay: restore checkmark -->
                            <button
                              type="button"
                              @click="applyHistoryAvatar(item)"
                              class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                              </svg>
                            </button>
                            <!-- Active checkmark badge -->
                            <div v-if="form.avatar_url === item.url" class="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-brand-accent flex items-center justify-center pointer-events-none">
                              <svg class="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/>
                              </svg>
                            </div>
                            <!-- Delete button -->
                            <button
                              type="button"
                              @click.stop="deleteHistoryAvatar(item.id)"
                              class="absolute top-1 left-1 w-5 h-5 rounded-full bg-red-500/80 hover:bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                              :title="langStore.t.settingsProfileRemoveFromHistory">
                              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </Transition>
                  </div>

                  <!-- ── Поля формы ── -->
                  <div class="p-6 stack-y-5 border-t border-brand-border/40">

                  <!-- Username -->
                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider">{{ langStore.t.usernameFieldLabel }}</label>
                      <span class="text-[11px] tabular-nums" :class="form.username.length > 27 ? 'text-brand-error/80' : 'text-white/35'">
                        {{ form.username.length }}<span class="opacity-50">/30</span>
                      </span>
                    </div>
                    <div class="relative">
                      <span class="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-bold select-none pointer-events-none">@</span>
                      <input
                        :value="form.username"
                        @input="onUsernameInput"
                        type="text"
                        maxlength="30"
                        :placeholder="langStore.t.settingsProfileUsernamePlaceholder"
                        class="field-input pl-8!"
                        :class="usernameError ? 'border-brand-error/60! ring-brand-error/20!' : ''"
                        autocomplete="username"
                        spellcheck="false"
                      />
                    </div>
                    <p v-if="usernameError" class="text-[11px] text-brand-error/80 mt-1.5">{{ usernameError }}</p>
                    <p v-else class="text-[11px] text-white/35 mt-1.5">{{ langStore.t.usernameHint }}</p>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <!-- Display name -->
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider">{{ langStore.t.displayNameLabel }}</label>
                        <span class="text-[11px] tabular-nums" :class="(form.display_name?.length??0) > 45 ? 'text-brand-error/80' : 'text-white/35'">
                          {{ form.display_name?.length ?? 0 }}<span class="opacity-50">/50</span>
                        </span>
                      </div>
                      <input v-model="form.display_name" type="text" maxlength="50" :placeholder="langStore.t.displayNamePlaceholder" class="field-input"/>
                      <p v-if="savedForm.display_name" class="text-[11px] text-white/35 mt-1.5 truncate">
                        {{ langStore.t.currentlyPrefix }} <span class="text-white/35 font-semibold">{{ savedForm.display_name }}</span>
                      </p>
                    </div>
                    <!-- Status -->
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider">{{ langStore.t.statusFieldLabel }}</label>
                        <span class="text-[11px] tabular-nums" :class="(form.status?.length??0) > 90 ? 'text-brand-error/80' : 'text-white/35'">
                          {{ form.status?.length ?? 0 }}<span class="opacity-50">/100</span>
                        </span>
                      </div>
                      <input v-model="form.status" type="text" maxlength="100" :placeholder="langStore.t.statusFieldPlaceholder" class="field-input"/>
                      <p v-if="savedForm.status" class="text-[11px] text-white/35 mt-1.5 truncate">
                        {{ langStore.t.currentlyPrefix }} <span class="text-white/35 font-semibold">{{ savedForm.status }}</span>
                      </p>
                    </div>
                  </div>

                  <!-- Bio -->
                  <div>
                    <div class="flex items-center justify-between mb-2">
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider">{{ langStore.t.aboutLabel }}</label>
                      <span class="text-[11px] tabular-nums" :class="(form.bio?.length??0) > 270 ? 'text-brand-error/80' : 'text-white/35'">
                        {{ form.bio?.length ?? 0 }}<span class="opacity-50">/300</span>
                      </span>
                    </div>
                    <textarea v-model="form.bio" rows="4" maxlength="300" :placeholder="langStore.t.bioPlaceholder" class="field-input resize-none"></textarea>
                    <p v-if="savedForm.bio" class="text-[11px] text-white/35 mt-1.5 line-clamp-1">
                      {{ langStore.t.currentlyPrefix }} <span class="text-white/35 font-semibold">{{ savedForm.bio }}</span>
                    </p>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <!-- Job title -->
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider">{{ langStore.t.jobLabel }}</label>
                      </div>
                      <select v-model="form.job_title" class="field-input">
                        <option value="">—</option>
                        <option v-if="form.job_title && !jobGroupNames.includes(form.job_title)" :value="form.job_title">{{ form.job_title }}</option>
                        <option v-for="n in jobGroupNames" :key="n" :value="n">{{ n }}</option>
                      </select>
                      <p v-if="savedForm.job_title" class="text-[11px] text-white/35 mt-1.5 truncate">
                        {{ langStore.t.currentlyPrefix }} <span class="text-white/35 font-semibold">{{ savedForm.job_title }}</span>
                      </p>
                    </div>
                    <!-- Pronouns -->
                    <div>
                      <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-bold text-white/55 uppercase tracking-wider">{{ langStore.t.pronounsLabel }}</label>
                        <span class="text-[11px] tabular-nums" :class="(form.pronouns?.length??0) > 27 ? 'text-brand-error/80' : 'text-white/35'">
                          {{ form.pronouns?.length ?? 0 }}<span class="opacity-50">/30</span>
                        </span>
                      </div>
                      <div class="flex gap-2">
                        <input v-model="form.pronouns" type="text" maxlength="30" :placeholder="langStore.t.pronounsFieldPlaceholder" class="field-input flex-1"/>
                        <div class="flex gap-1.5 items-center shrink-0">
                          <button v-for="p in pronounPresets" :key="p" type="button" @click="form.pronouns = p"
                            class="px-2 py-1 rounded-xl text-[10px] font-bold transition-all border"
                            :class="form.pronouns === p ? 'border-transparent text-white' : 'bg-brand-bg border-brand-border text-white/55 hover:text-white'"
                            :style="form.pronouns === p ? `background:${form.accent_color};border-color:${form.accent_color}` : ''">
                            {{ p.split('/')[0] }}
                          </button>
                        </div>
                      </div>
                      <p v-if="savedForm.pronouns" class="text-[11px] text-white/35 mt-1.5 truncate">
                        {{ langStore.t.currentlyPrefix }} <span class="text-white/35 font-semibold">{{ savedForm.pronouns }}</span>
                      </p>
                    </div>
                  </div>

                  <!-- Birth date + NSFW note -->
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">{{ langStore.t.birthdayLabel }}</label>
                      <DateInput ref="birthDateInputRef" v-model="form.birth_date"
                        :max="new Date().toISOString().substring(0,10)"
                        @invalid="birthDateInvalid = $event" />
                      <p v-if="savedForm.birth_date" class="text-[11px] text-white/35 mt-1.5 truncate">
                        {{ langStore.t.currentlyPrefix }} <span class="text-white/35 font-semibold">{{ formatBirthDate(savedForm.birth_date) }}</span>
                      </p>
                      <p class="text-[11px] mt-1.5"
                        :class="birthAge !== null && birthAge < 18 ? 'text-brand-error/80' : 'text-white/35'">
                        <template v-if="birthAge !== null">
                          {{ ageLabel(birthAge) }}
                          <span v-if="birthAge < 18"> · {{ langStore.t.nsfwUnder18Hint }}</span>
                        </template>
                        <template v-else>{{ langStore.t.nsfwBirthdayHint }}</template>
                      </p>
                    </div>
                  </div>

                  <!-- Soon — куда собираешься -->
                  <div class="p-4 bg-brand-bg/60 border border-brand-border/60 rounded-2xl stack-y-3">
                    <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
                      <BIcon name="Sparkles" class="w-3.5 h-3.5" style="color:#fbbf24" />
                      {{ langStore.t.soonSectionTitle }}
                    </p>
                    <p class="text-[11px] text-white/35 -mt-2">
                      {{ langStore.t.soonSectionHint }}
                    </p>

                    <!-- Current selection chip -->
                    <div v-if="mySoonEvent" class="flex items-center gap-3 p-3 rounded-xl border border-brand-border bg-brand-card">
                      <div class="w-9 h-9 rounded-xl overflow-hidden shrink-0 bg-brand-accent/15 flex items-center justify-center">
                        <img v-if="mySoonEvent.banner_url" :src="mySoonEvent.banner_url" class="w-full h-full object-cover" />
                        <BIcon v-else name="Sparkles" class="w-4 h-4 text-brand-accent" />
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-bold text-white truncate">{{ mySoonEvent.title }}</p>
                        <p class="text-xs text-white/55 truncate">{{ mySoonEvent.group?.name }} · {{ formatSoonDate(mySoonEvent.starts_at) }}</p>
                      </div>
                      <button type="button" @click="clearSoonSelection" :disabled="soonSaving"
                        class="w-7 h-7 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-white/10 transition-all shrink-0 disabled:opacity-40">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                      </button>
                    </div>
                    <p v-else class="text-xs text-white/35">{{ langStore.t.soonNothingSelected }}</p>

                    <!-- Search / select -->
                    <div class="relative">
                      <input
                        v-model="soonSearch"
                        type="text"
                        :placeholder="langStore.t.soonSearchPlaceholder"
                        class="field-input"
                        @focus="soonDropOpen = true"
                        @blur="onSoonBlur"
                      />
                      <Transition name="fade">
                        <div v-if="soonDropOpen && filteredSoonEvents.length"
                          class="absolute z-30 mt-1 w-full bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-y-auto max-h-56">
                          <button v-for="ev in filteredSoonEvents" :key="ev.id" type="button"
                            class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-all"
                            @mousedown.prevent="selectSoonEvent(ev)">
                            <div class="w-7 h-7 rounded-lg overflow-hidden shrink-0 bg-brand-accent/15 flex items-center justify-center">
                              <img v-if="ev.banner_url" :src="ev.banner_url" class="w-full h-full object-cover" />
                              <BIcon v-else name="CalendarDays" class="w-3.5 h-3.5 text-brand-accent" />
                            </div>
                            <div class="flex-1 min-w-0 text-left">
                              <p class="text-sm font-semibold text-white truncate">{{ ev.title }}</p>
                              <p class="text-xs text-white/55 truncate">{{ ev.group?.name }} · {{ formatSoonDate(ev.starts_at) }}</p>
                            </div>
                          </button>
                        </div>
                      </Transition>
                      <p v-if="soonDropOpen && soonSearch && !filteredSoonEvents.length" class="text-xs text-white/55 px-1 pt-2">{{ langStore.t.convNothingFound }}</p>
                    </div>
                    <p v-if="!soonEventsLoading && !soonEventsList.length" class="text-xs text-white/35">{{ langStore.t.settingsProfileNoEventsAvailable }}</p>
                  </div>

                </div><!-- /p-6 form fields -->
                </div><!-- /p-0 outer -->
              </section>

              <!-- ── § 2: CONTACTS ───────────────────────────────────── -->
              <section v-show="openSection === sections[1].id" :id="sections[1].id" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                  :style="`background:linear-gradient(90deg,${sections[1].color}0c 0%,transparent 100%)`">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" :style="`background:${sections[1].color}1a`">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${sections[1].color}`">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="sections[1].iconPath"/>
                    </svg>
                  </div>
                  <h2 class="font-bold text-white text-sm">{{ sections[1].label }}</h2>
                </div>
                <div class="p-6 stack-y-5">

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <!-- Website -->
                    <div>
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">{{ langStore.t.websiteLabel }}</label>
                      <div class="relative">
                        <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
                        </svg>
                        <input v-model="form.website" type="url" placeholder="https://yoursite.com" class="field-input pl-10!"/>
                      </div>
                    </div>

                    <!-- Country combobox -->
                    <div class="relative">
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">{{ langStore.t.countryLabel }}</label>
                      <div class="relative">
                        <BIcon name="Flag" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 pointer-events-none" />
                        <input
                          v-model="countrySearch"
                          type="text"
                          :placeholder="langStore.t.settingsProfileSelectCountryPlaceholder"
                          class="field-input pl-10! pr-8"
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
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">{{ langStore.t.cityLabel }}</label>
                      <div class="relative">
                        <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                        <input
                          v-model="citySearch"
                          type="text"
                          :placeholder="langStore.t.settingsProfileTypeOrSelectPlaceholder"
                          class="field-input pl-10!"
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
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">{{ langStore.t.relationshipLabel }}</label>
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
                    <div v-if="showPartnerPicker" class="p-4 bg-brand-bg/60 border border-brand-border/60 rounded-2xl stack-y-3">
                      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color:#ec4899">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                        </svg>
                        {{ langStore.t.settingsProfilePartnerFromFriends }}
                      </p>

                      <!-- Исходящая заявка: видна только отправителю, пока партнёр не ответил -->
                      <div v-if="outgoingRequest" class="flex items-center gap-3 p-3 rounded-xl border border-pink-500/30 bg-pink-500/5">
                        <img v-if="outgoingRequest.to.avatar_url" :src="outgoingRequest.to.avatar_url" class="w-8 h-8 rounded-full object-cover shrink-0"/>
                        <div v-else class="w-8 h-8 rounded-full bg-brand-border flex items-center justify-center text-xs font-bold text-white/55 shrink-0">
                          {{ (outgoingRequest.to.display_name ?? outgoingRequest.to.username)[0].toUpperCase() }}
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-bold text-white truncate">{{ outgoingRequest.to.display_name ?? outgoingRequest.to.username }}</p>
                          <p class="text-xs text-pink-300/70 truncate">{{ langStore.t.settingsProfilePartnerPending }}</p>
                        </div>
                        <button type="button" @click="cancelOutgoingRequest" :disabled="cancellingRequest"
                          class="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-white/55 hover:text-white hover:bg-white/10 transition-all shrink-0 disabled:opacity-50">
                          {{ langStore.t.settingsProfilePartnerCancelRequest }}
                        </button>
                      </div>

                      <!-- Current partner chip -->
                      <div v-if="selectedPartner" class="flex items-center gap-3 p-3 rounded-xl border border-brand-border bg-brand-card">
                        <img v-if="selectedPartner.avatar_url" :src="selectedPartner.avatar_url" class="w-8 h-8 rounded-full object-cover shrink-0"/>
                        <div v-else class="w-8 h-8 rounded-full bg-brand-border flex items-center justify-center text-xs font-bold text-white/55 shrink-0">
                          {{ (selectedPartner.display_name ?? selectedPartner.username)[0].toUpperCase() }}
                        </div>
                        <div class="flex-1 min-w-0">
                          <p class="text-sm font-bold text-white truncate">{{ selectedPartner.display_name ?? selectedPartner.username }}</p>
                          <p class="text-xs text-white/55 truncate">@{{ selectedPartner.username }}</p>
                        </div>
                        <button type="button" @click="clearPartner"
                          class="w-7 h-7 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-white/10 transition-all shrink-0">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                      </div>

                      <!-- Search / select -->
                      <div v-if="!outgoingRequest" class="relative">
                        <input
                          v-model="partnerSearch"
                          type="text"
                          :placeholder="langStore.t.settingsProfileFindByNamePlaceholder"
                          class="field-input"
                          @focus="partnerDropOpen = true"
                          @blur="onPartnerBlur"
                        />
                        <Transition name="fade">
                          <div v-if="partnerDropOpen && filteredPartners.length"
                            class="absolute z-30 mt-1 w-full bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-y-auto max-h-48">
                            <button v-for="u in filteredPartners" :key="u.id" type="button"
                              class="w-full flex items-center gap-3 px-4 py-2.5 transition-all"
                              :class="u.in_relationship ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white/5'"
                              :disabled="u.in_relationship"
                              @mousedown.prevent="selectPartner(u)">
                              <img v-if="u.avatar_url" :src="u.avatar_url" class="w-7 h-7 rounded-full object-cover shrink-0"/>
                              <div v-else class="w-7 h-7 rounded-full bg-brand-border flex items-center justify-center text-xs font-bold text-white/55 shrink-0">
                                {{ (u.display_name ?? u.username)[0].toUpperCase() }}
                              </div>
                              <div class="flex-1 min-w-0 text-left">
                                <p class="text-sm font-semibold text-white truncate">{{ u.display_name ?? u.username }}</p>
                                <p class="text-xs text-white/55 truncate">@{{ u.username }}</p>
                              </div>
                              <span v-if="u.in_relationship" class="text-xs font-semibold text-pink-300/80 shrink-0">{{ langStore.t.relStatusInRel }}</span>
                            </button>
                            <p v-if="!filteredPartners.length" class="text-xs text-white/55 px-4 py-3">{{ langStore.t.noPersonFound }}</p>
                          </div>
                        </Transition>
                      </div>
                      <p v-if="!outgoingRequest && !followingList.length" class="text-xs text-white/35">{{ langStore.t.noFollowingYet }}</p>
                    </div>
                  </Transition>

                  <!-- ── Соцсети ────────────────────────────── -->
                  <div class="pt-2">
                    <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-3">{{ langStore.t.socialNetworksLabel }}</label>
                    <div class="stack-y-2">
                      <div v-for="net in socialNetworks" :key="net.key" class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border"
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

                  <!-- ── Донат ────────────────────────────── -->
                  <div class="pt-2">
                    <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">{{ langStore.t.settingsProfileDonateLinkLabel }}</label>
                    <div class="relative">
                      <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/70 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <input v-model="form.donate_url" type="url" :placeholder="langStore.t.settingsProfileDonatePlaceholder" class="field-input pl-10!"/>
                    </div>
                    <p class="text-[11px] text-white/35 mt-1.5">{{ langStore.t.settingsProfileDonateHint }}</p>
                  </div>

                  <!-- ── Статус заказов (Pro и Business) ────── -->
                  <div class="pt-2">
                    <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">🎨 {{ langStore.t.commissionsSettingTitle }}</label>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button v-for="opt in commissionsOptions" :key="opt.value" type="button" @click="setCommissions(opt.value)"
                        :disabled="!canSetCommissions && opt.value !== 'none'"
                        class="px-3 py-2 rounded-xl border text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        :class="commissionsStatus === opt.value ? 'border-brand-accent bg-brand-accent/15 text-white' : 'border-brand-border bg-brand-bg/40 text-white/60 hover:border-brand-accent/40'">
                        {{ opt.label }}
                      </button>
                    </div>
                    <p class="text-[11px] mt-1.5" :class="canSetCommissions ? 'text-white/35' : 'text-amber-300/80'">
                      {{ canSetCommissions ? langStore.t.commissionsSettingHint : langStore.t.commissionsNeedPro }}
                    </p>
                  </div>

                </div>
              </section>

              <!-- ── § 3: FURSONA ────────────────────────────────────── -->
              <section v-show="openSection === sections[2].id" :id="sections[2].id"
                class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28"
                :class="sectionHighlight === sections[2].id ? 'section-link-flash' : ''">
                <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                  :style="`background:linear-gradient(90deg,${sections[2].color}0c 0%,transparent 100%)`">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" :style="`background:${sections[2].color}1a`">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${sections[2].color}`">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="sections[2].iconPath"/>
                    </svg>
                  </div>
                  <h2 class="font-bold text-white text-sm">{{ sections[2].label }}</h2>
                </div>
                <div class="p-6 stack-y-5">
                  <FursonaSettings ref="fursonaRef" @dirty="fursonaIsDirty = $event" />
                  <FursuitSettings />
                </div>
              </section>

              <!-- ── § 4: APPEARANCE ─────────────────────────────────── -->

              <!-- ── Section 4: Profile style ──────────────────────── -->
              <section v-show="openSection === sections[3].id" :id="sections[3].id" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3"
                  :style="`background:linear-gradient(90deg,${sections[3].color}0c 0%,transparent 100%)`">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" :style="`background:${sections[3].color}1a`">
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
                    :class="authStore.user?.subscription_tier === 'pro' || authStore.user?.subscription_tier === 'business'
                      ? 'text-brand-accent border-brand-accent/30 bg-brand-accent/5'
                      : 'text-amber-400 border-amber-400/30 bg-amber-400/5'">
                    {{ authStore.user?.subscription_tier === 'free' ? langStore.t.settingsProfileLiteForThemes : authStore.user?.subscription_tier?.toUpperCase() }}
                  </router-link>
                </div>

                <div class="p-6 stack-y-7">

                  <!-- ── Theme selector (Lite+) ────────────────────────── -->
                  <div>
                    <div class="flex items-center justify-between mb-3">
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider">{{ langStore.t.profileThemeLabel }}</label>
                      <span class="text-[10px] text-amber-400 font-bold bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">Lite</span>
                    </div>
                    <div v-if="['free'].includes(authStore.user?.subscription_tier ?? 'free')"
                      class="rounded-2xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 flex items-center gap-3">
                      <BIcon name="Lock" class="w-4 h-4 text-amber-400 shrink-0" />
                      <p class="text-xs text-white/55">{{ langStore.t.profileThemeLiteSub }} <router-link to="/subscriptions" class="text-amber-400 hover:underline font-bold">Lite</router-link>.</p>
                    </div>
                    <div v-else>
                      <!-- Live preview: ваш аватар, рамка и выбранная тема -->
                      <div class="rounded-2xl overflow-hidden border border-brand-border mb-5 transition-colors"
                        :style="`background:${previewTheme.bg}`">
                        <div class="h-16 w-full" :style="`background:linear-gradient(135deg, ${previewTheme.accent}55, ${previewTheme.bg})`"></div>
                        <div class="px-5 pb-5 -mt-8 flex items-end gap-4">
                          <div class="relative w-[72px] h-[72px] shrink-0">
                            <div class="w-full h-full rounded-full bg-white/10 overflow-hidden flex items-center justify-center text-white/60 font-bold text-xl"
                              :class="previewFrameClass" :style="previewFrameStyle">
                              <img v-if="form.avatar_url" :src="form.avatar_url" class="w-full h-full object-cover" />
                              <span v-else>{{ (form.display_name || form.username || '?').charAt(0).toUpperCase() }}</span>
                            </div>
                            <AvatarFrameOverlay v-if="previewCustomFrame" :frame="previewCustomFrame" />
                          </div>
                          <div class="min-w-0 pb-1">
                            <p class="text-sm font-extrabold text-white truncate">{{ form.display_name || form.username }}</p>
                            <p class="text-[11px] text-white/45 truncate">@{{ form.username }}</p>
                          </div>
                          <span class="ml-auto mb-1 text-[10px] font-bold px-2.5 py-1 rounded-full text-white shrink-0"
                            :style="`background:${previewTheme.accent}`">{{ previewTheme.label }}</span>
                        </div>
                        <div class="px-5 pb-5 grid grid-cols-3 gap-2">
                          <div v-for="i in 3" :key="i" class="h-10 rounded-xl border border-white/5" :style="`background:${previewTheme.cardBg}`"></div>
                        </div>
                      </div>

                      <!-- Theme swatches -->
                      <div class="rounded-2xl bg-brand-bg/60 border border-brand-border p-5 grid grid-cols-3 sm:grid-cols-4 gap-x-3 gap-y-5">
                        <button v-for="(theme, id) in PROFILE_THEMES" :key="id" type="button"
                          @click="form.profile_theme = id"
                          class="group flex flex-col items-center gap-2">
                          <span class="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden transition-all flex items-center justify-center ring-2 ring-offset-2 ring-offset-[#12141f]"
                            :class="form.profile_theme === id ? 'ring-white scale-105 shadow-lg' : 'ring-white/10 group-hover:ring-white/30'"
                            :style="`background:radial-gradient(circle at 30% 28%, ${theme.accent} 0%, ${theme.accent}99 38%, ${theme.cardBg} 100%)`">
                            <BIcon v-if="form.profile_theme === id" name="Check" class="w-6 h-6 text-white drop-shadow" />
                          </span>
                          <span class="text-xs font-semibold" :class="form.profile_theme === id ? 'text-white' : 'text-white/55'">{{ theme.label }}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- ── Avatar frame (Pro+) ────────────────────────────── -->
                  <div>
                    <div class="flex items-center justify-between mb-3">
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider">{{ langStore.t.avatarFrameLabel }}</label>
                      <span class="text-[10px] text-brand-accent font-bold bg-brand-accent/10 px-2 py-0.5 rounded-full border border-brand-accent/20">Pro</span>
                    </div>
                    <div v-if="!['pro', 'business'].includes(authStore.user?.subscription_tier ?? 'free')"
                      class="rounded-2xl border border-brand-accent/20 bg-brand-accent/5 px-4 py-3 flex items-center gap-3">
                      <BIcon name="Lock" class="w-4 h-4 text-brand-accent shrink-0" />
                      <p class="text-xs text-white/55">{{ langStore.t.avatarFrameProSub }} <router-link to="/subscriptions" class="text-brand-accent hover:underline font-bold">Pro</router-link>.</p>
                    </div>
                    <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <button v-for="(frame, id) in PROFILE_FRAMES" :key="id" type="button"
                        @click="form.profile_frame = id; form.profile_frame_id = null"
                        class="relative flex items-center gap-3 rounded-2xl px-4 py-3 border-2 transition-all"
                        :class="form.profile_frame === id && !form.profile_frame_id
                          ? 'border-brand-accent bg-brand-accent/10'
                          : 'border-brand-border hover:border-white/20 bg-brand-bg'">
                        <!-- Mini avatar preview with frame -->
                        <div class="w-10 h-10 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-sm shrink-0 overflow-hidden"
                          :class="frame.style || ''"
                          :style="id === 'rainbow' ? { boxShadow: rainbowShadow(1) } : {}">
                          <img v-if="form.avatar_url" :src="form.avatar_url" class="w-full h-full object-cover" />
                          <span v-else>{{ (form.display_name || form.username || 'B').charAt(0).toUpperCase() }}</span>
                        </div>
                        <span class="text-xs font-bold text-white">{{ frame.label }}</span>
                        <BIcon v-if="form.profile_frame === id && !form.profile_frame_id" name="Check" class="w-4 h-4 text-brand-accent ml-auto shrink-0" />
                      </button>
                    </div>
                  </div>

                  <!-- ── Owned image-based frames (from Dealers' Den) ─────── -->
                  <div>
                    <div class="flex items-center justify-between mb-3">
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider">{{ langStore.t.avatarFrameMineTitle }}</label>
                      <router-link to="/dealers-den" class="text-[11px] font-bold text-brand-accent hover:underline">{{ langStore.t.avatarFrameFindMore }}</router-link>
                    </div>
                    <p v-if="!myFrames.length" class="text-xs text-white/35">{{ langStore.t.avatarFrameNoneOwned }}</p>
                    <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div v-for="mf in myFrames" :key="mf.id"
                        class="relative flex flex-col gap-2 rounded-2xl px-4 py-3 border-2 transition-all"
                        :class="form.profile_frame_id === mf.id
                          ? 'border-brand-accent bg-brand-accent/10'
                          : 'border-brand-border hover:border-white/20 bg-brand-bg'">
                        <button type="button" class="flex items-center gap-3" @click="form.profile_frame_id = mf.id; form.profile_frame = ''">
                          <div class="relative w-10 h-10 shrink-0">
                            <div class="w-10 h-10 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-sm overflow-hidden">
                              <img v-if="authStore.avatarUrl" :src="authStore.avatarUrl" class="w-full h-full object-cover" />
                            </div>
                            <AvatarFrameOverlay :frame="{ image_url: mf.image_url, offset_x: mf.offset_x, offset_y: mf.offset_y, scale: mf.scale, rotation: mf.rotation }" />
                          </div>
                          <span class="text-xs font-bold text-white truncate">{{ mf.name }}</span>
                          <BIcon v-if="form.profile_frame_id === mf.id" name="Check" class="w-4 h-4 text-brand-accent ml-auto shrink-0" />
                        </button>
                        <button type="button" @click="openFrameCalibration(mf)" class="text-[10px] font-bold text-white/40 hover:text-brand-accent text-left">
                          {{ langStore.t.avatarFrameCustomizeBtn }}
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- ── Calibration editor modal ──────────────────────────── -->
                  <div v-if="calibratingFrame" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" @click.self="calibratingFrame = null">
                    <div class="bg-brand-card border border-brand-border rounded-3xl w-full max-w-sm p-5 stack-y-4">
                      <div class="flex items-center justify-between">
                        <h3 class="text-sm font-black text-white">{{ langStore.t.avatarFrameCalibrateTitle }}</h3>
                        <button @click="calibratingFrame = null" class="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center">
                          <BIcon name="X" class="w-4 h-4 text-white/60" />
                        </button>
                      </div>
                      <FrameEditor
                        :avatar-url="authStore.avatarUrl || '/icons/badges/NN.jpg'"
                        :frame-image-url="calibratingFrame.image_url"
                        v-model="calibrationDraft"
                      />
                      <button type="button" :disabled="savingCalibration" @click="saveFrameCalibration"
                        class="w-full flex items-center justify-center gap-2 py-3 text-white text-sm font-bold rounded-2xl transition-all disabled:opacity-50"
                        style="background: linear-gradient(135deg, #3148FF, #4C67CF)">
                        <span v-if="savingCalibration" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {{ langStore.t.avatarFrameSubmitAction }}
                      </button>
                    </div>
                  </div>

                  <!-- ── Custom background (Pro+) ──────────────────────── -->
                  <div>
                    <div class="flex items-center justify-between mb-3">
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider">{{ langStore.t.profileBgLabel }}</label>
                      <span class="text-[10px] text-brand-accent font-bold bg-brand-accent/10 px-2 py-0.5 rounded-full border border-brand-accent/20">Pro</span>
                    </div>
                    <div v-if="!['pro', 'business'].includes(authStore.user?.subscription_tier ?? 'free')"
                      class="rounded-2xl border border-brand-accent/20 bg-brand-accent/5 px-4 py-3 flex items-center gap-3">
                      <BIcon name="Lock" class="w-4 h-4 text-brand-accent shrink-0" />
                      <p class="text-xs text-white/55">{{ langStore.t.customBgPro }} <router-link to="/subscriptions" class="text-brand-accent hover:underline font-bold">Pro</router-link>.</p>
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
                          <span class="text-white/55 text-sm font-bold">{{ form.profile_bg_url ? langStore.t.settingsProfileChangeBg : langStore.t.settingsProfileUploadBg }}</span>
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
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" :style="`background:${sections[4].color}1a`">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" :style="`color:${sections[4].color}`">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="sections[4].iconPath"/>
                    </svg>
                  </div>
                  <div>
                    <h2 class="font-bold text-white text-sm">{{ sections[4].label }}</h2>
                    <p class="text-[10px] text-white/40">{{ langStore.t.verFairVerification }}</p>
                  </div>
                </div>

                <div class="p-6 stack-y-6">

                  <!-- Loading state -->
                  <div v-if="isLoadingVerification" class="flex items-center justify-center py-8">
                    <div class="w-6 h-6 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
                  </div>

                  <template v-else>
                    <!-- Already verified -->
                    <div v-if="verificationStatus?.isVerified" class="text-center py-6">
                      <div class="w-16 h-16 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center mx-auto mb-4">
                        <BIcon name="ShieldCheck" class="w-8 h-8 text-blue-400" />
                      </div>
                      <h3 class="text-lg font-bold text-white mb-1">{{ langStore.t.accountVerified }}</h3>
                      <p class="text-sm text-white/55">{{ langStore.t.verifiedAt }} {{ verificationStatus.verifiedAt ? new Date(verificationStatus.verifiedAt).toLocaleDateString() : '' }}</p>
                      <div v-if="verificationStatus.verificationType && verTypeMeta[verificationStatus.verificationType]"
                        class="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-2xl border text-xs font-bold"
                        :class="verTypeMeta[verificationStatus.verificationType].badgeCls">
                        <img :src="verTypeIconUrl(verificationStatus.verificationType)" :alt="verificationStatus.verificationType" class="w-4 h-4 rounded-xs shrink-0 object-cover" />
                        {{ verTypeMeta[verificationStatus.verificationType].label }}
                      </div>
                      <div class="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold">
                        <BIcon name="Check" class="w-4 h-4" />
                        {{ langStore.t.verDonationsAvailable }}
                      </div>
                    </div>

                    <!-- Pending request -->
                    <div v-else-if="verificationStatus?.latestRequest?.status === 'pending'" class="text-center py-6">
                      <div class="w-16 h-16 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center mx-auto mb-4">
                        <BIcon name="Clock" class="w-8 h-8 text-amber-400 animate-pulse" />
                      </div>
                      <h3 class="text-lg font-bold text-white mb-1">{{ langStore.t.verPending }}</h3>
                      <p class="text-sm text-white/55">{{ langStore.t.verPendingDesc }}</p>
                      <p class="text-xs text-white/40 mt-2">{{ langStore.t.verSentLabel }} {{ new Date(verificationStatus.latestRequest.created_at).toLocaleDateString() }}</p>
                      <div v-if="verificationStatus.latestRequest.verification_type && verTypeMeta[verificationStatus.latestRequest.verification_type]"
                        class="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold"
                        :class="verTypeMeta[verificationStatus.latestRequest.verification_type].badgeCls">
                        <img :src="verTypeIconUrl(verificationStatus.latestRequest.verification_type)" :alt="verificationStatus.latestRequest.verification_type" class="w-4 h-4 rounded-xs shrink-0 object-cover" />
                        {{ verTypeMeta[verificationStatus.latestRequest.verification_type].label }}
                      </div>
                    </div>

                    <!-- Rejected request -->
                    <div v-else-if="verificationStatus?.latestRequest?.status === 'rejected'" class="stack-y-4">
                      <div class="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3">
                        <BIcon name="AlertTriangle" class="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <p class="text-sm font-bold text-rose-400">{{ langStore.t.verRejected }}</p>
                          <p v-if="verificationStatus.latestRequest.reason" class="text-xs text-white/55 mt-1">{{ verificationStatus.latestRequest.reason }}</p>
                          <p class="text-xs text-white/40 mt-1">{{ langStore.t.verRejectedHint }}</p>
                        </div>
                      </div>
                    </div>

                    <!-- Show form (not verified, no pending request or has rejected) -->
                    <template v-if="!verificationStatus?.isVerified && verificationStatus?.latestRequest?.status !== 'pending'">

                      <!-- Profile completeness -->
                      <div>
                        <h3 class="font-bold text-sm text-white mb-3 flex items-center gap-2">
                          <BIcon name="UserCheck" class="w-4 h-4 text-blue-400 shrink-0" />
                          {{ langStore.t.verProfileCompletenessTitle }}
                          <span class="ml-auto text-xs font-bold"
                            :class="localCompleteness.canSubmit ? 'text-emerald-400' : 'text-amber-400'">
                            {{ localCompleteness.percentage }}%
                          </span>
                        </h3>
                        <div class="w-full h-3 bg-brand-bg rounded-full overflow-hidden border border-brand-border">
                          <div class="h-full rounded-full transition-all duration-500"
                            :class="localCompleteness.canSubmit ? 'bg-linear-to-r/srgb from-emerald-500 to-emerald-400' : 'bg-linear-to-r/srgb from-amber-500 to-amber-400'"
                            :style="`width: ${localCompleteness.percentage}%`"></div>
                        </div>
                        <div class="grid grid-cols-2 gap-2 mt-3">
                          <div v-for="field in completenessFields" :key="field.key"
                            class="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs"
                            :class="field.met ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' : 'bg-brand-bg border-brand-border text-white/40'">
                            <BIcon v-if="field.met" name="Check" class="w-3.5 h-3.5 shrink-0" />
                            <BIcon v-else name="X" class="w-3.5 h-3.5 shrink-0" />
                            {{ field.label }}
                          </div>
                        </div>
                        <p v-if="!localCompleteness.canSubmit" class="text-xs text-amber-400/80 mt-2 flex items-center gap-1.5">
                          <BIcon name="Info" class="w-3.5 h-3.5 shrink-0" />
                          {{ langStore.t.verFillProfile80 }}
                        </p>
                      </div>

                      <!-- Criteria checklist -->
                      <div>
                        <h3 class="font-bold text-sm text-white mb-3 flex items-center gap-2">
                          <BIcon name="ClipboardList" class="w-4 h-4 text-blue-400 shrink-0" />
                          {{ langStore.t.verCriteriaTitle }}
                        </h3>
                        <div class="stack-y-2">
                          <div v-for="(cr, i) in verCriteriaList" :key="i"
                            class="flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all"
                            :class="cr.met ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-brand-bg border-brand-border'">
                            <div class="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                              :class="cr.met ? 'bg-emerald-500/20' : 'bg-white/5'">
                              <BIcon v-if="cr.met" name="Check" class="w-3.5 h-3.5 text-emerald-400" />
                              <BIcon v-else name="X" class="w-3.5 h-3.5 text-white/30" />
                            </div>
                            <span class="text-sm font-semibold flex-1" :class="cr.met ? 'text-white' : 'text-white/55'">{{ cr.label }}</span>
                            <span v-if="cr.detail" class="text-xs font-bold" :class="cr.met ? 'text-emerald-400' : 'text-white/40'">{{ cr.detail }}</span>
                          </div>
                        </div>
                      </div>

                      <!-- Verification type selector -->
                      <div>
                        <h3 class="font-bold text-sm text-white mb-3 flex items-center gap-2">
                          <BIcon name="BadgeCheck" class="w-4 h-4 text-purple-400 shrink-0" />
                          {{ langStore.t.verTypeTitle }}
                        </h3>
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <button v-for="vt in VER_TYPES" :key="vt.id"
                            type="button" @click="selectedVerType = vt.id as any"
                            class="relative rounded-2xl overflow-hidden transition-all text-left aspect-square"
                            :class="selectedVerType === vt.id ? `ring-4 ${vt.ringSel} shadow-lg` : 'hover:brightness-110'">
                            <img :src="verTypeIconUrl(vt.id)" :alt="vt.id" class="absolute inset-0 w-full h-full object-cover" />
                            <div class="absolute inset-x-0 top-0 bg-linear-to-b/srgb from-black/80 via-black/30 to-transparent px-3 pt-2.5 pb-6">
                              <span class="font-extrabold text-sm sm:text-base sm:leading-6 text-white leading-tight drop-shadow-sm">
                                {{ langStore.t[vt.titleKey] }}
                              </span>
                            </div>
                            <div v-if="selectedVerType === vt.id"
                              class="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                              :class="vt.badge">
                              <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                            </div>
                          </button>
                        </div>
                      </div>

                      <!-- Evidence upload -->
                      <div v-if="selectedVerType">
                        <h3 class="font-bold text-sm text-white mb-3 flex items-center gap-2">
                          <BIcon name="ImagePlus" class="w-4 h-4 text-blue-400 shrink-0" />
                          {{ langStore.t.verEvidenceTitle }}
                          <span v-if="selectedVerType !== 'popular'" class="text-[10px] text-white/40 font-normal ml-1">{{ evidenceUrls.length }}/5</span>
                        </h3>

                        <!-- Evidence description per type -->
                        <div class="bg-blue-500/5 border border-blue-500/15 rounded-2xl px-4 py-3 mb-3">
                          <p class="text-xs text-white/55">
                            <span class="text-blue-400 font-bold">{{ langStore.t.verRequirementsLabel }}</span>
                            <span v-if="selectedVerType === 'artist'">{{ langStore.t.verEvidenceDescArtist }}</span>
                            <span v-else-if="selectedVerType === 'master'">{{ langStore.t.verEvidenceDescMaster }} ({{ authStore.user?.id?.slice(0,8) }}).</span>
                            <span v-else-if="selectedVerType === 'event'">{{ langStore.t.verEvidenceDescEvent }}</span>
                            <span v-else-if="selectedVerType === 'fursuiter'">{{ langStore.t.verEvidenceDescFursuiter }}</span>
                            <span v-else-if="selectedVerType === 'popular'">{{ langStore.t.verEvidenceDescPopular }}</span>
                            <span v-else-if="selectedVerType === 'writer'">{{ langStore.t.verEvidenceDescWriter }}</span>
                            <span v-else-if="selectedVerType === 'organizer'">{{ langStore.t.verEvidenceDescOrganizer }}</span>
                            <span v-else-if="selectedVerType === 'photographer'">{{ langStore.t.verEvidenceDescPhotographer }} ({{ authStore.user?.id?.slice(0,8) }}).</span>
                            <span v-else-if="selectedVerType === 'programmer'">{{ langStore.t.verEvidenceDescProgrammer }} ({{ authStore.user?.id?.slice(0,8) }}).</span>
                          </p>
                        </div>

                        <!-- Social links section (popular type) -->
                        <div v-if="selectedVerType === 'popular'" class="mb-3 stack-y-2">
                          <p class="text-xs font-bold text-white/70 flex items-center gap-1.5">
                            <BIcon name="Link" class="w-3.5 h-3.5 text-blue-400" />
                            {{ langStore.t.verLinksTitle }}
                          </p>
                          <div v-for="(_, i) in popularLinks" :key="i" class="flex items-center gap-2">
                            <input v-model="popularLinks[i]" type="url"
                              :placeholder="langStore.t.verLinkPlaceholder"
                              class="flex-1 px-3 py-2 rounded-xl bg-brand-bg border border-brand-border text-sm text-white placeholder-white/30 focus:outline-hidden focus:border-blue-500/60 transition-colors" />
                            <button v-if="popularLinks.length > 1" type="button" @click="popularLinks.splice(i, 1)"
                              class="w-7 h-7 rounded-lg bg-white/5 hover:bg-rose-500/15 text-white/40 hover:text-rose-400 flex items-center justify-center transition-colors shrink-0">
                              <BIcon name="X" class="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <button v-if="popularLinks.length < 5" type="button" @click="popularLinks.push('')"
                            class="text-xs text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1">
                            {{ langStore.t.verAddLinkBtn }}
                          </button>
                        </div>

                        <!-- Evidence upload -->
                        <MediaUpload
                          ref="evidenceUploadRef"
                          folder="verification"
                          accept="image/*,video/*"
                          :multiple="true"
                          :max-files="5"
                          @uploaded="onEvidenceUploaded"
                        />

                        <!-- Text evidence (in addition to, or instead of, photo/video) -->
                        <div v-if="selectedVerType !== 'popular'" class="mt-3">
                          <p class="text-xs font-bold text-white/70 flex items-center gap-1.5 mb-1.5">
                            <BIcon name="FileText" class="w-3.5 h-3.5 text-blue-400" />
                            {{ langStore.t.verEvidenceTextLabel }}
                            <span class="text-[10px] text-white/40 font-normal ml-1">{{ evidenceText.length }}/2000</span>
                          </p>
                          <textarea v-model="evidenceText" maxlength="2000" rows="3"
                            :placeholder="langStore.t.verEvidenceTextPlaceholder"
                            class="w-full px-3 py-2 rounded-xl bg-brand-bg border border-brand-border text-sm text-white placeholder-white/30 focus:outline-hidden focus:border-blue-500/60 transition-colors resize-none"></textarea>
                          <p class="text-[10px] text-white/40 mt-1">{{ langStore.t.verEvidenceTextHint }}</p>
                        </div>
                      </div>

                      <!-- Anti-AI notice -->
                      <div class="bg-rose-500/5 border border-rose-500/15 rounded-2xl px-4 py-3">
                        <p class="text-xs text-white/55 flex items-start gap-1.5">
                          <BIcon name="AlertTriangle" class="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                          <span><span class="text-rose-400 font-bold">{{ langStore.t.verImportantLabel }}</span>{{ langStore.t.verAntiAINotice }}</span>
                        </p>
                      </div>

                      <!-- Submit button -->
                      <button type="button" @click="requestVerification"
                        :disabled="isRequestingVerification || !canSubmitVer"
                        class="w-full py-3.5 rounded-2xl text-sm font-bold text-white transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        style="background: linear-gradient(135deg, #3b82f6, #2563eb); box-shadow: 0 4px 20px rgba(59,130,246,0.35)">
                        <span v-if="isRequestingVerification" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        <BIcon v-else name="ShieldCheck" class="w-4 h-4" />
                        {{ isRequestingVerification ? langStore.t.verSubmitSending : !localCompleteness.canSubmit ? langStore.t.verSubmitNoProfile : !selectedVerType ? langStore.t.verSubmitNoType : !canSubmitVer ? langStore.t.verSubmitNoEvidence : langStore.t.verSubmitBtn }}
                      </button>
                    </template>
                  </template>

                </div>
              </section>

              <!-- ── § PRIVACY: Приватность ─────────────────────────── -->
              <section v-show="openSection === 'sec-privacy'" id="sec-privacy" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3" style="background:linear-gradient(90deg,rgba(236,72,153,0.07) 0%,transparent 100%)">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style="background:rgba(236,72,153,0.15)">
                    <svg class="w-4 h-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c0-1.104.896-2 2-2s2 .896 2 2-.896 2-2 2-2-.896-2-2zm-6 0a6 6 0 1112 0 6 6 0 01-12 0zM3 21c0-3.314 4.03-6 9-6s9 2.686 9 6"/>
                    </svg>
                  </div>
                  <h2 class="font-bold text-white text-sm">{{ langStore.t.secPrivacy }}</h2>
                </div>
                <div class="p-6 stack-y-3">
                  <div>
                    <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">{{ langStore.t.birthdayVisibilityLabel }}</label>
                    <p class="text-[11px] text-white/35 mb-3">{{ langStore.t.birthdayVisibilityHint }}</p>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        v-for="opt in birthdayVisibilityOptions" :key="opt.value"
                        type="button"
                        @click="form.birth_date_visibility = opt.value"
                        class="px-3 py-2.5 rounded-2xl text-xs font-bold border transition-all"
                        :class="form.birth_date_visibility === opt.value ? 'text-white border-transparent' : 'bg-brand-bg border-brand-border text-white/55 hover:text-white hover:border-white/20'"
                        :style="form.birth_date_visibility === opt.value ? `background:${form.accent_color};box-shadow:0 4px 16px ${form.accent_color}44` : ''">
                        {{ opt.label }}
                      </button>
                    </div>
                  </div>

                  <div class="border-t border-brand-border/50 my-1"></div>

                  <div v-for="row in privacyRows" :key="row.field">
                    <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">{{ row.label }}</label>
                    <div class="grid grid-cols-3 gap-2">
                      <button
                        v-for="opt in row.options" :key="String(opt.value)"
                        type="button"
                        @click="(form as any)[row.field] = opt.value"
                        class="px-3 py-2.5 rounded-2xl text-xs font-bold border transition-all"
                        :class="(form as any)[row.field] === opt.value ? 'text-white border-transparent' : 'bg-brand-bg border-brand-border text-white/55 hover:text-white hover:border-white/20'"
                        :style="(form as any)[row.field] === opt.value ? `background:${form.accent_color};box-shadow:0 4px 16px ${form.accent_color}44` : ''">
                        {{ opt.label }}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <!-- ── § INTERESTS: тег-профиль по лайкам/дизлайкам ───── -->
              <section v-show="openSection === 'sec-interests'" id="sec-interests" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3" style="background:linear-gradient(90deg,rgba(52,211,153,0.07) 0%,transparent 100%)">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style="background:rgba(52,211,153,0.15)">
                    <BIcon name="Heart" class="w-4 h-4 text-emerald-400" />
                  </div>
                  <h2 class="font-bold text-white text-sm">{{ langStore.t.secInterests }}</h2>
                </div>
                <div class="p-6 stack-y-6">
                  <!-- Declared favourites, picked at onboarding, editable here -->
                  <div>
                    <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-2">{{ langStore.t.interestsPickTitle }}</label>
                    <p class="text-[11px] text-white/35 mb-3">{{ langStore.t.interestsPickHint }}</p>
                    <div class="grid sm:grid-cols-2 gap-3">
                      <div v-for="cat in FAVORITE_CATEGORIES" :key="cat.key">
                        <label class="text-[11px] font-semibold text-white/45 block mb-1">{{ cat.label }}</label>
                        <input
                          type="text"
                          :value="favorites[cat.key]"
                          @change="updateFavorite(cat.key, ($event.target as HTMLInputElement).value)"
                          :placeholder="cat.placeholder"
                          maxlength="80"
                          class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-white outline-hidden focus:border-brand-accent/50 transition-colors" />
                      </div>
                    </div>
                  </div>

                  <div class="border-t border-brand-border/50"></div>

                  <!-- Behavioural tag affinity, weighed like a scale from votes cast -->
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <label class="text-xs font-bold text-white/55 uppercase tracking-wider">{{ langStore.t.interestsCloudTitle }}</label>
                      <span v-if="tagInsights?.unlocked && tagInsights.tags.length > 0" class="flex items-center gap-3 text-[10px] font-bold shrink-0">
                        <span class="flex items-center gap-1 text-emerald-400"><span class="w-2 h-2 rounded-full bg-emerald-400"></span>{{ langStore.t.interestsLikedLabel }}</span>
                        <span class="flex items-center gap-1 text-rose-400"><span class="w-2 h-2 rounded-full bg-rose-400"></span>{{ langStore.t.interestsDislikedLabel }}</span>
                      </span>
                    </div>
                    <p class="text-[11px] text-white/35 mb-4">{{ langStore.t.interestsCloudHint }}</p>

                    <div v-if="tagInsightsLoading" class="py-8 flex items-center justify-center">
                      <span class="w-5 h-5 border-2 border-brand-accent/60 border-t-transparent rounded-full animate-spin"></span>
                    </div>

                    <div v-else-if="!tagInsights?.unlocked" class="flex flex-col items-center text-center gap-3 py-8 px-4 bg-brand-bg/60 border border-brand-border rounded-2xl">
                      <div class="w-10 h-10 rounded-2xl flex items-center justify-center bg-white/5">
                        <BIcon name="Lock" class="w-5 h-5 text-white/40" />
                      </div>
                      <p class="text-sm font-bold text-white">{{ langStore.t.interestsLockedTitle }}</p>
                      <p class="text-xs text-white/45 max-w-xs">{{ langStore.t.interestsLockedHint }}</p>
                      <div class="w-full max-w-xs h-2 rounded-full bg-white/10 overflow-hidden mt-1">
                        <div class="h-full rounded-full transition-all"
                          :style="`width:${Math.min(100, ((tagInsights?.votesGiven ?? 0) / (tagInsights?.threshold ?? 20)) * 100)}%;background:${form.accent_color}`"></div>
                      </div>
                      <p class="text-[11px] text-white/40 font-semibold">{{ tagInsights?.votesGiven ?? 0 }} / {{ tagInsights?.threshold ?? 20 }}</p>
                    </div>

                    <div v-else-if="tagInsights.tags.length === 0" class="py-8 text-center text-xs text-white/35">
                      {{ langStore.t.interestsEmptyState }}
                    </div>

                    <div v-else class="flex flex-wrap items-baseline gap-x-3 gap-y-2 py-2">
                      <span v-for="t in tagInsights.tags" :key="t.name"
                        class="font-bold leading-none transition-transform hover:scale-110 cursor-default"
                        :style="`font-size:${tagFontSize(t)};color:${tagColor(t)}`"
                        :title="`#${t.name} · +${t.likes} / -${t.dislikes}`">
                        #{{ t.name }}
                      </span>
                    </div>
                  </div>
                </div>
              </section>

              <!-- ── § LANG: Язык интерфейса ───────────────────────── -->
              <section v-show="openSection === 'sec-lang'" id="sec-lang" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3" style="background:linear-gradient(90deg,rgba(245,158,11,0.07) 0%,transparent 100%)">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style="background:rgba(245,158,11,0.18)">
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
                      type="button"
                      @click="langStore.setLang(opt.code)"
                      class="flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all"
                      :class="langStore.currentLang === opt.code
                        ? 'border-amber-400 bg-amber-400/10 shadow-lg shadow-amber-400/10'
                        : 'border-brand-border bg-brand-bg/40 hover:border-amber-400/40 hover:bg-amber-400/5'">
                      <span :class="`fi fi-${opt.fi} rounded-xs`" style="font-size:2rem"></span>
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
                        <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style="background:rgba(245,158,11,0.12)">
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
                        type="button"
                        @click="langStore.setAutoTranslate(!langStore.autoTranslateEnabled)"
                        class="relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200"
                        :class="langStore.autoTranslateEnabled ? 'bg-amber-400' : 'bg-white/15'"
                      >
                        <span
                          class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200"
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
                            type="button"
                            @click="langStore.setAutoTranslateLang(opt.code)"
                            class="flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all"
                            :class="langStore.autoTranslateLang === opt.code
                              ? 'border-amber-400 bg-amber-400/10'
                              : 'border-brand-border bg-brand-bg/40 hover:border-amber-400/30'"
                          >
                            <span :class="`fi fi-${opt.fi} rounded-xs`" style="font-size:1.25rem"></span>
                            <span class="text-[11px] font-bold" :class="langStore.autoTranslateLang === opt.code ? 'text-amber-400' : 'text-white/50'">{{ opt.code }}</span>
                          </button>
                        </div>
                      </div>
                    </Transition>
                  </div>
                </div>

                <!-- ── Регион для оплаты ── -->
                <div class="px-6 pb-6">
                  <div class="rounded-2xl border border-brand-border bg-brand-bg/40 p-4">
                    <p class="text-sm font-semibold text-white">{{ langStore.t.secLangRegionLabel }}</p>
                    <p class="text-xs text-white/40 mt-0.5 mb-3">{{ langStore.t.secLangRegionHint }}</p>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                      <button v-for="r in PAYMENT_REGIONS" :key="r.id" type="button"
                        @click="setPaymentRegion(r.id)"
                        class="relative flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition-all"
                        :class="paymentRegion === r.id ? 'border-brand-accent bg-brand-accent/10' : 'border-brand-border bg-brand-bg hover:border-white/20'">
                        <span class="relative shrink-0 w-10 h-10 rounded-full overflow-hidden flex items-center justify-center border border-white/10 bg-white/5">
                          <span v-if="REGION_VISUAL[r.id].flag" :class="`fi fi-${REGION_VISUAL[r.id].flag} fis`" style="font-size:2.5rem;line-height:1"></span>
                          <BIcon v-else name="Globe" class="w-5 h-5 text-white/70" />
                        </span>
                        <span class="min-w-0 flex-1">
                          <span class="block text-xs font-bold text-white truncate">{{ regionLabel(r.id, LANG_TO_LOCALE[langStore.currentLang], langStore.t.secRegionOther) }}</span>
                          <span v-if="REGION_VISUAL[r.id].currency" class="mt-0.5 inline-flex items-center gap-1 text-[10px] font-extrabold tracking-wide"
                            :style="`color:${REGION_VISUAL[r.id].color}`">
                            <span class="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[9px] text-white" :style="`background:${REGION_VISUAL[r.id].color}`">{{ REGION_VISUAL[r.id].symbol }}</span>
                            {{ REGION_VISUAL[r.id].currency }}
                          </span>
                          <span v-else class="mt-0.5 block text-[10px] font-bold text-white/35">$ € ₽ …</span>
                        </span>
                        <BIcon v-if="paymentRegion === r.id" name="Check" class="w-4 h-4 text-brand-accent shrink-0" />
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <!-- ── § 6: БЕЗОПАСНОСТЬ / Способы входа ─────────────── -->
              <SettingsNotificationsSection v-show="openSection === 'sec-notifications'" @toast="showToast" />
              <SettingsSecuritySection v-show="openSection === 'sec-security'" @toast="showToast" />

              <!-- ── § 6.5: ОПЛАТА / Сохранённые карты ──────────────── -->
              <SettingsBillingSection v-show="openSection === 'sec-billing'" @toast="showToast" />

              <!-- ── § 7: DANGER ZONE ────────────────────────────────── -->
              <section v-show="openSection === 'sec-danger'" id="sec-danger" class="bg-brand-card border border-red-500/30 rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
                <div class="px-6 py-4 border-b border-red-500/20 flex items-center gap-3" style="background:linear-gradient(90deg,rgba(239,68,68,0.07) 0%,transparent 100%)">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style="background:rgba(239,68,68,0.15)">
                    <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                  </div>
                  <h2 class="font-bold text-white text-sm">{{ langStore.t.secAccount }}</h2>
                </div>
                <div class="p-6 stack-y-4">
                  <div class="p-4 rounded-2xl border border-red-500/25 bg-red-500/5">
                    <h3 class="text-sm font-bold text-red-400 mb-1">{{ langStore.t.deleteAccountTitle }}</h3>
                    <p class="text-xs text-white/50 mb-4">{{ langStore.t.deleteAccountDesc }}</p>
                    <button type="button" @click="showDeleteModal = true"
                      class="px-5 py-2.5 rounded-2xl text-sm font-bold text-white bg-red-500/20 hover:bg-red-500/35 border border-red-500/40 hover:border-red-500/70 transition-all">
                      {{ langStore.t.deleteMyAccountBtn }}
                    </button>
                  </div>
                </div>
              </section>

              <!-- ── Submit (mobile / tablet) ───────────────────────── -->
              <div class="flex items-center justify-between gap-4 pt-2 xl:hidden">
                <router-link :to="`/profile/${authStore.user?.username}`"
                  class="px-6 py-3 bg-brand-card border border-brand-border hover:border-brand-muted/40 text-white/55 hover:text-white rounded-2xl text-sm font-bold transition-all">
                  {{ langStore.t.cancel }}
                </router-link>
                <button type="submit" :disabled="userStore.isLoading || birthDateInvalid"
                  class="flex-1 max-w-xs py-3 text-sm font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2 rounded-2xl disabled:opacity-50"
                  :style="`background:${form.accent_color};box-shadow:0 4px 24px ${form.accent_color}44`">
                  <span v-if="userStore.isLoading" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  {{ userStore.isLoading ? langStore.t.savingProfile : langStore.t.saveProfile }}
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
      <div v-if="showDeleteModal" class="fixed inset-0 z-300 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs" @click.self="showDeleteModal = false">
        <div class="bg-brand-card border border-red-500/40 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
          <div class="px-6 py-4 border-b border-red-500/20 flex items-center gap-3" style="background:linear-gradient(90deg,rgba(239,68,68,0.1) 0%,transparent 100%)">
            <div class="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
              <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </div>
            <h3 class="font-bold text-white text-sm">{{ langStore.t.deleteAccountModalTitle }}</h3>
          </div>
          <div class="p-6 stack-y-4">
            <p class="text-sm text-white/70">{{ langStore.t.deleteModalDescPre }} <strong class="text-red-400">{{ langStore.t.deleteModalDescHighlight }}</strong>{{ langStore.t.deleteModalDescPost }}</p>
            <div>
              <label class="block text-xs font-bold text-white/55 uppercase tracking-wider mb-2">{{ langStore.t.deleteConfirmLabel }} <span class="text-red-400 font-black">{{ langStore.t.deleteWord }}</span></label>
              <input v-model="deleteConfirmText" type="text" :placeholder="langStore.t.deleteWord"
                class="w-full bg-brand-bg border border-red-500/30 rounded-2xl px-4 py-3 text-sm text-white placeholder-white/25 focus:outline-hidden focus:border-red-500/60 transition-all"
                @keydown.enter="handleDeleteAccount" />
            </div>
            <div class="flex gap-3 pt-1">
              <button type="button" @click="showDeleteModal = false; deleteConfirmText = ''"
                class="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white/55 hover:text-white bg-brand-bg border border-brand-border hover:border-white/20 transition-all">
                {{ langStore.t.cancel }}
              </button>
              <button type="button" @click="handleDeleteAccount" :disabled="deleteConfirmText !== langStore.t.deleteWord || isDeletingAccount"
                class="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style="background:rgba(239,68,68,0.8)" :class="deleteConfirmText === langStore.t.deleteWord ? 'hover:bg-red-600' : ''">
                <span v-if="isDeletingAccount" class="flex items-center justify-center gap-2">
                  <span class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>{{ langStore.t.deletingLabel }}
                </span>
                <span v-else>{{ langStore.t.deleteForever }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { apiErrorMessage } from '@/lib/apiError'
import { ref, reactive, computed, onMounted } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useAuthStore, cacheUser } from '@/stores/auth'
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
import type { Lang } from '@/locales/translations'
import { useGroupsStore, type EventItem } from '@/stores/groups'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import FursonaSettings from '@/components/profile/FursonaSettings.vue'
import FursuitSettings from '@/components/profile/FursuitSettings.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import DateInput from '@/components/DateInput.vue'
import { speciesLabel as speciesLabelFor } from '@/lib/fursonaSpecies'
import { FAVORITE_CATEGORIES } from '@/lib/interests'
import { verTypeIconUrl } from '@/lib/verificationIcons'
import api from '@/api'
import { PROFILE_THEMES, PROFILE_FRAMES, rainbowShadow, readRawDataUrl, readScaledDataUrl } from '@/lib/utils'
import { PAYMENT_REGIONS, REGION_VISUAL, regionLabel } from '@/lib/paymentRegions'
import ImageCropModal from '@/components/shared/ImageCropModal.vue'
import { useConfirm } from '@/composables/useConfirm'
import AvatarFrameOverlay from '@/components/AvatarFrameOverlay.vue'
import FrameEditor, { type FrameCalibration } from '@/components/FrameEditor.vue'
import { useDealersDenStore, type OwnedAvatarFrame } from '@/stores/dealersDen'
import SettingsSecuritySection from '@/components/settings/SettingsSecuritySection.vue'
import SettingsNotificationsSection from '@/components/settings/SettingsNotificationsSection.vue'
import SettingsBillingSection from '@/components/settings/SettingsBillingSection.vue'

const userStore   = useUserStore()
const authStore   = useAuthStore()
const langStore   = useLangStore()
const groupsStore = useGroupsStore()
const previewTheme = computed(() => PROFILE_THEMES[form.profile_theme] ?? PROFILE_THEMES.default)
const previewCustomFrame = computed(() => {
  const mf = myFrames.value.find(f => f.id === form.profile_frame_id)
  return mf ? { image_url: mf.image_url, offset_x: mf.offset_x, offset_y: mf.offset_y, scale: mf.scale, rotation: mf.rotation } : null
})
const previewFrameClass = computed(() => (form.profile_frame_id ? '' : PROFILE_FRAMES[form.profile_frame]?.style ?? ''))
const previewFrameStyle = computed(() => form.profile_frame === 'rainbow' && !form.profile_frame_id
  ? { boxShadow: rainbowShadow(1.5) } : {})
const jobGroupNames = computed(() => [...new Set(groupsStore.myGroups.map(m => m.group.name))])
const route       = useRoute()
const router      = useRouter()
const { confirmDialog } = useConfirm()

const birthDateInputRef = ref<InstanceType<typeof DateInput> | null>(null)
const birthDateInvalid = ref(false)

const langOptions = [
  { code: 'RU' as const, fi: 'ru', name: 'Русский' },
  { code: 'EN' as const, fi: 'us', name: 'English' },
  { code: 'JP' as const, fi: 'jp', name: '日本語' },
  { code: 'CN' as const, fi: 'cn', name: '中文' },
  { code: 'DE' as const, fi: 'de', name: 'Deutsch' },
  { code: 'FR' as const, fi: 'fr', name: 'Français' },
  { code: 'ES' as const, fi: 'es', name: 'Español' },
  { code: 'PT' as const, fi: 'br', name: 'Português' },
]

// ── Статус заказов: плашка «Заказы открыты» (Pro и Business), применяется сразу ──
type CommissionsStatus = 'none' | 'open' | 'waitlist' | 'closed'
const commissionsStatus = ref<CommissionsStatus>(authStore.user?.commissions_status ?? 'none')
const canSetCommissions = computed(() => ['pro', 'business'].includes(authStore.user?.subscription_tier ?? 'free'))
const commissionsOptions = computed<{ value: CommissionsStatus; label: string }[]>(() => [
  { value: 'open', label: langStore.t.commissionsOpen },
  { value: 'waitlist', label: langStore.t.commissionsWaitlist },
  { value: 'closed', label: langStore.t.commissionsClosed },
  { value: 'none', label: langStore.t.commissionsNone },
])
async function setCommissions(value: CommissionsStatus) {
  const previous = commissionsStatus.value
  commissionsStatus.value = value
  try {
    await api.patch('/users/me', { commissions_status: value })
    if (authStore.user) authStore.user.commissions_status = value
  } catch {
    commissionsStatus.value = previous
    showToast('error', langStore.t.commissionsNeedPro)
  }
}

// ── Payment region (used to pick alt payment methods when no card is saved) ──
const paymentRegion = ref<string>(authStore.user?.payment_region || 'GLOBAL')

async function setPaymentRegion(id: string) {
  const previous = paymentRegion.value
  paymentRegion.value = id
  try {
    await api.patch('/users/me', { payment_region: id })
    if (authStore.user) authStore.user.payment_region = id
  } catch {
    paymentRegion.value = previous
    showToast('error', langStore.t.subToastError)
  }
}

// ── Interests: declared tags + behavioural like/dislike tag cloud ────────────
interface TagInsight { name: string; likes: number; dislikes: number; score: number }
interface TagInsights { unlocked: boolean; votesGiven: number; threshold: number; tags: TagInsight[] }

const favorites = computed(() => ({
  fav_food: userStore.profile?.fav_food ?? '',
  fav_animal: userStore.profile?.fav_animal ?? '',
  fav_music: userStore.profile?.fav_music ?? '',
  fav_artist: userStore.profile?.fav_artist ?? '',
  fav_film: userStore.profile?.fav_film ?? '',
}))
const savingInterests = ref(false)
const tagInsights = ref<TagInsights | null>(null)
const tagInsightsLoading = ref(false)

async function updateFavorite(key: typeof FAVORITE_CATEGORIES[number]['key'], value: string) {
  if (savingInterests.value) return
  savingInterests.value = true
  try {
    await userStore.updateProfile({ [key]: value.trim() || null } as any)
  } finally {
    savingInterests.value = false
  }
}

async function loadTagInsights() {
  tagInsightsLoading.value = true
  try {
    const { data } = await api.get('/posts/me/tag-insights')
    if (data.success) tagInsights.value = data.data.insights
  } catch {
    tagInsights.value = null
  } finally {
    tagInsightsLoading.value = false
  }
}

function tagFontSize(t: TagInsight): string {
  const scores = tagInsights.value?.tags.map((x) => Math.abs(x.score)) ?? []
  const max = Math.max(1, ...scores)
  const ratio = Math.abs(t.score) / max
  return `${(12 + ratio * 22).toFixed(1)}px`
}

function tagColor(t: TagInsight): string {
  if (t.score > 0) return '#34d399'
  if (t.score < 0) return '#fb7185'
  return 'rgba(255,255,255,0.5)'
}

// ── Delete account modal ─────────────────────────────────────────────────────
const showDeleteModal    = ref(false)
const deleteConfirmText  = ref('')
const isDeletingAccount  = ref(false)

async function handleDeleteAccount() {
  if (deleteConfirmText.value !== langStore.t.deleteWord) return
  isDeletingAccount.value = true
  try {
    await api.delete('/users/me/account')
    await authStore.logout()
    router.replace({ name: 'login' })
  } catch (e) {
    showToast('error', apiErrorMessage(e) ?? langStore.t.settingsProfileDeleteError)
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

// ── Username validation ────────────────────────────────────────────────────
const usernameError = computed(() => {
  const u = form.username
  if (!u) return null
  if (u.length < 3) return langStore.t.settingsProfileUsernameMinLength
  if (u.length > 30) return langStore.t.settingsProfileUsernameMaxLength
  return null
})

function onUsernameInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value
  form.username = raw.toLowerCase().replace(/[^a-z0-9_]/g, '')
  ;(e.target as HTMLInputElement).value = form.username
}

// ── Tag inputs ──────────────────────────────────────────────────────────────
const newLike    = ref('')
const newDislike = ref('')

// ── Avatar history ─────────────────────────────────────────────────────────
interface MediaHistoryItem { id: string; type: string; url: string; video_url: string | null; created_at: string }
const avatarHistory        = ref<MediaHistoryItem[]>([])
const avatarHistoryLoading = ref(false)
const showAvatarHistory    = ref(false)

async function loadAvatarHistory() {
  const userId = authStore.user?.id
  if (!userId) return
  avatarHistoryLoading.value = true
  try {
    const res = await api.get(`/users/${userId}/media-history?type=avatar`)
    avatarHistory.value = res.data.data.history ?? []
  } catch {
    // silent
  } finally {
    avatarHistoryLoading.value = false
  }
}

async function applyHistoryAvatar(item: MediaHistoryItem) {
  try {
    const res = await api.post(`/users/me/avatar-history/${item.id}/restore`)
    const restored = res.data.data
    form.avatar_url = restored.avatar_url ?? item.url
    form.avatar_video_url = restored.avatar_video_url ?? item.video_url ?? ''
    savedForm.avatar_url = form.avatar_url
    savedForm.avatar_video_url = form.avatar_video_url
    showAvatarHistory.value = false
    await loadAvatarHistory()
  } catch (e) {
    showToast('error', apiErrorMessage(e) ?? langStore.t.settingsProfileAvatarRestoreError)
  }
}

async function deleteHistoryAvatar(id: string) {
  if (!(await confirmDialog(langStore.t.avatarHistoryDeleteConfirm, { danger: true }))) return
  try {
    await api.delete(`/users/me/avatar-history/${id}`)
    avatarHistory.value = avatarHistory.value.filter((h) => h.id !== id)
  } catch {
    // silent
  }
}

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
const avatarOriginalFile = ref<File | null>(null)
const bannerOriginalSrc = ref<string>('')

// ── Shake / unsaved warning state ──────────────────────────────────────────
const shaking        = ref(false)
const unsavedWarning = ref(false)

// ── Form ───────────────────────────────────────────────────────────────────
const form = reactive({
  username:            '',
  display_name:        '',
  bio:                 '',
  status:              '',
  persona:             '',
  fursona_name:        '',
  avatar_url:          '',
  avatar_video_url:    '' as string,
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
  birth_date_visibility: 'hidden' as string,
  likes:               [] as string[],
  dislikes:            [] as string[],
  profile_theme:       '' as string,
  profile_bg_url:      '' as string,
  profile_frame:       '' as string,
  profile_frame_id:    null as string | null,
  social_links:        {} as Record<string, string>,
  donate_url:          '' as string,
  messages_privacy:         'everyone' as string,
  forward_identity_privacy: 'everyone' as string,
  comments_privacy:         'everyone' as string,
  mentions_privacy:         'everyone' as string,
  online_status_visibility: 'everyone' as string,
  friends_list_visibility:  'everyone' as string,
  profile_visibility:       'everyone' as string,
  relationship_status_visibility: 'everyone' as string,
  groups_visibility:        'everyone' as string,
  groups_pinned_only:       false,
})

// ── Saved snapshot ─────────────────────────────────────────────────────────
const savedForm = reactive({
  username:            '',
  display_name:        '',
  bio:                 '',
  status:              '',
  persona:             '',
  fursona_name:        '',
  avatar_url:          '',
  avatar_video_url:    '' as string,
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
  birth_date_visibility: 'hidden' as string,
  likes:               [] as string[],
  dislikes:            [] as string[],
  profile_theme:       '' as string,
  profile_bg_url:      '' as string,
  profile_frame:       '' as string,
  profile_frame_id:    null as string | null,
  social_links:        {} as Record<string, string>,
  donate_url:          '' as string,
  messages_privacy:         'everyone' as string,
  forward_identity_privacy: 'everyone' as string,
  comments_privacy:         'everyone' as string,
  mentions_privacy:         'everyone' as string,
  online_status_visibility: 'everyone' as string,
  friends_list_visibility:  'everyone' as string,
  profile_visibility:       'everyone' as string,
  relationship_status_visibility: 'everyone' as string,
  groups_visibility:        'everyone' as string,
  groups_pinned_only:       false,
})

function snapshotToSaved() {
  savedForm.username            = form.username
  savedForm.display_name        = form.display_name
  savedForm.bio                 = form.bio
  savedForm.status              = form.status
  savedForm.persona             = form.persona
  savedForm.fursona_name        = form.fursona_name
  savedForm.avatar_url          = form.avatar_url
  savedForm.avatar_video_url    = form.avatar_video_url
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
  savedForm.birth_date_visibility = form.birth_date_visibility
  savedForm.likes               = [...form.likes]
  savedForm.dislikes            = [...form.dislikes]
  savedForm.profile_theme       = form.profile_theme
  savedForm.profile_bg_url      = form.profile_bg_url
  savedForm.profile_frame       = form.profile_frame
  savedForm.profile_frame_id    = form.profile_frame_id
  savedForm.social_links        = { ...form.social_links }
  savedForm.donate_url          = form.donate_url
  savedForm.messages_privacy         = form.messages_privacy
  savedForm.forward_identity_privacy = form.forward_identity_privacy
  savedForm.comments_privacy         = form.comments_privacy
  savedForm.mentions_privacy         = form.mentions_privacy
  savedForm.online_status_visibility = form.online_status_visibility
  savedForm.friends_list_visibility  = form.friends_list_visibility
  savedForm.profile_visibility       = form.profile_visibility
  savedForm.relationship_status_visibility = form.relationship_status_visibility
  savedForm.groups_visibility        = form.groups_visibility
  savedForm.groups_pinned_only       = form.groups_pinned_only
}

function resetForm() {
  form.username            = savedForm.username
  form.display_name        = savedForm.display_name
  form.bio                 = savedForm.bio
  form.status              = savedForm.status
  form.persona             = savedForm.persona
  form.fursona_name        = savedForm.fursona_name
  form.avatar_url          = savedForm.avatar_url
  form.avatar_video_url    = savedForm.avatar_video_url
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
  form.birth_date_visibility = savedForm.birth_date_visibility
  form.likes               = [...savedForm.likes]
  form.dislikes            = [...savedForm.dislikes]
  form.profile_theme       = savedForm.profile_theme
  form.profile_bg_url      = savedForm.profile_bg_url
  form.profile_frame       = savedForm.profile_frame
  form.profile_frame_id    = savedForm.profile_frame_id
  form.social_links        = { ...savedForm.social_links }
  form.donate_url          = savedForm.donate_url
  form.messages_privacy         = savedForm.messages_privacy
  form.forward_identity_privacy = savedForm.forward_identity_privacy
  form.comments_privacy         = savedForm.comments_privacy
  form.mentions_privacy         = savedForm.mentions_privacy
  form.online_status_visibility = savedForm.online_status_visibility
  form.friends_list_visibility  = savedForm.friends_list_visibility
  form.profile_visibility       = savedForm.profile_visibility
  form.relationship_status_visibility = savedForm.relationship_status_visibility
  form.groups_visibility        = savedForm.groups_visibility
  form.groups_pinned_only       = savedForm.groups_pinned_only
  // Clear originals so re-crop picks up the reverted server images
  avatarOriginalSrc.value = ''
  bannerOriginalSrc.value = ''
  fursonaRef.value?.reset()
}

// ── isDirty ────────────────────────────────────────────────────────────────
const fursonaIsDirty = ref(false)
const fursonaRef     = ref<{ save: () => Promise<void>; reset: () => void } | null>(null)

const isDirty = computed(() => {
  const fieldsChanged = (
    form.username            !== savedForm.username ||
    form.display_name        !== savedForm.display_name ||
    form.bio                 !== savedForm.bio ||
    form.status              !== savedForm.status ||
    form.persona             !== savedForm.persona ||
    form.fursona_name        !== savedForm.fursona_name ||
    form.avatar_url          !== savedForm.avatar_url ||
    form.avatar_video_url    !== savedForm.avatar_video_url ||
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
    form.birth_date_visibility !== savedForm.birth_date_visibility ||
    form.profile_theme       !== savedForm.profile_theme ||
    form.profile_bg_url      !== savedForm.profile_bg_url ||
    form.profile_frame       !== savedForm.profile_frame ||
    form.profile_frame_id    !== savedForm.profile_frame_id ||
    form.donate_url          !== savedForm.donate_url ||
    form.messages_privacy         !== savedForm.messages_privacy ||
    form.forward_identity_privacy !== savedForm.forward_identity_privacy ||
    form.comments_privacy         !== savedForm.comments_privacy ||
    form.mentions_privacy         !== savedForm.mentions_privacy ||
    form.online_status_visibility !== savedForm.online_status_visibility ||
    form.friends_list_visibility  !== savedForm.friends_list_visibility ||
    form.profile_visibility       !== savedForm.profile_visibility ||
    form.relationship_status_visibility !== savedForm.relationship_status_visibility ||
    form.groups_visibility        !== savedForm.groups_visibility ||
    form.groups_pinned_only       !== savedForm.groups_pinned_only
  )
  return fieldsChanged ||
    JSON.stringify(form.likes)         !== JSON.stringify(savedForm.likes) ||
    JSON.stringify(form.dislikes)      !== JSON.stringify(savedForm.dislikes) ||
    JSON.stringify(form.social_links)  !== JSON.stringify(savedForm.social_links) ||
    fursonaIsDirty.value
})

const denStore = useDealersDenStore()
const myFrames = ref<OwnedAvatarFrame[]>([])
const calibratingFrame = ref<OwnedAvatarFrame | null>(null)
const calibrationDraft = ref<FrameCalibration>({ offsetX: 0, offsetY: 0, scale: 1, rotation: 0 })
const savingCalibration = ref(false)

function openFrameCalibration(frame: OwnedAvatarFrame) {
  calibratingFrame.value = frame
  calibrationDraft.value = { offsetX: frame.offset_x, offsetY: frame.offset_y, scale: frame.scale, rotation: frame.rotation }
}

async function saveFrameCalibration() {
  if (!calibratingFrame.value) return
  savingCalibration.value = true
  try {
    await denStore.updateFrameCalibration(calibratingFrame.value.id, calibrationDraft.value)
    const idx = myFrames.value.findIndex(f => f.id === calibratingFrame.value!.id)
    if (idx !== -1) {
      myFrames.value[idx] = {
        ...myFrames.value[idx],
        offset_x: calibrationDraft.value.offsetX, offset_y: calibrationDraft.value.offsetY,
        scale: calibrationDraft.value.scale, rotation: calibrationDraft.value.rotation,
      }
    }
    calibratingFrame.value = null
  } catch (err) {
    console.error('[SettingsProfileView] failed to save frame calibration:', err)
  } finally {
    savingCalibration.value = false
  }
}

onMounted(async () => {
  groupsStore.loadMyGroups().catch(() => {})
  await userStore.fetchMyProfile()
  denStore.getMyAvatarFrames().then(frames => { myFrames.value = frames }).catch(() => {})
  const p = userStore.profile
  if (!p) return
  form.username            = authStore.user?.username ?? ''
  form.display_name        = p.display_name        ?? ''
  form.bio                 = p.bio                 ?? ''
  form.status              = p.status              ?? ''
  form.persona             = p.persona             ?? ''
  form.fursona_name        = p.fursona_name           ?? ''
  form.avatar_url          = p.avatar_url          ?? ''
  form.avatar_video_url    = p.avatar_video_url ?? ''
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
  form.has_fursuit         = p.has_fursuit        ?? false
  form.fursuit_photo_url   = p.fursuit_photo_url  ?? ''
  form.fursuit_description = p.fursuit_description ?? ''
  form.fursuit_maker       = p.fursuit_maker      ?? ''
  form.birth_date          = p.birth_date ? p.birth_date.substring(0, 10) : ''
  form.birth_date_visibility = p.birth_date_visibility ?? 'hidden'
  form.likes               = [...p.likes]
  form.dislikes            = [...p.dislikes]
  form.profile_theme       = p.profile_theme  ?? ''
  form.profile_bg_url      = p.profile_bg_url ?? ''
  form.profile_frame       = p.profile_frame  ?? ''
  form.profile_frame_id    = (p as any).profile_frame_id ?? null
  form.social_links        = { ...(p.social_links ?? {}) }
  form.donate_url          = p.donate_url ?? ''
  form.messages_privacy         = p.messages_privacy         ?? 'everyone'
  form.forward_identity_privacy = (p as any).forward_identity_privacy ?? 'everyone'
  form.comments_privacy         = p.comments_privacy         ?? 'everyone'
  form.mentions_privacy         = p.mentions_privacy         ?? 'everyone'
  form.online_status_visibility = p.online_status_visibility ?? 'everyone'
  form.friends_list_visibility  = p.friends_list_visibility  ?? 'everyone'
  form.profile_visibility       = p.profile_visibility       ?? 'everyone'
  form.relationship_status_visibility = (p as any).relationship_status_visibility ?? 'everyone'
  form.groups_visibility        = p.groups_visibility        ?? 'everyone'
  form.groups_pinned_only       = p.groups_pinned_only       ?? false
  paymentRegion.value           = (p as any).payment_region ?? 'GLOBAL'
  snapshotToSaved()
  loadTagInsights()
  // Pre-fill combobox search inputs with saved values
  countrySearch.value = form.country
  citySearch.value    = form.location
  // Load following list for partner picker
  loadFollowing()
  // Load Soon picker data
  loadSoonEvents()
  loadMySoonSelection()
  // Load verification data
  fetchVerificationData()
  // Navigate to a specific section if ?section= param is present
  const sectionParam = route.query.section as string | undefined
  if (sectionParam) {
    const valid = sections.value.map(s => s.id)
    if (valid.includes(sectionParam)) {
      openSec(sectionParam)
      // Briefly highlight the section so it's obvious where the link landed
      sectionHighlight.value = sectionParam
      setTimeout(() => { sectionHighlight.value = null }, 1600)
    }
  }
  // Загружаем историю аватаров
  loadAvatarHistory()
})

// ── Navigation guard ───────────────────────────────────────────────────────
onBeforeRouteLeave(async (_to, _from, next) => {
  if (!isDirty.value) return next()
  const leave = await confirmDialog(langStore.t.unsavedLeaveConfirm, { danger: true })
  if (leave) return next()
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
    showToast('success', langStore.t.settingsProfileBgUploaded)
  } catch { showToast('error', langStore.t.settingsProfileBgUploadError) }
  finally { uploadingBg.value = false; if (bgFileRef.value) bgFileRef.value.value = '' }
}

// ── File picking ───────────────────────────────────────────────────────────
function onAvatarFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) openCrop(file, 'avatar')
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
      showToast('success', langStore.t.settingsProfileFursonaPhotoUploaded)
    }
  } catch {
    showToast('error', langStore.t.settingsProfilePhotoUploadError)
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
      showToast('success', langStore.t.settingsProfileFursuitPhotoUploaded)
    }
  } catch {
    showToast('error', langStore.t.settingsProfilePhotoUploadError)
  } finally {
    uploadingFursuiPhoto.value = false
  }
}

// ── Crop modal ─────────────────────────────────────────────────────────────
const cropModal = reactive({
  show:  false,
  type:  'avatar' as 'avatar' | 'banner',
  src:   '',
  file:  null as File | null,
  isGif: false,
})
const cropUploading = ref(false)

async function openCrop(file: File, type: 'avatar' | 'banner') {
  let src: string
  try {
    src = await readScaledDataUrl(file, 1800)
  } catch {
    src = await readRawDataUrl(file)
  }
  // Store the (downscaled) data URL so re-cropping doesn't need the file again.
  if (type === 'avatar') { avatarOriginalSrc.value = src; avatarOriginalFile.value = file }
  else                   bannerOriginalSrc.value = src
  cropModal.src   = src
  cropModal.type  = type
  cropModal.file  = type === 'avatar' ? file : null
  cropModal.isGif = type === 'avatar' && file.type === 'image/gif'
  cropModal.show  = true
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
    cropModal.src   = localSrc
    cropModal.type  = type
    cropModal.file  = type === 'avatar' ? avatarOriginalFile.value : null
    cropModal.isGif = type === 'avatar' && avatarOriginalFile.value?.type === 'image/gif'
    cropModal.show  = true
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
    cropModal.show = true
  }
}

async function confirmCrop({ blob, rel }: { blob: Blob; rel: { x: number; y: number; w: number; h: number } }) {
  cropUploading.value = true
  const type = cropModal.type
  try {
    // Animated GIF avatar: crop/scale/transcode happens server-side (ffmpeg) so the
    // animation survives — the rasterized blob above would only capture a single frame.
    if (type === 'avatar' && cropModal.isGif && cropModal.file) {
      const fd = new FormData()
      fd.append('file', cropModal.file, cropModal.file.name)
      const params = new URLSearchParams({
        folder: 'avatars',
        cropX: String(rel.x), cropY: String(rel.y), cropW: String(rel.w), cropH: String(rel.h),
      })
      const result = await api.post(`/media/upload?${params.toString()}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      form.avatar_url = result.data.data.url
      form.avatar_video_url = result.data.data.videoUrl ?? ''
      cropModal.show = false
      showToast('success', langStore.t.settingsProfileGifAvatarUploaded)
      return
    }

    const fd = new FormData()
    fd.append('file', blob, type === 'avatar' ? 'avatar.jpg' : 'banner.jpg')

    const result = await api.post(
      `/media/upload?folder=${type === 'avatar' ? 'avatars' : 'banners'}`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )

    if (type === 'avatar') {
      form.avatar_url = result.data.data.url
      form.avatar_video_url = ''
    } else {
      form.banner_url = result.data.data.url
    }
    cropModal.show = false
    showToast('success', type === 'avatar' ? langStore.t.settingsProfileAvatarUploaded : langStore.t.settingsProfileBannerUploaded)
  } catch (err) {
    console.error(err)
    showToast('error', langStore.t.settingsProfileImageUploadError)
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
  // ── Block the whole save while the birth date field holds an unconfirmed value —
  // otherwise the last valid date silently gets re-saved and looks like the edit was
  // accepted when it was actually discarded.
  if (birthDateInvalid.value) {
    birthDateInputRef.value?.shake()
    showToast('error', langStore.t.settingsProfileFixBirthDate)
    return
  }

  // ── Handle relationship partner changes separately ─────────────────────
  const newPartner  = form.relationship_with  || null
  const savedPartner = savedForm.relationship_with || null

  if (newPartner !== savedPartner) {
    if (!newPartner && savedPartner) {
      // User cleared their partner → break up (unlinks both sides)
      try {
        await api.delete('/relationships/partner')
        showToast('success', langStore.t.settingsProfileRelationshipEnded)
      } catch {
        showToast('error', langStore.t.settingsProfilePartnerResetError)
        return
      }
    } else if (newPartner) {
      // New partner selected → send a relationship request
      try {
        await api.post('/relationships/request', { toId: newPartner })
        showToast('success', langStore.t.settingsProfilePartnerRequestSent)
        // Заявка ещё не принята — партнёром считаем только после подтверждения,
        // а до тех пор показываем её отправителю как «Ожидание подтверждения».
        form.relationship_with = ''
        partnerSearch.value    = ''
        await loadFollowing()
      } catch (e) {
        const msg = apiErrorMessage(e) ?? langStore.t.settingsProfileRequestSendError
        showToast('error', msg)
        return
      }
    }
  }

  // ── Username change (separate endpoint, uniqueness checked server-side) ──
  if (form.username !== savedForm.username && (!form.username || usernameError.value)) {
    showToast('error', usernameError.value ?? langStore.t.settingsProfileUsernameEmpty)
    return
  }
  if (form.username !== savedForm.username) {
    try {
      const res = await api.patch('/users/me/username', { username: form.username })
      if (res.data.success && authStore.user) {
        authStore.user.username = res.data.data.user.username
        cacheUser(authStore.user)
        savedForm.username = res.data.data.user.username
        form.username = res.data.data.user.username
      }
    } catch (e) {
      const msg = apiErrorMessage(e) ?? langStore.t.settingsProfileUsernameTaken
      showToast('error', msg)
      return
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
    avatar_video_url:    form.avatar_video_url || null,
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
    birth_date_visibility: form.birth_date_visibility,
    likes:               form.likes,
    dislikes:            form.dislikes,
    profile_theme:       form.profile_theme  || null,
    profile_bg_url:      form.profile_bg_url || null,
    profile_frame:       form.profile_frame  || null,
    profile_frame_id:    form.profile_frame_id || null,
    social_links:        form.social_links,
    donate_url:          form.donate_url || null,
    messages_privacy:         form.messages_privacy,
    forward_identity_privacy: form.forward_identity_privacy,
    comments_privacy:         form.comments_privacy,
    mentions_privacy:         form.mentions_privacy,
    online_status_visibility: form.online_status_visibility,
    friends_list_visibility:  form.friends_list_visibility,
    profile_visibility:       form.profile_visibility,
    relationship_status_visibility: form.relationship_status_visibility,
    groups_visibility:        form.groups_visibility,
    groups_pinned_only:       form.groups_pinned_only,
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(form.accent_color)) payload.accent_color = form.accent_color

  try {
    await userStore.updateProfile(payload)
    snapshotToSaved()
    // Also save fursona if it has unsaved changes
    if (fursonaIsDirty.value && fursonaRef.value) {
      await fursonaRef.value.save()
    }
    if (newPartner === savedPartner) showToast('success', langStore.t.settingsProfileSavedSuccess)
  } catch {
    showToast('error', userStore.error ?? langStore.t.settingsProfileSaveError)
  }
}

// ── Sections ───────────────────────────────────────────────────────────────
const sections = computed(() => [
  { id: 'sec-basic',         label: langStore.t.secBasic,         color: '#60a5fa', iconPath: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { id: 'sec-contacts',      label: langStore.t.secContacts,      color: '#34d399', iconPath: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { id: 'sec-fursona',       label: langStore.t.fursonaSettingsTitle, color: '#a78bfa', iconPath: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'sec-profile-style', label: langStore.t.secProfileStyle,  color: '#f59e0b', iconPath: 'M5 3a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h14v14H5V5zm2 2v2h10V7H7zm0 4v2h7v-2H7z' },
  { id: 'sec-verification',  label: langStore.t.secVerification,  color: '#3b82f6', iconPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { id: 'sec-privacy',       label: langStore.t.secPrivacy,       color: '#ec4899', iconPath: 'M12 11c0-1.104.896-2 2-2s2 .896 2 2-.896 2-2 2-2-.896-2-2zm-6 0a6 6 0 1112 0 6 6 0 01-12 0zM3 21c0-3.314 4.03-6 9-6s9 2.686 9 6' },
  { id: 'sec-interests',     label: langStore.t.secInterests,     color: '#34d399', iconPath: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
  { id: 'sec-lang',          label: langStore.t.secLang,          color: '#f59e0b', iconPath: 'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129' },
  { id: 'sec-notifications', label: (langStore.t as Record<string, string | undefined>).notifications ?? 'Уведомления', color: '#f59e0b', iconPath: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { id: 'sec-security',      label: langStore.t.secSecurity,      color: '#10b981', iconPath: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  { id: 'sec-billing',       label: langStore.t.secBilling,       color: '#4C67CF', iconPath: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { id: 'sec-danger',        label: langStore.t.secAccount,       color: '#ef4444', iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
])

const lockedSettings = computed(() => [
  { label: (langStore.t as Record<string, string | undefined>).notifications ?? 'Notifications', d: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { label: langStore.t.secSecurity, d: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { label: langStore.t.premium, d: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { label: (langStore.t as Record<string, string | undefined>).privacy ?? 'Privacy', d: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
])

const PRONOUN_MAP: Record<'he' | 'she' | 'they', Record<Lang, string>> = {
  he:   { RU: 'он/его',  EN: 'he/him',   JP: '彼/彼を',     CN: '他/他的',   DE: 'er/ihm',   FR: 'il/lui',   ES: 'él/le',   PT: 'ele/dele' },
  she:  { RU: 'она/её',  EN: 'she/her',  JP: '彼女/彼女を', CN: '她/她的',   DE: 'sie/ihr',  FR: 'elle/elle', ES: 'ella/le', PT: 'ela/dela' },
  they: { RU: 'они/их',  EN: 'they/them',JP: '彼ら/彼らを', CN: '他们/他们的', DE: 'sie/ihnen', FR: 'iels/leur', ES: 'elle/le', PT: 'elu/delu' },
}
const pronounPresets = computed(() => (['he', 'she', 'they'] as const).map((k) => PRONOUN_MAP[k][langStore.currentLang]))

const primarySpeciesLabel = computed(() => {
  const sp = userStore.primaryFursona?.species?.[0]
  return sp ? speciesLabelFor(sp, langStore.currentLang) : ''
})

const birthdayVisibilityOptions = computed(() => [
  { value: 'hidden',    label: langStore.t.birthdayVisibilityHidden },
  { value: 'year',      label: langStore.t.birthdayVisibilityYear },
  { value: 'month_day', label: langStore.t.birthdayVisibilityMonthDay },
  { value: 'full',      label: langStore.t.birthdayVisibilityFull },
])

// ── Privacy: who-can-X selectors (Everyone / Friends / Nobody or OnlyMe) ────
const privacyNobodyOptions = computed(() => [
  { value: 'everyone', label: langStore.t.privacyEveryone },
  { value: 'friends',  label: langStore.t.privacyFriends },
  { value: 'nobody',   label: langStore.t.privacyNobody },
])
const privacyOnlyMeOptions = computed(() => [
  { value: 'everyone', label: langStore.t.privacyEveryone },
  { value: 'friends',  label: langStore.t.privacyFriends },
  { value: 'only_me',  label: langStore.t.privacyOnlyMe },
])
const groupsPinnedOnlyOptions = computed(() => [
  { value: false, label: langStore.t.groupsPinnedOnlyAll },
  { value: true,  label: langStore.t.groupsPinnedOnlyPinned },
])
const privacyRows = computed(() => [
  { field: 'profile_visibility',       label: langStore.t.profileVisibilityLabel,      options: privacyOnlyMeOptions.value },
  { field: 'friends_list_visibility',  label: langStore.t.friendsListVisibilityLabel,  options: privacyOnlyMeOptions.value },
  { field: 'relationship_status_visibility', label: langStore.t.relationshipVisibilityLabel, options: privacyOnlyMeOptions.value },
  { field: 'groups_visibility',        label: langStore.t.groupsVisibilityLabel,       options: privacyOnlyMeOptions.value },
  { field: 'groups_pinned_only',       label: langStore.t.groupsPinnedOnlyLabel,       options: groupsPinnedOnlyOptions.value },
  { field: 'messages_privacy',         label: langStore.t.messagesPrivacyLabel,        options: privacyNobodyOptions.value },
  { field: 'forward_identity_privacy', label: langStore.t.forwardIdentityPrivacyLabel, options: privacyNobodyOptions.value },
  { field: 'comments_privacy',         label: langStore.t.commentsPrivacyLabel,        options: privacyNobodyOptions.value },
  { field: 'mentions_privacy',         label: langStore.t.mentionsPrivacyLabel,        options: privacyNobodyOptions.value },
  { field: 'online_status_visibility', label: langStore.t.onlineStatusVisibilityLabel, options: privacyNobodyOptions.value },
])

// ── Verification ────────────────────────────────────────────────────────────
const verificationStatus = ref<any>(null)
const verificationCriteria = ref<any>(null)
const profileCompleteness = ref<any>(null)
const isLoadingVerification = ref(false)
const isRequestingVerification = ref(false)
const selectedVerType = ref<'artist' | 'master' | 'event' | 'fursuiter' | 'popular' | 'writer' | 'organizer' | 'photographer' | 'programmer' | ''>('')
const evidenceUrls = ref<string[]>([])
const evidenceText = ref('')
const evidenceUploadRef = ref<InstanceType<typeof MediaUpload> | null>(null)
const popularLinks = ref<string[]>([''])

const VER_TYPES = [
  { id: 'artist',    icon: 'Palette',       ringSel: 'ring-purple-500',  badge: 'bg-purple-500', badgeCls: 'bg-purple-500/10 border-purple-500/20 text-purple-400',    titleKey: 'verTypeArtist',    hintKey: 'verTypeArtistHint' },
  { id: 'master',    icon: 'Hammer',        ringSel: 'ring-amber-500',   badge: 'bg-amber-500',  badgeCls: 'bg-amber-500/10 border-amber-500/20 text-amber-400',       titleKey: 'verTypeMaster',    hintKey: 'verTypeMasterHint' },
  { id: 'fursuiter', icon: 'Shirt',         ringSel: 'ring-cyan-500',    badge: 'bg-cyan-500',   badgeCls: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',          titleKey: 'verTypeFursuiter', hintKey: 'verTypeFursuiterHint' },
  { id: 'popular',   icon: 'TrendingUp',    ringSel: 'ring-blue-500',    badge: 'bg-blue-500',   badgeCls: 'bg-blue-500/10 border-blue-500/20 text-blue-400',          titleKey: 'verTypePopular',   hintKey: 'verTypePopularHint' },
  { id: 'writer',    icon: 'PenLine',       ringSel: 'ring-rose-500',    badge: 'bg-rose-500',   badgeCls: 'bg-rose-500/10 border-rose-500/20 text-rose-400',          titleKey: 'verTypeWriter',    hintKey: 'verTypeWriterHint' },
  { id: 'organizer', icon: 'CalendarCheck', ringSel: 'ring-indigo-500',  badge: 'bg-indigo-500', badgeCls: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',    titleKey: 'verTypeOrganizer', hintKey: 'verTypeOrganizerHint' },
  { id: 'event',     icon: 'Ticket',        ringSel: 'ring-emerald-500', badge: 'bg-emerald-500',badgeCls: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', titleKey: 'verTypeEvent',     hintKey: 'verTypeEventHint' },
  { id: 'photographer', icon: 'Camera',     ringSel: 'ring-teal-500',    badge: 'bg-teal-500',   badgeCls: 'bg-teal-500/10 border-teal-500/20 text-teal-400',          titleKey: 'verTypePhotographer', hintKey: 'verTypePhotographerHint' },
  { id: 'programmer',   icon: 'Code2',      ringSel: 'ring-fuchsia-500', badge: 'bg-fuchsia-500',badgeCls: 'bg-fuchsia-500/10 border-fuchsia-500/20 text-fuchsia-400', titleKey: 'verTypeProgrammer',  hintKey: 'verTypeProgrammerHint' },
] as const

const verTypeMeta = computed(() => {
  const t = langStore.t as any
  return Object.fromEntries(VER_TYPES.map(v => [v.id, { label: t[v.titleKey] ?? v.id, icon: v.icon, badgeCls: v.badgeCls }]))
})

const canSubmitVer = computed(() => {
  if (!selectedVerType.value || !localCompleteness.value.canSubmit) return false
  if (selectedVerType.value === 'popular') return popularLinks.value.some(l => l.trim())
  return evidenceUrls.value.length > 0 || evidenceText.value.trim().length > 0
})

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

function onEvidenceUploaded(urls: string[]) {
  evidenceUrls.value = urls
}

async function requestVerification() {
  if (!canSubmitVer.value) return
  isRequestingVerification.value = true
  try {
    const payload: Record<string, any> = {
      verificationType: selectedVerType.value,
      evidenceUrls: evidenceUrls.value,
      evidenceText: evidenceText.value.trim() || undefined,
    }
    if (selectedVerType.value === 'popular') {
      payload.socialLinks = popularLinks.value.filter(l => l.trim())
    }
    const res = await api.post('/verification/request', payload)
    if (res.data.success) {
      showToast('success', langStore.t.settingsProfileVerificationSubmitted)
      selectedVerType.value = ''
      evidenceUrls.value = []
      evidenceUploadRef.value?.clearAll()
      evidenceText.value = ''
      popularLinks.value = ['']
      await fetchVerificationData()
    }
  } catch (e: any) {
    showToast('error', apiErrorMessage(e) ?? e.response?.data?.error ?? langStore.t.settingsProfileVerificationSubmitError)
  } finally { isRequestingVerification.value = false }
}

const verCriteriaList = computed(() => {
  const c = verificationCriteria.value
  if (!c) return []
  const t = langStore.t
  return [
    { label: t.verCriteriaAge, met: c.accountAgeDays >= 14, detail: `${c.accountAgeDays} ${t.verCriteriaDays}` },
    { label: t.verCriteriaPosts3, met: c.postCount >= 3, detail: `${c.postCount} ${t.verCriteriaPostsCount}` },
    { label: t.verCriteriaAvatar, met: c.hasAvatar, detail: '' },
    { label: t.verCriteriaBio, met: c.hasBio, detail: '' },
    { label: t.verCriteriaEmail, met: c.hasEmail, detail: '' },
    { label: t.verCriteriaFollowers5, met: c.followerCount >= 5, detail: `${c.followerCount} ${t.verCriteriaFollowersCount}` },
  ]
})

const completenessFields = computed(() => {
  const c = profileCompleteness.value
  if (!c) return []
  const t = langStore.t
  return [
    { key: 'avatar', label: t.complAvatarLabel, met: c.hasAvatar },
    { key: 'email', label: 'Email', met: c.hasEmail },
    { key: 'bio', label: t.complBioLabel, met: c.hasBio },
    { key: 'fursonaName', label: t.complFursonaNameLabel, met: c.hasFursonaName },
    { key: 'fursonaSpecies', label: t.complFursonaSpeciesLabel, met: c.hasFursonaSpecies },
    { key: 'fursonaDesc', label: t.complFursonaDescLabel, met: c.hasFursonaDescription },
  ]
})

// Mirrors the backend's own /verification/completeness calculation (7 fields, 80% threshold)
// so the UI never shows "ready to submit" when the server would reject the request.
const localCompleteness = computed(() => {
  const c = profileCompleteness.value
  if (!c) return { percentage: 0, canSubmit: false }
  return { percentage: c.percentage ?? 0, canSubmit: !!c.canSubmit }
})

// ── Birth date helpers ─────────────────────────────────────────────────────
const birthAge = computed<number | null>(() => {
  if (!form.birth_date) return null
  const [y, mo, d] = form.birth_date.split('-').map(Number)
  const now = new Date()
  let age = now.getFullYear() - y
  const m = now.getMonth() + 1 - mo
  if (m < 0 || (m === 0 && now.getDate() < d)) age--
  return age
})

function formatBirthDate(date: string): string {
  if (!date) return ''
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], {
    timeZone: 'UTC', day: 'numeric', month: 'numeric', year: 'numeric',
  })
}

function ageLabel(n: number): string {
  if (langStore.currentLang === 'RU') {
    const word = n % 10 === 1 && n % 100 !== 11 ? 'год'
      : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'года'
      : 'лет'
    return `${n} ${word}`
  }
  if (langStore.currentLang === 'JP' || langStore.currentLang === 'CN') return `${n}${langStore.t.yearsOldSuffix}`
  return `${n} ${langStore.t.yearsOldSuffix}`
}

const fursonaColorSwatches = computed(() => [
  { label: langStore.t.settingsProfileColorWhite,       color: '#f5f5f5' },
  { label: langStore.t.settingsProfileColorLightGray,   color: '#d1d5db' },
  { label: langStore.t.settingsProfileColorGray,        color: '#6b7280' },
  { label: langStore.t.settingsProfileColorBlack,       color: '#1c1c1e' },
  { label: langStore.t.settingsProfileColorBrown,       color: '#92400e' },
  { label: langStore.t.settingsProfileColorGinger,      color: '#c2410c' },
  { label: langStore.t.settingsProfileColorFoxRed,      color: '#ea580c' },
  { label: langStore.t.settingsProfileColorGolden,      color: '#d97706' },
  { label: langStore.t.settingsProfileColorYellow,      color: '#ca8a04' },
  { label: langStore.t.settingsProfileColorCream,       color: '#fef3c7' },
  { label: langStore.t.settingsProfileColorDarkGold,    color: '#b45309' },
  { label: langStore.t.settingsProfileColorRed,         color: '#dc2626' },
  { label: langStore.t.settingsProfileColorPink,        color: '#ec4899' },
  { label: langStore.t.settingsProfileColorViolet,      color: '#7c3aed' },
  { label: langStore.t.settingsProfileColorBlue,        color: '#2563eb' },
  { label: langStore.t.settingsProfileColorLightBlue,   color: '#0ea5e9' },
  { label: langStore.t.settingsProfileColorTurquoise,   color: '#0d9488' },
  { label: langStore.t.settingsProfileColorGreen,       color: '#16a34a' },
  { label: langStore.t.settingsProfileColorSilver,      color: '#94a3b8' },
])

const socialNetworks = computed(() => [
  { key: 'telegram',    label: 'Telegram',      color: '#2AABEE', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>` },
  { key: 'twitter',     label: 'X / Twitter',   color: '#fff',    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.907-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>` },
  { key: 'instagram',   label: 'Instagram',     color: '#E4405F', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>` },
  { key: 'youtube',     label: 'YouTube',       color: '#FF0000', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>` },
  { key: 'twitch',      label: 'Twitch',        color: '#9146FF', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>` },
  { key: 'furaffinity', label: 'FurAffinity',   color: '#FAAF3A', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="12" cy="15.2" rx="5.2" ry="4.6"/><ellipse cx="5.3" cy="9.6" rx="2.2" ry="2.9" transform="rotate(-24 5.3 9.6)"/><ellipse cx="9.4" cy="5.4" rx="2.1" ry="2.8" transform="rotate(-10 9.4 5.4)"/><ellipse cx="14.6" cy="5.4" rx="2.1" ry="2.8" transform="rotate(10 14.6 5.4)"/><ellipse cx="18.7" cy="9.6" rx="2.2" ry="2.9" transform="rotate(24 18.7 9.6)"/></svg>` },
  { key: 'vk',          label: 'ВКонтакте',     color: '#4C75A3', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.391 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.523-2.049-1.714-1.033-1.01-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.566c0 .424-.135.678-1.252.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.677.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.204.17-.407.44-.407h2.743c.372 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.252-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.763-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.202 1.253.745.847 1.32 1.558 1.473 2.049.17.474-.085.716-.576.716z"/></svg>` },
  { key: 'discord',     label: 'Discord',       color: '#7289DA', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>` },
  { key: 'github',      label: 'GitHub',        color: '#fff',    svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>` },
  { key: 'other',       label: langStore.t.settingsProfileOtherSite, color: '#6366f1', svg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>` },
])

const relationshipOptions = computed(() => [
  { value: 'single',          label: langStore.t.relStatusSingle },
  { value: 'in_relationship', label: langStore.t.relStatusInRel },
  { value: 'married',      label: langStore.t.relStatusMarried },
  { value: 'open',         label: langStore.t.relStatusOpen },
  { value: 'complicated',  label: langStore.t.relStatusComplicated },
  { value: 'secret',       label: langStore.t.relStatusSecret },
])

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
interface FollowUser { id: string; username: string; display_name: string | null; avatar_url: string | null; in_relationship?: boolean }
interface OutgoingRelRequest { id: string; to: FollowUser }
const followingList   = ref<FollowUser[]>([])
const outgoingRequest = ref<OutgoingRelRequest | null>(null)
const cancellingRequest = ref(false)
const partnerSearch   = ref('')
const partnerDropOpen = ref(false)

async function loadFollowing() {
  if (!authStore.user?.id) return
  try {
    // Mutual friends for the partner picker (с флагом in_relationship) + собственная исходящая заявка
    const [friendsRes, outgoingRes] = await Promise.all([
      api.get('/relationships/candidates'),
      api.get('/relationships/outgoing'),
    ])
    if (friendsRes.data.success) followingList.value = friendsRes.data.data.users ?? []
    if (outgoingRes.data.success) outgoingRequest.value = outgoingRes.data.data.requests?.[0] ?? null
  } catch { /* ignore */ }
}

async function cancelOutgoingRequest() {
  const req = outgoingRequest.value
  if (!req || cancellingRequest.value) return
  cancellingRequest.value = true
  try {
    await api.delete('/relationships/request', { data: { toId: req.to.id } })
    outgoingRequest.value = null
    showToast('success', langStore.t.settingsProfilePartnerRequestCancelled)
  } catch (e) {
    showToast('error', apiErrorMessage(e) ?? langStore.t.settingsProfileRequestSendError)
  } finally {
    cancellingRequest.value = false
  }
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
  !!outgoingRequest.value ||
  ['in_relationship', 'relationship', 'married', 'open', 'open_relationship'].includes(form.relationship_status),
)

const selectedPartner = computed(() =>
  followingList.value.find(u => u.id === form.relationship_with) ?? null,
)

function selectPartner(u: FollowUser) {
  if (u.in_relationship) return
  form.relationship_with = u.id
  partnerSearch.value    = u.display_name ?? u.username
  partnerDropOpen.value  = false
}

function clearPartner() {
  form.relationship_with = ''
  partnerSearch.value    = ''
}

// ── Soon picker (мероприятие, на которое собираешься) ─────────────────────
const soonEventsList   = ref<EventItem[]>([])
const soonEventsLoading = ref(false)
const soonSearch       = ref('')
const soonDropOpen     = ref(false)
const soonSaving       = ref(false)
const mySoonEventId    = ref<string | null>(null)

async function loadSoonEvents() {
  soonEventsLoading.value = true
  try {
    if (!groupsStore.myGroups.length) await groupsStore.loadMyGroups().catch(() => {})
    const myGroupIds = new Set(groupsStore.myGroups.map(m => m.group_id))
    const { data } = await api.get('/groups/events', { params: { upcoming: true, limit: 50, sort: 'popular' } })
    soonEventsList.value = ((data.data?.events ?? []) as EventItem[])
      .filter(e => e.group?.type === 'event' && myGroupIds.has(e.group_id))
  } catch {
    soonEventsList.value = []
  } finally {
    soonEventsLoading.value = false
  }
}

async function loadMySoonSelection() {
  if (!authStore.user?.id) return
  try {
    await groupsStore.loadMySoonBadges(authStore.user.id)
    mySoonEventId.value = groupsStore.mySoonBadges[0]?.event_id ?? null
  } catch {
    mySoonEventId.value = null
  }
}

const mySoonEvent = computed(() => {
  if (!mySoonEventId.value) return null
  const fromBadge = groupsStore.mySoonBadges.find(b => b.event_id === mySoonEventId.value)?.event
  return fromBadge ?? soonEventsList.value.find(e => e.id === mySoonEventId.value) ?? null
})

const filteredSoonEvents = computed(() => {
  const q = soonSearch.value.toLowerCase().trim()
  const list = soonEventsList.value.filter(e => e.id !== mySoonEventId.value && !isSoonEventExpired(e))
  if (!q) return list
  return list.filter(e =>
    e.title.toLowerCase().includes(q) ||
    (e.group?.name ?? '').toLowerCase().includes(q),
  )
})

function formatSoonDate(date: string): string {
  return new Date(date).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { day: 'numeric', month: 'short' })
}

function onSoonBlur() {
  setTimeout(() => { soonDropOpen.value = false }, 180)
}

function isSoonEventExpired(ev: EventItem): boolean {
  const g = ev.group
  return !!g && g.type === 'event' && !!g.event_date && new Date(g.event_date) < new Date()
}

async function selectSoonEvent(ev: EventItem) {
  if (soonSaving.value) return
  if (isSoonEventExpired(ev)) {
    showToast('error', langStore.t.settingsProfileSoonEventEnded)
    return
  }
  soonSaving.value = true
  try {
    if (mySoonEventId.value && mySoonEventId.value !== ev.id) {
      await groupsStore.toggleSoonBadge(mySoonEventId.value)
    }
    await groupsStore.toggleSoonBadge(ev.id)
    soonSearch.value   = ''
    soonDropOpen.value = false
    await loadMySoonSelection()
    showToast('success', `${langStore.t.settingsProfileSoonMarkedPrefix} «${ev.title}»`)
  } catch (e) {
    showToast('error', apiErrorMessage(e) ?? langStore.t.settingsProfileSoonSaveError)
  } finally {
    soonSaving.value = false
  }
}

async function clearSoonSelection() {
  if (!mySoonEventId.value || soonSaving.value) return
  soonSaving.value = true
  try {
    await groupsStore.toggleSoonBadge(mySoonEventId.value)
    mySoonEventId.value = null
    showToast('success', langStore.t.settingsProfileSoonLabelRemoved)
  } catch (e) {
    showToast('error', apiErrorMessage(e) ?? langStore.t.settingsProfileSoonSaveError)
  } finally {
    soonSaving.value = false
  }
}

// ── Active section (accordion) ────────────────────────────────────────────
const openSection = ref('sec-basic')
// Section briefly flashed when landed on via a `?section=` deep link
const sectionHighlight = ref<string | null>(null)

function openSec(id: string) {
  openSection.value = id
  // Scroll the form column to the top so newly opened section is visible
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<style scoped>
@reference "../assets/style.css";
/* stylelint-disable */
.field-input {
  @apply w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/50 focus:outline-hidden transition-all;
}

/* ── Accordion section transition ───────────────────────────────────────── */
.accordion-enter-active, .accordion-leave-active { transition: all 0.25s ease; }
.accordion-enter-from, .accordion-leave-to { opacity: 0; max-height: 0; overflow: hidden; }

/* ── Deep-link highlight: flashes the section you were routed to ────────── */
.section-link-flash {
  animation: section-link-flash 1.6s ease-out;
}
@keyframes section-link-flash {
  0%   { box-shadow: 0 0 0 3px rgba(167,139,250,0.7), 0 0 24px rgba(167,139,250,0.5); }
  100% { box-shadow: 0 0 0 3px rgba(167,139,250,0), 0 0 0 rgba(167,139,250,0); }
}

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
