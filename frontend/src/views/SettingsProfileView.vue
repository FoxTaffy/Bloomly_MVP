<template>
  <div class="min-h-screen bg-brand-bg text-brand-offwhite font-nunito">

    <!-- ─── Header ─────────────────────────────────────────────────────── -->
    <header class="fixed top-0 inset-x-0 h-14 md:h-16 bg-brand-bg/95 backdrop-blur-md border-b border-brand-border flex items-center justify-between px-4 md:px-6 z-40">
      <div class="flex items-center gap-2.5 cursor-pointer" @click="router.push({ name: 'home' })">
        <div class="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 2C16 2 18 6 22 6C26 6 28 10 28 14C28 18 24 20 24 20C24 20 28 22 28 26C28 30 24 30 20 30C16 30 16 26 16 26C16 26 16 30 12 30C8 30 4 30 4 26C4 22 8 20 8 20C8 20 4 18 4 14C4 10 6 6 10 6C14 6 16 2 16 2Z" fill="#D5DDFF" stroke="#4C67CF" stroke-width="2" stroke-linejoin="round"/>
            <circle cx="16" cy="16" r="4" fill="#D5DDFF" stroke="#4C67CF" stroke-width="2"/>
          </svg>
        </div>
        <span class="text-xl md:text-2xl font-extrabold tracking-tight text-white">Bloomly</span>
      </div>
      <div class="flex items-center gap-2">
        <router-link :to="`/profile/${authStore.user?.id}`" class="hidden md:flex items-center gap-2 px-4 py-2 rounded-full bg-brand-card border border-brand-border text-sm font-semibold text-brand-muted hover:text-white hover:border-brand-accent/50 transition-all">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
          Профиль
        </router-link>
      </div>
    </header>

    <div class="max-w-5xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-6 pb-16">

      <!-- ─── Settings Left Sidebar ──────────────────────────────────── -->
      <aside class="w-56 hidden lg:flex flex-col gap-5 sticky top-24 self-start flex-shrink-0">

        <!-- User block -->
        <div class="flex items-center gap-3 cursor-pointer group" @click="router.push(`/profile/${authStore.user?.id}`)">
          <img v-if="authStore.user?.avatar_url" :src="authStore.user.avatar_url"
            class="w-11 h-11 rounded-full object-cover border-2 border-brand-border group-hover:border-brand-accent transition-colors" />
          <div v-else class="w-11 h-11 rounded-full border-2 border-brand-border group-hover:border-brand-accent bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold transition-colors">{{ (authStore.user?.display_name || authStore.user?.username || '?')[0].toUpperCase() }}</div>
          <div class="min-w-0">
            <p class="font-bold text-white text-sm truncate group-hover:text-brand-accent transition-colors">{{ authStore.user?.display_name ?? authStore.user?.username }}</p>
            <p class="text-xs text-brand-muted truncate">@{{ authStore.user?.username }}</p>
          </div>
        </div>

        <!-- Settings nav -->
        <nav class="space-y-1">
          <div class="px-4 text-[11px] font-bold text-brand-muted uppercase tracking-wider mb-2">Настройки</div>
          <button class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all bg-brand-accent/15 text-brand-accent">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
            <span>Профиль</span>
          </button>
          <button class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-brand-muted hover:bg-brand-card/50 hover:text-white opacity-50 cursor-not-allowed">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
            <span>Уведомления</span>
          </button>
          <button class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-brand-muted hover:bg-brand-card/50 hover:text-white opacity-50 cursor-not-allowed">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            <span>Безопасность</span>
          </button>
          <button class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-brand-muted hover:bg-brand-card/50 hover:text-white opacity-50 cursor-not-allowed">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>
            <span>Внешний вид</span>
          </button>
          <button class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-brand-muted hover:bg-brand-card/50 hover:text-white opacity-50 cursor-not-allowed">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/></svg>
            <span>Подписка</span>
          </button>
        </nav>

        <!-- Back to feed -->
        <button @click="router.push({ name: 'home' })" class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-brand-muted hover:bg-brand-card/50 hover:text-white border border-brand-border/50 mt-2">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
          <span>Лента</span>
        </button>
      </aside>

      <!-- ─── Settings Content ────────────────────────────────────────── -->
      <main class="flex-1 min-w-0 space-y-5">

        <!-- Page title -->
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-extrabold text-white">Настройки профиля</h1>
            <p class="text-sm text-brand-muted mt-0.5">Управляйте внешним видом и информацией своего профиля</p>
          </div>
          <!-- Success / Error inline badges -->
          <div v-if="saved" class="flex items-center gap-2 px-4 py-2 bg-brand-success/10 border border-brand-success/30 text-brand-success rounded-2xl text-sm font-semibold">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
            Сохранено
          </div>
          <div v-else-if="userStore.error" class="flex items-center gap-2 px-4 py-2 bg-brand-error/10 border border-brand-error/30 text-brand-error rounded-2xl text-sm font-semibold">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            {{ userStore.error }}
          </div>
        </div>

        <form @submit.prevent="handleSubmit" class="space-y-5">

          <!-- ── Media: Avatar & Banner ──────────────────────────────── -->
          <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
            <div class="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand-accent/40 to-transparent relative"></div>
            <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl bg-brand-accent/15 flex items-center justify-center">
                <svg class="w-4 h-4 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
              <div>
                <h2 class="font-bold text-white text-sm">Медиа профиля</h2>
                <p class="text-xs text-brand-muted">Аватар и баннер</p>
              </div>
            </div>
            <div class="p-6 space-y-5">

              <!-- Banner preview -->
              <div>
                <label class="block text-sm font-semibold text-brand-muted mb-2">URL баннера</label>
                <div v-if="form.banner_url" class="w-full h-28 rounded-2xl overflow-hidden mb-3 border border-brand-border">
                  <img :src="form.banner_url" class="w-full h-full object-cover" />
                </div>
                <div v-else class="w-full h-28 rounded-2xl mb-3 border border-dashed border-brand-border flex items-center justify-center text-brand-muted/50">
                  <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14"/></svg>
                </div>
                <input v-model="form.banner_url" type="url" placeholder="https://..."
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all" />
              </div>

              <!-- Avatar preview + URL -->
              <div class="flex items-start gap-5">
                <div class="flex-shrink-0">
                  <p class="text-sm font-semibold text-brand-muted mb-2">Предпросмотр</p>
                  <div class="p-1 rounded-full bg-gradient-to-br from-brand-accent/60 to-transparent shadow-lg w-fit">
                    <img v-if="form.avatar_url" :src="form.avatar_url"
                      class="w-20 h-20 rounded-full object-cover border-4 border-brand-card" />
                  <div v-else class="w-20 h-20 rounded-full border-4 border-brand-card bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-3xl">{{ (authStore.user?.display_name || authStore.user?.username || '?')[0].toUpperCase() }}</div>
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <label class="block text-sm font-semibold text-brand-muted mb-2">URL аватара</label>
                  <input v-model="form.avatar_url" type="url" placeholder="https://..."
                    class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all" />
                </div>
              </div>

            </div>
          </div>

          <!-- ── Basic info ──────────────────────────────────────────── -->
          <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
            <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center">
                <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              </div>
              <div>
                <h2 class="font-bold text-white text-sm">Основная информация</h2>
                <p class="text-xs text-brand-muted">Имя, описание, статус</p>
              </div>
            </div>
            <div class="p-6 space-y-5">

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <!-- Display name -->
                <div>
                  <label class="block text-sm font-semibold text-brand-muted mb-2">Отображаемое имя</label>
                  <input v-model="form.display_name" type="text" maxlength="50" placeholder="Ваше имя"
                    class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all" />
                  <p class="text-xs text-brand-muted mt-1.5">{{ form.display_name?.length ?? 0 }} / 50</p>
                </div>

                <!-- Status -->
                <div>
                  <label class="block text-sm font-semibold text-brand-muted mb-2">Статус</label>
                  <input v-model="form.status" type="text" maxlength="100" placeholder="Чем вы занимаетесь?"
                    class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all" />
                </div>
              </div>

              <!-- Bio -->
              <div>
                <label class="block text-sm font-semibold text-brand-muted mb-2">О себе</label>
                <textarea v-model="form.bio" rows="4" maxlength="300" placeholder="Расскажите о себе…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all resize-none"></textarea>
                <p class="text-xs text-brand-muted mt-1.5">{{ form.bio?.length ?? 0 }} / 300</p>
              </div>

            </div>
          </div>

          <!-- ── Fursona ─────────────────────────────────────────────── -->
          <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
            <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center">
                <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </div>
              <div>
                <h2 class="font-bold text-white text-sm">Персонаж / Фурсона</h2>
                <p class="text-xs text-brand-muted">Вид, интересы, антипатии</p>
              </div>
            </div>
            <div class="p-6 space-y-5">

              <!-- Persona -->
              <div>
                <label class="block text-sm font-semibold text-brand-muted mb-2">Вид персонажа</label>
                <input v-model="form.persona" type="text" placeholder="Напр. Волк, Кот, Лиса…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all" />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <!-- Likes -->
                <div>
                  <label class="block text-sm font-semibold text-brand-success/80 mb-2 flex items-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                    Нравится
                  </label>
                  <div class="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                    <span v-for="(item, idx) in form.likes" :key="idx"
                      class="flex items-center gap-1 pl-3 pr-1.5 py-1 bg-brand-success/10 border border-brand-success/25 text-brand-success text-xs rounded-full font-semibold">
                      {{ item }}
                      <button type="button" @click="removeTag('likes', idx)"
                        class="w-4 h-4 flex items-center justify-center rounded-full hover:bg-brand-success/20 text-brand-success/60 hover:text-brand-success transition-colors">×</button>
                    </span>
                  </div>
                  <div class="flex gap-2">
                    <input v-model="newLike" type="text" placeholder="Добавить…"
                      class="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-xs text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-success/60 transition-all"
                      @keydown.enter.prevent="addTag('likes')" />
                    <button type="button" @click="addTag('likes')"
                      class="w-9 h-9 flex items-center justify-center bg-brand-success/15 border border-brand-success/30 text-brand-success hover:bg-brand-success/25 rounded-xl text-lg font-bold transition-colors">+</button>
                  </div>
                </div>

                <!-- Dislikes -->
                <div>
                  <label class="block text-sm font-semibold text-brand-error/80 mb-2 flex items-center gap-1.5">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
                    Не нравится
                  </label>
                  <div class="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
                    <span v-for="(item, idx) in form.dislikes" :key="idx"
                      class="flex items-center gap-1 pl-3 pr-1.5 py-1 bg-brand-error/10 border border-brand-error/25 text-brand-error text-xs rounded-full font-semibold">
                      {{ item }}
                      <button type="button" @click="removeTag('dislikes', idx)"
                        class="w-4 h-4 flex items-center justify-center rounded-full hover:bg-brand-error/20 text-brand-error/60 hover:text-brand-error transition-colors">×</button>
                    </span>
                  </div>
                  <div class="flex gap-2">
                    <input v-model="newDislike" type="text" placeholder="Добавить…"
                      class="flex-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-xs text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-error/60 transition-all"
                      @keydown.enter.prevent="addTag('dislikes')" />
                    <button type="button" @click="addTag('dislikes')"
                      class="w-9 h-9 flex items-center justify-center bg-brand-error/10 border border-brand-error/25 text-brand-error hover:bg-brand-error/20 rounded-xl text-lg font-bold transition-colors">+</button>
                  </div>
                </div>
              </div>

            </div>
          </div>

          <!-- ── Personalisation ─────────────────────────────────────── -->
          <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
            <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3">
              <div class="w-8 h-8 rounded-xl bg-pink-500/15 flex items-center justify-center">
                <svg class="w-4 h-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>
              </div>
              <div>
                <h2 class="font-bold text-white text-sm">Персонализация</h2>
                <p class="text-xs text-brand-muted">Акцентный цвет профиля</p>
              </div>
            </div>
            <div class="p-6">
              <label class="block text-sm font-semibold text-brand-muted mb-3">Акцентный цвет</label>
              <div class="flex items-center gap-4">
                <input v-model="form.accent_color" type="color"
                  class="h-12 w-16 rounded-2xl cursor-pointer bg-transparent border-2 border-brand-border p-1 transition-all hover:border-brand-accent/50" />
                <div class="flex-1">
                  <input v-model="form.accent_color" type="text" maxlength="7" placeholder="#4C97CF"
                    class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm font-mono text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all" />
                  <p class="text-xs text-brand-muted mt-1.5">HEX формат: #RRGGBB</p>
                </div>
                <!-- Live preview swatch -->
                <div class="flex flex-col items-center gap-1.5">
                  <div class="w-12 h-12 rounded-2xl border-2 border-white/10 shadow-lg" :style="{ backgroundColor: form.accent_color }"></div>
                  <span class="text-[10px] text-brand-muted font-semibold">Превью</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Submit ──────────────────────────────────────────────── -->
          <div class="flex items-center justify-between gap-4 py-2">
            <router-link :to="`/profile/${authStore.user?.id}`"
              class="px-6 py-3 bg-brand-card border border-brand-border hover:border-brand-accent/50 text-brand-muted hover:text-white rounded-2xl text-sm font-bold transition-all">
              Отмена
            </router-link>
            <button type="submit" :disabled="userStore.isLoading"
              class="flex-1 max-w-xs py-3 bg-brand-accent hover:bg-brand-accent-plus disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-sm font-bold text-white transition-all shadow-lg shadow-brand-accent/25 flex items-center justify-center gap-2">
              <svg v-if="!userStore.isLoading" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
              <span v-if="userStore.isLoading" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              {{ userStore.isLoading ? 'Сохранение…' : 'Сохранить профиль' }}
            </button>
          </div>

        </form>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'

const router = useRouter()
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
