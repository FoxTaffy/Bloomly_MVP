<template>
  <div class="flex flex-col h-full bg-transparent w-full overflow-hidden">
    <!-- Header -->
    <div v-if="!hideHeader" class="flex items-center justify-between px-4 py-3 border-b border-white/6 shrink-0">
      <h2 class="font-bold text-white text-base">{{ langStore.t.messagesPageTitle }}</h2>
      <div class="flex items-center gap-1">
        <button @click="showCreateGroup = true"
          class="p-1.5 rounded-xl hover:bg-brand-bg transition-colors text-white/55 hover:text-brand-accent"
          :title="langStore.t.createGroupBtn">
          <BIcon name="Users" class="w-4 h-4" />
        </button>
        <button @click="$emit('new-conversation')"
          class="p-1.5 rounded-xl hover:bg-brand-bg transition-colors text-white/55 hover:text-brand-accent"
          :title="langStore.t.newConvBtn">
          <BIcon name="SquarePen" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Search -->
    <div class="px-3 pt-1 pb-0 shrink-0">
      <div class="flex items-center gap-2 bg-black/20 rounded-2xl px-3 py-2 border border-white/6 focus-within:border-brand-accent/50 focus-within:bg-black/30 transition-colors">
        <BIcon name="Search" class="w-3.5 h-3.5 text-white/40 shrink-0" />
        <input v-model="search" type="text" :placeholder="langStore.t.convSearchPlaceholder"
          class="bg-transparent text-sm text-white placeholder-white/30 outline-hidden w-full" />
        <button v-if="search" @click="search = ''" class="text-white/40 hover:text-white transition-colors">
          <BIcon name="X" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- Category tabs -->
    <div v-if="!props.convFilter || props.convFilter === 'all'" class="shrink-0 px-3 pt-2.5 pb-2 overflow-x-auto">
      <div class="flex items-center gap-1 w-max bg-black/20 p-1 rounded-2xl">
        <button @click="activeCategory = 'personal'"
          :class="['flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-150',
            activeCategory === 'personal' || activeCategory === 'all' ? 'bg-brand-accent text-white shadow-md shadow-brand-accent/20' : 'text-white/50 hover:text-white/85']">
          {{ langStore.t.tabPersonal }}
          <span v-if="categoryUnreadCount('personal')"
            :class="['min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center',
              activeCategory === 'personal' || activeCategory === 'all' ? 'bg-white/25 text-white' : 'bg-brand-accent/20 text-brand-accent']">{{ categoryUnreadCount('personal') }}</span>
        </button>
        <button @click="activeCategory = 'groups'"
          :class="['flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-150',
            activeCategory === 'groups' ? 'bg-brand-accent text-white shadow-md shadow-brand-accent/20' : 'text-white/50 hover:text-white/85']">
          {{ langStore.t.tabGroups }}
          <span v-if="categoryUnreadCount('groups')"
            :class="['min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center',
              activeCategory === 'groups' ? 'bg-white/25 text-white' : 'bg-brand-accent/20 text-brand-accent']">{{ categoryUnreadCount('groups') }}</span>
        </button>
        <button @click="activeCategory = 'community'"
          :class="['flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-150',
            activeCategory === 'community' ? 'bg-brand-accent text-white shadow-md shadow-brand-accent/20' : 'text-white/50 hover:text-white/85']">
          {{ langStore.t.tabCommunity }}
          <span v-if="categoryUnreadCount('community')"
            :class="['min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center',
              activeCategory === 'community' ? 'bg-white/25 text-white' : 'bg-brand-accent/20 text-brand-accent']">{{ categoryUnreadCount('community') }}</span>
        </button>
        <button @click="unreadOnly = !unreadOnly"
          :class="['flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-150',
            unreadOnly ? 'bg-brand-pink/20 text-brand-pink' : 'text-white/40 hover:text-white/80']"
          :title="langStore.t.unreadOnlyLabel">
          <BIcon name="Mail" class="w-3.5 h-3.5" />
        </button>
      </div>
    </div>

    <!-- List -->
    <div class="flex-1 overflow-y-auto min-h-0" @click="menuConvId = null; muteMenuFor = null; muteDurationPickerFor = null">

      <!-- ═══ Conversations (personal / groups / community / customer) tabs ═══ -->
        <template v-if="store.loading">
          <div v-for="i in 5" :key="i" class="flex items-center gap-3 px-3 py-3">
            <div class="w-10 h-10 rounded-full bg-brand-border animate-pulse shrink-0" />
            <div class="flex-1 stack-y-2">
              <div class="h-3 bg-brand-border rounded-full animate-pulse w-28" />
              <div class="h-2.5 bg-brand-border rounded-full animate-pulse w-40" />
            </div>
          </div>
        </template>
        <div v-else-if="!filtered.length && activeCategory === 'community'" class="flex flex-col items-center justify-center h-40 text-white/55 text-sm gap-2">
          <div class="w-14 h-14 rounded-2xl bg-linear-to-br/srgb from-brand-accent/20 to-brand-accent/5 border border-brand-accent/20 flex items-center justify-center mb-1">
            <BIcon name="Globe" class="w-6 h-6 text-brand-accent/60" />
          </div>
          <span>{{ langStore.t.convNoGroups }}</span>
          <button @click="router.push('/groups')" class="text-brand-accent text-xs hover:underline mt-1">{{ langStore.t.findGroupsLink }}</button>
        </div>
        <div v-else-if="!filtered.length" class="flex flex-col items-center justify-center h-40 text-white/55 text-sm gap-2">
          <div class="w-14 h-14 rounded-2xl bg-linear-to-br/srgb from-brand-accent/20 to-brand-accent/5 border border-brand-accent/20 flex items-center justify-center mb-1">
            <BIcon name="MessageCircle" class="w-6 h-6 text-brand-accent/60" />
          </div>
          <span>{{ search ? langStore.t.convNothingFound : langStore.t.emptyNoConvs }}</span>
        </div>
        <button v-for="conv in filtered" :key="conv.id"
        :class="['w-[calc(100%-12px)] mx-1.5 mb-0.5 flex items-center gap-3 px-2.5 py-2.5 rounded-2xl transition-all duration-200 text-left relative group/conv',
          activeId === conv.id ? 'bg-brand-accent/15 ring-1 ring-brand-accent/25' : 'hover:bg-white/4']"
        @click="$emit('select', conv.id)">
        <!-- Customer badge -->
        <div v-if="conv.my_participant?.label === 'customer'"
          class="absolute top-2 right-24 flex items-center gap-0.5 bg-linear-to-r/srgb from-brand-purple/20 to-brand-pink/20 border border-brand-pink/40 rounded-full px-1.5 py-0.5 pointer-events-none">
          <BIcon name="Briefcase" class="w-2.5 h-2.5 text-brand-pink" />
          <span class="text-[9px] font-bold text-brand-pink">{{ langStore.t.tabOrders }}</span>
        </div>
        <!-- Avatar -->
        <div class="relative shrink-0">
          <!-- Group DM (personal thread with a group): the group's own avatar/globe fallback -->
          <template v-if="conv.type === 'community'">
            <img v-if="conv.avatar_url" :src="conv.avatar_url" :alt="conv.name ?? 'Группа'"
              class="w-11 h-11 rounded-xl object-cover ring-2 ring-brand-border group-hover/conv:ring-brand-accent/40 transition-all" @error="onAvatarError" />
            <div v-else class="w-11 h-11 rounded-xl bg-linear-to-br/srgb from-brand-accent/25 to-brand-accent/10 ring-2 ring-brand-accent/30 flex items-center justify-center">
              <BIcon name="Globe" class="w-5 h-5 text-brand-accent" />
            </div>
          </template>
          <!-- Group: 2x2 grid or custom avatar -->
          <template v-else-if="conv.is_group">
            <img v-if="conv.avatar_url" :src="conv.avatar_url" :alt="conv.name ?? langStore.t.tabCommunity"
              class="w-11 h-11 rounded-xl object-cover ring-2 ring-brand-border group-hover/conv:ring-brand-accent/40 transition-all" @error="onAvatarError" />
            <div v-else class="grid grid-cols-2 gap-px w-11 h-11 rounded-xl overflow-hidden ring-2 ring-brand-border group-hover/conv:ring-brand-accent/40 transition-all bg-brand-bg">
              <template v-for="(p, idx) in conv.other_participants.slice(0, 4)" :key="p.user_id">
                <img v-if="p.user?.avatar_url" :src="p.user.avatar_url" class="w-full h-full object-cover" @error="onAvatarError" />
                <div v-else class="w-full h-full flex items-center justify-center bg-brand-accent/20 text-brand-accent text-[8px] font-bold">
                  {{ (p.user?.display_name || p.user?.username || '?')[0].toUpperCase() }}
                </div>
              </template>
              <div v-for="i in Math.max(0, 4 - conv.other_participants.length)" :key="`e${i}`" class="w-full h-full bg-brand-border/30" />
            </div>
          </template>
          <!-- DM / Notes -->
          <template v-else>
            <!-- Notes: self-DM (no other participants) -->
            <template v-if="isNotes(conv)">
              <div class="w-11 h-11 rounded-full bg-linear-to-br/srgb from-brand-accent/25 to-brand-accent/10 ring-2 ring-brand-accent/30 flex items-center justify-center">
                <BIcon name="StickyNote" class="w-5 h-5 text-brand-accent" />
              </div>
            </template>
            <template v-else>
              <img v-if="getOther(conv)?.avatar_url" :src="getOther(conv)!.avatar_url!" :alt="getOther(conv)?.username"
                class="w-11 h-11 rounded-full object-cover ring-2 ring-white/10 group-hover/conv:ring-brand-accent/40 transition-all" @error="onAvatarError" />
              <div v-else class="w-11 h-11 rounded-full bg-linear-to-br/srgb from-brand-accent/30 to-brand-accent/10 ring-2 ring-white/10 group-hover/conv:ring-brand-accent/40 transition-all flex items-center justify-center text-brand-accent font-bold text-sm">
                {{ (getOther(conv)?.display_name || getOther(conv)?.username || '?')[0].toUpperCase() }}
              </div>
              <span
                v-if="isConvOnline(conv)"
                class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-brand-success border-2 border-brand-card shadow-[0_0_8px_rgba(102,199,112,0.7)]"
              />
            </template>
          </template>
        </div>
        <!-- Text -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1">
            <div class="flex items-center gap-1.5 min-w-0">
              <span :class="['font-semibold text-sm truncate', isUnread(conv) ? 'text-white' : 'text-brand-offwhite/80']">
                  {{ conv.type === 'community' ? (conv.name || 'Группа') : conv.is_group ? (conv.name || langStore.t.tabGroups) : isNotes(conv) ? langStore.t.notesBtn : (getOther(conv)?.display_name || getOther(conv)?.username || '?') }}
              </span>
              <UserBadges v-if="conv.type !== 'community' && !conv.is_group && !isNotes(conv)" :user="getOther(conv) as any" />
              <BIcon v-if="conv.type === 'community'" name="Globe" class="w-3 h-3 text-white/55 shrink-0" />
              <BIcon v-else-if="conv.is_group" name="Users" class="w-3 h-3 text-white/55 shrink-0" />
              <span v-if="conv.type !== 'community' && !conv.is_group && (getOther(conv) as any)?.deceased_at" title="Светлая память" class="shrink-0">🪦</span>
            </div>
            <span class="flex items-center gap-1 shrink-0">
              <BIcon v-if="store.isConvMuted(conv)" name="BellOff" class="w-3 h-3 text-white/35" title="Уведомления выключены" />
              <BIcon v-else-if="conv.my_participant?.sound_muted" name="VolumeX" class="w-3 h-3 text-white/35" title="Звук выключен" />
              <span class="text-[10px] text-white/45 tabular-nums">{{ formatTime(conv.last_message?.created_at || conv.updated_at) }}</span>
            </span>
          </div>
          <div class="flex items-center justify-between gap-2 mt-0.5">
            <p v-if="isConvTyping(conv)" class="text-xs truncate flex items-center gap-1 min-w-0 text-brand-accent font-medium italic">
              <span class="inline-flex gap-0.5">
                <span class="w-1 h-1 rounded-full bg-brand-accent animate-bounce [animation-delay:-0.3s]" />
                <span class="w-1 h-1 rounded-full bg-brand-accent animate-bounce [animation-delay:-0.15s]" />
                <span class="w-1 h-1 rounded-full bg-brand-accent animate-bounce" />
              </span>
              {{ langStore.t.chatTypingIndicator }}
            </p>
            <p v-else :class="['text-xs truncate flex items-center gap-1 min-w-0', isUnread(conv) ? 'text-brand-offwhite/80 font-medium' : 'text-white/45']">
              <BIcon v-if="conv.type !== 'community' && !conv.is_group && conv.last_message?.sender_id === auth.user?.id"
                :name="isLastReadByOther(conv) ? 'CheckCheck' : 'Check'"
                :class="['w-3.5 h-3.5 shrink-0', isLastReadByOther(conv) ? 'text-brand-accent' : 'text-white/40']" />
              <span class="truncate">
                <template v-if="conv.is_group && conv.last_message">
                  <span class="text-brand-accent/80">{{ conv.last_message.sender?.display_name || conv.last_message.sender?.username }}: </span>
                </template>
                <template v-else-if="!conv.is_group && conv.last_message?.sender_id === auth.user?.id">
                  <span class="text-white/40">{{ langStore.t.youPrefix }} </span>
                </template>
                {{ lastMessagePreview(conv.last_message) }}
              </span>
            </p>
            <!-- Unread count pill -->
            <span v-if="conv.unread_count"
              class="shrink-0 min-w-[18px] h-[18px] px-1.5 rounded-full bg-brand-accent text-white text-[10px] font-bold flex items-center justify-center">
              {{ conv.unread_count > 99 ? '99+' : conv.unread_count }}
            </span>
          </div>
        </div>
        <!-- Context menu trigger -->
        <div class="relative shrink-0 opacity-0 group-hover/conv:opacity-100 transition-opacity" @click.stop>
          <button @click.stop="menuConvId = menuConvId === conv.id ? null : conv.id; muteMenuFor = null; muteDurationPickerFor = null"
            class="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors">
            <BIcon name="MoreVertical" class="w-3.5 h-3.5" />
          </button>
          <!-- Dropdown -->
          <div v-if="menuConvId === conv.id"
            class="absolute right-0 top-8 z-50 bg-brand-card border border-brand-border rounded-2xl shadow-2xl py-1.5 w-56 overflow-hidden"
            @click.stop>

            <!-- Group-specific items -->
            <template v-if="conv.is_group || conv.type === 'community'">
              <button v-if="conv.group_id"
                @click.stop="router.push('/groups/' + conv.group_id); menuConvId = null"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                <BIcon name="Users2" class="w-4 h-4 text-white/55 shrink-0" />
                {{ langStore.t.contextGoToGroup }}
              </button>
              <div class="border-t border-brand-border my-1" />
            </template>

            <!-- DM-specific -->
            <router-link v-if="conv.type !== 'community' && !conv.is_group && getOther(conv)?.username"
              :to="'/profile/' + getOther(conv)!.username" @click.stop="menuConvId = null"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
              <BIcon name="User" class="w-4 h-4 text-white/55 shrink-0" />
              {{ langStore.t.contextProfile }}
            </router-link>

            <button
              @click.stop="setLabel(conv, conv.my_participant?.label === 'customer' ? 'default' : 'customer')"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-brand-bg transition-colors text-left"
              :class="conv.my_participant?.label === 'customer' ? 'text-brand-accent' : 'text-brand-offwhite'">
              <BIcon :name="conv.my_participant?.label === 'customer' ? 'BriefcaseOff' : 'Briefcase'" class="w-4 h-4 text-white/55 shrink-0" />
              {{ conv.my_participant?.label === 'customer' ? langStore.t.removeLabelOrder : langStore.t.setLabelOrder }}
            </button>

            <button
              @click.stop="toggleArchive(conv); menuConvId = null"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
              <BIcon :name="conv.my_participant?.archived ? 'ArchiveX' : 'Archive'" class="w-4 h-4 text-white/55 shrink-0" />
              {{ conv.my_participant?.archived ? langStore.t.contextUnarchive : langStore.t.contextArchive }}
            </button>

            <div class="border-t border-brand-border my-1" />

            <!-- Notifications (mute) -->
            <template v-if="muteDurationPickerFor === conv.id">
              <button v-for="d in MUTE_DURATIONS" :key="d.label" @click.stop="muteFor(conv, d.ms)"
                class="w-full flex items-center gap-3 pl-9 pr-4 py-2 text-sm text-white/70 hover:bg-brand-bg transition-colors text-left">
                {{ d.label }}
              </button>
              <button @click.stop="muteDurationPickerFor = null"
                class="w-full flex items-center gap-3 pl-9 pr-4 py-2 text-xs text-white/40 hover:bg-brand-bg transition-colors text-left">
                Отмена
              </button>
            </template>
            <template v-else-if="muteMenuFor === conv.id">
              <button v-if="store.isConvMuted(conv)" @click.stop="unmute(conv)"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                <BIcon name="Bell" class="w-4 h-4 text-white/55 shrink-0" /> Включить уведомления
              </button>
              <template v-else>
                <button @click.stop="toggleSoundMute(conv)"
                  class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                  <BIcon :name="conv.my_participant?.sound_muted ? 'Volume2' : 'VolumeX'" class="w-4 h-4 text-white/55 shrink-0" />
                  {{ conv.my_participant?.sound_muted ? 'Включить звук' : 'Выключить звук' }}
                </button>
                <button @click.stop="muteFor(conv, 4 * 3600_000)"
                  class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                  <BIcon name="BellOff" class="w-4 h-4 text-white/55 shrink-0" /> Выключить на 4 часа
                </button>
                <button @click.stop="muteDurationPickerFor = conv.id"
                  class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                  <BIcon name="Clock" class="w-4 h-4 text-white/55 shrink-0" /> Выключить на время…
                </button>
                <button @click.stop="muteForever(conv)"
                  class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-error hover:bg-brand-error/8 transition-colors text-left">
                  <BIcon name="BellOff" class="w-4 h-4 shrink-0" /> Выключить уведомления
                </button>
              </template>
            </template>
            <button v-else @click.stop="muteMenuFor = conv.id"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
              <BIcon :name="store.isConvMuted(conv) ? 'BellOff' : 'Bell'" class="w-4 h-4 text-white/55 shrink-0" /> Уведомления
            </button>

            <div class="border-t border-brand-border my-1" />

            <button
              @click.stop="deleteConvTarget = conv; menuConvId = null"
              class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-error hover:bg-brand-error/8 transition-colors text-left">
              <BIcon name="Trash2" class="w-4 h-4 shrink-0" />
              {{ conv.is_group ? langStore.t.contextLeaveGroup : langStore.t.contextDeleteConv }}
            </button>
          </div>
        </div>
      </button>
    </div>

    <!-- Notes + Archive bar (hidden on groups-only tab) -->
    <div v-if="props.convFilter !== 'groups'" class="shrink-0 border-t border-white/6 px-2 py-1.5 flex items-center gap-1 bg-black/10">
      <button @click="openNotes"
        class="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-left hover:bg-brand-bg transition-colors group">
        <div class="w-7 h-7 rounded-full bg-brand-accent/15 flex items-center justify-center shrink-0">
          <BIcon name="StickyNote" class="w-3.5 h-3.5 text-brand-accent" />
        </div>
        <span class="text-sm text-brand-offwhite/80 group-hover:text-white transition-colors truncate">{{ langStore.t.notesBtn }}</span>
      </button>
      <button @click="showArchived = !showArchived"
        :class="['flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-brand-bg transition-colors group', showArchived ? 'bg-brand-bg' : '']">
        <BIcon name="Archive" :class="['w-4 h-4 transition-colors', showArchived ? 'text-brand-accent' : 'text-white/55 group-hover:text-white']" />
        <span :class="['text-sm transition-colors', showArchived ? 'text-brand-accent' : 'text-white/55 group-hover:text-white']">{{ langStore.t.archiveBtn }}</span>
        <span v-if="archivedCount" class="ml-0.5 text-[10px] bg-brand-accent/20 text-brand-accent rounded-full px-1.5 py-0.5 font-semibold">{{ archivedCount }}</span>
      </button>
      <button @click="showCreateGroup = true"
        class="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-white/55 hover:text-brand-accent hover:bg-brand-bg transition-colors"
        :title="langStore.t.createGroupBtn">
        <BIcon name="Plus" class="w-4 h-4" />
      </button>
    </div>

    <!-- Create Group Modal (beautiful 2-step) -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showCreateGroup" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" @click.self="closeCreateGroup">
          <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden" style="max-height:94vh">

            <!-- ── Step indicator bar ── -->
            <div class="relative shrink-0">
              <!-- Progress line -->
              <div class="h-[3px] bg-brand-bg">
                <div class="h-full bg-brand-accent transition-all duration-500 ease-in-out" :style="`width:${createStep === 1 ? 50 : 100}%`" />
              </div>
              <!-- Header row -->
              <div class="flex items-center justify-between px-5 py-4">
                <div>
                  <p class="text-[11px] text-brand-accent font-bold uppercase tracking-widest mb-0.5">
                    Шаг {{ createStep }} из 2
                  </p>
                  <h3 class="text-base font-bold text-white">
                    {{ createStep === 1 ? langStore.t.createStep1Title : langStore.t.createStep2Title }}
                  </h3>
                </div>
                <button @click="closeCreateGroup" class="w-8 h-8 rounded-xl bg-brand-bg/60 flex items-center justify-center text-white/55 hover:text-white hover:bg-brand-bg transition-all">
                  <BIcon name="X" class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- ── Step 1: Visual setup ── -->
            <Transition name="slide-step" mode="out-in">
              <div v-if="createStep === 1" key="step1" class="flex-1 overflow-y-auto min-h-0">

                <!-- Banner -->
                <div class="relative w-full h-36 cursor-pointer group" @click="cgBannerRef?.click()">
                  <div class="absolute inset-0 bg-linear-to-br/srgb from-brand-accent/25 via-purple-900/35 to-brand-bg overflow-hidden">
                    <img v-if="cgBanner" :src="cgBanner" class="w-full h-full object-cover" />
                  </div>
                  <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/25">
                    <div class="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-xl text-xs text-white backdrop-blur-xs">
                      <BIcon name="Image" class="w-3.5 h-3.5" />
                      {{ cgBanner ? langStore.t.changeBanner : langStore.t.addBanner }}
                    </div>
                  </div>
                  <span v-if="uploadingCgBanner" class="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span class="w-7 h-7 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
                  </span>
                </div>
                <input ref="cgBannerRef" type="file" accept="image/*" class="sr-only" @change="onCgBannerChange" />
                <input ref="cgAvatarRef" type="file" accept="image/*" class="sr-only" @change="onCgAvatarChange" />

                <!-- Avatar centred over banner -->
                <div class="flex flex-col items-center -mt-9 mb-4 px-5">
                  <div class="relative cursor-pointer group mb-2" @click="cgAvatarRef?.click()">
                    <div class="w-[72px] h-[72px] rounded-3xl border-[3px] border-brand-card bg-brand-bg overflow-hidden shadow-2xl">
                      <img v-if="cgAvatar" :src="cgAvatar" class="w-full h-full object-cover" />
                      <div v-else class="w-full h-full flex flex-col items-center justify-center gap-1 text-brand-accent/50 group-hover:text-brand-accent transition-colors">
                        <BIcon name="Camera" class="w-7 h-7" />
                        <span class="text-[8px] font-bold">{{ langStore.t.photoLabel }}</span>
                      </div>
                    </div>
                    <div class="absolute inset-0 rounded-3xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <BIcon name="Camera" class="w-5 h-5 text-white" />
                    </div>
                    <span v-if="uploadingCgAvatar" class="absolute inset-0 rounded-3xl bg-black/60 flex items-center justify-center">
                      <span class="w-5 h-5 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
                    </span>
                  </div>

                  <!-- Quick remove links -->
                  <div class="flex gap-3">
                    <button v-if="cgAvatar" @click="cgAvatar = ''" class="text-[11px] text-brand-error hover:underline">{{ langStore.t.removePhoto }}</button>
                    <button v-if="cgBanner" @click="cgBanner = ''" class="text-[11px] text-white/40 hover:text-white/60 hover:underline">{{ langStore.t.removeBanner }}</button>
                  </div>
                </div>

                <!-- Name field -->
                <div class="px-5 pb-5">
                  <div class="bg-brand-bg rounded-2xl px-4 py-3 border border-brand-border/60 focus-within:border-brand-accent/50 transition-colors">
                    <label class="block text-[10px] text-brand-accent font-bold uppercase tracking-widest mb-1.5">{{ langStore.t.groupNameLabel }}</label>
                    <input v-model="groupName" type="text" maxlength="100" :placeholder="langStore.t.groupNamePlaceholder"
                      class="w-full bg-transparent text-sm text-white placeholder-white/25 outline-hidden" />
                  </div>
                  <p class="text-[10px] text-white/30 mt-2 px-1">{{ langStore.t.groupNameHint }}</p>
                </div>
              </div>

              <!-- ── Step 2: Add participants ── -->
              <div v-else key="step2" class="flex-1 overflow-y-auto min-h-0 p-5 stack-y-3">
                <!-- Selected chips -->
                <div v-if="selectedUsers.length" class="flex flex-wrap gap-1.5">
                  <div v-for="u in selectedUsers" :key="u.id"
                    class="flex items-center gap-1.5 bg-brand-accent/10 border border-brand-accent/25 rounded-full pl-0.5 pr-2.5 py-0.5">
                    <img v-if="u.avatar_url" :src="u.avatar_url" class="w-6 h-6 rounded-full object-cover" @error="onAvatarError" />
                    <div v-else class="w-6 h-6 rounded-full bg-brand-accent/30 flex items-center justify-center text-brand-accent text-[9px] font-bold">
                      {{ (u.display_name || u.username || '?')[0].toUpperCase() }}
                    </div>
                    <span class="text-xs text-white font-medium">{{ u.display_name || u.username }}</span>
                    <button @click="removeUser(u.id)" class="text-white/30 hover:text-brand-error transition-colors">
                      <BIcon name="X" class="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <!-- Search input -->
                <div class="flex items-center gap-2 bg-brand-bg border border-brand-border rounded-2xl px-3 py-2.5 focus-within:border-brand-accent/50 transition-colors">
                  <BIcon name="Search" class="w-3.5 h-3.5 text-white/45 shrink-0" />
                  <input v-model="userSearch" type="text" :placeholder="langStore.t.userSearchPlaceholder"
                    class="bg-transparent text-sm text-white placeholder-white/30 outline-hidden w-full" @input="searchUsers" />
                  <button v-if="userSearch" @click="userSearch = ''; searchResults = []" class="text-white/30 hover:text-white">
                    <BIcon name="X" class="w-3.5 h-3.5" />
                  </button>
                </div>

                <!-- Search results -->
                <div v-if="searchResults.length" class="stack-y-0.5">
                  <button v-for="u in searchResults" :key="u.id" @click="toggleUser(u)"
                    class="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-brand-bg transition-colors text-left">
                    <div class="relative shrink-0">
                      <img v-if="u.avatar_url" :src="u.avatar_url" class="w-9 h-9 rounded-full object-cover" @error="onAvatarError" />
                      <div v-else class="w-9 h-9 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-bold">
                        {{ (u.display_name || u.username || '?')[0].toUpperCase() }}
                      </div>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-white font-semibold truncate leading-tight">{{ u.display_name || u.username }}</p>
                      <p class="text-xs text-white/40 truncate">@{{ u.username }}</p>
                    </div>
                    <!-- Checkbox -->
                    <div :class="['w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                      isSelected(u.id) ? 'bg-brand-accent border-brand-accent' : 'border-brand-border hover:border-brand-accent/50']">
                      <BIcon v-if="isSelected(u.id)" name="Check" class="w-3 h-3 text-white" />
                    </div>
                  </button>
                </div>

                <!-- Tip -->
                <p v-if="!searchResults.length && !userSearch" class="text-center text-xs text-white/30 py-4">
                  {{ langStore.t.minParticipantsHint }}
                </p>
              </div>
            </Transition>

            <!-- ── Footer ── -->
            <div class="flex items-center gap-2.5 px-5 py-4 border-t border-brand-border shrink-0">
              <button
                @click="createStep === 1 ? closeCreateGroup() : (createStep = 1)"
                class="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl border border-brand-border text-sm text-white/55 hover:text-white hover:bg-brand-bg/60 transition-all">
                <BIcon v-if="createStep === 2" name="ChevronLeft" class="w-3.5 h-3.5" />
                {{ createStep === 1 ? langStore.t.cancelBtn : langStore.t.backBtn }}
              </button>

              <button
                v-if="createStep === 1"
                @click="createStep = 2"
                :disabled="!groupName.trim()"
                class="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-brand-accent text-white text-sm font-bold hover:bg-brand-accent-plus disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-brand-accent/20">
                {{ langStore.t.nextBtn }}
                <BIcon name="ChevronRight" class="w-3.5 h-3.5" />
              </button>
              <button
                v-else
                @click="createGroup"
                :disabled="!canCreate || creating"
                class="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-brand-accent text-white text-sm font-bold hover:bg-brand-accent-plus disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-brand-accent/20">
                <BIcon v-if="creating" name="Loader2" class="w-4 h-4 animate-spin" />
                {{ creating ? langStore.t.creatingBtn : langStore.t.createGroupBtn }}
              </button>
            </div>

          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Delete / Leave confirmation modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="deleteConvTarget" class="fixed inset-0 z-200 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" @click.self="deleteConvTarget = null">
          <div class="bg-brand-card border border-brand-border rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div class="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-brand-border">
              <div class="w-8 h-8 rounded-xl bg-brand-error/15 border border-brand-error/20 flex items-center justify-center shrink-0">
                <BIcon name="Trash2" class="w-4 h-4 text-brand-error" />
              </div>
              <div class="flex-1">
                <h3 class="font-bold text-white text-sm">{{ deleteConvTarget.is_group ? langStore.t.contextLeaveGroup : langStore.t.contextDeleteConv }}</h3>
                <p class="text-[11px] text-white/55">{{ deleteConvTarget.is_group ? langStore.t.leaveGroupHint : langStore.t.deleteConvChooseHint }}</p>
              </div>
              <button @click="deleteConvTarget = null" class="p-1.5 rounded-xl text-white/55 hover:text-white hover:bg-white/8 transition-all">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>
            <template v-if="!deleteConvTarget.is_group">
              <div class="flex flex-col gap-2 px-5 pt-4">
                <button @click="confirmDelete('me')"
                  class="w-full px-4 py-2.5 rounded-xl text-sm font-medium bg-brand-bg border border-brand-border text-brand-offwhite hover:border-brand-accent/50 hover:text-white transition-all text-left">
                  {{ langStore.t.deleteOnlyMeTitle }}
                  <span class="block text-xs text-white/55 font-normal">{{ langStore.t.deleteOnlyMeHint }}</span>
                </button>
                <button @click="confirmDelete('all')"
                  class="w-full px-4 py-2.5 rounded-xl text-sm font-medium bg-brand-error/10 border border-brand-error/30 text-brand-error hover:bg-brand-error/20 transition-all text-left">
                  {{ langStore.t.deleteForAllTitle }}
                  <span class="block text-xs opacity-70 font-normal">{{ langStore.t.deleteForAllHint }}</span>
                </button>
              </div>
              <div class="px-5 py-4">
                <button @click="deleteConvTarget = null" class="w-full py-2 rounded-xl text-sm text-white/55 hover:text-white hover:bg-brand-bg/50 transition-colors">
                  {{ langStore.t.cancelBtn }}
                </button>
              </div>
            </template>
            <div v-else class="flex gap-2 px-5 py-4">
              <button @click="deleteConvTarget = null" class="flex-1 py-2 rounded-xl border border-brand-border text-sm text-white/55 hover:text-white hover:bg-brand-bg/50 transition-colors">
                {{ langStore.t.cancelBtn }}
              </button>
              <button @click="confirmDelete('me')" class="flex-1 py-2 rounded-xl bg-brand-error/10 border border-brand-error/30 text-brand-error text-sm font-semibold hover:bg-brand-error/20 transition-all">
                {{ langStore.t.leaveBtn }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useLangStore } from '@/stores/lang'
import { onAvatarError } from '@/composables/useAvatarFallback'
const langStore = useLangStore()
import { useRouter } from 'vue-router'
import { useMessagesStore, type Conversation, type MsgSender } from '@/stores/messages'
import { useAuthStore } from '@/stores/auth'
import { useGroupsStore } from '@/stores/groups'
import BIcon from '@/components/BIcon.vue'
import UserBadges from '@/components/UserBadges.vue'
import api from '@/api'
import { compressImageForUpload } from '@/lib/utils'
import { isEncrypted } from '@/lib/e2e'

const props = defineProps<{
  activeId: string | null
  hideHeader?: boolean
  convFilter?: 'all' | 'personal' | 'groups'
}>()
const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'new-conversation'): void
}>()

const store = useMessagesStore()
const auth  = useAuthStore()
const groupsStore = useGroupsStore()
const router = useRouter()
const search = ref('')
const activeCategory = ref<'all' | 'personal' | 'groups' | 'community' | 'customer'>('personal')
const showArchived = ref(false)
const unreadOnly = ref(false)

// Открыли чат группы (например, по заявке на лот) — переключаемся на вкладку «Группы», чтобы он был виден в списке
watch(() => store.activeId, (id) => {
  const c = id ? store.conversations.find(x => x.id === id) : null
  if (c?.type === 'community' && activeCategory.value !== 'community') activeCategory.value = 'community'
})

// Auto-load groups when community tab is activated
// Context menu for labeling
const menuConvId = ref<string | null>(null)

// Notifications (mute) submenu
const muteMenuFor = ref<string | null>(null)
const muteDurationPickerFor = ref<string | null>(null)
const MUTE_DURATIONS = [
  { label: '1 час', ms: 3_600_000 },
  { label: '8 часов', ms: 8 * 3_600_000 },
  { label: '1 день', ms: 24 * 3_600_000 },
  { label: '1 неделя', ms: 7 * 24 * 3_600_000 },
]
async function toggleSoundMute(conv: Conversation) {
  await store.setMute(conv.id, { soundMuted: !conv.my_participant?.sound_muted })
  menuConvId.value = null; muteMenuFor.value = null
}
async function muteFor(conv: Conversation, ms: number) {
  await store.setMute(conv.id, { mutedUntil: new Date(Date.now() + ms).toISOString() })
  menuConvId.value = null; muteMenuFor.value = null; muteDurationPickerFor.value = null
}
async function muteForever(conv: Conversation) {
  await store.setMute(conv.id, { mutedUntil: new Date('9999-01-01').toISOString() })
  menuConvId.value = null; muteMenuFor.value = null
}
async function unmute(conv: Conversation) {
  await store.setMute(conv.id, { mutedUntil: null, soundMuted: false })
  menuConvId.value = null; muteMenuFor.value = null
}

// Delete / leave confirm
const deleteConvTarget = ref<Conversation | null>(null)

async function confirmDelete(scope: 'me' | 'all') {
  if (!deleteConvTarget.value) return
  const conv = deleteConvTarget.value
  deleteConvTarget.value = null
  try {
    await store.deleteConversation(conv.id, scope)
    if (store.activeId === conv.id) store.closeConversation()
  } catch { /* silent */ }
}

// ── Notes (DM with self) ──────────────────────────────────────────────────
async function openNotes() {
  if (!auth.user) return
  try {
    const convId = await store.openConversation(auth.user.id)
    emit('select', convId)
  } catch { /* silent */ }
}

const archivedCount = computed(() => store.conversations.filter((c) => c.my_participant?.archived).length)

// ── Create group ─────────────────────────────────────────────────────────
const showCreateGroup = ref(false)
const createStep = ref(1)
const groupName = ref('')
const cgAvatar = ref('')
const cgBanner = ref('')
const cgAvatarRef = ref<HTMLInputElement | null>(null)
const cgBannerRef = ref<HTMLInputElement | null>(null)
const uploadingCgAvatar = ref(false)
const uploadingCgBanner = ref(false)
const userSearch = ref('')
const searchResults = ref<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([])
const selectedUsers = ref<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([])
const creating = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

function closeCreateGroup() {
  showCreateGroup.value = false
  createStep.value = 1
  groupName.value = ''
  cgAvatar.value = ''
  cgBanner.value = ''
  userSearch.value = ''
  searchResults.value = []
  selectedUsers.value = []
}

async function onCgAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingCgAvatar.value = true
  try {
    const fd = new FormData()
    const compressed = await compressImageForUpload(file)
    fd.append('file', compressed, compressed.name)
    const res = await api.post('/media/upload?folder=avatars', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    cgAvatar.value = res.data.data.url
  } catch { /* silent */ }
  finally { uploadingCgAvatar.value = false; if (cgAvatarRef.value) cgAvatarRef.value.value = '' }
}

async function onCgBannerChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingCgBanner.value = true
  try {
    const fd = new FormData()
    const compressed = await compressImageForUpload(file)
    fd.append('file', compressed, compressed.name)
    const res = await api.post('/media/upload?folder=banners', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    cgBanner.value = res.data.data.url
  } catch { /* silent */ }
  finally { uploadingCgBanner.value = false; if (cgBannerRef.value) cgBannerRef.value.value = '' }
}

async function searchUsers() {
  const q = userSearch.value.trim()
  if (q.length < 1) { searchResults.value = []; return }
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    try {
      const res = await api.get(`/users/search?q=${encodeURIComponent(q)}&limit=8`)
      const all = res.data?.data?.users ?? res.data?.data ?? []
      searchResults.value = all.filter((u: any) => u.id !== auth.user?.id)
    } catch { searchResults.value = [] }
  }, 300)
}

function isSelected(userId: string) { return selectedUsers.value.some((u) => u.id === userId) }
function toggleUser(u: typeof searchResults.value[0]) {
  isSelected(u.id) ? removeUser(u.id) : selectedUsers.value.push(u)
}
function removeUser(userId: string) {
  selectedUsers.value = selectedUsers.value.filter((u) => u.id !== userId)
}
const canCreate = computed(() => groupName.value.trim().length > 0 && selectedUsers.value.length >= 2)

async function createGroup() {
  if (!canCreate.value || creating.value) return
  creating.value = true
  try {
    const convId = await store.createGroup(
      groupName.value,
      selectedUsers.value.map((u) => u.id),
      { avatar_url: cgAvatar.value || undefined, banner_url: cgBanner.value || undefined },
    )
    emit('select', convId)
    closeCreateGroup()
  } catch { /* silent */ }
  finally { creating.value = false }
}

// ── Filters ───────────────────────────────────────────────────────────────
const filtered = computed(() => {
  // Hide self-DM (Notes) from main list — but show them in archive view
  let list = store.conversations.filter((c) => showArchived.value || !isNotes(c))

  if (!showArchived.value) {
    list = list.filter((c) => !c.my_participant?.archived)
  } else {
    list = list.filter((c) => c.my_participant?.archived)
  }
  // External filter from parent tab takes priority
  const cat = props.convFilter && props.convFilter !== 'all' ? props.convFilter : activeCategory.value
  if (cat === 'personal' || cat === 'all') list = list.filter((c) => !c.is_group && c.type !== 'community')
  else if (cat === 'groups')    list = list.filter((c) => c.is_group && c.type !== 'community')
  else if (cat === 'community') list = list.filter((c) => c.type === 'community')
  else if (cat === 'customer')  list = list.filter((c) => c.my_participant?.label === 'customer')
  if (unreadOnly.value) list = list.filter((c) => isUnread(c))
  const q = search.value.toLowerCase()
  if (!q) return list
  return list.filter((c) => {
    if (c.is_group || c.type === 'community') return c.name?.toLowerCase().includes(q) || c.last_message?.text?.toLowerCase().includes(q)
    const o = getOther(c)
    return o?.username?.toLowerCase().includes(q) || o?.display_name?.toLowerCase().includes(q) || c.last_message?.text?.toLowerCase().includes(q)
  })
})

function getOther(conv: Conversation): MsgSender | undefined {
  return conv.other_participants?.[0]?.user
}

const onlineMap = ref<Record<string, boolean>>({})
let onlineTimer: ReturnType<typeof setInterval> | null = null

async function fetchOnlineMap() {
  const ids = store.conversations
    .filter((c) => !c.is_group && c.type !== 'community')
    .map((c) => getOther(c)?.id)
    .filter((id): id is string => !!id)
    .slice(0, 80)
  if (!ids.length) return
  try {
    const res = await api.get(`/users/online?ids=${ids.join(',')}`)
    onlineMap.value = res.data?.data ?? {}
  } catch { /* silent */ }
}

function isConvOnline(conv: Conversation): boolean {
  if (conv.is_group || conv.type === 'community' || isNotes(conv)) return false
  const id = getOther(conv)?.id
  return !!(id && onlineMap.value[id])
}

function isConvTyping(conv: Conversation): boolean {
  return (store.typingUsers[conv.id] ?? []).length > 0
}

onMounted(() => {
  fetchOnlineMap()
  onlineTimer = setInterval(fetchOnlineMap, 30_000)
})
onUnmounted(() => {
  if (onlineTimer) clearInterval(onlineTimer)
})
watch(() => store.conversations.length, () => { fetchOnlineMap() })
function isNotes(conv: Conversation): boolean {
  return conv.type !== 'community' && !conv.is_group && (!conv.other_participants || conv.other_participants.length === 0)
}

function isUnread(conv: Conversation): boolean {
  return (conv.unread_count ?? 0) > 0
}

/** Whether our own last message in a DM has been read by the other participant. */
function isLastReadByOther(conv: Conversation): boolean {
  if (!conv.last_message) return false
  return store.isReadByPartner(conv.id, conv.last_message.created_at)
}

/** Number of unread conversations in a category (for the tab badge). */
function categoryUnreadCount(cat: 'personal' | 'groups' | 'community'): number {
  const active = store.conversations.filter((c) => !c.my_participant?.archived && !isNotes(c) && isUnread(c))
  if (cat === 'personal')  return active.filter((c) => !c.is_group && c.type !== 'community').length
  if (cat === 'groups')    return active.filter((c) => c.is_group && c.type !== 'community').length
  return active.filter((c) => c.type === 'community').length
}

const STORY_REPLY_PREVIEW_RE = /^\[story_reply:[^\]]*\]/

function formatMoneyPreview(amount: number | undefined): string {
  if (!amount && amount !== 0) return ''
  return new Intl.NumberFormat('ru-RU').format(amount) + ' ₽'
}

function lastMessagePreview(msg: Conversation['last_message']): string {
  if (!msg) return langStore.t.noMessages
  const t = langStore.t
  // type-based overrides (check before text so sticker/voice never leaks text)
  if (msg.type === 'sticker') return t.stickerPreview
  if (msg.type === 'voice' || msg.type === 'audio') return t.voiceMessagePreview
  // Order cards are currently Russian-only, matching the rest of this chat-only feature (no i18n yet)
  if (msg.type === 'payment_request') return `💳 ${msg.metadata?.status === 'paid' ? 'Оплачено' : 'Запрос оплаты'} · ${formatMoneyPreview(msg.metadata?.amount)}`
  if (msg.type === 'payment_confirmation') return `✅ Оплачено · ${formatMoneyPreview(msg.metadata?.amount)}`
  if (msg.type === 'tip') return `🎉 Чаевые · ${formatMoneyPreview(msg.metadata?.amount)}`
  if (msg.type === 'post_share') return '📎 Поделился(-ась) постом'
  if (msg.type === 'group_share') return '👥 Приглашение в группу'
  if (msg.type === 'order_card') return '📦 Заказ'
  if (msg.type === 'order_update') return '📝 Заказ обновлён'
  // encrypted_text field (new schema)
  if (!msg.text && msg.encrypted_text) return t.encryptedMessagePreview
  // legacy: ciphertext stored in text field (ECDH E2E)
  if (msg.text && isEncrypted(msg.text)) return t.encryptedMessagePreview
  // forwarded message (new API — no text prefix, just the forwarded_from_sender_id marker)
  if (msg.forwarded_from_sender_id && msg.text && !msg.text.startsWith('↩️')) return '↩️ ' + msg.text
  // story reply
  if (msg.text && STORY_REPLY_PREVIEW_RE.test(msg.text)) return '📸 ' + t.storyReplyPreview
  // plain text
  if (msg.text) return msg.text
  // forwarded file/sticker with no text
  if (msg.forwarded_from_sender_id && msg.file_url) return '↩️ ' + (msg.type === 'image' ? t.imagePreview : msg.type === 'video' ? t.videoPreview : t.mediaFilePreview)
  // fallback for image/video/file
  if (msg.file_url) return msg.type === 'image' ? t.imagePreview : msg.type === 'video' ? t.videoPreview : t.mediaFilePreview
  // album (photo + video sent together) with no caption
  if (msg.type === 'album') {
    const n = Array.isArray(msg.metadata?.files) ? msg.metadata.files.length : 0
    return `📎 Альбом${n ? ` · ${n}` : ''}`
  }
  return t.noMessages
}

function formatTime(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDay = Math.floor(diffMs / 86_400_000)
  if (diffDay === 0) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  if (diffDay === 1) return langStore.t.yesterday
  if (diffDay < 7) return d.toLocaleDateString('ru', { weekday: 'short' })
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' })
}

// ── CRM label ──────────────────────────────────────────────────────────────
async function setLabel(conv: Conversation, label: string) {
  menuConvId.value = null
  try {
    await api.patch(`/messages/conversations/${conv.id}/label`, { label })
    // Update local state
    const local = store.conversations.find((c) => c.id === conv.id)
    if (local?.my_participant) local.my_participant.label = label
  } catch { /* silent */ }
}

async function toggleArchive(conv: Conversation) {
  const newVal = !conv.my_participant?.archived
  try {
    await store.setArchived(conv.id, newVal)
    // Archived chat leaves this list — close it instead of jumping to an arbitrary conversation
    if (newVal && !showArchived.value && store.activeId === conv.id) store.closeConversation()
  } catch { /* silent */ }
}
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* Step slide transition */
.slide-step-enter-active { transition: all 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94); }
.slide-step-leave-active { transition: all 0.18s ease-in; }
.slide-step-enter-from { opacity: 0; transform: translateX(24px); }
.slide-step-leave-to   { opacity: 0; transform: translateX(-24px); }
</style>
