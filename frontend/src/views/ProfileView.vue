<template>
    <AppHeader :show-back="true" v-model:nsfwMode="nsfwMode" />

    <!-- ─── Minimal error toast (e.g. messaging blocked by privacy settings) ── -->
    <Transition name="fade">
      <div v-if="messageErrorNotice"
        class="fixed top-20 left-1/2 -translate-x-1/2 z-300 px-4 py-2.5 rounded-2xl shadow-2xl text-xs font-bold border bg-brand-error/10 border-brand-error/30 text-brand-error backdrop-blur-lg">
        {{ messageErrorNotice }}
      </div>
    </Transition>

    <!-- ─── Page background (profile_bg_url) ──────────────────────────────── -->
    <template v-if="profileBgStyle.backgroundImage">
      <div class="fixed inset-0 z-[-1] pointer-events-none" :style="profileBgStyle" />
      <div class="fixed inset-0 z-[-1] pointer-events-none" style="background: rgba(22,25,47,0.78)" />
    </template>

    <!-- ─── hidden file inputs for banner/avatar S3 upload ────────────────── -->
    <input ref="bannerFileInput" type="file" accept="image/*" class="sr-only" @change="onBannerFileChange" />
    <input ref="avatarFileInput" type="file" accept="image/*" class="sr-only" @change="onAvatarFileChange" />

    <!-- ─── Badges Modal ───────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showBadgesModal" class="fixed inset-0 z-400 bg-black/60 backdrop-blur-xs flex items-center justify-center px-4" @click.self="showBadgesModal = false">
        <div class="w-full max-w-md bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto">
          <div class="flex items-center justify-between px-6 py-4 border-b border-brand-border sticky top-0 bg-brand-card z-10">
            <div class="flex items-center gap-2.5">
              <BIcon name="Award" class="w-5 h-5 text-yellow-400" />
              <h3 class="font-bold text-white text-lg">{{ langStore.t.profileBadgesTitle }}</h3>
              <span class="text-xs font-bold bg-brand-accent/15 text-brand-accent px-2 py-0.5 rounded-full">{{ achievementBadges.length }}</span>
            </div>
            <button @click="showBadgesModal = false" class="w-8 h-8 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <div class="p-4 grid grid-cols-1 gap-3">
            <div v-for="badge in achievementBadges" :key="badge.key"
              class="flex items-center gap-4 p-4 rounded-2xl bg-brand-bg border border-brand-border hover:border-brand-accent/30 transition-all group">
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden transition-transform group-hover:scale-105" :class="badge.iconImg ? '' : badge.iconBg">
                <img v-if="badge.iconImg" :src="badge.iconImg" :alt="badge.label" class="w-full h-full object-cover" />
                <component :is="badge.iconComp" v-else class="w-7 h-7" :class="badge.iconColor" />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-extrabold text-white leading-tight">{{ badge.label }}</p>
                <p class="text-xs text-white/55 mt-0.5">{{ badge.desc }}</p>
              </div>
            </div>
            <div v-if="!achievementBadges.length" class="py-10 text-center text-white/35 text-sm">{{ langStore.t.noAchievements }}</div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ─── Wallet Modal ───────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showWalletModal" class="fixed inset-0 z-400 bg-black/60 backdrop-blur-xs flex items-center justify-center px-4" @click.self="showWalletModal = false">
        <div class="w-full max-w-sm bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden">
          <div class="flex items-center justify-between px-6 py-4 border-b border-brand-border">
            <div class="flex items-center gap-2.5">
              <BIcon name="Wallet" class="w-5 h-5 text-brand-accent" />
              <h3 class="font-bold text-white text-lg">{{ langStore.t.walletLabel }}</h3>
            </div>
            <button @click="showWalletModal = false" class="w-8 h-8 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <div class="p-6 stack-y-4">
            <!-- Balance hero -->
            <div class="relative overflow-hidden rounded-2xl bg-linear-to-br/srgb from-brand-accent/20 to-brand-accent-plus/20 border border-brand-accent/25 p-6 text-center">
              <div class="absolute inset-0 opacity-5" style="background-image:radial-gradient(circle at 30% 50%, #4C67CF 0%, transparent 60%), radial-gradient(circle at 70% 50%, #31458F 0%, transparent 60%)" />
              <p class="text-xs font-bold text-brand-accent uppercase tracking-widest mb-2 relative">{{ langStore.t.balanceLabel }}</p>
              <p class="text-4xl font-extrabold text-white leading-none relative">
                {{ walletStore.balance.toFixed(2) }}
              </p>
              <p class="flex items-center justify-center gap-1 text-sm text-brand-accent-minus font-semibold mt-1 relative">
                <BIcon name="Flower2" class="w-3.5 h-3.5" /> BLM
              </p>
              <p class="text-[11px] text-white/45 mt-1 relative">1 BLM = $1</p>
            </div>

            <!-- Top-up preset picker -->
            <div v-if="showTopupPicker" class="bg-brand-bg border border-brand-border rounded-2xl p-4 stack-y-3">
              <p class="text-xs font-bold text-white/55">{{ langStore.t.profileTopupPresetLabel }}</p>
              <div class="grid grid-cols-2 gap-2">
                <button v-for="pkg in topupPackages" :key="pkg.rub" :disabled="toppingUp" @click="topupWallet(pkg.rub)"
                  class="relative py-3 rounded-xl border bg-brand-card text-center transition-all disabled:opacity-40 hover:border-brand-accent/60"
                  :class="pkg.popular ? 'border-brand-accent shadow-[0_0_0_1px_rgba(76,103,207,.5)]' : 'border-brand-border'">
                  <span v-if="pkg.popular" class="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-brand-accent text-[9px] font-extrabold uppercase tracking-wide text-white whitespace-nowrap">{{ langStore.t.topupPopular }}</span>
                  <span class="block text-base font-extrabold text-white">{{ pkg.bc }} BLM</span>
                  <span class="block text-xs font-semibold text-white/50">{{ pkg.rub }} ₽</span>
                </button>
              </div>
              <div v-if="paymentsStore.config?.enabled" class="flex gap-2">
                <input v-model.number="customTopup" type="number" inputmode="numeric"
                  :min="paymentsStore.config.topup.min" :max="paymentsStore.config.topup.max" :step="paymentsStore.config.topup.step"
                  :placeholder="`${langStore.t.profileTopupCustom} (${paymentsStore.config.topup.min}–${paymentsStore.config.topup.max})`"
                  class="flex-1 min-w-0 px-3 py-2 rounded-xl border border-brand-border bg-brand-card text-sm text-white placeholder-white/30 focus:outline-hidden focus:border-brand-accent/50" />
                <button :disabled="toppingUp || !customTopupValid" @click="topupWallet(customTopup!)"
                  class="px-4 py-2 rounded-xl bg-brand-accent text-sm font-bold text-white disabled:opacity-40 transition-all">
                  {{ langStore.t.profileTopupPay }}
                </button>
              </div>
              <button @click="showTopupPicker = false" class="w-full py-1.5 text-xs font-semibold text-white/40 hover:text-white transition-colors">{{ langStore.t.cancel }}</button>
            </div>

            <!-- Action buttons -->
            <div v-else class="grid grid-cols-2 gap-3">
              <button @click="showTopupPicker = true" class="flex flex-col items-center gap-1.5 p-4 rounded-2xl border border-brand-border bg-brand-bg/50 hover:border-brand-accent/50 transition-all">
                <BIcon name="Plus" class="w-5 h-5 text-brand-accent" />
                <span class="text-xs font-bold text-white">{{ langStore.t.topUpBtn }}</span>
              </button>
              <button disabled class="flex flex-col items-center gap-1.5 p-4 rounded-2xl border border-brand-border bg-brand-bg/50 opacity-50 cursor-not-allowed">
                <BIcon name="ArrowUpRight" class="w-5 h-5 text-white/55" />
                <span class="text-xs font-bold text-white/55">{{ langStore.t.withdrawBtn }}</span>
              </button>
            </div>
            <p class="text-center text-[11px] text-white/35">
              {{ paymentsStore.config?.enabled ? langStore.t.profileTopupDisclaimerReal : langStore.t.profileTopupDisclaimer }}
            </p>
          </div>
        </div>
      </div>
    </Transition>

    <div class="max-w-7xl mx-auto flex pt-16 md:pt-24 px-3 md:px-4 gap-4 md:gap-8 relative z-1">

      <!-- ─── Left Sidebar ──────────────────────────────────────── -->
      <AppSidebar>
        <template v-if="viewedProfile" #extra>
          <div>
            <h4 class="px-4 text-xs font-bold text-white/55 mb-2 uppercase tracking-wider">{{ langStore.t.aboutProfile }}</h4>
            <nav class="stack-y-1">
              <button v-for="nav in aboutNavs" :key="nav.key"
                @click="aboutTab = nav.key"
                class="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-left group"
                :class="aboutTab === nav.key ? 'bg-brand-accent/20 text-brand-accent' : 'text-white/55 hover:bg-brand-card/50 hover:text-white'">
                <component :is="nav.icon" class="w-5 h-5 shrink-0" />
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
          <p class="text-sm text-white/55 font-semibold">{{ langStore.t.loadingProfile }}</p>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="mt-8 bg-brand-card border border-brand-error/20 rounded-3xl p-10 text-center shadow-xl">
          <div class="w-16 h-16 rounded-2xl bg-brand-error/10 flex items-center justify-center mx-auto mb-4">
            <BIcon name="AlertCircle" class="w-8 h-8 text-brand-error" />
          </div>
          <p class="text-brand-error font-bold text-lg mb-2">{{ (langStore.t as Record<string, string | undefined>).errorLabel ?? 'Error' }}</p>
          <p class="text-white/55 text-sm mb-6">{{ error }}</p>
          <button @click="loadProfile" class="px-6 py-2.5 bg-brand-accent hover:bg-brand-accent-plus rounded-xl text-sm font-bold transition-all">{{ langStore.t.retryBtn }}</button>
        </div>

        <!-- Not found -->
        <div v-else-if="!viewedProfile" class="mt-8 bg-brand-card border border-brand-border rounded-3xl p-12 text-center shadow-xl">
          <div class="w-16 h-16 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center mx-auto mb-4">
            <BIcon name="UserX" class="w-8 h-8 text-white/55" />
          </div>
          <p class="text-white font-bold text-lg mb-2">{{ langStore.t.userNotFound }}</p>
          <p class="text-white/55 text-sm mb-6">{{ langStore.t.userNotFoundDesc }}</p>
          <button @click="router.push({ name: 'home' })" class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-card border border-brand-border hover:border-brand-accent text-sm font-bold rounded-xl transition-all">
            <BIcon name="ArrowLeft" class="w-4 h-4" /> {{ langStore.t.goHome }}
          </button>
        </div>

        <!-- Blocked profile stub (the profile owner has blocked the viewer) -->
        <div v-else-if="viewedProfile.is_blocked_by_user" class="mt-8 bg-brand-card border border-brand-border rounded-3xl p-12 text-center shadow-xl">
          <img :src="viewedProfile.avatar_url || '/icons/badges/NN.jpg'" class="w-20 h-20 rounded-full object-cover mx-auto mb-4 border-2 border-brand-border" @error="onAvatarError" />
          <p class="text-white font-bold text-lg mb-1">{{ viewedProfile.display_name || viewedProfile.username }}</p>
          <p class="text-white/45 text-sm mb-6">@{{ viewedProfile.username }}</p>
          <div class="w-16 h-16 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center mx-auto mb-4">
            <BIcon name="Ban" class="w-8 h-8 text-white/55" />
          </div>
          <p class="text-white/55 text-sm">{{ langStore.t.profileBlockedByUser }}</p>
        </div>

        <!-- Private profile stub (viewer isn't allowed to see this profile) -->
        <div v-else-if="viewedProfile.is_private" class="mt-8 bg-brand-card border border-brand-border rounded-3xl p-12 text-center shadow-xl">
          <img :src="viewedProfile.avatar_url || '/icons/badges/NN.jpg'" class="w-20 h-20 rounded-full object-cover mx-auto mb-4 border-2 border-brand-border" @error="onAvatarError" />
          <p class="text-white font-bold text-lg mb-1">{{ viewedProfile.display_name || viewedProfile.username }}</p>
          <p class="text-white/45 text-sm mb-6">@{{ viewedProfile.username }}</p>
          <div class="w-16 h-16 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center mx-auto mb-4">
            <BIcon name="Lock" class="w-8 h-8 text-white/55" />
          </div>
          <p class="text-white/55 text-sm">{{ langStore.t.profileHiddenByPrivacy }}</p>
        </div>

        <template v-else>

          <!-- ════════════════════════════════════════════════════════════════
               BANNER
          ════════════════════════════════════════════════════════════════ -->
          <div class="relative w-full h-56 md:h-72 rounded-3xl overflow-hidden cursor-pointer" :style="bannerStyle"
            @click="viewedProfile.banner_url && (showBannerViewer = true)">
            <!-- Dot texture — same fallback look as group/friend cards without a banner -->
            <div v-if="!viewedProfile.banner_url" class="absolute inset-0 opacity-15"
              style="background-image: radial-gradient(circle, white 1px, transparent 1px); background-size: 14px 14px;"></div>
            <!-- Gradient overlays -->
            <div class="absolute inset-0 bg-linear-to-t/srgb from-black/90 via-black/20 to-transparent"></div>
            <div class="absolute inset-0 bg-linear-to-r/srgb from-black/30 to-transparent"></div>

            <!-- Top-right: upload banner button for own profile -->
            <div v-if="isOwnProfile" class="absolute top-3 right-3 z-10">
              <button @click.stop="bannerFileInput?.click()"
                :disabled="isUploadingBanner"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-black/50 hover:bg-black/70 border border-white/15 rounded-full text-xs font-semibold text-white/90 backdrop-blur-xs transition-all disabled:opacity-50">
                <span v-if="isUploadingBanner" class="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <BIcon v-else name="Image" class="w-3 h-3" /> {{ langStore.t.changeBanner }}
              </button>
            </div>

            <!-- Bottom-right: species chip — sourced from the canonical fursona species -->
            <div class="absolute bottom-8 right-4 z-20 flex gap-2">
              <button v-if="profileFursona?.species?.length && isOwnProfile"
                type="button" @click.stop="openEditModal('fursona')"
                class="species-chip-pulse inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-xs border cursor-pointer transition-all hover:scale-[1.06] hover:shadow-[0_0_16px_rgba(167,139,250,0.5)] active:scale-95"
                :style="accentStyleSubtle" :title="langStore.t.fursonaSettingsTitle">
                <span class="text-sm leading-none">{{ speciesEmoji(profileFursona.species[0]) }}</span>{{ primarySpeciesLabel }}
              </button>
              <span v-else-if="profileFursona?.species?.length"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-xs border"
                :style="accentStyleSubtle">
                <span class="text-sm leading-none">{{ speciesEmoji(profileFursona.species[0]) }}</span>{{ primarySpeciesLabel }}
              </span>
            </div>
          </div>

          <!-- ════════════════════════════════════════════════════════════════
               PROFILE IDENTITY STRIP
          ════════════════════════════════════════════════════════════════ -->
          <div class="relative z-10 -mt-6 mx-0">
            <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl">
              <!-- Accent line top -->
              <div class="h-px bg-linear-to-r/srgb from-transparent via-brand-accent/60 to-transparent"></div>

              <div class="px-6 pt-0 pb-5 max-md:px-4 max-md:flex max-md:flex-col">
                <div class="flex items-start justify-between gap-4 max-md:contents">

                  <!-- ══ Avatar block — dual card stack swap ══ -->
                  <!--
                    Две карты. GPU-ускоренная анимация через transform (translate+scale).
                    Активная — translate-x-0/y-0 scale-100, спящая — translate-x-7/y-7 scale-[0.78].
                    Плавный spring-easing: cubic-bezier(0.34,1.56,0.64,1).
                  -->
                  <div class="relative shrink-0 -mt-14 md:-mt-20 w-24 h-24 md:w-32 md:h-32 overflow-visible mb-3 max-md:order-1">

                    <!-- ── Story ring: animated gradient, sits behind avatar ── -->
                    <div
                      v-if="hasStory"
                      class="absolute inset-[-4px] rounded-full story-ring-gradient z-5 pointer-events-none"
                    ></div>

                    <!-- ── Карта A: ОСНОВНОЙ аватар ──────────────────────── -->
                    <div
                      class="absolute top-0 left-0 w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden shadow-xl will-change-transform
                             transition-[transform,opacity,border-color,box-shadow] duration-500 translate-x-0 translate-y-0 scale-100 opacity-100 z-10"
                      :class="hasStory ? 'border-4 border-brand-card cursor-pointer hover:scale-105' : 'border-4 border-brand-card'"
                      :style="hasStory ? {} : [avatarRingStyle, { transitionTimingFunction: 'cubic-bezier(0.34,1.56,0.64,1)' }]"
                      @click="onAvatarClick">
                      <img :src="avatarSrc || '/icons/badges/NN.jpg'"
                        class="w-full h-full object-cover"
                        width="128" height="128" fetchpriority="high"
                        @error="onAvatarError" />
                      <!-- Story tap affordance -->
                      <div v-if="hasStory"
                        class="absolute inset-0 rounded-full bg-black/0 hover:bg-black/30 transition-all flex items-center justify-center opacity-0 hover:opacity-100">
                        <div class="flex flex-col items-center gap-0.5">
                          <BIcon name="Play" class="w-6 h-6 text-white drop-shadow-sm" />
                          <span class="text-[10px] font-bold text-white drop-shadow-sm">{{ langStore.t.story }}</span>
                        </div>
                      </div>
                      <!-- upload camera: только для своего профиля без истории -->
                      <button v-if="isOwnProfile && !hasStory"
                        @click.stop="avatarFileInput?.click()" :disabled="isUploadingAvatar"
                        class="absolute inset-0 rounded-full bg-black/0 hover:bg-black/40 transition-all flex items-center justify-center pointer-events-none hover:pointer-events-auto opacity-0 hover:opacity-100">
                        <span v-if="isUploadingAvatar" class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <BIcon v-else name="Camera" class="w-7 h-7 text-white drop-shadow-sm" />
                      </button>
                    </div>

                    <!-- Image-based avatar frame overlay: unclipped, sits above the avatar card,
                         suppressed during an active story same as the legacy CSS ring above. -->
                    <AvatarFrameOverlay v-if="!hasStory && equippedFrame" :frame="equippedFrame" class="z-20" />

                    <!-- Online dot (z-30 чтобы всегда поверх карт) -->
                    <span v-if="isProfileOnline"
                      class="absolute bottom-1 right-1 md:bottom-1.5 md:right-1.5 w-4 h-4 md:w-5 md:h-5 rounded-full bg-brand-success border-[3px] border-brand-card shadow-xs z-30 transition-all duration-500"
                      :title="langStore.t.onlineStatus" />

                    <audio ref="statusPreviewAudioEl" class="hidden"
                      @play="isStatusMusicPlaying = true" @pause="isStatusMusicPlaying = false" @ended="isStatusMusicPlaying = false" />
                  </div>

                  <!-- Action buttons (positioned to side of avatar) -->
                  <div class="flex items-center gap-2 pt-3 md:pt-4 pr-1 flex-wrap max-md:order-3 max-md:w-full max-md:pr-0 max-md:pt-4">
                    <template v-if="isOwnProfile">
                      <router-link to="/settings/profile"
                        class="relative inline-flex items-center gap-2 px-5 py-2.5 max-md:flex-1 max-md:justify-center bg-linear-to-r/srgb from-brand-accent to-brand-accent-plus text-white rounded-xl text-sm font-bold shadow-lg shadow-brand-accent/30 hover:shadow-brand-accent/50 hover:scale-[1.03] active:scale-[0.98] transition-all overflow-hidden group">
                        <span class="absolute inset-0 bg-white/0 group-hover:bg-white/8 transition-colors duration-200" />
                        <BIcon name="Pencil" class="w-4 h-4 relative z-10" />
                        <span class="relative z-10">{{ langStore.t.editProfileBtn }}</span>
                      </router-link>
                    </template>
                    <template v-else-if="authStore.isAuthenticated">
                      <button
                        @click="toggleNotify"
                        :disabled="!relation.aFollowsB || notifyLoading"
                        :title="!relation.aFollowsB ? langStore.t.profileFollowFirstHint : notifyPosts ? langStore.t.profileNotificationsOnHint : langStore.t.profileNotificationsOffHint"
                        class="w-9 h-9 max-md:w-auto max-md:h-10 max-md:order-3 max-md:flex-1 flex items-center justify-center border rounded-xl transition-all disabled:opacity-40"
                        :class="notifyPosts && relation.aFollowsB ? 'border-brand-accent bg-brand-accent/15 text-brand-accent' : 'border-brand-border bg-brand-bg hover:border-brand-accent/60 text-white/55 hover:text-brand-accent'">
                        <span v-if="notifyLoading" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <BIcon v-else :name="notifyPosts && relation.aFollowsB ? 'BellRing' : 'Bell'" class="w-4 h-4" />
                      </button>
                      <button v-if="viewedProfile.messages_privacy !== 'nobody'" @click="openChat" :disabled="isProfileBlocked" :title="isProfileBlocked ? langStore.t.profileBlockedByYouHint : undefined" class="inline-flex items-center gap-2 px-4 py-2 max-md:h-10 max-md:px-3 max-md:order-2 max-md:basis-[calc(50%-0.25rem)] max-md:grow max-md:min-w-0 max-md:justify-center border border-brand-border bg-brand-bg hover:border-brand-accent/60 text-brand-offwhite hover:text-brand-accent rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:pointer-events-none">
                        <BIcon name="MessageSquare" class="w-4 h-4 max-md:shrink-0" /> <span class="max-md:truncate">{{ langStore.t.messageBtn }}</span>
                      </button>
                      <button @click="toggleFollow" :disabled="isTogglingFollow || isProfileBlocked" :title="isProfileBlocked ? langStore.t.profileBlockedByYouHint : undefined"
                        class="inline-flex items-center gap-2 px-4 py-2 max-md:h-10 max-md:px-3 max-md:order-1 max-md:basis-[calc(50%-0.25rem)] max-md:grow max-md:min-w-0 max-md:justify-center max-md:whitespace-nowrap rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:pointer-events-none shadow-xs"
                        :class="followBtnClass">
                        <span v-if="isTogglingFollow" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <component v-else :is="followBtnIcon" class="w-4 h-4" />
                        {{ followBtnLabel }}
                        <span v-if="isMutual && !isTogglingFollow" class="text-[10px] font-bold ml-0.5 opacity-60 max-[379px]:hidden">· {{ langStore.t.profileMutualLabel }}</span>
                      </button>
                      <!-- Donate button -->
                      <a v-if="viewedProfile.donate_url"
                        :href="safeHref(viewedProfile.donate_url)"
                        target="_blank" rel="noopener noreferrer"
                        class="inline-flex items-center gap-2 px-4 py-2 max-md:h-10 max-md:p-0 max-md:justify-center max-md:order-3 max-md:flex-1 rounded-xl text-sm font-bold transition-all border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 hover:border-amber-500/60"
                        :aria-label="langStore.t.profileDonateLabel">
                        <BIcon name="HeartHandshake" class="w-4 h-4" />
                        <span class="max-md:hidden">{{ langStore.t.profileDonateLabel }}</span>
                      </a>
                      <!-- Bookmark user button -->
                      <button
                        @click="toggleUserBookmark"
                        :disabled="isTogglingBookmark"
                        :title="isUserBookmarked ? langStore.t.unbookmarkUser : langStore.t.bookmarkUser"
                        class="w-9 h-9 max-md:w-auto max-md:h-10 max-md:order-3 max-md:flex-1 flex items-center justify-center border rounded-xl transition-all disabled:opacity-50"
                        :class="isUserBookmarked ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20' : 'border-brand-border bg-brand-bg hover:border-yellow-500/40 text-white/55 hover:text-yellow-400'">
                        <span v-if="isTogglingBookmark" class="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <BIcon v-else :name="isUserBookmarked ? 'BookmarkCheck' : 'Bookmark'" class="w-4 h-4" />
                      </button>
                      <div class="relative max-md:order-3 max-md:flex-1">
                        <button ref="profileMenuBtnRef" @click.stop="toggleProfileMenu"
                          class="w-9 h-9 max-md:w-full max-md:h-10 flex items-center justify-center border border-brand-border bg-brand-bg hover:border-brand-border/80 rounded-xl text-white/55 hover:text-white transition-all">
                          <BIcon name="MoreHorizontal" class="w-4 h-4" />
                        </button>
                        <Teleport to="body">
                          <div v-if="showProfileMenu" v-click-outside="() => showProfileMenu = false"
                            class="fixed z-9998 w-56 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1"
                            :style="{ top: profileMenuPos.top, right: profileMenuPos.right }">
                            <button @click="copyProfileLink" class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white">
                              <BIcon :name="profileLinkCopied ? 'CheckCheck' : 'Link'" class="w-4 h-4" />
                              {{ profileLinkCopied ? langStore.t.copiedBtn : langStore.t.profileCopyLinkLabel }}
                            </button>
                            <div class="my-1 border-t border-brand-border/50" />
                            <button @click="showProfileReportModal = true; showProfileMenu = false"
                              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-amber-400 hover:bg-amber-500/10">
                              <BIcon name="Flag" class="w-4 h-4" /> {{ langStore.t.report }}
                            </button>
                            <button @click="toggleProfileBlock" :disabled="isBlockingProfileUser"
                              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 disabled:opacity-50">
                              <BIcon name="UserX" class="w-4 h-4" /> {{ isBlockingProfileUser ? langStore.t.profileBlockingLabel : (isProfileBlocked ? langStore.t.profileRemoveFromBlacklistLabel : langStore.t.profileSendToBlacklistLabel) }}
                            </button>
                          </div>
                        </Teleport>
                      </div>
                    </template>
                  </div>
                </div>
                <ReportModal v-if="viewedProfile" v-model="showProfileReportModal" :target-id="viewedProfile.id" target-type="user" />

                <!-- Name row -->
                <div class="mt-4 max-md:order-2 max-md:mt-1">
                  <div class="flex items-center flex-wrap gap-2 mb-2">
                    <h1 class="text-2xl md:text-3xl md:leading-9 font-extrabold leading-none text-white tracking-tight min-w-0 max-w-full wrap-break-word wrap-anywhere">{{ profileDisplayName }}</h1>
                    <!-- Deceased badge -->
                    <span v-if="viewedProfile?.deceased_at"
                      class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/10 text-white/60 shrink-0"
                      :title="viewedProfile?.deceased_note || langStore.t.profileDeceasedMemoryLabel">
                      🪦
                    </span>
                    <!-- Frozen badge -->
                    <span v-if="viewedProfile?.frozen_at"
                      class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-sky-500/15 text-sky-300 shrink-0"
                      :title="langStore.t.profileFrozenAccountBadgeTitle">
                      🧊
                    </span>
                    <!-- Verification badge -->
                    <VerificationBadge v-if="viewedProfile?.is_verified"
                      :type="viewedProfile?.verification_type"
                      icon-class="w-6 h-6 shrink-0" />
                    <span v-if="badgePillLabel" class="inline-flex items-center justify-center w-7 h-7 rounded-lg" :class="badgePillClass" :title="badgePillLabel">
                      <component :is="badgePillIcon" class="w-4 h-4" />
                    </span>
                    <!-- Subscription tier badge -->
                    <span v-if="viewedProfile.subscription_tier && viewedProfile.subscription_tier !== 'free'"
                      class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase tracking-widest border"
                      :class="{
                        'bg-brand-accent/15 border-brand-accent/40 text-brand-accent': viewedProfile.subscription_tier === 'lite',
                        'bg-violet-500/15 border-violet-500/40 text-violet-300': viewedProfile.subscription_tier === 'pro',
                        'bg-amber-500/15 border-amber-500/40 text-amber-400': viewedProfile.subscription_tier === 'business',
                      }">
                      <Sparkles class="w-2.5 h-2.5" />
                      {{ viewedProfile.subscription_tier === 'lite' ? 'Lite' : viewedProfile.subscription_tier === 'pro' ? 'Pro' : 'Business' }}
                    </span>
                    <!-- Статус заказов (Pro и Business): у владельца — быстрый переключатель, у гостей — ссылка в магазин -->
                    <button v-if="isOwnProfile && canSetCommissions" type="button" @click="toggleCommissions"
                      class="inline-flex items-center" :title="langStore.t.commissionsSettingTitle">
                      <CommissionsBadge v-if="viewedProfile.commissions_status && viewedProfile.commissions_status !== 'none'" :status="viewedProfile.commissions_status" size="md" />
                      <span v-else class="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-dashed border-white/20 text-white/45 font-bold hover:text-white/80 transition">🎨 {{ langStore.t.commissionsOpen }}?</span>
                    </button>
                    <CommissionsBadge v-else :status="viewedProfile.commissions_status" :username="viewedProfile.username" :link="!isOwnProfile" size="md" />
                    <!-- Artist Badge -->
                    <AppBadge
                      v-if="viewedProfile.badge_level && viewedProfile.badge_level !== 'none'"
                      type="user"
                      :level="viewedProfile.badge_level"
                      size="sm"
                    />
                    <!-- Registration date badge -->
                    <span v-if="viewedProfile.created_at"
                      class="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 text-white/40 shrink-0"
                      :title="`${langStore.t.memberSince} ${joinDate}`">
                      <BIcon name="Calendar" class="w-3.5 h-3.5" />
                    </span>
                    <!-- SOON Badges -->
                    <SoonBadge
                      v-for="badge in profileSoonBadges"
                      :key="badge.id"
                      :short-code="badge.event.short_code"
                      :event-title="badge.event.title"
                      :starts-at="badge.event.starts_at"
                      :ends-at="badge.event.ends_at"
                      :status="badge.event.status"
                      :banner-url="badge.event.banner_url || badge.event.group.banner_url"
                      :group-name="badge.event.group.name"
                      :group-avatar="badge.event.group.avatar_url"
                      :location-name="badge.event.location_name"
                      :attendee-count="badge.event.attendee_count"
                      class="cursor-pointer"
                      @click="$router.push(`/groups/${badge.event.group.slug}`)"
                    />
                  </div>
                  <div class="flex items-center gap-1.5 flex-wrap mt-1">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-accent/10 border border-brand-accent/25 rounded-lg text-xs font-bold text-brand-accent tracking-wide">
                      <BIcon name="AtSign" class="w-3 h-3" />{{ viewedProfile.username }}
                    </span>
                    <span v-if="viewedProfile.job_title" class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-bg border border-brand-border rounded-lg text-xs font-medium text-white/65">
                      <BIcon name="Briefcase" class="w-3 h-3 text-white/40" />{{ viewedProfile.job_title }}
                    </span>
                    <span v-if="viewedProfile.location || viewedProfile.country" class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-bg border border-brand-border rounded-lg text-xs font-medium text-white/65">
                      <BIcon name="MapPin" class="w-3 h-3 text-white/40" />{{ placeStr }}
                    </span>
                    <a v-if="viewedProfile.website" :href="websiteHref(viewedProfile.website)" target="_blank" rel="noopener noreferrer"
                      class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-bg border border-brand-accent/30 rounded-lg text-xs font-medium text-brand-accent hover:bg-brand-accent/10 transition-colors">
                      <BIcon name="Link" class="w-3 h-3" />{{ viewedProfile.website.replace(/^https?:\/\//, '') }}
                    </a>
                  </div>
                    <!-- Status bubble — right of avatar, under the name/chips -->
                    <Transition name="status-pop">
                      <div v-if="isOwnProfile || hasActiveStatus"
                        :key="profileStatus.text + profileStatus.emoji + (profileStatus.music?.title || '')"
                        class="relative mt-2.5 w-fit max-w-full md:max-w-sm">
                        <button
                          @click="isOwnProfile ? openStatusEdit() : null"
                          :class="isOwnProfile ? 'cursor-pointer' : 'cursor-default'"
                          class="relative block w-full text-left hover:opacity-90 active:scale-95 transition-all">
                          <!-- Bubble -->
                          <div class="w-full px-3 py-2 rounded-2xl text-white overflow-hidden"
                            :class="hasActiveStatus ? 'status-bubble-glow' : ''"
                            :style="{ background: statusBubbleGradient, boxShadow: hasActiveStatus ? `0 4px 18px -2px ${statusBubbleColor}80, 0 2px 6px rgba(0,0,0,0.35)` : '0 8px 20px rgba(0,0,0,0.35)' }">
                            <!-- Text/emoji -->
                            <div v-if="profileStatus.text || profileStatus.emoji"
                              class="flex gap-1 items-start"
                              :class="profileStatus.music ? 'mb-1' : ''">
                              <span v-if="profileStatus.emoji" class="text-sm shrink-0 leading-tight">{{ profileStatus.emoji }}</span>
                              <span v-if="profileStatus.text"
                                class="text-[11px] font-semibold leading-snug"
                                style="display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;word-break:break-word">{{ profileStatus.text }}</span>
                            </div>
                            <!-- Music -->
                            <div v-if="profileStatus.music" class="flex items-center gap-1.5" @click.stop="toggleStatusMusicPreview">
                              <div class="relative w-6 h-6 rounded-md overflow-hidden shrink-0 bg-black/30">
                                <img v-if="profileStatus.music.artworkUrl" :src="profileStatus.music.artworkUrl" class="w-full h-full object-cover" />
                                <div class="absolute inset-0 flex items-center justify-center bg-black/35 hover:bg-black/50 transition-colors">
                                  <BIcon :name="isStatusMusicPlaying ? 'Pause' : 'Play'" class="w-2.5 h-2.5 text-white" />
                                </div>
                              </div>
                              <div class="min-w-0 overflow-hidden">
                                <p class="text-[10px] font-bold leading-tight truncate">{{ profileStatus.music.artist }}</p>
                                <p class="text-[9px] opacity-70 leading-tight truncate">{{ profileStatus.music.title }}</p>
                              </div>
                            </div>
                            <!-- Empty own profile -->
                            <span v-if="!hasActiveStatus && isOwnProfile"
                              class="flex items-center gap-1 text-[11px] text-white/60">
                              {{ langStore.t.emptyBio }}</span>
                            <span v-if="hasActiveStatus && statusTimeRemaining" class="flex items-center gap-0.5 mt-0.5 text-[9px] opacity-45">
                              <BIcon name="Clock" class="w-2.5 h-2.5" />{{ statusTimeRemaining }}</span>
                          </div>
                        </button>
                      </div>
                    </Transition>

                </div>
              </div>
            </div>
          </div>

          <!-- ════════════════════════════════════════════════════════════════
               TWO-COLUMN: CENTER + RIGHT
          ════════════════════════════════════════════════════════════════ -->
          <div class="flex gap-4 mt-4 items-start">

            <!-- ── CENTER COLUMN ────────────────────────────────────────── -->
            <div class="flex-1 min-w-0 stack-y-4">

              <!-- About tabs card -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="flex border-b border-brand-border overflow-x-auto scrollbar-hide bg-brand-bg/40">
                  <button v-for="nav in aboutNavs" :key="nav.key"
                    @click="aboutTab = nav.key"
                    class="flex items-center gap-2 px-5 py-3.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px shrink-0"
                    :class="aboutTab === nav.key
                      ? 'border-brand-accent text-brand-accent'
                      : 'border-transparent text-white/55 hover:text-white'">
                    <component :is="nav.icon" class="w-4 h-4" />{{ nav.label }}
                  </button>
                </div>

                <div class="p-5">
                  <!-- О себе -->
                  <div v-if="aboutTab === 'about'" class="stack-y-4">

                    <!-- Bio (с кнопкой редактирования) -->
                    <div class="relative group/bio">
                      <div v-if="viewedProfile.bio"
                        class="bg-brand-bg/60 border border-brand-border/60 rounded-2xl px-5 py-4 pr-12">
                        <p class="text-sm text-white/90 leading-relaxed whitespace-pre-wrap wrap-break-word">{{ viewedProfile.bio }}</p>
                      </div>
                      <div v-else-if="isOwnProfile" class="flex flex-col items-center gap-2 py-6 text-center bg-brand-bg/30 rounded-2xl border border-dashed border-brand-border/60 cursor-pointer hover:border-brand-accent/40 transition-all"
                        @click="openEditModal('bio')">
                        <BIcon name="FileText" class="w-7 h-7 text-white/25" />
                        <p class="text-xs text-white/40">{{ langStore.t.addDescription }}</p>
                      </div>
                      <div v-else class="flex flex-col items-center gap-2 py-6 text-center bg-brand-bg/30 rounded-2xl border border-dashed border-brand-border/60">
                        <BIcon name="FileText" class="w-7 h-7 text-white/25" />
                        <p class="text-xs text-white/40">{{ langStore.t.emptyBio }}</p>
                      </div>
                      <button v-if="isOwnProfile && viewedProfile.bio" @click="openEditModal('bio')"
                        class="absolute top-2.5 right-2.5 w-7 h-7 flex items-center justify-center rounded-lg text-white/35 hover:text-brand-accent hover:bg-brand-card border border-transparent hover:border-brand-border opacity-0 group-hover/bio:opacity-100 transition-all">
                        <BIcon name="Pencil" class="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <!-- Детали профиля -->
                    <div class="stack-y-2">

                      <!-- Отношения + партнёр -->
                      <div v-if="viewedProfile.relationship_status || partnerProfile"
                        class="relative overflow-hidden rounded-2xl border transition-all group"
                        :class="partnerProfile ? 'border-pink-500/30 hover:border-pink-500/50' : 'border-pink-500/20 hover:border-pink-500/35 bg-brand-bg'">
                        <!-- Gradient background -->
                        <div v-if="partnerProfile" class="absolute inset-0 bg-linear-to-br/srgb from-pink-500/10 via-rose-500/6 to-brand-accent/8 pointer-events-none" />
                        <div v-else class="absolute inset-0 bg-linear-to-r/srgb from-pink-500/6 to-transparent pointer-events-none" />

                        <div class="relative px-3.5 py-3">
                          <!-- Single-line status (no partner) -->
                          <template v-if="!partnerProfile">
                            <div class="flex items-center gap-2.5">
                              <div class="w-8 h-8 rounded-xl bg-pink-500/15 border border-pink-500/25 flex items-center justify-center shrink-0">
                                <BIcon name="Heart" class="w-3.5 h-3.5 text-pink-400" />
                              </div>
                              <div>
                                <p class="text-[10px] text-pink-300/60 uppercase tracking-widest font-bold">{{ langStore.t.relationsLabel }}</p>
                                <p class="text-sm text-white font-bold">{{ relationshipStatusLabel }}</p>
                              </div>
                            </div>
                          </template>

                          <!-- Partner card — romantic layout -->
                          <template v-else>
                            <p class="text-[10px] text-pink-300/60 uppercase tracking-widest font-bold mb-2 flex items-center gap-1.5">
                              <BIcon name="Heart" class="w-3 h-3 text-pink-400" />
                              {{ relationshipStatusLabel }}
                            </p>
                            <!-- Two avatars with heart between -->
                            <div class="flex items-center gap-2">
                              <!-- Profile owner avatar -->
                              <router-link :to="'/profile/' + viewedProfile.username" class="shrink-0 group/av">
                                <img :src="avatarSrc || '/icons/badges/NN.jpg'"
                                  class="w-9 h-9 rounded-full object-cover border-2 border-pink-500/40 shadow-md shadow-pink-500/15 group-hover/av:scale-105 transition-transform"
                                  @error="onAvatarError" />
                              </router-link>
                              <!-- Floating hearts -->
                              <div class="flex flex-col items-center gap-0 shrink-0">
                                <span class="text-pink-300/35 text-[9px] animate-pulse leading-none">♥</span>
                                <BIcon name="Heart" class="w-4 h-4 text-pink-400 drop-shadow-[0_0_5px_rgba(236,72,153,0.55)]" style="animation: pulse 2s ease-in-out infinite" />
                                <span class="text-pink-300/35 text-[9px] animate-pulse leading-none" style="animation-delay:0.5s">♥</span>
                              </div>
                              <!-- Partner avatar + name -->
                              <router-link :to="'/profile/' + partnerProfile.username" class="flex items-center gap-2 min-w-0 group/pav">
                                <img v-if="partnerProfile.avatar_url" :src="partnerProfile.avatar_url"
                                  class="w-9 h-9 rounded-full object-cover border-2 border-pink-500/40 shadow-md shadow-pink-500/15 shrink-0 group-hover/pav:scale-105 transition-transform"
                                  @error="onAvatarError" />
                                <div v-else class="w-9 h-9 rounded-full bg-pink-500/20 border-2 border-pink-500/40 flex items-center justify-center text-sm font-bold text-pink-300 shrink-0">
                                  {{ (partnerProfile.display_name ?? partnerProfile.username)[0] }}
                                </div>
                                <div class="min-w-0">
                                  <p class="text-xs font-bold text-white group-hover/pav:text-pink-300 transition-colors truncate leading-tight">{{ partnerProfile.display_name ?? partnerProfile.username }}</p>
                                  <p class="text-[10px] text-white/40 truncate">@{{ partnerProfile.username }}</p>
                                </div>
                              </router-link>
                              <!-- Together since -->
                              <span v-if="togetherSince" class="ml-auto text-[10px] text-white/30 shrink-0 self-end">{{ togetherSince }}</span>
                            </div>
                          </template>
                        </div>
                      </div>

                      <!-- Местоимения -->
                      <div v-if="viewedProfile.pronouns"
                        class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl">
                        <div class="w-9 h-9 rounded-xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center shrink-0">
                          <BIcon name="Quote" class="w-4 h-4 text-brand-accent/70" />
                        </div>
                        <div>
                          <p class="text-[10px] text-white/40 uppercase tracking-wide font-bold">{{ langStore.t.pronounsLabel }}</p>
                          <p class="text-sm text-white/85 font-semibold">{{ viewedProfile.pronouns }}</p>
                        </div>
                      </div>

                    </div>

                    <!-- Местоположение + сайт -->
                    <div v-if="viewedProfile.location || viewedProfile.country || viewedProfile.website"
                      class="flex items-center gap-3 px-4 py-3 bg-brand-bg border border-brand-border rounded-2xl">
                      <div class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                        <BIcon name="MapPin" class="w-4 h-4 text-white/50" />
                      </div>
                      <div class="min-w-0 flex-1">
                        <p class="text-[10px] text-white/40 uppercase tracking-wide font-bold">{{ langStore.t.locationCardLabel }}</p>
                        <p class="text-sm text-white/80 font-semibold truncate">{{ [viewedProfile.location, viewedProfile.country].filter(Boolean).join(', ') }}</p>
                        <a v-if="viewedProfile.website" :href="websiteHref(viewedProfile.website)" target="_blank" rel="noopener noreferrer"
                          class="text-xs text-brand-accent hover:underline truncate block mt-0.5">{{ viewedProfile.website.replace(/^https?:\/\//, '') }}</a>
                      </div>
                    </div>

                  <!-- Хэштеги / интересы -->
                  <div v-if="userHashtags.length" class="stack-y-2">
                    <p class="text-[10px] font-bold uppercase tracking-widest text-white/40">{{ langStore.t.profileFrequentTagsLabel }}</p>
                    <div class="flex flex-wrap gap-1.5">
                      <span v-for="tag in userHashtags.slice(0, 10)" :key="tag.name"
                        @click="router.push({ path: '/search', query: { q: tag.name } })"
                        class="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-accent/8 border border-brand-accent/20 rounded-xl text-xs font-semibold text-brand-accent/80 cursor-pointer hover:bg-brand-accent/15 transition-colors">
                        #{{ tag.name }}
                        <span class="text-[10px] text-white/35">×{{ tag.count }}</span>
                      </span>
                    </div>
                  </div>

                  <!-- Artist since -->
                  <div v-if="viewedProfile.artist_since"
                    class="flex items-center gap-2.5 px-4 py-3 bg-linear-to-r/srgb from-amber-500/8 to-transparent border border-amber-500/20 rounded-2xl">
                    <BIcon name="Palette" class="w-4 h-4 text-amber-400 shrink-0" />
                    <div>
                      <p class="text-[10px] text-white/40 uppercase tracking-wide font-bold">{{ langStore.t.artistSinceLabel }}</p>
                      <p class="text-sm text-amber-300 font-bold">{{ new Date(viewedProfile.artist_since).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { month: 'long', year: 'numeric' }) }}</p>
                    </div>
                  </div>

                  <!-- Любимое: фиксированные категории (Еда/Животное/Музыка/Художник/Фильм) -->
                  <div v-if="hasFavorites || isOwnProfile" class="stack-y-2">
                    <p class="text-[10px] font-bold uppercase tracking-widest text-white/40">{{ langStore.t.profileFavoritesLabel }}</p>
                    <div class="stack-y-1.5">
                      <div v-for="cat in FAVORITE_CATEGORIES" :key="cat.key">
                        <template v-if="isOwnProfile">
                          <div v-if="editingFavorite === cat.key" class="flex items-center gap-2">
                            <span class="text-[11px] text-white/40 w-20 shrink-0">{{ cat.label }}</span>
                            <input v-model="favoriteDraft" @keydown.enter.prevent="saveFavorite(cat.key)" @keydown.escape="editingFavorite = null" autofocus
                              type="text" maxlength="80" :placeholder="cat.placeholder"
                              class="flex-1 min-w-0 bg-brand-bg border border-brand-border rounded-xl px-3 py-1.5 text-xs text-white outline-hidden focus:border-brand-accent/50 transition-colors" />
                            <button type="button" @click="saveFavorite(cat.key)"
                              class="shrink-0 px-3 py-1.5 rounded-xl bg-brand-accent/15 text-brand-accent text-xs font-bold hover:bg-brand-accent/25 transition-all">{{ langStore.t.profileOkBtn }}</button>
                            <button type="button" @click="editingFavorite = null"
                              class="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-brand-bg transition-all">
                              <BIcon name="X" class="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <button v-else type="button" @click="openFavoriteEdit(cat.key)"
                            class="flex items-center gap-2 group/fav w-full text-left py-0.5">
                            <span class="text-[11px] text-white/40 w-20 shrink-0">{{ cat.label }}</span>
                            <span v-if="viewedProfile[cat.key]" class="text-xs font-semibold text-white/75">{{ viewedProfile[cat.key] }}</span>
                            <span v-else class="text-xs text-white/25 italic truncate">{{ cat.placeholder }}</span>
                            <BIcon name="Pencil" class="w-3 h-3 text-white/20 opacity-0 group-hover/fav:opacity-100 transition-opacity shrink-0" />
                          </button>
                        </template>
                        <div v-else-if="viewedProfile[cat.key]" class="flex items-center gap-2">
                          <span class="text-[11px] text-white/40 w-20 shrink-0">{{ cat.label }}</span>
                          <span class="text-xs font-semibold text-white/75">{{ viewedProfile[cat.key] }}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                    <!-- Пусто (редактируемый профиль) -->
                    <div v-if="isOwnProfile && !viewedProfile.relationship_status && !profileFursona?.species?.length" class="pt-1">
                      <p class="text-xs text-white/30 text-center">{{ langStore.t.addInfoInSettings }}</p>
                    </div>

                    <!-- Edit shortcuts (own profile) -->
                    <div v-if="isOwnProfile" class="flex gap-2 flex-wrap pt-2 border-t border-brand-border/40">
                      <button @click="openEditModal('basics')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white/55 hover:text-white bg-brand-bg border border-brand-border hover:border-brand-accent/40 rounded-xl transition-all">
                        <BIcon name="User" class="w-3 h-3" /> {{ langStore.t.secBasic }}
                      </button>
                      <button @click="openEditModal('contacts')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white/55 hover:text-white bg-brand-bg border border-brand-border hover:border-brand-accent/40 rounded-xl transition-all">
                        <BIcon name="MapPin" class="w-3 h-3" /> {{ langStore.t.secContacts }}
                      </button>
                      <button @click="openEditModal('socials')"
                        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white/55 hover:text-white bg-brand-bg border border-brand-border hover:border-brand-accent/40 rounded-xl transition-all">
                        <BIcon name="AtSign" class="w-3 h-3" /> {{ langStore.t.socialNetworksLabel }}
                      </button>
                    </div>

                  </div>

                  <!-- ── ФУРСОНА (новый стиль) ────────────────────────── -->
                  <div v-else-if="aboutTab === 'fursona'" class="stack-y-4">

                    <!-- Загрузка -->
                    <div v-if="profileFursonaLoading" class="flex items-center justify-center py-16">
                      <div class="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
                    </div>

                    <!-- Нет фурсоны -->
                    <div v-else-if="!profileFursona" class="flex flex-col items-center gap-4 py-14 rounded-3xl border border-dashed border-brand-border text-center bg-brand-bg/30">
                      <span class="text-5xl opacity-30">🦊</span>
                      <p class="text-sm font-semibold text-white/55">{{ langStore.t.noFursonaAdded }}</p>
                      <button v-if="isOwnProfile" @click="openEditModal('fursona')"
                        class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-accent/10 hover:bg-brand-accent/20 border border-brand-accent/30 text-brand-accent rounded-xl text-sm font-bold transition-all">
                        <BIcon name="Plus" class="w-4 h-4" /> {{ langStore.t.profileCreateFursonaBtn }}
                      </button>
                    </div>

                    <!-- Карточка фурсоны -->
                    <template v-else>
                      <!-- Переключатель персонажей (когда их несколько) -->
                      <div v-if="profileFursonas.length > 1" class="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                        <button
                          v-for="f in profileFursonas"
                          :key="f.id"
                          type="button"
                          @click="selectedFursonaId = f.id"
                          class="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border shrink-0 transition-all"
                          :class="f.id === profileFursona?.id
                            ? 'border-brand-accent/60 bg-brand-accent/15 shadow-[0_0_12px_rgba(167,139,250,0.15)]'
                            : 'border-brand-border bg-brand-bg hover:border-brand-accent/30'"
                        >
                          <span class="w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0"
                            :style="f.colors?.length ? `background:${f.colors[0]}30;border:1px solid ${f.colors[0]}50` : 'background:rgba(255,255,255,0.08)'">
                            {{ f.species?.length ? speciesEmoji(f.species[0]) : '🦊' }}
                          </span>
                          <span class="text-xs font-bold truncate max-w-32"
                            :class="f.id === profileFursona?.id ? 'text-brand-accent' : 'text-white/60'">
                            {{ f.name || speciesSummary(f) || '—' }}
                          </span>
                        </button>
                      </div>

                      <!-- Шапка: имя + виды + редактирование -->
                      <div class="rounded-3xl border border-brand-border bg-brand-card shadow-xl overflow-hidden">
                        <!-- Gradient header -->
                        <div class="relative px-5 py-5 border-b border-brand-border/60"
                          :style="profileFursona.colors?.length
                            ? `background:linear-gradient(135deg,${profileFursona.colors[0]}18 0%,${(profileFursona.colors[1] ?? profileFursona.colors[0])}0c 60%,transparent 100%)`
                            : 'background:linear-gradient(135deg,#7c3aed18 0%,transparent 100%)'">
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0 flex-1">
                              <p class="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">{{ langStore.t.fursonaSettingsTitle }}</p>
                              <h2 class="text-2xl md:text-3xl md:leading-9 font-extrabold text-white truncate leading-tight">
                                {{ profileFursona.name || viewedProfile?.display_name || '—' }}
                              </h2>
                              <!-- Виды как чипы -->
                              <div v-if="profileFursona.species?.length" class="flex flex-wrap gap-1.5 mt-2">
                                <span v-for="sp in profileFursona.species" :key="sp"
                                  class="px-2.5 py-1 rounded-lg text-xs font-bold border"
                                  :style="profileFursona.colors?.length
                                    ? `background:${profileFursona.colors[0]}20;border-color:${profileFursona.colors[0]}40;color:${profileFursona.colors[0]}`
                                    : 'background:rgba(124,58,237,0.15);border-color:rgba(124,58,237,0.3);color:#a78bfa'">
                                  {{ speciesDisplay(sp) }}
                                </span>
                              </div>
                            </div>
                            <!-- Цветовая палитра -->
                            <div class="flex flex-col items-end gap-2 shrink-0">
                              <button v-if="isOwnProfile" @click="openEditModal('fursona')"
                                class="w-8 h-8 flex items-center justify-center rounded-xl bg-brand-bg border border-brand-border hover:border-brand-accent text-white/55 hover:text-brand-accent transition-all">
                                <BIcon name="Pencil" class="w-3.5 h-3.5" />
                              </button>
                              <div v-if="profileFursona.colors?.length" class="flex gap-1">
                                <div v-for="c in profileFursona.colors.slice(0,6)" :key="c"
                                  class="w-5 h-5 rounded-md border border-black/20 shadow-xs cursor-pointer hover:scale-110 transition-transform"
                                  :style="`background:${c}`"
                                  :title="c"></div>
                                <div v-if="profileFursona.colors.length > 6"
                                  class="w-5 h-5 rounded-md border border-brand-border bg-brand-bg flex items-center justify-center text-[9px] font-bold text-white/60">
                                  +{{ profileFursona.colors.length - 6 }}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <!-- Тело: реф + инфо -->
                        <div class="p-4 grid grid-cols-1 xl:grid-cols-[1fr_1.15fr] gap-4">
                          <!-- Левая колонка: референс -->
                          <div class="stack-y-2">
                            <!-- Референс изображение (галерея) -->
                            <button v-if="userStore.referenceImages.length" type="button"
                              class="w-full relative rounded-2xl overflow-hidden border border-brand-border/60 group shadow-lg"
                              style="height:280px"
                              @click="openReferencesAlbum">
                              <img :src="userStore.referenceImages[0].image_url"
                                class="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                :class="userStore.referenceImages[0].is_nsfw && !nsfwMode ? 'blur-xl' : ''"
                                :alt="langStore.t.profileRefAlt" />
                              <div class="absolute inset-0 bg-linear-to-t/srgb from-black/75 via-black/20 to-transparent group-hover:from-black/60 transition-all"></div>
                              <div v-if="userStore.referenceImages[0].is_nsfw && !nsfwMode"
                                class="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                <span class="px-3 py-1.5 rounded-xl bg-black/70 border border-rose-500/50 text-rose-400 text-xs font-bold">18+ NSFW</span>
                                <span class="text-white/60 text-xs">{{ langStore.t.hiddenLabel }}</span>
                              </div>
                              <div v-else class="absolute top-3 left-3 right-3 flex flex-wrap items-center gap-1.5">
                                <span class="px-2.5 py-1 rounded-lg bg-black/50 border border-white/15 text-[10px] font-bold text-white/85 uppercase tracking-wider backdrop-blur-xs">Reference</span>
                                <span v-if="userStore.referenceImages.length > 1" class="px-2 py-1 rounded-lg bg-black/50 border border-white/15 text-[10px] font-bold text-white/85 backdrop-blur-xs">+{{ userStore.referenceImages.length - 1 }}</span>
                                <span v-if="userStore.referenceImages[0].artist_name"
                                  :title="userStore.referenceImages[0].artist_name"
                                  class="px-2 py-1 rounded-lg bg-black/50 border border-white/15 text-[10px] font-semibold text-white/70 backdrop-blur-xs truncate max-w-[140px]">
                                  {{ langStore.t.profileArtByLabel }} {{ userStore.referenceImages[0].artist_name }}
                                </span>
                              </div>
                              <div class="absolute bottom-3 left-4 right-4 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                                <span class="text-white text-sm font-bold">{{ profileFursona.name }}</span>
                                <span class="px-2 py-1 rounded-lg bg-black/50 border border-white/20 text-[11px] font-bold text-white backdrop-blur-xs">{{ langStore.t.openBtn }}</span>
                              </div>
                            </button>
                            <div v-else class="rounded-2xl border-2 border-dashed border-brand-border/40 flex flex-col items-center justify-center text-center opacity-60 bg-brand-bg/30" style="height:200px">
                              <BIcon name="Image" class="w-8 h-8 text-white/40 mb-2" />
                              <p class="text-xs font-semibold text-white/40">{{ langStore.t.profileRefNotAdded }}</p>
                            </div>

                            <!-- Цвета - большие свотчи -->
                            <div v-if="profileFursona.colors?.length" class="grid gap-1.5" :class="profileFursona.colors.length > 3 ? 'grid-cols-4' : 'grid-cols-3'">
                              <div v-for="c in profileFursona.colors" :key="c"
                                class="rounded-xl border border-black/20 shadow-xs relative group/swatch cursor-default"
                                style="height:40px"
                                :style="`background:${c}`">
                                <span class="absolute inset-0 flex items-center justify-center opacity-0 group-hover/swatch:opacity-100 transition-opacity">
                                  <span class="px-1.5 py-0.5 rounded-sm text-[9px] font-bold bg-black/60 text-white backdrop-blur-xs">{{ c }}</span>
                                </span>
                              </div>
                            </div>
                          </div>

                          <!-- Правая колонка: табы с инфо -->
                          <div class="rounded-2xl border border-brand-border/60 bg-brand-bg/40 overflow-hidden">
                            <!-- Вкладки -->
                            <div class="flex border-b border-brand-border/60">
                              <button v-for="tab in fursonaViewTabs" :key="tab.key"
                                @click="fursonaSubTab = tab.key"
                                class="flex-1 px-3 py-2.5 text-xs font-bold transition-all border-b-2 -mb-px"
                                :class="fursonaSubTab === tab.key
                                  ? 'text-brand-accent border-brand-accent bg-brand-accent/5'
                                  : 'text-white/45 border-transparent hover:text-white/70 hover:bg-white/4'">
                                {{ tab.label }}
                                <span v-if="tab.count" class="ml-1 text-[9px] opacity-60">({{ tab.count }})</span>
                              </button>
                            </div>

                            <div class="p-4 min-h-60">
                              <!-- Личность -->
                              <template v-if="fursonaSubTab === 'personality'">
                                <template v-if="profileFursona.likes_dislikes_visible || isOwnProfile">
                                  <!-- Оба пустые → компактный плейсхолдер -->
                                  <div v-if="!profileFursona.likes?.length && !profileFursona.dislikes?.length"
                                    class="flex flex-col items-center justify-center gap-3 py-8 text-center">
                                    <div class="w-12 h-12 rounded-2xl flex items-center justify-center opacity-30"
                                      style="background:rgba(167,139,250,0.15)">
                                      <svg class="w-6 h-6 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                                      </svg>
                                    </div>
                                    <div>
                                      <p class="text-sm font-semibold text-white/40">{{ langStore.t.prefsNotSet }}</p>
                                    </div>
                                  </div>
                                  <!-- Есть хотя бы что-то → два блока -->
                                  <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div class="p-3 rounded-xl border" style="background:rgba(34,197,94,0.06);border-color:rgba(34,197,94,0.2)">
                                      <p class="text-xs font-extrabold uppercase tracking-wider mb-2.5 flex items-center gap-1.5" style="color:#4ade80">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                                        {{ langStore.t.fursonaLikesLabel }}
                                      </p>
                                      <div v-if="profileFursona.likes?.length" class="flex flex-wrap gap-1.5">
                                        <span v-for="item in profileFursona.likes" :key="`like-${item}`"
                                          class="px-2 py-0.5 rounded-lg text-xs font-semibold" style="background:rgba(34,197,94,0.12);color:rgba(134,239,172,1)">
                                          {{ item }}
                                        </span>
                                      </div>
                                      <p v-else class="text-white/35 text-xs">{{ langStore.t.fieldNotFilled }}</p>
                                    </div>
                                    <div class="p-3 rounded-xl border" style="background:rgba(239,68,68,0.06);border-color:rgba(239,68,68,0.2)">
                                      <p class="text-xs font-extrabold uppercase tracking-wider mb-2.5 flex items-center gap-1.5" style="color:#f87171">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                                        {{ langStore.t.fursonaDislikesLabel }}
                                      </p>
                                      <div v-if="profileFursona.dislikes?.length" class="flex flex-wrap gap-1.5">
                                        <span v-for="item in profileFursona.dislikes" :key="`dislike-${item}`"
                                          class="px-2 py-0.5 rounded-lg text-xs font-semibold" style="background:rgba(239,68,68,0.12);color:rgba(252,165,165,1)">
                                          {{ item }}
                                        </span>
                                      </div>
                                      <p v-else class="text-white/35 text-xs">{{ langStore.t.fieldNotFilled }}</p>
                                    </div>
                                  </div>
                                </template>
                                <div v-else class="flex flex-col items-center justify-center py-10 gap-2 text-center">
                                  <BIcon name="EyeOff" class="w-8 h-8 text-white/25" />
                                  <p class="text-sm font-semibold text-white/40">{{ langStore.t.hiddenByOwner }}</p>
                                </div>
                              </template>

                              <!-- Информация -->
                              <template v-else-if="fursonaSubTab === 'info'">
                                <div class="stack-y-2 text-sm">
                                  <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-brand-card border border-brand-border">
                                    <span class="text-white/45 text-xs font-semibold uppercase tracking-wider">{{ langStore.t.profileNameShortLabel }}</span>
                                    <span class="font-bold text-white truncate">{{ profileFursona.name || '—' }}</span>
                                  </div>
                                  <div v-if="profileFursona.species?.length"
                                    class="flex items-start justify-between gap-3 p-3 rounded-xl bg-brand-card border border-brand-border">
                                    <span class="text-white/45 text-xs font-semibold uppercase tracking-wider shrink-0">{{ langStore.t.profileSpeciesShortLabel }}</span>
                                    <div class="flex flex-wrap gap-1 justify-end">
                                      <span v-for="sp in profileFursona.species" :key="sp"
                                        class="px-2 py-0.5 rounded-md text-xs font-bold"
                                        style="background:rgba(124,58,237,0.2);color:#a78bfa">{{ speciesDisplay(sp) }}</span>
                                    </div>
                                  </div>
                                  <div v-if="profileFursona.colors?.length"
                                    class="flex items-start justify-between gap-3 p-3 rounded-xl bg-brand-card border border-brand-border">
                                    <span class="text-white/45 text-xs font-semibold uppercase tracking-wider shrink-0 pt-0.5">{{ langStore.t.profileColorsShortLabel }}</span>
                                    <div class="flex flex-wrap gap-1.5 justify-end">
                                      <div v-for="c in profileFursona.colors" :key="c"
                                        class="w-5 h-5 rounded-md border border-black/20 shrink-0"
                                        :style="`background:${c}`" :title="c"></div>
                                    </div>
                                  </div>
                                </div>
                              </template>

                              <!-- Особенности (цвета крупно) -->
                              <template v-else-if="fursonaSubTab === 'features'">
                                <div class="stack-y-3">
                                  <p class="text-[10px] font-bold uppercase tracking-wider text-white/40">{{ langStore.t.colorPaletteLabel }}</p>
                                  <div v-if="profileFursona.colors?.length" class="grid grid-cols-2 gap-2">
                                    <div v-for="c in profileFursona.colors" :key="c"
                                      class="rounded-xl border border-black/15 flex items-center gap-2.5 px-3"
                                      style="height:44px"
                                      :style="`background:${c}20;border-color:${c}30`">
                                      <div class="w-6 h-6 rounded-lg border border-black/20 shadow-xs shrink-0" :style="`background:${c}`"></div>
                                      <span class="text-xs font-bold text-white/80 font-mono">{{ c }}</span>
                                    </div>
                                  </div>
                                  <p v-else class="text-white/35 text-xs">{{ langStore.t.noColorsSet }}</p>
                                </div>
                              </template>
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>
                  </div>

                  <!-- ── ФУРСЬЮТ (новый стиль) ─────────────────────────── -->
                  <div v-else-if="aboutTab === 'fursuit'" class="stack-y-4">

                    <!-- Загрузка -->
                    <div v-if="profileFursuitsLoading" class="flex items-center justify-center py-16">
                      <div class="w-8 h-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin"></div>
                    </div>

                    <!-- Нет фурсьютов -->
                    <div v-else-if="!profileFursuits.length" class="flex flex-col items-center gap-4 py-14 rounded-3xl border border-dashed border-brand-border text-center bg-brand-bg/30">
                      <span class="text-5xl opacity-30">🐾</span>
                      <p class="text-sm font-semibold text-white/55">{{ langStore.t.fursuitNotAdded }}</p>
                      <button v-if="isOwnProfile" @click="openEditModal('fursuit')"
                        class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-accent/10 hover:bg-brand-accent/20 border border-brand-accent/30 text-brand-accent rounded-xl text-sm font-bold transition-all">
                        <BIcon name="Plus" class="w-4 h-4" /> {{ langStore.t.profileAddFursuitBtn }}
                      </button>
                    </div>

                    <!-- Список фурсьютов -->
                    <template v-else>
                      <div class="flex items-center justify-between mb-1 px-1">
                        <p class="text-[10px] font-bold uppercase tracking-widest text-white/40">
                          {{ langStore.t.profileFursuitsCountLabel }} · {{ profileFursuits.length }}
                        </p>
                        <button v-if="isOwnProfile" @click="openEditModal('fursuit')"
                          class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-accent/10 hover:bg-brand-accent/20 border border-brand-accent/30 text-brand-accent text-xs font-bold transition-all">
                          <BIcon name="Settings" class="w-3.5 h-3.5" /> {{ langStore.t.profileManageFursuitsBtn }}
                        </button>
                      </div>

                      <!-- ══ Hero card (1 fursuit) ════════════════════════════ -->
                      <div v-if="profileFursuits.length === 1"
                        class="rounded-3xl border border-brand-border bg-brand-card shadow-xl overflow-hidden group hover:border-brand-accent/40 transition-all">
                        <!-- Большое фото -->
                        <div class="relative bg-brand-bg overflow-hidden"
                          :style="profileFursuits[0].image_url ? 'height:22rem' : 'height:10rem'">
                          <template v-if="profileFursuits[0].image_url">
                            <img :src="profileFursuits[0].image_url"
                              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                              :class="profileFursuits[0].is_nsfw && !nsfwMode ? 'blur-xl scale-110' : ''"
                              :alt="langStore.t.fursuitTab" />
                            <!-- NSFW overlay -->
                            <div v-if="profileFursuits[0].is_nsfw && !nsfwMode"
                              class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40">
                              <span class="px-4 py-2 rounded-2xl bg-black/80 border border-rose-500/60 text-rose-400 text-sm font-bold">18+ NSFW</span>
                            </div>
                            <div v-else-if="profileFursuits[0].is_nsfw"
                              class="absolute top-4 right-4 px-2.5 py-1 rounded-lg bg-rose-500/80 text-white text-xs font-bold backdrop-blur-xs">
                              18+
                            </div>
                            <!-- Градиент снизу -->
                            <div class="absolute inset-x-0 bottom-0 h-32 bg-linear-to-t/srgb from-brand-card via-brand-card/60 to-transparent"></div>
                          </template>
                          <div v-else class="w-full h-full flex items-center justify-center opacity-20">
                            <span class="text-7xl">🐾</span>
                          </div>
                        </div>

                        <!-- Информация под фото -->
                        <div class="p-5 -mt-2 stack-y-3">
                          <!-- Описание -->
                          <p v-if="profileFursuits[0].description" class="text-sm text-white/80 leading-relaxed">
                            {{ profileFursuits[0].description }}
                          </p>

                          <!-- Мастер (Bloomly группа) -->
                          <div v-if="profileFursuits[0].maker_id && makerGroupCache[profileFursuits[0].maker_id]"
                            class="flex items-center gap-2 flex-wrap">
                            <span class="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1">
                              <BIcon name="Scissors" class="w-3 h-3" /> {{ langStore.t.verTypeMaster }}
                            </span>
                            <RouterLink
                              :to="`/groups/${makerGroupCache[profileFursuits[0].maker_id].slug}`"
                              class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-accent/10 border border-brand-accent/30 text-brand-accent text-xs font-bold hover:bg-brand-accent/20 hover:border-brand-accent/50 transition-all"
                              @click.stop>
                              <img v-if="makerGroupCache[profileFursuits[0].maker_id].avatar_url"
                                :src="makerGroupCache[profileFursuits[0].maker_id].avatar_url!"
                                class="w-4 h-4 rounded-full object-cover"
                                @error="onAvatarError" />
                              <BIcon v-else name="Users" class="w-3.5 h-3.5" />
                              {{ makerGroupCache[profileFursuits[0].maker_id].name }}
                            </RouterLink>
                          </div>

                          <!-- Внешние ссылки мастера -->
                          <div v-if="profileFursuits[0].external_maker_links?.length" class="flex flex-wrap gap-1.5">
                            <span v-if="!profileFursuits[0].maker_id || !makerGroupCache[profileFursuits[0].maker_id]"
                              class="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1 w-full">
                              <BIcon name="Scissors" class="w-3 h-3" /> {{ langStore.t.verTypeMaster }}
                            </span>
                            <a v-for="link in profileFursuits[0].external_maker_links" :key="link"
                              :href="safeHref(link)" target="_blank" rel="noopener noreferrer"
                              class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-bg border border-brand-border text-white/70 hover:text-brand-accent hover:border-brand-accent/50 text-xs font-semibold transition-all"
                              @click.stop>
                              <BIcon name="ExternalLink" class="w-3 h-3" />
                              {{ link.replace(/^https?:\/\/(?:www\.)?/, '').split('/')[0] }}
                            </a>
                          </div>

                          <!-- Пустой placeholder -->
                          <div v-if="!profileFursuits[0].description && !profileFursuits[0].external_maker_links?.length && !(profileFursuits[0].maker_id && makerGroupCache[profileFursuits[0].maker_id])">
                            <p class="text-xs text-white/30 italic">{{ langStore.t.profileFursuitDescNotAdded }}</p>
                          </div>
                        </div>
                      </div>

                      <!-- ══ Grid (2+ fursuits) ═══════════════════════════════ -->
                      <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div v-for="suit in profileFursuits" :key="suit.id"
                          class="rounded-3xl border border-brand-border bg-brand-card shadow-lg overflow-hidden group hover:border-brand-accent/40 transition-all">
                          <!-- Фото -->
                          <div class="relative h-56 bg-brand-bg overflow-hidden">
                            <template v-if="suit.image_url">
                              <img :src="suit.image_url"
                                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                :class="suit.is_nsfw && !nsfwMode ? 'blur-xl scale-110' : ''"
                                :alt="langStore.t.profileFursuitPhotoAlt" />
                              <div v-if="suit.is_nsfw && !nsfwMode"
                                class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30">
                                <span class="px-3 py-1.5 rounded-xl bg-black/70 border border-rose-500/50 text-rose-400 text-xs font-bold">18+ NSFW</span>
                              </div>
                              <div v-else-if="suit.is_nsfw"
                                class="absolute top-3 right-3 px-2 py-0.5 rounded-md bg-rose-500/80 text-white text-[10px] font-bold">
                                18+
                              </div>
                            </template>
                            <div v-else class="w-full h-full flex items-center justify-center opacity-30">
                              <span class="text-5xl">🐾</span>
                            </div>
                            <div v-if="suit.image_url" class="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t/srgb from-brand-card to-transparent"></div>
                          </div>

                          <!-- Информация -->
                          <div class="p-4 stack-y-2.5 -mt-1">
                            <div v-if="suit.description" class="text-sm text-white/75 leading-relaxed line-clamp-3">
                              {{ suit.description }}
                            </div>

                            <!-- Мастер — Bloomly группа -->
                            <div v-if="suit.maker_id && makerGroupCache[suit.maker_id]" class="flex items-center gap-2 flex-wrap">
                              <span class="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1">
                                <BIcon name="Scissors" class="w-3 h-3" /> {{ langStore.t.verTypeMaster }}
                              </span>
                              <RouterLink
                                :to="`/groups/${makerGroupCache[suit.maker_id].slug}`"
                                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-accent/10 border border-brand-accent/30 text-brand-accent text-xs font-bold hover:bg-brand-accent/20 transition-all"
                                @click.stop>
                                <img v-if="makerGroupCache[suit.maker_id].avatar_url"
                                  :src="makerGroupCache[suit.maker_id].avatar_url!"
                                  class="w-3.5 h-3.5 rounded-full object-cover"
                                  @error="onAvatarError" />
                                <BIcon v-else name="Users" class="w-3 h-3" />
                                {{ makerGroupCache[suit.maker_id].name }}
                              </RouterLink>
                            </div>

                            <!-- Мастер — внешние ссылки -->
                            <div v-if="suit.external_maker_links?.length" class="stack-y-1">
                              <p v-if="!suit.maker_id || !makerGroupCache[suit.maker_id]"
                                class="text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
                                <BIcon name="Scissors" class="w-3 h-3" /> {{ langStore.t.verTypeMaster }}
                              </p>
                              <div class="flex flex-wrap gap-1.5">
                                <a v-for="link in suit.external_maker_links" :key="link"
                                  :href="safeHref(link)" target="_blank" rel="noopener noreferrer"
                                  class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-bg border border-brand-border text-white/70 hover:text-brand-accent hover:border-brand-accent/50 text-xs font-semibold transition-all"
                                  @click.stop>
                                  <BIcon name="ExternalLink" class="w-3 h-3" />
                                  {{ link.replace(/^https?:\/\/(?:www\.)?/, '').split('/')[0] }}
                                </a>
                              </div>
                            </div>

                            <div v-if="!suit.external_maker_links?.length && !suit.description && !(suit.maker_id && makerGroupCache[suit.maker_id])" class="py-2">
                              <p class="text-xs text-white/30 italic">{{ langStore.t.profileFursuitDescNotAdded }}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </template>
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
                    : 'bg-brand-card text-white/55 border-brand-border hover:border-brand-accent/50 hover:text-white'">
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
                  <img :src="ownAvatarSrc || '/icons/badges/NN.jpg'" class="w-10 h-10 rounded-full border-2 border-brand-border object-cover shrink-0 group-hover:border-brand-accent/50 transition-colors" @error="onAvatarError" />
                  <span class="flex-1 max-md:min-w-0 max-md:truncate text-sm text-white/55 bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 group-hover:border-brand-accent/40 transition-colors">{{ langStore.t.whatsNew }}</span>
                  <div class="flex items-center gap-2 text-white/55 group-hover:text-white transition-colors ml-1">
                    <BIcon name="ImagePlus" class="w-5 h-5" />
                    <BIcon name="Hash" class="w-5 h-5" />
                  </div>
                </button>
                <!-- Expanded composer -->
                <div v-else class="p-5 max-md:p-4 stack-y-4">
                  <div class="flex items-start gap-3 max-md:flex-wrap max-md:items-center max-md:gap-2">
                    <div class="relative shrink-0 mt-0.5">
                      <img :src="ownAvatarSrc || '/icons/badges/NN.jpg'" class="w-10 h-10 rounded-full border-2 border-brand-border object-cover" @error="onAvatarError" />
                    </div>
                    <div class="flex-1 min-w-0 max-md:order-last max-md:basis-full">
                      <MentionTextarea v-model="newPostContent" :placeholder="langStore.t.profileWhatsNewPlaceholder" minHeight="90px" />
                    </div>
                    <div class="relative shrink-0 mt-0.5 max-md:mt-0 max-md:ml-auto">
                      <button
                        @click.stop="showProfileScheduleMenu = !showProfileScheduleMenu"
                        :disabled="(!newPostContent.trim() && newPostMediaUrls.length === 0) || isSchedulingProfilePost"
                        class="w-10 h-10 rounded-full flex items-center justify-center border border-brand-border text-white/60 hover:bg-brand-bg hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        title="Отложить публикацию"
                      >
                        <BIcon v-if="isSchedulingProfilePost" name="Loader2" class="w-4.5 h-4.5 animate-spin" />
                        <BIcon v-else name="CalendarClock" class="w-4.5 h-4.5" />
                      </button>
                      <PostScheduleMenu
                        v-if="showProfileScheduleMenu"
                        @close="showProfileScheduleMenu = false"
                        @draft="saveProfileScheduledPost({})"
                        @schedule="(p) => saveProfileScheduledPost(p)"
                      />
                    </div>
                    <button @click="createPost" :disabled="(!newPostContent.trim() && newPostMediaUrls.length === 0) || isCreatingPost"
                      class="w-10 h-10 rounded-full flex items-center justify-center bg-brand-accent text-white hover:bg-brand-accent-plus disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-brand-accent/25 shrink-0 mt-0.5 max-md:mt-0">
                      <BIcon v-if="isCreatingPost" name="Loader2" class="w-5 h-5 animate-spin" />
                      <BIcon v-else name="SendHorizontal" class="w-5 h-5" />
                    </button>
                  </div>
                  <!-- Media previews -->
                  <MediaUpload ref="profileMediaUploadRef" type="posts" :multiple="true" :max-files="20" @uploaded="onProfileMediaUploaded" />

                  <!-- Tags row -->
                  <div v-if="newPostTags.length" class="flex flex-wrap gap-1.5">
                    <span v-for="tag in newPostTags" :key="tag"
                      class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-accent/15 border border-brand-accent/30 text-brand-accent text-xs font-semibold">
                      #{{ tag }}
                      <button @click="removeProfileTag(tag)" class="text-brand-accent/60 hover:text-brand-accent"><BIcon name="X" class="w-3 h-3" /></button>
                    </span>
                  </div>

                  <div class="border-t border-brand-border" />
                  <div class="flex items-center gap-2 flex-wrap">
                    <button @click="profileMediaUploadRef?.openPicker()"
                      class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white/55 hover:text-white hover:bg-brand-bg border border-transparent hover:border-brand-border transition-all">
                      <BIcon name="ImagePlus" class="w-4 h-4" /> {{ langStore.t.mediaTab }}
                    </button>
                    <!-- Tag input -->
                    <div class="relative inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-transparent hover:border-brand-border hover:bg-brand-bg transition-all">
                      <BIcon name="Hash" class="w-4 h-4 text-white/55 shrink-0" />
                      <input type="text" v-model="newPostTagInput"
                        @input="fetchTagSuggestions(newPostTagInput)"
                        @keydown.enter.prevent="addProfileTag"
                        @keydown.escape="clearTagSuggestions"
                        :placeholder="langStore.t.profileTagPlusEnterPlaceholder"
                        class="bg-transparent text-xs text-white placeholder-brand-muted outline-hidden w-24" />

                      <!-- Tag suggestions, ranked by usage -->
                      <div v-if="showTagSuggestions" v-click-outside="clearTagSuggestions"
                        class="absolute top-full left-0 mt-1.5 z-30 w-56 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1">
                        <button v-for="s in tagSuggestions" :key="s.name"
                          @click="addProfileTagFromSuggestion(s.name)"
                          class="w-full flex items-center justify-between gap-2 px-4 py-2 text-sm text-white hover:bg-white/5">
                          <span class="truncate">#{{ s.name }}</span>
                          <span class="text-xs text-white/35 shrink-0">{{ s.count }}</span>
                        </button>
                      </div>
                    </div>
                    <button @click="newPostIsNsfw = !newPostIsNsfw"
                      :disabled="!isNsfwAllowed"
                      :title="!isNsfwAllowed ? langStore.t.profileNsfwLockedTooltip : ''"
                      class="px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                      :class="!isNsfwAllowed ? 'opacity-30 cursor-not-allowed border-transparent text-white/55' : newPostIsNsfw ? 'border-brand-error/60 text-brand-error bg-brand-error/10' : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'">
                      NSFW
                    </button>
                    <!-- AI-generated toggle -->
                    <button @click="newPostIsAiGenerated = !newPostIsAiGenerated"
                      :title="langStore.t.aiGenToggleTitle"
                      class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all"
                      :class="newPostIsAiGenerated ? 'border-brand-purple/60 text-brand-purple bg-brand-purple/10' : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'">
                      <BIcon name="Bot" class="w-3.5 h-3.5" /> {{ langStore.t.aiGenBadge }}
                    </button>
                  </div>

                  <!-- Visibility + Cancel — own row so Cancel never wraps onto its own orphan line -->
                  <div class="flex items-center justify-between gap-2 mt-2">
                    <div class="relative">
                      <button @click.stop="showProfileVisibilityMenu = !showProfileVisibilityMenu"
                        class="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all"
                        :class="newPostVisibility !== 'public' ? 'border-brand-accent/50 text-brand-accent bg-brand-accent/10' : 'border-transparent text-white/55 hover:border-brand-border hover:bg-brand-bg hover:text-white'">
                        <BIcon :name="newPostVisibility === 'subscriber_only' ? 'Users' : newPostVisibility === 'paid' ? 'DollarSign' : 'Globe2'" class="w-3.5 h-3.5" />
                        {{ newPostVisibility === 'subscriber_only' ? langStore.t.profileVisibilitySubscriberOnly : newPostVisibility === 'paid' ? langStore.t.profileVisibilityPaid : langStore.t.profileVisibilityPublic }}
                        <BIcon name="ChevronDown" class="w-3 h-3 opacity-60" />
                      </button>
                      <Transition name="slide">
                        <div v-if="showProfileVisibilityMenu" v-click-outside="() => showProfileVisibilityMenu = false"
                          class="absolute bottom-full left-0 mb-1.5 z-30 w-52 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1">
                          <button @click="newPostVisibility = 'public'; showProfileVisibilityMenu = false"
                            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-brand-bg/60 transition-colors"
                            :class="newPostVisibility === 'public' ? 'text-brand-accent' : 'text-white'">
                            <BIcon name="Globe2" class="w-4 h-4 shrink-0" /> {{ langStore.t.profileVisibilityPublic }}
                            <BIcon v-if="newPostVisibility === 'public'" name="Check" class="w-3.5 h-3.5 ml-auto text-brand-accent" />
                          </button>
                          <button @click="newPostVisibility = 'subscriber_only'; showProfileVisibilityMenu = false"
                            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-brand-bg/60 transition-colors"
                            :class="newPostVisibility === 'subscriber_only' ? 'text-brand-accent' : 'text-white'">
                            <BIcon name="Users" class="w-4 h-4 shrink-0" /> {{ langStore.t.profileVisibilitySubscriberOnly }}
                            <BIcon v-if="newPostVisibility === 'subscriber_only'" name="Check" class="w-3.5 h-3.5 ml-auto text-brand-accent" />
                          </button>
                          <button disabled :title="langStore.t.payModalAltComingSoon"
                            class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-white/30 cursor-not-allowed">
                            <BIcon name="DollarSign" class="w-4 h-4 shrink-0" /> {{ langStore.t.profileVisibilityPaid }}
                            <span class="ml-auto text-[10px] uppercase tracking-wide">{{ langStore.t.profileComingSoonBadge }}</span>
                          </button>
                        </div>
                      </Transition>
                    </div>
                    <button @click="showPostForm = false; showProfileScheduleMenu = false; newPostContent = ''; newPostMediaUrls = []; newPostTags = []; newPostTagInput = ''; newPostVisibility = 'public'; newPostIsAiGenerated = false; profileMediaUploadRef?.clearAll()"
                      class="text-xs font-semibold text-white/55 hover:text-white transition-all">{{ langStore.t.cancel }}</button>
                  </div>
                </div>
              </div>

              <!-- ── Content card ──────────────────────────────────────── -->
              <div>
                <div class="stack-y-3">

                  <!-- POSTS / REPAWS / ARCHIVE -->
                  <template v-if="['posts', 'repaws', 'archive'].includes(activeContentTab)">

                    <!-- Pinned post -->
                    <div v-if="pinnedPost && activeContentTab === 'posts'">
                      <div class="flex items-center gap-2 text-xs text-white/55 font-semibold mb-2 px-1">
                        <BIcon name="Pin" class="w-3.5 h-3.5 text-brand-accent" /> {{ langStore.t.pinnedPost }}
                      </div>
                      <PostCard :post="pinnedPost" :is-own-profile="isOwnProfile"
                        :is-pinned-post-id="viewedProfile.pinned_post_id"
                        :ad-mode="false"
                        :initial-repawed="profilePostStatus[pinnedPost.id]?.repawed ?? false"
                        :initial-favourited="profilePostStatus[pinnedPost.id]?.favourited ?? false"
                        :initial-vote="profilePostStatus[pinnedPost.id]?.userVote ?? 0"
                        @pin="pinPost" @unpin="unpinPost" @deleted="onPostDeleted" @updated="onPostUpdated" />
                    </div>

                    <!-- Skeleton -->
                    <div v-if="isLoadingTab" class="stack-y-3">
                      <div v-for="n in 3" :key="n" class="h-28 bg-brand-bg border border-brand-border rounded-2xl animate-pulse"></div>
                    </div>

                    <!-- Posts empty → show repaws fallback, or CTA -->
                    <template v-else-if="activeContentTab === 'posts' && tabPosts.filter((p) => p.id !== viewedProfile?.pinned_post_id).length === 0 && !pinnedPost">
                      <template v-if="repawsFallback.length">
                        <div class="flex items-center gap-2 text-xs text-white/55 font-semibold mb-1 px-1">
                          <BIcon name="Repeat2" class="w-3.5 h-3.5 text-brand-accent" /> {{ langStore.t.profileNoPostsShowingRepaws }}
                        </div>
                        <PostCard v-for="post in repawsFallback" :key="post.id"
                          :post="post" :is-own-profile="isOwnProfile"
                          :is-pinned-post-id="viewedProfile.pinned_post_id"
                          :show-repaw-label="true"
                          :group-context="post.groupPosts?.[0]?.group ?? null"
                          :ad-mode="false"
                          :initial-repawed="profilePostStatus[post.id]?.repawed ?? false"
                          :initial-favourited="profilePostStatus[post.id]?.favourited ?? false"
                          :initial-vote="profilePostStatus[post.id]?.userVote ?? 0"
                          @pin="pinPost" @unpin="unpinPost" @deleted="onPostDeleted" @updated="onPostUpdated" />
                      </template>
                      <div v-else class="py-14 text-center text-white/55">
                        <BIcon name="FileText" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p class="font-semibold text-sm mb-4">{{ langStore.t.noPostsLabel }}</p>
                        <button v-if="isOwnProfile" @click="showPostForm = true; $nextTick(scrollToTop)"
                          class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-brand-accent/20">
                          <BIcon name="Plus" class="w-4 h-4" /> {{ langStore.t.profileCreateFirstPostBtn }}
                        </button>
                      </div>
                    </template>

                    <!-- Archive empty -->
                    <div v-else-if="activeContentTab === 'archive' && tabPosts.length === 0" class="py-14 text-center text-white/55">
                      <BIcon name="Archive" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p class="font-semibold text-sm">{{ langStore.t.profileArchiveEmptyLabel }}</p>
                    </div>

                    <!-- Posts / repaws / archive list -->
                    <template v-else>
                      <PostCard v-for="post in tabPosts.filter((p) => p.id !== viewedProfile?.pinned_post_id)" :key="post.id"
                        :post="post" :is-own-profile="isOwnProfile"
                        :is-pinned-post-id="viewedProfile.pinned_post_id"
                        :show-repaw-label="activeContentTab === 'repaws'"
                        :group-context="activeContentTab === 'repaws' ? (post.groupPosts?.[0]?.group ?? null) : null"
                        :ad-mode="false"
                        :initial-repawed="profilePostStatus[post.id]?.repawed ?? false"
                        :initial-favourited="profilePostStatus[post.id]?.favourited ?? false"
                        :initial-vote="profilePostStatus[post.id]?.userVote ?? 0"
                        @pin="pinPost" @unpin="unpinPost" @deleted="onPostDeleted" @updated="onPostUpdated" />
                    </template>
                  </template>

                  <!-- MEDIA -->
                  <div v-else-if="activeContentTab === 'media'" @click="mediaTagTarget = null">
                    <AlbumsPanel :user-id="viewedProfile.id" :can-create="isOwnProfile" :builtin="builtinAlbums" :builtin-loading="isLoadingTab" :nsfw-mode="nsfwMode" @click.stop />
                    <!-- Панель фильтров + режим альбомов -->
                    <div class="flex items-center gap-2 mb-4 flex-wrap">
                      <button v-for="f in (['all','photo','video'] as const)" :key="f" @click="mediaFilter = f"
                        class="px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all"
                        :class="mediaFilter === f ? 'bg-brand-accent border-brand-accent text-white' : 'border-brand-border text-white/55 hover:text-white'">
                        {{ f === 'all' ? `${langStore.t.tabAll} · ${filteredMediaPosts.length}` : f === 'photo' ? `${langStore.t.feedPhoto} · ${tabPosts.filter((p) => isImage(p.media_urls?.[0] ?? '')).length}` : `${langStore.t.profileMediaFilterVideoLabel} · ${tabPosts.filter((p) => !isImage(p.media_urls?.[0] ?? '')).length}` }}
                      </button>
                      <div class="flex-1" />
                    </div>

                    <!-- Скелетон при загрузке -->
                    <div v-if="isLoadingTab" class="grid grid-cols-3 gap-1.5">
                      <div v-for="n in 9" :key="n" class="aspect-square bg-brand-bg border border-brand-border rounded-xl animate-pulse"></div>
                    </div>

                    <!-- Пусто -->
                    <div v-else-if="!filteredMediaPosts.length" class="py-14 text-center text-white/55">
                      <BIcon name="Image" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p class="font-semibold text-sm">{{ langStore.t.noMediaYet }}</p>
                    </div>

                    <template v-else>
                      <!-- ══ Обычная сетка ════════════════════════════════════════ -->
                      <div class="grid grid-cols-3 gap-1.5">
                        <div v-for="(post, idx) in filteredMediaPosts" :key="post.id"
                          class="relative aspect-square rounded-xl overflow-hidden cursor-pointer group border border-brand-border/60 hover:border-brand-accent/60 bg-brand-bg transition-all">
                          <div @click.stop="openMediaLightbox(post.media_urls[0], filteredMediaPosts.map((p) => p.media_urls[0]), idx)"
                            class="absolute inset-0">
                            <img v-if="isImage(post.media_urls[0])" :src="post.media_urls[0]" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                            <div v-else class="w-full h-full flex items-center justify-center bg-brand-bg/60">
                              <BIcon name="Play" class="w-8 h-8 text-white/55" />
                            </div>
                          </div>
                          <!-- Тег-ярлык -->
                          <div v-if="mediaPostLabels[post.id]"
                            class="absolute top-1 left-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-brand-accent/80 text-white backdrop-blur-xs pointer-events-none">
                            {{ mediaPostLabels[post.id] === 'fursona' ? '🐾' : '🦊' }}
                          </div>
                          <div v-if="post.media_urls.length > 1" class="absolute top-1.5 right-1.5 bg-black/70 rounded-lg px-1.5 py-0.5 text-[10px] text-white font-bold backdrop-blur-xs">+{{ post.media_urls.length - 1 }}</div>
                          <!-- Кнопка добавить в альбом (только свой профиль) -->
                          <button v-if="isOwnProfile" type="button"
                            @click.stop="mediaTagTarget = mediaTagTarget === post.id ? null : post.id"
                            class="absolute bottom-1 right-1 w-6 h-6 rounded-lg bg-black/60 border border-white/15 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-brand-accent/70">
                            <BIcon name="FolderPlus" class="w-3 h-3 text-white" />
                          </button>
                          <!-- Попап выбора альбома -->
                          <div v-if="mediaTagTarget === post.id"
                            class="absolute bottom-8 right-1 z-20 flex flex-col gap-1 p-1.5 rounded-xl bg-brand-card border border-brand-border shadow-xl min-w-[100px]"
                            @click.stop>
                            <button @click.stop="setMediaLabel(post.id, 'fursona')"
                              class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold text-white/80 hover:bg-brand-accent/15 hover:text-brand-accent transition-all"
                              :class="mediaPostLabels[post.id] === 'fursona' ? 'bg-brand-accent/15 text-brand-accent' : ''">
                              🐾 {{ langStore.t.fursonaTab }}
                            </button>
                            <button @click.stop="setMediaLabel(post.id, 'fursuit')"
                              class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold text-white/80 hover:bg-brand-accent/15 hover:text-brand-accent transition-all"
                              :class="mediaPostLabels[post.id] === 'fursuit' ? 'bg-brand-accent/15 text-brand-accent' : ''">
                              🦊 {{ langStore.t.fursuitTab }}
                            </button>
                            <button v-if="mediaPostLabels[post.id]" @click.stop="setMediaLabel(post.id, null)"
                              class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] font-bold text-white/40 hover:text-rose-400 hover:bg-rose-500/10 transition-all">
                              <BIcon name="X" class="w-3 h-3" /> {{ langStore.t.removeLabelOrder }}
                            </button>
                          </div>
                          <div class="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                            <BIcon name="ZoomIn" class="w-6 h-6 text-white" />
                          </div>
                        </div>
                      </div>
                    </template>
                  </div>

                  <!-- FOLLOWERS -->
                  <div v-else-if="activeContentTab === 'followers'">
                    <div v-if="isLoadingTab" class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      <div v-for="n in 6" :key="n" class="h-24 bg-brand-bg border border-brand-border rounded-2xl animate-pulse"></div>
                    </div>
                    <div v-else-if="friendsListRestricted" class="py-14 text-center text-white/55">
                      <BIcon name="Lock" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p class="font-semibold text-sm mb-1">{{ langStore.t.profileListHiddenByPrivacy }}</p>
                    </div>
                    <div v-else-if="!followers.length" class="py-14 text-center text-white/55">
                      <BIcon name="Users" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p class="font-semibold text-sm mb-1">{{ langStore.t.noFollowersLabel }}</p>
                      <p class="text-xs opacity-70">{{ langStore.t.profileNoFollowersHint }}</p>
                    </div>
                    <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      <router-link v-for="follower in followers" :key="follower.id" :to="'/profile/' + follower.username"
                        class="flex flex-col items-center gap-2 p-3 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-accent/50 transition-all group">
                        <img :src="follower.avatar_url || '/icons/badges/NN.jpg'" class="w-12 h-12 rounded-full object-cover" @error="onAvatarError" />
                        <div class="text-center min-w-0 w-full">
                          <p class="text-xs font-bold text-white truncate group-hover:text-brand-accent transition-colors">{{ follower.display_name || follower.username }}</p>
                          <p class="text-[10px] text-white/55 truncate">@{{ follower.username }}</p>
                        </div>
                      </router-link>
                    </div>
                  </div>

                  <!-- FOLLOWING -->
                  <div v-else-if="activeContentTab === 'following'">
                    <div v-if="isLoadingTab" class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      <div v-for="n in 6" :key="n" class="h-24 bg-brand-bg border border-brand-border rounded-2xl animate-pulse"></div>
                    </div>
                    <div v-else-if="friendsListRestricted" class="py-14 text-center text-white/55">
                      <BIcon name="Lock" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p class="font-semibold text-sm mb-1">{{ langStore.t.profileListHiddenByPrivacy }}</p>
                    </div>
                    <div v-else-if="!following.length" class="py-14 text-center text-white/55">
                      <BIcon name="UserPlus" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p class="font-semibold text-sm mb-1">{{ langStore.t.emptyFollowing }}</p>
                      <p class="text-xs opacity-70">{{ langStore.t.profileNoFollowingHint }}</p>
                    </div>
                    <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      <router-link v-for="user in following" :key="user.id" :to="'/profile/' + user.username"
                        class="flex flex-col items-center gap-2 p-3 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-accent/50 transition-all group">
                        <img :src="user.avatar_url || '/icons/badges/NN.jpg'" class="w-12 h-12 rounded-full object-cover" @error="onAvatarError" />
                        <div class="text-center min-w-0 w-full">
                          <p class="text-xs font-bold text-white truncate group-hover:text-brand-accent transition-colors">{{ user.display_name || user.username }}</p>
                          <p class="text-[10px] text-white/55 truncate">@{{ user.username }}</p>
                        </div>
                      </router-link>
                    </div>
                  </div>

                  <!-- MUTUAL GROUPS -->
                  <div v-else-if="activeContentTab === 'mutual_groups'">
                    <div v-if="isLoadingTab" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div v-for="n in 4" :key="n" class="h-20 bg-brand-bg border border-brand-border rounded-2xl animate-pulse"></div>
                    </div>
                    <div v-else-if="!mutualGroups.length" class="py-14 text-center text-white/55">
                      <BIcon name="Users" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p class="font-semibold text-sm mb-1">{{ langStore.t.profileNoMutualGroupsLabel }}</p>
                      <p class="text-xs opacity-70">{{ langStore.t.profileNoMutualGroupsHint }}</p>
                    </div>
                    <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <router-link v-for="group in mutualGroups" :key="group.id" :to="'/groups/' + group.slug"
                        class="flex items-center gap-3 p-3 bg-brand-bg border border-brand-border rounded-2xl hover:border-brand-accent/50 transition-all group">
                        <img v-if="group.avatar_url" :src="group.avatar_url" class="w-10 h-10 rounded-xl object-cover shrink-0" @error="onAvatarError" />
                        <div v-else class="w-10 h-10 rounded-xl bg-brand-accent/15 flex items-center justify-center shrink-0">
                          <BIcon name="Users" class="w-5 h-5 text-brand-accent" />
                        </div>
                        <div class="min-w-0">
                          <p class="text-xs font-bold text-white truncate group-hover:text-brand-accent transition-colors">{{ group.name }}</p>
                          <p class="text-[10px] text-white/55">{{ group.members_count }} {{ langStore.t.membersUnit }}</p>
                        </div>
                      </router-link>
                    </div>
                  </div>

                  <!-- STATS (Lite+) -->
                  <div v-else-if="activeContentTab === 'stats'">
                    <div v-if="authStore.user?.subscription_tier === 'free'"
                      class="py-14 text-center text-white/55">
                      <BIcon name="Lock" class="w-10 h-10 mx-auto mb-3 text-amber-400 opacity-70" />
                      <p class="font-semibold text-sm mb-1 text-white/80">{{ langStore.t.statsLockedMsg }}
                        <router-link to="/subscriptions" class="text-amber-400 hover:underline font-bold">Lite</router-link>.</p>
                    </div>
                    <div v-else-if="isLoadingTab" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div v-for="n in 4" :key="n" class="h-20 bg-brand-bg border border-brand-border rounded-2xl animate-pulse"></div>
                    </div>
                    <div v-else>
                      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                        <div class="p-4 bg-brand-bg border border-brand-border rounded-2xl text-center">
                          <p class="text-xl font-extrabold text-white">{{ profileStatsData?.totalFriends ?? 0 }}</p>
                          <p class="text-[10px] text-white/55 mt-1">{{ langStore.t.statTotalFriends }}</p>
                        </div>
                        <div class="p-4 bg-brand-bg border border-brand-border rounded-2xl text-center">
                          <p class="text-xl font-extrabold text-brand-accent">+{{ profileStatsData?.newFriendsLast30Days ?? 0 }}</p>
                          <p class="text-[10px] text-white/55 mt-1">{{ langStore.t.statNewFriends30d }}</p>
                        </div>
                        <div class="p-4 bg-brand-bg border border-brand-border rounded-2xl text-center">
                          <p class="text-xl font-extrabold text-white">{{ profileStatsData?.totalPosts ?? 0 }}</p>
                          <p class="text-[10px] text-white/55 mt-1">{{ langStore.t.statTotalPosts }}</p>
                        </div>
                        <div class="p-4 bg-brand-bg border border-brand-border rounded-2xl text-center">
                          <p class="text-xl font-extrabold text-white">{{ profileStatsData?.totalViews ?? 0 }}</p>
                          <p class="text-[10px] text-white/55 mt-1">{{ langStore.t.statTotalViews }}</p>
                        </div>
                      </div>
                      <div v-if="profileStatsData?.topPost">
                        <p class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2">{{ langStore.t.statTopPost }}</p>
                        <PostCard :post="profileStatsData.topPost" />
                      </div>
                      <div v-else class="py-14 text-center text-white/55">
                        <BIcon name="BarChart3" class="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p class="font-semibold text-sm mb-1">{{ langStore.t.profileNoPublicationsYet }}</p>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

            </div>
            <!-- / CENTER COLUMN -->

            <!-- ── LIGHTBOX (глобальный) ──────────────────────────────── -->
            <Teleport to="body">
              <Transition name="lightbox-fade">
                <div v-if="lightboxUrl" class="fixed inset-0 z-9999 flex items-center justify-center"
                  @click.self="closeLightbox" style="background:rgba(0,0,0,0.93)">
                  <button @click="closeLightbox"
                    class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all z-10 backdrop-blur-xs border border-white/15">
                    <BIcon name="X" class="w-5 h-5" />
                  </button>
                  <button v-if="lightboxIndex > 0" @click.stop="lightboxStep(-1)"
                    class="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all z-10 backdrop-blur-xs border border-white/15">
                    <BIcon name="ChevronLeft" class="w-5 h-5" />
                  </button>
                  <button v-if="lightboxIndex < lightboxList.length - 1" @click.stop="lightboxStep(1)"
                    class="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all z-10 backdrop-blur-xs border border-white/15">
                    <BIcon name="ChevronRight" class="w-5 h-5" />
                  </button>
                  <div class="max-w-[90vw] max-h-[90vh] flex items-center justify-center overflow-hidden">
                    <Transition :name="lightboxDir > 0 ? 'lightbox-slide-next' : 'lightbox-slide-prev'" mode="out-in">
                      <img v-if="isImage(lightboxUrl)" :key="lightboxUrl" :src="lightboxUrl"
                        class="max-w-full max-h-[90vh] object-contain rounded-2xl shadow-2xl select-none"
                        style="box-shadow:0 0 80px rgba(0,0,0,0.8)" draggable="false" />
                      <video v-else :key="lightboxUrl" :src="lightboxUrl" controls class="max-w-full max-h-[90vh] rounded-2xl shadow-2xl"></video>
                    </Transition>
                  </div>
                  <div v-if="lightboxList.length > 1"
                    class="absolute bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-white/70 text-xs font-bold backdrop-blur-xs">
                    {{ lightboxIndex + 1 }} / {{ lightboxList.length }}
                  </div>
                </div>
              </Transition>
            </Teleport>

            <!-- ── RIGHT SIDEBAR ────────────────────────────────────────── -->
            <div v-sticky-bottom class="hidden xl:flex flex-col gap-3 w-72 shrink-0 sticky top-24 self-start">

              <!-- Stats: 3-column grid, clicks open modals -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="grid grid-cols-3 divide-x divide-brand-border/60">
                  <button @click="showFollowingModal = true"
                    class="flex flex-col items-center gap-1 py-4 px-2 hover:bg-brand-bg/60 transition-all group cursor-pointer">
                    <span class="text-lg font-extrabold text-white group-hover:text-brand-accent transition-colors leading-none">{{ viewedProfile?._count?.following ?? following.length }}</span>
                    <span class="text-[10px] text-white/45 font-medium text-center leading-tight mt-0.5">{{ langStore.t.tabFollowing }}</span>
                  </button>
                  <button @click="showFollowersModal = true"
                    class="flex flex-col items-center gap-1 py-4 px-2 hover:bg-brand-bg/60 transition-all group cursor-pointer">
                    <span class="text-lg font-extrabold text-white group-hover:text-brand-accent transition-colors leading-none">{{ viewedProfile?._count?.followers ?? followers.length }}</span>
                    <span class="text-[10px] text-white/45 font-medium text-center leading-tight mt-0.5">{{ langStore.t.tabFollowers }}</span>
                  </button>
                  <div class="flex flex-col items-center gap-1 py-4 px-2">
                    <span class="text-lg font-extrabold text-white leading-none">{{ viewedProfile?.likes_count ?? 0 }}</span>
                    <span class="text-[10px] text-white/45 font-medium text-center leading-tight mt-0.5">{{ langStore.t.adminLikesLabel }}</span>
                  </div>
                </div>
              </div>

              <!-- Groups: count + preview cards -->
              <div v-if="isOwnProfile || !userGroupsHidden" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <button @click="openGroupsModal"
                  class="w-full flex items-center justify-between gap-2 px-4 py-3 hover:bg-brand-bg/60 transition-all group cursor-pointer">
                  <span class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/55">
                    <BIcon name="Users" class="w-4 h-4 text-brand-accent" />
                    {{ langStore.t.groups }}
                  </span>
                  <span class="flex items-center gap-1.5">
                    <span class="text-sm font-extrabold text-white group-hover:text-brand-accent transition-colors">{{ groupsCount }}</span>
                    <BIcon name="ChevronRight" class="w-3.5 h-3.5 text-white/35" />
                  </span>
                </button>
                <div v-if="userGroupsList.length" class="px-3 pb-3 stack-y-1.5">
                  <router-link v-for="group in userGroupsList.slice(0, 3)" :key="group.id" :to="'/groups/' + group.slug"
                    class="flex items-center gap-3 px-2.5 py-2 rounded-2xl border border-brand-border/60 bg-brand-bg/40 hover:border-brand-accent/40 hover:bg-brand-bg transition-all group/item">
                    <img v-if="group.avatar_url" :src="group.avatar_url" class="w-9 h-9 rounded-xl object-cover shrink-0" @error="onAvatarError" />
                    <div v-else class="w-9 h-9 rounded-xl bg-brand-accent/15 flex items-center justify-center shrink-0">
                      <BIcon name="Users" class="w-4 h-4 text-brand-accent" />
                    </div>
                    <div class="min-w-0">
                      <p class="text-sm font-bold text-white truncate group-hover/item:text-brand-accent transition-colors">{{ group.name }}</p>
                      <p class="text-[10px] text-white/45">{{ group.members_count }} {{ langStore.t.membersUnit }}</p>
                    </div>
                  </router-link>
                  <button v-if="userGroupsList.length > 3" @click="openGroupsModal"
                    class="w-full text-center text-[11px] font-semibold text-white/45 hover:text-brand-accent transition-colors py-1">
                    Показать все
                  </button>
                </div>
              </div>

              <!-- Status block -->
              <div v-if="isOwnProfile || hasActiveStatus" class="stack-y-2">

                <!-- Status -->
                <div class="relative border rounded-2xl transition-all overflow-hidden"
                  :class="isOwnProfile ? 'cursor-pointer group hover:shadow-lg' : ''"
                  :style="{ backgroundColor: `${statusBubbleColor}14`, borderColor: `${statusBubbleColor}45`, boxShadow: hasActiveStatus ? `0 0 0 1px ${statusBubbleColor}20` : 'none' }"
                  @click="isOwnProfile ? openStatusEdit() : null">
                  <div class="flex items-center gap-3 px-4 py-3">
                    <div class="relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-base overflow-hidden"
                      :style="{ background: hasActiveStatus ? statusBubbleGradient : `${statusBubbleColor}20`, border: `1px solid ${statusBubbleColor}50` }">
                      <span v-if="profileStatus.emoji">{{ profileStatus.emoji }}</span>
                      <BIcon v-else-if="hasActiveStatus" name="Music" class="w-4 h-4 text-white/90" />
                      <BIcon v-else name="Smile" class="w-4 h-4 text-white/30" />
                      <span v-if="hasActiveStatus" class="absolute inset-0 rounded-xl status-icon-glow" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-1.5">
                        <p class="text-[10px] font-bold text-white/35 uppercase tracking-wider">{{ langStore.t.profileStatusLabel }}</p>
                        <span v-if="hasActiveStatus && statusTimeRemaining" class="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full bg-brand-bg text-white/35 border border-brand-border">
                          <BIcon name="Clock" class="w-2.5 h-2.5" />{{ statusTimeRemaining }}</span>
                      </div>
                      <p v-if="profileStatus.text" class="text-sm font-semibold text-white truncate">{{ profileStatus.text }}</p>
                      <p v-else-if="profileStatus.music" class="text-sm font-semibold text-white truncate">{{ profileStatus.music.artist }} — {{ profileStatus.music.title }}</p>
                      <p v-else-if="isOwnProfile" class="text-sm text-white/30">{{ langStore.t.profileAddStatusPlaceholderLabel }}</p>
                    </div>
                    <button v-if="isOwnProfile"
                      class="w-7 h-7 flex items-center justify-center rounded-lg text-white/25 group-hover:text-brand-accent transition-colors shrink-0">
                      <BIcon name="Pencil" class="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <!-- Music attached to status -->
                  <div v-if="profileStatus.music" class="flex items-center gap-2.5 px-4 py-2.5 border-t border-brand-border/50 bg-brand-bg/30 hover:bg-brand-bg/50 transition-colors cursor-pointer"
                    @click.stop="toggleStatusMusicPreview">
                    <div class="relative w-8 h-8 rounded-lg overflow-hidden shrink-0 shadow-sm">
                      <img v-if="profileStatus.music.artworkUrl" :src="profileStatus.music.artworkUrl" class="w-full h-full object-cover" />
                      <div class="absolute inset-0 flex items-center justify-center bg-black/35 hover:bg-black/50 transition-colors">
                        <BIcon :name="isStatusMusicPlaying ? 'Pause' : 'Play'" class="w-3 h-3 text-white" />
                      </div>
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-[10px] font-bold text-white/60 truncate">{{ profileStatus.music.title }}</p>
                      <p class="text-[9px] text-white/35 truncate">{{ profileStatus.music.artist }}</p>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0" @click.stop>
                      <BIcon name="Volume2" class="w-3 h-3 text-white/30" />
                      <input type="range" min="0" max="1" step="0.05" :value="statusPreviewVolume" @input="setStatusMusicVolume"
                        class="w-14 status-volume-slider"
                        :style="{ '--slider-fill': `${statusPreviewVolume * 100}%`, '--slider-color': statusBubbleColor }" />
                    </div>
                  </div>
                </div>

              </div>

              <!-- Wallet card (own profile only) -->
              <div v-if="isOwnProfile" @click="openWalletModal()"
                class="relative overflow-hidden bg-linear-to-br/srgb from-brand-accent/15 to-brand-accent-plus/15 border border-brand-accent/25 hover:border-brand-accent/50 rounded-3xl shadow-xl p-4 cursor-pointer transition-all hover:scale-[1.01] group">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <div class="w-7 h-7 rounded-xl bg-brand-accent/20 flex items-center justify-center">
                      <BIcon name="Wallet" class="w-3.5 h-3.5 text-brand-accent" />
                    </div>
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ langStore.t.walletLabel }}</p>
                  </div>
                  <BIcon name="ChevronRight" class="w-4 h-4 text-white/55 group-hover:text-brand-accent transition-colors" />
                </div>
                <div class="flex items-baseline gap-1.5">
                  <span class="text-2xl font-extrabold text-white leading-none">
                    {{ Number(viewedProfile?.wallet?.balance ?? 0).toFixed(2) }}
                  </span>
                  <span class="text-xs font-semibold text-brand-accent-minus">BLM</span>
                </div>
                <p class="flex items-center gap-1 text-[10px] text-white/55 mt-1">
                  <BIcon name="Flower2" class="w-3 h-3" /> {{ langStore.t.internalCurrency }}
                </p>
              </div>

              <!-- Info card -->
              <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="px-4 pt-3.5 pb-2 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <BIcon name="Info" class="w-3.5 h-3.5 text-brand-accent" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ langStore.t.informationLabel }}</p>
                  </div>
                  <button v-if="isOwnProfile" @click="openEditModal('contacts')"
                    class="w-6 h-6 flex items-center justify-center rounded-lg text-white/55 hover:text-brand-accent hover:bg-brand-bg transition-all">
                    <BIcon name="Pencil" class="w-3 h-3" />
                  </button>
                </div>
                <div class="px-2 pb-2 stack-y-0.5">
                  <!-- Birth date -->
                  <div v-if="formattedBirthDate" class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <BIcon name="Cake" class="w-4 h-4 text-pink-400/70 shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-white/55 uppercase tracking-wide">{{ langStore.t.birthdayLabel }}</p>
                      <p class="text-xs text-brand-offwhite font-semibold truncate">{{ formattedBirthDate }}</p>
                    </div>
                  </div>
                  <!-- Join date -->
                  <div class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all">
                    <BIcon name="Calendar" class="w-4 h-4 text-white/40 shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-white/55 uppercase tracking-wide">{{ langStore.t.memberSince }}</p>
                      <p class="text-xs text-white/55">{{ joinDate }}</p>
                    </div>
                  </div>
                  <!-- Website -->
                  <a v-if="viewedProfile.website" :href="websiteHref(viewedProfile.website)" target="_blank" rel="noopener noreferrer"
                    class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all group">
                    <BIcon name="Link" class="w-4 h-4 text-brand-accent/60 shrink-0" />
                    <div class="min-w-0">
                      <p class="text-[10px] text-white/55 uppercase tracking-wide">{{ langStore.t.profileWebsiteShortLabel }}</p>
                      <p class="text-xs text-brand-accent font-medium truncate group-hover:underline">{{ viewedProfile.website.replace(/^https?:\/\//, '') }}</p>
                    </div>
                  </a>
                  <!-- Отношения, фурсона и местоимения уже показаны в вкладке «О себе» — не дублируем их здесь -->
                </div>
              </div>

              <!-- Social links -->
              <div v-if="activeSocialLinks.length || isOwnProfile"
                class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <div class="px-4 pt-3.5 pb-2 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <BIcon name="AtSign" class="w-3.5 h-3.5 text-brand-accent" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ langStore.t.socialNetworksLabel }}</p>
                  </div>
                  <button v-if="isOwnProfile" @click="openEditModal('socials')"
                    class="w-6 h-6 flex items-center justify-center rounded-lg text-white/55 hover:text-brand-accent hover:bg-brand-bg transition-all">
                    <BIcon name="Pencil" class="w-3 h-3" />
                  </button>
                </div>
                <div v-if="activeSocialLinks.length" class="px-2 pb-2 stack-y-0.5">
                  <a v-for="net in activeSocialLinks" :key="net.key"
                    :href="safeHref(socialUrl(net.key, viewedProfile.social_links?.[net.key] ?? ''))" target="_blank" rel="noopener noreferrer"
                    class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-bg transition-all group">
                    <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      :style="{ backgroundColor: net.color + '22' }">
                      <BIcon :name="net.iconName" class="w-3.5 h-3.5" :style="{ color: net.color }" />
                    </div>
                    <div class="min-w-0">
                      <p class="text-[10px] text-white/55 uppercase tracking-wide">{{ net.label }}</p>
                      <p class="text-xs text-brand-offwhite font-medium truncate group-hover:text-white">{{ viewedProfile.social_links?.[net.key] }}</p>
                    </div>
                  </a>
                </div>
                <div v-else class="px-4 pb-4 text-center">
                  <p class="text-xs text-white/35">{{ langStore.t.noSocialsAdded }}</p>
                  <button @click="openEditModal('socials')"
                    class="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-brand-accent/10 hover:bg-brand-accent/20 text-brand-accent border border-brand-accent/30 rounded-xl transition-all">
                    <BIcon name="Plus" class="w-3 h-3" /> {{ langStore.t.addButton }}
                  </button>
                </div>
              </div>

              <!-- Badges -->
              <div v-if="achievementBadges.length" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
                <button @click="showBadgesModal = true" class="w-full px-4 pt-3.5 pb-2 flex items-center justify-between hover:bg-brand-bg/30 transition-colors">
                  <div class="flex items-center gap-2">
                    <BIcon name="Award" class="w-3.5 h-3.5 text-yellow-400" />
                    <p class="text-[11px] font-bold uppercase tracking-widest text-white/55">{{ langStore.t.profileBadgesTitle }}</p>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span class="text-[11px] font-bold bg-brand-accent/15 text-brand-accent px-2 py-0.5 rounded-full">{{ achievementBadges.length }}</span>
                    <BIcon name="ChevronRight" class="w-3.5 h-3.5 text-white/55" />
                  </div>
                </button>
                <div class="px-2 pb-2 stack-y-0.5">
                  <div v-for="badge in achievementBadges" :key="badge.key"
                    class="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-brand-bg/60 transition-all group cursor-default">
                    <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 overflow-hidden transition-transform group-hover:scale-110" :class="badge.iconImg ? '' : badge.iconBg">
                      <img v-if="badge.iconImg" :src="badge.iconImg" :alt="badge.label" class="w-full h-full object-cover" />
                      <component :is="badge.iconComp" v-else class="w-3.5 h-3.5" :class="badge.iconColor" />
                    </div>
                    <div class="min-w-0">
                      <p class="text-xs font-bold text-white leading-tight truncate">{{ badge.label }}</p>
                      <p class="text-[10px] text-white/55 leading-tight mt-0.5 truncate">{{ badge.desc }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- TrustScore card (only for activity participants) -->
              <TrustScoreCard v-if="viewedProfile?.id" :user-id="viewedProfile.id" />

            </div>
            <!-- / RIGHT SIDEBAR -->

          </div>
          <!-- / TWO-COLUMN -->

        </template>
      </main>

    </div>

    <!-- ─── Story Viewer ─────────────────────────────────────────────── -->
    <StoryViewer
      v-if="profileStoryViewerOpen && profileStories.length"
      :groups="[profileStories]"
      :group-index="0"
      :story-index="0"
      @close="profileStoryViewerOpen = false"
    />

    <!-- ─── Avatar Gallery Modal ──────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showAvatarViewer"
        class="fixed inset-0 z-600 bg-black/60 backdrop-blur-xs flex flex-col"
        @click="showAvatarViewer = false">

        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 shrink-0" @click.stop>
          <div class="flex items-center gap-3">
            <span class="text-white font-bold text-base min-w-0 max-w-full truncate">
              {{ viewedProfile?.display_name || viewedProfile?.username }}
            </span>
            <span v-if="avatarGallery.length > 1" class="text-white/40 text-sm tabular-nums">
              {{ avatarGalleryIndex + 1 }} / {{ avatarGallery.length }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <!-- Restore button (owner only, not on current avatar) -->
            <button
              v-if="isOwnProfile && avatarGalleryIndex > 0 && !avatarGalleryRestoring"
              @click="restoreGalleryAvatar"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-accent/20 border border-brand-accent/40 text-brand-accent text-sm font-semibold hover:bg-brand-accent/30 transition-all">
              <BIcon name="RotateCcw" class="w-4 h-4" />
              {{ langStore.t.profileMakeCurrentBtn }}
            </button>
            <span v-if="avatarGalleryRestoring" class="w-5 h-5 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
            <!-- Delete button (owner only, not on current avatar) -->
            <button
              v-if="isOwnProfile && avatarGalleryIndex > 0"
              @click="deleteGalleryAvatar"
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/25 transition-all">
              <BIcon name="Trash2" class="w-4 h-4" />
              {{ langStore.t.deleteBtn }}
            </button>
            <button @click="showAvatarViewer = false"
              class="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all">
              <BIcon name="X" class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- Main image area -->
        <div class="flex-1 flex items-center justify-center relative min-h-0 px-16">
          <!-- Prev -->
          <button
            v-if="avatarGallery.length > 1"
            @click.stop="avatarGalleryIndex = Math.max(0, avatarGalleryIndex - 1)"
            :disabled="avatarGalleryIndex === 0"
            class="absolute left-3 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all disabled:opacity-20 disabled:cursor-not-allowed z-10">
            <BIcon name="ChevronLeft" class="w-6 h-6" />
          </button>

          <div class="w-full h-full flex items-center justify-center">
            <div v-if="avatarGalleryLoading" class="flex flex-col items-center gap-3">
              <span class="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              <span class="text-white/40 text-sm">{{ langStore.t.loadingBtn }}</span>
            </div>
            <video
              v-else-if="avatarGallery[avatarGalleryIndex]?.video_url"
              :src="avatarGallery[avatarGalleryIndex].video_url!"
              :key="avatarGallery[avatarGalleryIndex].video_url!"
              class="max-w-full max-h-full rounded-3xl object-contain shadow-2xl select-none"
              style="max-height: calc(100vh - 200px)"
              autoplay loop muted playsinline controls
            />
            <img
              v-else-if="avatarGallery[avatarGalleryIndex]"
              :src="avatarGallery[avatarGalleryIndex].url"
              :key="avatarGallery[avatarGalleryIndex].url"
              class="max-w-full max-h-full rounded-3xl object-contain shadow-2xl select-none"
              style="max-height: calc(100vh - 200px)"
              draggable="false"
            />
          </div>

          <!-- Next -->
          <button
            v-if="avatarGallery.length > 1"
            @click.stop="avatarGalleryIndex = Math.min(avatarGallery.length - 1, avatarGalleryIndex + 1)"
            :disabled="avatarGalleryIndex === avatarGallery.length - 1"
            class="absolute right-3 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-all disabled:opacity-20 disabled:cursor-not-allowed z-10">
            <BIcon name="ChevronRight" class="w-6 h-6" />
          </button>
        </div>

        <!-- Thumbnail strip -->
        <div v-if="avatarGallery.length > 1" class="shrink-0 px-4 pb-5 pt-3" @click.stop>
          <div class="flex gap-2 overflow-x-auto justify-center">
            <button
              v-for="(item, idx) in avatarGallery" :key="item.url"
              @click="avatarGalleryIndex = idx"
              class="relative shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition-all"
              :class="idx === avatarGalleryIndex ? 'border-white scale-105' : 'border-transparent opacity-50 hover:opacity-80'">
              <img :src="item.url" class="w-full h-full object-cover" loading="lazy" />
              <span v-if="item.video_url" class="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-black/70 rounded-full flex items-center justify-center pointer-events-none">
                <svg viewBox="0 0 24 24" class="w-2 h-2 text-white" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </span>
            </button>
          </div>
          <!-- Date label -->
          <p v-if="avatarGallery[avatarGalleryIndex]" class="text-center text-white/35 text-xs mt-2">
            <span v-if="avatarGalleryIndex === 0">{{ langStore.t.profileCurrentAvatarLabel }}</span>
            <span v-else>{{ new Date(avatarGallery[avatarGalleryIndex].created_at).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { day: 'numeric', month: 'long', year: 'numeric' }) }}</span>
          </p>
        </div>
      </div>
    </Transition>

    <!-- ─── Album Modal ────────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="openAlbum" class="fixed inset-0 z-615 bg-black/60 backdrop-blur-xs flex items-center justify-center px-4" @click.self="openAlbum = null">
        <div class="w-full max-w-4xl bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border shrink-0">
            <div class="flex items-center gap-2.5">
              <span v-if="openAlbum.emoji" class="text-xl leading-none">{{ openAlbum.emoji }}</span>
              <BIcon v-else name="CalendarDays" class="w-5 h-5 text-brand-accent" />
              <h3 class="font-bold text-white text-base">{{ openAlbum.label }}</h3>
              <span class="text-xs font-bold bg-brand-accent/15 text-brand-accent px-2 py-0.5 rounded-full">{{ openAlbum.urls.length }}</span>
            </div>
            <button @click="openAlbum = null"
              class="w-8 h-8 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <!-- Grid -->
          <div class="overflow-y-auto flex-1 p-3">
            <div class="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              <div v-for="(item, idx) in openAlbum.urls" :key="idx"
                @click="openMediaLightbox(item.url, openAlbum!.urls.map(u => u.url), idx)"
                class="relative aspect-square rounded-xl overflow-hidden cursor-pointer group border border-brand-border/60 hover:border-brand-accent/60 bg-brand-bg transition-all">
                <img v-if="isImage(item.url)" :src="item.url"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  :class="item.is_nsfw && !nsfwMode ? 'blur-lg' : ''"
                  loading="lazy" />
                <div v-else class="w-full h-full flex items-center justify-center bg-brand-bg/60">
                  <BIcon name="Play" class="w-8 h-8 text-white/55" />
                </div>
                <span v-if="item.is_nsfw" class="absolute top-1 left-1 text-[9px] font-bold px-1 py-0.5 rounded-sm bg-rose-600/90 text-white leading-none">18+</span>
                <div class="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <BIcon name="ZoomIn" class="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ─── Fursona Reference Viewer ─────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showFursonaRefViewer" class="fixed inset-0 z-610 bg-black/92 flex items-center justify-center p-4" @click.self="showFursonaRefViewer = false">
        <div class="w-full max-w-6xl bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden">
          <div class="flex items-center justify-between px-5 py-3 border-b border-brand-border bg-linear-to-r/srgb from-brand-bg to-brand-card">
            <h3 class="text-white font-bold text-lg truncate">{{ langStore.t.profileReferenceOfLabel }} {{ profileFursona?.name || viewedProfile?.display_name }}</h3>
            <button @click="showFursonaRefViewer = false"
              class="w-9 h-9 flex items-center justify-center rounded-xl bg-brand-bg hover:bg-brand-border text-white/70 hover:text-white transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <div class="p-4 stack-y-4">
            <div class="rounded-2xl overflow-hidden border border-brand-border bg-brand-bg">
              <img :src="activeFursonaRef" class="w-full max-h-[70vh] object-contain" :alt="langStore.t.profileRefAlt" />
            </div>
            <div class="flex flex-wrap gap-2">
              <span v-if="primarySpeciesLabel" class="px-3 py-1.5 rounded-lg bg-brand-bg border border-brand-border text-xs font-semibold text-white/80">{{ primarySpeciesLabel }}</span>
              <span v-if="profileFursona?.name" class="px-3 py-1.5 rounded-lg bg-brand-bg border border-brand-border text-xs font-semibold text-white/80">{{ profileFursona.name }}</span>
              <span v-if="viewedProfile?.pronouns" class="px-3 py-1.5 rounded-lg bg-brand-bg border border-brand-border text-xs font-semibold text-white/80">{{ viewedProfile.pronouns }}</span>
            </div>
            <div v-if="fursonaRefPalette.length" class="flex flex-wrap gap-2">
              <div v-for="c in fursonaRefPalette" :key="`modal-${c}`" class="px-2 py-1 rounded-lg bg-brand-bg border border-brand-border text-[11px] font-bold text-white/80 flex items-center gap-2">
                <span class="w-3.5 h-3.5 rounded-xs border border-black/30" :style="`background:${c}`"></span>
                {{ c }}
              </div>
            </div>
            <div v-if="fursonaRefImages.length > 1" class="flex gap-2 overflow-x-auto pb-1">
              <button v-for="img in fursonaRefImages" :key="`modal-thumb-${img}`" @click="selectFursonaRef(img)"
                class="w-16 h-16 rounded-xl overflow-hidden border shrink-0 transition-all"
                :class="activeFursonaRef === img ? 'border-brand-accent' : 'border-brand-border hover:border-white/30'">
                <img :src="img" class="w-full h-full object-cover" :alt="langStore.t.profileRefThumbnailAlt" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ─── Banner Viewer Modal ─────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showBannerViewer" class="fixed inset-0 z-600 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" @click="showBannerViewer = false">
        <button @click="showBannerViewer = false"
          class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all z-10">
          <BIcon name="X" class="w-5 h-5" />
        </button>
        <img :src="viewedProfile?.banner_url ?? undefined" class="max-w-full max-h-[85vh] rounded-3xl object-contain shadow-2xl" />
      </div>
    </Transition>

    <!-- ─── Followers Modal ───────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showFollowersModal" class="fixed inset-0 z-400 bg-black/60 backdrop-blur-xs flex items-center justify-center px-4" @click.self="showFollowersModal = false">
        <div class="w-full max-w-sm bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
          <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border shrink-0">
            <div class="flex items-center gap-2.5">
              <BIcon name="Users" class="w-5 h-5 text-brand-accent" />
              <h3 class="font-bold text-white text-base">{{ langStore.t.tabFollowers }}</h3>
              <span class="text-xs font-bold bg-brand-accent/15 text-brand-accent px-2 py-0.5 rounded-full">{{ viewedProfile?._count?.followers ?? followers.length }}</span>
            </div>
            <button @click="showFollowersModal = false" class="w-8 h-8 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <div class="overflow-y-auto flex-1 p-3 stack-y-1.5">
            <div v-if="friendsListRestricted" class="py-12 text-center text-white/35 text-sm">{{ langStore.t.profileListHiddenByPrivacy }}</div>
            <div v-else-if="!followers.length" class="py-12 text-center text-white/35 text-sm">{{ langStore.t.noFollowersLabel }}</div>
            <router-link v-for="u in followers" :key="u.id" :to="'/profile/' + u.username"
              @click="showFollowersModal = false"
              class="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-brand-bg border border-transparent hover:border-brand-border transition-all group">
              <img :src="u.avatar_url || '/icons/badges/NN.jpg'" class="w-10 h-10 rounded-full object-cover shrink-0" @error="onAvatarError" />
              <div class="min-w-0">
                <p class="text-sm font-bold text-white group-hover:text-brand-accent transition-colors truncate">{{ u.display_name || u.username }}</p>
                <p class="text-xs text-white/45 truncate">@{{ u.username }}</p>
              </div>
            </router-link>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ─── Following Modal ───────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showFollowingModal" class="fixed inset-0 z-400 bg-black/60 backdrop-blur-xs flex items-center justify-center px-4" @click.self="showFollowingModal = false">
        <div class="w-full max-w-sm bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
          <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border shrink-0">
            <div class="flex items-center gap-2.5">
              <BIcon name="UserPlus" class="w-5 h-5 text-emerald-400" />
              <h3 class="font-bold text-white text-base">{{ langStore.t.tabFollowing }}</h3>
              <span class="text-xs font-bold bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full">{{ viewedProfile?._count?.following ?? following.length }}</span>
            </div>
            <button @click="showFollowingModal = false" class="w-8 h-8 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <div class="overflow-y-auto flex-1 p-3 stack-y-1.5">
            <div v-if="followingLoading" class="py-12 flex justify-center">
              <span class="w-6 h-6 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
            </div>
            <div v-else-if="friendsListRestricted" class="py-12 text-center text-white/35 text-sm">{{ langStore.t.profileListHiddenByPrivacy }}</div>
            <div v-else-if="!following.length" class="py-12 text-center text-white/35 text-sm">{{ langStore.t.emptyFollowing }}</div>
            <router-link v-for="u in following" :key="u.id" :to="'/profile/' + u.username"
              @click="showFollowingModal = false"
              class="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-brand-bg border border-transparent hover:border-brand-border transition-all group">
              <img :src="u.avatar_url || '/icons/badges/NN.jpg'" class="w-10 h-10 rounded-full object-cover shrink-0" @error="onAvatarError" />
              <div class="min-w-0">
                <p class="text-sm font-bold text-white group-hover:text-brand-accent transition-colors truncate">{{ u.display_name || u.username }}</p>
                <p class="text-xs text-white/45 truncate">@{{ u.username }}</p>
              </div>
            </router-link>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ─── Groups Modal ─────────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showGroupsModal" class="fixed inset-0 z-400 bg-black/60 backdrop-blur-xs flex items-center justify-center px-4" @click.self="showGroupsModal = false">
        <div class="w-full max-w-sm bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
          <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border shrink-0">
            <div class="flex items-center gap-2.5">
              <BIcon name="Users" class="w-5 h-5 text-brand-accent" />
              <h3 class="font-bold text-white text-base">{{ langStore.t.groups }}</h3>
              <span class="text-xs font-bold bg-brand-accent/15 text-brand-accent px-2 py-0.5 rounded-full">{{ userGroupsCount }}</span>
            </div>
            <button @click="showGroupsModal = false" class="w-8 h-8 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <div class="overflow-y-auto flex-1 p-3 stack-y-1.5">
            <div v-if="!userGroupsList.length" class="py-12 text-center text-white/35 text-sm">
              {{ userGroupsPinnedOnly ? langStore.t.profileNoPinnedGroupsLabel : langStore.t.profileNoGroupsLabel }}
            </div>
            <template v-else>
              <!-- pinned section header for non-friend viewers -->
              <p v-if="userGroupsPinnedOnly && userGroupsList.length" class="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider px-2 pb-1 flex items-center gap-1">
                <BIcon name="Pin" class="w-3 h-3" /> {{ langStore.t.profilePinnedSectionLabel }}
              </p>
              <div v-for="group in userGroupsList" :key="group.id"
                class="flex items-center gap-3 px-3 py-2.5 rounded-2xl border transition-all group/item"
                :class="group.is_pinned
                  ? 'bg-amber-500/5 border-amber-400/25 hover:border-amber-400/50'
                  : 'border-transparent hover:bg-brand-bg hover:border-brand-border'">
                <router-link :to="'/groups/' + group.slug" @click="showGroupsModal = false" class="flex items-center gap-3 flex-1 min-w-0">
                  <div class="relative shrink-0">
                    <img v-if="group.avatar_url" :src="group.avatar_url" class="w-10 h-10 rounded-xl object-cover" :class="group.is_pinned ? 'ring-2 ring-amber-400/50' : ''" @error="onAvatarError" />
                    <div v-else class="w-10 h-10 rounded-xl flex items-center justify-center" :class="group.is_pinned ? 'bg-amber-500/15 ring-2 ring-amber-400/50' : 'bg-brand-accent/15'">
                      <BIcon name="Users" class="w-5 h-5" :class="group.is_pinned ? 'text-amber-400' : 'text-brand-accent'" />
                    </div>
                    <!-- pin badge -->
                    <span v-if="group.is_pinned" class="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center shadow-md shadow-amber-500/30">
                      <BIcon name="Pin" class="w-2.5 h-2.5 text-amber-900" />
                    </span>
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-bold truncate group-hover/item:text-brand-accent transition-colors" :class="group.is_pinned ? 'text-amber-100' : 'text-white'">{{ group.name }}</p>
                    <p class="text-[10px] text-white/45">{{ group.members_count }} {{ langStore.t.membersUnit }}</p>
                  </div>
                </router-link>
                <!-- pin toggle (own profile only) -->
                <div v-if="isOwnProfile" class="relative shrink-0">
                  <button
                    @click.stop="togglePinGroup(group.id)"
                    :title="group.is_pinned ? langStore.t.profileUnpinBtn : langStore.t.profilePinBtn"
                    class="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                    :class="group.is_pinned ? 'text-amber-400 hover:text-amber-300' : 'text-white/25 hover:text-amber-400'">
                    <BIcon :name="group.is_pinned ? 'PinOff' : 'Pin'" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ─── Status Edit Modal ──────────────────────────────────────────── -->
    <Transition name="fade">
      <div v-if="showStatusEdit" class="fixed inset-0 z-400 bg-black/60 backdrop-blur-xs flex items-center justify-center px-4" @click.self="showStatusEdit = false">
        <div class="w-full max-w-sm bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border shrink-0">
            <h3 class="font-bold text-white text-base">{{ langStore.t.profileStatusLabel }}</h3>
            <button @click="showStatusEdit = false" class="w-8 h-8 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>

          <div class="overflow-y-auto flex-1">
            <div class="p-5 stack-y-4">

              <!-- Preview badge — IG Notes style -->
              <div class="flex justify-center pt-2">
                <div class="relative">
                  <div class="px-3 py-2 rounded-[18px] text-white leading-snug max-w-[130px]"
                    :style="{ background: statusEditBubbleGradient, boxShadow: `0 4px 18px -2px ${statusEditBubbleColor}80, 0 2px 6px rgba(0,0,0,0.35)` }">
                    <!-- music preview -->
                    <template v-if="statusEditMusic">
                      <div class="flex items-center gap-1.5 mb-0.5">
                        <div class="flex items-end gap-[2px] h-3.5 shrink-0">
                          <span v-for="(h, i) in [50,100,65,85]" :key="i"
                            class="w-[3px] rounded-full bg-white note-bar-profile"
                            :style="`height:${h}%; animation-delay:${i*0.08}s`" />
                        </div>
                      </div>
                      <p v-if="statusEditText || statusEditEmoji" class="text-[11px] font-semibold truncate mb-0.5">{{ statusEditEmoji }} {{ statusEditText }}</p>
                      <p class="text-[10px] font-bold truncate leading-tight">{{ statusEditMusic.artist }}</p>
                      <p class="text-[9px] opacity-70 truncate leading-tight">{{ statusEditMusic.title }}</p>
                    </template>
                    <!-- text preview -->
                    <template v-else>
                      <div class="flex gap-1 items-start">
                        <span v-if="statusEditEmoji" class="text-sm shrink-0 leading-tight">{{ statusEditEmoji }}</span>
                        <span class="text-[11px] font-semibold line-clamp-3 wrap-break-word leading-snug">{{ statusEditText || langStore.t.profilePreviewEllipsisLabel }}</span>
                      </div>
                    </template>
                    <div v-if="statusEditDuration > 0" class="mt-0.5 text-[9px] opacity-40">
                      {{ statusDurations.find(d => d.value === statusEditDuration)?.label }}
                    </div>
                  </div>
                  <!-- Arrow -->
                  <div class="absolute bottom-[-7px] left-4 w-0 h-0"
                    :style="{ borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `8px solid ${shadeColor(statusEditBubbleColor, -20)}` }" />
                </div>
              </div>

              <!-- Emoji picker -->
              <div class="stack-y-2">
                <!-- Category tabs -->
                <div class="flex gap-1">
                  <button v-for="(cat, i) in emojiCategories" :key="i"
                    @click="statusEmojiTab = i"
                    class="w-8 h-8 rounded-xl flex items-center justify-center text-base transition-all"
                    :class="statusEmojiTab === i ? 'bg-brand-accent/20 border border-brand-accent/50' : 'hover:bg-brand-bg border border-transparent'">
                    {{ cat.label }}
                  </button>
                </div>
                <!-- Emoji grid -->
                <div class="grid grid-cols-8 gap-1">
                  <button v-for="e in emojiCategories[statusEmojiTab].emojis" :key="e"
                    @click="statusEditEmoji = statusEditEmoji === e ? '' : e"
                    class="w-full aspect-square rounded-xl flex items-center justify-center text-lg transition-all hover:bg-brand-bg"
                    :class="statusEditEmoji === e ? 'bg-brand-accent/20 border border-brand-accent/50' : 'border border-transparent'">
                    {{ e }}
                  </button>
                </div>
              </div>

              <!-- Text input -->
              <input v-model="statusEditText" type="text" maxlength="60" :placeholder="langStore.t.profileStatusInputPlaceholder"
                class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-hidden focus:border-brand-accent transition-all" />

              <!-- Duration -->
              <div class="stack-y-1.5">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wider">{{ langStore.t.profileExpiresInLabel }}</p>
                <div class="flex gap-1.5 flex-wrap">
                  <button v-for="d in statusDurations" :key="d.value"
                    @click="statusEditDuration = d.value"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                    :class="statusEditDuration === d.value
                      ? 'bg-brand-accent text-white'
                      : 'bg-brand-bg border border-brand-border text-white/55 hover:text-white hover:border-brand-accent/50'">
                    {{ d.label }}
                  </button>
                </div>
              </div>

              <!-- Color accent -->
              <div class="stack-y-1.5">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wider">{{ langStore.t.profileAccentColorLabel }}</p>
                <div class="flex gap-2 items-center">
                  <button v-for="c in statusColors" :key="c.value"
                    @click="pickStatusColor(c.value)"
                    class="w-6 h-6 rounded-full transition-all flex items-center justify-center"
                    :class="[c.dot, statusEditColor === c.value ? 'ring-2 ring-white/70 ring-offset-1 ring-offset-brand-card scale-110' : 'opacity-70 hover:opacity-100']">
                  </button>
                </div>
              </div>

              <!-- Music attachment toggle -->
              <div class="stack-y-2">
                <button @click="statusShowMusicSearch = !statusShowMusicSearch; if(!statusShowMusicSearch){ statusEditMusic = null; statusMusicQuery = ''; statusMusicResults = [] }"
                  class="flex items-center gap-2 w-full px-3 py-2.5 rounded-2xl border transition-all"
                  :class="statusShowMusicSearch ? 'border-brand-accent/50 bg-brand-accent/10 text-brand-accent' : 'border-brand-border bg-brand-bg text-white/55 hover:text-white hover:border-brand-accent/30'">
                  <BIcon name="Music" class="w-4 h-4 shrink-0" />
                  <span class="text-sm font-semibold flex-1 text-left">{{ statusEditMusic ? statusEditMusic.title : langStore.t.profileAttachMusicLabel }}</span>
                  <BIcon v-if="statusEditMusic" name="X" class="w-3.5 h-3.5 text-white/40 hover:text-white/80"
                    @click.stop="statusEditMusic = null; statusMusicQuery = ''; statusMusicResults = []" />
                  <BIcon v-else :name="statusShowMusicSearch ? 'ChevronUp' : 'ChevronDown'" class="w-3.5 h-3.5" />
                </button>

                <!-- Music search -->
                <Transition name="slide-down">
                  <div v-if="statusShowMusicSearch && !statusEditMusic" class="stack-y-2">
                    <div class="relative">
                      <BIcon name="Search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                      <input v-model="statusMusicQuery" @input="onStatusMusicSearch" type="text"
                        :placeholder="langStore.t.profileFindTrackPlaceholder"
                        class="w-full bg-brand-bg border border-brand-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder-white/25 focus:outline-hidden focus:border-brand-accent transition-all" />
                    </div>
                    <div v-if="statusMusicLoading" class="flex items-center justify-center py-3 text-white/40">
                      <BIcon name="Loader" class="w-4 h-4 animate-spin mr-2" />
                      <span class="text-xs">{{ langStore.t.profileSearchingEllipsisLabel }}</span>
                    </div>
                    <div v-else-if="statusMusicError" class="flex items-center justify-center py-3 text-white/40 text-xs">
                      {{ langStore.t.profileMusicSearchFailedLabel }}
                    </div>
                    <div v-else-if="statusMusicResults.length" class="stack-y-1 max-h-48 overflow-y-auto">
                      <button v-for="(track, idx) in statusMusicResults" :key="idx"
                        @click="selectStatusTrack(track)"
                        class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-brand-bg transition-all text-left group">
                        <img :src="track.artworkUrl" class="w-9 h-9 rounded-lg object-cover shrink-0" />
                        <div class="min-w-0 flex-1">
                          <p class="text-xs font-semibold text-white truncate group-hover:text-brand-accent transition-colors">{{ track.title }}</p>
                          <p class="text-[10px] text-white/45 truncate">{{ track.artist }}</p>
                        </div>
                        <BIcon name="Plus" class="w-3.5 h-3.5 text-white/25 group-hover:text-brand-accent transition-colors shrink-0" />
                      </button>
                    </div>
                    <div v-else-if="statusMusicQuery.trim()" class="flex items-center justify-center py-3 text-white/40 text-xs">
                      {{ langStore.t.profileMusicNoResultsLabel }}
                    </div>
                  </div>
                </Transition>

                <!-- Selected track preview -->
                <div v-if="statusEditMusic" class="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-brand-bg border border-brand-border">
                  <img :src="statusEditMusic.artworkUrl" class="w-10 h-10 rounded-xl object-cover shrink-0 shadow-md" />
                  <div class="min-w-0 flex-1">
                    <p class="text-xs font-bold text-white truncate">{{ statusEditMusic.title }}</p>
                    <p class="text-[10px] text-white/50 truncate">{{ statusEditMusic.artist }}</p>
                  </div>
                  <BIcon name="Music" class="w-3.5 h-3.5 text-brand-accent shrink-0" />
                </div>
              </div>

            </div>
          </div>

          <!-- Footer buttons -->
          <div class="flex gap-2 px-5 py-4 border-t border-brand-border shrink-0">
            <button @click="saveProfileStatus" :disabled="statusSaving"
              class="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-brand-accent hover:bg-brand-accent-plus disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-all">
              <BIcon v-if="statusSaving" name="Loader" class="w-3.5 h-3.5 animate-spin" />
              {{ langStore.t.profileSaveBtn }}
            </button>
            <button v-if="profileStatus.text || profileStatus.emoji || profileStatus.music" @click="clearProfileStatus()" :disabled="statusSaving"
              class="px-4 py-2.5 bg-brand-bg border border-brand-border hover:border-brand-error disabled:opacity-60 text-white/55 hover:text-brand-error text-sm font-bold rounded-xl transition-all">
              {{ langStore.t.removeLabelOrder }}
            </button>
          </div>

        </div>
      </div>
    </Transition>


</template>

<script setup lang="ts">
import { vStickyBottom } from '@/lib/stickyBottom'
import { invalidateFriendsCache } from '@/stores/friends'
import { safeHref } from '@/utils/safeHref'
import { ref, computed, onMounted, onUnmounted, watch, reactive, type Component, type Directive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useWalletStore } from '@/stores/wallet'
import { usePaymentsStore } from '@/stores/payments'
import { useUserStore, type UserProfile, type Fursona } from '@/stores/user'
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
import PostComments from '@/components/PostComments.vue'
import PostCard from '@/components/PostCard.vue'
import MentionTextarea from '@/components/MentionTextarea.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import AlbumsPanel, { type BuiltinAlbum } from '@/components/AlbumsPanel.vue'
import PostScheduleMenu from '@/components/PostScheduleMenu.vue'
import CustomPlayer from '@/components/CustomPlayer.vue'
import BIcon from '@/components/BIcon.vue'
import AvatarFrameOverlay from '@/components/AvatarFrameOverlay.vue'
import SoonBadge from '@/components/groups/SoonBadge.vue'
import AppBadge from '@/components/shared/AppBadge.vue'
import CommissionsBadge from '@/components/CommissionsBadge.vue'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import StoryViewer from '@/components/StoryViewer.vue'
import ReportModal from '@/components/ReportModal.vue'
import api from '@/api'
import { compressImageForUpload } from '@/lib/utils'
import { FAVORITE_CATEGORIES, type FavoriteCategory } from '@/lib/interests'
import { PROFILE_FRAMES, rainbowShadow } from '@/lib/utils'
import { themeAccentOf } from '@/lib/theme'
import { onAvatarError } from '@/composables/useAvatarFallback'
import VerificationBadge from '@/components/VerificationBadge.vue'
import { verTypeIconUrl } from '@/lib/verificationIcons'
import { speciesLabel as speciesLabelFor } from '@/lib/fursonaSpecies'
import * as fmt from '@/lib/format'
import { speciesEmoji, websiteHref, socialUrl, isImage, shadeColor } from '@/lib/profileDisplay'
import { useProfileSeo } from '@/composables/profile/useProfileSeo'
import { useProfileStatus } from '@/composables/profile/useProfileStatus'
import { useAvatarGallery } from '@/composables/profile/useAvatarGallery'
import { useProfileFursonas } from '@/composables/profile/useProfileFursonas'
import { useProfilePostComposer } from '@/composables/profile/useProfilePostComposer'
import {
  User, Users, UserPlus, UserMinus, UserX, UsersRound,
  Bell, MessageSquare, Pencil, Pin, Trash2, MoreHorizontal,
  ChevronUp, ChevronDown, Repeat2, MessageCircle, Heart, HeartOff,
  Image, Hash, Search, MapPin, Calendar, Link, Briefcase,
  FileText, BookImage, Send, Play, X, ArrowLeft,
  Crown, Shield, BadgeCheck, Flame, Sparkles, Award,
  Footprints, Smile, SmilePlus, AlertCircle,
  LogOut, Camera, Eye, EyeOff, Info, Globe,
  Rabbit, PawPrint, Plus, Check, Twitter, Instagram, Youtube, Twitch, Github, Quote,
  Wallet, ChevronRight, AtSign, ArrowUpRight, Archive, BarChart3
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const userStore = useUserStore()
const langStore = useLangStore()
const primarySpeciesLabel = computed(() => {
  const sp = profileFursona.value?.species?.[0]
  return sp ? speciesLabelFor(sp, langStore.currentLang) : ''
})

import { useMessagesStore } from '@/stores/messages'
import { useGroupsStore, type SoonBadge as SoonBadgeType } from '@/stores/groups'
import { useNsfwMode } from '@/composables/useNsfwMode'
import type { Post } from '@/types/post'
import { apiErrorMessage, apiErrorStatus } from '@/lib/apiError'
import TrustScoreCard from '@/components/TrustScoreCard.vue'
const messagesStore = useMessagesStore()
const groupsStore = useGroupsStore()

const profileSoonBadges = ref<SoonBadgeType[]>([])

async function loadProfileSoonBadges(userId: string) {
  try {
    await groupsStore.loadMySoonBadges(userId)
    profileSoonBadges.value = groupsStore.mySoonBadges
  } catch { profileSoonBadges.value = [] }
}

const messageErrorNotice = ref<string | null>(null)

async function openChat() {
  if (!viewedProfile.value) return
  try {
    const convId = await messagesStore.openConversation(viewedProfile.value.id)
    messagesStore.activeId = convId
    router.push({ name: 'messages' })
  } catch (e) {
    messageErrorNotice.value = apiErrorMessage(e) === 'MESSAGES_DISABLED'
      ? langStore.t.profileMessagesRestrictedError
      : langStore.t.profileChatStartFailedError
    setTimeout(() => { messageErrorNotice.value = null }, 4000)
  }
}

const closeMenu = () => {}

const viewedProfile = ref<UserProfile | null>(null)
const isLoading = ref(false)
const error = ref<string | null>(null)

const profileBgStyle = computed(() => {
  const url = viewedProfile.value?.profile_bg_url as string | undefined
  if (!url) return {}
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return {}
    return {
      backgroundImage: `url('${url.replace(/'/g, '%27')}')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
    }
  } catch { return {} }
})


// ── Feature composables ───────────────────────────────────────────────────────
useProfileSeo(viewedProfile, () => route.params.username)
const {
  profileStatus, showStatusEdit, statusSaving, statusEditEmoji, statusEditText, statusEditDuration,
  statusEditColor, statusEditMusic, statusEmojiTab, statusShowMusicSearch, statusMusicQuery, statusMusicResults,
  statusMusicLoading, statusPreviewAudioEl, isStatusMusicPlaying, statusPreviewVolume, toggleStatusMusicPreview, setStatusMusicVolume,
  emojiCategories, statusBubbleColor, statusEditBubbleColor, statusBubbleGradient, statusEditBubbleGradient,
  hasActiveStatus, statusDurations, statusColors, statusTimeRemaining, applyProfileStatus, saveProfileStatus,
  openStatusEdit, clearProfileStatus, pickStatusColor, statusMusicError, onStatusMusicSearch, selectStatusTrack,
} = useProfileStatus()
const {
  showAvatarViewer, showBannerViewer, avatarGallery, avatarGalleryIndex, avatarGalleryLoading, avatarGalleryRestoring,
  openAvatarGallery, restoreGalleryAvatar, deleteGalleryAvatar,
} = useAvatarGallery(viewedProfile)
const {
  profileFursonas, selectedFursonaId, profileFursona, speciesDisplay, speciesSummary, profileFursuits,
  profileFursonaLoading, profileFursuitsLoading, makerGroupCache, loadProfileFursonas, loadProfileFursuits,
  showFursonaRefViewer, selectedFursonaRef, fursonaSubTab, fursonaRefImages, activeFursonaRef, fursonaOtherCount,
  fursonaViewTabs, fursonaRefPalette, selectFursonaRef, openFursonaRef,
} = useProfileFursonas(viewedProfile)
const {
  newPostContent, newPostMediaUrls, newPostIsNsfw, newPostIsAiGenerated, newPostTags, newPostTagInput,
  newPostVisibility, showProfileVisibilityMenu, isCreatingPost, profileMediaUploadRef, showProfileScheduleMenu, isSchedulingProfilePost,
  addProfileTag, addProfileTagFromSuggestion, removeProfileTag, onProfileMediaUploaded, createPost, saveProfileScheduledPost,
  tagSuggestions, showTagSuggestions, fetchTagSuggestions, clearTagSuggestions,
} = useProfilePostComposer({
  onCreated: (post) => {
    tabPosts.value.unshift(post)
    if (viewedProfile.value?._count) viewedProfile.value._count.posts++
  },
  onScheduled: () => { showPostForm.value = false },
})

// ── Profile stories ───────────────────────────────────────────────────────────
interface ProfileStory {
  id: string
  image_url: string | null
  created_at: string
  expires_at: string
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null }
}
const profileStories = ref<ProfileStory[]>([])
const profileStoryViewerOpen = ref(false)
const hasStory = computed(() => profileStories.value.length > 0)

async function fetchProfileStories(userId: string) {
  try {
    const res = await api.get(`/stories/user/${userId}`)
    if (res.data.success) {
      profileStories.value = res.data.data.stories as ProfileStory[]
    }
  } catch {}
}

function onAvatarClick() {
  if (hasStory.value) {
    profileStoryViewerOpen.value = true
  } else if (avatarSrc.value) {
    openAvatarGallery()
  }
}

type AboutTab = 'about' | 'fursona' | 'fursuit'
type ContentTab = 'posts' | 'repaws' | 'media' | 'archive' | 'followers' | 'following' | 'mutual_groups' | 'stats'

// ── Social modals ─────────────────────────────────────────────────────────────
const showFollowersModal = ref(false)
const showFollowingModal = ref(false)
const showGroupsModal    = ref(false)
const followingLoading = ref(false)



const aboutTab = ref<AboutTab>('about')
const activeContentTab = ref<ContentTab>('posts')
const tabPosts = ref<Post[]>([])
const repawsFallback = ref<Post[]>([])
// Rows of the followers / following / groups lists — only the fields this page reads are typed
interface ProfileUserRow { id: string; username: string; display_name: string | null; avatar_url: string | null; [key: string]: unknown }
interface ProfileGroupRow { id: string; slug: string; name: string; avatar_url: string | null; is_pinned?: boolean; [key: string]: unknown }
const followers = ref<ProfileUserRow[]>([])
const following = ref<ProfileUserRow[]>([])
const friendsListRestricted = ref(false)
const mutualGroups = ref<ProfileGroupRow[]>([])
const userHashtags = ref<{ name: string; count: number }[]>([])
const isLoadingTab = ref(false)
const profilePostStatus = reactive<Record<string, { repawed: boolean; favourited: boolean; userVote: 1 | -1 | 0 }>>({})
const expandedMediaPost = ref<any | null>(null)
const pinnedPost = ref<Post | null>(null)
const mediaFilter = ref<'all' | 'photo' | 'video'>('all')
// postId → 'fursona' | 'fursuit' | null  (ярлыки для ручных альбомов)
const mediaPostLabels = ref<Record<string, 'fursona' | 'fursuit'>>({})
const mediaTagTarget = ref<string | null>(null) // postId с открытым попапом тегов
const openAlbum = ref<{ label: string; emoji?: string; urls: { url: string; postId?: string; is_nsfw?: boolean }[] } | null>(null)

function openReferencesAlbum() {
  openAlbumOrLightbox({
    label: langStore.t.profileReferencesAlbumLabel,
    emoji: '🖼️',
    urls: userStore.referenceImages.map((r) => ({ url: r.image_url, is_nsfw: r.is_nsfw })),
  })
}

// Альбом с единственным фото открывать сразу в лайтбоксе, без промежуточной сетки
function openAlbumOrLightbox(album: { label: string; emoji?: string; urls: { url: string; postId?: string; is_nsfw?: boolean }[] }) {
  if (album.urls.length === 1) {
    openMediaLightbox(album.urls[0].url, [album.urls[0].url], 0)
  } else {
    openAlbum.value = album
  }
}


// ── Lightbox ──────────────────────────────────────────────────────────────────
const lightboxUrl = ref<string>('')
const lightboxList = ref<string[]>([])
const lightboxIndex = ref(0)
const lightboxDir = ref<1 | -1>(1)

function openMediaLightbox(url: string, list: string[], idx: number) {
  lightboxUrl.value = url
  lightboxList.value = list
  lightboxIndex.value = idx
}
function closeLightbox() { lightboxUrl.value = '' }
function lightboxStep(dir: -1 | 1) {
  const next = lightboxIndex.value + dir
  if (next >= 0 && next < lightboxList.value.length) {
    lightboxDir.value = dir
    lightboxIndex.value = next
    lightboxUrl.value = lightboxList.value[next]
  }
}
// Клавиши для lightbox
function onKeyDown(e: KeyboardEvent) {
  if (lightboxUrl.value) {
    if (e.key === 'Escape') closeLightbox()
    if (e.key === 'ArrowLeft') lightboxStep(-1)
    if (e.key === 'ArrowRight') lightboxStep(1)
    return
  }
  if (openAlbum.value && e.key === 'Escape') openAlbum.value = null
}

const relation = reactive({ aFollowsB: false, bFollowsA: false, friends: false })
const notifyPosts = ref(false)
const notifyLoading = ref(false)
const isTogglingFollow = ref(false)


// Принятая заявка пишет только relationship_with, поэтому у второй стороны статус может быть пуст —
// карточка всё равно показывается, подпись по умолчанию «В отношениях».
const relationshipStatusLabel = computed(() => {
  const t = langStore.t
  const status = viewedProfile.value?.relationship_status
  if (!status) return t.relStatusInRel
  const labels: Record<string, string> = {
    single: t.relStatusSingle,
    in_relationship: t.relStatusInRel,
    relationship: t.relStatusInRel,
    married: t.relStatusMarried,
    complicated: t.relStatusComplicated,
    open: t.relStatusOpen,
    open_relationship: t.relStatusOpen,
    looking: t.relStatusLooking,
    secret: t.relStatusSecret,
  }
  return labels[status] ?? status
})
const partnerProfile = ref<{ id: string; username: string; display_name: string | null; avatar_url: string | null } | null>(null)

// ── Online status ─────────────────────────────────────────────────────────────
const isProfileOnline = ref(false)
async function fetchOnlineStatus(userId: string) {
  try {
    const res = await api.get(`/users/online?ids=${userId}`)
    if (res.data.success) isProfileOnline.value = !!res.data.data[userId]
  } catch {}
}

// ── NSFW (shared with AppHeader via v-model) ──────────────────────────────────
const { nsfwEnabled: nsfwMode } = useNsfwMode()

// ── Full post creator state ───────────────────────────────────────────────────
const showPostForm = ref(false)
const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

// ── Edit modal ────────────────────────────────────────────────────────────────
const showBadgesModal = ref(false)
const showWalletModal = ref(false)
const walletStore = useWalletStore()
const showTopupPicker = ref(false)
const toppingUp = ref(false)
const TOPUP_FALLBACK_PACKAGES = [100, 500, 1000, 2500, 5000].map((n) => ({ bc: n, rub: n, popular: false }))
const topupPackages = computed(() => paymentsStore.config?.enabled ? paymentsStore.config.topup.packages : TOPUP_FALLBACK_PACKAGES)
const paymentsStore = usePaymentsStore()
const customTopup = ref<number | null>(null)
const customTopupValid = computed(() => {
  const lim = paymentsStore.config?.topup
  const v = customTopup.value
  return !!lim && Number.isInteger(v) && v! >= lim.min && v! <= lim.max && v! % lim.step === 0
})
function openWalletModal() {
  showWalletModal.value = true
  showTopupPicker.value = false
  walletStore.fetchBalance().catch(() => {})
  paymentsStore.fetchConfig().catch(() => {})
}
async function topupWallet(amount: number) {
  if (toppingUp.value) return
  toppingUp.value = true
  try {
    if (paymentsStore.config?.enabled) {
      // Уходим на страницу оплаты ЮKassa; баланс пополнится по уведомлению, результат — на /payment/result
      await paymentsStore.startTopup(amount, 'AC')
      return
    }
    // Шлюз не подключён — демо-пополнение (сервер разрешает его только в dev)
    await walletStore.topup(amount)
    showTopupPicker.value = false
  } catch (e) {
    alert(apiErrorMessage(e) || langStore.t.profileWalletTopupFailedError)
  } finally {
    toppingUp.value = false
  }
}


function openEditModal(section: 'basics' | 'bio' | 'fursona' | 'fursuit' | 'contacts' | 'socials') {
  // Map profile section → settings section ID
  const sectionMap: Record<string, string> = {
    basics:   'sec-basic',
    bio:      'sec-basic',
    fursona:  'sec-fursona',
    fursuit:  'sec-fursona',
    contacts: 'sec-contacts',
    socials:  'sec-contacts',
  }
  router.push({ name: 'settings-profile', query: { section: sectionMap[section] ?? 'sec-basic' } })
}


// ── Любимое (fixed favourite categories) ────────────────────────────────────
const editingFavorite = ref<string | null>(null)
const favoriteDraft = ref('')

const hasFavorites = computed(() =>
  FAVORITE_CATEGORIES.some((cat) => !!viewedProfile.value?.[cat.key])
)

function openFavoriteEdit(key: FavoriteCategory['key']) {
  favoriteDraft.value = viewedProfile.value?.[key] ?? ''
  editingFavorite.value = key
}

async function saveFavorite(key: FavoriteCategory['key']) {
  if (!viewedProfile.value) return
  const value = favoriteDraft.value.trim() || null
  await userStore.updateProfile({ [key]: value })
  viewedProfile.value[key] = value
  editingFavorite.value = null
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
    fd.append('file', await compressImageForUpload(file))
    const res = await api.post('/media/upload?folder=banners', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    if (res.data.success && res.data.data?.url) {
      await userStore.updateProfile({ banner_url: res.data.data.url })
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
    fd.append('file', await compressImageForUpload(file))
    const res = await api.post('/media/upload?folder=avatars', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    if (res.data.success && res.data.data?.url) {
      const videoUrl = res.data.data.videoUrl ?? null
      await userStore.updateProfile({ avatar_url: res.data.data.url, avatar_video_url: videoUrl })
      if (viewedProfile.value) { viewedProfile.value.avatar_url = res.data.data.url; viewedProfile.value.avatar_video_url = videoUrl }
      if (authStore.user) { authStore.user.avatar_url = res.data.data.url; authStore.user.avatar_video_url = videoUrl }
    }
  } catch (err) { console.error('avatar upload failed', err) }
  finally {
    isUploadingAvatar.value = false
    if (avatarFileInput.value) avatarFileInput.value.value = ''
  }
}

// ── Computed ──────────────────────────────────────────────────────────────────
const isOwnProfile = computed(() => !!authStore.user && authStore.user.id === viewedProfile.value?.id)
// Плашка «Заказы открыты» — перк Pro и Business
const canSetCommissions = computed(() => ['pro', 'business'].includes(authStore.user?.subscription_tier ?? 'free'))
async function toggleCommissions() {
  if (!viewedProfile.value || !canSetCommissions.value) return
  const next = viewedProfile.value.commissions_status === 'open' ? 'none' : 'open'
  try {
    await api.patch('/users/me', { commissions_status: next })
    viewedProfile.value.commissions_status = next
    if (authStore.user) authStore.user.commissions_status = next
  } catch {}
}

const fursonaHasPersonalityContent = computed(() => {
  const f = profileFursona.value
  if (!f) return false
  if (!f.likes_dislikes_visible && !isOwnProfile.value) return false
  return (f.likes?.length ?? 0) + (f.dislikes?.length ?? 0) > 0
})

watch(() => profileFursona.value?.id, () => {
  fursonaSubTab.value = fursonaHasPersonalityContent.value ? 'personality' : 'info'
}, { immediate: true })
const userGroupsCount    = ref(0)
const userGroupsList     = ref<ProfileGroupRow[]>([])
const userGroupsPinnedOnly = ref(false)
const userGroupsHidden = ref(false)
const groupsModalLoading = ref(false)
const groupsCount = computed(() => userGroupsCount.value)

async function loadUserGroupsCount(userId: string) {
  try {
    const res = await api.get(`/groups/user/${userId}`)
    userGroupsCount.value = res.data.data?.count ?? 0
    userGroupsList.value  = res.data.data?.groups ?? []
    userGroupsPinnedOnly.value = res.data.data?.pinned_only ?? false
    userGroupsHidden.value = res.data.data?.hidden ?? false
  } catch {
    userGroupsCount.value = 0
    userGroupsList.value  = []
    userGroupsHidden.value = false
  }
}

function openGroupsModal() {
  if (!viewedProfile.value) return
  if (!isOwnProfile.value && userGroupsHidden.value) return
  showGroupsModal.value = true
}

async function togglePinGroup(groupId: string) {
  try {
    await api.patch(`/groups/${groupId}/pin`)
    const g = userGroupsList.value.find((g) => g.id === groupId)
    if (g) g.is_pinned = !g.is_pinned
    userGroupsList.value = [
      ...userGroupsList.value.filter((g) => g.is_pinned),
      ...userGroupsList.value.filter((g) => !g.is_pinned),
    ]
  } catch {}
}

const profileDisplayName = computed(() => {
  return viewedProfile.value?.display_name || viewedProfile.value?.username || ''
})

const profileBio = computed(() => {
  return viewedProfile.value?.bio ?? ''
})

const ownAvatarSrc = computed(() => authStore.user?.avatar_url ?? '')

const ownJobTitle = computed(() => authStore.user?.job_title ?? '')

const avatarSrc = computed(() => {
  const p = viewedProfile.value
  if (!p) return ''
  return p.avatar_url ?? ''
})

const bannerStyle = computed(() => {
  const p = viewedProfile.value
  if (!p) return {}
  if (p.banner_url) return { backgroundImage: `url('${String(p.banner_url).replace(/['"\\()\s]/g, encodeURIComponent)}')`, backgroundSize: 'cover', backgroundPosition: 'center' }
  // Use theme accent if set, otherwise profile accent_color
  const color = themeAccentOf(p.profile_theme) ?? p.accent_color ?? '#4C67CF'
  return { background: `linear-gradient(135deg, ${color}55, ${color}33)` }
})

const avatarRingStyle = computed(() => {
  const p = viewedProfile.value
  // Image-based frame takes over the avatar border entirely — no legacy CSS ring underneath it.
  if (p?.equippedFrame) return {}
  const frameId = p?.profile_frame as string | undefined
  // Theme accent for default_ring / no frame
  const accentColor = themeAccentOf(p?.profile_theme) ?? p?.accent_color ?? '#4C67CF'
  const frameStyleMap: Record<string, Record<string, string>> = {
    none:         {},
    default_ring: { outline: `2px solid ${accentColor}80`, outlineOffset: '2px' },
    gold:         { outline: '2px solid #fbbf24', outlineOffset: '2px' },
    neon:         { outline: '2px solid #ec4899', outlineOffset: '2px', boxShadow: '0 0 14px 3px rgba(236,72,153,0.65)' },
    rainbow:      { boxShadow: rainbowShadow(2) },
    silver:       { outline: '2px solid #cbd5e1', outlineOffset: '2px' },
    fire:         { outline: '2px solid #f97316', outlineOffset: '2px', boxShadow: '0 0 14px 3px rgba(249,115,22,0.65)' },
  }
  if (frameId && frameStyleMap[frameId]) return frameStyleMap[frameId]
  return { borderColor: `${accentColor}80` }
})

const equippedFrame = computed(() => viewedProfile.value?.equippedFrame ?? null)

const accentStyle = computed(() => {
  const color = viewedProfile.value?.accent_color ?? '#4C67CF'
  return { backgroundColor: `${color}25`, borderColor: `${color}60`, color }
})



const accentStyleSubtle = computed(() => {
  const color = viewedProfile.value?.accent_color ?? '#4C67CF'
  return { backgroundColor: `${color}30`, borderColor: `${color}50`, color }
})

// Badge pill in banner
const badgePillMap = computed<Record<string, { label: string; cls: string; icon: Component }>>(() => ({
  admin:      { label: langStore.t.roleAdmin,             cls: 'bg-amber-500/25 border border-amber-500/40 text-amber-300', icon: Crown },
  moderator:  { label: langStore.t.profileRoleModerator,  cls: 'bg-purple-500/25 border border-purple-500/40 text-purple-300', icon: Shield },
}))

const badgePillClass = computed(() => {
  const p = viewedProfile.value
  const bt = p?.badge_type ?? p?.role
  return badgePillMap.value[bt ?? '']?.cls ?? ''
})
const badgePillLabel = computed(() => {
  const p = viewedProfile.value
  const bt = p?.badge_type ?? p?.role
  return badgePillMap.value[bt ?? '']?.label ?? ''
})
const badgePillIcon = computed(() => {
  const p = viewedProfile.value
  const bt = p?.badge_type ?? p?.role
  return badgePillMap.value[bt ?? '']?.icon ?? User
})

// Follow button
const isMutual = computed(() => relation.aFollowsB && relation.bFollowsA)
const followBtnLabel = computed(() => {
  if (relation.aFollowsB) return langStore.t.unsubscribe
  if (relation.bFollowsA) return langStore.t.subscribeBack
  return langStore.t.subscribe
})
const followBtnIcon = computed(() => {
  if (relation.aFollowsB) return UserMinus
  return UserPlus
})
const followBtnClass = computed(() => {
  if (relation.aFollowsB)
    return 'bg-brand-card border border-brand-border text-white/55 hover:text-brand-error hover:border-brand-error/40'
  if (relation.bFollowsA)
    return 'bg-brand-accent/20 border border-brand-accent/50 text-brand-accent hover:bg-brand-accent hover:text-white shadow-xs'
  return 'bg-brand-accent hover:bg-brand-accent-plus text-white shadow-xs'
})

// About nav Items
const aboutNavs = computed(() => {
  const navs = [
    { key: 'about' as AboutTab,     label: langStore.t.aboutTab,    icon: User },
    { key: 'fursona' as AboutTab,   label: langStore.t.fursonaTab,  icon: Rabbit },
  ]
  if (viewedProfile.value?.has_fursuit) {
    navs.push({ key: 'fursuit' as AboutTab, label: langStore.t.fursuitTab, icon: PawPrint })
  }
  return navs
})

watch([aboutTab, viewedProfile], () => {
  if (aboutTab.value === 'fursuit' && !viewedProfile.value?.has_fursuit) {
    aboutTab.value = 'about'
  }
})

// Content tabs
const contentTabs = computed(() => {
  const tabs: { key: ContentTab; label: string; icon: Component; visible?: boolean }[] = [
    { key: 'posts',     label: langStore.t.postsTab,     icon: FileText },
    { key: 'repaws',    label: langStore.t.repawsTab,    icon: Repeat2 },
    { key: 'media',     label: langStore.t.mediaTab,     icon: Image },
  ]
  if (isOwnProfile.value) {
    tabs.push({ key: 'archive', label: langStore.t.profileArchiveTab, icon: Archive })
    tabs.push({ key: 'stats', label: langStore.t.statsTab, icon: BarChart3 })
  }
  if (!isOwnProfile.value && authStore.isAuthenticated) {
    tabs.push({ key: 'mutual_groups', label: langStore.t.feedGeneral, icon: UsersRound })
  }
  return tabs
})

const profileStatsData = ref<{
  totalFriends: number
  newFriendsLast30Days: number
  totalPosts: number
  totalViews: number
  topPost: Post | null
} | null>(null)

const profileStats = computed(() => {
  const p = viewedProfile.value
  if (!p) return []
  return [
    { key: 'following', value: p._count?.following ?? following.value.length, label: langStore.t.tabFollowing, tab: null },
    { key: 'followers', value: p._count?.followers ?? followers.value.length, label: langStore.t.tabFollowers, tab: null },
    { key: 'likes', value: p.likes_count ?? 0, label: langStore.t.adminLikesLabel, tab: null },
  ]
})

const achievementBadges = computed(() => {
  const badges: { key: string; label: string; desc: string; iconComp?: Component; iconImg?: string; iconBg: string; iconColor: string }[] = []
  const p = viewedProfile.value
  if (!p) return badges
  if (p.role === 'admin')            badges.push({ key: 'admin',      label: langStore.t.roleAdmin,      desc: langStore.t.profileRoleAdminDesc,     iconComp: Crown,      iconBg: 'bg-amber-500/20',   iconColor: 'text-amber-400' })
  if (p.role === 'moderator')        badges.push({ key: 'mod',        label: langStore.t.profileRoleModerator,           desc: langStore.t.profileRoleModeratorDesc,     iconComp: Shield,     iconBg: 'bg-purple-500/20',  iconColor: 'text-purple-400' })
  if (p.is_sponsor)                  badges.push({ key: 'sponsor',    label: langStore.t.sponsorBadgeLabel, desc: langStore.t.sponsorBadgeDesc, iconImg: '/icons/badges/sponsor.png', iconBg: 'bg-violet-500/20', iconColor: 'text-violet-300' })
  // Verification type specific badges
  const vt = p.verification_type
  if (vt === 'artist')         badges.push({ key: 'ver-artist',    label: langStore.t.verBadgeLabelArtist,       desc: langStore.t.verBadgeModDesc, iconImg: verTypeIconUrl('artist'),       iconBg: 'bg-purple-500/20',  iconColor: 'text-purple-400' })
  else if (vt === 'master')    badges.push({ key: 'ver-master',    label: langStore.t.verBadgeLabelMaster,       desc: langStore.t.verBadgeModDesc, iconImg: verTypeIconUrl('master'),       iconBg: 'bg-amber-500/20',   iconColor: 'text-amber-400' })
  else if (vt === 'fursuiter') badges.push({ key: 'ver-fursuiter', label: langStore.t.verBadgeLabelFursuiter,    desc: langStore.t.verBadgeModDesc, iconImg: verTypeIconUrl('fursuiter'),    iconBg: 'bg-cyan-500/20',    iconColor: 'text-cyan-400' })
  else if (vt === 'popular')   badges.push({ key: 'ver-popular',   label: langStore.t.verBadgeLabelPopular,      desc: langStore.t.verBadgeModDesc, iconImg: verTypeIconUrl('popular'),      iconBg: 'bg-blue-500/20',    iconColor: 'text-blue-400' })
  else if (vt === 'writer')    badges.push({ key: 'ver-writer',    label: langStore.t.verBadgeLabelWriter,       desc: langStore.t.verBadgeModDesc, iconImg: verTypeIconUrl('writer'),       iconBg: 'bg-rose-500/20',    iconColor: 'text-rose-400' })
  else if (vt === 'organizer') badges.push({ key: 'ver-organizer', label: langStore.t.verBadgeLabelOrganizer,    desc: langStore.t.verBadgeModDesc, iconImg: verTypeIconUrl('organizer'),    iconBg: 'bg-indigo-500/20',  iconColor: 'text-indigo-400' })
  else if (vt === 'event')     badges.push({ key: 'ver-event',     label: langStore.t.verTypeEvent,              desc: langStore.t.verBadgeModDesc, iconImg: verTypeIconUrl('event'),        iconBg: 'bg-emerald-500/20', iconColor: 'text-emerald-400' })
  else if (vt === 'photographer') badges.push({ key: 'ver-photographer', label: langStore.t.verBadgeLabelPhotographer, desc: langStore.t.verBadgeModDesc, iconImg: verTypeIconUrl('photographer'), iconBg: 'bg-teal-500/20',    iconColor: 'text-teal-400' })
  else if (vt === 'programmer')   badges.push({ key: 'ver-programmer',   label: langStore.t.verBadgeLabelProgrammer,  desc: langStore.t.verBadgeModDesc, iconImg: verTypeIconUrl('programmer'),   iconBg: 'bg-fuchsia-500/20', iconColor: 'text-fuchsia-400' })
  else if (p.badge_type === 'verified' || p.is_verified)   badges.push({ key: 'verified',   label: langStore.t.verBadgeLabelVerifiedPage, desc: langStore.t.verBadgeVerifiedAccountDesc, iconComp: BadgeCheck, iconBg: 'bg-blue-500/20',    iconColor: 'text-blue-400' })
  if ((p._count?.posts ?? 0) >= 10)  badges.push({ key: 'active',     label: langStore.t.profileActiveAuthorBadgeLabel,      desc: langStore.t.profileActiveAuthorBadgeDesc,           iconComp: Flame,      iconBg: 'bg-red-500/20',     iconColor: 'text-red-400' })
  if ((p._count?.followers ?? 0) >= 50) badges.push({ key: 'popular', label: langStore.t.profilePopularBadgeLabel,          desc: langStore.t.profilePopularBadgeDesc,            iconComp: Sparkles,   iconBg: 'bg-yellow-500/20',  iconColor: 'text-yellow-400' })
  // Default badge for all
  if (!badges.length) badges.push({ key: 'furlite', label: 'FurLite',             desc: langStore.t.profileSubscriberSincePrefix + ' ' + joinDate.value,  iconComp: Award,    iconBg: 'bg-brand-accent/20', iconColor: 'text-brand-accent' })
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
const socialNetworks = computed(() => [
  { key: 'telegram',    label: 'Telegram',    iconName: 'Send',          color: '#2AABEE' },
  { key: 'twitter',     label: 'X / Twitter', iconName: 'Twitter',       color: '#1DA1F2' },
  { key: 'instagram',   label: 'Instagram',   iconName: 'Instagram',     color: '#E4405F' },
  { key: 'youtube',     label: 'YouTube',     iconName: 'Youtube',       color: '#FF0000' },
  { key: 'twitch',      label: 'Twitch',      iconName: 'Twitch',        color: '#9146FF' },
  { key: 'furaffinity', label: 'FurAffinity', iconName: 'PawPrint',      color: '#FAAF3A' },
  { key: 'vk',          label: 'ВКонтакте',   iconName: 'Users',         color: '#4C75A3' },
  { key: 'discord',     label: 'Discord',     iconName: 'MessageCircle', color: '#7289DA' },
  { key: 'github',      label: 'GitHub',      iconName: 'Github',        color: '#6e8196' },
  { key: 'other',       label: langStore.t.profileSocialOtherLabel, iconName: 'Globe',       color: '#6366f1' },
])
const activeSocialLinks = computed(() => {
  const sl = viewedProfile.value?.social_links ?? {}
  return socialNetworks.value.filter(n => sl[n.key])
})

// ── NSFW age check ──────────────────────────────────────────────────────────
const isNsfwAllowed = computed(() => {
  const bd = viewedProfile.value?.birth_date
    ?? authStore.user?.birth_date
  if (!bd) return true // unknown age → allow (server-side guard is separate)
  const birthYear = new Date(bd)
  const now = new Date()
  let age = now.getFullYear() - birthYear.getFullYear()
  const m = now.getMonth() - birthYear.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birthYear.getDate())) age--
  return age >= 18
})

// ── Place string helper ───────────────────────────────────────────────────
const placeStr = computed(() => {
  const loc = viewedProfile.value?.location
  const ctr = viewedProfile.value?.country
  if (loc && ctr) return `${loc}, ${ctr}`
  return loc || ctr || ''
})

// ── Together-since duration ───────────────────────────────────────────────
const togetherSince = computed((): string | null => {
  const since = viewedProfile.value?.relationship_since
  if (!since) return null
  const start = new Date(since)
  const now   = new Date()
  let years  = now.getFullYear() - start.getFullYear()
  let months = now.getMonth() - start.getMonth()
  let days   = now.getDate() - start.getDate()
  if (days < 0) { months--; days += new Date(now.getFullYear(), now.getMonth(), 0).getDate() }
  if (months < 0) { years--; months += 12 }
  const parts: string[] = []
  if (years  > 0) parts.push(`${years} ${years  === 1 ? langStore.t.profileYearWord1 : years  < 5 ? langStore.t.profileYearWord2to4 : langStore.t.profileYearWord5plus}`)
  if (months > 0) parts.push(`${months} ${months === 1 ? langStore.t.profileMonthWord1 : months < 5 ? langStore.t.profileMonthWord2to4 : langStore.t.profileMonthWord5plus}`)
  if (parts.length === 0) parts.push(`${Math.max(days, 1)} ${days === 1 ? langStore.t.profileDayWord1 : days < 5 ? langStore.t.profileDayWord2to4 : langStore.t.profileDayWord5plus}`)
  return parts.join(' ')
})


const filteredMediaPosts = computed(() => {
  if (mediaFilter.value === 'photo') return tabPosts.value.filter((p) => isImage(p.media_urls?.[0] ?? ''))
  if (mediaFilter.value === 'video') return tabPosts.value.filter((p) => !isImage(p.media_urls?.[0] ?? ''))
  return tabPosts.value
})

// ── Альбомы медиа (группировка по месяцу) ────────────────────────────────────
const mediaAlbums = computed(() => {
  const map = new Map<string, { url: string; created_at: string; postId?: string }[]>()
  for (const post of tabPosts.value) {
    const dt = new Date(post.created_at)
    const label = dt.toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { month: 'long', year: 'numeric' })
    if (!map.has(label)) map.set(label, [])
    for (const url of (post.media_urls ?? [])) {
      map.get(label)!.push({ url, created_at: post.created_at, postId: post.id })
    }
  }
  return Array.from(map.entries()).map(([label, urls]) => ({ label, urls }))
})

// ── Специальные альбомы (Фурсона, Фурсьют, + ярлыки из постов) ──────────────
const specialAlbums = computed(() => {
  const albums: { id: string; label: string; emoji: string; urls: { url: string; postId?: string; is_nsfw?: boolean }[] }[] = []

  // Альбом Референсы
  if (userStore.referenceImages.length) {
    albums.push({
      id: 'references',
      label: langStore.t.profileReferencesAlbumLabel,
      emoji: '🖼️',
      urls: userStore.referenceImages.map((r) => ({ url: r.image_url, is_nsfw: r.is_nsfw })),
    })
  }

  // Альбом Фурсона
  const fursonaUrls: { url: string; postId?: string }[] = []
  // Посты помеченные как фурсона
  for (const post of tabPosts.value) {
    if (mediaPostLabels.value[post.id] === 'fursona') {
      for (const url of (post.media_urls ?? [])) fursonaUrls.push({ url, postId: post.id })
    }
  }
  if (fursonaUrls.length) albums.push({ id: 'fursona', label: langStore.t.fursonaTab, emoji: '🐾', urls: fursonaUrls })

  // Альбом Фурсьют
  const fursuitUrls: { url: string; postId?: string }[] = []
  for (const suit of profileFursuits.value) {
    if (suit.image_url) fursuitUrls.push({ url: suit.image_url })
  }
  for (const post of tabPosts.value) {
    if (mediaPostLabels.value[post.id] === 'fursuit') {
      for (const url of (post.media_urls ?? [])) fursuitUrls.push({ url, postId: post.id })
    }
  }
  if (fursuitUrls.length) albums.push({ id: 'fursuit', label: langStore.t.fursuitTab, emoji: '🦊', urls: fursuitUrls })

  return albums
})

// Встроенные альбомы для общей сетки альбомов (вместе с созданными вручную)
const builtinAlbums = computed<BuiltinAlbum[]>(() => [
  ...specialAlbums.value,
  ...mediaAlbums.value.map((a) => ({ id: `month:${a.label}`, label: a.label, icon: 'CalendarDays', urls: a.urls })),
])

function loadMediaLabels(userId: string) {
  try {
    const raw = localStorage.getItem(`bloomly_mlabels_${userId}`)
    if (raw) mediaPostLabels.value = JSON.parse(raw)
  } catch { /* ignore */ }
}

function setMediaLabel(postId: string, label: 'fursona' | 'fursuit' | null) {
  if (label === null) {
    delete mediaPostLabels.value[postId]
  } else {
    mediaPostLabels.value[postId] = label
  }
  const uid = viewedProfile.value?.id
  if (uid) {
    try { localStorage.setItem(`bloomly_mlabels_${uid}`, JSON.stringify(mediaPostLabels.value)) } catch { /* ignore */ }
  }
  mediaTagTarget.value = null
}

const joinDate = computed(() => {
  if (!viewedProfile.value) return ''
  return new Date(viewedProfile.value.created_at).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { month: 'long', year: 'numeric' })
})

// ── Birth date, formatted per the owner's chosen public visibility ─────────
const formattedBirthDate = computed(() => {
  const p = viewedProfile.value
  if (!p?.birth_date) return null
  const bd = new Date(p.birth_date)
  const full = () => bd.toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
  if (isOwnProfile.value) return full()
  switch (p.birth_date_visibility) {
    case 'full':      return full()
    case 'month_day': return bd.toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { timeZone: 'UTC', day: 'numeric', month: 'long' })
    case 'year':      return bd.toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { timeZone: 'UTC', year: 'numeric' })
    default:          return null
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatDate = (d: string) => fmt.formatRelativeShort(d, {
  suffixes: { s: langStore.t.profileSecAgoSuffix, m: langStore.t.profileMinAgoSuffix, h: langStore.t.profileHourAgoSuffix, d: '' },
  maxDays: 1,
  locale: LANG_TO_LOCALE[langStore.currentLang],
})



// ── Load profile ──────────────────────────────────────────────────────────────
async function loadProfile() {
  const slug = route.params.username as string
  isLoading.value = true
  error.value = null
  viewedProfile.value = null
  followers.value = []
  following.value = []
  mutualGroups.value = []
  tabPosts.value = []
  pinnedPost.value = null
  partnerProfile.value = null
  userGroupsList.value = []
  userGroupsCount.value = 0
  userGroupsPinnedOnly.value = false
  userGroupsHidden.value = false
  Object.assign(relation, { aFollowsB: false, bFollowsA: false, friends: false })

  try {
    const result = await userStore.fetchProfile(slug)
    viewedProfile.value = result
    if (result) {
      const userId = result.id
      loadMediaLabels(userId)
      await Promise.all([
        loadFriends(userId),
        loadFollowingList(userId),
        loadUserGroupsCount(userId),
        authStore.isAuthenticated && !isOwnProfile.value ? loadRelation(userId) : Promise.resolve(),
        authStore.isAuthenticated && !isOwnProfile.value ? checkUserBookmark() : Promise.resolve(),
        loadProfileBlockStatus(userId),
        fetchOnlineStatus(userId),
        result.relationship_with ? loadPartnerProfile(result.relationship_with) : Promise.resolve(),
        loadProfileSoonBadges(userId),
        fetchProfileStories(userId),
        loadProfileFursonas(userId),
        loadProfileFursuits(userId),
      ])
      if (result.pinnedPost) pinnedPost.value = result.pinnedPost
      applyProfileStatus(result.profile_status)
      await loadTabData('posts')
    }
  } catch {
    error.value = langStore.t.profileLoadFailedError
  } finally {
    isLoading.value = false
  }
}

async function loadFriends(userId: string) {
  try {
    const res = await api.get(`/follows/${userId}/followers`)
    if (res.data.success) { followers.value = res.data.data.users; friendsListRestricted.value = false }
  } catch (e) {
    if (apiErrorStatus(e) === 403) { followers.value = []; friendsListRestricted.value = true }
  }
}

async function loadFollowingList(userId: string) {
  followingLoading.value = true
  try {
    const res = await api.get(`/follows/${userId}/following`)
    if (res.data.success) { following.value = res.data.data.users; friendsListRestricted.value = false }
  } catch (e) {
    if (apiErrorStatus(e) === 403) { following.value = []; friendsListRestricted.value = true }
  } finally {
    followingLoading.value = false
  }
}

async function loadPartnerProfile(partnerId: string) {
  try {
    const res = await api.get(`/users/${partnerId}`)
    if (res.data.success) partnerProfile.value = res.data.data.user
    else partnerProfile.value = null
  } catch { partnerProfile.value = null }
}

async function loadRelation(userId: string) {
  try {
    const [relRes, notifyRes] = await Promise.all([
      api.get(`/follows/${userId}/relation`),
      api.get(`/users/${userId}/notify-status`).catch(() => null),
    ])
    if (relRes.data.success) {
      relation.aFollowsB = relRes.data.data.aFollowsB
      relation.bFollowsA = relRes.data.data.bFollowsA
      relation.friends = relRes.data.data.friends
    }
    if (notifyRes?.data?.success) {
      notifyPosts.value = notifyRes.data.data.notifyPosts
    }
  } catch {}
}

async function toggleNotify() {
  if (!viewedProfile.value || !relation.aFollowsB || notifyLoading.value) return
  notifyLoading.value = true
  try {
    const res = await api.post(`/users/${viewedProfile.value.id}/notify-toggle`)
    if (res.data.success) notifyPosts.value = res.data.data.notifyPosts
  } catch { /* silent */ }
  finally { notifyLoading.value = false }
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
    } else if (tab === 'archive') {
      const res = await api.get(`/posts/user/${uid}/archived`)
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
    } else if (tab === 'followers') {
      await loadFriends(uid)
    } else if (tab === 'following') {
      await loadFollowingList(uid)
    } else if (tab === 'mutual_groups') {
      const res = await api.get(`/groups/common/${uid}`)
      if (res.data.success) mutualGroups.value = res.data.data.groups
    } else if (tab === 'stats') {
      if (authStore.user?.subscription_tier !== 'free') {
        const res = await api.get('/users/me/profile-stats')
        if (res.data.success) profileStatsData.value = res.data.data.stats
      }
    }
    // Fetch repaw/vote/favourite status for loaded posts
    if (['posts', 'repaws', 'media', 'archive', 'likes'].includes(tab) && authStore.isAuthenticated && tabPosts.value.length) {
      const ids = tabPosts.value.map((p) => p.id).join(',')
      try {
        const st = await api.get(`/posts/status?ids=${ids}`)
        if (st.data.success) {
          for (const s of st.data.data) {
            profilePostStatus[s.id] = { repawed: s.repawed ?? false, favourited: s.favourited ?? false, userVote: s.userVote ?? 0 }
          }
        }
      } catch { /* non-critical */ }
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
      invalidateFriendsCache()
      relation.friends = relation.aFollowsB && relation.bFollowsA
      if (viewedProfile.value._count) viewedProfile.value._count.followers += relation.aFollowsB ? 1 : -1
    }
  } catch (e) {
    console.error('follow toggle failed', e)
    messageErrorNotice.value = apiErrorMessage(e) ?? null
    setTimeout(() => { messageErrorNotice.value = null }, 4000)
  }
  finally { isTogglingFollow.value = false }
}

// ── User bookmark ─────────────────────────────────────────────────────────────
const isUserBookmarked   = ref(false)
const isTogglingBookmark = ref(false)

async function checkUserBookmark() {
  if (!viewedProfile.value || isOwnProfile.value || !authStore.user) return
  try {
    const res = await api.get(`/bookmarks/users/${viewedProfile.value.id}`)
    if (res.data.success) isUserBookmarked.value = res.data.data.bookmarked
  } catch { /* ignore */ }
}

async function toggleUserBookmark() {
  if (!viewedProfile.value || isTogglingBookmark.value) return
  isTogglingBookmark.value = true
  try {
    const res = await api.post(`/bookmarks/users/${viewedProfile.value.id}`)
    if (res.data.success) isUserBookmarked.value = res.data.data.bookmarked
  } catch (e) { console.error('bookmark toggle failed', e) }
  finally { isTogglingBookmark.value = false }
}

// ── Profile "..." menu (copy link / report / block) ────────────────────────
const showProfileMenu       = ref(false)
const profileMenuBtnRef     = ref<HTMLElement | null>(null)
const profileMenuPos        = ref({ top: '0px', right: '0px' })
const profileLinkCopied     = ref(false)
const showProfileReportModal = ref(false)
const isBlockingProfileUser = ref(false)

function toggleProfileMenu() {
  if (!showProfileMenu.value && profileMenuBtnRef.value) {
    const rect = profileMenuBtnRef.value.getBoundingClientRect()
    profileMenuPos.value = {
      top: `${rect.bottom + 6}px`,
      right: `${window.innerWidth - rect.right}px`,
    }
  }
  showProfileMenu.value = !showProfileMenu.value
}

async function copyProfileLink() {
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/profile/${viewedProfile.value?.username}`)
    profileLinkCopied.value = true
    setTimeout(() => { profileLinkCopied.value = false }, 2000)
  } catch { /* ignore */ }
  showProfileMenu.value = false
}

const isProfileBlocked = ref(false)

async function loadProfileBlockStatus(userId: string) {
  isProfileBlocked.value = false
  if (!authStore.isAuthenticated || isOwnProfile.value) return
  try {
    const res = await api.get(`/users/${userId}/block-status`)
    isProfileBlocked.value = !!res.data.data?.blocked
  } catch { /* меню покажет «Отправить в ЧС» по умолчанию */ }
}

async function toggleProfileBlock() {
  if (!viewedProfile.value || isBlockingProfileUser.value) return
  isBlockingProfileUser.value = true
  showProfileMenu.value = false
  try {
    if (isProfileBlocked.value) {
      await api.delete(`/users/${viewedProfile.value.id}/block`)
      isProfileBlocked.value = false
    } else {
      await api.post(`/users/${viewedProfile.value.id}/block`)
      isProfileBlocked.value = true
      // Остаёмся на профиле и подтверждаем результат — раньше редирект на главную выглядел как «ничего не случилось»
      messageErrorNotice.value = langStore.t.profileBlacklistedNotice
      setTimeout(() => { messageErrorNotice.value = null }, 3000)
      await loadRelation(viewedProfile.value.id)
    }
  } catch (e) { console.error('block toggle failed', e) }
  finally { isBlockingProfileUser.value = false }
}

// ── Click-outside directive ─────────────────────────────────────────────────
type ClickOutsideEl = HTMLElement & { _clickOutside?: (e: Event) => void }
const vClickOutside: Directive<ClickOutsideEl, (e: Event) => void> = {
  mounted(el, binding) {
    el._clickOutside = (e: Event) => {
      if (!el.contains(e.target as Node)) binding.value(e)
    }
    document.addEventListener('click', el._clickOutside, true)
  },
  unmounted(el) {
    if (el._clickOutside) document.removeEventListener('click', el._clickOutside, true)
  },
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


function onPostDeleted(postId: string) {
  tabPosts.value = tabPosts.value.filter((p) => p.id !== postId)
  if (pinnedPost.value?.id === postId) pinnedPost.value = null
  if (viewedProfile.value?._count) viewedProfile.value._count.posts = Math.max(0, viewedProfile.value._count.posts - 1)
}

function onPostUpdated(post: Post) {
  const idx = tabPosts.value.findIndex((p) => p.id === post.id)
  if (idx !== -1) tabPosts.value[idx] = { ...tabPosts.value[idx], ...post }
  if (pinnedPost.value?.id === post.id) pinnedPost.value = { ...pinnedPost.value, ...post }
}

onMounted(() => {
  loadProfile()
  window.addEventListener('keydown', onKeyDown)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})
watch(() => route.params.username, () => { aboutTab.value = 'about'; activeContentTab.value = 'posts'; loadProfile() })
// stories are loaded inside loadProfile via fetchProfileStories

</script>

<style scoped>
.note-bar-profile {
  animation: noteBarProfile 0.6s ease-in-out infinite;
}

/* ── Status music preview volume slider ─────────────────────────────────── */
.status-volume-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(to right,
    var(--slider-color, #4C67CF) var(--slider-fill, 70%),
    rgba(255,255,255,0.15) var(--slider-fill, 70%));
  outline: none;
  cursor: pointer;
}
.status-volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.45);
  cursor: pointer;
  transition: transform 0.15s;
}
.status-volume-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }
.status-volume-slider::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border: none;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.45);
  cursor: pointer;
}
.status-volume-slider::-moz-range-track {
  height: 3px;
  border-radius: 999px;
  background: rgba(255,255,255,0.15);
}
.status-volume-slider::-moz-range-progress {
  height: 3px;
  border-radius: 999px;
  background: var(--slider-color, #4C67CF);
}

/* ── Species chip on own profile banner: subtle glow to hint it's clickable ── */
.species-chip-pulse {
  animation: species-chip-glow 2.6s ease-in-out infinite;
}
@keyframes species-chip-glow {
  0%, 100% { box-shadow: 0 0 0 rgba(167,139,250,0); }
  50%      { box-shadow: 0 0 14px rgba(167,139,250,0.45); }
}
@keyframes noteBarProfile {
  0%, 100% { transform: scaleY(0.35) }
  50%       { transform: scaleY(1) }
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(-4px) }

/* Lightbox overlay transition */
.lightbox-fade-enter-active, .lightbox-fade-leave-active { transition: opacity 0.2s ease }
.lightbox-fade-enter-from, .lightbox-fade-leave-to { opacity: 0 }

/* Lightbox next/prev slide transition */
.lightbox-slide-next-enter-active, .lightbox-slide-next-leave-active,
.lightbox-slide-prev-enter-active, .lightbox-slide-prev-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}
.lightbox-slide-next-enter-from { opacity: 0; transform: translateX(48px) scale(0.98); }
.lightbox-slide-next-leave-to   { opacity: 0; transform: translateX(-48px) scale(0.98); }
.lightbox-slide-prev-enter-from { opacity: 0; transform: translateX(-48px) scale(0.98); }
.lightbox-slide-prev-leave-to   { opacity: 0; transform: translateX(48px) scale(0.98); }

@keyframes fade-in {
  from { opacity: 0; transform: translateY(-4px) }
  to   { opacity: 1; transform: translateY(0) }
}
.animate-fade-in { animation: fade-in 0.3s ease forwards }

/* ── Story ring: animated rotating gradient around avatar ── */
@keyframes story-ring-spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.story-ring-gradient {
  background: conic-gradient(#4C67CF, #a855f7, #ec4899, #f97316, #4C67CF);
  animation: story-ring-spin 3s linear infinite;
}


.slide-down-enter-active, .slide-down-leave-active { transition: all 0.25s ease; overflow: hidden; }
.slide-down-enter-from, .slide-down-leave-to { opacity: 0; max-height: 0; }
.slide-down-enter-to, .slide-down-leave-from { opacity: 1; max-height: 300px; }

/* Status note bubble: pop-in/out when it appears, changes, or expires */
.status-pop-enter-active { transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1); }
.status-pop-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; position: absolute; }
.status-pop-enter-from { opacity: 0; transform: translateY(-6px) scale(0.92); }
.status-pop-leave-to { opacity: 0; transform: translateY(-4px) scale(0.95); }

/* Slow ambient glow pulse on an active status bubble/icon */
.status-bubble-glow { animation: statusBubbleGlow 3.2s ease-in-out infinite; }
@keyframes statusBubbleGlow {
  0%, 100% { filter: brightness(1); }
  50%      { filter: brightness(1.08); }
}
.status-icon-glow {
  background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.35) 50%, transparent 70%);
  background-size: 200% 100%;
  animation: statusIconShimmer 2.8s ease-in-out infinite;
  pointer-events: none;
}
@keyframes statusIconShimmer {
  0%   { background-position: 150% 0; }
  100% { background-position: -50% 0; }
}
</style>
