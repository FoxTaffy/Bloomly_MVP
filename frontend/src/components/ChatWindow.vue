<template>
  <div class="flex flex-col h-full bg-brand-bg overflow-hidden">

    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <div class="flex items-center gap-3 px-4 py-3 border-b border-brand-border bg-brand-card flex-shrink-0">
      <button @click="$emit('back')" class="sm:hidden p-1.5 rounded-xl hover:bg-brand-bg text-white/55 hover:text-white transition-colors">
        <BIcon name="ArrowLeft" class="w-4 h-4" />
      </button>

      <!-- Avatar / Group avatar -->
      <div class="relative cursor-pointer flex-shrink-0" @click="conv?.is_group ? (showMembersPanel = true) : goToProfile(other?.username)">
        <!-- Group -->
        <template v-if="conv?.is_group">
          <img v-if="conv.avatar_url" :src="conv.avatar_url" :alt="conv.name ?? 'Группа'"
            class="w-10 h-10 rounded-full object-cover border-2 border-brand-border hover:border-brand-accent/60 transition-colors" />
          <div v-else class="grid grid-cols-2 gap-px w-10 h-10 rounded-full overflow-hidden border-2 border-brand-border hover:border-brand-accent/60 transition-colors bg-brand-bg">
            <template v-for="(p, idx) in conv.other_participants.slice(0, 4)" :key="p.user_id">
              <img v-if="p.user?.avatar_url" :src="p.user.avatar_url" class="w-full h-full object-cover" />
              <div v-else class="w-full h-full flex items-center justify-center bg-brand-accent/20 text-brand-accent text-[7px] font-bold">
                {{ (p.user?.display_name || p.user?.username || '?')[0].toUpperCase() }}
              </div>
            </template>
            <div v-for="i in Math.max(0, 4 - (conv.other_participants?.length ?? 0))" :key="`gh${i}`" class="w-full h-full bg-brand-border/30" />
          </div>
        </template>
        <!-- DM -->
        <template v-else>
          <img v-if="other?.avatar_url" :src="other.avatar_url" :alt="other.username"
            class="w-10 h-10 rounded-full object-cover border-2 border-brand-border hover:border-brand-accent/60 transition-colors" />
          <div v-else class="w-10 h-10 rounded-full bg-brand-accent/20 border-2 border-brand-border flex items-center justify-center text-brand-accent font-bold hover:border-brand-accent/60 transition-colors">
            {{ (other?.display_name || other?.username || '?')[0].toUpperCase() }}
          </div>
        </template>
      </div>

      <div class="flex-1 min-w-0 cursor-pointer" @click="conv?.is_group ? (showMembersPanel = true) : goToProfile(other?.username)">
        <p class="font-bold text-white text-sm leading-tight truncate flex items-center gap-1.5">
          <template v-if="conv?.is_group">
            <BIcon name="Users" class="w-3.5 h-3.5 text-white/55 flex-shrink-0" />
            {{ conv.name || 'Группа' }}
          </template>
          <template v-else>
            {{ other?.display_name || other?.username || 'Собеседник' }}
            <span v-if="e2eActive" class="text-brand-success" title="Сквозное шифрование активно">
              <BIcon name="Lock" class="w-3 h-3 inline-block -mt-0.5" />
            </span>
          </template>
        </p>
        <p v-if="!conv?.is_group && isPartnerTyping" class="text-xs text-brand-accent flex items-center gap-1">
          <span class="inline-flex gap-0.5">
            <span class="w-1 h-1 rounded-full bg-brand-accent animate-bounce [animation-delay:-0.3s]" />
            <span class="w-1 h-1 rounded-full bg-brand-accent animate-bounce [animation-delay:-0.15s]" />
            <span class="w-1 h-1 rounded-full bg-brand-accent animate-bounce" />
          </span>
          Печатает...
        </p>
        <p v-else-if="conv?.is_group" class="text-xs text-white/55">
          {{ (conv.other_participants?.length ?? 0) + 1 }} участников · нажмите для просмотра
        </p>
        <p v-else class="text-xs flex items-center gap-1.5">
          <span class="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
            :class="isPartnerOnline ? 'bg-brand-success shadow-[0_0_4px_theme(colors.green.400)]' : 'bg-brand-muted'" />
          <span :class="isPartnerOnline ? 'text-brand-success' : 'text-white/55'">{{ isPartnerOnline ? 'в сети' : partnerLastSeenLabel }}</span>
        </p>
      </div>

      <!-- Header action buttons: search, translate, ⋮ -->
      <div class="flex items-center gap-1">
        <button @click="toggleSearch"
          class="p-1.5 rounded-xl transition-colors"
          :class="showSearch ? 'text-brand-accent bg-brand-accent/10' : 'text-white/55 hover:text-white hover:bg-brand-bg'"
          title="Поиск в чате">
          <BIcon name="Search" class="w-4 h-4" />
        </button>
        <button @click="toggleTranslate"
          class="p-1.5 rounded-xl transition-colors"
          :class="translateMode ? 'text-brand-accent bg-brand-accent/10' : 'text-white/55 hover:text-white hover:bg-brand-bg'"
          title="Переводчик">
          <BIcon name="Languages" class="w-4 h-4" />
        </button>
        <div class="relative" ref="menuRef">
          <button @click="showMenu = !showMenu"
            class="p-1.5 rounded-xl hover:bg-brand-bg text-white/55 hover:text-white transition-colors"
            title="Действия">
            <BIcon name="MoreVertical" class="w-4 h-4" />
          </button>
          <Transition name="menu-drop">
            <div v-if="showMenu"
              class="absolute right-0 top-full mt-1.5 w-56 bg-brand-card border border-brand-border rounded-2xl shadow-2xl py-1.5 z-50 overflow-hidden">
              <div v-if="translateMode" class="px-4 pb-2 pt-1">
                <select v-model="translateLang"
                  class="w-full text-xs bg-brand-bg border border-brand-border rounded-xl px-3 py-1.5 text-brand-offwhite outline-none focus:border-brand-accent/50 transition-colors">
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="fr">Français</option>
                  <option value="zh">中文</option>
                  <option value="ja">日本語</option>
                  <option value="es">Español</option>
                  <option value="uk">Українська</option>
                </select>
              </div>
              <div v-if="translateMode" class="border-t border-brand-border mb-1" />

              <!-- Group-specific: manage group (for admins) -->
              <template v-if="conv?.is_group">
                <button @click="showMembersPanel = true; showMenu = false"
                  class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                  <BIcon name="Users" class="w-4 h-4 text-white/55 flex-shrink-0" />
                  Участники
                </button>
                <button v-if="myRole === 'admin'" @click="showEditGroup = true; showMenu = false"
                  class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                  <BIcon name="Settings" class="w-4 h-4 text-white/55 flex-shrink-0" />
                  Настройки группы
                </button>
                <div class="border-t border-brand-border my-1" />
              </template>

              <!-- DM-specific -->
              <button v-if="!conv?.is_group" @click="goToProfile(other?.username); showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                <BIcon name="User" class="w-4 h-4 text-white/55 flex-shrink-0" />
                Профиль
              </button>

              <button @click="archive(); showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-offwhite hover:bg-brand-bg transition-colors text-left">
                <BIcon name="Archive" class="w-4 h-4 text-white/55 flex-shrink-0" />
                Архивировать
              </button>
              <div class="border-t border-brand-border my-1" />

              <button v-if="!conv?.is_group" @click="showBlockModal = true; showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left"
                :class="isBlocked ? 'text-brand-accent hover:bg-brand-accent/8' : 'text-brand-offwhite hover:bg-brand-bg'">
                <BIcon :name="isBlocked ? 'ShieldOff' : 'ShieldAlert'" class="w-4 h-4 flex-shrink-0"
                  :class="isBlocked ? 'text-brand-accent' : 'text-white/55'" />
                {{ isBlocked ? 'Разблокировать' : 'Заблокировать' }}
              </button>

              <button @click="showDeleteModal = true; showMenu = false"
                class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-brand-error hover:bg-brand-error/8 transition-colors text-left">
                <BIcon name="Trash2" class="w-4 h-4 flex-shrink-0" />
                {{ conv?.is_group ? 'Покинуть группу' : 'Удалить диалог' }}
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- ── Group Members Panel (slide-over) ──────────────────────────────── -->
    <Teleport to="body">
      <Transition name="panel-slide">
        <div v-if="showMembersPanel" class="fixed inset-0 z-50 flex">
          <div class="flex-1 bg-black/40 backdrop-blur-sm" @click="showMembersPanel = false" />
          <div class="w-[85vw] sm:w-80 max-w-80 bg-brand-card border-l border-brand-border flex flex-col shadow-2xl overflow-hidden">
            <!-- Panel header -->
            <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border flex-shrink-0">
              <div>
                <h3 class="text-sm font-semibold text-white">{{ conv?.name || 'Группа' }}</h3>
                <p class="text-xs text-white/55 mt-0.5">{{ groupMembers.length }} участников</p>
              </div>
              <button @click="showMembersPanel = false" class="p-1.5 rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-colors">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>

            <!-- Edit group button for admins -->
            <div v-if="myRole === 'admin'" class="px-4 py-3 border-b border-brand-border flex-shrink-0">
              <button @click="showEditGroup = true; showMembersPanel = false"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl bg-brand-bg hover:bg-brand-border/50 transition-colors text-brand-offwhite text-sm">
                <BIcon name="Settings" class="w-4 h-4 text-brand-accent flex-shrink-0" />
                Настройки группы
              </button>
            </div>

            <!-- Members list -->
            <div class="flex-1 overflow-y-auto py-2 min-h-0">
              <p v-if="membersLoading" class="flex items-center justify-center py-8 text-white/55 text-sm gap-2">
                <BIcon name="Loader2" class="w-4 h-4 animate-spin" /> Загрузка...
              </p>
              <div v-for="m in groupMembers" :key="m.user_id" class="flex items-center gap-3 px-4 py-2.5 hover:bg-brand-bg/40 transition-colors">
                <img v-if="m.user?.avatar_url" :src="m.user.avatar_url" class="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                <div v-else class="w-8 h-8 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-xs font-bold flex-shrink-0">
                  {{ (m.user?.display_name || m.user?.username || '?')[0].toUpperCase() }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-white font-medium truncate leading-tight">{{ m.user?.display_name || m.user?.username }}</p>
                  <p class="text-xs text-white/55 truncate">@{{ m.user?.username }}</p>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <span v-if="m.role === 'admin'" class="text-[10px] bg-brand-accent/20 text-brand-accent px-1.5 py-0.5 rounded-full border border-brand-accent/30 font-semibold">
                    АДМИН
                  </span>
                  <!-- Admin controls -->
                  <template v-if="myRole === 'admin' && m.user_id !== auth.user?.id">
                    <button @click="kickMember(m.user_id)" class="p-1 rounded-lg text-white/55 hover:text-brand-error transition-colors" title="Исключить">
                      <BIcon name="UserX" class="w-3.5 h-3.5" />
                    </button>
                    <button @click="toggleMemberRole(m)" class="p-1 rounded-lg text-white/55 hover:text-brand-accent transition-colors"
                      :title="m.role === 'admin' ? 'Разжаловать' : 'Назначить админом'">
                      <BIcon :name="m.role === 'admin' ? 'ShieldOff' : 'ShieldCheck'" class="w-3.5 h-3.5" />
                    </button>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Edit Group Modal ────────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showEditGroup" class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" @click.self="showEditGroup = false">
          <div class="bg-brand-card border border-brand-border rounded-2xl shadow-2xl w-full max-w-sm">
            <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border">
              <h3 class="text-base font-semibold text-white">Настройки группы</h3>
              <button @click="showEditGroup = false" class="p-1.5 rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-colors">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>
            <div class="p-4 space-y-3">
              <div>
                <label class="block text-xs text-white/55 mb-1.5 font-medium">Название группы</label>
                <input v-model="editGroupName" type="text" maxlength="100"
                  class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-brand-accent/60 transition-colors" />
              </div>
              <div>
                <label class="block text-xs text-white/55 mb-1.5 font-medium">Аватар группы</label>
                <input ref="groupAvatarRef" type="file" accept="image/*" class="sr-only" @change="onGroupAvatarChange" />
                <div class="flex items-center gap-3">
                  <!-- Preview -->
                  <div
                    class="w-14 h-14 rounded-2xl border-2 border-dashed border-brand-border/60 hover:border-brand-accent/40 flex items-center justify-center cursor-pointer transition-all flex-shrink-0 overflow-hidden relative"
                    @click="groupAvatarRef?.click()">
                    <img v-if="editGroupAvatar" :src="editGroupAvatar" class="w-full h-full object-cover" />
                    <span v-else-if="uploadingGroupAvatar" class="w-5 h-5 border-2 border-brand-accent border-t-transparent rounded-full animate-spin" />
                    <BIcon v-else name="Image" class="w-6 h-6 text-white/30" />
                  </div>
                  <!-- Actions -->
                  <div class="flex flex-col gap-1.5 flex-1 min-w-0">
                    <button type="button" @click="groupAvatarRef?.click()" :disabled="uploadingGroupAvatar"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-brand-bg border border-brand-border text-xs font-semibold text-white/70 hover:text-white hover:border-brand-accent/40 transition-all disabled:opacity-40">
                      <BIcon name="Upload" class="w-3 h-3" />
                      {{ uploadingGroupAvatar ? 'Загрузка…' : 'Выбрать фото' }}
                    </button>
                    <button v-if="editGroupAvatar" type="button" @click="editGroupAvatar = ''"
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition-all">
                      <BIcon name="Trash2" class="w-3 h-3" />
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 px-4 py-3 border-t border-brand-border">
              <button @click="showEditGroup = false" class="flex-1 py-2 rounded-xl border border-brand-border text-sm text-white/55 hover:text-white hover:bg-brand-bg/50 transition-colors">Отмена</button>
              <button @click="saveGroupEdit" :disabled="savingGroup"
                class="flex-1 py-2 rounded-xl bg-brand-accent text-white text-sm font-semibold hover:bg-brand-accent-plus disabled:opacity-40 transition-all flex items-center justify-center gap-2">
                <BIcon v-if="savingGroup" name="Loader2" class="w-3.5 h-3.5 animate-spin" />
                Сохранить
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
          <input v-model="searchQuery" type="text" placeholder="Поиск сообщений..."
            class="bg-transparent text-sm text-white placeholder-brand-muted outline-none flex-1" autofocus />
          <span v-if="searchQuery" class="text-[11px] text-white/55 flex-shrink-0">
            {{ filteredMsgList.length }} из {{ msgList.length }}
          </span>
          <button v-if="searchQuery" @click="searchQuery = ''" class="text-white/55 hover:text-white transition-colors flex-shrink-0">
            <BIcon name="X" class="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Transition>

    <!-- ── Message list ────────────────────────────────────────────────────── -->
    <div ref="scrollEl" class="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-1" @scroll="onScroll" @click="onMsgListClick">

      <!-- Load more -->
      <div class="flex justify-center mb-2" v-if="store.hasMoreMessages[convId] && !searchQuery">
        <button @click="loadMore" :disabled="store.messagesLoading"
          class="text-xs text-brand-accent hover:underline disabled:opacity-50 px-4 py-1.5 rounded-xl hover:bg-brand-accent/8 transition-colors">
          {{ store.messagesLoading ? 'Загрузка...' : 'Загрузить ранние сообщения' }}
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
        <BIcon name="MessageCircle" class="w-8 h-8 opacity-30" />
        <span>Начните переписку</span>
      </div>

      <!-- Search no results -->
      <div v-else-if="searchQuery && !filteredMsgList.length" class="flex flex-col items-center justify-center h-32 text-white/55 text-sm gap-2">
        <BIcon name="SearchX" class="w-8 h-8 opacity-30" />
        <span>Сообщения не найдены</span>
      </div>

      <!-- Messages -->
      <template v-else>
        <div v-for="(msg, idx) in displayList" :key="msg.id"
          :id="'msg-' + msg.id"
          class="flex gap-2" :class="isMine(msg) ? 'justify-end' : 'justify-start'">

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
            @dblclick="replyTo = msg"
            @click.self="tappedMsgId = tappedMsgId === msg.id ? null : msg.id">

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
                  {{ msg.reply_to.file_url && !msg.reply_to.text ? '📎 Медиафайл' : previewMsgText(msg.reply_to.text, 50) }}
                </p>
              </div>
            </div>

            <!-- Sticker (real image or legacy emoji) -->
            <div v-if="msg.type === 'sticker'" class="p-1">
              <img
                v-if="(msg.file_url || msg.text || '').startsWith('http')"
                :src="msg.file_url || msg.text || ''"
                class="w-28 h-28 object-contain select-none cursor-pointer hover:scale-110 transition-transform active:scale-95"
                @click="openImageLightbox(msg.file_url || msg.text || '')"
              />
              <span v-else class="text-[80px] leading-none select-none">
                {{ getStickerEmoji(msg.text || msg.file_url || '') }}
              </span>
            </div>

            <!-- Media (compact MiniPlayer) -->
            <div v-else-if="msg.file_url"
              class="rounded-3xl overflow-hidden border border-brand-border/60 mb-0.5 max-w-[280px] w-full shadow-sm"
              :class="isMine(msg) ? 'rounded-br-md' : 'rounded-bl-md'">
              <MiniPlayer :src="msg.file_url" :msg-type="msg.type" @click-image="openImageLightbox(msg.file_url!)" />
            </div>

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
                    <span class="text-xs font-semibold">История истекла</span>
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
                      <span class="text-[10px] text-white/70 font-medium">История</span>
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
                  <span class="text-xs font-semibold">История истекла</span>
                </div>
              </div>
            </template>

            <!-- Text bubble (not shown for pure sticker or story reply with text already shown in card) -->
            <div v-if="msg.type !== 'sticker' && !parseStoryReply(msg) && !/^\[story_reply:/u.test(msg.text || '') && (msg.text || !msg.file_url)"
              @click="tappedMsgId = tappedMsgId === msg.id ? null : msg.id"
              :class="[
                'px-3.5 py-2 rounded-3xl text-sm leading-relaxed break-words min-w-[60px] shadow-sm',
                isMine(msg)
                  ? 'bg-brand-accent text-white rounded-br-md shadow-brand-accent/20'
                  : 'bg-brand-card text-brand-offwhite border border-brand-border/60 rounded-bl-md',
                msg._sending ? 'opacity-60' : '',
                translateMode && translations[msg.id] && !isMine(msg) ? 'border-brand-accent/40' : '',
              ]">
              <!-- ── Forwarded banner ── -->
              <div v-if="getForwardedAuthor(msg)"
                class="flex items-center gap-1.5 mb-1.5 pb-1.5 border-b"
                :class="isMine(msg) ? 'border-white/20' : 'border-brand-border'">
                <BIcon name="CornerUpRight" class="w-3 h-3 flex-shrink-0"
                  :class="isMine(msg) ? 'text-white/60' : 'text-brand-accent'" />
                <span class="text-[10px] font-semibold truncate"
                  :class="isMine(msg) ? 'text-white/60' : 'text-brand-accent'">
                  Переслано от {{ getForwardedAuthor(msg) }}
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

            <!-- Time + status + actions -->
            <div class="flex items-center gap-1 mt-0.5">
              <span class="text-[10px] text-white/55">{{ formatMsgTime(msg.created_at) }}</span>

              <!-- Read status icons (only on my messages) -->
              <template v-if="isMine(msg)">
                <BIcon v-if="msg._sending" name="Clock" class="w-3 h-3 text-white/55" title="Отправляется..." />
                <span v-else-if="isRead(msg)" class="flex items-center text-brand-accent" title="Прочитано">
                  <BIcon name="CheckCheck" class="w-3 h-3" />
                </span>
                <span v-else class="flex items-center text-white/55" title="Доставлено">
                  <BIcon name="Check" class="w-3 h-3" />
                </span>
              </template>

              <!-- Bubble action buttons (show on hover / tap) -->
              <div class="items-center gap-0.5" :class="tappedMsgId === msg.id ? 'flex' : 'hidden group-hover:flex'">
                <button type="button" @click="replyTo = msg"
                  class="p-0.5 rounded hover:text-brand-accent text-white/55 transition-colors" title="Ответить">
                  <BIcon name="CornerUpLeft" class="w-3 h-3" />
                </button>
                <button type="button" @click="startForward(msg)"
                  class="p-0.5 rounded hover:text-brand-accent text-white/55 transition-colors" title="Переслать">
                  <BIcon name="Forward" class="w-3 h-3" />
                </button>
                <button v-if="isMine(msg) && !msg._sending" @click="deleteMsg(msg.id)"
                  class="p-0.5 rounded hover:text-brand-error text-white/55 transition-colors" title="Удалить">
                  <BIcon name="Trash2" class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Typing indicator -->
      <div v-if="isPartnerTyping && !searchQuery" class="flex items-end gap-2 justify-start mt-1">
        <div class="w-6 h-6 flex-shrink-0">
          <img v-if="other?.avatar_url" :src="other.avatar_url" class="w-6 h-6 rounded-full object-cover border border-brand-border" />
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

    <!-- ── Media lightbox (PostLightbox) ───────────────────────────────────── -->
    <PostLightbox v-if="lightboxUrls.length"
      :images="lightboxUrls"
      :start-index="lightboxStart"
      @close="lightboxUrls = []" />
    <!-- ── Delete conversation modal ─────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showDeleteModal"
          class="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style="background:rgba(0,0,0,.55)" @click.self="showDeleteModal = false">
          <div class="bg-brand-card border border-brand-border rounded-3xl p-6 w-full max-w-sm shadow-2xl">
            <h3 class="text-lg font-bold text-white mb-2">Удалить диалог</h3>
            <p class="text-sm text-white/55 mb-5">Выберите, как удалить переписку:</p>
            <div class="flex flex-col gap-2">
              <button @click="deleteConversation('me')"
                class="w-full px-4 py-2.5 rounded-xl text-sm font-medium bg-brand-bg border border-brand-border text-brand-offwhite hover:border-brand-accent/50 hover:text-white transition-all text-left">
                Только для меня
                <span class="block text-xs text-white/55 font-normal">Собеседник не увидит изменений</span>
              </button>
              <button @click="deleteConversation('all')"
                class="w-full px-4 py-2.5 rounded-xl text-sm font-medium bg-brand-error/10 border border-brand-error/30 text-brand-error hover:bg-brand-error/20 transition-all text-left">
                Для всех
                <span class="block text-xs opacity-70 font-normal">Переписка будет удалена для обоих</span>
              </button>
              <button @click="showDeleteModal = false"
                class="w-full px-4 py-2 rounded-xl text-sm text-white/55 hover:text-white hover:bg-brand-bg transition-colors">
                Отмена
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
              {{ isBlocked ? 'Разблокировать' : 'Заблокировать' }}
              {{ other?.display_name || other?.username }}
            </h3>
            <p class="text-sm text-white/55 mb-5">
              <template v-if="isBlocked">Пользователь снова сможет писать вам.</template>
              <template v-else>Оба пользователя не смогут писать друг другу.</template>
            </p>
            <div class="flex gap-2">
              <button @click="toggleBlock()"
                class="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                :class="isBlocked ? 'bg-brand-accent/10 border border-brand-accent/30 text-brand-accent hover:bg-brand-accent/20' : 'bg-brand-error/10 border border-brand-error/30 text-brand-error hover:bg-brand-error/20'">
                {{ isBlocked ? 'Разблокировать' : 'Заблокировать' }}
              </button>
              <button @click="showBlockModal = false"
                class="flex-1 px-4 py-2.5 rounded-xl text-sm text-white/55 hover:text-white hover:bg-brand-bg border border-brand-border transition-colors">
                Отмена
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
    <!-- ── Forward modal ────────────────────────────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="forwardMsg" class="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style="background:rgba(0,0,0,.55)" @click.self="forwardMsg = null">
          <div class="bg-brand-card border border-brand-border rounded-3xl p-5 w-full max-w-sm shadow-2xl">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-base font-bold text-white">Переслать сообщение</h3>
              <button @click="forwardMsg = null" class="p-1.5 rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-colors">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>
            <!-- Quote preview -->
            <div class="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-brand-bg border border-brand-border/60">
              <div class="w-0.5 h-7 rounded-full bg-brand-accent flex-shrink-0" />
              <div class="min-w-0">
                <p class="text-[10px] text-brand-accent font-semibold truncate">{{ forwardMsg.sender?.display_name || forwardMsg.sender?.username }}</p>
                <p class="text-[11px] text-white/55 truncate">{{ forwardMsg.file_url && !forwardMsg.text ? '📎 Медиафайл' : previewMsgText(forwardMsg.text, 60) }}</p>
              </div>
            </div>
            <!-- Conv list -->
            <div class="space-y-1 max-h-52 overflow-y-auto">
              <button v-for="c in store.conversations.filter(c2 => c2.id !== convId)" :key="c.id"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-brand-bg transition-colors text-left"
                @click="doForward(c.id)">
                <div class="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden bg-brand-accent/20 border border-brand-border">
                  <img v-if="c.is_group ? c.avatar_url : c.other_participants[0]?.user?.avatar_url"
                    :src="c.is_group ? c.avatar_url! : c.other_participants[0].user.avatar_url!"
                    class="w-full h-full object-cover" />
                  <div v-else class="w-full h-full flex items-center justify-center text-brand-accent text-xs font-bold">
                    {{ (c.is_group ? c.name : (c.other_participants[0]?.user?.display_name || c.other_participants[0]?.user?.username) || '?')[0]?.toUpperCase() }}
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-white font-medium truncate leading-tight">
                    {{ c.is_group ? (c.name || 'Группа') : (c.other_participants[0]?.user?.display_name || c.other_participants[0]?.user?.username || 'Собеседник') }}
                  </p>
                </div>
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
            <img v-if="mentionCard.avatar_url" :src="mentionCard.avatar_url" class="w-10 h-10 rounded-full object-cover border border-brand-border flex-shrink-0" />
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
              Профиль
            </button>
            <button @click="openDM(mentionCard.id); mentionCard = null"
              class="flex-1 py-1.5 rounded-xl bg-brand-accent hover:bg-brand-accent-plus text-xs text-white transition-colors">
              Написать
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
    <!-- ── Input ───────────────────────────────────────────────────────────── -->
    <div class="px-3 py-3 border-t border-brand-border bg-brand-card flex-shrink-0 relative">
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
          <StickerPanel @pick="sendSticker" />
        </div>
      </Transition>

      <form @submit.prevent="submit" class="flex items-end gap-2">
        <!-- Attachment button -->
        <button type="button" @click="fileInputEl?.click()"
          :disabled="isUploading || isRecording"
          class="flex-shrink-0 w-9 h-9 mb-0.5 rounded-2xl flex items-center justify-center text-white/55 hover:text-brand-accent hover:bg-brand-bg transition-all disabled:opacity-40"
          title="Прикрепить медиа">
          <BIcon v-if="isUploading" name="Loader2" class="w-4 h-4 animate-spin" />
          <BIcon v-else name="Paperclip" class="w-4 h-4" />
        </button>
        <input ref="fileInputEl" type="file" accept="image/*,video/*,audio/*" class="sr-only" @change="onFileChange" />

        <!-- Emoji button -->
        <button type="button"
          @click="showEmojiPicker = !showEmojiPicker; showStickerPanel = false"
          :class="['flex-shrink-0 w-9 h-9 mb-0.5 rounded-2xl flex items-center justify-center transition-all text-lg leading-none',
            showEmojiPicker ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/55 hover:text-brand-accent hover:bg-brand-bg']"
          title="Эмодзи">
          😊
        </button>

        <!-- Sticker button -->
        <button type="button"
          @click="showStickerPanel = !showStickerPanel; showEmojiPicker = false"
          :class="['flex-shrink-0 w-9 h-9 mb-0.5 rounded-2xl flex items-center justify-center transition-all text-lg leading-none',
            showStickerPanel ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/55 hover:text-brand-accent hover:bg-brand-bg']"
          title="Стикеры">
          🎭
        </button>

        <!-- Recording in progress bar (takes the place of the textarea row when recording) -->
        <button v-if="isRecording" type="button" @click="stopRecording"
          class="flex-1 flex items-center gap-2 px-3 h-10 mb-0.5 rounded-2xl bg-brand-error/15 border border-brand-error/40 text-brand-error hover:bg-brand-error/25 transition-all">
          <span class="w-2 h-2 rounded-full bg-brand-error animate-ping flex-shrink-0" />
          <span class="text-xs font-mono flex-1">{{ fmtRecording(recordingSeconds) }}</span>
          <span class="text-xs text-brand-error/70">нажмите для отправки</span>
        </button>

        <div v-else class="flex-1 relative">
          <!-- @mention dropdown -->
          <Transition name="mention-pop">
            <div v-if="mentionResults.length || mentionLoading"
              class="absolute bottom-full left-0 right-0 mb-1.5 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden z-40">
              <div v-if="mentionLoading" class="px-4 py-3 text-xs text-white/55 text-center">Поиск...</div>
              <button v-for="u in mentionResults" :key="u.id" type="button" @click="selectMention(u.username)"
                class="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-brand-bg transition-colors text-left">
                <img v-if="u.avatar_url" :src="u.avatar_url" class="w-7 h-7 rounded-full object-cover flex-shrink-0" />
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
          <!-- Reply bar -->
          <div v-if="replyTo" class="mb-2 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-brand-bg border border-brand-accent/30">
            <div class="w-0.5 h-8 rounded-full bg-brand-accent flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <p class="text-[10px] text-brand-accent font-semibold truncate leading-tight">
                {{ replyTo.sender?.display_name || replyTo.sender?.username || 'Сообщение' }}
              </p>
              <p class="text-[11px] text-white/55 truncate leading-tight">
                {{ replyTo.file_url && !replyTo.text ? '📎 Медиафайл' : previewMsgText(replyTo.text, 60) }}
              </p>
            </div>
            <button type="button" @click="replyTo = null" class="flex-shrink-0 p-0.5 text-white/55 hover:text-brand-error transition-colors">
              <BIcon name="X" class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Media preview -->
          <div v-if="mediaPreview" class="mb-2 relative inline-block">
            <video v-if="pendingFileIsVideo" :src="mediaPreview" class="h-20 rounded-2xl border border-brand-border object-cover" muted />
            <img v-else :src="mediaPreview" class="h-20 rounded-2xl border border-brand-border object-cover" />
            <!-- Circular upload progress -->
            <div v-if="isUploading" class="absolute inset-0 rounded-2xl bg-black/55 flex flex-col items-center justify-center">
              <svg class="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2.5"/>
                <circle cx="18" cy="18" r="15" fill="none" stroke="white" stroke-width="2.5"
                  :stroke-dasharray="`${(uploadProgress / 100) * 94.25} 94.25`"
                  class="transition-all duration-200"/>
              </svg>
              <span class="text-white text-[9px] mt-0.5">{{ uploadProgress }}%</span>
            </div>
            <button v-else type="button" @click="clearMedia"
              class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-brand-card border border-brand-border rounded-full flex items-center justify-center text-white/55 hover:text-brand-error transition-colors">
              <BIcon name="X" class="w-3 h-3" />
            </button>
          </div>
          <textarea ref="inputEl" v-model="draft" rows="1"
            :placeholder="mediaPreview ? 'Подпись (необязательно)...' : 'Написать сообщение...'"
            class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 text-sm text-white placeholder-brand-muted resize-none outline-none focus:border-brand-accent/60 transition-colors max-h-32 overflow-y-auto"
            @keydown.enter.exact.prevent="submit"
            @keydown.enter.shift.exact="newline"
            @input="onInput"
          />
        </div>

        <!-- Send / Mic toggle button -->
        <Transition name="btn-swap" mode="out-in">
          <!-- Mic: shown when no text and no file and not recording -->
          <button v-if="!draft.trim() && !pendingFileUrl && !isRecording" key="mic"
            type="button" @click="startRecording"
            :disabled="isUploading || !!mediaPreview"
            class="flex-shrink-0 w-10 h-10 mb-0.5 rounded-2xl bg-brand-card border border-brand-border hover:bg-brand-bg text-white/55 hover:text-brand-accent transition-all flex items-center justify-center disabled:opacity-40"
            title="Голосовое сообщение">
            <BIcon name="Mic" class="w-4 h-4" />
          </button>
          <!-- Send: shown when there's text or file -->
          <button v-else key="send"
            type="submit"
            :disabled="(!draft.trim() && !pendingFileUrl) || isUploading"
            class="flex-shrink-0 w-10 h-10 mb-0.5 rounded-2xl bg-brand-accent hover:bg-brand-accent-plus disabled:opacity-30 transition-all shadow-lg shadow-brand-accent/20 active:scale-95 flex items-center justify-center"
            title="Отправить">
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
              <span class="text-xs">Изображение недоступно</span>
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
                <span>История</span>
                <span v-if="activeStoryCard.expiresAt" class="flex items-center gap-0.5 ml-1">
                  <BIcon name="Clock" class="w-3 h-3" />
                  {{
                    (() => {
                      const diff = Math.max(0, new Date(activeStoryCard.expiresAt).getTime() - Date.now())
                      const h = Math.floor(diff / 3_600_000)
                      const m = Math.floor((diff % 3_600_000) / 60_000)
                      return h > 0 ? `${h}ч ${m}м` : `${m}м`
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
              <p class="text-[10px] text-white/50 font-semibold uppercase tracking-wider mb-1">Ответ</p>
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
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMessagesStore, type Message, type MsgSender, type Conversation } from '@/stores/messages'
import { useAuthStore } from '@/stores/auth'
import BIcon from '@/components/BIcon.vue'
import CustomPlayer from '@/components/CustomPlayer.vue'
import MiniPlayer from '@/components/MiniPlayer.vue'
import PostLightbox from '@/components/PostLightbox.vue'
import EmojiPicker from '@/components/EmojiPicker.vue'
import StickerPanel from '@/components/StickerPanel.vue'
import api from '@/api'
import { wsClient } from '@/lib/wsClient'
import { getOrCreateKeyPair, deriveSharedKey, encryptMsg, decryptMsg, isEncrypted } from '@/lib/e2e'

const props = defineProps<{
  convId: string
  other: MsgSender | undefined
  conv?: Conversation
}>()
const emit = defineEmits<{ (e: 'back'): void; (e: 'archived'): void }>()

const store = useMessagesStore()
const auth  = useAuthStore()
const router = useRouter()

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
const translateLang    = ref('ru')
const translations     = ref<Record<string, string>>({})
const translatingIds   = reactive(new Set<string>())
const lightboxUrl      = ref<string | null>(null)
// Online status
const isPartnerOnline   = ref(false)
const partnerLastSeenAt = ref<Date | null>(null)
const partnerLastSeenLabel = computed(() => {
  if (!partnerLastSeenAt.value) return 'не в сети'
  const diff = Math.floor((Date.now() - partnerLastSeenAt.value.getTime()) / 60000)
  if (diff < 1) return 'был(а) только что'
  if (diff < 60) return `был(а) ${diff} мин. назад`
  const h = Math.floor(diff / 60)
  if (h < 24) return `был(а) ${h} ч. назад`
  return 'не в сети'
})
let onlineTimer: ReturnType<typeof setInterval> | null = null
// Media
const isUploading       = ref(false)
const uploadProgress    = ref(0)
const pendingFileUrl    = ref<string | null>(null)
const mediaPreview      = ref<string | null>(null)
const pendingFileIsVideo = ref(false)
// Lightbox
const lightboxUrls = ref<string[]>([])
const lightboxStart = ref(0)
// Voice recording
const isRecording     = ref(false)
const recordingSeconds = ref(0)
let mediaRecorder: MediaRecorder | null = null
let recordTimer: ReturnType<typeof setInterval> | null = null
// E2E
const sharedKey     = ref<CryptoKey | null>(null)
const e2eActive     = ref(false)
const decryptedCache = ref<Record<string, string>>({})
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
const showEditGroup    = ref(false)
const editGroupName    = ref('')
const editGroupAvatar  = ref('')
const groupAvatarRef   = ref<HTMLInputElement | null>(null)
const uploadingGroupAvatar = ref(false)

async function onGroupAvatarChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  uploadingGroupAvatar.value = true
  try {
    const fd = new FormData()
    fd.append('file', file, file.name)
    const res = await api.post('/media/upload?folder=avatars', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    editGroupAvatar.value = res.data.data.url
  } catch (err) { console.error('Avatar upload failed:', err) }
  finally { uploadingGroupAvatar.value = false; if (groupAvatarRef.value) groupAvatarRef.value.value = '' }
}
const savingGroup      = ref(false)
const groupMembers     = ref<Array<{ user_id: string; role: string; user: MsgSender }>>([])
const membersLoading   = ref(false)
// Emoji & sticker popovers
const showEmojiPicker  = ref(false)
const showStickerPanel = ref(false)
// Reply / forward / mention card
const replyTo      = ref<Message | null>(null)
const forwardMsg   = ref<Message | null>(null)
const tappedMsgId  = ref<string | null>(null)
const mentionCard  = ref<{ username: string; display_name: string | null; avatar_url: string | null; id: string; x: number; y: number } | null>(null)

// ── Computed ───────────────────────────────────────────────────────────────────
const msgList = computed<Message[]>(() => store.messages[props.convId] ?? [])
const filteredMsgList = computed(() => {
  if (!searchQuery.value.trim()) return msgList.value
  const q = searchQuery.value.toLowerCase()
  return msgList.value.filter((m) => getDisplayText(m).toLowerCase().includes(q))
})
const displayList = computed(() => searchQuery.value.trim() ? filteredMsgList.value : msgList.value)
// All file_urls in current view (for lightbox navigation)
const mediaUrls = computed(() => displayList.value.map(m => m.file_url).filter(Boolean) as string[])

const isPartnerTyping = computed(() => {
  const typers = store.typingUsers[props.convId] ?? []
  return typers.some((uid) => uid !== auth.user?.id)
})

const myRole = computed(() => props.conv?.my_participant?.role ?? 'member')

// ── Helpers ────────────────────────────────────────────────────────────────────
function isMine(msg: Message) { return msg.sender_id === auth.user?.id }

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
    await store.updateGroup(props.convId, { name: editGroupName.value, avatar_url: editGroupAvatar.value || undefined })
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
  store.sendMessage(props.convId, '', url, 'sticker')
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

const FWD_RE = /^↩️ Переслано от (.+?)\n/
// Format v2 (JSON): [story_reply:{"img":...,"exp":...,"name":...,"ava":...}]\nreply
// Format v1 (legacy pipe): [story_reply:IMAGE_URL|EXPIRES_AT|AUTHOR_NAME|AUTHOR_AVATAR]\nreply
const STORY_REPLY_RE = /^\[story_reply:(\{[\s\S]*?\}|[^\]]*)\]\n?([\s\S]*)$/u

/** Returns human-friendly short preview, stripping service tags */
function previewMsgText(text: string | undefined, maxLen = 60): string {
  if (!text) return ''
  if (/^\[story_reply:/u.test(text)) return '📸 Ответ на историю'
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

function parseStoryReply(msg: Message): StoryReplyMeta | null {
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
      const expired = true
      return { imageUrl: '', expiresAt: '', authorName: msg.sender?.display_name || msg.sender?.username || '', authorAvatar: msg.sender?.avatar_url || '', replyText: '', expired }
    }
  } else {
    // v1 pipe format (legacy fallback)
    const parts = raw.split('|')
    imageUrl     = parts[0] ?? ''
    expiresAt    = parts[1] ?? ''
    authorName   = parts[2] ?? ''
    authorAvatar = parts[3] ?? ''
  }
  const expired = expiresAt ? Date.now() > new Date(expiresAt).getTime() : false
  return { imageUrl, expiresAt, authorName, authorAvatar, replyText: m[2].trim(), expired }
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
  const m = (msg.text || '').match(FWD_RE); return m ? m[1] : null
}

function getMsgText(msg: Message): string {
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
  if (!target.closest('.group')) tappedMsgId.value = null
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
async function doForward(targetConvId: string) {
  if (!forwardMsg.value) return
  const original = forwardMsg.value
  const author = original.sender?.display_name || original.sender?.username || ''
  const prefix = `↩️ Переслано от ${author}\n`
  const content = original.text ? prefix + original.text : prefix.trim()
  store.sendMessage(targetConvId, content, original.file_url ?? null, original.type !== 'text' ? original.type : undefined)
  forwardMsg.value = null
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
  return new Date(iso).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
}

function highlight(text: string): string {
  if (!searchQuery.value) return text
  const escaped = searchQuery.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark class="bg-brand-accent/30 text-white rounded px-0.5">$1</mark>')
}

function openImageLightbox(url: string) {
  lightboxUrls.value = mediaUrls.value.length ? mediaUrls.value : [url]
  lightboxStart.value = Math.max(0, lightboxUrls.value.indexOf(url))
}

// ── E2E encryption ─────────────────────────────────────────────────────────────
async function setupE2E() {
  sharedKey.value = null
  e2eActive.value = false
  // E2E disabled — key exchange not yet stable
  return
}

function getDisplayText(msg: Message): string {
  const text = msg.text
  if (!text) return ''
  if (!sharedKey.value || !isEncrypted(text)) return text
  if (decryptedCache.value[msg.id]) return decryptedCache.value[msg.id]
  // Trigger async decryption
  decryptMsg(text, sharedKey.value).then((plain) => {
    if (plain) decryptedCache.value = { ...decryptedCache.value, [msg.id]: plain }
  })
  return '🔒 ...' // while decrypting
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
      isUploading.value = true
      try {
        const ext = mimeType.includes('webm') ? 'webm' : 'ogg'
        const form = new FormData()
        form.append('file', new File([blob], `voice.${ext}`, { type: mimeType }))
        const res = await api.post('/media/upload?folder=messages', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        const url = res.data?.data?.url ?? null
        if (url) store.sendMessage(props.convId, '', url, 'voice')
      } catch {}
      finally { isUploading.value = false }
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

watch(() => msgList.value.length, (newLen, oldLen) => {
  if (!scrollEl.value) return
  const el = scrollEl.value
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  if (atBottom || newLen > (oldLen ?? 0)) scrollToBottom(newLen !== oldLen)
})

watch(() => props.convId, () => { scrollToBottom(); searchQuery.value = '' }, { immediate: true })

let prevScrollHeight = 0
async function onScroll() {
  if (!scrollEl.value) return
  if (scrollEl.value.scrollTop < 80 && store.hasMoreMessages[props.convId] && !store.messagesLoading) {
    prevScrollHeight = scrollEl.value.scrollHeight
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
  const text = draft.value.trim()
  if (!text && !pendingFileUrl.value) return
  const fileUrl = pendingFileUrl.value
  // Encrypt text if E2E is active
  let sendText = text
  if (text && sharedKey.value) {
    try { sendText = await encryptMsg(text, sharedKey.value) } catch { sendText = text }
  }
  const rId = replyTo.value?.id ?? null
  draft.value = ''
  pendingFileUrl.value = null
  mediaPreview.value = null
  pendingFileIsVideo.value = false
  replyTo.value = null
  resetTextarea()
  store.sendMessage(props.convId, sendText, fileUrl, undefined, rId)
  scrollToBottom(true)
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
async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const isVideo = file.type.startsWith('video/')
  pendingFileIsVideo.value = isVideo
  mediaPreview.value = URL.createObjectURL(file)
  isUploading.value = true
  uploadProgress.value = 0
  try {
    const form = new FormData()
    form.append('file', file)
    const res = await api.post('/media/upload?folder=messages', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (ev: any) => {
        uploadProgress.value = ev.total ? Math.round((ev.loaded / ev.total) * 100) : 50
      },
    })
    pendingFileUrl.value = res.data?.data?.url ?? null
    uploadProgress.value = 100
  } catch {
    mediaPreview.value = null
    pendingFileUrl.value = null
    pendingFileIsVideo.value = false
    uploadProgress.value = 0
  } finally {
    isUploading.value = false
    if (fileInputEl.value) fileInputEl.value.value = ''
  }
}

function clearMedia() {
  mediaPreview.value = null
  pendingFileUrl.value = null
  pendingFileIsVideo.value = false
  if (fileInputEl.value) fileInputEl.value.value = ''
}

// ── Delete ──────────────────────────────────────────────────────────────────────
async function deleteMsg(id: string) { await store.deleteMessage(id) }

// ── Archive ─────────────────────────────────────────────────────────────────────
async function archive() { await store.setArchived(props.convId, true); emit('archived') }

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
    if (wasOnline && !isPartnerOnline.value) {
      partnerLastSeenAt.value = new Date()
    }
  } catch { /* silent */ }
}

onMounted(() => {
  document.addEventListener('click', closeMenu)
  if (!props.conv?.is_group) {
    fetchOnlineStatus()
    onlineTimer = setInterval(fetchOnlineStatus, 30_000)
    setupE2E()
    fetchBlockStatus()
  } else {
    fetchGroupMembers()
  }
})
onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
  if (onlineTimer) clearInterval(onlineTimer)
  if (recordTimer) clearInterval(recordTimer)
  if (mentionTimer) clearTimeout(mentionTimer)
  mediaRecorder?.stop()
})

watch(() => props.other?.id, () => {
  isPartnerOnline.value = false
  partnerLastSeenAt.value = null
  if (!props.conv?.is_group) {
    fetchOnlineStatus()
    setupE2E()
    fetchBlockStatus()
  }
  decryptedCache.value = {}
})

watch(() => props.convId, () => {
  groupMembers.value = []
  if (props.conv?.is_group) fetchGroupMembers()
})

watch(showMembersPanel, (open) => {
  if (open && !groupMembers.value.length) fetchGroupMembers()
})

watch(showEditGroup, (open) => {
  if (open && props.conv) {
    editGroupName.value  = props.conv.name ?? ''
    editGroupAvatar.value = props.conv.avatar_url ?? ''
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

/* Group members side panel */
.panel-slide-enter-active, .panel-slide-leave-active { transition: transform 0.25s ease; }
.panel-slide-enter-from, .panel-slide-leave-to { transform: translateX(100%); }

/* Emoji / sticker popover */
.popover-up-enter-active, .popover-up-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.popover-up-enter-from, .popover-up-leave-to { opacity: 0; transform: translateY(8px) scale(0.95); }
</style>
