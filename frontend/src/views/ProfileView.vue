<template>
    <AppHeader :show-back="true" v-model:nsfwMode="nsfwMode" />

    <!-- ─── hidden file inputs for banner/avatar S3 upload ────────────────── -->
    <input ref="bannerFileInput" type="file" accept="image/*" class="sr-only" @change="onBannerFileChange" />
    <input ref="avatarFileInput" type="file" accept="image/*" class="sr-only" @change="onAvatarFileChange" />

    <!-- ─── Edit Profile Modal ───────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showEditModal" class="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4" @click.self="showEditModal = false">
        <div class="w-full max-w-lg bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between px-6 py-4 border-b border-brand-border sticky top-0 bg-brand-card z-10">
            <h3 class="font-bold text-white text-lg">
              {{ editSection === 'bio' ? 'О себе' : editSection === 'fursona' ? 'Фурсона' : editSection === 'contacts' ? 'Контакты' : editSection === 'basics' ? 'Основное' : editSection === 'socials' ? 'Соцсети' : 'Редактировать' }}
            </h3>
            <button @click="showEditModal = false" class="w-8 h-8 flex items-center justify-center rounded-xl text-brand-muted hover:text-white hover:bg-brand-bg transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>

          <div class="p-6 space-y-4">
            <!-- Basics: display_name, pronouns, job_title -->
            <template v-if="editSection === 'basics'">
              <div>
                <label class="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">Имя</label>
                <input v-model="editForm.display_name" type="text" maxlength="50" placeholder="Отображаемое имя"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
              </div>
              <div>
                <label class="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">Местоимения</label>
                <input v-model="editForm.pronouns" type="text" maxlength="30" placeholder="он/его, она/её, они/их…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
              </div>
              <div>
                <label class="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">Должность / специализация</label>
                <input v-model="editForm.job_title" type="text" maxlength="80" placeholder="Художник, Программист…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
              </div>
            </template>

            <!-- Bio -->
            <template v-if="editSection === 'bio'">
              <div>
                <label class="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">О себе</label>
                <textarea v-model="editForm.bio" rows="5" maxlength="300" placeholder="Расскажи о себе…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all resize-none"></textarea>
                <p class="text-[11px] text-brand-muted mt-1 text-right">{{ (editForm.bio ?? '').length }}/300</p>
              </div>
            </template>

            <!-- Fursona -->
            <template v-if="editSection === 'fursona'">
              <!-- Step indicators -->
              <div class="flex gap-2 mb-2">
                <div v-for="(step, i) in fursonaSteps" :key="i"
                  class="flex-1 flex flex-col items-center gap-1">
                  <div class="w-full h-1 rounded-full" :class="step.done ? 'bg-brand-accent' : step.locked ? 'bg-brand-border/40' : 'bg-brand-border'"></div>
                  <span class="text-[10px] font-semibold" :class="step.done ? 'text-brand-accent' : 'text-brand-muted'">{{ step.label }}</span>
                </div>
              </div>
              <!-- Species -->
              <div class="p-4 bg-brand-bg/60 border border-brand-border/60 rounded-2xl space-y-3">
                <p class="text-xs font-bold text-brand-muted uppercase tracking-wider flex items-center gap-1.5"><BIcon name="PawPrint" class="w-3.5 h-3.5 text-brand-accent" /> Шаг 1 — Вид персонажа</p>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-brand-muted mb-1">Вид / порода</label>
                    <input v-model="editForm.persona" type="text" placeholder="Волк, Дракон, Лис…"
                      class="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-brand-muted mb-1">Имя персонажа</label>
                    <input v-model="editForm.fursona_name" type="text" placeholder="Как зовут фурсону…"
                      class="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
                  </div>
                </div>
              </div>
              <!-- Character -->
              <div class="p-4 bg-brand-bg/60 border border-brand-border/60 rounded-2xl space-y-3">
                <p class="text-xs font-bold text-brand-muted uppercase tracking-wider flex items-center gap-1.5"><BIcon name="Heart" class="w-3.5 h-3.5 text-brand-accent" /> Шаг 2 — Характер</p>
                <div>
                  <label class="block text-xs font-semibold text-brand-muted mb-1">Любит (через запятую)</label>
                  <input :value="editForm.likes?.join(', ')" @input="editForm.likes = ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean)"
                    type="text" placeholder="Музыка, Горы…"
                    class="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-brand-muted mb-1">Не любит (через запятую)</label>
                  <input :value="editForm.dislikes?.join(', ')" @input="editForm.dislikes = ($event.target as HTMLInputElement).value.split(',').map(s => s.trim()).filter(Boolean)"
                    type="text" placeholder="Шум, Понедельник…"
                    class="w-full bg-brand-card border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
                </div>
              </div>
              <!-- Photo / Ref - locked -->
              <div class="grid grid-cols-2 gap-3">
                <div class="p-4 border-2 border-dashed border-brand-border/50 rounded-2xl flex flex-col items-center gap-2 opacity-50 cursor-not-allowed">
                  <BIcon name="Camera" class="w-6 h-6 text-brand-muted" />
                  <p class="text-xs font-semibold text-brand-muted">Шаг 3 — Фото</p>
                  <span class="text-[10px] text-brand-muted/60 bg-brand-bg px-2 py-0.5 rounded-full">coming soon</span>
                </div>
                <div class="p-4 border-2 border-dashed border-brand-border/50 rounded-2xl flex flex-col items-center gap-2 opacity-50 cursor-not-allowed">
                  <BIcon name="Image" class="w-6 h-6 text-brand-muted" />
                  <p class="text-xs font-semibold text-brand-muted">Шаг 4 — Реф</p>
                  <span class="text-[10px] text-brand-muted/60 bg-brand-bg px-2 py-0.5 rounded-full">coming soon</span>
                </div>
              </div>
            </template>

            <!-- Contacts -->
            <template v-if="editSection === 'contacts'">
              <div>
                <label class="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">Город</label>
                <input v-model="editForm.location" type="text" maxlength="100" placeholder="Москва, Санкт-Петербург…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
              </div>
              <div>
                <label class="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">Страна</label>
                <input v-model="editForm.country" type="text" maxlength="80" placeholder="Россия, Германия…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
              </div>
              <div>
                <label class="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">Сайт</label>
                <input v-model="editForm.website" type="url" placeholder="https://…"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-brand-muted/60 focus:outline-none focus:border-brand-accent transition-all" />
              </div>
              <div>
                <label class="block text-xs font-bold text-brand-muted uppercase tracking-wider mb-1.5">Статус отношений</label>
                <select v-model="editForm.relationship_status"
                  class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand-accent transition-all">
                  <option value="">Не указано</option>
                  <option value="single">Свободен/а</option>
                  <option value="in_relationship">В отношениях</option>
                  <option value="married">В браке</option>
                  <option value="complicated">Всё сложно</option>
                  <option value="open">Открытые отношения</option>
                  <option value="looking">В поиске</option>
                </select>
              </div>
            </template>

            <!-- Socials -->
            <template v-if="editSection === 'socials'">
              <p class="text-xs text-brand-muted/70">Укажи username или полную ссылку</p>
              <div v-for="net in socialNetworks" :key="net.key" class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border border-brand-border"
                  :style="{ backgroundColor: net.color + '22', borderColor: net.color + '55' }">
                  <BIcon :name="net.iconName" class="w-4 h-4" :style="{ color: net.color }" />
                </div>
                <div class="flex-1">
                  <label class="block text-[11px] font-semibold text-brand-muted mb-1">{{ net.label }}</label>
                  <input :value="editForm.social_links?.[net.key] ?? ''"
                    @input="editForm.social_links = { ...(editForm.social_links ?? {}), [net.key]: ($event.target as HTMLInputElement).value }"
                    type="text" :placeholder="net.key === 'telegram' ? '@username' : net.key === 'discord' ? 'username#0000' : net.key === 'other' ? 'https://example.com' : '@username'"
                    class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-white placeholder-brand-muted/50 focus:outline-none focus:border-brand-accent transition-all" />
                </div>
              </div>
            </template>

            <button @click="saveEditModal" :disabled="isSavingEdit"
              class="inline-flex items-center gap-2 px-6 py-2.5 bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold rounded-xl transition-all disabled:opacity-50 shadow-sm">
              <span v-if="isSavingEdit" class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ─── Badges Modal ───────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showBadgesModal" class="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4" @click.self="showBadgesModal = false">
        <div class="w-full max-w-md bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto">
          <div class="flex items-center justify-between px-6 py-4 border-b border-brand-border sticky top-0 bg-brand-card z-10">
            <div class="flex items-center gap-2.5">
              <BIcon name="Award" class="w-5 h-5 text-yellow-400" />
              <h3 class="font-bold text-white text-lg">Значки</h3>
              <span class="text-xs font-bold bg-brand-accent/15 text-brand-accent px-2 py-0.5 rounded-full">{{ achievementBadges.length }}</span>
            </div>
            <button @click="showBadgesModal = false" class="w-8 h-8 flex items-center justify-center rounded-xl text-brand-muted hover:text-white hover:bg-brand-bg transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <div class="p-4 grid grid-cols-1 gap-3">
            <div v-for="badge in achievementBadges" :key="badge.key"
              class="flex items-center gap-4 p-4 rounded-2xl bg-brand-bg border border-brand-border hover:border-brand-accent/30 transition-all group">
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105" :class="badge.iconBg">
                <component :is="badge.iconComp" class="w-7 h-7" :class="badge.iconColor" />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-extrabold text-white leading-tight">{{ badge.label }}</p>
                <p class="text-xs text-brand-muted mt-0.5">{{ badge.desc }}</p>
              </div>
            </div>
            <div v-if="!achievementBadges.length" class="py-10 text-center text-brand-muted/60 text-sm">Пока нет значков</div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ─── Wallet Modal ───────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showWalletModal" class="fixed inset-0 z-[400] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4" @click.self="showWalletModal = false">
        <div class="w-full max-w-sm bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden">
          <div class="flex items-center justify-between px-6 py-4 border-b border-brand-border">
            <div class="flex items-center gap-2.5">
              <BIcon name="Wallet" class="w-5 h-5 text-brand-accent" />
              <h3 class="font-bold text-white text-lg">Кошелёк</h3>
            </div>
            <button @click="showWalletModal = false" class="w-8 h-8 flex items-center justify-center rounded-xl text-brand-muted hover:text-white hover:bg-brand-bg transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <div class="p-6 space-y-4">
            <!-- Balance hero -->
            <div class="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-accent/20 to-brand-accent-plus/20 border border-brand-accent/25 p-6 text-center">
              <div class="absolute inset-0 opacity-5" style="background-image:radial-gradient(circle at 30% 50%, #4C67CF 0%, transparent 60%), radial-gradient(circle at 70% 50%, #31458F 0%, transparent 60%)" />
              <p class="text-xs font-bold text-brand-accent uppercase tracking-widest mb-2 relative">Баланс</p>
              <p class="text-4xl font-extrabold text-white leading-none relative">
                {{ Number((viewedProfile as any)?.wallet?.balance ?? 0).toFixed(2) }}
              </p>
              <p class="text-sm text-brand-accent-minus font-semibold mt-1 relative">🌸 Blooms</p>
            </div>
            <!-- Action buttons -->
            <div class="grid grid-cols-2 gap-3">
              <button disabled class="flex flex-col items-center gap-1.5 p-4 rounded-2xl border border-brand-border bg-brand-bg/50 opacity-50 cursor-not-allowed">
                <BIcon name="Plus" class="w-5 h-5 text-brand-accent" />
                <span class="text-xs font-bold text-white">Пополнить</span>
              </button>
              <button disabled class="flex flex-col items-center gap-1.5 p-4 rounded-2xl border border-brand-border bg-brand-bg/50 opacity-50 cursor-not-allowed">
                <BIcon name="ArrowUpRight" class="w-5 h-5 text-brand-muted" />
                <span class="text-xs font-bold text-brand-muted">Вывести</span>
              </button>
            </div>
            <p class="text-center text-[11px] text-brand-muted/60">Транзакции и история скоро появятся</p>
          </div>
        </div>
      </div>
    </Transition>

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">

      <!-- ─── Left Sidebar ──────────────────────────────────────── -->
      <AppSidebar>
        <template v-if="viewedProfile" #extra>
          <div>
            <h4 class="px-4 text-xs font-bold text-brand-muted mb-2 uppercase tracking-wider">О профиле</h4>
            <nav class="space-y-1">
              <button v-for="nav in aboutNavs" :key="nav.key"
                @click="aboutTab = nav.key"
                class="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-left group"
                :class="aboutTab === nav.key ? 'bg-brand-accent/20 text-brand-accent' : 'text-brand-muted hover:bg-brand-card/50 hover:text-white'">
                <component :is="nav.icon" class="w-5 h-5 flex-shrink-0" />
                <span>{{ nav.label }}</span>
              </button>
            </nav>
          </div>
        </template>
      </AppSidebar>

      <!-- ─── Main ─────────────────────────────────────────────────────── -->
      <main class="flex-1 min-w-0 pb-28 md:pb-20 min-h-screen">

        <!-- Loading -->
        <div v-if="isLoading" class="flex flex-col items-center justify-center gap-4 py-32">
          <div class="w-12 h-12 border-[3px] border-brand-accent border-t-transparent rounded-full animate-spin"></div>
          <p class="text-sm text-brand-muted font-semibold">Загрузка профиля…</p>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="mt-8 bg-brand-card border border-brand-error/20 rounded-3xl p-10 text-center shadow-xl">
          <div class="w-16 h-16 rounded-2xl bg-brand-error/10 flex items-center justify-center mx-auto mb-4">
            <BIcon name="AlertCircle" class="w-8 h-8 text-brand-error" />
          </div>
          <p class="text-brand-error font-bold text-lg mb-2">Ошибка загрузки</p>
          <p class="text-brand-muted text-sm mb-6">{{ error }}</p>
          <button @click="loadProfile" class="px-6 py-2.5 bg-brand-accent hover:bg-brand-accent-plus rounded-xl text-sm font-bold transition-all">Повторить</button>
        </div>

        <!-- Not found -->
        <div v-else-if="!viewedProfile" class="mt-8 bg-brand-card border border-brand-border rounded-3xl p-12 text-center shadow-xl">
          <div class="w-16 h-16 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center mx-auto mb-4">
            <BIcon name="UserX" class="w-8 h-8 text-brand-muted" />
          </div>
          <p class="text-white font-bold text-lg mb-2">Пользователь не найден</p>
          <p class="text-brand-muted text-sm mb-6">Возможно, аккаунт был удалён или ссылка неверна</p>
          <button @click="router.push({ name: 'home' })" class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-card border border-brand-border hover:border-brand-accent text-sm font-bold rounded-xl transition-all">
            <BIcon name="ArrowLeft" class="w-4 h-4" /> На главную
          </button>
        </div>

        <template v-else>

          <!-- ════════════════════════════════════════════════════════════════
               BANNER
          ════════════════════════════════════════════════════════════════ -->
          <div class="relative w-full h-52 md:h-64 rounded-3xl overflow-hidden cursor-pointer" :style="bannerStyle"
            @click="viewedProfile.banner_url && (showBannerViewer = true)">
            <!-- Gradient overlays -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent"></div>
            <div class="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent"></div>

            <!-- Top-right: upload banner button for own profile -->
            <div v-if="isOwnProfile" class="absolute top-3 right-3 z-10">
              <button @click.stop="bannerFileInput?.click()"
                :disabled="isUploadingBanner"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/50 hover:bg-black/70 border border-white/15 rounded-full text-xs font-semibold text-white/90 backdrop-blur-sm transition-all disabled:opacity-50">
                <span v-if="isUploadingBanner" class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <BIcon v-else name="Image" class="w-3 h-3" /> Баннер
              </button>
            </div>

            <!-- Bottom-right: persona chip only (no role badge) -->
            <div class="absolute bottom-4 right-4 z-10 flex gap-2">
              <span v-if="viewedProfile.persona"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-sm border"
                :style="accentStyleSubtle">
                <BIcon name="Footprints" class="w-3 h-3" />{{ viewedProfile.persona }}
              </span>
            </div>
          </div>

          <!-- ════════════════════════════════════════════════════════════════
               PROFILE IDENTITY STRIP
          ════════════════════════════════════════════════════════════════ -->
          <div class="relative z-10 -mt-6 mx-0">
            <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl">
              <!-- Accent line top -->
              <div class="h-px bg-gradient-to-r from-transparent via-brand-accent/60 to-transparent rounded-t-3xl"></div>

              <div class="px-6 pt-0 pb-5">
                <div class="flex items-end justify-between gap-4">

                  <!-- Avatar block (overlaps banner) -->
                  <div class="relative flex-shrink-0 -mt-16 md:-mt-20 cursor-pointer" @click="avatarSrc && (showAvatarViewer = true)">
                    <img v-if="viewedProfile.avatar_url" :src="avatarSrc" :alt="viewedProfile.display_name || viewedProfile.username"
                      class="w-20 h-20 md:w-[104px] md:h-[104px] rounded-full object-cover shadow-2xl"
                      width="104" height="104"
                      fetchpriority="high"
                    />
                    <div v-else
                      class="w-20 h-20 md:w-[104px] md:h-[104px] rounded-full shadow-2xl bg-brand-accent/20 border border-brand-border flex items-center justify-center text-brand-accent font-bold text-4xl">
                      {{ (viewedProfile.display_name || viewedProfile.username || '?')[0].toUpperCase() }}
                    </div>
                    <!-- Online dot -->
                    <span class="absolute bottom-1.5 right-1.5 w-4 h-4 rounded-full bg-brand-success border-[3px] border-brand-card shadow-sm"></span>
                    <!-- Own profile: avatar upload button (pointer-events-none so click-to-view works when not hovering) -->
                    <button v-if="isOwnProfile" @click.stop="avatarFileInput?.click()" :disabled="isUploadingAvatar"
                      class="absolute inset-0 rounded-full bg-black/0 hover:bg-black/40 transition-all flex items-center justify-center pointer-events-none hover:pointer-events-auto opacity-0 hover:opacity-100">
                      <span v-if="isUploadingAvatar" class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <BIcon v-else name="Camera" class="w-7 h-7 text-white drop-shadow" />
                    </button>
                  </div>

                  <!-- Action buttons (aligned to bottom during avatar overlap) -->
                  <div class="flex items-center gap-2 pb-1 pr-2">
                    <template v-if="isOwnProfile">
                      <router-link to="/settings/profile"
                        class="relative inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-brand-accent to-brand-accent-plus text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-accent/30 hover:shadow-brand-accent/50 hover:scale-[1.03] active:scale-[0.98] transition-all overflow-hidden group">
                        <span class="absolute inset-0 bg-white/0 group-hover:bg-white/8 transition-colors duration-200" />
                        <BIcon name="Pencil" class="w-4 h-4 relative z-10" />
                        <span class="relative z-10">Редактировать</span>
                      </router-link>
                    </template>
                    <template v-else-if="authStore.isAuthenticated">
                      <button class="w-9 h-9 flex items-center justify-center border border-brand-border bg-brand-bg hover:border-brand-accent/60 hover:bg-brand-bg rounded-xl text-brand-muted hover:text-brand-accent transition-all"
                        title="Уведомления">
                        <BIcon name="Bell" class="w-4 h-4" />
                      </button>
                      <button class="inline-flex items-center gap-2 px-4 py-2 border border-brand-border bg-brand-bg hover:border-brand-accent/60 text-brand-offwhite hover:text-brand-accent rounded-xl text-sm font-bold transition-all">
                        <BIcon name="MessageSquare" class="w-4 h-4" /> Сообщение
                      </button>
                      <button @click="toggleFollow" :disabled="isTogglingFollow"
                        class="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50 shadow-sm"
                        :class="followBtnClass">
                        <span v-if="isTogglingFollow" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <component v-else :is="followBtnIcon" class="w-4 h-4" />
                        {{ followBtnLabel }}
                      </button>
                      <button class="w-9 h-9 flex items-center justify-center border border-brand-border bg-brand-bg hover:border-brand-border/80 rounded-xl text-brand-muted hover:text-white transition-all">
                        <BIcon name="MoreHorizontal" class="w-4 h-4" />
                      </button>
                    </template>
                  </div>
                </div>

                <!-- Name row -->
                <div class="mt-3">
                  <div class="flex items-center flex-wrap gap-2 mb-1">
                    <h1 class="text-2xl md:text-3xl font-extrabold text-white leading-none">{{ viewedProfile.display_name || viewedProfile.username }}</h1>
                    <span v-if="badgePillLabel" class="inline-flex items-center justify-center w-7 h-7 rounded-lg" :class="badgePillClass" :title="badgePillLabel">
                      <component :is="badgePillIcon" class="w-4 h-4" />
                    </span>
                    <span v-if="viewedProfile.pronouns" class="px-2.5 py-1 bg-brand-bg border border-brand-border rounded-lg text-xs font-semibold text-brand-muted">{{ viewedProfile.pronouns }}</span>
                  </div>
                  <div class="flex items-center gap-3 flex-wrap text-sm">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-accent/10 border border-brand-accent/25 rounded-lg text-xs font-bold text-brand-accent tracking-wide">
                      <BIcon name="AtSign" class="w-3 h-3" />{{ viewedProfile.username }}
                    </span>
                    <span v-if="viewedProfile.job_title" class="flex items-center gap-1 text-brand-muted text-xs">
                      <BIcon name="Briefcase" class="w-3.5 h-3.5" />{{ viewedProfile.job_title }}
                    </span>
                    <span v-if="viewedProfile.location" class="flex items-center gap-1 text-brand-muted text-xs">
                      <BIcon name="MapPin" class="w-3.5 h-3.5" />{{ viewedProfile.location }}
                    </span>
                    <span class="flex items-center gap-1 text-brand-muted text-xs">
                      <BIcon name="Calendar" class="w-3.5 h-3.5" />{{ joinDate }}
                    </span>
                    <a v-if="viewedProfile.website" :href="viewedProfile.website" target="_blank"
                      class="flex items-center gap-1 text-brand-accent text-xs hover:underline">
                      <BIcon name="Link" class="w-3.5 h-3.5" />{{ viewedProfile.website.replace(/^https?:\/\//, '') }}
                    </a>
                  </div>

                  <!-- Bio -->
                  <p v-if="viewedProfile.bio" class="mt-3 text-sm text-white/75 leading-relaxed max-w-2xl">{{ viewedProfile.bio }}</p>


                </div>
              </div>
            </div>
          </div>

          <!-- ════════════════════════════════════════════════════════════════
               TWO-COLUMN: CENTER + RIGHT
          ════════════════════════════════════════════════════════════════ -->
          <div class="flex gap-4 mt-4 items-start">

            <!-- ── CENTER COLUMN ────────────────────────────────────────── -->
            <div class="flex-1 min-w-0 space-y-4">

              <!-- About tabs card -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="flex border-b border-brand-border overflow-x-auto scrollbar-hide bg-brand-bg/40">
                  <button v-for="nav in aboutNavs" :key="nav.key"
                    @click="aboutTab = nav.key"
                    class="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px flex-shrink-0"
                    :class="aboutTab === nav.key
                      ? 'border-brand-accent text-brand-accent'
                      : 'border-transparent text-brand-muted hover:text-white'">
                    <component :is="nav.icon" class="w-4 h-4" />{{ nav.label }}
                  </button>
                </div>

                <div class="p-5">
                  <!-- О себе -->
                  <div v-if="aboutTab === 'about'" class="space-y-4">
                    <!-- Bio -->
                    <div class="relative">
                      <div v-if="viewedProfile.bio"
                        class="bg-brand-bg/60 border border-brand-border/60 rounded-2xl px-5 py-4 pr-12">
                        <p class="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{{ viewedProfile.bio }}</p>
                      </div>
                      <div v-else class="flex flex-col items-center gap-3 py-8 text-center bg-brand-bg/30 rounded-2xl border border-dashed border-brand-border/60">
                        <BIcon name="FileText" class="w-8 h-8 text-brand-muted/40" />
                        <div>
                          <p class="text-sm font-semibold text-brand-muted">О себе не написано</p>
                          <p v-if="isOwnProfile" class="text-xs text-brand-muted/60 mt-0.5">Расскажи немного о себе</p>
                        </div>
                      </div>
                      <button v-if="isOwnProfile" @click="openEditModal('bio')"
                        class="absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-lg text-brand-muted hover:text-brand-accent hover:bg-brand-card border border-transparent hover:border-brand-border transition-all">
                        <BIcon name="Pencil" class="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <!-- Info grid: 2-column chips -->
                    <div class="grid grid-cols-2 gap-2">
                      <div v-if="viewedProfile.pronouns"
                        class="flex items-center gap-2 px-3 py-2.5 bg-brand-bg border border-brand-border rounded-2xl">
                        <BIcon name="Quote" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
                        <div class="min-w-0">
                          <p class="text-[10px] text-brand-muted uppercase tracking-wide">Местоимения</p>
                          <p class="text-xs text-white font-semibold truncate">{{ viewedProfile.pronouns }}</p>
                        </div>
                      </div>
                      <div v-if="(viewedProfile as any).job_title"
                        class="flex items-center gap-2 px-3 py-2.5 bg-brand-bg border border-brand-border rounded-2xl">
                        <BIcon name="Briefcase" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
                        <div class="min-w-0">
                          <p class="text-[10px] text-brand-muted uppercase tracking-wide">Должность</p>
                          <p class="text-xs text-white font-semibold truncate">{{ (viewedProfile as any).job_title }}</p>
                        </div>
                      </div>
                      <div v-if="viewedProfile.relationship_status"
                        class="flex items-center gap-2 px-3 py-2.5 bg-brand-bg border border-brand-border rounded-2xl">
                        <BIcon name="Heart" class="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
                        <div class="min-w-0">
                          <p class="text-[10px] text-brand-muted uppercase tracking-wide">Отношения</p>
                          <p class="text-xs text-white font-semibold truncate">{{ { single: 'Свободен/а', in_relationship: 'В отношениях', married: 'В браке', complicated: 'Всё сложно', open: 'Открытые', looking: 'В поиске' }[viewedProfile.relationship_status] ?? viewedProfile.relationship_status }}</p>
                        </div>
                      </div>
                      <div v-if="viewedProfile.persona"
                        class="flex items-center gap-2 px-3 py-2.5 bg-brand-bg border border-brand-border rounded-2xl">
                        <BIcon name="PawPrint" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
                        <div class="min-w-0">
                          <p class="text-[10px] text-brand-muted uppercase tracking-wide">Фурсона</p>
                          <p class="text-xs text-white font-semibold truncate">{{ viewedProfile.persona }}</p>
                        </div>
                      </div>
                      <div v-if="viewedProfile.location"
                        class="flex items-center gap-2 px-3 py-2.5 bg-brand-bg border border-brand-border rounded-2xl">
                        <BIcon name="MapPin" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
                        <div class="min-w-0">
                          <p class="text-[10px] text-brand-muted uppercase tracking-wide">Город</p>
                          <p class="text-xs text-white font-semibold truncate">{{ viewedProfile.location }}</p>
                        </div>
                      </div>
                      <div v-if="(viewedProfile as any).country"
                        class="flex items-center gap-2 px-3 py-2.5 bg-brand-bg border border-brand-border rounded-2xl">
                        <BIcon name="Globe" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
                        <div class="min-w-0">
                          <p class="text-[10px] text-brand-muted uppercase tracking-wide">Страна</p>
                          <p class="text-xs text-white font-semibold truncate">{{ (viewedProfile as any).country }}</p>
                        </div>
                      </div>
                      <a v-if="viewedProfile.website" :href="viewedProfile.website" target="_blank" rel="noopener noreferrer"
                        class="flex items-center gap-2 px-3 py-2.5 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-accent/50 transition-all">
                        <BIcon name="Link" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
                        <div class="min-w-0">
                          <p class="text-[10px] text-brand-muted uppercase tracking-wide">Сайт</p>
                          <p class="text-xs text-brand-accent font-semibold truncate hover:underline">{{ viewedProfile.website.replace(/^https?:\/\//, '') }}</p>
                        </div>
                      </a>
                      <div class="flex items-center gap-2 px-3 py-2.5 bg-brand-bg border border-brand-border rounded-2xl">
                        <BIcon name="Calendar" class="w-3.5 h-3.5 text-brand-muted flex-shrink-0" />
                        <div class="min-w-0">
                          <p class="text-[10px] text-brand-muted uppercase tracking-wide">На платформе</p>
                          <p class="text-xs text-brand-muted truncate">{{ joinDate }}</p>
                        </div>
                      </div>
                    </div>

                    <!-- Edit shortcuts (own profile) -->
                    <div v-if="isOwnProfile" class="flex gap-2 flex-wrap pt-1 border-t border-brand-border/40">
                      <button @click="openEditModal('basics')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-muted hover:text-white bg-brand-bg border border-brand-border hover:border-brand-accent/40 rounded-xl transition-all">
                        <BIcon name="User" class="w-3 h-3" /> Основное
                      </button>
                      <button @click="openEditModal('contacts')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-muted hover:text-white bg-brand-bg border border-brand-border hover:border-brand-accent/40 rounded-xl transition-all">
                        <BIcon name="MapPin" class="w-3 h-3" /> Местоположение
                      </button>
                      <button @click="openEditModal('socials')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-muted hover:text-white bg-brand-bg border border-brand-border hover:border-brand-accent/40 rounded-xl transition-all">
                        <BIcon name="AtSign" class="w-3 h-3" /> Соцсети
                      </button>
                    </div>
                  </div>

                  <!-- Фурсона -->
                  <div v-else-if="aboutTab === 'fursona'" class="space-y-4">
                    <!-- Step tracker -->
                    <div class="flex items-center gap-1 bg-brand-bg/40 p-3 rounded-2xl border border-brand-border/60">
                      <div v-for="(step, i) in fursonaSteps" :key="i" class="flex items-center gap-1 flex-1">
                        <div class="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded-xl text-xs font-bold transition-all"
                          :class="step.locked ? 'text-brand-muted/40' : step.done ? 'bg-brand-accent/15 text-brand-accent' : 'bg-brand-bg text-brand-muted border border-brand-border'">
                          <BIcon :name="step.done ? 'Check' : step.iconName" class="w-3 h-3 flex-shrink-0" />
                          <span class="text-[10px] truncate">{{ step.label }}</span>
                        </div>
                        <div v-if="i < fursonaSteps.length - 1" class="w-3 h-px bg-brand-border/60 flex-shrink-0"></div>
                      </div>
                      <button v-if="isOwnProfile" @click="openEditModal('fursona')"
                        class="ml-2 flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-xl bg-brand-card border border-brand-border hover:border-brand-accent text-brand-muted hover:text-brand-accent transition-all">
                        <BIcon name="Pencil" class="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <!-- Species hero -->
                    <div v-if="viewedProfile.persona"
                      class="flex items-center gap-5 p-5 bg-brand-bg rounded-2xl border border-brand-border">
                      <div class="w-20 h-20 rounded-3xl flex items-center justify-center flex-shrink-0 shadow-lg" :style="accentStyleSubtle">
                        <BIcon name="PawPrint" class="w-10 h-10" />
                      </div>
                      <div class="min-w-0">
                        <p v-if="(viewedProfile as any).fursona_name" class="text-xs text-brand-muted uppercase tracking-wider mb-0.5">Имя</p>
                        <p class="font-extrabold text-white text-2xl leading-tight truncate">{{ (viewedProfile as any).fursona_name || viewedProfile.persona }}</p>
                        <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span class="px-2.5 py-1 bg-brand-card border border-brand-border rounded-xl text-xs font-bold text-brand-accent">
                            {{ viewedProfile.persona }}
                          </span>
                          <span v-if="viewedProfile.pronouns"
                            class="px-2.5 py-1 bg-brand-card border border-brand-border rounded-xl text-xs font-semibold text-brand-muted">
                            {{ viewedProfile.pronouns }}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div v-else class="flex flex-col items-center gap-3 py-8 bg-brand-bg/30 rounded-2xl border border-dashed border-brand-border text-center">
                      <BIcon name="PawPrint" class="w-10 h-10 text-brand-muted/30" />
                      <p class="text-sm font-semibold text-brand-muted">Фурсона не создана</p>
                      <button v-if="isOwnProfile" @click="openEditModal('fursona')"
                        class="inline-flex items-center gap-2 px-4 py-2 bg-brand-accent/10 hover:bg-brand-accent/20 border border-brand-accent/30 text-brand-accent rounded-xl text-xs font-bold transition-all">
                        <BIcon name="Plus" class="w-3 h-3" /> Создать фурсону
                      </button>
                    </div>

                    <!-- Likes / Dislikes -->
                    <div v-if="viewedProfile.likes.length || viewedProfile.dislikes.length" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div v-if="viewedProfile.likes.length" class="p-4 bg-brand-success/5 border border-brand-success/20 rounded-2xl">
                        <p class="flex items-center gap-1.5 text-xs font-bold text-brand-success uppercase tracking-wider mb-3">
                          <BIcon name="Heart" class="w-3.5 h-3.5" /> Любит
                        </p>
                        <div class="flex flex-wrap gap-1.5">
                          <span v-for="item in viewedProfile.likes" :key="item"
                            class="px-2.5 py-1 bg-brand-success/10 border border-brand-success/20 text-brand-success text-xs rounded-lg font-semibold">{{ item }}</span>
                        </div>
                      </div>
                      <div v-if="viewedProfile.dislikes.length" class="p-4 bg-brand-error/5 border border-brand-error/20 rounded-2xl">
                        <p class="flex items-center gap-1.5 text-xs font-bold text-brand-error uppercase tracking-wider mb-3">
                          <BIcon name="HeartOff" class="w-3.5 h-3.5" /> Не любит
                        </p>
                        <div class="flex flex-wrap gap-1.5">
                          <span v-for="item in viewedProfile.dislikes" :key="item"
                            class="px-2.5 py-1 bg-brand-error/10 border border-brand-error/20 text-brand-error text-xs rounded-lg font-semibold">{{ item }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- Photo / Ref locked -->
                    <div class="grid grid-cols-2 gap-3">
                      <div class="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-brand-border/40 rounded-2xl text-center opacity-50 cursor-not-allowed select-none">
                        <BIcon name="Camera" class="w-6 h-6 text-brand-muted" />
                        <p class="text-xs font-bold text-brand-muted">Шаг 3 — Фото</p>
                        <span class="text-[10px] text-brand-muted/60 px-2 py-0.5 bg-brand-bg rounded-full">coming soon</span>
                      </div>
                      <div class="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-brand-border/40 rounded-2xl text-center opacity-50 cursor-not-allowed select-none">
                        <BIcon name="Image" class="w-6 h-6 text-brand-muted" />
                        <p class="text-xs font-bold text-brand-muted">Шаг 4 — Реф</p>
                        <span class="text-[10px] text-brand-muted/60 px-2 py-0.5 bg-brand-bg rounded-full">coming soon</span>
                      </div>
                    </div>
                  </div>

                  <!-- Интересы -->
                  <div v-else-if="aboutTab === 'interests'" class="space-y-5">

                    <!-- Manual interests -->
                    <div>
                      <div class="flex items-center justify-between mb-3">
                        <p class="text-[11px] font-bold text-brand-muted uppercase tracking-wider flex items-center gap-1.5">
                          <BIcon name="Sparkles" class="w-3.5 h-3.5 text-brand-accent" /> Мои интересы
                        </p>
                        <button v-if="isOwnProfile" @click="showInterestInput = !showInterestInput"
                          class="w-6 h-6 flex items-center justify-center rounded-lg bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent border border-brand-accent/30 transition-all">
                          <BIcon name="Plus" class="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <!-- Inline add -->
                      <Transition name="fade">
                        <div v-if="showInterestInput" class="flex gap-2 mb-3">
                          <input v-model="newInterestText" @keydown.enter="addManualInterest" @keydown.escape="showInterestInput = false; newInterestText = ''"
                            type="text" placeholder="Например: Рисование, Игры, Музыка…" maxlength="30"
                            class="flex-1 bg-brand-bg border border-brand-accent/50 focus:border-brand-accent rounded-xl px-3 py-2 text-sm text-white placeholder-brand-muted/50 focus:outline-none transition-all" autofocus />
                          <button @click="addManualInterest"
                            class="px-4 py-2 bg-brand-accent hover:bg-brand-accent-plus text-white text-xs font-bold rounded-xl transition-all">Добавить</button>
                          <button @click="showInterestInput = false; newInterestText = ''"
                            class="w-9 h-9 flex items-center justify-center rounded-xl text-brand-muted hover:text-white bg-brand-bg border border-brand-border transition-all">
                            <BIcon name="X" class="w-4 h-4" />
                          </button>
                        </div>
                      </Transition>
                      <!-- Interest pills - colorful palette -->
                      <div v-if="((viewedProfile as any).interests ?? []).length" class="flex flex-wrap gap-2">
                        <span v-for="(interest, idx) in (viewedProfile as any).interests" :key="idx"
                          class="group inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-bold border-2 transition-all cursor-default"
                          :style="{ borderColor: ['#4C67CF','#9146FF','#E4405F','#FAAF3A','#2AABEE','#10B981','#F59E0B'][idx % 7] + '60', backgroundColor: ['#4C67CF','#9146FF','#E4405F','#FAAF3A','#2AABEE','#10B981','#F59E0B'][idx % 7] + '15', color: ['#7B9EFF','#C084FC','#F87171','#FCD34D','#67E8F9','#6EE7B7','#FDE68A'][idx % 7] }">
                          {{ interest }}
                          <button v-if="isOwnProfile" @click="removeManualInterest(idx)"
                            class="opacity-0 group-hover:opacity-100 w-4 h-4 rounded-full bg-black/30 flex items-center justify-center transition-all hover:bg-black/60">
                            <BIcon name="X" class="w-2.5 h-2.5" />
                          </button>
                        </span>
                      </div>
                      <div v-else-if="!isOwnProfile" class="py-6 text-center text-brand-muted/60 text-sm">
                        Интересы не добавлены
                      </div>
                      <button v-else-if="isOwnProfile && !showInterestInput" @click="showInterestInput = true"
                        class="w-full py-6 border-2 border-dashed border-brand-border/50 rounded-2xl flex flex-col items-center gap-2 text-brand-muted/60 hover:text-brand-muted hover:border-brand-accent/30 transition-all">
                        <BIcon name="Sparkles" class="w-7 h-7" />
                        <p class="text-xs font-semibold">Добавь свои интересы</p>
                      </button>
                    </div>

                    <!-- Hashtags word cloud -->
                    <div v-if="userHashtags.length">
                      <p class="text-[11px] font-bold text-brand-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <BIcon name="Hash" class="w-3.5 h-3.5" /> Теги из публикаций · {{ userHashtags.length }}
                      </p>
                      <div class="flex flex-wrap gap-x-3 gap-y-2 items-end leading-tight">
                        <span v-for="tag in userHashtags" :key="tag.name"
                          class="font-bold transition-all cursor-default hover:opacity-100"
                          :style="{ fontSize: tagFontSize(tag.count) + 'px', color: '#4C67CF', opacity: 0.45 + 0.55 * (tag.count / (maxHashtagCount || 1)) }">
                          #{{ tag.name }}
                        </span>
                      </div>
                    </div>
                    <div v-else-if="!((viewedProfile as any).interests?.length)" class="flex flex-col items-center gap-3 py-6 text-center">
                      <BIcon name="Sparkles" class="w-10 h-10 text-brand-muted/25" />
                      <p class="text-sm font-semibold text-brand-muted">Интересы пустые</p>
                      <p class="text-xs text-brand-muted/60">Добавь интересы или создай публикации с хештегами</p>
                    </div>
                  </div>


                </div>
              </div>

              <!-- AD Account Toggle -->
              <div v-if="isOwnProfile && canToggleAd"
                class="relative overflow-hidden border rounded-3xl p-4 transition-all duration-500 cursor-pointer"
                :class="isAdMode ? 'bg-emerald-950/30 border-emerald-500/30 shadow-lg shadow-emerald-500/10' : 'bg-brand-card border-brand-border hover:border-brand-border/80'"
                @click="toggleAdMode">
                <div v-if="isAdMode" class="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_80%_50%,rgba(16,185,129,0.15),transparent_70%)]"></div>
                <div class="relative flex items-center justify-between gap-4">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                      :class="isAdMode ? 'bg-emerald-500/20' : 'bg-brand-bg border border-brand-border'">
                      <BIcon :name="isAdMode ? 'Megaphone' : 'User'" class="w-5 h-5" :class="isAdMode ? 'text-emerald-400' : 'text-brand-muted'" />
                    </div>
                    <div>
                      <p class="font-bold text-white text-sm">{{ isAdMode ? 'Рекламный аккаунт' : 'Обычный аккаунт' }}</p>
                      <p class="text-xs text-brand-muted">{{ isAdMode ? 'Монетизация контента включена' : 'Переключитесь для рекламных возможностей' }}</p>
                    </div>
                  </div>
                  <div class="relative flex-shrink-0 w-12 h-6 rounded-full transition-all duration-300 pointer-events-none"
                    :class="isAdMode ? 'bg-emerald-500' : 'bg-brand-muted'">
                    <span class="absolute top-0.5 h-5 w-5 bg-white rounded-full shadow transition-transform duration-300 flex items-center justify-center"
                      :class="isAdMode ? 'translate-x-[26px] left-0' : 'left-0.5'">
                      <span v-if="isTogglingAd" class="w-3 h-3 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                    </span>
                  </div>
                </div>
              </div>

              <!-- ── Content tabs as floating pills ──────────────────────── -->
              <div class="flex flex-wrap gap-2">
                <button v-for="tab in contentTabs" :key="tab.key"
                  @click="activeContentTab = tab.key; loadTabData(tab.key)"
                  class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold border transition-all duration-200 whitespace-nowrap"
                  :class="activeContentTab === tab.key
                    ? 'bg-brand-accent text-white border-brand-accent shadow-md shadow-brand-accent/25'
                    : 'bg-brand-card text-brand-muted border-brand-border hover:border-brand-accent/50 hover:text-white'">
                  <component :is="tab.icon" class="w-4 h-4" />{{ tab.label }}
                </button>
              </div>

              <!-- ── Full post creator (MainLayout style) ──────────────── -->
              <div v-if="isOwnProfile && activeContentTab === 'posts'"
                class="bg-brand-card border rounded-3xl shadow-xl transition-colors"
                :class="showPostForm ? 'border-brand-accent/30' : 'border-brand-border'">
                <!-- Collapsed trigger -->
                <button v-if="!showPostForm" @click="showPostForm = true"
                  class="w-full flex items-center gap-3 px-5 py-4 text-left group">
                  <img v-if="ownAvatarSrc" :src="ownAvatarSrc" class="w-10 h-10 rounded-full border-2 border-brand-border object-cover flex-shrink-0 group-hover:border-brand-accent/50 transition-colors" />
                  <div v-else class="w-10 h-10 rounded-full border-2 border-brand-border flex-shrink-0 group-hover:border-brand-accent/50 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold transition-colors">{{ (authStore.user?.display_name || authStore.user?.username || '?')[0].toUpperCase() }}</div>
                  <span class="flex-1 text-sm text-brand-muted bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 group-hover:border-brand-accent/40 transition-colors">Что нового?</span>
                  <div class="flex items-center gap-2 text-brand-muted group-hover:text-white transition-colors ml-1">
                    <BIcon name="ImagePlus" class="w-5 h-5" />
                    <BIcon name="Hash" class="w-5 h-5" />
                  </div>
                </button>
                <!-- Expanded composer -->
                <div v-else class="p-5 space-y-4">
                  <div class="flex items-start gap-3">
                    <img v-if="ownAvatarSrc" :src="ownAvatarSrc" class="w-10 h-10 rounded-full border-2 border-brand-border object-cover flex-shrink-0 mt-0.5" />
                    <div v-else class="w-10 h-10 rounded-full border-2 border-brand-border flex-shrink-0 mt-0.5 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold">{{ (authStore.user?.display_name || authStore.user?.username || '?')[0].toUpperCase() }}</div>
                    <div class="flex-1 min-w-0">
                      <MentionTextarea v-model="newPostContent" placeholder="Что у вас нового? Используйте @ для упоминаний" minHeight="90px" />
                    </div>
                    <button @click="createPost" :disabled="!newPostContent.trim() || isCreatingPost"
                      class="w-10 h-10 rounded-full flex items-center justify-center bg-brand-accent text-white hover:bg-brand-accent-plus disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-accent/25 flex-shrink-0 mt-0.5">
                      <BIcon v-if="isCreatingPost" name="Loader2" class="w-5 h-5 animate-spin" />
                      <BIcon v-else name="SendHorizontal" class="w-5 h-5" />
                    </button>
                  </div>
                  <!-- Media previews -->
                  <MediaUpload ref="profileMediaUploadRef" type="posts" :multiple="true" @uploaded="onProfileMediaUploaded" />
                  <!-- Media URL thumbnails -->
                  <div v-if="newPostMediaUrls.length" class="flex flex-wrap gap-2">
                    <div v-for="(url, idx) in newPostMediaUrls" :key="idx" class="relative w-16 h-16 rounded-xl overflow-hidden border border-brand-border group">
                      <img v-if="isImage(url)" :src="url" class="w-full h-full object-cover" />
                      <video v-else :src="url" class="w-full h-full object-cover" muted />
                      <button @click="newPostMediaUrls.splice(idx, 1)"
                        class="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <BIcon name="X" class="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                  <div class="border-t border-brand-border" />
                  <div class="flex items-center gap-2 flex-wrap">
                    <button @click="profileMediaUploadRef?.openPicker()"
                      class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-brand-muted hover:text-white hover:bg-brand-bg border border-transparent hover:border-brand-border transition-all">
                      <BIcon name="ImagePlus" class="w-4 h-4" /> Медиа
                    </button>
                    <button @click="newPostIsNsfw = !newPostIsNsfw"
                      class="px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                      :class="newPostIsNsfw ? 'border-brand-error/60 text-brand-error bg-brand-error/10' : 'border-transparent text-brand-muted hover:border-brand-border hover:bg-brand-bg hover:text-white'">
                      NSFW
                    </button>
                    <div class="flex-1" />
                    <button @click="showPostForm = false; newPostContent = ''; newPostMediaUrls = []; profileMediaUploadRef?.clearAll()"
                      class="text-xs font-semibold text-brand-muted hover:text-white transition-all">Отмена</button>
                  </div>
                </div>
              </div>

              <!-- ── Content card ──────────────────────────────────────── -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="p-4 space-y-3">

                  <!-- POSTS / REPAWS -->
                  <template v-if="['posts', 'repaws'].includes(activeContentTab)">

                    <!-- Pinned post -->
                    <div v-if="pinnedPost && activeContentTab === 'posts'">
                      <div class="flex items-center gap-2 text-xs text-brand-muted font-semibold mb-2 px-1">
                        <BIcon name="Pin" class="w-3.5 h-3.5 text-brand-accent" /> Закреплённый пост
                      </div>
                      <PostCard :post="pinnedPost" :is-own-profile="isOwnProfile"
                        :is-pinned-post-id="viewedProfile.pinned_post_id"
                        @pin="pinPost" @unpin="unpinPost" @deleted="onPostDeleted" @updated="onPostUpdated" />
                    </div>

                    <!-- Skeleton -->
                    <div v-if="isLoadingTab" class="space-y-3">
                      <div v-for="n in 3" :key="n" class="h-28 bg-brand-bg border border-brand-border rounded-2xl animate-pulse"></div>
                    </div>

                    <!-- Posts empty → show repaws fallback, or CTA -->
                    <template v-else-if="activeContentTab === 'posts' && tabPosts.filter((p: any) => p.id !== viewedProfile.pinned_post_id).length === 0 && !pinnedPost">
                      <template v-if="repawsFallback.length">
                        <div class="flex items-center gap-2 text-xs text-brand-muted font-semibold mb-1 px-1">
                          <BIcon name="Repeat2" class="w-3.5 h-3.5 text-brand-accent" /> Постов нет — показываем RePaws
                        </div>
                        <PostCard v-for="post in repawsFallback" :key="post.id"
                          :post="post" :is-own-profile="isOwnProfile"
                          :is-pinned-post-id="viewedProfile.pinned_post_id"
                          :show-repaw-label="true"
                          @pin="pinPost" @unpin="unpinPost" @deleted="onPostDeleted" @updated="onPostUpdated" />
                      </template>
                      <div v-else class="py-14 text-center text-brand-muted">
                        <BIcon name="FileText" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p class="font-semibold text-sm mb-4">Постов пока нет</p>
                        <button v-if="isOwnProfile" @click="showPostForm = true; $nextTick(() => window.scrollTo({top: 0, behavior: 'smooth'}))"
                          class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-brand-accent/20">
                          <BIcon name="Plus" class="w-4 h-4" /> Создать первый пост
                        </button>
                      </div>
                    </template>

                    <!-- Posts / repaws list -->
                    <template v-else>
                      <PostCard v-for="post in tabPosts.filter((p: any) => p.id !== viewedProfile.pinned_post_id)" :key="post.id"
                        :post="post" :is-own-profile="isOwnProfile"
                        :is-pinned-post-id="viewedProfile.pinned_post_id"
                        :show-repaw-label="activeContentTab === 'repaws'"
                        @pin="pinPost" @unpin="unpinPost" @deleted="onPostDeleted" @updated="onPostUpdated" />
                    </template>
                  </template>

                  <!-- MEDIA -->
                  <div v-else-if="activeContentTab === 'media'">
                    <div class="flex gap-2 mb-4">
                      <button v-for="f in (['all','photo','video'] as const)" :key="f" @click="mediaFilter = f"
                        class="px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all"
                        :class="mediaFilter === f ? 'bg-brand-accent border-brand-accent text-white' : 'border-brand-border text-brand-muted hover:text-white'">
                        {{ f === 'all' ? `Всё · ${tabPosts.length}` : f === 'photo' ? `Фото · ${tabPosts.filter((p: any) => isImage(p.media_urls[0])).length}` : `Видео · ${tabPosts.filter((p: any) => !isImage(p.media_urls[0])).length}` }}
                      </button>
                    </div>

                    <div v-if="isLoadingTab" class="grid grid-cols-3 gap-1.5">
                      <div v-for="n in 9" :key="n" class="aspect-square bg-brand-bg border border-brand-border rounded-xl animate-pulse"></div>
                    </div>
                    <div v-else-if="!filteredMediaPosts.length" class="py-14 text-center text-brand-muted">
                      <BIcon name="Image" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p class="font-semibold text-sm">Медиа пока нет</p>
                    </div>
                    <div v-else class="grid grid-cols-3 gap-1.5">
                      <div v-for="post in filteredMediaPosts" :key="post.id"
                        @click="expandedMediaPost = expandedMediaPost?.id === post.id ? null : post"
                        class="relative aspect-square rounded-xl overflow-hidden cursor-pointer group border border-brand-border/60 hover:border-brand-accent/60 bg-brand-bg transition-all">
                        <img v-if="isImage(post.media_urls[0])" :src="post.media_urls[0]" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        <div v-else class="w-full h-full flex items-center justify-center bg-brand-bg">
                          <BIcon name="Play" class="w-8 h-8 text-brand-muted" />
                        </div>
                        <div v-if="post.media_urls.length > 1" class="absolute top-1.5 right-1.5 bg-black/70 rounded-lg px-1.5 py-0.5 text-[10px] text-white font-bold">+{{ post.media_urls.length - 1 }}</div>
                        <div class="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-end p-2 opacity-0 group-hover:opacity-100">
                          <span class="flex items-center gap-1 text-white text-xs font-bold">
                            <BIcon name="ChevronUp" class="w-3.5 h-3.5" />{{ post.rating }}
                          </span>
                        </div>
                      </div>
                    </div>

                    <Transition name="fade">
                      <div v-if="expandedMediaPost" class="mt-3 bg-brand-bg border border-brand-border rounded-2xl p-4">
                        <div class="flex items-center justify-between mb-3">
                          <span class="text-sm font-bold text-white/70">{{ formatDate(expandedMediaPost.created_at) }}</span>
                          <button @click="expandedMediaPost = null" class="w-7 h-7 flex items-center justify-center rounded-lg text-brand-muted hover:text-white hover:bg-brand-border/50 transition">
                            <BIcon name="X" class="w-4 h-4" />
                          </button>
                        </div>
                        <p v-if="expandedMediaPost.content" class="text-sm text-white/80 mb-3 whitespace-pre-wrap">{{ expandedMediaPost.content }}</p>
                        <div class="grid gap-2" :class="expandedMediaPost.media_urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'">
                          <template v-for="(url, i) in expandedMediaPost.media_urls" :key="i">
                            <img v-if="isImage(url)" :src="url" class="w-full rounded-xl object-cover max-h-80" />
                            <video v-else :src="url" controls class="w-full rounded-xl max-h-80" />
                          </template>
                        </div>
                      </div>
                    </Transition>
                  </div>

                  <!-- FRIENDS -->
                  <div v-else-if="activeContentTab === 'friends'">
                    <div v-if="isLoadingTab" class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      <div v-for="n in 6" :key="n" class="h-24 bg-brand-bg border border-brand-border rounded-2xl animate-pulse"></div>
                    </div>
                    <div v-else-if="!friends.length" class="py-14 text-center text-brand-muted">
                      <BIcon name="Users" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p class="font-semibold text-sm mb-1">Друзей пока нет</p>
                      <p class="text-xs opacity-70">Друзья — это взаимная подписка</p>
                    </div>
                    <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      <router-link v-for="friend in friends" :key="friend.id" :to="'/profile/' + friend.id"
                        class="flex flex-col items-center gap-2 p-3 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-accent/50 transition-all group">
                        <img v-if="friend.avatar_url" :src="friend.avatar_url" class="w-12 h-12 rounded-full object-cover" />
                        <div v-else class="w-12 h-12 rounded-full bg-brand-accent/20 border border-brand-border flex items-center justify-center text-brand-accent font-bold text-lg">{{ (friend.display_name || friend.username || '?')[0].toUpperCase() }}</div>
                        <div class="text-center min-w-0 w-full">
                          <p class="text-xs font-bold text-white truncate group-hover:text-brand-accent transition-colors">{{ friend.display_name || friend.username }}</p>
                          <p class="text-[10px] text-brand-muted truncate">@{{ friend.username }}</p>
                        </div>
                      </router-link>
                    </div>
                  </div>

                </div>
              </div>

            </div>
            <!-- / CENTER COLUMN -->

            <!-- ── RIGHT SIDEBAR ────────────────────────────────────────── -->
            <div class="hidden xl:flex flex-col gap-3 w-60 flex-shrink-0 sticky top-24 self-start">

              <!-- Stats -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl p-3">
                <div class="grid grid-cols-3 gap-1.5">
                  <button v-for="stat in profileStats" :key="stat.key"
                    @click="stat.tab ? (activeContentTab = stat.tab, loadTabData(stat.tab)) : null"
                    class="flex flex-col items-center gap-1 p-3 rounded-2xl bg-brand-bg/50 hover:bg-brand-bg border border-brand-border/50 hover:border-brand-accent/30 transition-all group cursor-pointer">
                    <span class="text-base font-extrabold text-white group-hover:text-brand-accent transition-colors leading-none">{{ stat.value }}</span>
                    <span class="text-[10px] text-brand-muted font-medium text-center leading-tight">{{ stat.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Wallet card (own profile only) -->
              <div v-if="isOwnProfile" @click="showWalletModal = true"
                class="relative overflow-hidden bg-gradient-to-br from-brand-accent/15 to-brand-accent-plus/15 border border-brand-accent/25 hover:border-brand-accent/50 rounded-3xl shadow-xl p-4 cursor-pointer transition-all hover:scale-[1.01] group">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-xl bg-brand-accent/20 flex items-center justify-center">
                      <BIcon name="Wallet" class="w-3.5 h-3.5 text-brand-accent" />
                    </div>
                    <p class="text-[11px] font-bold uppercase tracking-widest text-brand-muted">Кошелёк</p>
                  </div>
                  <BIcon name="ChevronRight" class="w-4 h-4 text-brand-muted group-hover:text-brand-accent transition-colors" />
                </div>
                <div class="flex items-baseline gap-1.5">
                  <span class="text-2xl font-extrabold text-white leading-none">
                    {{ Number((viewedProfile as any)?.wallet?.balance ?? 0).toFixed(2) }}
                  </span>
                  <span class="text-xs font-semibold text-brand-accent-minus">Blooms</span>
                </div>
                <p class="text-[10px] text-brand-muted mt-1">🌸 внутренняя валюта</p>
              </div>

              <!-- Info + Contacts merged card -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="px-4 pt-3.5 pb-2 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <BIcon name="Info" class="w-3.5 h-3.5 text-brand-accent" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-brand-muted">Информация</p>
                  </div>
                  <button v-if="isOwnProfile" @click="openEditModal('contacts')"
                    class="w-6 h-6 flex items-center justify-center rounded-lg text-brand-muted hover:text-brand-accent hover:bg-brand-bg transition-all">
                    <BIcon name="Pencil" class="w-3 h-3" />
                  </button>
                </div>
                <div class="px-2 pb-2 space-y-0.5">
                  <div v-if="viewedProfile.relationship_status" class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <BIcon name="Heart" class="w-4 h-4 text-pink-400 flex-shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-brand-muted uppercase tracking-wide">Отношения</p>
                      <p class="text-xs text-brand-offwhite font-medium truncate">{{ { single: 'Свободен/а', in_relationship: 'В отношениях', married: 'В браке', complicated: 'Всё сложно', open: 'Открытые отношения', looking: 'В поиске' }[viewedProfile.relationship_status] ?? viewedProfile.relationship_status }}</p>
                    </div>
                  </div>
                  <div v-if="viewedProfile.persona" class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <BIcon name="Footprints" class="w-4 h-4 text-brand-muted flex-shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-brand-muted uppercase tracking-wide">Фурсона</p>
                      <p class="text-xs text-brand-offwhite font-semibold truncate">{{ viewedProfile.persona }}</p>
                    </div>
                  </div>
                  <div v-if="viewedProfile.location" class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <BIcon name="MapPin" class="w-4 h-4 text-brand-accent flex-shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-brand-muted uppercase tracking-wide">Город</p>
                      <p class="text-xs text-brand-offwhite truncate">{{ viewedProfile.location }}</p>
                    </div>
                  </div>
                  <div v-if="(viewedProfile as any).country" class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <BIcon name="Globe" class="w-4 h-4 text-brand-accent flex-shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-brand-muted uppercase tracking-wide">Страна</p>
                      <p class="text-xs text-brand-offwhite truncate">{{ (viewedProfile as any).country }}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <BIcon name="Calendar" class="w-4 h-4 text-brand-muted flex-shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-brand-muted uppercase tracking-wide">На платформе с</p>
                      <p class="text-xs text-brand-muted">{{ joinDate }}</p>
                    </div>
                  </div>
                  <a v-if="viewedProfile.website" :href="viewedProfile.website" target="_blank" rel="noopener noreferrer"
                    class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all group">
                    <BIcon name="Link" class="w-4 h-4 text-brand-accent flex-shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-brand-muted uppercase tracking-wide">Сайт</p>
                      <p class="text-xs text-brand-accent group-hover:underline truncate">{{ viewedProfile.website.replace(/^https?:\/\//, '') }}</p>
                    </div>
                  </a>
                </div>
              </div>

              <!-- Social links -->
              <div v-if="activeSocialLinks.length || isOwnProfile"
                class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="px-4 pt-3.5 pb-2 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <BIcon name="AtSign" class="w-3.5 h-3.5 text-brand-accent" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-brand-muted">Соцсети</p>
                  </div>
                  <button v-if="isOwnProfile" @click="openEditModal('socials')"
                    class="w-6 h-6 flex items-center justify-center rounded-lg text-brand-muted hover:text-brand-accent hover:bg-brand-bg transition-all">
                    <BIcon name="Pencil" class="w-3 h-3" />
                  </button>
                </div>
                <div v-if="activeSocialLinks.length" class="px-2 pb-2 space-y-0.5">
                  <a v-for="net in activeSocialLinks" :key="net.key"
                    :href="socialUrl(net.key, (viewedProfile as any).social_links[net.key])" target="_blank" rel="noopener noreferrer"
                    class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all group">
                    <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      :style="{ backgroundColor: net.color + '22' }">
                      <BIcon :name="net.iconName" class="w-3.5 h-3.5" :style="{ color: net.color }" />
                    </div>
                    <div class="min-w-0">
                      <p class="text-[10px] text-brand-muted uppercase tracking-wide">{{ net.label }}</p>
                      <p class="text-xs text-brand-offwhite font-medium truncate group-hover:text-white">{{ (viewedProfile as any).social_links[net.key] }}</p>
                    </div>
                  </a>
                </div>
                <div v-else class="px-4 pb-4 text-center">
                  <p class="text-xs text-brand-muted/60">Соцсети не добавлены</p>
                  <button @click="openEditModal('socials')"
                    class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent border border-brand-accent/30 rounded-xl transition-all">
                    <BIcon name="Plus" class="w-3 h-3" /> Добавить
                  </button>
                </div>
              </div>

              <!-- Badges -->
              <div v-if="achievementBadges.length" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <button @click="showBadgesModal = true" class="w-full px-4 pt-3.5 pb-2 flex items-center justify-between hover:bg-brand-bg/30 transition-colors">
                  <div class="flex items-center gap-2">
                    <BIcon name="Award" class="w-3.5 h-3.5 text-yellow-400" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-brand-muted">Значки</p>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-[11px] font-bold bg-brand-accent/15 text-brand-accent px-2 py-0.5 rounded-full">{{ achievementBadges.length }}</span>
                    <BIcon name="ChevronRight" class="w-3.5 h-3.5 text-brand-muted" />
                  </div>
                </button>
                <div class="px-2 pb-2 space-y-0.5">
                  <div v-for="badge in achievementBadges" :key="badge.key"
                    class="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-brand-bg/60 transition-all group cursor-default">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110" :class="badge.iconBg">
                      <component :is="badge.iconComp" class="w-3.5 h-3.5" :class="badge.iconColor" />
                    </div>
                    <div class="min-w-0">
                      <p class="text-xs font-bold text-white leading-tight truncate">{{ badge.label }}</p>
                      <p class="text-[10px] text-brand-muted leading-tight mt-0.5 truncate">{{ badge.desc }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Mini media thumbnails -->
              <div v-if="tabPosts.filter((p: any) => p.media_urls?.length).length" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl p-3">
                <p class="text-[11px] font-bold uppercase tracking-widest text-brand-muted mb-2 px-1">Медиа</p>
                <div class="grid grid-cols-3 gap-1">
                  <div v-for="p in tabPosts.filter((p: any) => p.media_urls?.length).slice(0, 9)" :key="p.id"
                    class="aspect-square rounded-lg overflow-hidden bg-brand-bg cursor-pointer hover:opacity-75 transition-opacity">
                    <img v-if="isImage(p.media_urls[0])" :src="p.media_urls[0]" class="w-full h-full object-cover" />
                    <div v-else class="w-full h-full flex items-center justify-center bg-brand-border/20">
                      <BIcon name="Play" class="w-4 h-4 text-brand-muted" />
                    </div>
                  </div>
                </div>
              </div>

            </div>
            <!-- / RIGHT SIDEBAR -->

          </div>
          <!-- / TWO-COLUMN -->

        </template>
      </main>

    </div>

    <!-- ─── Avatar Viewer Modal ─────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showAvatarViewer" class="fixed inset-0 z-[600] bg-black/92 flex items-center justify-center p-4" @click.self="showAvatarViewer = false">
        <button @click="showAvatarViewer = false"
          class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all z-10">
          <BIcon name="X" class="w-5 h-5" />
        </button>
        <img :src="viewedProfile?.avatar_url" class="max-w-full max-h-[85vh] rounded-full object-cover shadow-2xl" />
      </div>
    </Transition>

    <!-- ─── Banner Viewer Modal ─────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showBannerViewer" class="fixed inset-0 z-[600] bg-black/92 flex items-center justify-center p-4" @click.self="showBannerViewer = false">
        <button @click="showBannerViewer = false"
          class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all z-10">
          <BIcon name="X" class="w-5 h-5" />
        </button>
        <img :src="viewedProfile?.banner_url" class="max-w-full max-h-[85vh] rounded-3xl object-contain shadow-2xl" />
      </div>
    </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUserStore, type UserProfile } from '@/stores/user'
import { useLangStore } from '@/stores/lang'
import PostComments from '@/components/PostComments.vue'
import PostCard from '@/components/PostCard.vue'
import MentionTextarea from '@/components/MentionTextarea.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import BIcon from '@/components/BIcon.vue'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import api from '@/api'
import {
  User, Users, UserPlus, UserMinus, UserCheck, UserX,
  Bell, MessageSquare, Pencil, Pin, Trash2, MoreHorizontal,
  ChevronUp, ChevronDown, Repeat2, MessageCircle, Heart, HeartOff,
  Image, Hash, Search, MapPin, Calendar, Link, Briefcase,
  FileText, BookImage, Send, Play, X, ArrowLeft, Megaphone,
  Crown, Shield, Star, BadgeCheck, Flame, Sparkles, Award,
  Footprints, Smile, SmilePlus, AlertCircle,
  LogOut, Camera, Eye, EyeOff, Info, Globe,
  PawPrint, Plus, Check, Twitter, Instagram, Youtube, Twitch, Github, Quote,
  Wallet, ChevronRight, AtSign, ArrowUpRight
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const userStore = useUserStore()
const langStore = useLangStore()

const closeMenu = () => {}

const viewedProfile = ref<UserProfile | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

type AboutTab = 'about' | 'fursona' | 'interests'
type ContentTab = 'posts' | 'repaws' | 'media' | 'friends'

const aboutTab = ref<AboutTab>('about')
const activeContentTab = ref<ContentTab>('posts')
const tabPosts = ref<any[]>([])
const repawsFallback = ref<any[]>([])
const friends = ref<any[]>([])
const userHashtags = ref<{ name: string; count: number }[]>([])
const isLoadingTab = ref(false)
const expandedMediaPost = ref<any | null>(null)
const pinnedPost = ref<any | null>(null)
const mediaFilter = ref<'all' | 'photo' | 'video'>('all')

const relation = reactive({ aFollowsB: false, bFollowsA: false, friends: false })
const isTogglingFollow = ref(false)
const isTogglingAd = ref(false)

const newPostContent = ref('')
const newPostMediaUrls = ref<string[]>([])
const newPostIsNsfw = ref(false)
const isCreatingPost = ref(false)
const profileMediaUploadRef = ref<InstanceType<typeof MediaUpload> | null>(null)

// ── NSFW (shared with AppHeader via v-model) ──────────────────────────────────
const nsfwMode = ref(false)

// ── Full post creator state ───────────────────────────────────────────────────
const showPostForm = ref(false)

// ── Edit modal ────────────────────────────────────────────────────────────────
const showEditModal = ref(false)
const showBadgesModal = ref(false)
const showWalletModal = ref(false)
const showAvatarViewer = ref(false)
const showBannerViewer = ref(false)
const editSection = ref<'basics' | 'bio' | 'fursona' | 'contacts' | 'socials'>('bio')
const isSavingEdit = ref(false)
const editForm = ref<{
  display_name?: string; pronouns?: string; job_title?: string
  bio?: string; persona?: string; fursona_name?: string; likes?: string[]; dislikes?: string[]
  location?: string; country?: string; website?: string; relationship_status?: string
  accent_color?: string; social_links?: Record<string, string>
}>({})

function openEditModal(section: 'basics' | 'bio' | 'fursona' | 'contacts' | 'socials') {
  editSection.value = section
  const p = viewedProfile.value
  if (!p) return
  editForm.value = {
    display_name: p.display_name ?? '',
    pronouns: (p as any).pronouns ?? '',
    job_title: (p as any).job_title ?? '',
    bio: p.bio ?? '',
    persona: (p as any).persona ?? '',
    fursona_name: (p as any).fursona_name ?? '',
    likes: [...((p as any).likes ?? [])],
    dislikes: [...((p as any).dislikes ?? [])],
    location: p.location ?? '',
    country: (p as any).country ?? '',
    website: p.website ?? '',
    relationship_status: (p as any).relationship_status ?? '',
    accent_color: p.accent_color ?? '',
    social_links: { ...((p as any).social_links ?? {}) },
  }
  showEditModal.value = true
}

// ── Interests (manual) ────────────────────────────────────────────────────────
const newInterestText = ref('')
const showInterestInput = ref(false)

async function addManualInterest() {
  const text = newInterestText.value.trim()
  if (!text || !viewedProfile.value) return
  const current: string[] = (viewedProfile.value as any).interests ?? []
  if (current.includes(text)) { newInterestText.value = ''; return }
  const updated = [...current, text]
  await userStore.updateProfile({ interests: updated } as any)
  ;(viewedProfile.value as any).interests = updated
  newInterestText.value = ''
  showInterestInput.value = false
}
async function removeManualInterest(idx: number) {
  if (!viewedProfile.value) return
  const current: string[] = (viewedProfile.value as any).interests ?? []
  const updated = current.filter((_, i) => i !== idx)
  await userStore.updateProfile({ interests: updated } as any)
  ;(viewedProfile.value as any).interests = updated
}

async function saveEditModal() {
  isSavingEdit.value = true
  try {
    await userStore.updateProfile(editForm.value as any)
    await loadProfile()
    showEditModal.value = false
  } catch {} finally { isSavingEdit.value = false }
}

// ── S3 uploads ────────────────────────────────────────────────────────────────
const bannerFileInput = ref<HTMLInputElement | null>(null)
const avatarFileInput = ref<HTMLInputElement | null>(null)
const isUploadingBanner = ref(false)
const isUploadingAvatar = ref(false)

async function onBannerFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  isUploadingBanner.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post('/media/upload?folder=banners', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    if (res.data.success && res.data.data?.url) {
      await userStore.updateProfile({ banner_url: res.data.data.url } as any)
      if (viewedProfile.value) viewedProfile.value.banner_url = res.data.data.url
    }
  } catch (err) { console.error('banner upload failed', err) }
  finally {
    isUploadingBanner.value = false
    if (bannerFileInput.value) bannerFileInput.value.value = ''
  }
}

async function onAvatarFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  isUploadingAvatar.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const res = await api.post('/media/upload?folder=avatars', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    if (res.data.success && res.data.data?.url) {
      await userStore.updateProfile({ avatar_url: res.data.data.url } as any)
      if (viewedProfile.value) viewedProfile.value.avatar_url = res.data.data.url
      if (authStore.user) (authStore.user as any).avatar_url = res.data.data.url
    }
  } catch (err) { console.error('avatar upload failed', err) }
  finally {
    isUploadingAvatar.value = false
    if (avatarFileInput.value) avatarFileInput.value.value = ''
  }
}

// ── Computed ──────────────────────────────────────────────────────────────────
const isOwnProfile = computed(() => !!authStore.user && authStore.user.id === viewedProfile.value?.id)
const isAdMode = computed(() => viewedProfile.value?.role === 'advertiser')
const canToggleAd = computed(() => viewedProfile.value?.role !== 'admin' && viewedProfile.value?.role !== 'moderator')
const groupsCount = computed(() => 0)

const ownAvatarSrc = computed(() => authStore.user?.avatar_url ?? '')

const ownJobTitle = computed(() => (authStore.user as any)?.job_title ?? '')

const avatarSrc = computed(() => viewedProfile.value?.avatar_url ?? '')

const bannerStyle = computed(() => {
  const p = viewedProfile.value
  if (!p) return {}
  if (p.banner_url) return { backgroundImage: `url('${p.banner_url}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
  const color = p.accent_color ?? '#4C67CF'
  return { background: `linear-gradient(135deg, ${color}55 0%, ${color}22 40%, #16192F 100%)` }
})

const avatarRingStyle = computed(() => {
  const color = viewedProfile.value?.accent_color ?? '#4C67CF'
  return { borderColor: `${color}80` }
})

const accentStyle = computed(() => {
  const color = viewedProfile.value?.accent_color ?? '#4C67CF'
  return { backgroundColor: `${color}25`, borderColor: `${color}60`, color }
})

const accentStyleSubtle = computed(() => {
  const color = viewedProfile.value?.accent_color ?? '#4C67CF'
  return { backgroundColor: `${color}30`, borderColor: `${color}50`, color }
})

// Badge pill in banner
const badgePillMap: Record<string, { label: string; cls: string; icon: any }> = {
  admin:      { label: 'Администратор', cls: 'bg-amber-500/25 border border-amber-500/40 text-amber-300', icon: Crown },
  moderator:  { label: 'Модератор',     cls: 'bg-purple-500/25 border border-purple-500/40 text-purple-300', icon: Shield },
  creator:    { label: 'Криэйтор',      cls: 'bg-orange-500/25 border border-orange-500/40 text-orange-300', icon: Star },
  verified:   { label: 'Верификация',   cls: 'bg-blue-500/25 border border-blue-500/40 text-blue-300', icon: BadgeCheck },
  advertiser: { label: 'Рекламодатель', cls: 'bg-emerald-500/25 border border-emerald-500/40 text-emerald-300', icon: Megaphone },
}

const badgePillClass = computed(() => {
  const bt = viewedProfile.value?.badge_type ?? viewedProfile.value?.role
  return badgePillMap[bt ?? '']?.cls ?? ''
})
const badgePillLabel = computed(() => {
  const bt = viewedProfile.value?.badge_type ?? viewedProfile.value?.role
  return badgePillMap[bt ?? '']?.label ?? ''
})
const badgePillIcon = computed(() => {
  const bt = viewedProfile.value?.badge_type ?? viewedProfile.value?.role
  return badgePillMap[bt ?? '']?.icon ?? User
})

// Follow button
const followBtnLabel = computed(() => {
  if (relation.friends || (relation.aFollowsB && relation.bFollowsA)) return 'Друзья'
  if (relation.aFollowsB) return 'Отписаться'
  if (relation.bFollowsA) return 'Подписаться в ответ'
  return 'Подписаться'
})
const followBtnIcon = computed(() => {
  if (relation.friends || (relation.aFollowsB && relation.bFollowsA)) return UserCheck
  if (relation.aFollowsB) return UserMinus
  return UserPlus
})
const followBtnClass = computed(() => {
  if (relation.friends || (relation.aFollowsB && relation.bFollowsA))
    return 'bg-brand-success/15 border border-brand-success/40 text-brand-success hover:bg-brand-error/10 hover:border-brand-error/40 hover:text-brand-error'
  if (relation.aFollowsB)
    return 'bg-brand-card border border-brand-border text-brand-muted hover:text-brand-error hover:border-brand-error/40'
  if (relation.bFollowsA)
    return 'bg-brand-accent/20 border border-brand-accent/50 text-brand-accent hover:bg-brand-accent hover:text-white shadow-sm'
  return 'bg-brand-accent hover:bg-brand-accent-plus text-white shadow-sm'
})

// About nav Items
const aboutNavs = [
  { key: 'about' as AboutTab,     label: 'О себе',    icon: User },
  { key: 'fursona' as AboutTab,   label: 'Фурсона',   icon: PawPrint },
  { key: 'interests' as AboutTab, label: 'Интересы',  icon: Sparkles },
]

// Content tabs
const contentTabs = [
  { key: 'posts' as ContentTab,    label: 'Посты',    icon: FileText },
  { key: 'repaws' as ContentTab,   label: 'RePaws',   icon: Repeat2 },
  { key: 'media' as ContentTab,    label: 'Медиа',    icon: Image },
  { key: 'friends' as ContentTab,  label: 'Друзья',   icon: Users },
]

const profileStats = computed(() => {
  const p = viewedProfile.value
  if (!p) return []
  return [
    { key: 'friends',   value: friends.value.length,     label: 'Друзья', tab: 'friends' as ContentTab },
    { key: 'groups',    value: groupsCount.value,         label: 'Группы', tab: null },
    { key: 'followers', value: p._count?.followers ?? 0, label: 'Лайков', tab: null },
  ]
})

const achievementBadges = computed(() => {
  const badges: { key: string; label: string; desc: string; iconComp: any; iconBg: string; iconColor: string }[] = []
  const p = viewedProfile.value
  if (!p) return badges
  if (p.badge_type === 'admin')      badges.push({ key: 'admin',      label: 'Администратор',      desc: 'Управляет платформой',     iconComp: Crown,      iconBg: 'bg-amber-500/20',   iconColor: 'text-amber-400' })
  if (p.badge_type === 'moderator')  badges.push({ key: 'mod',        label: 'Модератор',           desc: 'Поддерживает порядок',     iconComp: Shield,     iconBg: 'bg-purple-500/20',  iconColor: 'text-purple-400' })
  if (p.badge_type === 'creator')    badges.push({ key: 'creator',    label: 'Топ контрибьютор',    desc: '100+ публикаций',          iconComp: Star,       iconBg: 'bg-orange-500/20',  iconColor: 'text-orange-400' })
  if (p.badge_type === 'verified')   badges.push({ key: 'verified',   label: 'Подтверждённая страница', desc: '50+ подарков отправлено', iconComp: BadgeCheck, iconBg: 'bg-blue-500/20',    iconColor: 'text-blue-400' })
  if (p.role === 'advertiser')       badges.push({ key: 'advertiser', label: 'Рекламодатель',       desc: 'Активный рекламодатель',   iconComp: Megaphone,  iconBg: 'bg-emerald-500/20', iconColor: 'text-emerald-400' })
  if ((p._count?.posts ?? 0) >= 10)  badges.push({ key: 'active',     label: 'Активный автор',      desc: '10+ публикаций',           iconComp: Flame,      iconBg: 'bg-red-500/20',     iconColor: 'text-red-400' })
  if ((p._count?.followers ?? 0) >= 50) badges.push({ key: 'popular', label: 'Популярный',          desc: '50+ читателей',            iconComp: Sparkles,   iconBg: 'bg-yellow-500/20',  iconColor: 'text-yellow-400' })
  // Default badge for all
  if (!badges.length) badges.push({ key: 'furlite', label: 'FurLite',             desc: 'Подписчик с ' + joinDate.value,  iconComp: Award,    iconBg: 'bg-brand-accent/20', iconColor: 'text-brand-accent' })
  return badges
})

// ── Word cloud helpers ────────────────────────────────────────────────────────
const maxHashtagCount = computed(() =>
  userHashtags.value.length ? Math.max(...userHashtags.value.map(t => t.count)) : 1
)
function tagFontSize(count: number) {
  return Math.round(12 + 16 * (count / (maxHashtagCount.value || 1)))
}

// ── Social networks ───────────────────────────────────────────────────────────
const socialNetworks = [
  { key: 'telegram',    label: 'Telegram',    iconName: 'Send',          color: '#2AABEE' },
  { key: 'twitter',     label: 'X / Twitter', iconName: 'Twitter',       color: '#1DA1F2' },
  { key: 'instagram',   label: 'Instagram',   iconName: 'Instagram',     color: '#E4405F' },
  { key: 'youtube',     label: 'YouTube',     iconName: 'Youtube',       color: '#FF0000' },
  { key: 'twitch',      label: 'Twitch',      iconName: 'Twitch',        color: '#9146FF' },
  { key: 'furaffinity', label: 'FurAffinity', iconName: 'PawPrint',      color: '#FAAF3A' },
  { key: 'vk',          label: 'ВКонтакте',   iconName: 'Users',         color: '#4C75A3' },
  { key: 'discord',     label: 'Discord',     iconName: 'MessageCircle', color: '#7289DA' },
  { key: 'github',      label: 'GitHub',      iconName: 'Github',        color: '#6e8196' },
  { key: 'other',       label: 'Другое / Сайт', iconName: 'Globe',       color: '#6366f1' },
]
const activeSocialLinks = computed(() => {
  const sl = (viewedProfile.value as any)?.social_links ?? {}
  return socialNetworks.filter(n => sl[n.key])
})
function socialUrl(key: string, val: string) {
  if (key === 'other') return val.startsWith('http') ? val : 'https://' + val
  if (val.startsWith('http')) return val
  const map: Record<string, string> = { telegram: 'https://t.me/', twitter: 'https://x.com/', instagram: 'https://instagram.com/', youtube: 'https://youtube.com/@', twitch: 'https://twitch.tv/', furaffinity: 'https://www.furaffinity.net/user/', vk: 'https://vk.com/', discord: '', github: 'https://github.com/' }
  return (map[key] ?? '') + val
}

// ── Fursona steps ─────────────────────────────────────────────────────────────
const fursonaSteps = computed(() => {
  const p = viewedProfile.value
  return [
    { label: 'Вид',      iconName: 'PawPrint', done: !!((p as any)?.persona) },
    { label: 'Характер', iconName: 'Heart',    done: !!((p as any)?.likes?.length || (p as any)?.dislikes?.length) },
    { label: 'Фото',     iconName: 'Camera',   done: false, locked: true },
    { label: 'Реф',      iconName: 'Image',    done: false, locked: true },
  ]
})

const filteredMediaPosts = computed(() => {
  if (mediaFilter.value === 'photo') return tabPosts.value.filter(p => isImage(p.media_urls?.[0] ?? ''))
  if (mediaFilter.value === 'video') return tabPosts.value.filter(p => !isImage(p.media_urls?.[0] ?? ''))
  return tabPosts.value
})

const joinDate = computed(() => {
  if (!viewedProfile.value) return ''
  return new Date(viewedProfile.value.created_at).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d: string) {
  const date = new Date(d)
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}с назад`
  if (diff < 3600) return `${Math.floor(diff / 60)}м назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч назад`
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function isImage(url: string) {
  return /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url)
}

function onProfileMediaUploaded(urls: string[]) {
  newPostMediaUrls.value.push(...urls)
}

// ── Load profile ──────────────────────────────────────────────────────────────
async function loadProfile() {
  const id = route.params.id as string
  isLoading.value = true
  error.value = null
  viewedProfile.value = null
  friends.value = []
  tabPosts.value = []
  pinnedPost.value = null
  Object.assign(relation, { aFollowsB: false, bFollowsA: false, friends: false })

  try {
    const result = await userStore.fetchProfile(id)
    viewedProfile.value = result
    if (result) {
      await Promise.all([
        loadFriends(id),
        authStore.isAuthenticated && !isOwnProfile.value ? loadRelation(id) : Promise.resolve(),
      ])
      if (result.pinnedPost) pinnedPost.value = result.pinnedPost
      await loadTabData('posts')
    }
  } catch {
    error.value = 'Не удалось загрузить профиль'
  } finally {
    isLoading.value = false
  }
}

async function loadFriends(userId: string) {
  try {
    const res = await api.get(`/follows/${userId}/friends`)
    if (res.data.success) friends.value = res.data.data.users
  } catch {}
}

async function loadRelation(userId: string) {
  try {
    const res = await api.get(`/follows/${userId}/relation`)
    if (res.data.success) {
      relation.aFollowsB = res.data.data.aFollowsB
      relation.bFollowsA = res.data.data.bFollowsA
      relation.friends = res.data.data.friends
    }
  } catch {}
}

async function loadTabData(tab: string) {
  if (!viewedProfile.value) return
  const uid = viewedProfile.value.id
  isLoadingTab.value = true
  try {
    if (tab === 'posts') {
      const res = await api.get(`/posts/user/${uid}`)
      if (res.data.success) {
        tabPosts.value = res.data.data.posts
        // If no posts, load repaws as fallback
        if (!tabPosts.value.length) {
          try {
            const rep = await api.get(`/posts/user/${uid}/repaws`)
            if (rep.data.success) repawsFallback.value = rep.data.data.posts
          } catch { repawsFallback.value = [] }
        } else {
          repawsFallback.value = []
        }
      }
    } else if (tab === 'repaws') {
      const res = await api.get(`/posts/user/${uid}/repaws`)
      if (res.data.success) tabPosts.value = res.data.data.posts
    } else if (tab === 'media') {
      const res = await api.get(`/posts/user/${uid}/media`)
      if (res.data.success) tabPosts.value = res.data.data.posts
    } else if (tab === 'hashtags') {
      if (!tabPosts.value.length) {
        const res = await api.get(`/posts/user/${uid}`)
        if (res.data.success) tabPosts.value = res.data.data.posts
      }
      const tagMap: Record<string, number> = {}
      for (const post of tabPosts.value) {
        for (const pt of (post.tags ?? [])) {
          const name = pt.tag?.name ?? pt.name
          if (name) tagMap[name] = (tagMap[name] ?? 0) + 1
        }
      }
      userHashtags.value = Object.entries(tagMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
    } else if (tab === 'likes') {
      const res = await api.get(`/posts/user/${uid}/likes`)
      if (res.data.success) tabPosts.value = res.data.data.posts
    } else if (tab === 'friends') {
      await loadFriends(uid)
    }
  } catch (e) {
    console.error('Failed to load tab', tab, e)
  } finally {
    isLoadingTab.value = false
  }
}

// ── Follow ────────────────────────────────────────────────────────────────────
async function toggleFollow() {
  if (!viewedProfile.value || isTogglingFollow.value) return
  isTogglingFollow.value = true
  try {
    const res = await api.post(`/follows/${viewedProfile.value.id}/toggle`, {})
    if (res.data.success) {
      relation.aFollowsB = res.data.data.following
      relation.friends = relation.aFollowsB && relation.bFollowsA
      if (viewedProfile.value._count) viewedProfile.value._count.followers += relation.aFollowsB ? 1 : -1
    }
  } catch (e) { console.error('follow toggle failed', e) }
  finally { isTogglingFollow.value = false }
}

// ── AD mode ───────────────────────────────────────────────────────────────────
async function toggleAdMode() {
  if (isTogglingAd.value || !viewedProfile.value) return
  isTogglingAd.value = true
  try {
    const res = await api.post('/users/me/ad-toggle', {})
    if (res.data.success) {
      viewedProfile.value.role = res.data.data.role
      if (authStore.user) { authStore.user.role = res.data.data.role }
    }
  } catch (e) { console.error('ad toggle failed', e) }
  finally { isTogglingAd.value = false }
}

// ── Pin / unpin ───────────────────────────────────────────────────────────────
async function pinPost(postId: string) {
  try {
    await api.put(`/users/me/pin/${postId}`, {})
    if (viewedProfile.value) {
      viewedProfile.value.pinned_post_id = postId
      pinnedPost.value = tabPosts.value.find((p) => p.id === postId) ?? null
    }
  } catch (e) { console.error('pin failed', e) }
}

async function unpinPost() {
  try {
    await api.delete('/users/me/pin')
    if (viewedProfile.value) { viewedProfile.value.pinned_post_id = null; pinnedPost.value = null }
  } catch (e) { console.error('unpin failed', e) }
}

// ── Create post ───────────────────────────────────────────────────────────────
async function createPost() {
  if (!newPostContent.value.trim() || isCreatingPost.value) return
  isCreatingPost.value = true
  try {
    const res = await api.post('/posts', { content: newPostContent.value.trim(), isNsfw: newPostIsNsfw.value, mediaUrls: newPostMediaUrls.value })
    if (res.data.success) {
      tabPosts.value.unshift(res.data.data.post)
      newPostContent.value = ''
      newPostMediaUrls.value = []
      newPostIsNsfw.value = false
      profileMediaUploadRef.value?.clearAll()
      if (viewedProfile.value?._count) viewedProfile.value._count.posts++
    }
  } catch (e) { console.error('failed to create post', e) }
  finally { isCreatingPost.value = false }
}

function onPostDeleted(postId: string) {
  tabPosts.value = tabPosts.value.filter((p) => p.id !== postId)
  if (pinnedPost.value?.id === postId) pinnedPost.value = null
  if (viewedProfile.value?._count) viewedProfile.value._count.posts = Math.max(0, viewedProfile.value._count.posts - 1)
}

function onPostUpdated(post: any) {
  const idx = tabPosts.value.findIndex((p) => p.id === post.id)
  if (idx !== -1) tabPosts.value[idx] = { ...tabPosts.value[idx], ...post }
  if (pinnedPost.value?.id === post.id) pinnedPost.value = { ...pinnedPost.value, ...post }
}

onMounted(() => { loadProfile() })
watch(() => route.params.id, () => { aboutTab.value = 'about'; activeContentTab.value = 'posts'; loadProfile() })

</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px) }
</style>
