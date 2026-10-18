<template>
  <div class="flex flex-col h-full bg-transparent overflow-hidden relative">

    <!-- ── Selection bar (replaces header while messages are selected) ──────── -->
    <div v-if="selectionMode" class="flex items-center gap-3 px-4 py-3 border-b border-white/6 bg-brand-card/80 backdrop-blur-xl shrink-0 z-10">
      <button @click="clearSelection" class="p-1.5 rounded-xl hover:bg-brand-bg text-white/55 hover:text-white transition-colors" :title="langStore.t.chatCancelSelectionTitle">
        <BIcon name="X" class="w-4 h-4" />
      </button>
      <p class="flex-1 text-sm font-bold text-white">{{ langStore.t.chatSelectedCountLabel }}: {{ selectedMsgIds.size }}</p>
      <button @click="startBulkForward" class="p-1.5 rounded-xl hover:bg-brand-bg text-white/55 hover:text-brand-accent transition-colors" :title="langStore.t.chatForwardAction">
        <BIcon name="Forward" class="w-4 h-4" />
      </button>
      <button v-if="canDeleteSelected" @click="deleteSelected" class="p-1.5 rounded-xl hover:bg-brand-error/10 text-white/55 hover:text-brand-error transition-colors" :title="langStore.t.deleteBtn">
        <BIcon name="Trash2" class="w-4 h-4" />
      </button>
    </div>

    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <div v-else class="flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-white/6 bg-brand-card/70 backdrop-blur-xl shrink-0 z-10">
      <button @click="$emit('back')" class="sm:hidden p-1.5 rounded-xl hover:bg-brand-bg text-white/55 hover:text-white transition-colors">
        <BIcon name="ArrowLeft" class="w-4 h-4" />
      </button>

      <!-- Avatar / Group avatar -->
      <div class="relative cursor-pointer shrink-0" @click="isGroupDm && amGroupDmCustomer ? goToGroup() : (conv?.is_group ? (showMembersPanel = true) : (other ? showDmPanel = true : undefined))">
        <!-- Group -->
        <template v-if="conv?.is_group">
          <img v-if="conv.avatar_url" :src="conv.avatar_url" :alt="conv.name ?? langStore.t.chatGroupFallbackName"
            class="w-10 h-10 rounded-xl object-cover ring-2 ring-brand-border hover:ring-brand-accent/50 transition-all" @error="onAvatarError" />
          <div v-else class="grid grid-cols-2 gap-px w-10 h-10 rounded-xl overflow-hidden ring-2 ring-brand-border hover:ring-brand-accent/50 transition-all bg-brand-bg">
            <template v-for="(p, idx) in conv.other_participants.slice(0, 4)" :key="p.user_id">
              <img v-if="p.user?.avatar_url" :src="p.user.avatar_url" class="w-full h-full object-cover" @error="onAvatarError" />
              <div v-else class="w-full h-full flex items-center justify-center bg-brand-accent/20 text-brand-accent text-[7px] font-bold">
                {{ (p.user?.display_name || p.user?.username || '?')[0].toUpperCase() }}
              </div>
            </template>
            <div v-for="i in Math.max(0, 4 - (conv.other_participants?.length ?? 0))" :key="`gh${i}`" class="w-full h-full bg-brand-border/30" />
          </div>
        </template>
        <!-- DM -->
        <template v-else>
          <!-- Notes: self-chat -->
          <template v-if="!other">
            <div class="w-10 h-10 rounded-full bg-linear-to-br/srgb from-brand-accent/30 to-brand-accent/10 ring-2 ring-brand-accent/40 flex items-center justify-center">
              <BIcon name="StickyNote" class="w-5 h-5 text-brand-accent" />
            </div>
          </template>
          <template v-else>
            <span class="relative inline-flex">
              <img v-if="other?.avatar_url" :src="other.avatar_url" :alt="other.username"
                class="w-10 h-10 rounded-full object-cover ring-2 ring-brand-border hover:ring-brand-accent/50 transition-all" @error="onAvatarError" />
              <div v-else class="w-10 h-10 rounded-full bg-linear-to-br/srgb from-brand-accent/30 to-brand-accent/10 ring-2 ring-brand-border hover:ring-brand-accent/50 transition-all flex items-center justify-center text-brand-accent font-bold">
                {{ (other?.display_name || other?.username || '?')[0].toUpperCase() }}
              </div>
              <OnlineIndicator v-if="isPartnerOnline" :device="partnerDevice" size="sm" />
            </span>
          </template>
        </template>
      </div>

      <div class="flex-1 min-w-0" :class="(other || conv?.is_group) ? 'cursor-pointer' : ''" @click="isGroupDm && amGroupDmCustomer ? goToGroup() : (conv?.is_group ? (showMembersPanel = true) : (other ? showDmPanel = true : undefined))">
        <p class="font-bold text-white text-sm leading-tight truncate flex items-center gap-1.5">
          <template v-if="conv?.is_group">
            <BIcon name="Users" class="w-3.5 h-3.5 text-white/55 shrink-0" />
            {{ conv.name || langStore.t.chatGroupFallbackName }}
          </template>
          <template v-else>
            <!-- Notes -->
            <template v-if="!other">
              <span class="font-bold text-white text-sm flex items-center gap-1.5">
                <BIcon name="StickyNote" class="w-3.5 h-3.5 text-brand-accent shrink-0" />
                {{ langStore.t.notesBtn }}
              </span>
            </template>
            <template v-else>
              {{ other?.display_name || other?.username || langStore.t.chatInterlocutorFallback }}
              <span v-if="other?.deceased_at" :title="langStore.t.chatRipTitle">🪦</span>
            </template>
          </template>
        </p>
        <p v-if="!conv?.is_group && isPartnerTyping" class="text-xs text-brand-accent flex items-center gap-1">
          <span class="inline-flex gap-0.5">
            <span class="w-1 h-1 rounded-full bg-brand-accent animate-bounce [animation-delay:-0.3s]" />
            <span class="w-1 h-1 rounded-full bg-brand-accent animate-bounce [animation-delay:-0.15s]" />
            <span class="w-1 h-1 rounded-full bg-brand-accent animate-bounce" />
          </span>
          {{ langStore.t.chatTypingIndicator }}
        </p>
        <p v-else-if="conv?.is_group" class="text-xs text-white/55">
          {{ conv.participants_count ?? ((conv.other_participants?.length ?? 0) + 1) }} {{ langStore.t.membersUnit }} · {{ langStore.t.chatClickToView }}
        </p>
        <p v-else-if="isGroupDm && amGroupDmCustomer" class="text-xs text-white/55">{{ langStore.t.chatGroupDmSubtitle }}</p>
        <p v-else-if="!other" class="text-xs text-white/55">{{ langStore.t.chatOnlyForYou }}</p>
        <p v-else class="text-xs flex items-center gap-1.5">
          <span class="inline-block w-1.5 h-1.5 rounded-full shrink-0"
            :class="isPartnerOnline ? 'bg-brand-success shadow-[0_0_4px_var(--color-green-400)]' : 'bg-brand-muted'" />
          <span :class="isPartnerOnline ? 'text-brand-success' : 'text-white/55'">{{ isPartnerOnline ? langStore.t.chatOnlineNow : partnerLastSeenLabel }}</span>
          <BIcon v-if="isPartnerOnline && partnerDeviceIcon" :name="partnerDeviceIcon!" class="w-3 h-3 text-brand-success/70" :title="partnerDevice ?? undefined" />
        </p>
      </div>

      <!-- Header action buttons: search, translate, ⋮ -->
      <div class="flex items-center gap-1">
        <button @click="toggleSearch"
          class="p-1.5 rounded-xl transition-colors"
          :class="showSearch ? 'text-brand-accent bg-brand-accent/10' : 'text-white/55 hover:text-white hover:bg-brand-bg'"
          :title="langStore.t.chatSearchTitle">
          <BIcon name="Search" class="w-4 h-4" />
        </button>
        <button @click="toggleTranslate"
          class="p-1.5 rounded-xl transition-colors"
          :class="translateMode ? 'text-brand-accent bg-brand-accent/10' : 'text-white/55 hover:text-white hover:bg-brand-bg'"
          :title="langStore.t.chatTranslatorTitle">
          <BIcon name="Languages" class="w-4 h-4" />
        </button>
        <div class="relative" ref="menuRef">
          <button @click="showMenu = !showMenu"
            class="p-1.5 rounded-xl hover:bg-brand-bg text-white/55 hover:text-white transition-colors"
            :title="langStore.t.chatActionsTitle">
            <BIcon name="MoreVertical" class="w-4 h-4" />
          </button>
          <Transition name="menu-drop">
            <div v-if="showMenu"
              class="absolute right-0 top-full mt-1.5 w-56 bg-brand-card border border-brand-border rounded-2xl shadow-2xl py-1.5 z-50 overflow-hidden">
              <div v-if="translateMode" class="px-4 pb-2 pt-1">
                <select v-model="translateLang"
                  class="w-full text-xs bg-brand-bg border border-brand-border rounded-xl px-3 py-1.5 text-brand-offwhite outline-hidden focus:border-brand-accent/50 transition-colors">
                  <option value="ru">{{ langStore.t.languageRU }}</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="fr">Français</option>
                  <option value="zh-CN">中文</option>
                  <option value="ja">日本語</option>
                  <option value="es">Español</option>
                  <option value="pt">Português</option>
                  <option value="uk">{{ langStore.t.languageUK }}</option>
                </select>
              </div>
              <div v-if="translateMode" class="border-t border-brand-border mb-1" />

              <!-- Group-specific: manage group (for admins) -->
              <template v-if="conv?.is_group">
                <button @click="showMembersPanel = true; showMenu = false"
                  class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                  <BIcon name="Users" class="w-4 h-4 text-white/55 shrink-0" />
                  {{ langStore.t.createStep2Title }}
                </button>
                <button v-if="conv?.group_id" @click="router.push('/groups/' + conv.group_id); showMenu = false"
                  class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                  <BIcon name="Users2" class="w-4 h-4 text-white/55 shrink-0" />
                  {{ langStore.t.contextGoToGroup }}
                </button>
                <button v-if="myRole === 'admin'" @click="showEditGroup = true; showMenu = false"
                  class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                  <BIcon name="Settings" class="w-4 h-4 text-white/55 shrink-0" />
                  {{ langStore.t.chatGroupSettingsMenuItem }}
                </button>
                <div class="border-t border-brand-border my-1" />
              </template>

              <!-- DM-specific -->
              <router-link v-if="!conv?.is_group && !isGroupDm" :to="`/profile/${other?.username}`" @click="showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                <BIcon name="User" class="w-4 h-4 text-white/55 shrink-0" />
                {{ langStore.t.profile }}
              </router-link>

              <!-- Group DM: customer sees "К группе"; staff sees the customer's profile -->
              <button v-if="isGroupDm && amGroupDmCustomer" @click="goToGroup(); showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                <BIcon name="Users2" class="w-4 h-4 text-white/55 shrink-0" />
                {{ langStore.t.contextGoToGroup }}
              </button>
              <router-link v-else-if="isGroupDm" :to="`/profile/${other?.username}`" @click="showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                <BIcon name="User" class="w-4 h-4 text-white/55 shrink-0" />
                {{ langStore.t.profile }}
              </router-link>

              <button v-if="!(isGroupDm && !amGroupDmCustomer)" @click="archive(); showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                <BIcon :name="conv?.my_participant?.archived ? 'ArchiveX' : 'Archive'" class="w-4 h-4 text-white/55 shrink-0" />
                {{ conv?.my_participant?.archived ? langStore.t.contextUnarchive : langStore.t.contextArchive }}
              </button>
              <div class="border-t border-brand-border my-1" />

              <button v-if="!conv?.is_group && !isGroupDm" @click="showBlockModal = true; showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left"
                :class="isBlocked ? 'text-brand-accent hover:bg-brand-accent/8' : 'text-brand-offwhite hover:bg-brand-bg'">
                <BIcon :name="isBlocked ? 'ShieldOff' : 'ShieldAlert'" class="w-4 h-4 shrink-0"
                  :class="isBlocked ? 'text-brand-accent' : 'text-white/55'" />
                {{ isBlocked ? langStore.t.chatUnblockLabel : langStore.t.blockUserBtn }}
              </button>

              <button v-if="!(isGroupDm && !amGroupDmCustomer)" @click="showDeleteModal = true; showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-error hover:bg-brand-error/8 transition-colors text-left">
                <BIcon name="Trash2" class="w-4 h-4 shrink-0" />
                {{ conv?.is_group ? langStore.t.contextLeaveGroup : langStore.t.contextDeleteConv }}
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <ChatGroupInfoModal :open="showMembersPanel" :conv="conv" :my-role="myRole" :group="groupChat"
      :media-stats="mediaStatsList" :media-stats-loading="mediaStatsLoading"
      @close="showMembersPanel = false" @edit-group="showEditGroup = true; showMembersPanel = false"
      @invite="showInvitePicker = true" @archive="showMembersPanel = false; archive()" @open-media="openMediaBrowser" />
    <ChatDmInfoModal :open="showDmPanel" :conv="conv" :other="other" :is-group-dm="isGroupDm" :is-blocked="isBlocked"
      :online="isPartnerOnline" :device="partnerDevice" :device-icon="partnerDeviceIcon" :last-seen-label="partnerLastSeenLabel"
      :media-stats="mediaStatsList" :media-stats-loading="mediaStatsLoading"
      @close="showDmPanel = false" @archive="showDmPanel = false; archive()" @block="showDmPanel = false; showBlockModal = true"
      @delete="showDmPanel = false; showDeleteModal = true" @open-media="openMediaBrowser" />

    <ChatMediaBrowser :conv-id="convId" :type="mediaBrowserType" @close="mediaBrowserType = null" @open-image="openLightbox" />
    <!-- ── Pin scope modal ─────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showPinScopeModal" class="fixed inset-0 z-200 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" @click.self="showPinScopeModal = false; pinTarget = null">
          <div class="bg-brand-card border border-brand-border rounded-3xl p-5 w-full max-w-xs shadow-2xl">
            <div class="flex items-center gap-2 mb-4">
              <div class="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <BIcon name="Pin" class="w-4 h-4 text-amber-400" />
              </div>
              <h3 class="text-base font-bold text-white">{{ langStore.t.chatPinMessageTitle }}</h3>
            </div>
            <!-- Preview -->
            <div v-if="pinTarget" class="mb-4 px-3 py-2 bg-brand-bg rounded-xl border-l-2 border-brand-accent">
              <p class="text-[10px] text-brand-accent font-semibold truncate">{{ pinTarget.sender?.display_name || pinTarget.sender?.username }}</p>
              <p class="text-xs text-white/65 truncate mt-0.5">{{ pinTarget.text || langStore.t.mediaFilePreview }}</p>
            </div>
            <div class="flex flex-col gap-2">
              <button @click="doPinMessage('all')"
                class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-brand-bg border border-brand-border hover:border-brand-accent/50 transition-all text-left">
                <BIcon name="Users" class="w-4 h-4 text-brand-accent shrink-0" />
                <div>
                  <p class="text-sm font-semibold text-white">{{ langStore.t.deleteForAllTitle }}</p>
                  <p class="text-xs text-white/45">{{ langStore.t.chatPinAllHint }}</p>
                </div>
              </button>
              <button @click="doPinMessage('me')"
                class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-brand-bg border border-brand-border hover:border-brand-accent/50 transition-all text-left">
                <BIcon name="User" class="w-4 h-4 text-white/55 shrink-0" />
                <div>
                  <p class="text-sm font-semibold text-white">{{ langStore.t.chatPinMeOnlyTitle }}</p>
                  <p class="text-xs text-white/45">{{ langStore.t.chatPinMeHint }}</p>
                </div>
              </button>
              <button @click="showPinScopeModal = false; pinTarget = null"
                class="w-full py-2 rounded-xl text-sm text-white/45 hover:text-white transition-colors">
                {{ langStore.t.cancel }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ChatPaymentRequestModal :open="showPaymentModal" :conv-id="convId" @close="showPaymentModal = false" @sent="scrollToBottom(true)" />
    <ChatEditGroupModal :open="showEditGroup" :conv-id="convId" :conv="conv" :members="groupMembers"
      @close="showEditGroup = false" @toggle-role="toggleMemberRole" @kick="kickMember" />
    <!-- ── Inline search bar ───────────────────────────────────────────────── -->
    <Transition name="search-slide">
      <div v-if="showSearch" class="px-4 py-2 border-b border-brand-border bg-brand-card/60 shrink-0">
        <div class="flex items-center gap-2 bg-brand-bg border border-brand-border rounded-2xl px-3 py-2 focus-within:border-brand-accent/50 transition-colors">
          <BIcon name="Search" class="w-3.5 h-3.5 text-white/55 shrink-0" />
          <input v-model="searchQuery" type="text" :placeholder="langStore.t.chatSearchMessagesPlaceholder"
            class="bg-transparent text-sm text-white placeholder-brand-muted outline-hidden flex-1" autofocus />
          <span v-if="searchQuery" class="text-[11px] text-white/55 shrink-0">
            {{ filteredMsgList.length }} {{ langStore.t.chatOfLabel }} {{ msgList.length }}
          </span>
          <button v-if="searchQuery" @click="searchQuery = ''" class="text-white/55 hover:text-white transition-colors shrink-0">
            <BIcon name="X" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Transition>

    <!-- ── Pinned message banner ─────────────────────────────────────────── -->
    <Transition name="search-slide">
      <div v-if="currentPin && !searchQuery"
        class="flex items-center gap-2.5 px-4 py-2 bg-brand-accent/8 border-b border-brand-accent/25 shrink-0 group"
        @click="scrollToMsg(currentPin!.id)">
        <div class="shrink-0 w-0.5 h-7 rounded-full bg-brand-accent" />
        <BIcon name="Pin" class="w-3.5 h-3.5 text-brand-accent shrink-0" />
        <div class="flex-1 min-w-0 cursor-pointer">
          <p class="text-[10px] text-brand-accent font-bold leading-tight">{{ langStore.t.chatPinnedMessageLabel }}</p>
          <p class="text-[11px] text-white/70 truncate leading-tight">
            {{ currentPin!.text || langStore.t.mediaFilePreview }}
          </p>
        </div>
        <div class="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            v-if="conv?.my_participant?.personal_pinned_message_id"
            @click.stop="doUnpin('me')"
            class="p-1 rounded-lg text-white/40 hover:text-amber-400 transition-colors"
            :title="langStore.t.chatUnpinMineTitle">
            <BIcon name="PinOff" class="w-3.5 h-3.5" />
          </button>
          <button
            v-else-if="myRole === 'admin' || !conv?.is_group"
            @click.stop="doUnpin('all')"
            class="p-1 rounded-lg text-white/40 hover:text-brand-error transition-colors"
            :title="langStore.t.chatUnpinTitle">
            <BIcon name="PinOff" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Transition>

    <!-- ── Message list ────────────────────────────────────────────────────── -->
    <div ref="scrollEl" class="chat-wallpaper flex-1 overflow-y-auto min-h-0 px-3 sm:px-5 py-4 stack-y-0.5 relative" @scroll="onScroll" @click="onMsgListClick">

      <!-- Notes banner -->
      <div v-if="!conv?.is_group && !other" class="flex flex-col items-center gap-3 py-6 px-4 mb-2">
        <div class="w-16 h-16 rounded-3xl bg-brand-accent/15 border border-brand-accent/25 flex items-center justify-center shadow-lg">
          <BIcon name="StickyNote" class="w-8 h-8 text-brand-accent" />
        </div>
        <div class="text-center">
          <p class="font-bold text-white text-sm mb-1">{{ langStore.t.notesBtn }}</p>
          <p class="text-xs text-white/45 max-w-[220px]">{{ langStore.t.chatNotesBannerHint }}</p>
        </div>
      </div>

      <!-- Load more -->
      <div class="flex justify-center mb-2" v-if="store.hasMoreMessages[convId] && !searchQuery">
        <button @click="loadMore" :disabled="store.messagesLoading"
          class="text-xs text-brand-accent hover:underline disabled:opacity-50 px-4 py-1.5 rounded-xl hover:bg-brand-accent/8 transition-colors">
          {{ store.messagesLoading ? langStore.t.loadingBtn : langStore.t.chatLoadEarlierBtn }}
        </button>
      </div>

      <!-- Loading skeleton -->
      <template v-if="store.messagesLoading && !msgList.length">
        <div v-for="i in 6" :key="i" class="flex gap-2" :class="i % 2 === 0 ? 'justify-end' : ''">
          <div v-if="i % 2 !== 0" class="w-7 h-7 rounded-full bg-brand-border animate-pulse shrink-0" />
          <div class="h-8 bg-brand-border rounded-2xl animate-pulse" :class="i % 2 === 0 ? 'w-40' : 'w-52'" />
        </div>
      </template>

      <!-- Empty -->
      <div v-else-if="!msgList.length" class="flex flex-col items-center justify-center h-32 text-white/55 text-sm gap-2">
        <div class="w-14 h-14 rounded-2xl bg-linear-to-br/srgb from-brand-accent/20 to-brand-accent/5 border border-brand-accent/20 flex items-center justify-center mb-1">
          <BIcon :name="!conv?.is_group && !other ? 'PenLine' : 'MessageCircle'" class="w-6 h-6 text-brand-accent/60" />
        </div>
        <span>{{ !conv?.is_group && !other ? langStore.t.chatSendFirstNoteMsg : langStore.t.chatStartConversation }}</span>
      </div>

      <!-- Search no results -->
      <div v-else-if="searchQuery && !filteredMsgList.length" class="flex flex-col items-center justify-center h-32 text-white/55 text-sm gap-2">
        <div class="w-14 h-14 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-center mb-1">
          <BIcon name="SearchX" class="w-6 h-6 text-white/40" />
        </div>
        <span>{{ langStore.t.chatNoMessagesFound }}</span>
      </div>

      <!-- Messages -->
      <template v-else>
        <template v-for="(msg, idx) in displayList" :key="msg.id">
        <!-- Date divider -->
        <div v-if="shouldShowDateDivider(idx)" class="sticky top-1 z-5 flex items-center justify-center my-3 select-none">
          <span class="px-3 py-1 rounded-full bg-brand-card/80 backdrop-blur-md border border-white/10 text-[10px] font-bold text-white/60 tracking-wide uppercase shadow-lg">
            {{ formatDateDivider(msg.created_at) }}
          </span>
        </div>
        <div
          :id="'msg-' + msg.id"
          :class="[
            msg.type === 'system'
              ? 'flex justify-center my-1 px-4'
              : ['flex gap-2', isMine(msg) ? 'justify-end' : 'justify-start'],
            selectedMsgIds.has(msg.id) ? 'bg-brand-accent/10 -mx-2 px-2 py-1 rounded-2xl' : '',
          ]"
          @click.capture="onRowClickCapture(msg, $event)"
          @contextmenu="openContextMenu(msg, $event)">

          <!-- ── System message (centered notice) ──────────────── -->
          <template v-if="msg.type === 'system'">
            <div class="flex items-center gap-2 w-full max-w-md">
              <div class="flex-1 h-px bg-white/8" />
              <span class="shrink-0 flex items-center gap-1.5 text-[11px] text-white/40 bg-brand-bg/60 border border-brand-accent/25 px-3 py-1 rounded-full">
                <BIcon name="Pin" class="w-2.5 h-2.5 text-amber-400/70 shrink-0" />
                {{ msg.text }}
              </span>
              <div class="flex-1 h-px bg-white/8" />
            </div>
          </template>

          <!-- ── Regular message bubble ─────────────────────────── -->
          <template v-else>

          <!-- Other's avatar (DM: other's avatar; Group: sender's avatar) -->
          <div v-if="!isMine(msg)" class="shrink-0 self-end mb-1">
            <template v-if="isLastInGroup(idx)">
              <img v-if="getMsgSenderAvatar(msg)"
                :src="getMsgSenderAvatar(msg)!"
                :alt="msg.sender?.username"
                class="w-7 h-7 rounded-full object-cover border border-brand-border cursor-pointer hover:opacity-80 transition-opacity"
                @click="goToProfile(msg.sender?.username)" />
              <div v-else
                class="w-7 h-7 rounded-full bg-brand-accent/20 border border-brand-border flex items-center justify-center text-brand-accent text-xs font-bold cursor-pointer hover:opacity-80 transition-opacity"
                @click="goToProfile(msg.sender?.username)">
                {{ (msg.sender?.display_name || msg.sender?.username || '?')[0].toUpperCase() }}
              </div>
            </template>
            <div v-else class="w-7 h-7" />
          </div>

          <!-- Bubble -->
          <div class="group max-w-[72%] flex flex-col" :class="isMine(msg) ? 'items-end' : 'items-start'"
            @dblclick="!selectionMode && (replyTo = msg)"
            @click.self="toggleSelect(msg.id)">

            <!-- Sender name (only in group, for incoming, and only if first in group) -->
            <p v-if="conv?.is_group && !isMine(msg) && !isSameAsPrev(idx)"
              class="text-[11px] font-semibold mb-1 ml-1 truncate"
              :style="getSenderColor(msg.sender_id)">
              {{ msg.sender?.display_name || msg.sender?.username }}
            </p>

            <!-- Reply quote -->
            <div v-if="msg.reply_to" class="flex items-stretch gap-1 mb-0.5 max-w-full opacity-70 cursor-pointer"
              :class="isMine(msg) ? 'flex-row-reverse' : ''"
              @click="scrollToMsg(msg.reply_to.id)">
              <div class="w-0.5 rounded-full shrink-0"
                :class="isMine(msg) ? 'bg-white/40' : 'bg-brand-accent/60'" />
              <div class="min-w-0 px-2 py-0.5">
                <p class="text-[10px] font-semibold truncate"
                  :class="isMine(msg) ? 'text-white/70' : 'text-brand-accent'">
                  {{ msg.reply_to.sender?.display_name || msg.reply_to.sender?.username }}
                </p>
                <p class="text-[11px] truncate"
                  :class="isMine(msg) ? 'text-white/50' : 'text-white/55'">
                  {{ msg.reply_to.file_url && !msg.reply_to.text ? langStore.t.mediaFilePreview : previewMsgText(msg.reply_to.text, 50) }}
                </p>
              </div>
            </div>

            <!-- Forwarded banner for stickers/media (outside text bubble) -->
            <div v-if="getForwardedAuthor(msg) && (msg.type === 'sticker' || (msg.file_url && !msg.text))"
              class="flex items-center gap-1.5 mb-1 px-1"
              :class="isMine(msg) ? 'justify-end' : ''">
              <BIcon name="CornerUpRight" class="w-3 h-3 shrink-0 text-brand-accent" />
              <template v-if="msg.forwarded_from_sender">
                <img v-if="msg.forwarded_from_sender.avatar_url" :src="msg.forwarded_from_sender.avatar_url" :alt="msg.forwarded_from_sender.username"
                  class="w-3.5 h-3.5 rounded-full object-cover cursor-pointer shrink-0 hover:opacity-80 transition-opacity"
                  @click.stop="goToProfile(msg.forwarded_from_sender.username)" @error="onAvatarError" />
                <span v-else class="w-3.5 h-3.5 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-[7px] font-bold cursor-pointer shrink-0"
                  @click.stop="goToProfile(msg.forwarded_from_sender.username)">
                  {{ (msg.forwarded_from_sender.display_name || msg.forwarded_from_sender.username || '?')[0].toUpperCase() }}
                </span>
              </template>
              <span class="text-[10px] font-semibold text-brand-accent truncate"
                :class="msg.forwarded_from_sender ? 'cursor-pointer hover:underline' : ''"
                @click.stop="msg.forwarded_from_sender && goToProfile(msg.forwarded_from_sender.username)">
                {{ langStore.t.chatForwardedFromLabel }} {{ getForwardedAuthor(msg) }}
              </span>
            </div>

            <!-- Sticker (animated TGS/Lottie or regular image or legacy emoji) -->
            <div v-if="msg.type === 'sticker'" class="p-1">
              <div
                v-if="(msg.file_url || msg.text || '').startsWith('http')"
                class="cursor-pointer hover:scale-110 transition-transform active:scale-95"
                @click="openStickerPack(msg.file_url || '')">
                <StickerRenderer
                  :src="msg.file_url || ''"
                  size="xl"
                  :loop="true"
                  :autoplay="true"
                  class="w-40! h-40!" />
              </div>
              <span v-else class="text-[80px] leading-none select-none">
                {{ getStickerEmoji(msg.text || msg.file_url || '') }}
              </span>
            </div>

            <!-- Album (2+ files sent together, e.g. a photo + a video) -->
            <div v-else-if="msg.type === 'album' && getAlbumFiles(msg).length"
              class="grid grid-cols-2 gap-0.5 mb-0.5 max-w-[280px] w-full rounded-2xl overflow-hidden shadow-xs"
              :class="isMine(msg) ? 'rounded-br-md' : 'rounded-bl-md'">
              <div v-for="(f, idx) in getAlbumFiles(msg)" :key="idx"
                class="relative bg-black/20 aspect-square"
                :class="getAlbumFiles(msg).length % 2 === 1 && idx === getAlbumFiles(msg).length - 1 ? 'col-span-2' : ''">
                <img v-if="f.type === 'image'" :src="f.url" class="w-full h-full object-cover cursor-pointer"
                  loading="lazy" @click="openAlbumImageLightbox(msg, f.url)" />
                <video v-else-if="f.type === 'video'" :src="f.url" controls preload="metadata" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <MiniPlayer :src="f.url" :msg-type="f.type" :is-mine="isMine(msg)" />
                </div>
              </div>
            </div>

            <!-- Media (compact MiniPlayer) -->
            <div v-else-if="msg.file_url"
              class="rounded-2xl overflow-hidden border border-brand-border/60 mb-0.5 w-full shadow-xs"
              :class="[
                isMine(msg) ? 'rounded-br-md' : 'rounded-bl-md',
                (msg.type === 'voice' || msg.type === 'audio') ? (isMine(msg) ? 'bg-brand-accent border-brand-accent' : 'bg-brand-card') : '',
                (msg.type === 'gif' || isGifUrl(msg.file_url)) ? 'max-w-[340px]' : 'max-w-[280px]',
              ]">
              <MiniPlayer :src="msg.file_url" :msg-type="msg.type" :is-mine="isMine(msg)" @click-image="openImageLightbox(msg.file_url!)" />
            </div>

            <!-- ── Payment request card (chat-only order card, not linked to Dealers' Den) ── -->
            <div v-if="msg.type === 'payment_request'"
              class="relative mb-0.5 w-[264px] rounded-2xl overflow-hidden border border-brand-accent/30 bg-linear-to-br/srgb from-brand-accent/25 via-brand-accent/10 to-brand-card shadow-xs"
              :class="isMine(msg) ? 'rounded-br-md' : 'rounded-bl-md'">
              <!-- decorative glow -->
              <div class="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-brand-accent/25 blur-2xl pointer-events-none" />
              <div class="relative px-3.5 pt-3 pb-2.5">
                <div class="flex items-center gap-1.5">
                  <span class="w-5 h-5 rounded-lg bg-brand-accent/25 flex items-center justify-center">
                    <BIcon name="CreditCard" class="w-3 h-3 text-brand-accent" />
                  </span>
                  <span class="text-brand-accent text-[10px] font-bold tracking-wide uppercase">{{ langStore.t.chatPaymentRequestTitle }}</span>
                </div>
                <p class="text-2xl font-extrabold text-white mt-1.5 tracking-tight">{{ formatMoney(msg.metadata?.amount) }}</p>
                <p v-if="msg.metadata?.description" class="text-xs text-white/70 mt-0.5 leading-snug">{{ msg.metadata.description }}</p>
              </div>
              <div v-if="msg.metadata?.prepaymentPercent || msg.metadata?.deadline"
                class="relative px-3.5 py-2 border-t border-white/10 bg-black/15 flex items-center justify-between gap-2 text-[11px]">
                <template v-if="msg.metadata?.prepaymentPercent">
                  <span class="text-white/55">{{ langStore.t.chatPrepaymentDisplayLabel }} {{ msg.metadata.prepaymentPercent }}%</span>
                  <span class="font-semibold text-white/85">{{ formatMoney(msg.metadata.amount * msg.metadata.prepaymentPercent / 100) }}</span>
                </template>
                <template v-else-if="msg.metadata?.deadline">
                  <span class="text-white/55">{{ langStore.t.chatDeadlineDisplayLabel }}</span>
                  <span class="font-semibold" :class="isOverdue(msg.metadata.deadline) ? 'text-brand-error' : 'text-white/85'">
                    {{ formatDeadline(msg.metadata.deadline) }}
                  </span>
                </template>
              </div>
              <div class="relative px-3.5 py-2.5 border-t border-white/10">
                <div v-if="msg.metadata?.status === 'paid'" class="flex items-center gap-1.5 text-brand-success text-xs font-bold">
                  <BIcon name="CheckCircle2" class="w-3.5 h-3.5" />
                  {{ langStore.t.chatPaidLabel }}
                </div>
                <button v-else-if="!isMine(msg)" type="button" @click="payOrder(msg)" :disabled="payingId === msg.id"
                  class="w-full py-1.5 rounded-xl bg-brand-accent hover:bg-brand-accent-plus text-white text-xs font-bold transition-all active:scale-95 disabled:opacity-50 shadow-xs">
                  {{ payingId === msg.id ? langStore.t.chatPayingLabel : langStore.t.chatPayBtn }}
                </button>
                <span v-else class="text-[11px] text-white/45">{{ langStore.t.chatAwaitingPaymentLabel }}</span>
              </div>
            </div>

            <!-- ── Payment confirmation card ── -->
            <div v-else-if="msg.type === 'payment_confirmation'"
              class="mb-0.5 w-[264px] rounded-2xl overflow-hidden border border-brand-success/30 bg-linear-to-br/srgb from-brand-success/15 to-brand-card shadow-xs px-3.5 py-2.5 flex items-center gap-2.5"
              :class="isMine(msg) ? 'rounded-br-md' : 'rounded-bl-md'">
              <div class="w-9 h-9 rounded-full bg-linear-to-br/srgb from-brand-success/30 to-brand-success/10 ring-1 ring-brand-success/30 flex items-center justify-center shrink-0">
                <BIcon name="Check" class="w-4 h-4 text-brand-success" />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-bold text-brand-success">{{ langStore.t.chatPaidLabel }} · {{ formatMoney(msg.metadata?.amount) }}</p>
                <p v-if="msg.metadata?.description" class="text-[11px] text-white/55 truncate">{{ msg.metadata.description }}</p>
              </div>
            </div>

            <!-- ── Tip card ── -->
            <div v-else-if="msg.type === 'tip'"
              class="relative mb-0.5 w-[264px] rounded-2xl overflow-hidden border border-brand-pink/35 bg-linear-to-br/srgb from-brand-purple/20 via-brand-pink/10 to-brand-card shadow-xs px-3.5 py-2.5 flex items-center gap-2.5"
              :class="isMine(msg) ? 'rounded-br-md' : 'rounded-bl-md'">
              <div class="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-brand-pink/20 blur-2xl pointer-events-none" />
              <div class="relative w-9 h-9 rounded-full bg-linear-to-br/srgb from-brand-pink/25 to-brand-purple/20 ring-1 ring-brand-pink/30 flex items-center justify-center shrink-0 text-base">🎉</div>
              <div class="relative min-w-0">
                <p class="text-sm font-bold text-brand-pink">{{ langStore.t.chatTipLabel }} +{{ formatMoney(msg.metadata?.amount) }}</p>
                <p class="text-[11px] text-white/55 truncate">
                  {{ msg.metadata?.note || `${msg.sender?.display_name || msg.sender?.username} ${langStore.t.chatThankedForWorkFallback}` }}
                </p>
              </div>
            </div>

            <!-- ── Shared post card ── -->
            <SharedPostCard v-else-if="msg.type === 'post_share' && msg.metadata?.postId"
              :post-id="msg.metadata.postId" :is-mine="isMine(msg)" />

            <!-- ── Group invite card ── -->
            <GroupShareCard v-else-if="msg.type === 'group_share' && msg.metadata?.groupId"
              :group-id="msg.metadata.groupId" :is-mine="isMine(msg)" />

            <!-- ── Story reply card ─────────────────────────────────── -->
            <template v-if="parseStoryReply(msg)">
              <div
                class="mb-0.5 max-w-[220px] w-full overflow-hidden rounded-2xl shadow-md cursor-pointer select-none group"
                :class="[
                  isMine(msg) ? 'rounded-br-sm' : 'rounded-bl-sm',
                  parseStoryReply(msg)!.expired ? 'opacity-60 cursor-default' : 'hover:scale-[1.02] active:scale-[0.98] transition-transform duration-150',
                ]"
                @click.stop="openStoryCard(parseStoryReply(msg)!, msg)"
              >
                <!-- Thumbnail 9:16 -->
                <div
                  class="relative w-full overflow-hidden bg-linear-to-br/srgb from-brand-accent/20 to-purple-900/40"
                  style="aspect-ratio: 9/16; max-height: 300px"
                >
                  <img
                    v-if="parseStoryReply(msg)!.imageUrl && !parseStoryReply(msg)!.expired"
                    :src="parseStoryReply(msg)!.imageUrl"
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <!-- Expired state -->
                  <div
                    v-else
                    class="w-full h-full flex flex-col items-center justify-center gap-2 text-white/40"
                  >
                    <BIcon name="Clock" class="w-8 h-8" />
                    <span class="text-xs font-semibold">{{ langStore.t.chatStoryExpiredLabel }}</span>
                  </div>

                  <!-- Gradient overlays -->
                  <div class="absolute inset-0 bg-linear-to-b/srgb from-black/50 via-transparent to-black/60 pointer-events-none" />

                  <!-- Top: author chip -->
                  <div class="absolute top-2 left-2 right-2 flex items-center gap-1.5">
                    <div class="w-6 h-6 rounded-full overflow-hidden border border-white/30 shrink-0 bg-brand-accent/30">
                      <img
                        v-if="parseStoryReply(msg)!.authorAvatar"
                        :src="parseStoryReply(msg)!.authorAvatar"
                        class="w-full h-full object-cover"
                      />
                      <div v-else class="w-full h-full flex items-center justify-center text-[9px] font-bold text-white">
                        {{ (parseStoryReply(msg)!.authorName || '?')[0].toUpperCase() }}
                      </div>
                    </div>
                    <span class="text-[10px] font-semibold text-white/90 truncate drop-shadow-sm">
                      {{ parseStoryReply(msg)!.authorName }}
                    </span>
                  </div>

                  <!-- Bottom: label + play button -->
                  <div v-if="!parseStoryReply(msg)!.expired" class="absolute bottom-2 inset-x-2 flex items-center justify-between">
                    <div class="flex items-center gap-1">
                      <BIcon name="Sparkles" class="w-3 h-3 text-white/70" />
                      <span class="text-[10px] text-white/70 font-medium">{{ langStore.t.story }}</span>
                    </div>
                    <div class="w-7 h-7 rounded-full bg-white/20 backdrop-blur-xs border border-white/30 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                      <BIcon name="Play" class="w-3 h-3 text-white ml-0.5" />
                    </div>
                  </div>
                </div>

                <!-- Reply text below thumbnail -->
                <div
                  v-if="parseStoryReply(msg)!.replyText"
                  class="px-3 py-2 text-sm leading-snug"
                  :class="isMine(msg)
                    ? 'bg-brand-accent text-white'
                    : 'bg-brand-card text-brand-offwhite border-t border-brand-border/40'"
                >{{ parseStoryReply(msg)!.replyText }}</div>
              </div>
            </template>

            <!-- Fallback: story reply that couldn't be parsed (old format / corrupted) -->
            <template v-else-if="!parseStoryReply(msg) && /^\[story_reply:/u.test(msg.text || '')">
              <div
                class="mb-0.5 max-w-[220px] w-full overflow-hidden rounded-2xl shadow-md opacity-60 select-none"
                :class="isMine(msg) ? 'rounded-br-sm' : 'rounded-bl-sm'"
              >
                <div class="relative w-full bg-linear-to-br/srgb from-brand-accent/20 to-purple-900/40 flex flex-col items-center justify-center gap-2 text-white/40 py-8">
                  <BIcon name="Clock" class="w-8 h-8" />
                  <span class="text-xs font-semibold">{{ langStore.t.chatStoryExpiredLabel }}</span>
                </div>
              </div>
            </template>

            <!-- Emoji-only message (1-3 emoji, no bubble — Telegram/WhatsApp-style) -->
            <div v-if="!msg.file_url && isEmojiOnlyText(msg.text)"
              class="text-[56px] leading-none select-none px-1 py-0.5">
              {{ msg.text }}
            </div>

            <!-- Text bubble (not shown for pure sticker, order cards, emoji-only, or story reply with text already shown in card) -->
            <div v-else-if="!['sticker', 'payment_request', 'payment_confirmation', 'tip'].includes(msg.type) && !parseStoryReply(msg) && !/^\[story_reply:/u.test(msg.text || '') && (msg.text || !msg.file_url)"
              @click="tappedMsgId = tappedMsgId === msg.id ? null : msg.id"
              :class="[
                'relative px-3 py-[7px] rounded-2xl text-sm leading-relaxed wrap-break-word min-w-[60px] transition-shadow',
                isMine(msg)
                  ? 'bg-linear-to-br/srgb from-brand-accent to-[#3d56b8] text-white rounded-br-md shadow-[0_6px_18px_rgba(76,103,207,0.28)]'
                  : 'bg-brand-card/90 text-brand-offwhite border border-white/[0.07] rounded-bl-md shadow-xs backdrop-blur-xs',
                msg._sending ? 'opacity-60' : '',
                translateMode && translations[msg.id] && !isMine(msg) ? 'border-brand-accent/40' : '',
              ]">
              <!-- ── Forwarded banner ── -->
              <div v-if="getForwardedAuthor(msg)"
                class="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b"
                :class="isMine(msg) ? 'border-white/20' : 'border-brand-border'">
                <BIcon name="CornerUpRight" class="w-3 h-3 shrink-0"
                  :class="isMine(msg) ? 'text-white/60' : 'text-brand-accent'" />
                <template v-if="msg.forwarded_from_sender">
                  <img v-if="msg.forwarded_from_sender.avatar_url" :src="msg.forwarded_from_sender.avatar_url" :alt="msg.forwarded_from_sender.username"
                    class="w-3.5 h-3.5 rounded-full object-cover cursor-pointer shrink-0 hover:opacity-80 transition-opacity"
                    @click.stop="goToProfile(msg.forwarded_from_sender.username)" @error="onAvatarError" />
                  <span v-else class="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold cursor-pointer shrink-0"
                    :class="isMine(msg) ? 'bg-white/15 text-white/80' : 'bg-brand-accent/20 text-brand-accent'"
                    @click.stop="goToProfile(msg.forwarded_from_sender.username)">
                    {{ (msg.forwarded_from_sender.display_name || msg.forwarded_from_sender.username || '?')[0].toUpperCase() }}
                  </span>
                </template>
                <span class="text-[10px] font-semibold truncate"
                  :class="[isMine(msg) ? 'text-white/60' : 'text-brand-accent', msg.forwarded_from_sender ? 'cursor-pointer hover:underline' : '']"
                  @click.stop="msg.forwarded_from_sender && goToProfile(msg.forwarded_from_sender.username)">
                  {{ langStore.t.chatForwardedFromLabel }} {{ getForwardedAuthor(msg) }}
                </span>
              </div>
              <!-- ── Translate mode: incoming messages ── -->
              <template v-if="translateMode && !isMine(msg) && msg.text">
                <template v-if="translations[msg.id]">
                  <span v-html="renderMentions(translations[msg.id])"></span>
                  <span class="block text-[10px] opacity-40 mt-1 border-t border-white/10 pt-1">{{ getMsgText(msg) }}</span>
                </template>
                <template v-else-if="translatingIds.has(msg.id)">
                  <div class="stack-y-1.5">
                    <div class="h-3 rounded-full bg-white/20 animate-pulse w-full" />
                    <div class="h-3 rounded-full bg-white/15 animate-pulse w-3/4" />
                  </div>
                  <span class="block text-[10px] opacity-40 mt-1.5">{{ getMsgText(msg) }}</span>
                </template>
                <template v-else>
                  <span v-if="searchQuery" v-html="highlight(getMsgText(msg))" />
                  <span v-else v-html="renderMentions(getMsgText(msg))"></span>
                </template>
              </template>
              <!-- ── Normal mode ── -->
              <template v-else>
                <span v-if="searchQuery" v-html="highlight(getMsgText(msg))" />
                <span v-else v-html="renderMentions(getMsgText(msg))"></span>
              </template>
            </div>

            <!-- Reactions row -->
            <TransitionGroup v-if="msg.reactions && Object.keys(msg.reactions).length"
              tag="div" name="reaction-pop"
              class="flex flex-wrap gap-1 mt-1"
              :class="isMine(msg) ? 'justify-end' : 'justify-start'">
              <button v-for="(users, emoji) in msg.reactions" :key="emoji"
                type="button" @click="toggleChipReaction(msg, emoji, users, $event)"
                :class="['flex items-center gap-1 px-2 py-0.5 rounded-full text-xs leading-none transition-all border active:scale-95',
                  reactionHasMe(users)
                    ? 'bg-brand-accent/20 border-brand-accent/50 text-white'
                    : 'bg-brand-bg/80 border-brand-border/50 text-white/70 hover:border-brand-accent/30']"
                :title="reactionHasMe(users) ? langStore.t.chatRemoveReactionTitle : langStore.t.chatAddReactionTitle">
                <span class="text-[13px]">{{ emoji }}</span>
                <span class="text-[10px] font-bold">{{ users.length }}</span>
              </button>
            </TransitionGroup>

            <!-- Time + status + actions -->
            <div class="flex items-center gap-1 mt-0.5">
              <span class="text-[10px] text-white/55">{{ formatMsgTime(msg.created_at) }}</span>
              <span v-if="msg.edited_at" class="text-[10px] text-white/40 italic" :title="langStore.t.chatEditedTitle">{{ langStore.t.chatEditedAbbr }}</span>

              <!-- Read status icons (only on my messages) -->
              <template v-if="isMine(msg)">
                <button v-if="msg._failed && msg._failReason === 'DAILY_MESSAGE_LIMIT_REACHED'" type="button"
                  @click="router.push('/subscription')"
                  class="flex items-center gap-0.5 text-amber-400 hover:text-amber-300" :title="langStore.t.chatDailyLimitReachedTitle">
                  <BIcon name="Lock" class="w-3 h-3" />
                </button>
                <button v-else-if="msg._failed" type="button" @click="retrySend(msg)"
                  class="flex items-center gap-0.5 text-red-400 hover:text-red-300" :title="langStore.t.chatNotSentRetryTitle">
                  <BIcon name="AlertCircle" class="w-3 h-3" />
                </button>
                <BIcon v-else-if="msg._sending" name="Clock" class="w-3 h-3 text-white/55" :title="langStore.t.chatSendingTitle" />
                <span v-else-if="isRead(msg)" class="flex items-center text-brand-accent" :title="langStore.t.chatReadTitle">
                  <BIcon name="CheckCheck" class="w-3 h-3" />
                </span>
                <span v-else class="flex items-center text-white/55" :title="langStore.t.chatDeliveredTitle">
                  <BIcon name="Check" class="w-3 h-3" />
                </span>
              </template>

              <!-- Bubble action buttons (show on hover / tap) -->
              <div class="items-center gap-0.5 relative" :class="tappedMsgId === msg.id ? 'flex' : 'hidden group-hover:flex'">
                <button type="button" @click.stop="toggleReactionPicker(msg.id)"
                  class="p-0.5 rounded-sm hover:text-amber-400 text-white/55 transition-colors" :title="langStore.t.chatReactionTitle">
                  <BIcon name="SmilePlus" class="w-3 h-3" />
                </button>
                <button type="button" @click="replyTo = msg"
                  class="p-0.5 rounded-sm hover:text-brand-accent text-white/55 transition-colors" :title="langStore.t.reply">
                  <BIcon name="CornerUpLeft" class="w-3 h-3" />
                </button>
                <button type="button" @click="openPinModal(msg)"
                  class="p-0.5 rounded-sm hover:text-amber-400 text-white/55 transition-colors" :title="langStore.t.chatPinTitle">
                  <BIcon name="Pin" class="w-3 h-3" />
                </button>
                <button type="button" @click="startForward(msg)"
                  class="p-0.5 rounded-sm hover:text-brand-accent text-white/55 transition-colors" :title="langStore.t.chatForwardAction">
                  <BIcon name="Forward" class="w-3 h-3" />
                </button>
                <button v-if="msg.text" type="button" @click="copyMessageText(msg)"
                  class="p-0.5 rounded-sm hover:text-brand-accent text-white/55 transition-colors" :title="langStore.t.chatCopyMsgActionTitle">
                  <BIcon name="Copy" class="w-3 h-3" />
                </button>
                <button v-if="isMine(msg) && msg.type === 'text' && !msg._sending" @click="startEdit(msg)"
                  class="p-0.5 rounded-sm hover:text-brand-accent text-white/55 transition-colors" :title="langStore.t.chatEditMsgTitle">
                  <BIcon name="Pencil" class="w-3 h-3" />
                </button>
                <button v-if="isMine(msg) && !msg._sending" @click="deleteMsg(msg.id)"
                  class="p-0.5 rounded-sm hover:text-brand-error text-white/55 transition-colors" :title="langStore.t.deleteBtn">
                  <BIcon name="Trash2" class="w-3 h-3" />
                </button>

                <!-- Reaction picker popover (anchored to action row) -->
                <Transition name="mention-pop">
                  <div v-if="reactionPickerFor === msg.id"
                    class="absolute bottom-full mb-1.5 z-30 flex items-center gap-0.5 px-2 py-1.5 rounded-2xl bg-brand-card border border-brand-border shadow-2xl"
                    :class="isMine(msg) ? 'right-0' : 'left-0'"
                    @click.stop>
                    <button v-for="e in QUICK_REACTIONS" :key="e"
                      type="button"
                      @click="pickReaction(msg, e, $event)"
                      class="w-7 h-7 flex items-center justify-center text-base rounded-full hover:bg-brand-accent/15 hover:scale-125 active:scale-95 transition-all">
                      {{ e }}
                    </button>
                  </div>
                </Transition>
              </div>
            </div>
          </div>
          </template><!-- /regular bubble -->
        </div>
        </template>
      </template>

      <!-- Typing indicator -->
      <div v-if="isPartnerTyping && !searchQuery" class="flex items-end gap-2 justify-start mt-1">
        <div class="w-6 h-6 shrink-0">
          <img v-if="other?.avatar_url" :src="other.avatar_url" class="w-6 h-6 rounded-full object-cover border border-brand-border" @error="onAvatarError" />
        </div>
        <div class="bg-brand-card/90 border border-white/10 rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1 backdrop-blur-xs">
          <span class="w-1.5 h-1.5 rounded-full bg-brand-muted animate-bounce [animation-delay:-0.3s]" />
          <span class="w-1.5 h-1.5 rounded-full bg-brand-muted animate-bounce [animation-delay:-0.15s]" />
          <span class="w-1.5 h-1.5 rounded-full bg-brand-muted animate-bounce" />
        </div>
      </div>

      <!-- Scroll anchor -->
      <div ref="bottomEl" />
    </div>

    <!-- ── Floating scroll-to-bottom button ───────────────────────────────── -->
    <Transition name="scroll-btn">
      <button v-if="showScrollDown" type="button"
        @click="scrollToBottom(true); unreadInChat = 0"
        class="absolute right-4 bottom-[96px] z-20 w-10 h-10 rounded-full bg-brand-card/90 backdrop-blur-md border border-white/10 shadow-xl flex items-center justify-center text-white hover:bg-brand-accent hover:border-brand-accent active:scale-95 transition-all"
        :title="langStore.t.chatScrollDownTitle">
        <BIcon name="ChevronDown" class="w-5 h-5" />
        <span v-if="unreadInChat > 0"
          class="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-accent text-white text-[10px] font-bold flex items-center justify-center border-2 border-brand-card">
          {{ unreadInChat > 99 ? '99+' : unreadInChat }}
        </span>
      </button>
    </Transition>

    <!-- ── Media lightbox (PostLightbox) ───────────────────────────────────── -->
    <PostLightbox v-if="lightboxUrls.length"
      :images="lightboxUrls"
      :types="lightboxTypes"
      :start-index="lightboxStart"
      @close="lightboxUrls = []" />

    <!-- ── Sticker pack preview modal ───────────────────────────────────────── -->
    <StickerPackPreviewModal
      :show="!!stickerPackUrl"
      :sticker-url="stickerPackUrl ?? ''"
      @close="stickerPackUrl = null" />

    <!-- ── "Slow down" spam nag ─────────────────────────────────────────────── -->
    <SpamSlowdownModal
      :show="store.spamNagActive"
      :cooldown-until="store.spamNagCooldownUntil"
      @close="store.dismissSpamNag()" />

    <!-- ── Delete conversation modal ─────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showDeleteModal"
          class="fixed inset-0 z-200 flex items-center justify-center p-4"
          style="background:rgba(0,0,0,.55)" @click.self="showDeleteModal = false">
          <div class="bg-brand-card border border-brand-border rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 class="text-lg font-bold text-white mb-2">{{ langStore.t.contextDeleteConv }}</h3>
            <p class="text-sm text-white/55 mb-5">{{ langStore.t.chatDeleteConvChoiceLabel }}</p>
            <div class="flex flex-col gap-2">
              <button @click="deleteConversation('me')"
                class="w-full px-4 py-2.5 rounded-xl text-sm font-medium bg-brand-bg border border-brand-border text-brand-offwhite hover:border-brand-accent/50 hover:text-white transition-all text-left">
                {{ langStore.t.deleteOnlyMeTitle }}
                <span class="block text-xs text-white/55 font-normal">{{ langStore.t.deleteOnlyMeHint }}</span>
              </button>
              <button @click="deleteConversation('all')"
                class="w-full px-4 py-2.5 rounded-xl text-sm font-medium bg-brand-error/10 border border-brand-error/30 text-brand-error hover:bg-brand-error/20 transition-all text-left">
                {{ langStore.t.deleteForAllTitle }}
                <span class="block text-xs opacity-70 font-normal">{{ langStore.t.deleteForAllHint }}</span>
              </button>
              <button @click="showDeleteModal = false"
                class="w-full px-4 py-2 rounded-xl text-sm text-white/55 hover:text-white hover:bg-brand-bg transition-colors">
                {{ langStore.t.cancel }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Block modal ────────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showBlockModal"
          class="fixed inset-0 z-200 flex items-center justify-center p-4"
          style="background:rgba(0,0,0,.55)" @click.self="showBlockModal = false">
          <div class="bg-brand-card border border-brand-border rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 class="text-lg font-bold text-white mb-2">
              {{ isBlocked ? langStore.t.chatUnblockLabel : langStore.t.blockUserBtn }}
              {{ other?.display_name || other?.username }}
            </h3>
            <p class="text-sm text-white/55 mb-5">
              <template v-if="isBlocked">{{ langStore.t.chatUnblockHint }}</template>
              <template v-else>{{ langStore.t.chatBlockHint }}</template>
            </p>
            <div class="flex gap-2">
              <button @click="toggleBlock()"
                class="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                :class="isBlocked ? 'bg-brand-accent/10 border border-brand-accent/30 text-brand-accent hover:bg-brand-accent/20' : 'bg-brand-error/10 border border-brand-error/30 text-brand-error hover:bg-brand-error/20'">
                {{ isBlocked ? langStore.t.chatUnblockLabel : langStore.t.blockUserBtn }}
              </button>
              <button @click="showBlockModal = false"
                class="flex-1 px-4 py-2.5 rounded-xl text-sm text-white/55 hover:text-white hover:bg-brand-bg border border-brand-border transition-colors">
                {{ langStore.t.cancel }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <!-- ── Forward modal ────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="forwardMsg || forwardMsgs.length" class="fixed inset-0 z-200 flex items-center justify-center p-4"
          style="background:rgba(0,0,0,.55)" @click.self="closeForwardModal">
          <div class="bg-brand-card border border-brand-border rounded-3xl p-5 w-full max-w-sm shadow-2xl">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-base font-bold text-white">{{ forwardList.length > 1 ? langStore.t.chatForwardCountedTitle.replace('{n}', String(forwardList.length)) : langStore.t.chatForwardSingleMsg }}</h3>
              <button @click="closeForwardModal" class="p-1.5 rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-colors">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>
            <!-- Quote preview -->
            <div v-if="forwardList.length === 1" class="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-brand-bg border border-brand-border/60">
              <div class="w-0.5 h-7 rounded-full bg-brand-accent shrink-0" />
              <div class="min-w-0">
                <p class="text-[10px] text-brand-accent font-semibold truncate">{{ forwardList[0].sender?.display_name || forwardList[0].sender?.username }}</p>
                <p class="text-[11px] text-white/55 truncate">{{ forwardMsgPreview(forwardList[0]) }}</p>
              </div>
            </div>
            <div v-else class="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-brand-bg border border-brand-border/60">
              <BIcon name="Forward" class="w-4 h-4 text-brand-accent shrink-0" />
              <p class="text-[11px] text-white/55">{{ langStore.t.chatSelectedMessagesCountLabel }}: {{ forwardList.length }}</p>
            </div>
            <!-- Conv list -->
            <div class="stack-y-1 max-h-52 overflow-y-auto">
              <button v-for="c in store.conversations.filter(c2 => c2.id !== convId)" :key="c.id"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-brand-bg transition-colors text-left"
                @click="doForward(c.id)">
                <div :class="['w-8 h-8 shrink-0 overflow-hidden bg-brand-accent/20 border border-brand-border', c.is_group ? 'rounded-lg' : 'rounded-full']">
                  <img v-if="c.is_group ? c.avatar_url : c.other_participants[0]?.user?.avatar_url"
                    :src="c.is_group ? c.avatar_url! : c.other_participants[0].user.avatar_url!"
                    class="w-full h-full object-cover" @error="onAvatarError" />
                  <div v-else class="w-full h-full flex items-center justify-center text-brand-accent text-xs font-bold">
                    {{ ((c.is_group ? c.name : (c.other_participants[0]?.user?.display_name || c.other_participants[0]?.user?.username)) || '?')[0]?.toUpperCase() }}
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-white font-medium truncate leading-tight">
                    {{ c.is_group ? (c.name || langStore.t.chatGroupFallbackName) : (c.other_participants[0]?.user?.display_name || c.other_participants[0]?.user?.username || langStore.t.chatInterlocutorFallback) }}
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Message context menu (right-click) ────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="contextMenuMsg" class="fixed inset-0 z-250" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu">
        <div class="absolute w-56 bg-brand-card border border-brand-border rounded-2xl shadow-2xl py-1.5 overflow-hidden"
          :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
          @click.stop @contextmenu.prevent.stop>
          <button @click="replyTo = contextMenuMsg; closeContextMenu()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
            <BIcon name="CornerUpLeft" class="w-4 h-4 text-white/55 shrink-0" />
            {{ langStore.t.reply }}
          </button>
          <button v-if="isMine(contextMenuMsg) && contextMenuMsg.type === 'text' && !contextMenuMsg._sending"
            @click="startEdit(contextMenuMsg); closeContextMenu()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
            <BIcon name="Pencil" class="w-4 h-4 text-white/55 shrink-0" />
            {{ langStore.t.chatEditMsgTitle }}
          </button>
          <button @click="openPinModal(contextMenuMsg); closeContextMenu()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
            <BIcon name="Pin" class="w-4 h-4 text-white/55 shrink-0" />
            {{ langStore.t.chatPinTitle }}
          </button>
          <button v-if="contextMenuMsg.text" @click="copyMessageText(contextMenuMsg); closeContextMenu()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
            <BIcon name="Copy" class="w-4 h-4 text-white/55 shrink-0" />
            {{ langStore.t.chatCopyMsgTextAction }}
          </button>
          <button @click="startForward(contextMenuMsg); closeContextMenu()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
            <BIcon name="Forward" class="w-4 h-4 text-white/55 shrink-0" />
            {{ langStore.t.chatForwardAction }}
          </button>
          <div class="border-t border-brand-border my-1" />
          <button @click="toggleSelect(contextMenuMsg.id); closeContextMenu()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
            <BIcon name="CheckSquare" class="w-4 h-4 text-white/55 shrink-0" />
            {{ langStore.t.chatSelectMsgAction }}
          </button>
          <button v-if="isMine(contextMenuMsg) && !contextMenuMsg._sending" @click="deleteMsg(contextMenuMsg.id); closeContextMenu()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-error hover:bg-brand-error/8 transition-colors text-left">
            <BIcon name="Trash2" class="w-4 h-4 shrink-0" />
            {{ langStore.t.deleteBtn }}
          </button>
        </div>
      </div>
    </Teleport>

    <!-- ── Invite-to-group picker ───────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showInvitePicker" class="fixed inset-0 z-200 flex items-center justify-center p-4"
          style="background:rgba(0,0,0,.55)" @click.self="showInvitePicker = false">
          <div class="bg-brand-card border border-brand-border rounded-3xl p-5 w-full max-w-sm shadow-2xl">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-base font-bold text-white">{{ langStore.t.chatInviteToGroupTitle }} «{{ conv?.name || langStore.t.chatGroupFallbackAccusative }}»</h3>
              <button @click="showInvitePicker = false" class="p-1.5 rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-colors">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>
            <p v-if="inviteSentTo" class="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-brand-success/10 text-brand-success text-sm">
              <BIcon name="CheckCircle2" class="w-4 h-4 shrink-0" />
              {{ langStore.t.chatInviteSentLabel }} {{ inviteSentTo }}
            </p>
            <div v-if="!invitableConversations.length" class="text-center text-sm text-white/40 py-6">
              {{ langStore.t.chatNoDmsForInvite }}
            </div>
            <div v-else class="stack-y-1 max-h-64 overflow-y-auto">
              <button v-for="c in invitableConversations" :key="c.id"
                :disabled="invitingConvId === c.id"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-brand-bg transition-colors text-left disabled:opacity-50"
                @click="doInviteToGroup(c)">
                <div class="w-8 h-8 rounded-full shrink-0 overflow-hidden bg-brand-accent/20 border border-brand-border">
                  <img v-if="c.other_participants[0]?.user?.avatar_url" :src="c.other_participants[0].user.avatar_url!"
                    class="w-full h-full object-cover" @error="onAvatarError" />
                  <div v-else class="w-full h-full flex items-center justify-center text-brand-accent text-xs font-bold">
                    {{ (c.other_participants[0]?.user?.display_name || c.other_participants[0]?.user?.username || '?')[0]?.toUpperCase() }}
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-white font-medium truncate leading-tight">
                    {{ c.other_participants[0]?.user?.display_name || c.other_participants[0]?.user?.username || langStore.t.chatInterlocutorFallback }}
                  </p>
                </div>
                <BIcon v-if="invitingConvId === c.id" name="Loader2" class="w-4 h-4 text-brand-accent animate-spin shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── @Mention card popover ───────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="mentionCard" class="fixed z-210 bg-brand-card border border-brand-border rounded-2xl shadow-2xl p-3 w-56"
          :style="{ top: mentionCard.y + 'px', left: mentionCard.x + 'px' }"
          @mouseleave="mentionCard = null">
          <div class="flex items-center gap-2.5 mb-3">
            <img v-if="mentionCard.avatar_url" :src="mentionCard.avatar_url" class="w-10 h-10 rounded-full object-cover border border-brand-border shrink-0" @error="onAvatarError" />
            <div v-else class="w-10 h-10 rounded-full bg-brand-accent/20 border border-brand-border flex items-center justify-center text-brand-accent font-bold shrink-0">
              {{ (mentionCard.display_name || mentionCard.username || '?')[0].toUpperCase() }}
            </div>
            <div class="min-w-0">
              <p class="text-sm font-bold text-white truncate leading-tight">{{ mentionCard.display_name || mentionCard.username }}</p>
              <p class="text-xs text-white/55 truncate">@{{ mentionCard.username }}</p>
            </div>
          </div>
          <div class="flex gap-2">
            <button @click="goToProfile(mentionCard.username); mentionCard = null"
              class="flex-1 py-1.5 rounded-xl bg-brand-bg hover:bg-brand-border/40 text-xs text-brand-offwhite transition-colors">
              {{ langStore.t.profile }}
            </button>
            <button @click="openDM(mentionCard.id); mentionCard = null"
              class="flex-1 py-1.5 rounded-xl bg-brand-accent hover:bg-brand-accent-plus text-xs text-white transition-colors">
              {{ langStore.t.msgBtnTitle }}
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
    <!-- ── Order actions row (only in chats labeled "заказ") ────────────────── -->
    <div v-if="conv?.my_participant?.label === 'customer'"
      class="px-3 pt-2.5 border-t border-white/6 bg-brand-card/80 backdrop-blur-xl shrink-0 flex items-center gap-2">
      <button type="button" @click="showPaymentModal = true"
        class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-2xl bg-linear-to-r/srgb from-brand-accent/15 to-brand-accent/5 border border-brand-accent/30 text-brand-accent text-xs font-bold hover:from-brand-accent/25 hover:to-brand-accent/10 transition-all active:scale-[0.98]">
        <span class="w-4 h-4 rounded-md bg-brand-accent/20 flex items-center justify-center">
          <BIcon name="CreditCard" class="w-2.5 h-2.5" />
        </span>
        {{ langStore.t.chatRequestPaymentAction }}
      </button>
      <button type="button" @click="showTipPicker = !showTipPicker"
        class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-2xl bg-linear-to-r/srgb from-brand-purple/15 to-brand-pink/10 border border-brand-pink/30 text-brand-pink text-xs font-bold hover:from-brand-purple/25 hover:to-brand-pink/15 transition-all active:scale-[0.98]">
        <span class="w-4 h-4 rounded-md bg-brand-pink/20 flex items-center justify-center">
          <BIcon name="Gift" class="w-2.5 h-2.5" />
        </span>
        {{ langStore.t.chatSupportAction }}
      </button>
    </div>

    <!-- ── Input ───────────────────────────────────────────────────────────── -->
    <div class="px-3 py-3 border-t border-white/6 bg-brand-card/85 backdrop-blur-xl shrink-0 relative">
      <!-- Tip quick-amount popover -->
      <Transition name="popover-up">
        <div v-if="showTipPicker" class="absolute bottom-full right-3 mb-2 z-50 bg-brand-card border border-brand-border rounded-2xl shadow-2xl p-3 w-56">
          <p class="text-xs font-bold text-white/70 mb-2 flex items-center gap-1.5">
            <span class="text-sm">🎉</span> {{ langStore.t.chatSendTipAction }}
          </p>
          <div class="grid grid-cols-4 gap-1.5 mb-2">
            <button v-for="amt in [100, 300, 500, 1000]" :key="amt" type="button" @click="sendQuickTip(amt)"
              class="py-1.5 rounded-xl bg-brand-bg border border-brand-border hover:border-brand-pink/50 hover:text-brand-pink text-xs font-bold text-white/85 transition-all active:scale-95">
              {{ amt }}
            </button>
          </div>
          <div class="flex items-center gap-1.5">
            <input v-model="customTipAmount" type="number" min="1" :placeholder="langStore.t.chatCustomAmountPlaceholder"
              class="flex-1 min-w-0 bg-brand-bg border border-brand-border rounded-xl px-2.5 py-1.5 text-xs text-white outline-hidden focus:border-brand-pink/50" />
            <button type="button" @click="sendQuickTip(Number(customTipAmount))" :disabled="!customTipAmount || Number(customTipAmount) <= 0"
              class="shrink-0 px-3 py-1.5 rounded-xl bg-linear-to-r/srgb from-brand-purple/25 to-brand-pink/25 text-brand-pink text-xs font-bold disabled:opacity-40 transition-all active:scale-95">
              {{ langStore.t.chatSendAbbr }}
            </button>
          </div>
        </div>
      </Transition>

      <!-- Emoji Picker popover -->
      <Transition name="popover-up">
        <div v-if="showEmojiPicker"
          class="absolute bottom-full left-3 mb-2 z-50">
          <EmojiPicker @pick="insertEmoji" />
        </div>
      </Transition>
      <!-- Sticker Panel popover -->
      <Transition name="popover-up">
        <div v-if="showStickerPanel"
          class="absolute bottom-full left-3 mb-2 z-50">
          <StickerPanel @pick="sendSticker" @pickEmoji="insertEmojiFromStickers" />
        </div>
      </Transition>
      <form @submit.prevent="submit" class="flex items-end gap-2">
        <button type="button" @click="fileInputEl?.click()"
          :disabled="isUploading || isRecording || pendingAttachments.length >= MAX_ATTACHMENTS"
          class="shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center text-white/50 hover:text-brand-accent hover:bg-white/6 transition-all disabled:opacity-40"
          :title="langStore.t.chatAttachMediaTitle">
          <BIcon v-if="isUploading" name="Loader2" class="w-4 h-4 animate-spin" />
          <BIcon v-else name="Paperclip" class="w-4.5 h-4.5" />
        </button>
        <input ref="fileInputEl" type="file" multiple accept="image/*,video/*,audio/*" class="sr-only" @change="onFileChange" />

        <!-- Emoji button -->
        <button type="button"
          @click="showEmojiPicker = !showEmojiPicker; showStickerPanel = false"
          :class="['shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center transition-all',
            showEmojiPicker ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/50 hover:text-brand-accent hover:bg-white/6']"
          :title="langStore.t.chatEmojiTitle">
          <BIcon name="Smile" class="w-5 h-5" />
        </button>

        <!-- Sticker button -->
        <button type="button"
          @click="showStickerPanel = !showStickerPanel; showEmojiPicker = false"
          :class="['shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center transition-all',
            showStickerPanel ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/50 hover:text-brand-accent hover:bg-white/6']"
          :title="langStore.t.chatStickersTitle">
          <BIcon name="Sticker" class="w-5 h-5" />
        </button>

        <!-- Recording in progress bar (takes the place of the textarea row when recording) -->
        <button v-if="isRecording" type="button" @click="stopRecording"
          class="flex-1 flex items-center gap-2 px-3 h-11 rounded-[22px] bg-brand-error/15 border border-brand-error/40 text-brand-error hover:bg-brand-error/25 transition-all">
          <span class="w-2 h-2 rounded-full bg-brand-error animate-ping shrink-0" />
          <span class="text-xs font-mono flex-1">{{ fmtRecording(recordingSeconds) }}</span>
          <span class="text-xs text-brand-error/70">{{ langStore.t.chatTapToSendHint }}</span>
        </button>

        <div v-else class="flex-1 relative">
          <!-- @mention dropdown -->
          <Transition name="mention-pop">
            <div v-if="mentionResults.length || mentionLoading"
              class="absolute bottom-full left-0 right-0 mb-1.5 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden z-40">
              <div v-if="mentionLoading" class="px-4 py-3 text-xs text-white/55 text-center">{{ langStore.t.searchPlaceholder }}</div>
              <button v-for="u in mentionResults" :key="u.id" type="button" @click="selectMention(u.username)"
                class="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-brand-bg transition-colors text-left">
                <img v-if="u.avatar_url" :src="u.avatar_url" class="w-7 h-7 rounded-full object-cover shrink-0" @error="onAvatarError" />
                <div v-else class="w-7 h-7 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-bold shrink-0">
                  {{ (u.display_name || u.username || '?')[0].toUpperCase() }}
                </div>
                <div class="min-w-0">
                  <p class="text-sm text-white font-medium truncate leading-tight">{{ u.display_name || u.username }}</p>
                  <p class="text-xs text-white/55 truncate">@{{ u.username }}</p>
                </div>
              </button>
            </div>
          </Transition>
          <!-- Edit bar -->
          <div v-if="editingMsg" class="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-bg border border-amber-400/40">
            <BIcon name="Pencil" class="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-[10px] text-amber-400 font-semibold truncate leading-tight">{{ langStore.t.chatEditingMessageLabel }}</p>
              <p class="text-[11px] text-white/55 truncate leading-tight">
                {{ previewMsgText(editingMsg.text ?? undefined, 60) }}
              </p>
            </div>
            <button type="button" @click="cancelEdit" class="shrink-0 p-0.5 text-white/55 hover:text-brand-error transition-colors">
              <BIcon name="X" class="w-3.5 h-3.5" />
            </button>
          </div>
          <!-- Reply bar -->
          <div v-if="replyTo && !editingMsg" class="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-bg border border-brand-accent/30">
            <div class="w-0.5 h-8 rounded-full bg-brand-accent shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-[10px] text-brand-accent font-semibold truncate leading-tight">
                {{ replyTo.sender?.display_name || replyTo.sender?.username || langStore.t.messageBtn }}
              </p>
              <p class="text-[11px] text-white/55 truncate leading-tight">
                {{ replyTo.file_url && !replyTo.text ? langStore.t.mediaFilePreview : previewMsgText(replyTo.text, 60) }}
              </p>
            </div>
            <button type="button" @click="replyTo = null" class="shrink-0 p-0.5 text-white/55 hover:text-brand-error transition-colors">
              <BIcon name="X" class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Attachment upload error -->
          <Transition name="attach-pop">
            <p v-if="uploadError" class="mb-2 px-3 py-1.5 rounded-xl bg-brand-error/10 border border-brand-error/30 text-brand-error text-xs">
              {{ uploadError }}
            </p>
          </Transition>

          <!-- Attachment previews (multiple — e.g. a photo + a video in the same message) -->
          <TransitionGroup v-if="pendingAttachments.length" tag="div" name="attach-pop"
            class="mb-2 flex items-center gap-2 flex-wrap">
            <div v-for="a in pendingAttachments" :key="a.id"
              class="relative flex items-center gap-2 bg-brand-bg border border-brand-border rounded-2xl p-2 pr-3 max-w-[220px] shadow-xs">
              <div class="relative shrink-0 w-11 h-11 rounded-xl overflow-hidden bg-black/25 flex items-center justify-center">
                <video v-if="a.kind === 'video' || a.kind === 'gif'" :src="a.previewUrl!" class="w-full h-full object-cover" muted />
                <img v-else-if="a.kind === 'image'" :src="a.previewUrl!" class="w-full h-full object-cover" />
                <BIcon v-else-if="a.kind === 'audio'" name="Music" class="w-5 h-5 text-brand-accent" />
                <BIcon v-else name="FileText" class="w-5 h-5 text-brand-accent" />
                <!-- Circular upload progress -->
                <div v-if="a.uploading" class="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <svg class="w-7 h-7 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2.5"/>
                    <circle cx="18" cy="18" r="15" fill="none" stroke="white" stroke-width="2.5"
                      :stroke-dasharray="`${(a.progress / 100) * 94.25} 94.25`"
                      class="transition-all duration-200"/>
                  </svg>
                </div>
                <div v-else-if="a.failed" class="absolute inset-0 bg-brand-error/70 flex items-center justify-center">
                  <BIcon name="AlertCircle" class="w-4 h-4 text-white" />
                </div>
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-xs font-semibold text-white truncate">{{ a.name }}</p>
                <p class="text-[10px] text-white/45 truncate">
                  {{ a.failed ? langStore.t.chatUploadErrorLabel : a.uploading ? `${a.progress}%` : formatFileSize(a.size) }}
                </p>
              </div>
              <button type="button" @click="removePendingAttachment(a.id)"
                class="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white/45 hover:text-brand-error hover:bg-brand-error/10 transition-colors">
                <BIcon name="X" class="w-3.5 h-3.5" />
              </button>
            </div>
          </TransitionGroup>
          <textarea ref="inputEl" v-model="draft" rows="1"
            :placeholder="pendingAttachments.length ? langStore.t.chatCaptionPlaceholder : langStore.t.chatMessagePlaceholder"
            class="block w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-[9px] text-sm text-white placeholder-brand-muted resize-none outline-hidden focus:border-brand-accent/60 transition-colors max-h-32 overflow-y-auto"
            @keydown.enter.exact.prevent="submit"
            @keydown.enter.shift.exact="newline"
            @paste="onPaste"
            @input="onInput"
          />
        </div>

        <!-- Send / Mic toggle button -->
        <Transition name="btn-swap" mode="out-in">
          <!-- Mic: shown when no text and no attachment and not recording -->
          <button v-if="!draft.trim() && !pendingAttachments.length && !isRecording" key="mic"
            type="button" @click="startRecording"
            :disabled="isUploading"
            class="shrink-0 w-10 h-10 rounded-2xl bg-brand-card border border-brand-border hover:bg-brand-bg text-white/55 hover:text-brand-accent transition-all flex items-center justify-center disabled:opacity-40"
            :title="langStore.t.chatVoiceMessageTitle">
            <BIcon name="Mic" class="w-4 h-4" />
          </button>
          <!-- Send: shown when there's text or at least one uploaded attachment -->
          <button v-else key="send"
            type="submit"
            :disabled="(!draft.trim() && !pendingAttachments.some((a) => a.uploadedUrl && !a.failed)) || isUploading"
            class="shrink-0 w-10 h-10 rounded-2xl bg-brand-accent hover:bg-brand-accent-plus disabled:opacity-30 transition-all shadow-lg shadow-brand-accent/20 active:scale-95 flex items-center justify-center"
            :title="langStore.t.send">
            <BIcon name="SendHorizontal" class="w-4 h-4 text-white" />
          </button>
        </Transition>
      </form>
    </div>
  </div>

  <ChatStoryViewer :card="activeStoryCard" @close="activeStoryCard = null" />

  <!-- ── Reaction burst flourish (flying emoji on pick) ────────────────────── -->
  <Teleport to="body">
    <div v-for="b in reactionBursts" :key="b.id"
      class="reaction-burst pointer-events-none fixed z-300 text-3xl"
      :style="{ left: b.x + 'px', top: b.y + 'px' }">
      {{ b.emoji }}
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessagesStore, type Message, type MsgSender, type Conversation, type PinnedMessage } from '@/stores/messages'
import { useAuthStore } from '@/stores/auth'
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
import BIcon from '@/components/BIcon.vue'
import OnlineIndicator from '@/components/OnlineIndicator.vue'
import CustomPlayer from '@/components/CustomPlayer.vue'
import MiniPlayer from '@/components/MiniPlayer.vue'
import { onAvatarError } from '@/composables/useAvatarFallback'
import PostLightbox from '@/components/PostLightbox.vue'
import SharedPostCard from '@/components/SharedPostCard.vue'
import GroupShareCard from '@/components/GroupShareCard.vue'
import EmojiPicker from '@/components/EmojiPicker.vue'
import StickerPanel from '@/components/StickerPanel.vue'
import StickerRenderer from '@/components/StickerRenderer.vue'
import StickerPackPreviewModal from '@/components/StickerPackPreviewModal.vue'
import SpamSlowdownModal from '@/components/SpamSlowdownModal.vue'
import api from '@/api'
import { wsClient } from '@/lib/wsClient'
import { isEncrypted } from '@/lib/e2e'
import * as fmt from '@/lib/format'
import {
  FWD_RE, STORY_REPLY_RE, type StoryReplyMeta, parseStoryReply, getStickerEmoji, isEmojiOnlyText, renderMentions, highlightMatches,
  getDisplayText as displayTextOf, getAlbumFiles, isGifUrl, formatMoney, isOverdue, startOfDay,
} from '@/lib/chatMessage'
import { useChatTranslation } from '@/composables/chat/useChatTranslation'
import { useVoiceRecorder } from '@/composables/chat/useVoiceRecorder'
import { useChatAttachments, MAX_ATTACHMENTS } from '@/composables/chat/useChatAttachments'
import { usePartnerPresence } from '@/composables/chat/usePartnerPresence'
import { useMentionAutocomplete } from '@/composables/chat/useMentionAutocomplete'
import { useChatMediaStats } from '@/composables/chat/useChatMediaStats'
import ChatStoryViewer from '@/components/chat/ChatStoryViewer.vue'
import ChatMediaBrowser from '@/components/chat/ChatMediaBrowser.vue'
import ChatPaymentRequestModal from '@/components/chat/ChatPaymentRequestModal.vue'
import ChatEditGroupModal from '@/components/chat/ChatEditGroupModal.vue'
import ChatGroupInfoModal from '@/components/chat/ChatGroupInfoModal.vue'
import ChatDmInfoModal from '@/components/chat/ChatDmInfoModal.vue'
import { useGroupChatManagement } from '@/composables/chat/useGroupChatManagement'

const props = defineProps<{
  convId: string
  other: MsgSender | undefined
  conv?: Conversation
}>()
const emit = defineEmits<{ (e: 'back'): void; (e: 'archived'): void }>()

const store = useMessagesStore()
const auth  = useAuthStore()
const router = useRouter()
const langStore = useLangStore()

// ── Refs ───────────────────────────────────────────────────────────────────────
const draft       = ref('')
const scrollEl    = ref<HTMLElement | null>(null)
const bottomEl    = ref<HTMLElement | null>(null)
const inputEl     = ref<HTMLTextAreaElement | null>(null)
const fileInputEl = ref<HTMLInputElement | null>(null)
const menuRef     = ref<HTMLElement | null>(null)
const showMenu    = ref(false)
const showSearch  = ref(false)
const searchQuery = ref('')
const lightboxUrl      = ref<string | null>(null)
// Lightbox
const lightboxUrls = ref<string[]>([])
const lightboxTypes = ref<string[]>([])
const lightboxStart = ref(0)
const stickerPackUrl = ref<string | null>(null)
// Legacy E2E messages — decryption removed, only used to show a placeholder for old ciphertext
// Block/delete modals
const showDeleteModal = ref(false)
const showBlockModal  = ref(false)
const isBlocked       = ref(false)
const deleteScope     = ref<'me' | 'all'>('me')
// Group conversation
const showMembersPanel = ref(false)
const showDmPanel      = ref(false)
const pinTarget        = ref<Message | null>(null)
const showPinScopeModal = ref(false)
const showPaymentModal = ref(false)
const showTipPicker    = ref(false)
const customTipAmount  = ref('')

// Emoji & sticker popovers
const showEmojiPicker  = ref(false)
const showStickerPanel = ref(false)
// Reply / forward / mention card
const replyTo      = ref<Message | null>(null)
const forwardMsg   = ref<Message | null>(null)
const forwardMsgs  = ref<Message[]>([])
const tappedMsgId  = ref<string | null>(null)
const mentionCard  = ref<{ username: string; display_name: string | null; avatar_url: string | null; id: string; x: number; y: number } | null>(null)

// ── Message selection (multi-select toolbar) ────────────────────────────────
const selectedMsgIds = ref<Set<string>>(new Set())
const selectionMode  = computed(() => selectedMsgIds.value.size > 0)
const selectedList   = computed(() => displayList.value.filter((m) => selectedMsgIds.value.has(m.id)))
const canDeleteSelected = computed(() => selectedList.value.length > 0 && selectedList.value.every((m) => isMine(m) && !m._sending))

function toggleSelect(id: string) {
  const next = new Set(selectedMsgIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedMsgIds.value = next
}
function clearSelection() {
  selectedMsgIds.value = new Set()
}
function onRowClickCapture(msg: Message, e: MouseEvent) {
  if (msg.type === 'system' || !selectionMode.value) return
  e.preventDefault()
  e.stopPropagation()
  toggleSelect(msg.id)
}
async function deleteSelected() {
  if (!canDeleteSelected.value) return
  const ids = Array.from(selectedMsgIds.value)
  clearSelection()
  await Promise.all(ids.map((id) => store.deleteMessage(id)))
}
function startBulkForward() {
  if (!selectedList.value.length) return
  forwardMsgs.value = selectedList.value
}

// ── Message context menu (right-click) ───────────────────────────────────────
const contextMenuMsg = ref<Message | null>(null)
const contextMenuPos  = ref<{ x: number; y: number }>({ x: 0, y: 0 })
const CONTEXT_MENU_W = 224
const CONTEXT_MENU_H = 320
function openContextMenu(msg: Message, e: MouseEvent) {
  if (msg.type === 'system') return
  e.preventDefault()
  contextMenuMsg.value = msg
  contextMenuPos.value = {
    x: Math.min(e.clientX, window.innerWidth - CONTEXT_MENU_W - 8),
    y: Math.min(e.clientY, window.innerHeight - CONTEXT_MENU_H - 8),
  }
}
function closeContextMenu() {
  contextMenuMsg.value = null
}

// Invite-to-group picker
const showInvitePicker = ref(false)
const invitingConvId   = ref<string | null>(null)
const inviteSentTo     = ref<string | null>(null)
const invitableConversations = computed(() =>
  store.conversations.filter((c) => !c.is_group && c.other_participants?.length),
)
async function doInviteToGroup(target: Conversation) {
  if (!props.conv?.group_id || invitingConvId.value) return
  invitingConvId.value = target.id
  try {
    await store.sendGroupShare(target.id, props.conv.group_id)
    inviteSentTo.value = target.other_participants[0]?.user?.display_name || target.other_participants[0]?.user?.username || langStore.t.chatToUserFallback
    setTimeout(() => { inviteSentTo.value = null; showInvitePicker.value = false }, 1200)
  } catch { /* silent */ }
  finally { invitingConvId.value = null }
}

// Edit mode
const editingMsg = ref<Message | null>(null)

// Reactions
const QUICK_REACTIONS = ['👍','❤️','😂','😮','😢','🔥','🎉','🙏'] as const
const reactionPickerFor = ref<string | null>(null)

// Scroll-to-bottom button + unread-in-chat counter
const showScrollDown = ref(false)
const unreadInChat   = ref(0)

// ── Computed ───────────────────────────────────────────────────────────────────
const msgList = computed<Message[]>(() => store.messages[props.convId] ?? [])
const filteredMsgList = computed(() => {
  if (!searchQuery.value.trim()) return msgList.value
  const q = searchQuery.value.toLowerCase()
  return msgList.value.filter((m) => getDisplayText(m).toLowerCase().includes(q))
})
const displayList = computed(() => searchQuery.value.trim() ? filteredMsgList.value : msgList.value)
// All file_urls in current view (for lightbox navigation) — stickers excluded
const mediaUrls = computed(() =>
  displayList.value
    .filter(m => m.type !== 'sticker')
    .map(m => m.file_url)
    .filter(Boolean) as string[]
)
// Parallel array of msg.type, kept in lock-step with mediaUrls — lets the lightbox
// know a "video" is actually a silent gif-style clip (no player chrome) up front.
const mediaTypes = computed(() =>
  displayList.value
    .filter(m => m.type !== 'sticker' && m.file_url)
    .map(m => m.type)
)

const isPartnerTyping = computed(() => {
  const typers = store.typingUsers[props.convId] ?? []
  return typers.some((uid) => uid !== auth.user?.id)
})

const myRole = computed(() => props.conv?.my_participant?.role ?? 'member')

// ── Group DM ("написать сообществу") ────────────────────────────────────────
// A regular member's personal thread with a group. Staff (admin/owner/moderator,
// opened via the group's inbox) aren't the thread's ConversationParticipant — any
// message they send is shown to the member as coming from the group, not from them.
const isGroupDm = computed(() => props.conv?.type === 'community' && !!props.conv?.group_dm_user_id)
const amGroupDmCustomer = computed(() => isGroupDm.value && props.conv?.group_dm_user_id === auth.user?.id)

// ── Feature composables ───────────────────────────────────────────────────────
const { translateMode, translateLang, translations, translatingIds, autoTranslateMissingMessages } = useChatTranslation(msgList, isMine)
const { isRecording, recordingSeconds, voiceUploading, startRecording, stopRecording, fmtRecording } = useVoiceRecorder((url) => {
  if (!store.checkSpamGate()) store.sendMessage(props.convId, '', url, 'voice')
})
const { pendingAttachments, uploadError, removePendingAttachment, clearAttachments, onFileChange, onPaste } = useChatAttachments(fileInputEl)
const isUploading = computed(() => voiceUploading.value || pendingAttachments.value.some((a) => a.uploading))
const { isPartnerOnline, partnerDevice, partnerLastSeenLabel, partnerDeviceIcon, fetchOnlineStatus, startPolling, resetPresence } = usePartnerPresence(() => props.other?.id)
const { mentionResults, mentionLoading, detectMention, selectMention } = useMentionAutocomplete(draft, inputEl)
const { mediaStatsList, mediaStatsLoading, loadMediaStats } = useChatMediaStats(() => props.convId)
// Media browser modal (ChatMediaBrowser) — opened from a media-stat row
const mediaBrowserType = ref<string | null>(null)
const openMediaBrowser = (type: string) => { mediaBrowserType.value = type }
const groupChat = useGroupChatManagement(() => props.convId, () => props.conv)
const { groupMembers, memberSearchQuery, fetchGroupMembers, fetchGroupOnlineStatus, kickMember, toggleMemberRole } = groupChat
// Edit-group modal (ChatEditGroupModal) refreshes the member list each time it opens
const showEditGroup = ref(false)
watch(showEditGroup, (open) => { if (open) fetchGroupMembers() })

// ── Pin helpers ────────────────────────────────────────────────────────────────
const currentPin = computed<PinnedMessage | null>(() => {
  const c = props.conv
  if (!c) return null
  // Personal pin: look up in loaded messages
  const personalId = c.my_participant?.personal_pinned_message_id
  if (personalId) {
    const msg = store.messages[props.convId]?.find(m => m.id === personalId)
    if (msg) return { id: msg.id, text: msg.text, type: msg.type, file_url: msg.file_url, created_at: msg.created_at, sender: { id: msg.sender.id, username: msg.sender.username, display_name: msg.sender.display_name } }
  }
  return c.pinned_message ?? null
})

async function openPinModal(msg: Message) {
  pinTarget.value = msg
  showPinScopeModal.value = true
}

async function doPinMessage(scope: 'all' | 'me') {
  if (!pinTarget.value) return
  await store.pinMessage(props.convId, pinTarget.value.id, scope)
  showPinScopeModal.value = false
  pinTarget.value = null
}

async function doUnpin(scope: 'all' | 'me') {
  await store.unpinMessage(props.convId, scope)
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function isMine(msg: Message) {
  // Staff viewing a member's group-DM thread: any reply from any admin/owner counts as
  // "our side" (right-aligned), not just messages sent by this specific staffer.
  if (isGroupDm.value && !amGroupDmCustomer.value) return msg.sender_id !== props.conv?.group_dm_user_id
  return msg.sender_id === auth.user?.id
}

// Group helpers
function getMsgSenderAvatar(msg: Message): string | null {
  if (!props.conv?.is_group) return props.other?.avatar_url ?? null
  return msg.sender?.avatar_url ?? null
}

function isSameAsPrev(idx: number): boolean {
  if (idx === 0) return false
  return displayList.value[idx].sender_id === displayList.value[idx - 1].sender_id
}

const SENDER_COLORS = ['#4C67CF','#CF4C67','#67CF4C','#CF9B4C','#4CCFBE','#BE4CCF']
function getSenderColor(userId: string): Record<string, string> {
  const idx = userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % SENDER_COLORS.length
  return { color: SENDER_COLORS[idx] }
}

// Emoji & sticker actions
function insertEmoji(emoji: string) {
  const el = inputEl.value
  if (el) {
    const start = el.selectionStart ?? draft.value.length
    const end   = el.selectionEnd   ?? draft.value.length
    draft.value = draft.value.slice(0, start) + emoji + draft.value.slice(end)
    nextTick(() => {
      el.selectionStart = el.selectionEnd = start + emoji.length
      el.focus()
      autoResize()
    })
  } else {
    draft.value += emoji
  }
  showEmojiPicker.value = false
}

function sendSticker(url: string) {
  showStickerPanel.value = false
  if (store.checkSpamGate()) return
  store.sendMessage(props.convId, '', url, 'sticker')
}

function insertEmojiFromStickers(emoji: string) {
  insertEmoji(emoji)
  showStickerPanel.value = false
}

function isLastInGroup(idx: number) {
  const next = displayList.value[idx + 1]
  if (!next) return true
  return next.sender_id !== displayList.value[idx].sender_id
}

/** Returns human-friendly short preview, stripping service tags */
function previewMsgText(text: string | null | undefined, maxLen = 60): string {
  if (!text) return ''
  if (/^\[story_reply:/u.test(text)) return langStore.t.chatStoryReplyPreview
  return text.replace(FWD_RE, '').slice(0, maxLen)
}

// ── In-chat story viewer ──────────────────────────────────────────────────────
const activeStoryCard = ref<StoryReplyMeta | null>(null)

function openStoryCard(card: StoryReplyMeta, msg?: Message) {
  if (card.expired) return
  // If authorName is empty, try fallback from conversation partner (for old-format messages)
  const enriched = { ...card }
  if (!enriched.authorName && msg?.sender && !isMine(msg))
    enriched.authorName = msg.sender.display_name || msg.sender.username || ''
  activeStoryCard.value = enriched
}

function getForwardedAuthor(msg: Message): string | null {
  if (msg.forwarded_from_sender_id) {
    return msg.forwarded_from_sender
      ? (msg.forwarded_from_sender.display_name || msg.forwarded_from_sender.username)
      : langStore.t.chatHiddenUserFallback
  }
  const m = (msg.text || '').match(FWD_RE); return m ? m[1] : null
}

function getMsgText(msg: Message): string {
  if (msg.forwarded_from_sender) {
    return getDisplayText(msg).replace(STORY_REPLY_RE, '$2')
  }
  return getDisplayText(msg).replace(FWD_RE, '').replace(STORY_REPLY_RE, '$2')
}

// @mention click delegation
function onMsgListClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.classList.contains('mention-link')) {
    const username = target.dataset.username
    if (username) showMentionCard(username, e)
  }
  // Clear tapped message actions when clicking outside a bubble
  if (!target.closest('.group')) {
    tappedMsgId.value = null
    reactionPickerFor.value = null
  }
}
async function showMentionCard(username: string, e: MouseEvent) {
  const rect = (e.target as HTMLElement).getBoundingClientRect()
  try {
    const res = await api.get(`/users/${username}`)
    const u = res.data?.data?.user
    if (!u) return
    mentionCard.value = { username: u.username, display_name: u.display_name, avatar_url: u.avatar_url, id: u.id, x: rect.left, y: rect.bottom + 4 }
  } catch { /* silent */ }
}

// Scroll to a message by id
function scrollToMsg(msgId: string) {
  const el = document.getElementById(`msg-${msgId}`)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

// Forward
function startForward(msg: any) {
  forwardMsg.value = msg
}
const forwardList = computed<Message[]>(() => forwardMsg.value ? [forwardMsg.value] : forwardMsgs.value)
function closeForwardModal() {
  forwardMsg.value = null
  forwardMsgs.value = []
}

function forwardMsgPreview(msg: Message): string {
  if (msg.type === 'sticker') return langStore.t.stickerPreview
  if (msg.type === 'voice') return langStore.t.voiceMessagePreview
  if (msg.type === 'audio') return langStore.t.chatAudioPreview
  if (msg.type === 'post_share') return langStore.t.chatPostPreview
  if (msg.type === 'group_share') return langStore.t.chatGroupInvitePreview
  if (msg.type === 'album') return `${langStore.t.chatAlbumPreviewPrefix} · ${getAlbumFiles(msg).length}`
  if (msg.text && isEncrypted(msg.text)) return langStore.t.encryptedMessagePreview
  if (msg.encrypted_text && !msg.text) return langStore.t.encryptedMessagePreview
  if (msg.text) return previewMsgText(msg.text, 60)
  if (msg.file_url) return langStore.t.mediaFilePreview
  return ''
}
async function doForward(targetConvId: string) {
  const list = forwardList.value
  if (!list.length) return
  closeForwardModal()
  clearSelection()
  try {
    await Promise.all(list.map((m) => store.forwardMessage(m.id, targetConvId)))
  } catch {
    // silent — message(s) still sent via WS push to target conv
  }
}

// Open DM with user from @mention card
async function openDM(userId: string) {
  try {
    const convId = await store.openConversation(userId)
    router.push({ name: 'messages', query: { c: convId } })
    mentionCard.value = null
  } catch { /* silent */ }
}

function isRead(msg: Message): boolean {
  const pRead = store.partnerLastRead[props.convId]
  if (!pRead) return false
  return new Date(msg.created_at) <= new Date(pRead)
}

function formatMsgTime(iso: string) {
  return new Date(iso).toLocaleTimeString(LANG_TO_LOCALE[langStore.currentLang], { hour: '2-digit', minute: '2-digit' })
}

// ── Order cards (chat-only payment request / tip) ──────────────────────────────
const formatDeadline = (deadline: string | undefined) => deadline ? fmt.formatDate(deadline, 'dayMonth', LANG_TO_LOCALE[langStore.currentLang]) : ''
const payingId = ref<string | null>(null)
async function payOrder(msg: Message) {
  if (payingId.value) return
  payingId.value = msg.id
  try {
    await store.payRequest(msg.id)
  } catch { /* silent */ }
  payingId.value = null
}

async function sendQuickTip(amount: number) {
  if (!amount || amount <= 0) return
  showTipPicker.value = false
  customTipAmount.value = ''
  try {
    await store.sendTip(props.convId, amount)
    scrollToBottom(true)
  } catch { /* silent */ }
}

// ── Date dividers ─────────────────────────────────────────────────────────────
function shouldShowDateDivider(idx: number): boolean {
  const cur = displayList.value[idx]
  if (!cur) return false
  if (idx === 0) return true
  const prev = displayList.value[idx - 1]
  if (!prev) return true
  return startOfDay(new Date(cur.created_at)) !== startOfDay(new Date(prev.created_at))
}

function formatDateDivider(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const today = startOfDay(now)
  const target = startOfDay(d)
  const diffDays = Math.round((today - target) / 86_400_000)
  const locale = LANG_TO_LOCALE[langStore.currentLang]
  if (diffDays === 0) return langStore.t.chatTodayLabel
  if (diffDays === 1) return langStore.t.chatYesterdayLabel
  if (diffDays < 7) return d.toLocaleDateString(locale, { weekday: 'long' })
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(locale, { day: 'numeric', month: 'long' })
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Reactions helpers ─────────────────────────────────────────────────────────
function reactionHasMe(users: string[] | undefined): boolean {
  if (!users || !auth.user?.id) return false
  return users.includes(auth.user.id)
}

function toggleReactionPicker(msgId: string) {
  reactionPickerFor.value = reactionPickerFor.value === msgId ? null : msgId
}

// Flying-emoji flourish shown at the click point when a reaction is added
const reactionBursts = ref<Array<{ id: number; emoji: string; x: number; y: number }>>([])
let burstSeq = 0
function spawnReactionBurst(emoji: string, e: MouseEvent) {
  const id = ++burstSeq
  reactionBursts.value.push({ id, emoji, x: e.clientX, y: e.clientY })
  setTimeout(() => { reactionBursts.value = reactionBursts.value.filter((b) => b.id !== id) }, 700)
}

function pickReaction(msg: Message, emoji: string, e?: MouseEvent) {
  reactionPickerFor.value = null
  store.toggleReaction(msg.id, emoji)
  if (e) spawnReactionBurst(emoji, e)
}

/** Toggling an existing reaction chip — only bursts when the user is adding (not removing) their reaction. */
function toggleChipReaction(msg: Message, emoji: string, users: string[] | undefined, e: MouseEvent) {
  const adding = !reactionHasMe(users)
  store.toggleReaction(msg.id, emoji)
  if (adding) spawnReactionBurst(emoji, e)
}

// ── Copy / edit helpers ───────────────────────────────────────────────────────
async function copyMessageText(msg: Message) {
  const txt = getDisplayText(msg).replace(FWD_RE, '').replace(STORY_REPLY_RE, '$2')
  if (!txt) return
  try {
    await navigator.clipboard.writeText(txt)
  } catch {
    // Clipboard blocked — silent fallback
  }
}

function startEdit(msg: Message) {
  if (!msg.text) return
  editingMsg.value = msg
  draft.value = msg.text
  replyTo.value = null
  nextTick(() => {
    inputEl.value?.focus()
    autoResize()
  })
}

function cancelEdit() {
  editingMsg.value = null
  draft.value = ''
  resetTextarea()
}

const highlight = (text: string) => highlightMatches(text, searchQuery.value)

function openStickerPack(url: string) {
  if (!url.startsWith('http')) return // legacy emoji sticker key — ignore
  stickerPackUrl.value = url
}

function openLightbox(urls: string[], start: number) {
  lightboxUrls.value = urls
  lightboxTypes.value = []
  lightboxStart.value = start
}

function openImageLightbox(url: string) {
  lightboxUrls.value = mediaUrls.value.length ? mediaUrls.value : [url]
  lightboxTypes.value = mediaUrls.value.length ? mediaTypes.value : []
  lightboxStart.value = Math.max(0, lightboxUrls.value.indexOf(url))
}

/** Lightbox scoped to just this album's own images (not the whole conversation's media). */
function openAlbumImageLightbox(msg: Message, url: string) {
  const imageUrls = getAlbumFiles(msg).filter((f) => f.type === 'image').map((f) => f.url)
  lightboxUrls.value = imageUrls.length ? imageUrls : [url]
  lightboxTypes.value = []
  lightboxStart.value = Math.max(0, lightboxUrls.value.indexOf(url))
}

const getDisplayText = (msg: Message) => displayTextOf(msg, langStore.t.encryptedMessagePreview)

function scrollToBottom(smooth = false) {
  nextTick(() => { bottomEl.value?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' }) })
}

// Set whenever the conversation switches so the very first population of its
// message history (async fetch resolving after the switch) always lands at the
// bottom, instead of being judged against a stale scrollTop=0 from before the load.
let justOpenedConv = true

watch(() => msgList.value.length, (newLen, oldLen) => {
  if (!scrollEl.value) return
  if (justOpenedConv) {
    justOpenedConv = false
    scrollToBottom(false)
    return
  }
  const el = scrollEl.value
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  const grew = newLen > (oldLen ?? 0)
  if (atBottom) {
    scrollToBottom(newLen !== oldLen)
  } else if (grew) {
    // New message arrived while scrolled up — increment in-chat counter
    const newest = msgList.value[msgList.value.length - 1]
    if (newest && newest.sender_id !== auth.user?.id) {
      unreadInChat.value++
    }
  }
}, { flush: 'post' })

watch(() => props.convId, () => {
  // If the history is already cached, msgList's length won't change when we
  // switch — nothing will clear the flag, so clear it here to avoid a later
  // incoming message force-scrolling the user away from a spot they scrolled up to.
  justOpenedConv = msgList.value.length === 0
  scrollToBottom()
  searchQuery.value = ''
  showScrollDown.value = false
  unreadInChat.value = 0
  reactionPickerFor.value = null
  cancelEdit()
  clearAttachments()
}, { immediate: true })

let prevScrollHeight = 0
async function onScroll() {
  if (!scrollEl.value) return
  const el = scrollEl.value
  // Track distance from bottom for floating button
  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  showScrollDown.value = distFromBottom > 240
  if (distFromBottom < 100) unreadInChat.value = 0

  if (el.scrollTop < 80 && store.hasMoreMessages[props.convId] && !store.messagesLoading) {
    prevScrollHeight = el.scrollHeight
    await store.loadMoreMessages(props.convId)
    nextTick(() => {
      if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight - prevScrollHeight
    })
  }
}

async function loadMore() {
  if (!scrollEl.value) return
  prevScrollHeight = scrollEl.value.scrollHeight
  await store.loadMoreMessages(props.convId)
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight - prevScrollHeight
  })
}

// ── Typing ─────────────────────────────────────────────────────────────────────
let typingTimer: ReturnType<typeof setTimeout> | null = null
let lastTypingSent = 0
function sendTypingSignal() {
  const now = Date.now()
  if (now - lastTypingSent < 2000) return
  lastTypingSent = now
  wsClient.send({ type: 'typing', conversationId: props.convId })
}

function onInput() {
  autoResize()
  if (draft.value.trim()) sendTypingSignal()
  detectMention(draft.value)
}

// ── Send ────────────────────────────────────────────────────────────────────────
async function submit() {
  // Edit mode — save instead of sending new message
  if (editingMsg.value) {
    const text = draft.value.trim()
    if (!text || text === editingMsg.value.text) {
      cancelEdit()
      return
    }
    const target = editingMsg.value
    cancelEdit()
    try {
      await store.editMessage(target.id, text)
    } catch { /* silent */ }
    return
  }

  if (isUploading.value) return // an attachment is still uploading — wait for it
  const text = draft.value.trim()
  const ready = pendingAttachments.value.filter((a) => a.uploadedUrl && !a.failed)
  if (!text && !ready.length) return
  if (store.checkSpamGate()) return // draft stays intact — shown the "slow down" nag instead
  const rId = replyTo.value?.id ?? null
  draft.value = ''
  replyTo.value = null
  resetTextarea()

  if (ready.length > 1) {
    const attachments = ready.map((a) => ({ url: a.uploadedUrl!, media_type: a.kind === 'file' ? undefined : a.kind }))
    clearAttachments()
    store.sendMessage(props.convId, text, undefined, undefined, rId, attachments)
  } else {
    const fileUrl = ready[0]?.uploadedUrl ?? null
    const kind = ready[0]?.kind
    clearAttachments()
    store.sendMessage(props.convId, text, fileUrl, kind === 'file' ? undefined : kind, rId)
  }
  scrollToBottom(true)
}

function retrySend(msg: Message) {
  store.removeLocalMessage(props.convId, msg.id)
  store.sendMessage(props.convId, msg.text ?? '', msg.file_url, msg.type === 'text' ? undefined : msg.type, msg.reply_to_id ?? null)
}

function newline() { draft.value += '\n'; nextTick(autoResize) }
function autoResize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 128)}px`
}
function resetTextarea() {
  const el = inputEl.value
  if (el) el.style.height = 'auto'
}

// ── Media upload ───────────────────────────────────────────────────────────────
function formatFileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} ${langStore.t.chatByteUnit}`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ${langStore.t.chatKbUnit}`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ${langStore.t.chatMbUnit}`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ${langStore.t.chatGbUnit}`
}
// ── Delete ──────────────────────────────────────────────────────────────────────
async function deleteMsg(id: string) { await store.deleteMessage(id) }

// ── Archive ─────────────────────────────────────────────────────────────────────
async function archive() {
  const isArchived = props.conv?.my_participant?.archived ?? false
  await store.setArchived(props.convId, !isArchived)
  if (!isArchived) emit('archived')
}

// ── Delete conversation ──────────────────────────────────────────────────────────
async function deleteConversation(scope: 'me' | 'all') {
  try {
    await store.deleteConversation(props.convId, scope)
    emit('archived') // reuse 'archived' to go back to list
  } catch { /* silent */ }
  showDeleteModal.value = false
  showMenu.value = false
}

// ── Block user ───────────────────────────────────────────────────────────────────
async function fetchBlockStatus() {
  if (!props.other?.id) return
  try {
    const res = await api.get(`/users/${props.other.id}/block-status`)
    isBlocked.value = !!res.data?.data?.blocked
  } catch { /* silent */ }
}

async function toggleBlock() {
  if (!props.other?.id) return
  try {
    if (isBlocked.value) {
      await api.delete(`/users/${props.other.id}/block`)
    } else {
      await api.post(`/users/${props.other.id}/block`)
    }
    isBlocked.value = !isBlocked.value
  } catch { /* silent */ }
  showBlockModal.value = false
  showMenu.value = false
}

function goToProfile(username?: string) {
  if (username) router.push(`/profile/${username}`)
}

function goToGroup() {
  if (props.conv?.group_id) router.push(`/groups/${props.conv.group_id}`)
}

// ── Menu ────────────────────────────────────────────────────────────────────────
function toggleSearch() {
  showSearch.value = !showSearch.value
  if (!showSearch.value) searchQuery.value = ''
  showMenu.value = false
}
function toggleTranslate() {
  translateMode.value = !translateMode.value
  showMenu.value = false
  if (translateMode.value) autoTranslateMissingMessages()
}

function closeMenu(e: MouseEvent) {
  if (showMenu.value && menuRef.value && !menuRef.value.contains(e.target as Node)) {
    showMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', closeMenu)
  if (!props.conv?.is_group && !(isGroupDm.value && amGroupDmCustomer.value)) {
    startPolling()
    fetchBlockStatus()
  } else if (props.conv?.is_group) {
    fetchGroupMembers()
  }
})
onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
})

watch(() => props.other?.id, () => {
  resetPresence()
  if (!props.conv?.is_group && !(isGroupDm.value && amGroupDmCustomer.value)) {
    fetchOnlineStatus()
    fetchBlockStatus()
  }
})
watch(showMembersPanel, (open) => {
  if (open) {
    memberSearchQuery.value = ''
    if (!groupMembers.value.length) fetchGroupMembers()
    else fetchGroupOnlineStatus()
    loadMediaStats()
  }
})

watch(showDmPanel, (open) => {
  if (open) loadMediaStats()
})
</script>

<style scoped>
.menu-drop-enter-active,
.menu-drop-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.menu-drop-enter-from,
.menu-drop-leave-to { opacity: 0; transform: translateY(-6px) scale(0.97); }

.search-slide-enter-active,
.search-slide-leave-active { transition: all 0.18s ease; max-height: 80px; overflow: hidden; }
.search-slide-enter-from,
.search-slide-leave-to { max-height: 0; opacity: 0; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.mention-pop-enter-active, .mention-pop-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.mention-pop-enter-from, .mention-pop-leave-to { opacity: 0; transform: translateY(4px); }

/* Send/Mic button swap */
.btn-swap-enter-active, .btn-swap-leave-active { transition: opacity 0.1s ease, transform 0.1s ease; }
.btn-swap-enter-from { opacity: 0; transform: scale(0.7) rotate(-15deg); }
.btn-swap-leave-to   { opacity: 0; transform: scale(0.7) rotate(15deg); }

/* Emoji / sticker popover */
.popover-up-enter-active, .popover-up-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.popover-up-enter-from, .popover-up-leave-to { opacity: 0; transform: translateY(8px) scale(0.95); }

/* Floating scroll-to-bottom button */
.scroll-btn-enter-active, .scroll-btn-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.scroll-btn-enter-from, .scroll-btn-leave-to { opacity: 0; transform: translateY(12px) scale(0.85); }

/* Attachment preview card */
.attach-pop-enter-active { transition: opacity 0.18s ease, transform 0.18s cubic-bezier(.34,1.56,.64,1); }
.attach-pop-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.attach-pop-enter-from, .attach-pop-leave-to { opacity: 0; transform: translateY(6px) scale(0.9); }

/* Reaction chips */
.reaction-pop-enter-active { animation: reactionPop 0.35s cubic-bezier(.34,1.56,.64,1); }
.reaction-pop-leave-active { transition: opacity 0.15s ease, transform 0.15s ease; position: absolute; }
.reaction-pop-leave-to { opacity: 0; transform: scale(0.6); }
.reaction-pop-move { transition: transform 0.25s ease; }
@keyframes reactionPop {
  0%   { transform: scale(0) translateY(6px); opacity: 0; }
  60%  { transform: scale(1.25); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

/* Reaction burst (flying emoji flourish on pick) */
.reaction-burst {
  animation: reactionBurstFly 0.7s ease-out forwards;
  transform: translate(-50%, -50%);
}
@keyframes reactionBurstFly {
  0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
  30%  { transform: translate(-50%, -65%) scale(1.5); opacity: 1; }
  100% { transform: translate(-50%, -150%) scale(1.1); opacity: 0; }
}
</style>
