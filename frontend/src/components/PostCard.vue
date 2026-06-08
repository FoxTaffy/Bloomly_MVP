<template>
  <!-- Hidden state after "Не интересно" -->
  <div v-if="isHidden" class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-sm">
    <div class="flex items-center justify-between px-5 py-3.5">
      <span class="text-sm text-white/35">Пост скрыт</span>
      <button @click="isHidden = false" class="text-xs text-brand-accent/70 hover:text-brand-accent transition-colors">Отменить</button>
    </div>
  </div>

  <div v-else class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl hover:border-brand-accent/30 transition-all group select-none">
    <!-- Announcement banner -->
    <div v-if="post.is_announcement" class="flex items-center gap-2 px-5 py-2.5 bg-brand-yellow/10 border-b border-brand-yellow/25">
      <BIcon name="Megaphone" class="w-3.5 h-3.5 text-brand-yellow flex-shrink-0" />
      <span class="text-[11px] font-bold uppercase tracking-wide text-brand-yellow">Анонс</span>
    </div>
    <!-- Post type badge (artwork / article / commission_update) -->
    <div v-else-if="post.post_type && post.post_type !== 'general' && post.post_type !== 'announcement'"
      class="flex items-center gap-2 px-5 py-2 border-b border-brand-border/60"
      :class="{
        'bg-rose-500/6': post.post_type === 'artwork',
        'bg-blue-500/6': post.post_type === 'article',
        'bg-violet-500/6': post.post_type === 'commission_update',
      }">
      <BIcon
        :name="post.post_type === 'artwork' ? 'Palette' : post.post_type === 'article' ? 'Newspaper' : 'Scissors'"
        class="w-3.5 h-3.5 flex-shrink-0"
        :class="{
          'text-rose-400': post.post_type === 'artwork',
          'text-blue-400': post.post_type === 'article',
          'text-violet-400': post.post_type === 'commission_update',
        }" />
      <span class="text-[11px] font-bold uppercase tracking-wide"
        :class="{
          'text-rose-400': post.post_type === 'artwork',
          'text-blue-400': post.post_type === 'article',
          'text-violet-400': post.post_type === 'commission_update',
        }">
        {{ post.post_type === 'artwork' ? 'Новая работа' : post.post_type === 'article' ? 'Статья' : 'Обновление заказа' }}
      </span>
    </div>
    <div class="p-5 md:p-6">

      <!-- ── Header ────────────────────────────────────────────────────── -->
      <div class="flex items-start justify-between gap-3 mb-4">
        <div class="flex items-center gap-3 min-w-0 cursor-pointer"
          @click="effectiveGroupContext ? router.push(`/groups/${effectiveGroupContext.slug}`) : (post.author?.username ? router.push(`/profile/${post.author.username}`) : null)">
          <!-- Avatar -->
          <div class="relative flex-shrink-0">
            <img
              v-if="effectiveGroupContext && effectiveGroupContext.avatar_url"
              :src="effectiveGroupContext.avatar_url"
              :alt="effectiveGroupContext.name"
              class="w-11 h-11 rounded-xl object-cover border border-brand-border"
              width="44" height="44"
              @error="onAvatarError"
            />
            <div
              v-else-if="effectiveGroupContext && !effectiveGroupContext.avatar_url"
              class="w-11 h-11 rounded-xl border border-brand-border bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-base"
            >
              {{ avatarInitial(effectiveGroupContext.name) }}
            </div>
            <img
              v-else-if="!effectiveGroupContext"
              :src="post.author?.avatar_url || '/icons/badges/NN.jpg'"
              :alt="post.author?.display_name || post.author?.username"
              class="w-11 h-11 rounded-full object-cover border border-brand-border"
              width="44" height="44"
              @error="onAvatarError"
            />
            <!-- Follow quick-add button -->
            <button
              v-if="!effectiveGroupContext && showFollowButton && authStore.user && post.author?.id !== authStore.user?.id && localFollowing === false"
              @click.stop="toggleFollow"
              class="absolute -bottom-1 -right-1 w-5 h-5 bg-brand-accent rounded-full flex items-center justify-center border-2 border-brand-card hover:bg-brand-accent-plus transition-colors"
              title="Подписаться"
            >
              <BIcon name="Plus" class="w-3 h-3 text-white" />
            </button>
          </div>

          <div class="min-w-0">
            <!-- Display labels row -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <h4 class="font-bold text-white truncate hover:text-brand-accent transition-colors">
                {{ effectiveGroupContext ? effectiveGroupContext.name : (post.author?.display_name || post.author?.username || 'Аноним') }}
              </h4>
              <!-- Verification badge — only for user posts -->
              <template v-if="!effectiveGroupContext && post.author">
                <img v-if="post.author.is_verified"
                  src="/icons/badges/paw_offical.svg"
                  class="w-4 h-4 flex-shrink-0" title="Верифицирован" />
                <!-- AD badge -->
                <span v-if="post.author?.role === 'ad'"
                  class="inline-flex items-center gap-0.5 text-[9px] font-extrabold uppercase tracking-wider text-amber-400 bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.5 rounded-md">
                  AD
                </span>
              </template>

              <span v-if="showRepawLabel"
                class="inline-flex items-center gap-1 text-[10px] text-white/55 bg-brand-bg border border-brand-border px-1.5 py-0.5 rounded-md font-semibold">
                <BIcon name="Repeat2" class="w-3 h-3" /> Репав
              </span>
              <span v-if="isPinnedThis"
                class="inline-flex items-center gap-1 text-[10px] text-brand-accent/70 bg-brand-accent/10 border border-brand-accent/20 px-1.5 py-0.5 rounded-md font-semibold">
                <BIcon name="Pin" class="w-3 h-3" /> Закреплён
              </span>
            </div>
            <p v-if="effectiveGroupContext" class="text-xs text-white/55 truncate">@{{ effectiveGroupContext.slug }} · {{ fmtDate(post.created_at) }}</p>
            <p v-else class="text-xs text-white/55 truncate">@{{ post.author.username }} · {{ fmtDate(post.created_at) }}</p>
          </div>
        </div>

        <!-- Right: NSFW badge + context menu -->
        <div class="flex items-center gap-2 flex-shrink-0">
          <span
            v-if="post.is_nsfw"
            class="px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-brand-error/15 text-brand-error border border-brand-error/30"
          >NSFW</span>

          <!-- Three-dot menu -->
          <div class="relative">
            <button
              ref="menuBtnRef"
              @click.stop="toggleMenu"
              class="text-white/55 hover:text-white p-2 rounded-full hover:bg-white/5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
            >
              <BIcon name="MoreHorizontal" class="w-5 h-5" />
            </button>

            <!-- Dropdown teleported to body to escape overflow:hidden -->
            <Teleport to="body">
              <div
                v-if="showMenu"
                v-click-outside="() => showMenu = false"
                class="fixed z-[9998] w-56 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1"
                :style="{ top: menuPos.top, right: menuPos.right }"
              >
              <!-- Owner actions -->
              <button v-if="canPin && !isPinnedThis" @click="emit('pin', post.id); showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5">
                <BIcon name="Pin" class="w-4 h-4 text-brand-accent" /> Закрепить
              </button>
              <button v-if="canPin && isPinnedThis" @click="emit('unpin'); showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5">
                <BIcon name="PinOff" class="w-4 h-4 text-brand-accent" /> Открепить
              </button>
              <button v-if="isOwn" @click="startEdit"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-white/5">
                <BIcon name="Pencil" class="w-4 h-4 text-brand-accent" /> Редактировать
              </button>
              <button v-if="isOwn" @click="doDelete" :disabled="isDeleting"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 disabled:opacity-50">
                <BIcon name="Trash2" class="w-4 h-4" /> Удалить
              </button>

              <!-- Divider if owner -->
              <div v-if="isOwn" class="my-1 border-t border-brand-border/50" />

              <!-- Copy link -->
              <button @click="copyPostLink" class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white">
                <BIcon :name="linkCopied ? 'CheckCheck' : 'Link'" class="w-4 h-4" />
                {{ linkCopied ? 'Скопировано!' : 'Копировать ссылку' }}
              </button>

              <!-- Share -->
              <button @click="doShare" class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white">
                <BIcon name="Share2" class="w-4 h-4" /> Поделиться
              </button>

              <!-- Non-owner actions -->
              <template v-if="!isOwn">
                <div class="my-1 border-t border-brand-border/50" />

                <!-- Не интересно -->
                <button @click="markNotInterested" class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white">
                  <BIcon name="EyeOff" class="w-4 h-4" /> Не интересно
                </button>

                <!-- Уведомления о постах -->
                <button @click="toggleNotify" class="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/5 transition-colors"
                  :class="notifyPosts ? 'text-brand-accent' : 'text-white/70 hover:text-white'">
                  <BIcon :name="notifyPosts ? 'BellOff' : 'Bell'" class="w-4 h-4" />
                  {{ notifyPosts ? 'Откл. уведомления' : 'Уведомления о постах' }}
                </button>

                <!-- Пожаловаться -->
                <button @click="showReportModal = true; showMenu = false" class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-amber-400 hover:bg-amber-500/10">
                  <BIcon name="Flag" class="w-4 h-4" /> Пожаловаться
                </button>

                <!-- Отправить в ЧС -->
                <button @click="blockUser" :disabled="isBlocking" class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 disabled:opacity-50">
                  <BIcon name="UserX" class="w-4 h-4" /> {{ isBlocking ? 'Блокировка...' : 'Отправить в ЧС' }}
                </button>
              </template>
              </div>
            </Teleport>
          </div>
        </div>
      </div>

      <!-- ── Reward for banner ───────────────────────────────────────── -->
      <div v-if="post.rewardForUser" class="flex items-center gap-2 mb-3 mt-1">
        <span class="text-xs text-white/40 font-medium">Reward for</span>
        <button
          @click.stop="router.push(`/profile/${post.rewardForUser.username}`)"
          class="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-brand-bg border border-brand-border hover:border-brand-accent/40 transition-colors"
        >
          <img v-if="post.rewardForUser.avatar_url" :src="post.rewardForUser.avatar_url" class="w-4 h-4 rounded-full object-cover" @error="onAvatarError" />
          <div v-else class="w-4 h-4 rounded-full bg-brand-accent/20 flex items-center justify-center text-[8px] font-bold text-brand-accent">
            {{ (post.rewardForUser.display_name || post.rewardForUser.username || '?')[0].toUpperCase() }}
          </div>
          <span class="text-xs text-white/80 font-semibold">{{ post.rewardForUser.display_name || post.rewardForUser.username }}</span>
        </button>
      </div>

      <!-- ── Content ───────────────────────────────────────────────────── -->
      <div class="space-y-3">

        <!-- Article title (news/article post_type) -->
        <h3 v-if="post.title" class="text-white font-extrabold text-lg leading-tight">{{ post.title }}</h3>

        <!-- Inline edit form -->
        <div v-if="isEditing" class="mb-1">
          <textarea
            v-model="editContent"
            autofocus
            rows="3"
            class="w-full bg-brand-bg border border-brand-accent/50 rounded-2xl px-4 py-3 text-white text-[15px] leading-relaxed resize-none outline-none focus:border-brand-accent"
          ></textarea>
          <div class="flex gap-2 mt-2 justify-end">
            <button @click="cancelEdit" class="px-4 py-1.5 text-sm text-white/55 hover:text-white hover:bg-white/5 rounded-xl">Отмена</button>
            <button @click="saveEdit" :disabled="isSaving"
              class="px-4 py-1.5 text-sm bg-brand-accent text-white font-bold rounded-xl hover:bg-brand-accent-plus disabled:opacity-50">
              {{ isSaving ? 'Сохранение...' : 'Сохранить' }}
            </button>
          </div>
        </div>

        <!-- Post text with mention highlighting -->
        <div v-if="!isEditing && (post.content || '').trim()">
          <p class="text-white/95 text-sm md:text-[15px] leading-relaxed whitespace-pre-wrap">
            <template v-if="postShowTranslation && postTranslating">
              <span class="inline-flex items-center gap-1.5 text-white/40 text-sm">
                <span class="w-3.5 h-3.5 border-2 border-brand-accent/60 border-t-transparent rounded-full animate-spin inline-block" />
                {{ langStore.t.translating }}
              </span>
            </template>
            <template v-else>
              <template v-for="seg in displayContent" :key="seg.key">
                <span v-if="seg.type === 'text'">{{ seg.text }}</span>
                <!-- ── MENTION PILL ── -->
                <span v-else
                  class="mention-pill inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 bg-brand-accent/15 border border-brand-accent/30 text-brand-accent text-[13px] font-semibold cursor-pointer hover:bg-brand-accent/25 transition-all align-middle"
                  :class="mentionGroups[seg.username!] ? 'rounded-xl' : 'rounded-full'"
                  style="vertical-align: middle; white-space: nowrap;"
                  @click.stop="goToMention(seg.username!)"
                  @mouseenter="onMentionEnter(seg.username!, $event)"
                  @mouseleave="onMentionLeave()"
                >
                  <!-- Avatar or initials -->
                  <span
                    class="flex-shrink-0 w-5 h-5 overflow-hidden border border-brand-accent/40 bg-brand-accent/20 flex items-center justify-center"
                    :class="mentionGroups[seg.username!] ? 'rounded-md' : 'rounded-full'"
                  >
                    <img
                      v-if="(mentionGroups[seg.username!] ?? mentionUsers[seg.username!])?.avatar_url"
                      :src="(mentionGroups[seg.username!] ?? mentionUsers[seg.username!])!.avatar_url!"
                      class="w-full h-full object-cover"
                      loading="lazy"
                      @error="onAvatarError"
                    />
                    <span v-else class="text-[8px] font-bold text-brand-accent leading-none">
                      {{ (seg.username ?? '?')[0].toUpperCase() }}
                    </span>
                  </span>
                  <!-- Label: group name or @username -->
                  <span class="leading-none">{{ mentionGroups[seg.username!] ? mentionGroups[seg.username!]!.name : seg.username }}</span>
                </span>
              </template>
            </template>
          </p>
          <!-- Translate button -->
          <button
            v-if="!isEditing"
            @click.stop="togglePostTranslate"
            class="mt-1.5 flex items-center gap-1 text-[11px] text-white/35 hover:text-brand-accent transition-colors"
          >
            <svg v-if="!postTranslating" class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"/>
            </svg>
            <span v-if="postTranslating" class="w-3 h-3 border border-brand-accent/60 border-t-transparent rounded-full animate-spin" />
            {{ postShowTranslation ? langStore.t.showOriginal : langStore.t.autoTranslate }}
          </button>
        </div>

        <!-- ── Media carousel ────────────────────────────────────── -->
        <div
          v-if="post.media_urls && post.media_urls.length"
          class="relative mt-3 rounded-2xl overflow-hidden bg-black/20 group/carousel"
          :class="adMode ? 'select-none' : ''"
          @contextmenu="adMode ? ($event as Event).preventDefault() : null"
          @touchstart.passive="carouselTouchStart"
          @touchend.passive="carouselTouchEnd"
        >
          <!-- Media content (blurred when restricted) -->
          <div
            class="transition-all duration-300"
            :class="(post.is_nsfw && !nsfwEnabled) || (isPaywalled && !paidRevealed) ? 'blur-xl scale-110 pointer-events-none select-none' : ''"
          >
            <!-- Slide -->
            <div class="carousel-track" :style="{ transform: `translateX(-${carouselIndex * 100}%)` }">
              <div
                v-for="(url, i) in post.media_urls"
                :key="i"
                class="carousel-slide"
                :style="isImg(url) ? { '--blur-url': `url(${url})` } : {}"
                :data-has-blur="isImg(url) ? 'true' : 'false'"
                @click="openLightbox(i)"
              >
                <CustomPlayer :src="url" @click-image="openLightbox(i)" />
              </div>
            </div>

            <!-- Counter badge -->
            <div
              v-if="post.media_urls.length > 1"
              class="absolute top-2.5 left-2.5 z-10 px-2.5 py-1 rounded-full bg-black/60 text-white text-xs font-bold backdrop-blur-sm border border-white/10 select-none"
            >
              {{ carouselIndex + 1 }}&thinsp;/&thinsp;{{ post.media_urls.length }}
            </div>

            <!-- Prev / Next arrows -->
            <button
              v-if="post.media_urls.length > 1 && carouselIndex > 0"
              @click.stop="carouselIndex--"
              class="carousel-arrow left-2 opacity-0 group-hover/carousel:opacity-100"
            >
              <BIcon name="ChevronLeft" class="w-5 h-5" />
            </button>
            <button
              v-if="post.media_urls.length > 1 && carouselIndex < post.media_urls.length - 1"
              @click.stop="carouselIndex++"
              class="carousel-arrow right-2 opacity-0 group-hover/carousel:opacity-100"
            >
              <BIcon name="ChevronRight" class="w-5 h-5" />
            </button>

            <!-- Dots -->
            <div
              v-if="post.media_urls.length > 1"
              class="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 flex gap-1.5 select-none"
            >
              <button
                v-for="(_, i) in post.media_urls"
                :key="i"
                @click.stop="carouselIndex = i"
                class="w-1.5 h-1.5 rounded-full transition-all duration-200"
                :class="i === carouselIndex ? 'bg-white w-4' : 'bg-white/40'"
              />
            </div>

            <!-- Expand to lightbox with comments -->
            <button
              @click.stop="openLightbox(carouselIndex)"
              class="absolute top-2.5 right-2.5 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-black/80 transition-colors opacity-0 group-hover/carousel:opacity-100"
              title="Открыть"
            >
              <BIcon name="Expand" class="w-4 h-4" />
            </button>
          </div>

          <!-- ── NSFW overlay ─────────────────────────────────── -->
          <Transition name="fade">
            <div
              v-if="post.is_nsfw && !nsfwEnabled"
              class="absolute inset-0 z-20 flex items-center justify-center"
              style="background: rgba(0,0,0,0.55)"
            >
              <div class="bg-[#1a1a2e]/95 backdrop-blur-md border border-white/10 rounded-2xl px-8 py-7 text-center max-w-xs mx-4 shadow-2xl">
                <!-- Warning triangle -->
                <div class="w-14 h-14 rounded-full border-2 border-red-500/40 bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                  <BIcon name="AlertTriangle" class="w-7 h-7 text-red-400" />
                </div>
                <h3 class="font-bold text-white text-lg mb-2">NSFW Контент</h3>
                <p class="text-white/45 text-sm mb-5">Данный контент предназначен для пользователей старше 18 лет. Включите NSFW в верхней панели.</p>
                <button
                  @click.stop="enableNsfw()"
                  class="w-full py-2.5 bg-red-500 hover:bg-red-400 active:bg-red-600 text-white font-bold text-sm rounded-xl transition-colors"
                >
                  Включить NSFW
                </button>
              </div>
            </div>
          </Transition>

          <!-- ── Paid / subscriber-only overlay ──────────────── -->
          <Transition name="fade">
            <div
              v-if="(!post.is_nsfw || nsfwEnabled) && isPaywalled && !paidRevealed"
              class="absolute inset-0 z-20 flex flex-col items-center justify-center px-6 py-8"
              style="background: rgba(0,0,0,0.6)"
            >
              <template v-if="post.video_title">
                <h3 class="font-bold text-white text-lg mb-1 text-center">{{ post.video_title }}</h3>
                <p v-if="post.video_description" class="text-white/55 text-sm mb-2 text-center">{{ post.video_description }}</p>
              </template>
              <div class="flex items-center gap-3 mt-4 flex-wrap justify-center">
                <button
                  class="inline-flex items-center gap-2 px-5 py-2.5 bg-black/55 border border-white/20 rounded-full text-white text-sm font-semibold hover:bg-black/75 transition-colors"
                >
                  <BIcon name="Lock" class="w-4 h-4" /> Подписаться
                </button>
                <button
                  v-if="post.is_paid"
                  class="inline-flex items-center gap-2 px-5 py-2.5 bg-black/55 border border-white/20 rounded-full text-white text-sm font-semibold hover:bg-black/75 transition-colors"
                >
                  <BIcon name="Lock" class="w-4 h-4" /> Купить видео
                </button>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Category + tags -->
        <div v-if="post.category || (post.tags && post.tags.length)" class="flex flex-wrap items-center gap-1.5 mt-1">
          <span v-if="post.category"
            class="px-3 py-1 bg-brand-accent/20 text-brand-accent text-xs font-bold rounded-full border border-brand-accent/30">
            {{ post.category }}
          </span>
          <span
            v-for="tag in post.tags" :key="tag.tag?.id ?? tag.id"
            class="px-3 py-1 bg-brand-bg text-white/55 text-xs font-medium rounded-full border border-brand-border hover:bg-brand-border hover:text-white cursor-pointer transition-colors"
          >
            #{{ tag.tag?.name ?? tag.name }}
          </span>
        </div>
      </div>

      <!-- ── Actions ───────────────────────────────────────────────────── -->
      <div class="flex items-center justify-between pt-4 mt-4 border-t border-brand-border">
        <div class="flex items-center gap-2">
          <!-- Vote -->
          <div class="flex items-center gap-1 bg-brand-bg rounded-full p-1 border border-brand-border">
            <button @click="vote(1)"
              class="p-1 rounded-full transition-all duration-150"
              :class="localVote === 1
                ? 'bg-brand-success/25 text-brand-success shadow-[0_0_8px_0px] shadow-brand-success/40'
                : 'text-white/55 hover:bg-brand-success/20 hover:text-brand-success'">
              <BIcon name="ThumbsUp" class="w-4 h-4" />
            </button>
            <span class="font-bold text-sm min-w-[28px] text-center"
              :class="localVote === 1 ? 'text-emerald-400' : localVote === -1 ? 'text-rose-400' : localRating > 0 ? 'text-emerald-400' : localRating < 0 ? 'text-rose-400' : 'text-white'">
              {{ localRating }}
            </span>
            <button @click="vote(-1)"
              class="p-1 rounded-full transition-all duration-150"
              :class="localVote === -1
                ? 'bg-rose-500/25 text-rose-400 shadow-[0_0_8px_0px] shadow-rose-500/40'
                : 'text-white/55 hover:bg-rose-500/20 hover:text-rose-400'">
              <BIcon name="ThumbsDown" class="w-4 h-4" />
            </button>
          </div>

          <!-- Repaw -->
          <button v-if="!adMode" @click="toggleRepaw"
            :disabled="authStore.user?.id === post.author?.id"
            :title="authStore.user?.id === post.author?.id ? 'Нельзя репавсить свой пост' : undefined"
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-all"
            :class="[
              localRepawed
                ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
                : 'bg-brand-bg border-brand-border text-white/55 hover:text-brand-accent hover:border-brand-accent/30',
              authStore.user?.id === post.author?.id ? 'opacity-40 cursor-not-allowed' : ''
            ]">
            <BIcon name="Repeat2" class="w-4 h-4" />
            <span class="text-sm">{{ localRepaws }}</span>
          </button>

          <!-- Comments toggle -->
          <button @click="isExpanded = !isExpanded"
            class="flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs transition-all"
            :class="isExpanded
              ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
              : 'bg-brand-bg border-brand-border text-white/55 hover:text-white'">
            <BIcon name="MessageSquare" class="w-4 h-4" />
            <span>{{ post._count?.comments ?? 0 }}</span>
          </button>
        </div>

        <div class="flex items-center gap-1">
          <!-- Favourite -->
          <button @click="toggleFavourite"
            class="p-2 rounded-full border transition-all"
            :class="localFavourited
              ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400'
              : 'bg-brand-bg border-brand-border text-white/55 hover:text-yellow-400 hover:border-yellow-500/30'">
            <BIcon :name="localFavourited ? 'BookmarkCheck' : 'Bookmark'" class="w-4.5 h-4.5" />
          </button>

          <!-- Share -->
          <button v-if="!adMode" @click="doShare"
            class="p-2 rounded-full border bg-brand-bg border-brand-border text-white/55 hover:text-white hover:border-brand-border/80 transition-all">
            <BIcon name="Share2" class="w-4.5 h-4.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- ── Share & Report modals ─────────────────────────────────────────── -->
    <ShareModal v-model="showShareModal" :post-id="post.id" :post-url="postUrl" />
    <ReportModal v-model="showReportModal" :target-id="post.id" target-type="post" />

    <!-- ── Comments section ──────────────────────────────────────────────── -->
    <Transition name="slide">
      <div v-if="isExpanded" class="border-t border-brand-border px-5 pb-5 pt-4">
        <PostComments :post-id="post.id" />
      </div>
    </Transition>

    <!-- ── Media lightbox ────────────────────────────────────────────────── -->
    <PostLightbox
      v-if="lightboxOpen"
      :images="lightboxUrls"
      :start-index="lightboxIndex"
      :post-id="post.id"
      @close="lightboxOpen = false"
    />
  </div>

  <!-- ── Mention hover popup (teleported to body, escapes overflow:hidden) ── -->
  <Teleport to="body">
    <Transition name="mention-popup">
      <div
        v-if="hoveredMention && (mentionUsers[hoveredMention] || mentionGroups[hoveredMention])"
        class="fixed z-[9999] w-52 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden pointer-events-none"
        :style="{ top: mentionPopupPos.top, left: mentionPopupPos.left, transform: 'translateY(calc(-100% - 6px))' }"
      >
        <!-- Banner -->
        <div class="w-full h-14 relative overflow-hidden bg-gradient-to-br from-brand-accent/30 to-brand-accent-plus/20">
          <img
            v-if="(mentionGroups[hoveredMention] ?? mentionUsers[hoveredMention])?.banner_url"
            :src="(mentionGroups[hoveredMention] ?? mentionUsers[hoveredMention])!.banner_url!"
            class="w-full h-full object-cover"
            loading="lazy"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-brand-card/70 to-transparent"></div>
        </div>
        <!-- Avatar overlapping banner -->
        <div class="px-3 pb-3 -mt-5 relative">
          <div
            class="w-10 h-10 border-2 border-brand-card overflow-hidden bg-brand-accent/20 flex items-center justify-center"
            :class="mentionGroups[hoveredMention] ? 'rounded-xl' : 'rounded-full'"
          >
            <img
              v-if="(mentionGroups[hoveredMention] ?? mentionUsers[hoveredMention])?.avatar_url"
              :src="(mentionGroups[hoveredMention] ?? mentionUsers[hoveredMention])!.avatar_url!"
              class="w-full h-full object-cover"
              loading="lazy"
              @error="onAvatarError"
            />
            <span v-else class="text-sm font-bold text-brand-accent">
              {{ (hoveredMention ?? '?')[0].toUpperCase() }}
            </span>
          </div>
          <div class="mt-1.5">
            <!-- Group popup -->
            <template v-if="mentionGroups[hoveredMention]">
              <div class="text-sm font-bold text-white leading-tight truncate">
                {{ mentionGroups[hoveredMention]!.name }}
              </div>
              <div class="text-xs text-white/55 truncate">@{{ hoveredMention }}</div>
              <div class="text-xs text-white/40 mt-0.5">{{ mentionGroups[hoveredMention]!.members_count }} участников</div>
            </template>
            <!-- User popup -->
            <template v-else>
              <div class="text-sm font-bold text-white leading-tight truncate">
                {{ mentionUsers[hoveredMention]?.display_name || hoveredMention }}
              </div>
              <div class="text-xs text-white/55 truncate">@{{ hoveredMention }}</div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useAutoTranslate } from '@/composables/useAutoTranslate'
import { onAvatarError } from '@/composables/useAvatarFallback'
import api from '@/api'
import BIcon from '@/components/BIcon.vue'
import CustomPlayer from '@/components/CustomPlayer.vue'
import PostComments from '@/components/PostComments.vue'
import PostLightbox from '@/components/PostLightbox.vue'
import ShareModal from '@/components/ShareModal.vue'
import ReportModal from '@/components/ReportModal.vue'

// ── Module-level mention user cache (shared across all PostCard instances) ──
type MentionUser = { id: string; username: string; display_name: string | null; avatar_url: string | null; banner_url: string | null }
const _mentionCache = new Map<string, MentionUser | null>()
const _pendingFetches = new Map<string, Promise<MentionUser | null>>()

async function lookupMentionUser(username: string): Promise<MentionUser | null> {
  if (_mentionCache.has(username)) return _mentionCache.get(username) ?? null
  if (_pendingFetches.has(username)) return _pendingFetches.get(username)!
  const promise = api.get(`/users/search?q=${encodeURIComponent(username)}`).then(r => {
    const users: any[] = r.data.data?.users ?? []
    const found = users.find((u: any) => u.username.toLowerCase() === username.toLowerCase()) ?? null
    const result: MentionUser | null = found ? {
      id: found.id, username: found.username,
      display_name: found.display_name ?? null,
      avatar_url: found.avatar_url ?? null,
      banner_url: found.banner_url ?? null,
    } : null
    _mentionCache.set(username, result)
    _pendingFetches.delete(username)
    return result
  }).catch(() => { _mentionCache.set(username, null); _pendingFetches.delete(username); return null })
  _pendingFetches.set(username, promise)
  return promise
}

// ── Module-level group mention cache ─────────────────────────────────────────
type MentionGroup = { id: string; slug: string; name: string; avatar_url: string | null; banner_url: string | null; members_count: number }
const _mentionGroupCache = new Map<string, MentionGroup | null>()
const _pendingGroupFetches = new Map<string, Promise<MentionGroup | null>>()

async function lookupMentionGroup(slug: string): Promise<MentionGroup | null> {
  if (_mentionGroupCache.has(slug)) return _mentionGroupCache.get(slug) ?? null
  if (_pendingGroupFetches.has(slug)) return _pendingGroupFetches.get(slug)!
  const promise = api.get(`/groups/${encodeURIComponent(slug)}`).then(r => {
    const g = r.data.data?.group ?? null
    const result: MentionGroup | null = g ? {
      id: g.id, slug: g.slug, name: g.name,
      avatar_url: g.avatar_url ?? null,
      banner_url: g.banner_url ?? null,
      members_count: g.members_count ?? 0,
    } : null
    _mentionGroupCache.set(slug, result)
    _pendingGroupFetches.delete(slug)
    return result
  }).catch(() => { _mentionGroupCache.set(slug, null); _pendingGroupFetches.delete(slug); return null })
  _pendingGroupFetches.set(slug, promise)
  return promise
}

// ── Props & emits ─────────────────────────────────────────────────────────
const props = defineProps<{
  post: any
  groupContext?: { id: string; slug: string; name: string; avatar_url: string | null; accent_color?: string | null } | null
  isOwnProfile?: boolean
  isPinnedPostId?: string | null
  showRepawLabel?: boolean
  showFollowButton?: boolean
  initialFollowing?: boolean
  initialVote?: 1 | -1 | 0
  initialRepawed?: boolean
  initialFavourited?: boolean
  adMode?: boolean
}>()

const emit = defineEmits<{
  (e: 'pin', id: string): void
  (e: 'unpin'): void
  (e: 'deleted', id: string): void
  (e: 'updated', post: any): void
}>()

// ── Composables ───────────────────────────────────────────────────────────
const router = useRouter()
const authStore = useAuthStore()
const langStore = useLangStore()

// ── Auto-translate ────────────────────────────────────────────────────────
const {
  translatedText: postTranslated,
  isTranslating: postTranslating,
  showTranslation: postShowTranslation,
  toggle: togglePostTranslate,
} = useAutoTranslate(
  () => props.post.id,
  () => props.post.content ?? '',
)

// ── Local state ───────────────────────────────────────────────────────────
const localRating    = ref<number>(props.post.rating ?? 0)
const localRepaws    = ref<number>(props.post._count?.repaws ?? 0)
const localVote      = ref<1 | -1 | 0>(props.initialVote ?? 0)
const localRepawed   = ref(props.initialRepawed ?? false)
const localFavourited = ref(props.initialFavourited ?? false)
const localFollowing = ref<boolean | null>(props.initialFollowing ?? null)

// Sync with parent postStatus when it loads asynchronously
watch(() => props.initialVote, (val) => { if (val !== undefined) localVote.value = val })
watch(() => props.initialRepawed, (val) => { if (val !== undefined) localRepawed.value = val })
watch(() => props.initialFavourited, (val) => { if (val !== undefined) localFavourited.value = val })

const showMenu    = ref(false)
const menuBtnRef  = ref<HTMLElement | null>(null)
const menuPos     = ref({ top: '0px', right: '0px' })
const isExpanded  = ref(false)

function toggleMenu(e: MouseEvent) {
  e.stopPropagation()
  if (!showMenu.value && menuBtnRef.value) {
    const rect = menuBtnRef.value.getBoundingClientRect()
    menuPos.value = {
      top: `${rect.bottom + 6}px`,
      right: `${window.innerWidth - rect.right}px`,
    }
    // Ленивая загрузка статуса уведомлений при первом открытии меню
    if (!isOwn.value && !notifyLoaded.value && authStore.isAuthenticated) {
      notifyLoaded.value = true
      api.get(`/users/${props.post.author?.id}/notify-status`)
        .then(r => { if (r.data.success) notifyPosts.value = r.data.data.notifyPosts ?? false })
        .catch(() => {})
    }
  }
  showMenu.value = !showMenu.value
}
const isEditing   = ref(false)
const editContent = ref('')
const isSaving    = ref(false)
const isDeleting  = ref(false)
const showShareModal = ref(false)
const showReportModal = ref(false)
const notifyPosts   = ref(false)    // уведомления о постах
const notifyLoaded  = ref(false)    // статус загружен с сервера?
const isBlocking  = ref(false)
const isHidden    = ref(false)    // «не интересно» — скрыт из фида
const linkCopied  = ref(false)

// NSFW / paid reveal state
const { nsfwEnabled, enableNsfw } = useNsfwMode()
const paidRevealed = ref(false)

const repawUndoVisible = ref(false)
const repawCountdown = ref(5)
let repawTimer: ReturnType<typeof setTimeout> | null = null
let repawCountdownTimer: ReturnType<typeof setInterval> | null = null
const repawPending = ref(false)

const lightboxOpen  = ref(false)
const lightboxIndex = ref(0)

// ── Carousel ──────────────────────────────────────────────────────────────
const carouselIndex = ref(0)
watch(() => props.post.id, () => { carouselIndex.value = 0 })

let _carouselTouchX = 0
function carouselTouchStart(e: TouchEvent) { _carouselTouchX = e.touches[0].clientX }
function carouselTouchEnd(e: TouchEvent) {
  const diff = _carouselTouchX - e.changedTouches[0].clientX
  const total = props.post.media_urls?.length ?? 1
  if (diff > 50 && carouselIndex.value < total - 1) carouselIndex.value++
  else if (diff < -50 && carouselIndex.value > 0) carouselIndex.value--
}

// ── Mention hover popup (Teleport-based to escape overflow:hidden) ─────────
const hoveredMention = ref<string | null>(null)
const mentionPopupPos = ref({ top: '0px', left: '0px' })

function onMentionEnter(username: string, e: MouseEvent) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  hoveredMention.value = username
  const left = Math.max(0, Math.min(rect.left, window.innerWidth - 224))
  mentionPopupPos.value = {
    top: `${rect.top}px`,
    left: `${left}px`,
  }
}
function onMentionLeave() { hoveredMention.value = null }

// ── Mention user data ──────────────────────────────────────────────────────
// reactive map so template updates when data arrives
const mentionUsers = ref<Record<string, MentionUser | null>>({})
const mentionGroups = ref<Record<string, MentionGroup | null>>({})

async function loadMentionUsers() {
  const content = props.post.content ?? ''
  const usernames = [...new Set((content.match(/@(\w+)/g) ?? []).map((m: string) => m.slice(1)))]
  for (const username of usernames) {
    if (!(username in mentionUsers.value)) {
      const user = await lookupMentionUser(username)
      mentionUsers.value = { ...mentionUsers.value, [username]: user }
      // If no user found, try group lookup
      if (!user && !(username in mentionGroups.value)) {
        const group = await lookupMentionGroup(username)
        mentionGroups.value = { ...mentionGroups.value, [username]: group }
      }
    }
  }
}

onMounted(() => { loadMentionUsers() })
watch(() => props.post.content, () => { loadMentionUsers() })


// ── Computed ──────────────────────────────────────────────────────────────

// Auto-derive group context from post.groupPosts if not explicitly passed.
// Group posts are always anonymous — shown as posted by the group, not the user.
const effectiveGroupContext = computed(() =>
  props.groupContext ?? (props.post.groupPosts?.[0]?.group ?? null)
)

const isOwn = computed(() =>
  !!authStore.user && (authStore.user.id === props.post.author_id || authStore.user.id === props.post.author?.id)
)
const canPin = computed(() => props.isOwnProfile && isOwn.value)
const isPinnedThis = computed(() => !!props.isPinnedPostId && props.isPinnedPostId === props.post.id)

// Paywall: subscriber-only or paid, and not the author's own post
const isPaywalled = computed(() =>
  (props.post.subscriber_only || props.post.is_paid) && !isOwn.value
)

const lightboxUrls = computed<string[]>(() =>
  props.post.media_urls ?? []
)

type Seg = { type: 'text' | 'mention'; key: number; text: string; username?: string }

function parseSegments(text: string): Seg[] {
  return text.split(/(@\w+)/g).map((part: string, i: number) =>
    /^@\w+$/.test(part)
      ? { type: 'mention' as const, key: i, text: part, username: part.slice(1) }
      : { type: 'text' as const, key: i, text: part }
  )
}

const parsedContent = computed<Seg[]>(() => parseSegments(props.post.content ?? ''))

// When showing a translation, parse the translated text the same way so
// mention pills are preserved instead of showing raw "@username" text.
const displayContent = computed<Seg[]>(() => {
  const src = postShowTranslation.value && postTranslated.value
    ? postTranslated.value
    : (props.post.content ?? '')
  return parseSegments(src)
})

// ── Helpers ───────────────────────────────────────────────────────────────
function avatarInitial(name?: string): string {
  return (name ?? '?')[0].toUpperCase()
}

function fmtDate(d: string): string {
  const date = new Date(d)
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}с`
  if (diff < 3600) return `${Math.floor(diff / 60)}м`
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч`
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function isImg(url: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url)
}

// ── Actions ───────────────────────────────────────────────────────────────
async function vote(value: 1 | -1) {
  if (!authStore.isAuthenticated) return
  const prev = localVote.value
  localVote.value = prev === value ? 0 : value
  try {
    const r = await api.post(`/posts/${props.post.id}/vote`, { value })
    if (r.data.success) localRating.value = r.data.data.rating ?? localRating.value
  } catch {
    localVote.value = prev
  }
}

async function toggleRepaw() {
  if (!authStore.isAuthenticated || repawPending.value) return
  if (authStore.user?.id && authStore.user.id === props.post.author?.id) return
  repawPending.value = true
  // Optimistic update
  const wasRepawed = localRepawed.value
  localRepawed.value = !wasRepawed
  localRepaws.value += wasRepawed ? -1 : 1
  try {
    const r = await api.post(`/posts/${props.post.id}/repaw`, {})
    if (r.data.success) {
      localRepawed.value = r.data.data.repawed
      localRepaws.value = r.data.data.repaw_count
    } else {
      // Revert on failure
      localRepawed.value = wasRepawed
      localRepaws.value += wasRepawed ? 1 : -1
    }
  } catch {
    localRepawed.value = wasRepawed
    localRepaws.value += wasRepawed ? 1 : -1
  } finally {
    repawPending.value = false
  }
}

function undoRepaw() {
  if (repawTimer) { clearTimeout(repawTimer); repawTimer = null }
  if (repawCountdownTimer) { clearInterval(repawCountdownTimer); repawCountdownTimer = null }
  repawUndoVisible.value = false
  localRepawed.value = false
  localRepaws.value = Math.max(0, localRepaws.value - 1)
}

async function toggleFavourite() {
  if (!authStore.isAuthenticated) return
  try {
    const r = await api.post(`/posts/${props.post.id}/favourite`)
    if (r.data.success) localFavourited.value = r.data.data.favourited
  } catch {}
}

async function toggleFollow() {
  if (!authStore.isAuthenticated) return
  try {
    const r = await api.post(`/follows/${props.post.author.id}/toggle`)
    if (r.data.success) localFollowing.value = r.data.data.following
  } catch {}
}

async function goToMention(username: string) {
  // Check if it's a known group first (from already-loaded data)
  if (mentionGroups.value[username]) {
    router.push(`/groups/${mentionGroups.value[username]!.slug}`)
    return
  }
  try {
    const r = await api.get(`/users/search?q=${encodeURIComponent(username)}`)
    const users: any[] = r.data.data?.users ?? []
    const found = users.find((u: any) => u.username.toLowerCase() === username.toLowerCase())
    if (found) { router.push(`/profile/${found.username}`); return }
    // Not a user — try group
    const groupSlug = username.toLowerCase()
    router.push(`/groups/${groupSlug}`)
  } catch {}
}

function openLightbox(index: number) {
  lightboxIndex.value = index
  carouselIndex.value = index
  lightboxOpen.value = true
}

function openLightboxByUrl(url: string) {
  const index = (props.post.media_urls ?? []).indexOf(url)
  openLightbox(index !== -1 ? index : 0)
}

function openFullscreen() {
  showMenu.value = false
  if (props.post.media_urls?.length) openLightbox(0)
  else router.push(`/post/${props.post.id}`)
}

function startEdit() {
  isEditing.value = true
  editContent.value = props.post.content
  showMenu.value = false
}

function cancelEdit() {
  isEditing.value = false
  editContent.value = ''
}

async function saveEdit() {
  if (!editContent.value.trim() || isSaving.value) return
  isSaving.value = true
  try {
    const r = await api.patch(`/posts/${props.post.id}`, { content: editContent.value.trim() })
    if (r.data.success) {
      emit('updated', r.data.data.post)
      isEditing.value = false
    }
  } catch {} finally {
    isSaving.value = false
  }
}

async function doDelete() {
  if (isDeleting.value) return
  isDeleting.value = true
  try {
    await api.delete(`/posts/${props.post.id}`)
    emit('deleted', props.post.id)
  } catch {} finally {
    isDeleting.value = false
  }
}

// ── Computed URLs ─────────────────────────────────────────────────────────
const postUrl = computed(() => `${window.location.origin}/post/${props.post.id}`)

function doShare() {
  showMenu.value = false
  showShareModal.value = true
}

async function copyPostLink() {
  try {
    await navigator.clipboard.writeText(postUrl.value)
    linkCopied.value = true
    setTimeout(() => { linkCopied.value = false }, 2000)
  } catch {}
  showMenu.value = false
}

function markNotInterested() {
  showMenu.value = false
  isHidden.value = true
}

async function toggleNotify() {
  showMenu.value = false
  try {
    const r = await api.post(`/users/${props.post.author?.id}/notify-toggle`)
    if (r.data.success) notifyPosts.value = r.data.data.notifyPosts
  } catch {}
}

async function blockUser() {
  if (isBlocking.value || isOwn.value) return
  isBlocking.value = true
  showMenu.value = false
  try {
    await api.post('/blocks', { blocked_id: props.post.author_id || props.post.author?.id })
    emit('deleted', props.post.id)
  } catch {} finally {
    isBlocking.value = false
  }
}

// ── Click-outside directive ────────────────────────────────────────────────
const vClickOutside = {
  mounted(el: HTMLElement, binding: any) {
    ;(el as any)._clickOutside = (e: Event) => {
      if (!el.contains(e.target as Node)) binding.value(e)
    }
    document.addEventListener('click', (el as any)._clickOutside)
  },
  unmounted(el: HTMLElement) {
    document.removeEventListener('click', (el as any)._clickOutside)
  },
}
</script>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: all 0.18s ease;
  overflow: hidden;
}
.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  max-height: 0;
}
.slide-enter-to,
.slide-leave-from {
  opacity: 1;
  max-height: 1000px;
}
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
.slide-up-enter-to,
.slide-up-leave-from {
  opacity: 1;
  max-height: 60px;
}

/* ── Carousel ───────────────────────────────────────────────────────────── */
.carousel-track {
  display: flex;
  transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
  will-change: transform;
}
.carousel-slide {
  position: relative;
  flex: 0 0 100%;
  min-width: 0;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0d0d14;
  min-height: 220px;
}
/* Blur layer — только для изображений (data-has-blur=true) */
.carousel-slide[data-has-blur='true']::before {
  content: '';
  position: absolute;
  inset: -40px;
  background-image: var(--blur-url);
  background-size: cover;
  background-position: center;
  filter: blur(32px);
  opacity: 0.55;
  z-index: 0;
  pointer-events: none;
}
/* Прямой дочерний <img> (тип image) — центрирование с contain */
.carousel-slide[data-has-blur='true'] :deep(> img) {
  position: relative;
  z-index: 1;
  display: block !important;
  width: auto !important;
  height: auto !important;
  max-width: 100% !important;
  max-height: 480px !important;
  object-fit: contain !important;
  border-radius: 12px !important;
  border: none !important;
  margin: 0 auto !important;
}
/* GIF и Video враппер — без изменений, просто z-index поверх blur нет (нет blur у них) */
.carousel-slide[data-has-blur='false'] :deep(> div) {
  width: 100%;
}
.carousel-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 10;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: rgba(0,0,0,0.55);
  border: 1px solid rgba(255,255,255,0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: opacity 0.2s, background 0.2s;
  backdrop-filter: blur(4px);
}
.carousel-arrow:hover { background: rgba(0,0,0,0.8); }

/* ── Media grid cells (legacy, kept for compatibility) ───────────────────── */
.media-cell {
  position: relative;
  overflow: hidden;
}
/* Заставляем изображения и видео полностью заполнять ячейку */
.media-cell :deep(> div),
.media-cell :deep(> figure) {
  width: 100%;
  height: 100%;
}
.media-cell :deep(img),
.media-cell :deep(video) {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
  max-height: none !important;
  border-radius: 0 !important;
  border: none !important;
  display: block;
}

/* Mention pill */
.mention-pill {
  position: relative;
}
/* Mention popup teleport transition */
.mention-popup-enter-active,
.mention-popup-leave-active {
  transition: opacity 0.12s ease;
}
.mention-popup-enter-from,
.mention-popup-leave-to {
  opacity: 0;
}
.mention-popup-enter-to,
.mention-popup-leave-from {
  opacity: 1;
}

/* NSFW / paid overlay fade */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
