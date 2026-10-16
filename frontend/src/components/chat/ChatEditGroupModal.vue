<script setup lang="ts">
import { ref, watch } from 'vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { useMessagesStore, type Conversation } from '@/stores/messages'
import { compressImageForUpload } from '@/lib/utils'
import BIcon from '@/components/BIcon.vue'
import type { GroupChatMember } from '@/composables/chat/useGroupChatManagement'

// Name / avatar / banner editor of a group conversation, plus the member list with admin actions.
const props = defineProps<{ open: boolean; convId: string; conv?: Conversation; members: GroupChatMember[] }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'toggle-role', member: GroupChatMember): void
  (e: 'kick', userId: string): void
}>()
const store = useMessagesStore()
const auth = useAuthStore()
const langStore = useLangStore()

const editGroupName = ref('')
const editGroupAvatar = ref('')
const editGroupBanner = ref('')
const groupAvatarRef = ref<HTMLInputElement | null>(null)
const groupBannerRef = ref<HTMLInputElement | null>(null)
const uploadingGroupAvatar = ref(false)
const uploadingGroupBanner = ref(false)
const savingGroup = ref(false)

// Every opening starts from the conversation's current values
watch(() => props.open, (open) => {
  if (open && props.conv) {
    editGroupName.value   = props.conv.name ?? ''
    editGroupAvatar.value = props.conv.avatar_url ?? ''
    editGroupBanner.value = props.conv.banner_url ?? ''
  }
})

async function uploadImage(e: Event, folder: 'avatars' | 'banners') {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const [target, busy, input] = folder === 'avatars'
    ? [editGroupAvatar, uploadingGroupAvatar, groupAvatarRef]
    : [editGroupBanner, uploadingGroupBanner, groupBannerRef]
  busy.value = true
  try {
    const fd = new FormData()
    const compressed = await compressImageForUpload(file)
    fd.append('file', compressed, compressed.name)
    const res = await api.post(`/media/upload?folder=${folder}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    target.value = res.data.data.url
  } catch (err) { console.error(`Group ${folder} upload failed:`, err) }
  finally { busy.value = false; if (input.value) input.value.value = '' }
}
const onGroupAvatarChange = (e: Event) => uploadImage(e, 'avatars')
const onGroupBannerChange = (e: Event) => uploadImage(e, 'banners')

async function saveGroupEdit() {
  savingGroup.value = true
  try {
    await store.updateGroup(props.convId, {
      name: editGroupName.value,
      avatar_url: editGroupAvatar.value || undefined,
      banner_url: editGroupBanner.value || undefined,
    })
    emit('close')
  } catch { /* silent */ }
  finally { savingGroup.value = false }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" @click.self="emit('close')">
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
            <button @click.stop="emit('close')" class="absolute top-3 right-3 w-7 h-7 rounded-xl bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-all">
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
            <div v-if="members.length" class="bg-brand-bg rounded-2xl p-4 border border-brand-border/60">
              <p class="text-[11px] text-white/45 font-semibold uppercase tracking-wide mb-3">{{ langStore.t.createStep2Title }} · {{ members.length }}</p>
              <div class="space-y-0.5 max-h-52 overflow-y-auto -mx-1">
                <div v-for="m in members" :key="m.user_id"
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
                      <button @click="emit('toggle-role', m)" class="p-1 rounded-lg text-white/35 hover:text-brand-accent hover:bg-brand-accent/10 transition-colors"
                        :title="m.role === 'admin' ? langStore.t.chatDemoteAdminTitle : langStore.t.chatPromoteAdminTitle">
                        <BIcon :name="m.role === 'admin' ? 'ShieldOff' : 'ShieldCheck'" class="w-3.5 h-3.5" />
                      </button>
                      <button @click="emit('kick', m.user_id)" class="p-1 rounded-lg text-white/35 hover:text-brand-error hover:bg-brand-error/10 transition-colors" :title="langStore.t.chatKickMemberTitle">
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
            <button @click="emit('close')"
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
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
