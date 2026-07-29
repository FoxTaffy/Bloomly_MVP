<template>
  <div class="flex flex-col h-full bg-brand-bg overflow-hidden relative">

    <!-- ── Selection bar (replaces header while messages are selected) ──────── -->
    <div v-if="selectionMode" class="flex items-center gap-3 px-4 py-3 border-b border-brand-border bg-brand-card flex-shrink-0">
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
    <div v-else class="flex items-center gap-3 px-4 py-3 border-b border-brand-border bg-brand-card flex-shrink-0">
      <button @click="$emit('back')" class="sm:hidden p-1.5 rounded-xl hover:bg-brand-bg text-white/55 hover:text-white transition-colors">
        <BIcon name="ArrowLeft" class="w-4 h-4" />
      </button>

      <!-- Avatar / Group avatar -->
      <div class="relative cursor-pointer flex-shrink-0" @click="isGroupDm && amGroupDmCustomer ? goToGroup() : (conv?.is_group ? (showMembersPanel = true) : (other ? showDmPanel = true : undefined))">
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
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-brand-accent/30 to-brand-accent/10 ring-2 ring-brand-accent/40 flex items-center justify-center">
              <BIcon name="StickyNote" class="w-5 h-5 text-brand-accent" />
            </div>
          </template>
          <template v-else>
            <span class="relative inline-flex">
              <img v-if="other?.avatar_url" :src="other.avatar_url" :alt="other.username"
                class="w-10 h-10 rounded-full object-cover ring-2 ring-brand-border hover:ring-brand-accent/50 transition-all" @error="onAvatarError" />
              <div v-else class="w-10 h-10 rounded-full bg-gradient-to-br from-brand-accent/30 to-brand-accent/10 ring-2 ring-brand-border hover:ring-brand-accent/50 transition-all flex items-center justify-center text-brand-accent font-bold">
                {{ (other?.display_name || other?.username || '?')[0].toUpperCase() }}
              </div>
              <span v-if="isPartnerOnline && !partnerDeviceIcon" class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-brand-success rounded-full border-2 border-brand-card" />
              <span v-else-if="isPartnerOnline" :title="partnerDevice ?? undefined"
                class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-brand-success rounded-full border-2 border-brand-card flex items-center justify-center">
                <BIcon :name="partnerDeviceIcon!" class="w-2 h-2 text-black/70" />
              </span>
            </span>
          </template>
        </template>
      </div>

      <div class="flex-1 min-w-0" :class="(other || conv?.is_group) ? 'cursor-pointer' : ''" @click="isGroupDm && amGroupDmCustomer ? goToGroup() : (conv?.is_group ? (showMembersPanel = true) : (other ? showDmPanel = true : undefined))">
        <p class="font-bold text-white text-sm leading-tight truncate flex items-center gap-1.5">
          <template v-if="conv?.is_group">
            <BIcon name="Users" class="w-3.5 h-3.5 text-white/55 flex-shrink-0" />
            {{ conv.name || langStore.t.chatGroupFallbackName }}
          </template>
          <template v-else>
            <!-- Notes -->
            <template v-if="!other">
              <span class="font-bold text-white text-sm flex items-center gap-1.5">
                <BIcon name="StickyNote" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
                {{ langStore.t.notesBtn }}
              </span>
            </template>
            <template v-else>
              {{ other?.display_name || other?.username || langStore.t.chatInterlocutorFallback }}
              <span v-if="(other as any)?.deceased_at" :title="langStore.t.chatRipTitle">🪦</span>
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
          <span class="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
            :class="isPartnerOnline ? 'bg-brand-success shadow-[0_0_4px_theme(colors.green.400)]' : 'bg-brand-muted'" />
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
                  class="w-full text-xs bg-brand-bg border border-brand-border rounded-xl px-3 py-1.5 text-brand-offwhite outline-none focus:border-brand-accent/50 transition-colors">
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
                  <BIcon name="Users" class="w-4 h-4 text-white/55 flex-shrink-0" />
                  {{ langStore.t.createStep2Title }}
                </button>
                <button v-if="conv?.group_id" @click="router.push('/groups/' + conv.group_id); showMenu = false"
                  class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                  <BIcon name="Users2" class="w-4 h-4 text-white/55 flex-shrink-0" />
                  {{ langStore.t.contextGoToGroup }}
                </button>
                <button v-if="myRole === 'admin'" @click="showEditGroup = true; showMenu = false"
                  class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                  <BIcon name="Settings" class="w-4 h-4 text-white/55 flex-shrink-0" />
                  {{ langStore.t.chatGroupSettingsMenuItem }}
                </button>
                <div class="border-t border-brand-border my-1" />
              </template>

              <!-- DM-specific -->
              <router-link v-if="!conv?.is_group && !isGroupDm" :to="`/profile/${other?.username}`" @click="showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                <BIcon name="User" class="w-4 h-4 text-white/55 flex-shrink-0" />
                {{ langStore.t.profile }}
              </router-link>

              <!-- Group DM: customer sees "К группе"; staff sees the customer's profile -->
              <button v-if="isGroupDm && amGroupDmCustomer" @click="goToGroup(); showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                <BIcon name="Users2" class="w-4 h-4 text-white/55 flex-shrink-0" />
                {{ langStore.t.contextGoToGroup }}
              </button>
              <router-link v-else-if="isGroupDm" :to="`/profile/${other?.username}`" @click="showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                <BIcon name="User" class="w-4 h-4 text-white/55 flex-shrink-0" />
                {{ langStore.t.profile }}
              </router-link>

              <button v-if="!(isGroupDm && !amGroupDmCustomer)" @click="archive(); showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                <BIcon :name="conv?.my_participant?.archived ? 'ArchiveX' : 'Archive'" class="w-4 h-4 text-white/55 flex-shrink-0" />
                {{ conv?.my_participant?.archived ? langStore.t.contextUnarchive : langStore.t.contextArchive }}
              </button>
              <div class="border-t border-brand-border my-1" />

              <button v-if="!conv?.is_group && !isGroupDm" @click="showBlockModal = true; showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left"
                :class="isBlocked ? 'text-brand-accent hover:bg-brand-accent/8' : 'text-brand-offwhite hover:bg-brand-bg'">
                <BIcon :name="isBlocked ? 'ShieldOff' : 'ShieldAlert'" class="w-4 h-4 flex-shrink-0"
                  :class="isBlocked ? 'text-brand-accent' : 'text-white/55'" />
                {{ isBlocked ? langStore.t.chatUnblockLabel : langStore.t.blockUserBtn }}
              </button>

              <button v-if="!(isGroupDm && !amGroupDmCustomer)" @click="showDeleteModal = true; showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-error hover:bg-brand-error/8 transition-colors text-left">
                <BIcon name="Trash2" class="w-4 h-4 flex-shrink-0" />
                {{ conv?.is_group ? langStore.t.contextLeaveGroup : langStore.t.contextDeleteConv }}
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- ── Group Info Modal (centered — same shell as the DM info / edit-group modals) ── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showMembersPanel" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" @click.self="showMembersPanel = false">
          <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden" style="max-height:90vh">

            <!-- Cover (colored banner behind avatar + name, plain card bg for the action row) -->
            <div class="relative flex-shrink-0">
              <div class="relative pt-4 pb-5 px-3 text-center overflow-hidden bg-gradient-to-br from-brand-accent/30 to-purple-900/40">
                <img v-if="(conv as any)?.banner_url" :src="(conv as any).banner_url" class="absolute inset-0 w-full h-full object-cover" />
                <div v-else-if="bannerCollage.length" class="absolute inset-0 flex">
                  <div v-for="m in bannerCollage" :key="m.id" class="flex-1 h-full relative">
                    <img v-if="m.avatar_url" :src="m.avatar_url" class="w-full h-full object-cover" />
                    <div v-else class="w-full h-full bg-brand-accent/25 flex items-center justify-center text-brand-accent font-bold text-lg">
                      {{ (m.display_name || m.username || '?')[0].toUpperCase() }}
                    </div>
                  </div>
                </div>
                <!-- Darken for legibility of the close/settings buttons, avatar ring and text -->
                <div v-if="(conv as any)?.banner_url || bannerCollage.length" class="absolute inset-0 bg-black/30" />

                <!-- Close button -->
                <button @click="showMembersPanel = false"
                  class="absolute top-3 left-3 w-8 h-8 rounded-xl bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-all">
                  <BIcon name="X" class="w-4 h-4" />
                </button>
                <!-- Settings (admin only) -->
                <button v-if="myRole === 'admin'" @click="showEditGroup = true; showMembersPanel = false"
                  class="absolute top-3 right-3 w-8 h-8 rounded-xl bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-all">
                  <BIcon name="Settings" class="w-4 h-4" />
                </button>
                <!-- Avatar -->
                <div class="relative w-20 h-20 rounded-2xl overflow-hidden shadow-xl mx-auto ring-2 ring-white/20">
                  <img v-if="conv?.avatar_url" :src="conv.avatar_url" class="w-full h-full object-cover" @error="onAvatarError" />
                  <div v-else-if="bannerCollage.length" class="w-full h-full grid grid-cols-2">
                    <div v-for="m in bannerCollage.slice(0, 4)" :key="m.id" class="relative">
                      <img v-if="m.avatar_url" :src="m.avatar_url" class="w-full h-full object-cover" />
                      <div v-else class="w-full h-full bg-brand-accent/25 flex items-center justify-center text-brand-accent font-bold">
                        {{ (m.display_name || m.username || '?')[0].toUpperCase() }}
                      </div>
                    </div>
                  </div>
                  <div v-else class="w-full h-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-2xl">
                    {{ (conv?.name ?? 'G')[0].toUpperCase() }}
                  </div>
                </div>
                <h3 class="relative text-base font-bold text-white truncate mt-2.5 drop-shadow">{{ conv?.name || langStore.t.chatGroupFallbackName }}</h3>
                <p class="relative text-xs text-white/70 mt-0.5 drop-shadow">{{ groupMembers.length }} {{ langStore.t.membersUnit }}</p>
              </div>

              <!-- Action row (plain card background) -->
              <div class="flex justify-center gap-2 px-3 py-3">
                <button v-if="conv?.group_id" @click="showInvitePicker = true"
                  class="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-brand-bg text-white/60 hover:text-brand-accent hover:bg-brand-accent/10 transition-all text-xs font-semibold">
                  <BIcon name="Send" class="w-4 h-4" />
                  {{ langStore.t.chatInviteAction }}
                </button>
                <button v-if="myRole === 'admin'" @click="showAddMember = !showAddMember; addMemberSearch = ''; addMemberResults = []"
                  :class="['flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all text-xs font-semibold',
                    showAddMember ? 'bg-brand-accent/20 text-brand-accent' : 'bg-brand-bg text-white/60 hover:text-brand-accent hover:bg-brand-accent/10']">
                  <BIcon name="UserPlus" class="w-4 h-4" />
                  {{ langStore.t.addButton }}
                </button>
                <button @click="goToGroup(); showMembersPanel = false"
                  class="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-brand-bg text-white/60 hover:text-brand-accent hover:bg-brand-accent/10 transition-all text-xs font-semibold">
                  <BIcon name="Users2" class="w-4 h-4" />
                  {{ langStore.t.contextGoToGroup }}
                </button>
                <button @click="showMembersPanel = false; archive()"
                  class="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-brand-bg text-white/60 hover:text-white/90 hover:bg-brand-bg/80 transition-all text-xs font-semibold">
                  <BIcon :name="conv?.my_participant?.archived ? 'ArchiveX' : 'Archive'" class="w-4 h-4" />
                  {{ conv?.my_participant?.archived ? langStore.t.chatUnarchiveShort : langStore.t.archiveBtn }}
                </button>
              </div>
            </div>

            <!-- Group link (real page, not a fake invite link) -->
            <div v-if="conv?.group_id" class="flex items-center gap-2 px-4 py-2.5 border-t border-b border-brand-border flex-shrink-0">
              <BIcon name="Link" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
              <span class="flex-1 min-w-0 text-xs text-brand-accent truncate cursor-pointer hover:underline" @click="goToGroup(); showMembersPanel = false">
                {{ groupPageUrl }}
              </span>
              <button @click="copyGroupLink" class="flex-shrink-0 text-white/40 hover:text-white transition-colors" :title="langStore.t.exportCopyLink">
                <BIcon :name="groupLinkCopied ? 'Check' : 'Copy'" class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Scrollable body: media list → participants header → search → member list (one continuous flow, no tabs) -->
            <div class="flex-1 overflow-y-auto min-h-0">

              <!-- Media stats list -->
              <div v-if="mediaStatsLoading" class="flex items-center justify-center py-6 text-white/55 text-sm gap-2">
                <BIcon name="Loader2" class="w-4 h-4 animate-spin" /> {{ langStore.t.loadingBtn }}
              </div>
              <button v-for="stat in mediaStatsList.filter((s) => s.count > 0)" :key="stat.key"
                @click="openMediaBrowser(stat.key)"
                class="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-brand-bg/40 transition-colors text-left">
                <BIcon :name="stat.icon" class="w-4 h-4 text-brand-accent flex-shrink-0" />
                <span class="text-sm text-white/85">{{ stat.count }} {{ stat.label.toLowerCase() }}</span>
                <BIcon name="ChevronRight" class="w-3.5 h-3.5 text-white/25 ml-auto flex-shrink-0" />
              </button>

              <!-- Participants header -->
              <div class="flex items-center gap-2 px-4 py-3 mt-1 border-t border-brand-border">
                <BIcon name="Users" class="w-3.5 h-3.5 text-white/40 flex-shrink-0" />
                <span class="text-xs font-bold text-white/50 uppercase tracking-wide">
                  {{ groupMembers.length }} {{ langStore.t.membersUnit }}{{ groupOnlineCount ? `, ${groupOnlineCount} ${langStore.t.chatOnlineNow}` : '' }}
                </span>
              </div>

              <!-- Member search -->
              <div class="px-3 pb-2">
                <div class="flex items-center gap-2 bg-brand-bg rounded-2xl px-3 py-2">
                  <BIcon name="Search" class="w-3.5 h-3.5 text-white/35 flex-shrink-0" />
                  <input
                    v-model="memberSearchQuery"
                    type="text"
                    :placeholder="langStore.t.chatSearchMembersPlaceholder"
                    class="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none" />
                  <button v-if="memberSearchQuery" @click="memberSearchQuery = ''" class="text-white/30 hover:text-white">
                    <BIcon name="X" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <!-- Add member (admin only) -->
              <button v-if="myRole === 'admin' && !showAddMember" @click="showAddMember = true; addMemberSearch = ''; addMemberResults = []"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-brand-accent hover:bg-brand-bg/40 transition-colors text-left text-sm font-semibold">
                <BIcon name="UserPlus" class="w-4 h-4 flex-shrink-0" />
                {{ langStore.t.chatAddMembersAction }}
              </button>

              <!-- Add member search panel (admin only) -->
              <Transition name="fade">
                <div v-if="showAddMember && myRole === 'admin'" class="px-3 pt-1 pb-2 border-b border-brand-border/60">
                  <div class="flex items-center gap-2 bg-brand-bg rounded-2xl px-3 py-2">
                    <BIcon name="Search" class="w-3.5 h-3.5 text-white/35 flex-shrink-0" />
                    <input
                      v-model="addMemberSearch"
                      @input="debouncedAddMemberSearch"
                      type="text"
                      :placeholder="langStore.t.chatSearchUsersPlaceholder"
                      class="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
                      autofocus />
                    <button @click="showAddMember = false; addMemberSearch = ''; addMemberResults = []" class="text-white/30 hover:text-white">
                      <BIcon name="X" class="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <!-- Search results -->
                  <div v-if="addMemberResults.length" class="mt-1.5 space-y-0.5 max-h-48 overflow-y-auto">
                    <button
                      v-for="u in addMemberResults" :key="u.id"
                      @click="doAddMember(u)"
                      :disabled="groupMembers.some(m => m.user_id === u.id)"
                      :class="['w-full flex items-center gap-2.5 px-2 py-2 rounded-xl transition-colors text-left',
                        groupMembers.some(m => m.user_id === u.id)
                          ? 'opacity-40 cursor-not-allowed'
                          : 'hover:bg-brand-accent/10 cursor-pointer']"
                    >
                      <img v-if="u.avatar_url" :src="u.avatar_url" class="w-7 h-7 rounded-full object-cover flex-shrink-0" @error="onAvatarError" />
                      <div v-else class="w-7 h-7 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-bold flex-shrink-0">
                        {{ (u.display_name || u.username || '?')[0].toUpperCase() }}
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-sm text-white font-medium truncate">{{ u.display_name || u.username }}</p>
                        <p class="text-[11px] text-white/40 truncate">@{{ u.username }}</p>
                      </div>
                      <BIcon
                        :name="groupMembers.some(m => m.user_id === u.id) ? 'Check' : 'UserPlus'"
                        :class="['w-3.5 h-3.5 flex-shrink-0', groupMembers.some(m => m.user_id === u.id) ? 'text-brand-accent' : 'text-white/40']" />
                    </button>
                  </div>
                  <p v-else-if="addMemberSearch.length >= 2 && !addMemberLoading" class="text-center text-xs text-white/30 py-3">{{ langStore.t.chatNoOneFound }}</p>
                  <p v-if="addMemberLoading" class="flex justify-center py-2">
                    <BIcon name="Loader2" class="w-4 h-4 animate-spin text-white/40" />
                  </p>
                </div>
              </Transition>

              <!-- Member list -->
              <p v-if="membersLoading" class="flex items-center justify-center py-8 text-white/55 text-sm gap-2">
                <BIcon name="Loader2" class="w-4 h-4 animate-spin" /> {{ langStore.t.loadingBtn }}
              </p>
              <p v-else-if="!filteredGroupMembers.length" class="text-center text-xs text-white/30 py-6">{{ langStore.t.chatNoOneFound }}</p>
              <router-link v-for="m in filteredGroupMembers" :key="m.user_id" :to="`/profile/${m.user?.username}`" class="flex items-center gap-3 px-4 py-2.5 hover:bg-brand-bg/40 transition-colors cursor-pointer">
                <div class="relative flex-shrink-0">
                  <img v-if="m.user?.avatar_url" :src="m.user.avatar_url" class="w-8 h-8 rounded-full object-cover" @error="onAvatarError" />
                  <div v-else class="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-bold">
                    {{ (m.user?.display_name || m.user?.username || '?')[0].toUpperCase() }}
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-white font-medium truncate leading-tight">{{ m.user?.display_name || m.user?.username }}</p>
                  <p class="text-xs truncate" :class="groupOnlineStatus[m.user_id] ? 'text-green-400' : 'text-white/45'">
                    {{ groupOnlineStatus[m.user_id] ? langStore.t.chatOnlineNow : `@${m.user?.username}` }}
                  </p>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <span v-if="m.role === 'admin'" class="text-[9px] bg-brand-accent/15 text-brand-accent px-1.5 py-0.5 rounded-full border border-brand-accent/25 font-bold">{{ langStore.t.chatAdminBadge }}</span>
                  <template v-if="myRole === 'admin' && m.user_id !== auth.user?.id">
                    <button @click.stop="kickMember(m.user_id)" class="p-1 rounded-lg text-white/40 hover:text-brand-error transition-colors" :title="langStore.t.chatKickMemberTitle">
                      <BIcon name="UserX" class="w-3.5 h-3.5" />
                    </button>
                    <button @click.stop="toggleMemberRole(m)" class="p-1 rounded-lg text-white/40 hover:text-brand-accent transition-colors" :title="m.role === 'admin' ? langStore.t.chatDemoteAdminTitle : langStore.t.chatPromoteAdminTitle">
                      <BIcon :name="m.role === 'admin' ? 'ShieldOff' : 'ShieldCheck'" class="w-3.5 h-3.5" />
                    </button>
                  </template>
                </div>
              </router-link>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── DM Info Modal (centered) ──────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showDmPanel" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" @click.self="showDmPanel = false">
          <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden" style="max-height:90vh">
            <!-- Cover (colored banner behind avatar + name, plain card bg for the action row) -->
            <div class="relative flex-shrink-0">
              <div class="relative pt-4 pb-5 px-5 text-center overflow-hidden bg-gradient-to-br from-brand-accent/30 to-purple-900/40">
                <img v-if="other?.banner_url" :src="other.banner_url" class="absolute inset-0 w-full h-full object-cover" />
                <div v-if="other?.banner_url" class="absolute inset-0 bg-black/30" />

                <!-- Close button -->
                <button @click="showDmPanel = false"
                  class="absolute top-3 left-3 w-8 h-8 rounded-xl bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-all">
                  <BIcon name="X" class="w-4 h-4" />
                </button>
                <!-- Avatar -->
                <div class="relative inline-block">
                  <img v-if="other?.avatar_url" :src="other.avatar_url" :alt="other.username"
                    class="w-20 h-20 rounded-full object-cover shadow-xl ring-2 ring-white/20" @error="onAvatarError" />
                  <div v-else class="w-20 h-20 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-2xl shadow-xl ring-2 ring-white/20">
                    {{ (other?.display_name || other?.username || '?')[0].toUpperCase() }}
                  </div>
                  <!-- Online dot -->
                  <span v-if="isPartnerOnline && !partnerDeviceIcon" class="absolute bottom-1 right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-brand-card" />
                  <span v-else-if="isPartnerOnline" :title="partnerDevice ?? undefined"
                    class="absolute bottom-1 right-1 w-4.5 h-4.5 bg-green-500 rounded-full border-2 border-brand-card flex items-center justify-center">
                    <BIcon :name="partnerDeviceIcon!" class="w-2.5 h-2.5 text-black/70" />
                  </span>
                </div>
                <h3 class="relative text-base font-bold text-white truncate mt-2.5 flex items-center justify-center gap-1.5 drop-shadow">
                  {{ other?.display_name || other?.username }}
                  <span v-if="(other as any)?.deceased_at" :title="langStore.t.chatRipTitle">🪦</span>
                </h3>
                <p class="relative text-xs mt-0.5 flex items-center justify-center gap-1 drop-shadow" :class="isPartnerOnline ? 'text-green-400' : 'text-white/70'">
                  {{ isPartnerOnline ? langStore.t.chatOnlineBulleted : `● ${partnerLastSeenLabel}` }}
                  <BIcon v-if="isPartnerOnline && partnerDeviceIcon" :name="partnerDeviceIcon!" class="w-3 h-3" :title="partnerDevice ?? undefined" />
                </p>
              </div>

              <!-- Quick actions (plain card background) -->
              <div class="flex justify-center gap-2 px-5 py-3">
                <router-link :to="`/profile/${other?.username}`" @click="showDmPanel = false"
                  class="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-brand-bg hover:bg-brand-accent/10 text-white/60 hover:text-brand-accent transition-all text-xs font-semibold">
                  <BIcon name="User" class="w-4 h-4" />
                  {{ langStore.t.profile }}
                </router-link>
                <button v-if="!isGroupDm" @click="showDmPanel = false; archive()"
                  class="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-brand-bg hover:bg-brand-bg/80 text-white/60 hover:text-white/90 transition-all text-xs font-semibold">
                  <BIcon :name="conv?.my_participant?.archived ? 'ArchiveX' : 'Archive'" class="w-4 h-4" />
                  {{ conv?.my_participant?.archived ? langStore.t.chatUnarchiveShort : langStore.t.archiveBtn }}
                </button>
                <button v-if="!isGroupDm" @click="showDmPanel = false; showBlockModal = true"
                  :class="['flex flex-col items-center gap-1 px-4 py-2 rounded-2xl transition-all text-xs font-semibold',
                    isBlocked ? 'bg-brand-accent/15 text-brand-accent hover:bg-brand-accent/25' : 'bg-brand-bg text-white/60 hover:text-brand-error hover:bg-brand-error/10']">
                  <BIcon :name="isBlocked ? 'ShieldOff' : 'ShieldAlert'" class="w-4 h-4" />
                  {{ isBlocked ? langStore.t.chatUnblockShort : langStore.t.chatBlockShort }}
                </button>
              </div>
            </div>

            <!-- Username row (clicking anywhere in the row copies it, not just the icon) -->
            <div class="flex items-center gap-2 px-5 py-2.5 border-t border-b border-brand-border flex-shrink-0 cursor-pointer hover:bg-brand-bg/40 transition-colors"
              @click="copyUsername" :title="langStore.t.chatCopyTitle">
              <span class="text-brand-accent font-bold text-xs flex-shrink-0">@</span>
              <span class="flex-1 min-w-0 text-sm text-white/80 truncate">{{ other?.username }}</span>
              <button class="flex-shrink-0 text-white/40 hover:text-white transition-colors">
                <BIcon :name="usernameCopied ? 'Check' : 'Copy'" class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- Media stats list -->
            <div class="flex-1 overflow-y-auto min-h-0 py-1">
              <div v-if="mediaStatsLoading" class="flex items-center justify-center py-6 text-white/55 text-sm gap-2">
                <BIcon name="Loader2" class="w-4 h-4 animate-spin" /> {{ langStore.t.loadingBtn }}
              </div>
              <p v-else-if="!mediaStatsList.some((s) => s.count > 0)" class="text-center text-xs text-white/30 py-6">{{ langStore.t.chatNoMediaLabel }}</p>
              <button v-for="stat in mediaStatsList.filter((s) => s.count > 0)" :key="stat.key"
                @click="openMediaBrowser(stat.key)"
                class="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-brand-bg/40 transition-colors text-left">
                <BIcon :name="stat.icon" class="w-4 h-4 text-brand-accent flex-shrink-0" />
                <span class="text-sm text-white/85">{{ stat.count }} {{ stat.label.toLowerCase() }}</span>
                <BIcon name="ChevronRight" class="w-3.5 h-3.5 text-white/25 ml-auto flex-shrink-0" />
              </button>
            </div>

            <!-- Danger zone -->
            <div class="px-5 py-3 flex-shrink-0 border-t border-brand-border">
              <button @click="showDmPanel = false; showDeleteModal = true"
                class="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl text-sm text-brand-error hover:bg-brand-error/10 transition-colors font-medium">
                <BIcon name="Trash2" class="w-4 h-4" />
                {{ langStore.t.contextDeleteConv }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Media browser (opened from a media-stat row) ─────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="mediaBrowserType" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" @click.self="closeMediaBrowser">
          <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden" style="max-height:90vh">
            <!-- Header -->
            <div class="flex items-center gap-2 px-2 py-3 border-b border-brand-border flex-shrink-0">
              <button @click="closeMediaBrowser" class="w-8 h-8 rounded-xl hover:bg-brand-bg flex items-center justify-center text-white/70 hover:text-white transition-all flex-shrink-0">
                <BIcon name="ArrowLeft" class="w-4 h-4" />
              </button>
              <h3 class="flex-1 min-w-0 text-sm font-bold text-white truncate">{{ MEDIA_TYPE_TITLES[mediaBrowserType] ?? '' }}</h3>
              <button @click="closeMediaBrowser" class="w-8 h-8 rounded-xl hover:bg-brand-bg flex items-center justify-center text-white/70 hover:text-white transition-all flex-shrink-0">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>

            <!-- Body -->
            <div class="flex-1 overflow-y-auto min-h-0" @scroll="onMediaBrowserScroll">
              <p v-if="!mediaBrowserLoading && !mediaBrowserItems.length" class="text-center text-sm text-white/30 py-10">{{ langStore.t.chatNothingHere }}</p>

              <template v-for="group in mediaBrowserGroups" :key="group.label">
                <p class="px-4 pt-3 pb-1.5 text-xs font-bold text-white/40 uppercase tracking-wide">{{ group.label }}</p>

                <!-- Photos / videos: grid -->
                <div v-if="mediaBrowserType === 'image' || mediaBrowserType === 'video'" class="grid grid-cols-4 gap-0.5 px-0.5">
                  <div v-for="m in group.items" :key="m.id" class="relative aspect-square cursor-pointer bg-black/30"
                    @click="mediaBrowserType === 'image' ? openMediaBrowserImage(m.file_url!) : null">
                    <img v-if="m.type === 'image'" :src="m.file_url!" class="w-full h-full object-cover" loading="lazy" />
                    <video v-else :src="m.file_url!" class="w-full h-full object-cover" preload="metadata" />
                    <div v-if="m.type === 'video'" class="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                      <BIcon name="Play" class="w-5 h-5 text-white drop-shadow" />
                    </div>
                  </div>
                </div>

                <!-- Audio / voice: list with inline play -->
                <div v-else-if="mediaBrowserType === 'audio' || mediaBrowserType === 'voice'">
                  <div v-for="m in group.items" :key="m.id" class="flex items-center gap-3 px-4 py-2.5">
                    <audio v-if="mediaBrowserPlayingId === m.id" :src="m.file_url!" autoplay @ended="mediaBrowserPlayingId = null" class="hidden" />
                    <button @click="toggleMediaBrowserPlay(m.id)"
                      class="flex-shrink-0 w-9 h-9 rounded-full bg-brand-accent/80 hover:bg-brand-accent flex items-center justify-center transition-all">
                      <BIcon :name="mediaBrowserPlayingId === m.id ? 'Pause' : 'Play'" class="w-4 h-4 text-white" />
                    </button>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-white font-medium truncate">{{ m.sender?.display_name || m.sender?.username }}</p>
                      <p class="text-xs text-white/45">{{ formatMsgTime(m.created_at) }}</p>
                    </div>
                  </div>
                </div>

                <!-- Links: text list -->
                <div v-else>
                  <div v-for="m in group.items" :key="m.id" class="px-4 py-2.5">
                    <p class="text-xs text-brand-accent font-semibold">{{ m.sender?.display_name || m.sender?.username }}</p>
                    <p class="text-sm text-white/80 break-words">{{ m.text }}</p>
                    <p class="text-xs text-white/40 mt-0.5">{{ formatMsgTime(m.created_at) }}</p>
                  </div>
                </div>
              </template>

              <div v-if="mediaBrowserLoading" class="flex items-center justify-center py-4 text-white/55 text-sm gap-2">
                <BIcon name="Loader2" class="w-4 h-4 animate-spin" /> {{ langStore.t.loadingBtn }}
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Pin scope modal ─────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showPinScopeModal" class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" @click.self="showPinScopeModal = false; pinTarget = null">
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
                <BIcon name="Users" class="w-4 h-4 text-brand-accent flex-shrink-0" />
                <div>
                  <p class="text-sm font-semibold text-white">{{ langStore.t.deleteForAllTitle }}</p>
                  <p class="text-xs text-white/45">{{ langStore.t.chatPinAllHint }}</p>
                </div>
              </button>
              <button @click="doPinMessage('me')"
                class="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-brand-bg border border-brand-border hover:border-brand-accent/50 transition-all text-left">
                <BIcon name="User" class="w-4 h-4 text-white/55 flex-shrink-0" />
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

    <!-- ── Payment request modal (chat-only order card) ────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showPaymentModal" class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" @click.self="closePaymentModal">
          <div class="bg-brand-card border border-brand-border rounded-3xl p-5 w-full max-w-xs shadow-2xl">
            <div class="flex items-center gap-2 mb-4">
              <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-accent/30 to-brand-accent/10 ring-1 ring-brand-accent/30 flex items-center justify-center">
                <BIcon name="CreditCard" class="w-4 h-4 text-brand-accent" />
              </div>
              <h3 class="text-base font-bold text-white">{{ langStore.t.chatPaymentRequestTitle }}</h3>
            </div>
            <div class="flex flex-col gap-3">
              <div>
                <label class="text-[11px] text-white/45 font-semibold">{{ langStore.t.chatAmountLabel }}</label>
                <input v-model="paymentForm.amount" type="number" min="1" placeholder="3500"
                  class="w-full mt-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-brand-accent/50" />
              </div>
              <div>
                <label class="text-[11px] text-white/45 font-semibold">{{ langStore.t.fursuitDescLabel }}</label>
                <input v-model="paymentForm.description" type="text" maxlength="300" :placeholder="langStore.t.chatDescPlaceholderExample"
                  class="w-full mt-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-brand-accent/50" />
              </div>
              <div>
                <label class="text-[11px] text-white/45 font-semibold">{{ langStore.t.chatPrepaymentLabel }}</label>
                <input v-model="paymentForm.prepaymentPercent" type="number" min="1" max="100" placeholder="50"
                  class="w-full mt-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-brand-accent/50" />
              </div>
              <div>
                <label class="text-[11px] text-white/45 font-semibold">{{ langStore.t.chatDeadlineLabel }}</label>
                <input v-model="paymentForm.deadline" type="date"
                  class="w-full mt-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-brand-accent/50" />
              </div>
              <button type="button" @click="submitPaymentRequest" :disabled="!paymentForm.amount || sendingPayment"
                class="w-full py-2.5 rounded-xl bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-semibold transition-all disabled:opacity-40 mt-1">
                {{ sendingPayment ? langStore.t.chatSendingPaymentLabel : langStore.t.chatSendPaymentRequestBtn }}
              </button>
              <button type="button" @click="closePaymentModal" class="w-full py-1 text-sm text-white/45 hover:text-white transition-colors">
                {{ langStore.t.cancel }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Edit Group Modal ────────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showEditGroup" class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" @click.self="showEditGroup = false">
          <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden" style="max-height:92vh">

            <!-- ── Banner (click to change) ── -->
            <input ref="groupBannerRef" type="file" accept="image/*" class="sr-only" @change="onGroupBannerChange" />
            <input ref="groupAvatarRef" type="file" accept="image/*" class="sr-only" @change="onGroupAvatarChange" />
            <div class="relative w-full h-32 cursor-pointer group flex-shrink-0" @click="groupBannerRef?.click()">
              <div class="absolute inset-0 bg-gradient-to-br from-brand-accent/30 via-purple-900/40 to-brand-bg overflow-hidden">
                <img v-if="editGroupBanner" :src="editGroupBanner" class="w-full h-full object-cover" />
              </div>
              <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                <div class="flex items-center gap-1.5 bg-black/60 px-3 py-1.5 rounded-xl text-xs text-white">
                  <BIcon name="Image" class="w-3.5 h-3.5" />
                  {{ editGroupBanner ? langStore.t.changeBanner : langStore.t.addBanner }}
                </div>
              </div>
              <span v-if="uploadingGroupBanner" class="absolute inset-0 flex items-center justify-center bg-black/40">
                <span class="w-7 h-7 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
              </span>
              <!-- Close button -->
              <button @click.stop="showEditGroup = false" class="absolute top-3 right-3 w-7 h-7 rounded-xl bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all">
                <BIcon name="X" class="w-3.5 h-3.5" />
              </button>
            </div>

            <!-- ── Centered avatar ── -->
            <div class="flex flex-col items-center -mt-8 pb-3 flex-shrink-0 px-5">
              <div class="relative cursor-pointer group" @click="groupAvatarRef?.click()">
                <div class="w-16 h-16 rounded-2xl border-[3px] border-brand-card bg-brand-bg overflow-hidden shadow-xl">
                  <img v-if="editGroupAvatar" :src="editGroupAvatar" class="w-full h-full object-cover" />
                  <div v-else class="w-full h-full flex items-center justify-center bg-brand-accent/20">
                    <BIcon name="Camera" class="w-6 h-6 text-brand-accent/70" />
                  </div>
                </div>
                <div class="absolute inset-0 rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <BIcon name="Camera" class="w-5 h-5 text-white" />
                </div>
                <span v-if="uploadingGroupAvatar" class="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center">
                  <span class="w-5 h-5 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
                </span>
              </div>
              <div class="flex gap-2 mt-2">
                <button v-if="editGroupAvatar" @click="editGroupAvatar = ''"
                  class="text-[10px] text-brand-error hover:underline">{{ langStore.t.removePhoto }}</button>
                <button v-if="editGroupBanner" @click="editGroupBanner = ''"
                  class="text-[10px] text-white/40 hover:text-white/60 hover:underline">{{ langStore.t.removeBanner }}</button>
              </div>
            </div>

            <!-- ── Scrollable content ── -->
            <div class="flex-1 overflow-y-auto min-h-0 px-5 pb-2 space-y-4">
              <!-- Name card -->
              <div class="bg-brand-bg rounded-2xl p-4 border border-brand-border/60">
                <label class="block text-[11px] text-white/45 font-semibold uppercase tracking-wide mb-2">{{ langStore.t.groupNameLabel }}</label>
                <input v-model="editGroupName" type="text" maxlength="100"
                  :placeholder="langStore.t.groupNamePlaceholder"
                  class="w-full bg-transparent text-sm text-white outline-none placeholder-white/30 border-b border-brand-border focus:border-brand-accent/60 pb-1 transition-colors" />
              </div>

              <!-- Members card -->
              <div v-if="groupMembers.length" class="bg-brand-bg rounded-2xl p-4 border border-brand-border/60">
                <p class="text-[11px] text-white/45 font-semibold uppercase tracking-wide mb-3">{{ langStore.t.createStep2Title }} · {{ groupMembers.length }}</p>
                <div class="space-y-0.5 max-h-52 overflow-y-auto -mx-1">
                  <div v-for="m in groupMembers" :key="m.user_id"
                    class="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-card/60 transition-colors">
                    <img v-if="m.user?.avatar_url" :src="m.user.avatar_url" class="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    <div v-else class="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-bold flex-shrink-0">
                      {{ (m.user?.display_name || m.user?.username || '?')[0].toUpperCase() }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-white font-medium truncate leading-tight">{{ m.user?.display_name || m.user?.username }}</p>
                      <p class="text-[11px] text-white/40 truncate">@{{ m.user?.username }}</p>
                    </div>
                    <div class="flex items-center gap-1 flex-shrink-0">
                      <span v-if="m.role === 'admin'"
                        class="text-[9px] bg-brand-accent/15 text-brand-accent px-1.5 py-0.5 rounded-full border border-brand-accent/25 font-bold">ADMIN</span>
                      <template v-if="m.user_id !== auth.user?.id">
                        <button @click="toggleMemberRole(m)" class="p-1 rounded-lg text-white/35 hover:text-brand-accent hover:bg-brand-accent/10 transition-colors"
                          :title="m.role === 'admin' ? langStore.t.chatDemoteAdminTitle : langStore.t.chatPromoteAdminTitle">
                          <BIcon :name="m.role === 'admin' ? 'ShieldOff' : 'ShieldCheck'" class="w-3.5 h-3.5" />
                        </button>
                        <button @click="kickMember(m.user_id)" class="p-1 rounded-lg text-white/35 hover:text-brand-error hover:bg-brand-error/10 transition-colors" :title="langStore.t.chatKickMemberTitle">
                          <BIcon name="UserX" class="w-3.5 h-3.5" />
                        </button>
                      </template>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── Footer actions ── -->
            <div class="flex items-center gap-2 px-5 py-4 border-t border-brand-border flex-shrink-0">
              <button @click="showEditGroup = false"
                class="flex-1 py-2.5 rounded-2xl border border-brand-border text-sm text-white/55 hover:text-white hover:bg-brand-bg/60 transition-all">
                {{ langStore.t.cancel }}
              </button>
              <button @click="saveGroupEdit" :disabled="savingGroup"
                class="flex-1 py-2.5 rounded-2xl bg-brand-accent text-white text-sm font-bold hover:bg-brand-accent-plus disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-accent/20">
                <BIcon v-if="savingGroup" name="Loader2" class="w-3.5 h-3.5 animate-spin" />
                {{ savingGroup ? langStore.t.chatSavingGroupLabel : langStore.t.groupSettingsSave }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Inline search bar ───────────────────────────────────────────────── -->
    <Transition name="search-slide">
      <div v-if="showSearch" class="px-4 py-2 border-b border-brand-border bg-brand-card/60 flex-shrink-0">
        <div class="flex items-center gap-2 bg-brand-bg border border-brand-border rounded-2xl px-3 py-2 focus-within:border-brand-accent/50 transition-colors">
          <BIcon name="Search" class="w-3.5 h-3.5 text-white/55 flex-shrink-0" />
          <input v-model="searchQuery" type="text" :placeholder="langStore.t.chatSearchMessagesPlaceholder"
            class="bg-transparent text-sm text-white placeholder-brand-muted outline-none flex-1" autofocus />
          <span v-if="searchQuery" class="text-[11px] text-white/55 flex-shrink-0">
            {{ filteredMsgList.length }} {{ langStore.t.chatOfLabel }} {{ msgList.length }}
          </span>
          <button v-if="searchQuery" @click="searchQuery = ''" class="text-white/55 hover:text-white transition-colors flex-shrink-0">
            <BIcon name="X" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Transition>

    <!-- ── Pinned message banner ─────────────────────────────────────────── -->
    <Transition name="search-slide">
      <div v-if="currentPin && !searchQuery"
        class="flex items-center gap-2.5 px-4 py-2 bg-brand-accent/8 border-b border-brand-accent/25 flex-shrink-0 group"
        @click="scrollToMsg(currentPin!.id)">
        <div class="flex-shrink-0 w-0.5 h-7 rounded-full bg-brand-accent" />
        <BIcon name="Pin" class="w-3.5 h-3.5 text-brand-accent flex-shrink-0" />
        <div class="flex-1 min-w-0 cursor-pointer">
          <p class="text-[10px] text-brand-accent font-bold leading-tight">{{ langStore.t.chatPinnedMessageLabel }}</p>
          <p class="text-[11px] text-white/70 truncate leading-tight">
            {{ currentPin!.text || langStore.t.mediaFilePreview }}
          </p>
        </div>
        <div class="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
    <div ref="scrollEl" class="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-1 relative" @scroll="onScroll" @click="onMsgListClick">

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
          <div v-if="i % 2 !== 0" class="w-7 h-7 rounded-full bg-brand-border animate-pulse flex-shrink-0" />
          <div class="h-8 bg-brand-border rounded-2xl animate-pulse" :class="i % 2 === 0 ? 'w-40' : 'w-52'" />
        </div>
      </template>

      <!-- Empty -->
      <div v-else-if="!msgList.length" class="flex flex-col items-center justify-center h-32 text-white/55 text-sm gap-2">
        <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-accent/20 to-brand-accent/5 border border-brand-accent/20 flex items-center justify-center mb-1">
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
        <div v-if="shouldShowDateDivider(idx)" class="flex items-center justify-center my-3 select-none">
          <span class="px-3 py-1 rounded-full bg-brand-bg/70 backdrop-blur-sm border border-brand-accent/25 text-[10px] font-bold text-white/55 tracking-wide uppercase">
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
              <span class="flex-shrink-0 flex items-center gap-1.5 text-[11px] text-white/40 bg-brand-bg/60 border border-brand-accent/25 px-3 py-1 rounded-full">
                <BIcon name="Pin" class="w-2.5 h-2.5 text-amber-400/70 flex-shrink-0" />
                {{ msg.text }}
              </span>
              <div class="flex-1 h-px bg-white/8" />
            </div>
          </template>

          <!-- ── Regular message bubble ─────────────────────────── -->
          <template v-else>

          <!-- Other's avatar (DM: other's avatar; Group: sender's avatar) -->
          <div v-if="!isMine(msg)" class="flex-shrink-0 self-end mb-1">
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
              <div class="w-0.5 rounded-full flex-shrink-0"
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
              <BIcon name="CornerUpRight" class="w-3 h-3 flex-shrink-0 text-brand-accent" />
              <template v-if="msg.forwarded_from_sender">
                <img v-if="msg.forwarded_from_sender.avatar_url" :src="msg.forwarded_from_sender.avatar_url" :alt="msg.forwarded_from_sender.username"
                  class="w-3.5 h-3.5 rounded-full object-cover cursor-pointer flex-shrink-0 hover:opacity-80 transition-opacity"
                  @click.stop="goToProfile(msg.forwarded_from_sender.username)" @error="onAvatarError" />
                <span v-else class="w-3.5 h-3.5 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-[7px] font-bold cursor-pointer flex-shrink-0"
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
                @click="openStickerPack(msg.file_url || msg.text || '')">
                <StickerRenderer
                  :src="msg.file_url || msg.text || ''"
                  size="xl"
                  :loop="true"
                  :autoplay="true"
                  class="!w-40 !h-40" />
              </div>
              <span v-else class="text-[80px] leading-none select-none">
                {{ getStickerEmoji(msg.text || msg.file_url || '') }}
              </span>
            </div>

            <!-- Album (2+ files sent together, e.g. a photo + a video) -->
            <div v-else-if="msg.type === 'album' && getAlbumFiles(msg).length"
              class="grid grid-cols-2 gap-0.5 mb-0.5 max-w-[280px] w-full rounded-2xl overflow-hidden shadow-sm"
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
              class="rounded-2xl overflow-hidden border border-brand-border/60 mb-0.5 w-full shadow-sm"
              :class="[
                isMine(msg) ? 'rounded-br-md' : 'rounded-bl-md',
                (msg.type === 'voice' || msg.type === 'audio') ? (isMine(msg) ? 'bg-brand-accent border-brand-accent' : 'bg-brand-card') : '',
                (msg.type === 'gif' || isGifUrl(msg.file_url)) ? 'max-w-[340px]' : 'max-w-[280px]',
              ]">
              <MiniPlayer :src="msg.file_url" :msg-type="msg.type" :is-mine="isMine(msg)" @click-image="openImageLightbox(msg.file_url!)" />
            </div>

            <!-- ── Payment request card (chat-only order card, not linked to Dealers' Den) ── -->
            <div v-if="msg.type === 'payment_request'"
              class="relative mb-0.5 w-[264px] rounded-2xl overflow-hidden border border-brand-accent/30 bg-gradient-to-br from-brand-accent/25 via-brand-accent/10 to-brand-card shadow-sm"
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
                  class="w-full py-1.5 rounded-xl bg-brand-accent hover:bg-brand-accent-plus text-white text-xs font-bold transition-all active:scale-95 disabled:opacity-50 shadow-sm">
                  {{ payingId === msg.id ? langStore.t.chatPayingLabel : langStore.t.chatPayBtn }}
                </button>
                <span v-else class="text-[11px] text-white/45">{{ langStore.t.chatAwaitingPaymentLabel }}</span>
              </div>
            </div>

            <!-- ── Payment confirmation card ── -->
            <div v-else-if="msg.type === 'payment_confirmation'"
              class="mb-0.5 w-[264px] rounded-2xl overflow-hidden border border-brand-success/30 bg-gradient-to-br from-brand-success/15 to-brand-card shadow-sm px-3.5 py-2.5 flex items-center gap-2.5"
              :class="isMine(msg) ? 'rounded-br-md' : 'rounded-bl-md'">
              <div class="w-9 h-9 rounded-full bg-gradient-to-br from-brand-success/30 to-brand-success/10 ring-1 ring-brand-success/30 flex items-center justify-center flex-shrink-0">
                <BIcon name="Check" class="w-4 h-4 text-brand-success" />
              </div>
              <div class="min-w-0">
                <p class="text-sm font-bold text-brand-success">{{ langStore.t.chatPaidLabel }} · {{ formatMoney(msg.metadata?.amount) }}</p>
                <p v-if="msg.metadata?.description" class="text-[11px] text-white/55 truncate">{{ msg.metadata.description }}</p>
              </div>
            </div>

            <!-- ── Tip card ── -->
            <div v-else-if="msg.type === 'tip'"
              class="relative mb-0.5 w-[264px] rounded-2xl overflow-hidden border border-brand-pink/35 bg-gradient-to-br from-brand-purple/20 via-brand-pink/10 to-brand-card shadow-sm px-3.5 py-2.5 flex items-center gap-2.5"
              :class="isMine(msg) ? 'rounded-br-md' : 'rounded-bl-md'">
              <div class="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-brand-pink/20 blur-2xl pointer-events-none" />
              <div class="relative w-9 h-9 rounded-full bg-gradient-to-br from-brand-pink/25 to-brand-purple/20 ring-1 ring-brand-pink/30 flex items-center justify-center flex-shrink-0 text-base">🎉</div>
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
                  class="relative w-full overflow-hidden bg-gradient-to-br from-brand-accent/20 to-purple-900/40"
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
                  <div class="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60 pointer-events-none" />

                  <!-- Top: author chip -->
                  <div class="absolute top-2 left-2 right-2 flex items-center gap-1.5">
                    <div class="w-6 h-6 rounded-full overflow-hidden border border-white/30 flex-shrink-0 bg-brand-accent/30">
                      <img
                        v-if="parseStoryReply(msg)!.authorAvatar"
                        :src="parseStoryReply(msg)!.authorAvatar"
                        class="w-full h-full object-cover"
                      />
                      <div v-else class="w-full h-full flex items-center justify-center text-[9px] font-bold text-white">
                        {{ (parseStoryReply(msg)!.authorName || '?')[0].toUpperCase() }}
                      </div>
                    </div>
                    <span class="text-[10px] font-semibold text-white/90 truncate drop-shadow">
                      {{ parseStoryReply(msg)!.authorName }}
                    </span>
                  </div>

                  <!-- Bottom: label + play button -->
                  <div v-if="!parseStoryReply(msg)!.expired" class="absolute bottom-2 inset-x-2 flex items-center justify-between">
                    <div class="flex items-center gap-1">
                      <BIcon name="Sparkles" class="w-3 h-3 text-white/70" />
                      <span class="text-[10px] text-white/70 font-medium">{{ langStore.t.story }}</span>
                    </div>
                    <div class="w-7 h-7 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center group-hover:bg-white/30 transition-colors">
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
                <div class="relative w-full bg-gradient-to-br from-brand-accent/20 to-purple-900/40 flex flex-col items-center justify-center gap-2 text-white/40 py-8">
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
                'relative px-3 py-[7px] rounded-2xl text-sm leading-relaxed break-words min-w-[60px] transition-shadow',
                isMine(msg)
                  ? 'bg-brand-accent text-white rounded-br-md'
                  : 'bg-brand-card text-brand-offwhite border border-brand-border/60 rounded-bl-md shadow-sm',
                msg._sending ? 'opacity-60' : '',
                translateMode && translations[msg.id] && !isMine(msg) ? 'border-brand-accent/40' : '',
              ]">
              <!-- ── Forwarded banner ── -->
              <div v-if="getForwardedAuthor(msg)"
                class="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b"
                :class="isMine(msg) ? 'border-white/20' : 'border-brand-border'">
                <BIcon name="CornerUpRight" class="w-3 h-3 flex-shrink-0"
                  :class="isMine(msg) ? 'text-white/60' : 'text-brand-accent'" />
                <template v-if="msg.forwarded_from_sender">
                  <img v-if="msg.forwarded_from_sender.avatar_url" :src="msg.forwarded_from_sender.avatar_url" :alt="msg.forwarded_from_sender.username"
                    class="w-3.5 h-3.5 rounded-full object-cover cursor-pointer flex-shrink-0 hover:opacity-80 transition-opacity"
                    @click.stop="goToProfile(msg.forwarded_from_sender.username)" @error="onAvatarError" />
                  <span v-else class="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold cursor-pointer flex-shrink-0"
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
                  <div class="space-y-1.5">
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
                <button v-if="msg._failed" type="button" @click="retrySend(msg)"
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
                  class="p-0.5 rounded hover:text-amber-400 text-white/55 transition-colors" :title="langStore.t.chatReactionTitle">
                  <BIcon name="SmilePlus" class="w-3 h-3" />
                </button>
                <button type="button" @click="replyTo = msg"
                  class="p-0.5 rounded hover:text-brand-accent text-white/55 transition-colors" :title="langStore.t.reply">
                  <BIcon name="CornerUpLeft" class="w-3 h-3" />
                </button>
                <button type="button" @click="openPinModal(msg)"
                  class="p-0.5 rounded hover:text-amber-400 text-white/55 transition-colors" :title="langStore.t.chatPinTitle">
                  <BIcon name="Pin" class="w-3 h-3" />
                </button>
                <button type="button" @click="startForward(msg)"
                  class="p-0.5 rounded hover:text-brand-accent text-white/55 transition-colors" :title="langStore.t.chatForwardAction">
                  <BIcon name="Forward" class="w-3 h-3" />
                </button>
                <button v-if="msg.text" type="button" @click="copyMessageText(msg)"
                  class="p-0.5 rounded hover:text-brand-accent text-white/55 transition-colors" :title="langStore.t.chatCopyMsgActionTitle">
                  <BIcon name="Copy" class="w-3 h-3" />
                </button>
                <button v-if="isMine(msg) && msg.type === 'text' && !msg._sending" @click="startEdit(msg)"
                  class="p-0.5 rounded hover:text-brand-accent text-white/55 transition-colors" :title="langStore.t.chatEditMsgTitle">
                  <BIcon name="Pencil" class="w-3 h-3" />
                </button>
                <button v-if="isMine(msg) && !msg._sending" @click="deleteMsg(msg.id)"
                  class="p-0.5 rounded hover:text-brand-error text-white/55 transition-colors" :title="langStore.t.deleteBtn">
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
        <div class="w-6 h-6 flex-shrink-0">
          <img v-if="other?.avatar_url" :src="other.avatar_url" class="w-6 h-6 rounded-full object-cover border border-brand-border" @error="onAvatarError" />
        </div>
        <div class="bg-brand-card border border-brand-border rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1">
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
        class="absolute right-4 bottom-[88px] z-20 w-10 h-10 rounded-full bg-brand-card border border-brand-border shadow-xl flex items-center justify-center text-white hover:bg-brand-accent hover:border-brand-accent active:scale-95 transition-all"
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
          class="fixed inset-0 z-[200] flex items-center justify-center p-4"
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
          class="fixed inset-0 z-[200] flex items-center justify-center p-4"
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
        <div v-if="forwardMsg || forwardMsgs.length" class="fixed inset-0 z-[200] flex items-center justify-center p-4"
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
              <div class="w-0.5 h-7 rounded-full bg-brand-accent flex-shrink-0" />
              <div class="min-w-0">
                <p class="text-[10px] text-brand-accent font-semibold truncate">{{ forwardList[0].sender?.display_name || forwardList[0].sender?.username }}</p>
                <p class="text-[11px] text-white/55 truncate">{{ forwardMsgPreview(forwardList[0]) }}</p>
              </div>
            </div>
            <div v-else class="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-brand-bg border border-brand-border/60">
              <BIcon name="Forward" class="w-4 h-4 text-brand-accent flex-shrink-0" />
              <p class="text-[11px] text-white/55">{{ langStore.t.chatSelectedMessagesCountLabel }}: {{ forwardList.length }}</p>
            </div>
            <!-- Conv list -->
            <div class="space-y-1 max-h-52 overflow-y-auto">
              <button v-for="c in store.conversations.filter(c2 => c2.id !== convId)" :key="c.id"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-brand-bg transition-colors text-left"
                @click="doForward(c.id)">
                <div :class="['w-8 h-8 flex-shrink-0 overflow-hidden bg-brand-accent/20 border border-brand-border', c.is_group ? 'rounded-lg' : 'rounded-full']">
                  <img v-if="c.is_group ? c.avatar_url : c.other_participants[0]?.user?.avatar_url"
                    :src="c.is_group ? c.avatar_url! : c.other_participants[0].user.avatar_url!"
                    class="w-full h-full object-cover" @error="onAvatarError" />
                  <div v-else class="w-full h-full flex items-center justify-center text-brand-accent text-xs font-bold">
                    {{ (c.is_group ? c.name : (c.other_participants[0]?.user?.display_name || c.other_participants[0]?.user?.username) || '?')[0]?.toUpperCase() }}
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
      <div v-if="contextMenuMsg" class="fixed inset-0 z-[250]" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu">
        <div class="absolute w-56 bg-brand-card border border-brand-border rounded-2xl shadow-2xl py-1.5 overflow-hidden"
          :style="{ left: contextMenuPos.x + 'px', top: contextMenuPos.y + 'px' }"
          @click.stop @contextmenu.prevent.stop>
          <button @click="replyTo = contextMenuMsg; closeContextMenu()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
            <BIcon name="CornerUpLeft" class="w-4 h-4 text-white/55 flex-shrink-0" />
            {{ langStore.t.reply }}
          </button>
          <button v-if="isMine(contextMenuMsg) && contextMenuMsg.type === 'text' && !contextMenuMsg._sending"
            @click="startEdit(contextMenuMsg); closeContextMenu()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
            <BIcon name="Pencil" class="w-4 h-4 text-white/55 flex-shrink-0" />
            {{ langStore.t.chatEditMsgTitle }}
          </button>
          <button @click="openPinModal(contextMenuMsg); closeContextMenu()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
            <BIcon name="Pin" class="w-4 h-4 text-white/55 flex-shrink-0" />
            {{ langStore.t.chatPinTitle }}
          </button>
          <button v-if="contextMenuMsg.text" @click="copyMessageText(contextMenuMsg); closeContextMenu()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
            <BIcon name="Copy" class="w-4 h-4 text-white/55 flex-shrink-0" />
            {{ langStore.t.chatCopyMsgTextAction }}
          </button>
          <button @click="startForward(contextMenuMsg); closeContextMenu()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
            <BIcon name="Forward" class="w-4 h-4 text-white/55 flex-shrink-0" />
            {{ langStore.t.chatForwardAction }}
          </button>
          <div class="border-t border-brand-border my-1" />
          <button @click="toggleSelect(contextMenuMsg.id); closeContextMenu()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
            <BIcon name="CheckSquare" class="w-4 h-4 text-white/55 flex-shrink-0" />
            {{ langStore.t.chatSelectMsgAction }}
          </button>
          <button v-if="isMine(contextMenuMsg) && !contextMenuMsg._sending" @click="deleteMsg(contextMenuMsg.id); closeContextMenu()"
            class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-error hover:bg-brand-error/8 transition-colors text-left">
            <BIcon name="Trash2" class="w-4 h-4 flex-shrink-0" />
            {{ langStore.t.deleteBtn }}
          </button>
        </div>
      </div>
    </Teleport>

    <!-- ── Invite-to-group picker ───────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showInvitePicker" class="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style="background:rgba(0,0,0,.55)" @click.self="showInvitePicker = false">
          <div class="bg-brand-card border border-brand-border rounded-3xl p-5 w-full max-w-sm shadow-2xl">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-base font-bold text-white">{{ langStore.t.chatInviteToGroupTitle }} «{{ conv?.name || langStore.t.chatGroupFallbackAccusative }}»</h3>
              <button @click="showInvitePicker = false" class="p-1.5 rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-colors">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>
            <p v-if="inviteSentTo" class="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-brand-success/10 text-brand-success text-sm">
              <BIcon name="CheckCircle2" class="w-4 h-4 flex-shrink-0" />
              {{ langStore.t.chatInviteSentLabel }} {{ inviteSentTo }}
            </p>
            <div v-if="!invitableConversations.length" class="text-center text-sm text-white/40 py-6">
              {{ langStore.t.chatNoDmsForInvite }}
            </div>
            <div v-else class="space-y-1 max-h-64 overflow-y-auto">
              <button v-for="c in invitableConversations" :key="c.id"
                :disabled="invitingConvId === c.id"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-brand-bg transition-colors text-left disabled:opacity-50"
                @click="doInviteToGroup(c)">
                <div class="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden bg-brand-accent/20 border border-brand-border">
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
                <BIcon v-if="invitingConvId === c.id" name="Loader2" class="w-4 h-4 text-brand-accent animate-spin flex-shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── @Mention card popover ───────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="mentionCard" class="fixed z-[210] bg-brand-card border border-brand-border rounded-2xl shadow-2xl p-3 w-56"
          :style="{ top: mentionCard.y + 'px', left: mentionCard.x + 'px' }"
          @mouseleave="mentionCard = null">
          <div class="flex items-center gap-2.5 mb-3">
            <img v-if="mentionCard.avatar_url" :src="mentionCard.avatar_url" class="w-10 h-10 rounded-full object-cover border border-brand-border flex-shrink-0" @error="onAvatarError" />
            <div v-else class="w-10 h-10 rounded-full bg-brand-accent/20 border border-brand-border flex items-center justify-center text-brand-accent font-bold flex-shrink-0">
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
      class="px-3 pt-2.5 border-t border-brand-border bg-brand-card flex-shrink-0 flex items-center gap-2">
      <button type="button" @click="showPaymentModal = true"
        class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-2xl bg-gradient-to-r from-brand-accent/15 to-brand-accent/5 border border-brand-accent/30 text-brand-accent text-xs font-bold hover:from-brand-accent/25 hover:to-brand-accent/10 transition-all active:scale-[0.98]">
        <span class="w-4 h-4 rounded-md bg-brand-accent/20 flex items-center justify-center">
          <BIcon name="CreditCard" class="w-2.5 h-2.5" />
        </span>
        {{ langStore.t.chatRequestPaymentAction }}
      </button>
      <button type="button" @click="showTipPicker = !showTipPicker"
        class="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-2xl bg-gradient-to-r from-brand-purple/15 to-brand-pink/10 border border-brand-pink/30 text-brand-pink text-xs font-bold hover:from-brand-purple/25 hover:to-brand-pink/15 transition-all active:scale-[0.98]">
        <span class="w-4 h-4 rounded-md bg-brand-pink/20 flex items-center justify-center">
          <BIcon name="Gift" class="w-2.5 h-2.5" />
        </span>
        {{ langStore.t.chatSupportAction }}
      </button>
    </div>

    <!-- ── Input ───────────────────────────────────────────────────────────── -->
    <div class="px-3 py-3 border-t border-brand-border bg-brand-card flex-shrink-0 relative">
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
              class="flex-1 min-w-0 bg-brand-bg border border-brand-border rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-brand-pink/50" />
            <button type="button" @click="sendQuickTip(Number(customTipAmount))" :disabled="!customTipAmount || Number(customTipAmount) <= 0"
              class="flex-shrink-0 px-3 py-1.5 rounded-xl bg-gradient-to-r from-brand-purple/25 to-brand-pink/25 text-brand-pink text-xs font-bold disabled:opacity-40 transition-all active:scale-95">
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
        <!-- Attachment button -->
        <button type="button" @click="fileInputEl?.click()"
          :disabled="isUploading || isRecording || pendingAttachments.length >= MAX_ATTACHMENTS"
          class="flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center text-white/55 hover:text-brand-accent hover:bg-brand-bg transition-all disabled:opacity-40"
          :title="langStore.t.chatAttachMediaTitle">
          <BIcon v-if="isUploading" name="Loader2" class="w-4 h-4 animate-spin" />
          <BIcon v-else name="Paperclip" class="w-4 h-4" />
        </button>
        <input ref="fileInputEl" type="file" multiple accept="image/*,video/*,audio/*" class="sr-only" @change="onFileChange" />

        <!-- Emoji button -->
        <button type="button"
          @click="showEmojiPicker = !showEmojiPicker; showStickerPanel = false"
          :class="['flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center transition-all',
            showEmojiPicker ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/55 hover:text-brand-accent hover:bg-brand-bg']"
          :title="langStore.t.chatEmojiTitle">
          <BIcon name="Smile" class="w-5 h-5" />
        </button>

        <!-- Sticker button -->
        <button type="button"
          @click="showStickerPanel = !showStickerPanel; showEmojiPicker = false"
          :class="['flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center transition-all',
            showStickerPanel ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/55 hover:text-brand-accent hover:bg-brand-bg']"
          :title="langStore.t.chatStickersTitle">
          <BIcon name="Sticker" class="w-5 h-5" />
        </button>

        <!-- Recording in progress bar (takes the place of the textarea row when recording) -->
        <button v-if="isRecording" type="button" @click="stopRecording"
          class="flex-1 flex items-center gap-2 px-3 h-10 rounded-2xl bg-brand-error/15 border border-brand-error/40 text-brand-error hover:bg-brand-error/25 transition-all">
          <span class="w-2 h-2 rounded-full bg-brand-error animate-ping flex-shrink-0" />
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
                <img v-if="u.avatar_url" :src="u.avatar_url" class="w-7 h-7 rounded-full object-cover flex-shrink-0" @error="onAvatarError" />
                <div v-else class="w-7 h-7 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-bold flex-shrink-0">
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
            <BIcon name="Pencil" class="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-[10px] text-amber-400 font-semibold truncate leading-tight">{{ langStore.t.chatEditingMessageLabel }}</p>
              <p class="text-[11px] text-white/55 truncate leading-tight">
                {{ previewMsgText(editingMsg.text ?? undefined, 60) }}
              </p>
            </div>
            <button type="button" @click="cancelEdit" class="flex-shrink-0 p-0.5 text-white/55 hover:text-brand-error transition-colors">
              <BIcon name="X" class="w-3.5 h-3.5" />
            </button>
          </div>
          <!-- Reply bar -->
          <div v-if="replyTo && !editingMsg" class="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-bg border border-brand-accent/30">
            <div class="w-0.5 h-8 rounded-full bg-brand-accent flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-[10px] text-brand-accent font-semibold truncate leading-tight">
                {{ replyTo.sender?.display_name || replyTo.sender?.username || langStore.t.messageBtn }}
              </p>
              <p class="text-[11px] text-white/55 truncate leading-tight">
                {{ replyTo.file_url && !replyTo.text ? langStore.t.mediaFilePreview : previewMsgText(replyTo.text, 60) }}
              </p>
            </div>
            <button type="button" @click="replyTo = null" class="flex-shrink-0 p-0.5 text-white/55 hover:text-brand-error transition-colors">
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
              class="relative flex items-center gap-2 bg-brand-bg border border-brand-border rounded-2xl p-2 pr-3 max-w-[220px] shadow-sm">
              <div class="relative flex-shrink-0 w-11 h-11 rounded-xl overflow-hidden bg-black/25 flex items-center justify-center">
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
                class="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white/45 hover:text-brand-error hover:bg-brand-error/10 transition-colors">
                <BIcon name="X" class="w-3.5 h-3.5" />
              </button>
            </div>
          </TransitionGroup>
          <textarea ref="inputEl" v-model="draft" rows="1"
            :placeholder="pendingAttachments.length ? langStore.t.chatCaptionPlaceholder : langStore.t.chatMessagePlaceholder"
            class="block w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-[9px] text-sm text-white placeholder-brand-muted resize-none outline-none focus:border-brand-accent/60 transition-colors max-h-32 overflow-y-auto"
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
            class="flex-shrink-0 w-10 h-10 rounded-2xl bg-brand-card border border-brand-border hover:bg-brand-bg text-white/55 hover:text-brand-accent transition-all flex items-center justify-center disabled:opacity-40"
            :title="langStore.t.chatVoiceMessageTitle">
            <BIcon name="Mic" class="w-4 h-4" />
          </button>
          <!-- Send: shown when there's text or at least one uploaded attachment -->
          <button v-else key="send"
            type="submit"
            :disabled="(!draft.trim() && !pendingAttachments.some((a) => a.uploadedUrl && !a.failed)) || isUploading"
            class="flex-shrink-0 w-10 h-10 rounded-2xl bg-brand-accent hover:bg-brand-accent-plus disabled:opacity-30 transition-all shadow-lg shadow-brand-accent/20 active:scale-95 flex items-center justify-center"
            :title="langStore.t.send">
            <BIcon name="SendHorizontal" class="w-4 h-4 text-white" />
          </button>
        </Transition>
      </form>
    </div>
  </div>

  <!-- ── In-chat story viewer ──────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-250 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="activeStoryCard"
        class="fixed inset-0 z-[800] flex items-center justify-center bg-black/90 backdrop-blur-sm"
        @click.self="activeStoryCard = null"
      >
        <!-- Story phone frame -->
        <div
          class="relative flex flex-col bg-black rounded-3xl overflow-hidden shadow-2xl ring-1 ring-white/10"
          style="aspect-ratio:9/16; height:min(90vh,600px)"
        >
          <!-- Background blur -->
          <div class="absolute inset-0 overflow-hidden">
            <img
              v-if="activeStoryCard.imageUrl"
              :src="activeStoryCard.imageUrl"
              class="w-full h-full object-cover scale-110 blur-2xl opacity-30 pointer-events-none"
              aria-hidden="true"
            />
            <div class="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
          </div>

          <!-- Main image -->
          <div class="flex-1 relative flex items-center justify-center overflow-hidden">
            <img
              v-if="activeStoryCard.imageUrl"
              :src="activeStoryCard.imageUrl"
              class="w-full h-full object-cover"
              draggable="false"
            />
            <div v-else class="flex flex-col items-center gap-3 text-white/30">
              <BIcon name="ImageOff" class="w-12 h-12" />
              <span class="text-xs">{{ langStore.t.chatImageUnavailableLabel }}</span>
            </div>
          </div>

          <!-- Top bar: author + expiry + close -->
          <div class="absolute top-0 left-0 right-0 z-10 flex items-center gap-2.5 px-3 pt-3 pb-4 bg-gradient-to-b from-black/70 to-transparent">
            <!-- Avatar -->
            <div class="w-9 h-9 rounded-full overflow-hidden border-2 border-white/30 flex-shrink-0 bg-brand-accent/20">
              <img
                v-if="activeStoryCard.authorAvatar"
                :src="activeStoryCard.authorAvatar"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-sm font-bold text-white">
                {{ (activeStoryCard.authorName || '?')[0].toUpperCase() }}
              </div>
            </div>
            <!-- Name + expiry -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-bold text-white leading-tight truncate">
                {{ activeStoryCard.authorName }}
              </p>
              <div class="flex items-center gap-1 text-[11px] text-white/55">
                <BIcon name="Sparkles" class="w-3 h-3" />
                <span>{{ langStore.t.story }}</span>
                <span v-if="activeStoryCard.expiresAt" class="flex items-center gap-0.5 ml-1">
                  <BIcon name="Clock" class="w-3 h-3" />
                  {{
                    (() => {
                      const diff = Math.max(0, new Date(activeStoryCard.expiresAt).getTime() - Date.now())
                      const h = Math.floor(diff / 3_600_000)
                      const m = Math.floor((diff % 3_600_000) / 60_000)
                      return h > 0 ? `${h}${langStore.t.chatHourAbbr} ${m}${langStore.t.chatMinuteAbbr}` : `${m}${langStore.t.chatMinuteAbbr}`
                    })()
                  }}
                </span>
              </div>
            </div>
            <!-- Close button -->
            <button
              @click="activeStoryCard = null"
              class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors flex-shrink-0"
            >
              <BIcon name="X" class="w-5 h-5" />
            </button>
          </div>

          <!-- Bottom: reply text if present -->
          <div
            v-if="activeStoryCard.replyText"
            class="absolute bottom-0 left-0 right-0 z-10 px-4 pb-5 pt-8 bg-gradient-to-t from-black/80 to-transparent"
          >
            <div class="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl px-4 py-3">
              <p class="text-[10px] text-white/50 font-semibold uppercase tracking-wider mb-1">{{ langStore.t.chatReplyLabel }}</p>
              <p class="text-sm text-white leading-snug">{{ activeStoryCard.replyText }}</p>
            </div>
          </div>
        </div>

        <!-- Close hint -->
        <button
          @click="activeStoryCard = null"
          class="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
        >
          <BIcon name="X" class="w-5 h-5" />
        </button>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Reaction burst flourish (flying emoji on pick) ────────────────────── -->
  <Teleport to="body">
    <div v-for="b in reactionBursts" :key="b.id"
      class="reaction-burst pointer-events-none fixed z-[300] text-3xl"
      :style="{ left: b.x + 'px', top: b.y + 'px' }">
      {{ b.emoji }}
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessagesStore, type Message, type MsgSender, type Conversation, type PinnedMessage } from '@/stores/messages'
import { useAuthStore } from '@/stores/auth'
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
import type { Lang } from '@/locales/translations'
import BIcon from '@/components/BIcon.vue'
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
import { compressImageForUpload } from '@/lib/utils'
import { wsClient } from '@/lib/wsClient'
import { isEncrypted } from '@/lib/e2e'
import { deviceKind } from '@/lib/deviceIcon'

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

// ── Language code mapping (app lang → MyMemory API lang) ────────────────────
const LANG_TO_API: Record<Lang, string> = {
  RU: 'ru', EN: 'en', JP: 'ja', CN: 'zh-CN', DE: 'de', FR: 'fr', ES: 'es', PT: 'pt',
}

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
const translateMode    = ref(false)
const translateLang    = ref(LANG_TO_API[langStore.currentLang] ?? 'ru')
const translations     = ref<Record<string, string>>({})
const translatingIds   = reactive(new Set<string>())
const lightboxUrl      = ref<string | null>(null)
// Online status
const isPartnerOnline   = ref(false)
const partnerLastSeenAt = ref<Date | null>(null)
const partnerDevice     = ref<string | null>(null)
const partnerLastSeenLabel = computed(() => {
  if (!partnerLastSeenAt.value) return langStore.t.chatOfflineLabel
  const seenAt = partnerLastSeenAt.value
  const diff = Math.floor((Date.now() - seenAt.getTime()) / 60000)
  if (diff < 1) return langStore.t.chatOnlineJustNow
  if (diff < 60) return `${langStore.t.chatSeenPrefix} ${diff} ${langStore.t.chatMinAgoSuffix}`
  const h = Math.floor(diff / 60)
  if (h < 24) return `${langStore.t.chatSeenPrefix} ${h} ${langStore.t.chatHoursAgoSuffix}`
  const now = new Date()
  const locale = LANG_TO_LOCALE[langStore.currentLang]
  const time = seenAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  const sameYear = seenAt.getFullYear() === now.getFullYear()
  const date = seenAt.toLocaleDateString(locale, sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' })
  return `${langStore.t.chatSeenPrefix} ${date} ${langStore.t.chatSeenAtConnector} ${time}`
})
const partnerDeviceIcon = computed(() => {
  const kind = deviceKind(partnerDevice.value)
  return kind === 'mobile' ? 'Smartphone' : kind === 'tablet' ? 'Tablet' : kind === 'desktop' ? 'Monitor' : null
})
let onlineTimer: ReturnType<typeof setInterval> | null = null
// Media — multiple attachments can be queued at once (e.g. a photo + a video sent together)
interface PendingAttachment {
  id: number
  kind: 'image' | 'video' | 'gif' | 'audio' | 'file'
  name: string
  size: number
  previewUrl: string | null
  uploadedUrl: string | null
  uploading: boolean
  progress: number
  failed: boolean
}
const MAX_ATTACHMENTS = 10
const pendingAttachments = ref<PendingAttachment[]>([])
let attachSeq = 0
const voiceUploading = ref(false)
const isUploading = computed(() => voiceUploading.value || pendingAttachments.value.some((a) => a.uploading))
const uploadError       = ref<string | null>(null)
let uploadErrorTimer: ReturnType<typeof setTimeout> | null = null
// Lightbox
const lightboxUrls = ref<string[]>([])
const lightboxTypes = ref<string[]>([])
const lightboxStart = ref(0)
const stickerPackUrl = ref<string | null>(null)
// Voice recording
const isRecording     = ref(false)
const recordingSeconds = ref(0)
let mediaRecorder: MediaRecorder | null = null
let recordTimer: ReturnType<typeof setInterval> | null = null
// Legacy E2E messages — decryption removed, only used to show a placeholder for old ciphertext
// Block/delete modals
const showDeleteModal = ref(false)
const showBlockModal  = ref(false)
const isBlocked       = ref(false)
const deleteScope     = ref<'me' | 'all'>('me')
// @mention autocomplete
const mentionQuery    = ref('')
const mentionResults  = ref<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([])
const mentionLoading  = ref(false)
let   mentionTimer: ReturnType<typeof setTimeout> | null = null
// Group conversation
const showMembersPanel = ref(false)
const showDmPanel      = ref(false)
const mediaStatsData   = ref<Record<string, number>>({})
const mediaStatsLoading = ref(false)
const pinTarget        = ref<Message | null>(null)
const showPinScopeModal = ref(false)
const showPaymentModal = ref(false)
const showTipPicker    = ref(false)
const customTipAmount  = ref('')
const sendingPayment   = ref(false)
const paymentForm      = reactive({ amount: '', description: '', prepaymentPercent: '', deadline: '' })
const showEditGroup    = ref(false)
const editGroupName    = ref('')
const editGroupAvatar  = ref('')
const editGroupBanner  = ref('')
const groupAvatarRef   = ref<HTMLInputElement | null>(null)
const groupBannerRef   = ref<HTMLInputElement | null>(null)
const uploadingGroupAvatar = ref(false)
const uploadingGroupBanner = ref(false)

async function onGroupAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingGroupAvatar.value = true
  try {
    const fd = new FormData()
    const compressed = await compressImageForUpload(file)
    fd.append('file', compressed, compressed.name)
    const res = await api.post('/media/upload?folder=avatars', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    editGroupAvatar.value = res.data.data.url
  } catch (err) { console.error('Avatar upload failed:', err) }
  finally { uploadingGroupAvatar.value = false; if (groupAvatarRef.value) groupAvatarRef.value.value = '' }
}

async function onGroupBannerChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingGroupBanner.value = true
  try {
    const fd = new FormData()
    const compressed = await compressImageForUpload(file)
    fd.append('file', compressed, compressed.name)
    const res = await api.post('/media/upload?folder=banners', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    editGroupBanner.value = res.data.data.url
  } catch (err) { console.error('Banner upload failed:', err) }
  finally { uploadingGroupBanner.value = false; if (groupBannerRef.value) groupBannerRef.value.value = '' }
}
const savingGroup      = ref(false)
const groupMembers     = ref<Array<{ user_id: string; role: string; user: MsgSender }>>([])
const membersLoading   = ref(false)
// When the group has no custom banner, the banner is filled with a collage of member avatars.
const bannerCollage = computed(() => groupMembers.value.slice(0, 8).map((m) => m.user))

// Member search (within the info modal — separate from the admin "add member" search below)
const memberSearchQuery = ref('')
const filteredGroupMembers = computed(() => {
  const q = memberSearchQuery.value.trim().toLowerCase()
  if (!q) return groupMembers.value
  return groupMembers.value.filter((m) =>
    m.user?.username?.toLowerCase().includes(q) || m.user?.display_name?.toLowerCase().includes(q))
})

// Group page link (real URL — not a fake VK-style invite link)
const groupPageUrl = computed(() => props.conv?.group_id ? `${location.host}/groups/${props.conv.group_id}` : '')
const groupLinkCopied = ref(false)
async function copyGroupLink() {
  if (!props.conv?.group_id) return
  try {
    await navigator.clipboard.writeText(`${location.origin}/groups/${props.conv.group_id}`)
    groupLinkCopied.value = true
    setTimeout(() => { groupLinkCopied.value = false }, 1500)
  } catch { /* clipboard blocked — silent */ }
}

const usernameCopied = ref(false)
async function copyUsername() {
  if (!props.other?.username) return
  try {
    await navigator.clipboard.writeText(props.other.username)
    usernameCopied.value = true
    setTimeout(() => { usernameCopied.value = false }, 1500)
  } catch { /* clipboard blocked — silent */ }
}

// Add member
const showAddMember     = ref(false)
const addMemberSearch   = ref('')
const addMemberResults  = ref<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([])
const addMemberLoading  = ref(false)
let addMemberTimer: ReturnType<typeof setTimeout> | null = null
function debouncedAddMemberSearch() {
  if (addMemberTimer) clearTimeout(addMemberTimer)
  addMemberTimer = setTimeout(runAddMemberSearch, 300)
}
async function runAddMemberSearch() {
  const q = addMemberSearch.value.trim()
  if (q.length < 2) { addMemberResults.value = []; return }
  addMemberLoading.value = true
  try {
    const res = await api.get(`/users/search?q=${encodeURIComponent(q)}&limit=10`)
    addMemberResults.value = res.data.data.users ?? []
  } catch { addMemberResults.value = [] }
  finally { addMemberLoading.value = false }
}
async function doAddMember(u: { id: string; username: string; display_name: string | null; avatar_url: string | null }) {
  if (groupMembers.value.some(m => m.user_id === u.id)) return
  try {
    await store.addGroupMember(props.convId, u.id)
    groupMembers.value.push({ user_id: u.id, role: 'member', user: u as any })
  } catch { /* silent */ }
}
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

// ── Media stats ──────────────────────────────────────────────────────────────
const MEDIA_STAT_DEFS = computed(() => [
  { key: 'image',  label: langStore.t.chatMediaLabelPhoto,  icon: 'Image' },
  { key: 'video',  label: langStore.t.chatMediaLabelVideo,  icon: 'Video' },
  { key: 'audio',  label: langStore.t.chatMediaLabelAudio,  icon: 'Music' },
  { key: 'voice',  label: langStore.t.chatMediaLabelVoice,  icon: 'Mic' },
  { key: 'file',   label: langStore.t.chatMediaLabelFiles,  icon: 'FileText' },
  { key: 'link',   label: langStore.t.chatMediaLabelLinks,  icon: 'Link' },
])
const mediaStatsList = computed(() =>
  MEDIA_STAT_DEFS.value.map(d => ({ ...d, count: mediaStatsData.value[d.key] ?? 0 }))
)

async function loadMediaStats() {
  if (mediaStatsLoading.value) return
  mediaStatsLoading.value = true
  try { mediaStatsData.value = await store.getMediaStats(props.convId) } finally { mediaStatsLoading.value = false }
}

// ── Media browser (opened from a stat row: photo/video/audio/voice/links) ──────
const MEDIA_TYPE_TITLES = computed<Record<string, string>>(() => ({
  image: langStore.t.chatMediaTitlePhotos, video: langStore.t.chatMediaLabelVideo, audio: langStore.t.chatMediaTitleAudioFiles,
  voice: langStore.t.chatMediaTitleVoiceMessages, link: langStore.t.chatMediaLabelLinks,
}))
const mediaBrowserType    = ref<string | null>(null)
const mediaBrowserItems   = ref<Message[]>([])
const mediaBrowserLoading = ref(false)
const mediaBrowserHasMore = ref(true)
const mediaBrowserPlayingId = ref<string | null>(null)

async function openMediaBrowser(type: string) {
  mediaBrowserType.value = type
  mediaBrowserItems.value = []
  mediaBrowserHasMore.value = true
  mediaBrowserPlayingId.value = null
  await loadMoreMediaBrowser()
}
function closeMediaBrowser() {
  mediaBrowserType.value = null
  mediaBrowserPlayingId.value = null
}
async function loadMoreMediaBrowser() {
  if (!mediaBrowserType.value || mediaBrowserLoading.value || !mediaBrowserHasMore.value) return
  mediaBrowserLoading.value = true
  try {
    const before = mediaBrowserItems.value.length
      ? mediaBrowserItems.value[mediaBrowserItems.value.length - 1].created_at
      : undefined
    const batch = await store.getMediaMessages(props.convId, mediaBrowserType.value, before)
    mediaBrowserItems.value.push(...batch)
    if (batch.length < 60) mediaBrowserHasMore.value = false
  } finally {
    mediaBrowserLoading.value = false
  }
}
function onMediaBrowserScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) loadMoreMediaBrowser()
}
function monthLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const month = d.toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { month: 'long' })
  const capped = month.charAt(0).toUpperCase() + month.slice(1)
  return d.getFullYear() === now.getFullYear() ? capped : `${capped} ${d.getFullYear()}`
}
const mediaBrowserGroups = computed(() => {
  const groups: Array<{ label: string; items: Message[] }> = []
  for (const m of mediaBrowserItems.value) {
    const label = monthLabel(m.created_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(m)
    else groups.push({ label, items: [m] })
  }
  return groups
})
function toggleMediaBrowserPlay(msgId: string) {
  mediaBrowserPlayingId.value = mediaBrowserPlayingId.value === msgId ? null : msgId
}
function openMediaBrowserImage(url: string) {
  const urls = mediaBrowserItems.value.map((m) => m.file_url).filter(Boolean) as string[]
  lightboxUrls.value = urls
  lightboxTypes.value = []
  lightboxStart.value = Math.max(0, urls.indexOf(url))
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
  return (msg as any).sender?.avatar_url ?? null
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

// Group management
async function fetchGroupMembers() {
  if (!props.conv?.is_group) return
  membersLoading.value = true
  try { groupMembers.value = await store.getGroupMembers(props.convId) }
  catch { /* silent */ }
  finally { membersLoading.value = false }
  fetchGroupOnlineStatus()
}

// Online status for every member — reuses the same batch endpoint the DM header uses.
const groupOnlineStatus = ref<Record<string, boolean>>({})
const groupOnlineCount = computed(() => Object.values(groupOnlineStatus.value).filter(Boolean).length)
async function fetchGroupOnlineStatus() {
  if (!groupMembers.value.length) return
  try {
    const ids = groupMembers.value.map((m) => m.user_id).join(',')
    const res = await api.get(`/users/online?ids=${ids}`)
    groupOnlineStatus.value = res.data?.data ?? {}
  } catch { /* silent */ }
}

async function kickMember(userId: string) {
  await store.removeGroupMember(props.convId, userId)
  groupMembers.value = groupMembers.value.filter((m) => m.user_id !== userId)
}

async function toggleMemberRole(m: { user_id: string; role: string; user: MsgSender }) {
  const newRole = m.role === 'admin' ? 'member' : 'admin'
  await store.setGroupMemberRole(props.convId, m.user_id, newRole)
  m.role = newRole
}

async function saveGroupEdit() {
  savingGroup.value = true
  try {
    await store.updateGroup(props.convId, {
      name: editGroupName.value,
      avatar_url: editGroupAvatar.value || undefined,
      banner_url: editGroupBanner.value || undefined,
    })
    showEditGroup.value = false
  } catch { /* silent */ }
  finally { savingGroup.value = false }
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

// @mention rendering
const STICKER_MAP: Record<string, string> = {
  'sticker:fluffy:f1': '🐻', 'sticker:fluffy:f2': '🐨', 'sticker:fluffy:f3': '🦥',
  'sticker:fluffy:f4': '🐰', 'sticker:fluffy:f5': '🐼', 'sticker:fluffy:f6': '🦊',
  'sticker:fluffy:f7': '🐯', 'sticker:fluffy:f8': '🐻‍❄️', 'sticker:fluffy:f9': '🐕',
  'sticker:fluffy:f10': '🦝', 'sticker:fluffy:f11': '🦦', 'sticker:fluffy:f12': '🦜',
  'sticker:fursona:fu1': '🦊', 'sticker:fursona:fu2': '🐺', 'sticker:fursona:fu3': '🐲',
  'sticker:fursona:fu4': '🦄', 'sticker:fursona:fu5': '🐆', 'sticker:fursona:fu6': '😺',
  'sticker:fursona:fu7': '🐅', 'sticker:fursona:fu8': '🦈',
}
function getStickerEmoji(key: string): string { return STICKER_MAP[key] ?? '🎭' }

// Matches only emoji / ZWJ sequences / variation selectors / flag pairs / whitespace
const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}‍️\u{1F1E6}-\u{1F1FF}\s]+$/u
function isEmojiOnlyText(text: string | undefined | null): boolean {
  if (!text) return false
  const trimmed = text.trim()
  if (!trimmed || !EMOJI_ONLY_RE.test(trimmed)) return false
  const segmenter = (Intl as any).Segmenter ? new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' }) : null
  const count = segmenter ? Array.from(segmenter.segment(trimmed)).length : Array.from(trimmed).length
  return count >= 1 && count <= 3
}

const FWD_RE = /^↩️ Переслано от (.+?)\n/
// Format v2 (JSON): [story_reply:{"img":...,"exp":...,"name":...,"ava":...}]\nreply
// Format v1 (legacy pipe): [story_reply:IMAGE_URL|EXPIRES_AT|AUTHOR_NAME|AUTHOR_AVATAR]\nreply
const STORY_REPLY_RE = /^\[story_reply:(\{[\s\S]*?\}|[^\]]*)\]\n?([\s\S]*)$/u

/** Returns human-friendly short preview, stripping service tags */
function previewMsgText(text: string | undefined, maxLen = 60): string {
  if (!text) return ''
  if (/^\[story_reply:/u.test(text)) return langStore.t.chatStoryReplyPreview
  return text.replace(FWD_RE, '').slice(0, maxLen)
}

interface StoryReplyMeta {
  imageUrl: string
  expiresAt: string
  authorName: string
  authorAvatar: string
  replyText: string
  expired: boolean
}

// The template calls parseStoryReply(msg) up to a dozen times per story-reply row
// (once per v-if/attribute binding). Regex + JSON.parse on every one of those, on
// every re-render of the message list, adds up fast in long chats — so the parse
// itself is cached per message; only the cheap expiry check re-runs on each call.
const storyReplyCache = new Map<string, { fields: Omit<StoryReplyMeta, 'expired'>; forcedExpired: boolean } | null>()

function parseStoryReply(msg: Message): StoryReplyMeta | null {
  const cacheKey = `${msg.id}|${msg.text ?? ''}`
  let cached = storyReplyCache.get(cacheKey)
  if (cached === undefined) {
    cached = parseStoryReplyUncached(msg)
    storyReplyCache.set(cacheKey, cached)
  }
  if (!cached) return null
  const expired = cached.forcedExpired || (cached.fields.expiresAt ? Date.now() > new Date(cached.fields.expiresAt).getTime() : false)
  return { ...cached.fields, expired }
}

function parseStoryReplyUncached(msg: Message): { fields: Omit<StoryReplyMeta, 'expired'>; forcedExpired: boolean } | null {
  const m = (msg.text || '').match(STORY_REPLY_RE)
  if (!m) return null
  const raw = m[1]
  let imageUrl = '', expiresAt = '', authorName = '', authorAvatar = ''
  if (raw.startsWith('{')) {
    // v2 JSON format
    try {
      const j = JSON.parse(raw)
      imageUrl    = j.img  ?? ''
      expiresAt   = j.exp  ?? ''
      authorName  = j.name ?? ''
      authorAvatar = j.ava ?? ''
    } catch {
      // JSON malformed — show as expired card with fallback sender info
      return {
        fields: { imageUrl: '', expiresAt: '', authorName: msg.sender?.display_name || msg.sender?.username || '', authorAvatar: msg.sender?.avatar_url || '', replyText: '' },
        forcedExpired: true,
      }
    }
  } else {
    // v1 pipe format (legacy fallback)
    const parts = raw.split('|')
    imageUrl     = parts[0] ?? ''
    expiresAt    = parts[1] ?? ''
    authorName   = parts[2] ?? ''
    authorAvatar = parts[3] ?? ''
  }
  return { fields: { imageUrl, expiresAt, authorName, authorAvatar, replyText: m[2].trim() }, forcedExpired: false }
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

function renderMentions(text: string): string {
  if (!text) return ''
  const escaped = text.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
  return escaped.replace(/@([\w.-]+)/g, '<span class="mention-link text-brand-accent cursor-pointer hover:underline" data-username="$1">@$1</span>')
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
function formatMoney(amount: number | undefined): string {
  if (!amount && amount !== 0) return ''
  return new Intl.NumberFormat('ru-RU').format(amount) + ' ₽'
}
function isOverdue(deadline: string | undefined): boolean {
  return !!deadline && new Date(deadline).getTime() < Date.now()
}
function formatDeadline(deadline: string | undefined): string {
  if (!deadline) return ''
  return new Date(deadline).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { day: 'numeric', month: 'long' })
}
const payingId = ref<string | null>(null)
async function payOrder(msg: Message) {
  if (payingId.value) return
  payingId.value = msg.id
  try {
    await store.payRequest(msg.id)
  } catch { /* silent */ }
  payingId.value = null
}

function closePaymentModal() {
  showPaymentModal.value = false
  paymentForm.amount = ''
  paymentForm.description = ''
  paymentForm.prepaymentPercent = ''
  paymentForm.deadline = ''
}
async function submitPaymentRequest() {
  const amount = Number(paymentForm.amount)
  if (!amount || amount <= 0 || sendingPayment.value) return
  sendingPayment.value = true
  try {
    await store.sendPaymentRequest(props.convId, {
      amount,
      description: paymentForm.description.trim(),
      prepaymentPercent: paymentForm.prepaymentPercent ? Number(paymentForm.prepaymentPercent) : undefined,
      deadline: paymentForm.deadline || undefined,
    })
    closePaymentModal()
    scrollToBottom(true)
  } catch { /* silent */ }
  sendingPayment.value = false
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
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

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

function highlight(text: string): string {
  if (!searchQuery.value) return text
  const safeText = text.replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
  const escapedQuery = searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return safeText.replace(new RegExp(`(${escapedQuery})`, 'gi'), '<mark class="bg-brand-accent/30 text-white rounded px-0.5">$1</mark>')
}

function openStickerPack(url: string) {
  if (!url.startsWith('http')) return // legacy emoji sticker key — ignore
  stickerPackUrl.value = url
}

function openImageLightbox(url: string) {
  lightboxUrls.value = mediaUrls.value.length ? mediaUrls.value : [url]
  lightboxTypes.value = mediaUrls.value.length ? mediaTypes.value : []
  lightboxStart.value = Math.max(0, lightboxUrls.value.indexOf(url))
}

interface AlbumFile { url: string; type: string }
function getAlbumFiles(msg: Message): AlbumFile[] {
  const files = (msg.metadata as any)?.files
  return Array.isArray(files) ? files : []
}

function isGifUrl(url?: string | null): boolean {
  return !!url && /\.gif(\?|$)/i.test(url)
}

/** Lightbox scoped to just this album's own images (not the whole conversation's media). */
function openAlbumImageLightbox(msg: Message, url: string) {
  const imageUrls = getAlbumFiles(msg).filter((f) => f.type === 'image').map((f) => f.url)
  lightboxUrls.value = imageUrls.length ? imageUrls : [url]
  lightboxTypes.value = []
  lightboxStart.value = Math.max(0, lightboxUrls.value.indexOf(url))
}

function getDisplayText(msg: Message): string {
  const text = msg.text
  if (!text) return ''
  // Legacy messages encrypted before E2E was removed — no key to decrypt them anymore
  if (isEncrypted(text)) return langStore.t.encryptedMessagePreview
  return text
}

// ── Voice recording ─────────────────────────────────────────────────────────────
async function startRecording() {
  if (isRecording.value) return
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const chunks: Blob[] = []
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
    const mr = new MediaRecorder(stream, { mimeType })
    mediaRecorder = mr
    isRecording.value = true
    recordingSeconds.value = 0
    recordTimer = setInterval(() => { recordingSeconds.value++ }, 1000)
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    mr.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      if (recordTimer) { clearInterval(recordTimer); recordTimer = null }
      isRecording.value = false
      const blob = new Blob(chunks, { type: mimeType })
      if (blob.size < 500) return
      voiceUploading.value = true
      try {
        const ext = mimeType.includes('webm') ? 'webm' : 'ogg'
        const form = new FormData()
        form.append('file', new File([blob], `voice.${ext}`, { type: mimeType }))
        const res = await api.post('/media/upload?folder=messages', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        const url = res.data?.data?.url ?? null
        if (url && !store.checkSpamGate()) store.sendMessage(props.convId, '', url, 'voice')
      } catch {}
      finally { voiceUploading.value = false }
    }
    mr.start(100)
  } catch {
    isRecording.value = false
  }
}

function stopRecording() {
  mediaRecorder?.stop()
  mediaRecorder = null
}

function fmtRecording(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
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
function fileKind(file: File): 'image' | 'video' | 'audio' | 'file' {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'file'
}

function formatFileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} ${langStore.t.chatByteUnit}`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ${langStore.t.chatKbUnit}`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ${langStore.t.chatMbUnit}`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ${langStore.t.chatGbUnit}`
}

/** Uploads one file as its own queued attachment slot; multiple can run concurrently. */
function addPendingFile(file: File) {
  if (pendingAttachments.value.length >= MAX_ATTACHMENTS) return
  const kind = fileKind(file)
  // Must be reactive() *before* pushing — mutating a plain object kept only via this
  // outer `item` reference bypasses Vue's reactive array proxy entirely, so progress/
  // uploading/uploadedUrl updates would never trigger a re-render (stuck at 0% forever).
  const item = reactive<PendingAttachment>({
    id: ++attachSeq,
    kind,
    name: file.name,
    size: file.size,
    previewUrl: (kind === 'image' || kind === 'video') ? URL.createObjectURL(file) : null,
    uploadedUrl: null,
    uploading: true,
    progress: 0,
    failed: false,
  })
  pendingAttachments.value.push(item)

  ;(async () => {
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await api.post('/media/upload?folder=messages', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (ev: any) => {
          item.progress = ev.total ? Math.round((ev.loaded / ev.total) * 100) : 50
        },
      })
      const url = res.data?.data?.url ?? null
      if (!url) throw new Error('no url')
      // A video with no audio track behaves like a GIF — render it with the lightweight
      // autoplay/pause UI instead of the full player (seek bar, volume, speed, etc).
      if (item.kind === 'video' && res.data?.data?.isSilentVideo) item.kind = 'gif'
      item.uploadedUrl = url
      item.progress = 100
    } catch (err: any) {
      item.failed = true
      const msg = err?.response?.data?.error?.message || langStore.t.chatFileUploadFailedError
      uploadError.value = msg
      if (uploadErrorTimer) clearTimeout(uploadErrorTimer)
      uploadErrorTimer = setTimeout(() => { uploadError.value = null }, 4000)
      setTimeout(() => removePendingAttachment(item.id), 1500)
    } finally {
      item.uploading = false
    }
  })()
}

function removePendingAttachment(id: number) {
  const idx = pendingAttachments.value.findIndex((a) => a.id === id)
  if (idx === -1) return
  const [removed] = pendingAttachments.value.splice(idx, 1)
  if (removed.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(removed.previewUrl)
}

function clearAttachments() {
  for (const a of pendingAttachments.value) {
    if (a.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl)
  }
  pendingAttachments.value = []
  if (fileInputEl.value) fileInputEl.value.value = ''
}

async function onFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files?.length) return
  const room = MAX_ATTACHMENTS - pendingAttachments.value.length
  for (const file of Array.from(files).slice(0, Math.max(0, room))) addPendingFile(file)
  if (fileInputEl.value) fileInputEl.value.value = ''
}

/** Ctrl+V an image/file straight into the composer, same upload path as the attach button. */
function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  if (!files.length) return // no file on the clipboard — fall through to the browser's normal text paste
  e.preventDefault()
  const room = MAX_ATTACHMENTS - pendingAttachments.value.length
  for (const file of files.slice(0, Math.max(0, room))) addPendingFile(file)
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

// ── @mention autocomplete ─────────────────────────────────────────────────────────
function detectMention(text: string) {
  const match = text.match(/@([\w.-]*)$/)
  if (match && match[1].length >= 1) {
    const q = match[1]
    mentionQuery.value = q
    if (mentionTimer) clearTimeout(mentionTimer)
    mentionTimer = setTimeout(async () => {
      mentionLoading.value = true
      try {
        const res = await api.get(`/users/search?q=${encodeURIComponent(q)}&limit=6`)
        mentionResults.value = res.data?.data?.users ?? res.data?.data ?? []
      } catch { mentionResults.value = [] }
      finally { mentionLoading.value = false }
    }, 300)
  } else {
    closeMention()
  }
}

function closeMention() {
  mentionQuery.value = ''
  mentionResults.value = []
  if (mentionTimer) { clearTimeout(mentionTimer); mentionTimer = null }
}

function selectMention(username: string) {
  draft.value = draft.value.replace(/@[\w.-]*$/, `@${username} `)
  closeMention()
  nextTick(() => { inputEl.value?.focus() })
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

// ── Online status polling ──────────────────────────────────────────────────────
async function fetchOnlineStatus() {
  if (!props.other?.id) return
  try {
    const res = await api.get(`/users/online?ids=${props.other.id}`)
    const wasOnline = isPartnerOnline.value
    isPartnerOnline.value = !!res.data?.data?.[props.other.id]
    partnerDevice.value = res.data?.deviceData?.[props.other.id] ?? null
    if (isPartnerOnline.value) {
      partnerLastSeenAt.value = null
    } else if (wasOnline) {
      partnerLastSeenAt.value = new Date()
    } else {
      const lastSeen = res.data?.lastSeenData?.[props.other.id]
      partnerLastSeenAt.value = lastSeen ? new Date(lastSeen) : null
    }
  } catch { /* silent */ }
}

onMounted(() => {
  document.addEventListener('click', closeMenu)
  if (!props.conv?.is_group && !(isGroupDm.value && amGroupDmCustomer.value)) {
    fetchOnlineStatus()
    onlineTimer = setInterval(fetchOnlineStatus, 30_000)
    fetchBlockStatus()
  } else if (props.conv?.is_group) {
    fetchGroupMembers()
  }
})
onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
  if (onlineTimer) clearInterval(onlineTimer)
  if (recordTimer) clearInterval(recordTimer)
  if (mentionTimer) clearTimeout(mentionTimer)
  if (uploadErrorTimer) clearTimeout(uploadErrorTimer)
  for (const a of pendingAttachments.value) {
    if (a.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(a.previewUrl)
  }
  mediaRecorder?.stop()
})

watch(() => props.other?.id, () => {
  isPartnerOnline.value = false
  partnerLastSeenAt.value = null
  partnerDevice.value = null
  if (!props.conv?.is_group && !(isGroupDm.value && amGroupDmCustomer.value)) {
    fetchOnlineStatus()
    fetchBlockStatus()
  }
})

watch(() => props.convId, () => {
  groupMembers.value = []
  if (props.conv?.is_group) fetchGroupMembers()
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

watch(showEditGroup, (open) => {
  if (open && props.conv) {
    editGroupName.value   = props.conv.name ?? ''
    editGroupAvatar.value = props.conv.avatar_url ?? ''
    editGroupBanner.value = (props.conv as any).banner_url ?? ''
    fetchGroupMembers()
  }
})

// ── Translation ─────────────────────────────────────────────────────────────────
// Sequential queue prevents hammering the free API
const translateQueue: Array<() => Promise<void>> = []
let translateRunning = false

async function drainQueue() {
  if (translateRunning) return
  translateRunning = true
  while (translateQueue.length) {
    const task = translateQueue.shift()!
    await task()
  }
  translateRunning = false
}

async function translateText(text: string): Promise<string | null> {
  // Try with 'auto' source first, fall back to 'en'
  const tryFetch = async (src: string) => {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 300))}&langpair=${src}|${translateLang.value}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const data = await res.json()
    if (data?.responseStatus === 200) {
      const t = data?.responseData?.translatedText
      if (t && t.trim() && t.toLowerCase().trim() !== text.toLowerCase().trim()) return t as string
    }
    return null
  }
  try {
    return await tryFetch('auto')
  } catch {
    try { return await tryFetch('en') } catch { return null }
  }
}

function enqueueTranslation(msg: Message) {
  if (isMine(msg) || !msg.text || translations.value[msg.id] || translatingIds.has(msg.id)) return
  translatingIds.add(msg.id)
  translateQueue.push(async () => {
    try {
      const result = await translateText(msg.text!)
      if (result) {
        translations.value = { ...translations.value, [msg.id]: result }
      }
    } finally {
      translatingIds.delete(msg.id)
    }
  })
  drainQueue()
}

async function autoTranslateMissingMessages() {
  const toTranslate = msgList.value.filter(
    (m) => !isMine(m) && m.text && !translations.value[m.id] && !translatingIds.has(m.id),
  )
  for (const msg of toTranslate) enqueueTranslation(msg)
}

// Watch for new incoming messages
watch(() => msgList.value.length, (n, old) => {
  if (!translateMode.value || n <= (old ?? 0)) return
  const newMsgs = msgList.value.slice(old ?? 0)
  for (const msg of newMsgs) enqueueTranslation(msg)
})

// Re-translate when language changes
watch(translateLang, () => {
  if (!translateMode.value) return
  translations.value = {}
  autoTranslateMissingMessages()
})

// Sync translateLang when user switches app language
watch(() => langStore.currentLang, (newLang) => {
  translateLang.value = LANG_TO_API[newLang] ?? 'ru'
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
