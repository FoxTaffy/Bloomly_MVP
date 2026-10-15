<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { useConfirm } from '@/composables/useConfirm'
import { maskEmail } from '@/lib/utils'

// "Security & login" settings: password, e-mail, two-factor auth, linked OAuth accounts, active sessions.
const emit = defineEmits<{ (e: 'toast', type: 'success' | 'error', message: string): void }>()
const authStore = useAuthStore()
const langStore = useLangStore()
const route = useRoute()
const router = useRouter()
const { confirmDialog } = useConfirm()
const showToast = (type: 'success' | 'error', message: string) => emit('toast', type, message)

// ── Change password ──────────────────────────────────────────────────────
const showChangePassword = ref(false)
const pwForm    = reactive({ current: '', next: '', confirm: '' })
const pwSaving  = ref(false)
const pwError   = ref('')
const pwSuccess = ref('')

async function submitChangePassword() {
  pwError.value = ''
  pwSuccess.value = ''
  if (pwForm.next.length < 8) { pwError.value = langStore.t.passwordTooShort; return }
  if (pwForm.next !== pwForm.confirm) { pwError.value = langStore.t.passwordsDontMatch; return }
  pwSaving.value = true
  try {
    await authStore.changePassword(pwForm.next, pwForm.current)
    pwSuccess.value = langStore.t.passwordChangedMsg
    pwForm.current = ''; pwForm.next = ''; pwForm.confirm = ''
    setTimeout(() => { showChangePassword.value = false; pwSuccess.value = '' }, 2000)
  } catch (e: any) {
    pwError.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  } finally {
    pwSaving.value = false
  }
}

// ── Forgot password (settings) ───────────────────────────────────────────
const showForgotPassword = ref(false)
const fpCodeSent = ref(false)
const fpSending  = ref(false)
const fpForm     = reactive({ code: '', next: '', confirm: '' })
const fpSaving   = ref(false)
const fpError    = ref('')
const fpSuccess  = ref('')

async function startForgotPassword() {
  fpError.value = ''; fpSuccess.value = ''
  fpSending.value = true
  try {
    await authStore.forgotPassword(authStore.user!.email)
    fpCodeSent.value = true
  } catch (e: any) {
    fpError.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  } finally {
    fpSending.value = false
  }
}

async function submitForgotPassword() {
  fpError.value = ''; fpSuccess.value = ''
  if (fpForm.next.length < 8) { fpError.value = langStore.t.passwordTooShort; return }
  if (fpForm.next !== fpForm.confirm) { fpError.value = langStore.t.passwordsDontMatch; return }
  fpSaving.value = true
  try {
    await authStore.resetPassword(authStore.user!.email, fpForm.code, fpForm.next)
    fpSuccess.value = langStore.t.passwordChangedMsg
    fpForm.code = ''; fpForm.next = ''; fpForm.confirm = ''
    setTimeout(() => { showForgotPassword.value = false; fpCodeSent.value = false; fpSuccess.value = '' }, 2000)
  } catch (e: any) {
    fpError.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  } finally {
    fpSaving.value = false
  }
}

// ── Change email ──────────────────────────────────────────────────────────
const showChangeEmail = ref(false)
const ecCodeSent = ref(false)
const ecSending  = ref(false)
const ecForm     = reactive({ code: '', newEmail: '' })
const ecSaving   = ref(false)
const ecError    = ref('')
const ecSuccess  = ref('')

async function startChangeEmail() {
  ecError.value = ''; ecSuccess.value = ''
  ecSending.value = true
  try {
    await authStore.requestEmailChange()
    ecCodeSent.value = true
  } catch (e: any) {
    ecError.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  } finally {
    ecSending.value = false
  }
}

async function submitChangeEmail() {
  ecError.value = ''; ecSuccess.value = ''
  if (!ecForm.newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ecForm.newEmail)) {
    ecError.value = langStore.t.invalidEmailMsg
    return
  }
  ecSaving.value = true
  try {
    await authStore.confirmEmailChange(ecForm.code, ecForm.newEmail)
    ecSuccess.value = langStore.t.emailChangedMsg
    ecForm.code = ''; ecForm.newEmail = ''
    setTimeout(() => { showChangeEmail.value = false; ecCodeSent.value = false; ecSuccess.value = '' }, 2000)
  } catch (e: any) {
    ecError.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  } finally {
    ecSaving.value = false
  }
}

// ── Two-factor authentication: TOTP ────────────────────────────────────────
const showTotpSetup = ref(false)
const totpQr      = ref('')
const totpSecret  = ref('')
const totpCode    = ref('')
const totpSaving  = ref(false)
const totpError   = ref('')
const totpSuccess = ref('')

async function startTotpSetup() {
  totpError.value = ''; totpSuccess.value = ''
  try {
    const { secret, qrDataUrl } = await authStore.setupTotp()
    totpSecret.value = secret
    totpQr.value = qrDataUrl
  } catch (e: any) {
    totpError.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  }
}

async function submitTotpConfirm() {
  totpError.value = ''; totpSuccess.value = ''
  totpSaving.value = true
  try {
    await authStore.confirmTotp(totpCode.value)
    totpSuccess.value = langStore.t.twoFactorEnabledMsg
    totpCode.value = ''
    setTimeout(() => { showTotpSetup.value = false; totpQr.value = ''; totpSecret.value = ''; totpSuccess.value = '' }, 2000)
  } catch (e: any) {
    totpError.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  } finally {
    totpSaving.value = false
  }
}

// ── Two-factor authentication: код на почту ─────────────────────────────────
const showEmail2fa       = ref(false)
const email2faCodeSent   = ref(false)
const email2faSending    = ref(false)
const email2faCode       = ref('')
const email2faSaving     = ref(false)
const email2faError      = ref('')
const email2faSuccess    = ref('')

async function startEmail2fa() {
  email2faError.value = ''; email2faSuccess.value = ''
  email2faSending.value = true
  try {
    await authStore.enableEmail2fa()
    email2faCodeSent.value = true
  } catch (e: any) {
    email2faError.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  } finally {
    email2faSending.value = false
  }
}

async function submitEmail2fa() {
  email2faError.value = ''; email2faSuccess.value = ''
  email2faSaving.value = true
  try {
    await authStore.confirmEmail2fa(email2faCode.value)
    email2faSuccess.value = langStore.t.twoFactorEnabledMsg
    email2faCode.value = ''
    setTimeout(() => { showEmail2fa.value = false; email2faCodeSent.value = false; email2faSuccess.value = '' }, 2000)
  } catch (e: any) {
    email2faError.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  } finally {
    email2faSaving.value = false
  }
}

// ── Two-factor authentication: отключение ────────────────────────────────────
const showDisable2fa      = ref(false)
const disable2faPassword  = ref('')
const disable2faSaving    = ref(false)
const disable2faError     = ref('')

async function submitDisable2fa() {
  disable2faError.value = ''
  disable2faSaving.value = true
  try {
    await authStore.disableTwoFactor(disable2faPassword.value)
    disable2faPassword.value = ''
    showDisable2fa.value = false
    showTotpSetup.value = false
    showEmail2fa.value = false
  } catch (e: any) {
    disable2faError.value = e?.response?.data?.error?.message ?? e?.message ?? 'Error'
  } finally {
    disable2faSaving.value = false
  }
}

// ── Linked OAuth accounts ──────────────────────────────────────────────────
const linkedAccounts        = ref<string[]>([])
const linkedAccountsLoading = ref(false)
const linkingProvider       = ref<string | null>(null)
const unlinkingProvider     = ref<string | null>(null)

const oauthProviders = computed(() => [
  {
    key: 'yandex', label: langStore.t.settingsProfileYandex, color: '#fc3f1d', iconFill: true,
    iconPath: 'M14.155 4H12.25c-2.77 0-4.455 1.514-4.455 4.006 0 2.148 1.022 3.395 3.074 4.7L13 13.945 8.5 20H11l4.795-6.64-1.396-.894c-1.713-1.1-2.487-1.934-2.487-3.558C11.912 7.48 12.804 6.5 14.155 6.5V4zM14.5 4v16h2.5V4h-2.5z',
  },
  {
    key: 'google', label: 'Google', color: '#4285f4', iconFill: true,
    iconPath: 'M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 110-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0012.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z',
  },
  {
    key: 'twitter', label: 'X (Twitter)', color: '#ffffff', iconFill: true,
    iconPath: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L2.25 2.25h6.918l4.259 5.63 4.817-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  },
  {
    key: 'twitch', label: 'Twitch', color: '#9146ff', iconFill: true,
    iconPath: 'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z',
  },
])

async function loadLinkedAccounts() {
  linkedAccountsLoading.value = true
  try {
    const { data } = await api.get('/auth/linked-accounts')
    linkedAccounts.value = data.data.accounts.map((a: { provider: string }) => a.provider)
  } catch { /* ignore */ } finally {
    linkedAccountsLoading.value = false
  }
}

async function linkProvider(provider: string) {
  linkingProvider.value = provider
  try {
    const { data } = await api.get(`/auth/link-init/${provider}`)
    sessionStorage.setItem('oauth_started', '1')
    window.location.href = data.data.url
  } catch (e: any) {
    showToast('error', e.response?.data?.error?.message ?? langStore.t.settingsProfileLinkError)
    linkingProvider.value = null
  }
}

async function unlinkProvider(provider: string) {
  unlinkingProvider.value = provider
  try {
    await api.delete(`/auth/linked-accounts/${provider}`)
    linkedAccounts.value = linkedAccounts.value.filter(p => p !== provider)
    showToast('success', langStore.t.settingsProfileUnlinkedSuccess)
  } catch (e: any) {
    showToast('error', e.response?.data?.error?.message ?? langStore.t.settingsProfileUnlinkError)
  } finally {
    unlinkingProvider.value = null
  }
}

// ── Устройства и активные сессии ────────────────────────────────────────────
interface DeviceSession {
  id: string
  device_name: string | null
  ip_address: string | null
  created_at: string
  last_used_at: string
  current: boolean
}
const sessions            = ref<DeviceSession[]>([])
const sessionsLoading     = ref(false)
const revokingSessionId   = ref<string | null>(null)
const revokingOthers      = ref(false)

async function loadSessions() {
  sessionsLoading.value = true
  try {
    const { data } = await api.get('/auth/sessions')
    sessions.value = data.data.sessions
  } catch { /* ignore */ } finally {
    sessionsLoading.value = false
  }
}

async function revokeSession(id: string) {
  if (!(await confirmDialog(langStore.t.revokeConfirm, { danger: true }))) return
  revokingSessionId.value = id
  try {
    await api.delete(`/auth/sessions/${id}`)
    sessions.value = sessions.value.filter(s => s.id !== id)
    showToast('success', langStore.t.revokeBtn)
  } catch (e: any) {
    showToast('error', e.response?.data?.error?.message ?? langStore.t.settingsProfileGenericError)
  } finally {
    revokingSessionId.value = null
  }
}

async function revokeOtherSessions() {
  if (!(await confirmDialog(langStore.t.revokeAllOthersConfirm, { danger: true }))) return
  revokingOthers.value = true
  try {
    await api.delete('/auth/sessions/other')
    sessions.value = sessions.value.filter(s => s.current)
    showToast('success', langStore.t.revokeAllOthersBtn)
  } catch (e: any) {
    showToast('error', e.response?.data?.error?.message ?? langStore.t.settingsProfileGenericError)
  } finally {
    revokingOthers.value = false
  }
}

onMounted(() => {
  loadLinkedAccounts()
  loadSessions()
  // Тосты после OAuth привязки
  const linkedParam = route.query.linked as string | undefined
  const errorParam  = route.query.error  as string | undefined
  if (linkedParam) {
    const providerLabel = oauthProviders.value.find(p => p.key === linkedParam)?.label ?? linkedParam
    showToast('success', `${providerLabel} ${langStore.t.settingsProfileLinkedSuccessSuffix}`)
    // убираем парам из URL
    router.replace({ query: { ...route.query, linked: undefined, error: undefined } })
  } else if (errorParam === 'already_taken') {
    showToast('error', langStore.t.settingsProfileAccountAlreadyLinked)
    router.replace({ query: { ...route.query, linked: undefined, error: undefined } })
  }
})
</script>

<template>
  <section id="sec-security" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
    <div class="px-6 py-4 border-b border-brand-border flex items-center gap-3" style="background:linear-gradient(90deg,rgba(16,185,129,0.07) 0%,transparent 100%)">
      <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(16,185,129,0.15)">
        <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
        </svg>
      </div>
      <h2 class="font-bold text-white text-sm">{{ langStore.t.securityLoginTitle }}</h2>
    </div>
    <div class="p-6 space-y-3">
      <!-- Пароль -->
      <div class="flex items-center justify-between p-4 rounded-2xl border border-brand-border bg-brand-bg/60">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <BIcon name="Lock" class="w-4.5 h-4.5 text-white/70" />
          </div>
          <div>
            <p class="text-sm font-semibold text-white">{{ langStore.t.passwordLabel }}</p>
            <p class="text-xs text-white/45">••••••••</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-2.5 py-1 rounded-lg text-xs font-bold" style="background:rgba(16,185,129,0.15);color:#34d399">{{ langStore.t.activeLabel }}</span>
          <button type="button" @click="showChangePassword = !showChangePassword"
            class="px-3 py-1.5 rounded-xl text-xs font-bold text-white/60 border border-brand-border hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all">
            {{ langStore.t.changePasswordBtn }}
          </button>
        </div>
      </div>

      <!-- Смена пароля -->
      <Transition name="fade">
        <div v-if="showChangePassword" class="p-4 rounded-2xl border border-brand-border bg-brand-bg/60 space-y-3">
          <div>
            <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-1.5">{{ langStore.t.currentPasswordLabel }}</label>
            <input v-model="pwForm.current" type="password" autocomplete="current-password" class="field-input" />
          </div>
          <div>
            <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-1.5">{{ langStore.t.newPasswordLabel }}</label>
            <input v-model="pwForm.next" type="password" autocomplete="new-password" minlength="8" maxlength="128" class="field-input" />
          </div>
          <div>
            <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-1.5">{{ langStore.t.confirmPasswordLabel }}</label>
            <input v-model="pwForm.confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" class="field-input" />
          </div>
          <p v-if="pwError" class="text-xs text-brand-error/80">{{ pwError }}</p>
          <p v-if="pwSuccess" class="text-xs text-emerald-400">{{ pwSuccess }}</p>
          <div class="flex items-center justify-between gap-3">
            <button type="button" @click="submitChangePassword" :disabled="pwSaving"
              class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-500/80 hover:bg-emerald-500 transition-all disabled:opacity-50">
              {{ pwSaving ? langStore.t.savingLabel : langStore.t.changePasswordBtn }}
            </button>
            <button type="button" @click="showForgotPassword = !showForgotPassword"
              class="text-xs font-semibold text-white/45 hover:text-white/70 transition-colors">
              {{ langStore.t.forgotPasswordSettingsBtn }}
            </button>
          </div>
        </div>
      </Transition>

      <!-- Забыли пароль — сброс кодом на почту -->
      <Transition name="fade">
        <div v-if="showForgotPassword" class="p-4 rounded-2xl border border-brand-border bg-brand-bg/60 space-y-3">
          <p class="text-xs text-white/45">{{ maskEmail(authStore.user?.email) }}</p>
          <button v-if="!fpCodeSent" type="button" @click="startForgotPassword" :disabled="fpSending"
            class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-white/10 hover:bg-white/15 transition-all disabled:opacity-50">
            {{ fpSending ? langStore.t.savingLabel : langStore.t.sendCodeBtn }}
          </button>
          <template v-else>
            <p class="text-xs text-emerald-400">{{ langStore.t.codeSentHint }}</p>
            <div>
              <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-1.5">{{ langStore.t.otpCodeLabel }}</label>
              <input v-model="fpForm.code" type="text" inputmode="numeric" maxlength="6" class="field-input" />
            </div>
            <div>
              <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-1.5">{{ langStore.t.newPasswordLabel }}</label>
              <input v-model="fpForm.next" type="password" autocomplete="new-password" minlength="8" maxlength="128" class="field-input" />
            </div>
            <div>
              <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-1.5">{{ langStore.t.confirmPasswordLabel }}</label>
              <input v-model="fpForm.confirm" type="password" autocomplete="new-password" minlength="8" maxlength="128" class="field-input" />
            </div>
            <button type="button" @click="submitForgotPassword" :disabled="fpSaving"
              class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-500/80 hover:bg-emerald-500 transition-all disabled:opacity-50">
              {{ fpSaving ? langStore.t.savingLabel : langStore.t.changePasswordBtn }}
            </button>
          </template>
          <p v-if="fpError" class="text-xs text-brand-error/80">{{ fpError }}</p>
          <p v-if="fpSuccess" class="text-xs text-emerald-400">{{ fpSuccess }}</p>
        </div>
      </Transition>

      <!-- Смена email -->
      <div class="flex items-center justify-between p-4 rounded-2xl border border-brand-border bg-brand-bg/60">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <svg class="w-4.5 h-4.5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <div>
            <p class="text-sm font-semibold text-white">{{ langStore.t.emailLabel }}</p>
            <p class="text-xs text-white/45">{{ maskEmail(authStore.user?.email) }}</p>
          </div>
        </div>
        <button type="button" @click="showChangeEmail = !showChangeEmail"
          class="px-3 py-1.5 rounded-xl text-xs font-bold text-white/60 border border-brand-border hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all">
          {{ langStore.t.changeEmailBtn }}
        </button>
      </div>

      <Transition name="fade">
        <div v-if="showChangeEmail" class="p-4 rounded-2xl border border-brand-border bg-brand-bg/60 space-y-3">
          <button v-if="!ecCodeSent" type="button" @click="startChangeEmail" :disabled="ecSending"
            class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-white/10 hover:bg-white/15 transition-all disabled:opacity-50">
            {{ ecSending ? langStore.t.savingLabel : langStore.t.sendCodeBtn }}
          </button>
          <template v-else>
            <p class="text-xs text-emerald-400">{{ langStore.t.codeSentHint }}</p>
            <div>
              <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-1.5">{{ langStore.t.otpCodeLabel }}</label>
              <input v-model="ecForm.code" type="text" inputmode="numeric" maxlength="6" class="field-input" />
            </div>
            <div>
              <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-1.5">{{ langStore.t.newEmailLabel }}</label>
              <input v-model="ecForm.newEmail" type="email" autocomplete="email" class="field-input" />
            </div>
            <button type="button" @click="submitChangeEmail" :disabled="ecSaving"
              class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-500/80 hover:bg-emerald-500 transition-all disabled:opacity-50">
              {{ ecSaving ? langStore.t.savingLabel : langStore.t.changeEmailBtn }}
            </button>
          </template>
          <p v-if="ecError" class="text-xs text-brand-error/80">{{ ecError }}</p>
          <p v-if="ecSuccess" class="text-xs text-emerald-400">{{ ecSuccess }}</p>
        </div>
      </Transition>

      <!-- Двухфакторная аутентификация: приложение-аутентификатор -->
      <div class="flex items-center justify-between p-4 rounded-2xl border border-brand-border bg-brand-bg/60">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <BIcon name="Smartphone" class="w-4.5 h-4.5 text-white/70" />
          </div>
          <div>
            <p class="text-sm font-semibold text-white">{{ langStore.t.totpMethodLabel }}</p>
            <p class="text-xs text-white/45">{{ authStore.user?.two_factor_method === 'totp' ? langStore.t.twoFactorActiveLabel : langStore.t.twoFactorInactiveLabel }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span v-if="authStore.user?.two_factor_method === 'totp'" class="px-2.5 py-1 rounded-lg text-xs font-bold" style="background:rgba(16,185,129,0.15);color:#34d399">{{ langStore.t.activeLabel }}</span>
          <button v-if="authStore.user?.two_factor_method === 'totp'" type="button" @click="showDisable2fa = !showDisable2fa"
            class="px-3 py-1.5 rounded-xl text-xs font-bold text-red-400 border border-red-500/20 hover:border-red-500/50 bg-red-500/5 hover:bg-red-500/10 transition-all">
            {{ langStore.t.disable2faBtn }}
          </button>
          <button v-else type="button" @click="showTotpSetup = !showTotpSetup; if (showTotpSetup && !totpQr) startTotpSetup()"
            class="px-3 py-1.5 rounded-xl text-xs font-bold text-white/60 border border-brand-border hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all">
            {{ langStore.t.enable2faBtn }}
          </button>
        </div>
      </div>

      <Transition name="fade">
        <div v-if="showTotpSetup" class="p-4 rounded-2xl border border-brand-border bg-brand-bg/60 space-y-3">
          <p v-if="authStore.user?.two_factor_method === 'email'" class="text-xs text-amber-400/90">{{ langStore.t.twoFactorReplaceHint }}</p>
          <div v-if="totpQr" class="flex flex-col items-center gap-3 py-2">
            <img :src="totpQr" alt="QR" class="w-40 h-40 rounded-xl bg-white p-2" />
            <p class="text-xs text-white/45 text-center">{{ langStore.t.totpScanHint }}</p>
            <p class="text-[11px] font-mono text-white/60 tracking-wider break-all text-center px-3">{{ totpSecret }}</p>
          </div>
          <div>
            <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-1.5">{{ langStore.t.otpCodeLabel }}</label>
            <input :value="totpCode" @input="(e:Event)=>totpCode=(e.target as HTMLInputElement).value.replace(/\D+/g,'').slice(0,6)" type="text" inputmode="numeric" maxlength="6" class="field-input" />
          </div>
          <p v-if="totpError" class="text-xs text-brand-error/80">{{ totpError }}</p>
          <p v-if="totpSuccess" class="text-xs text-emerald-400">{{ totpSuccess }}</p>
          <button type="button" @click="submitTotpConfirm" :disabled="totpSaving"
            class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-500/80 hover:bg-emerald-500 transition-all disabled:opacity-50">
            {{ totpSaving ? langStore.t.savingLabel : langStore.t.confirmBtn }}
          </button>
        </div>
      </Transition>

      <!-- Двухфакторная аутентификация: код на почту -->
      <div class="flex items-center justify-between p-4 rounded-2xl border border-brand-border bg-brand-bg/60">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
            <BIcon name="MailCheck" class="w-4.5 h-4.5 text-white/70" />
          </div>
          <div>
            <p class="text-sm font-semibold text-white">{{ langStore.t.emailMethodLabel }}</p>
            <p class="text-xs text-white/45">{{ authStore.user?.two_factor_method === 'email' ? langStore.t.twoFactorActiveLabel : langStore.t.twoFactorInactiveLabel }}</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span v-if="authStore.user?.two_factor_method === 'email'" class="px-2.5 py-1 rounded-lg text-xs font-bold" style="background:rgba(16,185,129,0.15);color:#34d399">{{ langStore.t.activeLabel }}</span>
          <button v-if="authStore.user?.two_factor_method === 'email'" type="button" @click="showDisable2fa = !showDisable2fa"
            class="px-3 py-1.5 rounded-xl text-xs font-bold text-red-400 border border-red-500/20 hover:border-red-500/50 bg-red-500/5 hover:bg-red-500/10 transition-all">
            {{ langStore.t.disable2faBtn }}
          </button>
          <button v-else type="button" @click="showEmail2fa = !showEmail2fa"
            class="px-3 py-1.5 rounded-xl text-xs font-bold text-white/60 border border-brand-border hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all">
            {{ langStore.t.enable2faBtn }}
          </button>
        </div>
      </div>

      <Transition name="fade">
        <div v-if="showEmail2fa" class="p-4 rounded-2xl border border-brand-border bg-brand-bg/60 space-y-3">
          <p v-if="authStore.user?.two_factor_method === 'totp'" class="text-xs text-amber-400/90">{{ langStore.t.twoFactorReplaceHint }}</p>
          <button v-if="!email2faCodeSent" type="button" @click="startEmail2fa" :disabled="email2faSending"
            class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-white/10 hover:bg-white/15 transition-all disabled:opacity-50">
            {{ email2faSending ? langStore.t.savingLabel : langStore.t.sendCodeBtn }}
          </button>
          <template v-else>
            <p class="text-xs text-emerald-400">{{ langStore.t.codeSentHint }}</p>
            <div>
              <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-1.5">{{ langStore.t.otpCodeLabel }}</label>
              <input :value="email2faCode" @input="(e:Event)=>email2faCode=(e.target as HTMLInputElement).value.replace(/\D+/g,'').slice(0,6)" type="text" inputmode="numeric" maxlength="6" class="field-input" />
            </div>
            <button type="button" @click="submitEmail2fa" :disabled="email2faSaving"
              class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-500/80 hover:bg-emerald-500 transition-all disabled:opacity-50">
              {{ email2faSaving ? langStore.t.savingLabel : langStore.t.confirmBtn }}
            </button>
          </template>
          <p v-if="email2faError" class="text-xs text-brand-error/80">{{ email2faError }}</p>
          <p v-if="email2faSuccess" class="text-xs text-emerald-400">{{ email2faSuccess }}</p>
        </div>
      </Transition>

      <!-- Отключение 2FA (требует пароль) -->
      <Transition name="fade">
        <div v-if="showDisable2fa" class="p-4 rounded-2xl border border-red-500/20 bg-red-500/5 space-y-3">
          <div>
            <label class="text-xs font-bold text-white/55 uppercase tracking-wider block mb-1.5">{{ langStore.t.currentPasswordLabel }}</label>
            <input v-model="disable2faPassword" type="password" autocomplete="current-password" class="field-input" />
          </div>
          <p v-if="disable2faError" class="text-xs text-brand-error/80">{{ disable2faError }}</p>
          <button type="button" @click="submitDisable2fa" :disabled="disable2faSaving"
            class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-500/80 hover:bg-red-500 transition-all disabled:opacity-50">
            {{ disable2faSaving ? langStore.t.savingLabel : langStore.t.disable2faBtn }}
          </button>
        </div>
      </Transition>

      <!-- OAuth провайдеры -->
      <div v-if="linkedAccountsLoading" class="flex justify-center py-6">
        <span class="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></span>
      </div>
      <template v-else>
        <div
          v-for="p in oauthProviders"
          :key="p.key"
          class="flex items-center justify-between p-4 rounded-2xl border transition-all"
          :class="linkedAccounts.includes(p.key) ? 'border-brand-border bg-brand-bg/60' : 'border-brand-border/50 bg-brand-bg/30'"
        >
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" :style="`background:${p.color}22`">
              <svg class="w-5 h-5" :fill="p.iconFill ? p.color : 'none'" :stroke="p.iconFill ? 'none' : p.color" :stroke-width="p.iconFill ? '0' : '1.8'" viewBox="0 0 24 24">
                <path :d="p.iconPath" />
              </svg>
            </div>
            <div>
              <p class="text-sm font-semibold text-white">{{ p.label }}</p>
              <p class="text-xs text-white/45">{{ linkedAccounts.includes(p.key) ? langStore.t.linkedLabel : langStore.t.notLinkedLabel }}</p>
            </div>
          </div>
          <button
            v-if="!linkedAccounts.includes(p.key)"
            type="button"
            @click="linkProvider(p.key)"
            :disabled="linkingProvider === p.key"
            class="px-4 py-1.5 rounded-xl text-xs font-bold text-white border border-brand-border hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all disabled:opacity-50"
          >
            <span v-if="linkingProvider === p.key" class="flex items-center gap-1.5">
              <span class="w-3 h-3 border border-t-transparent border-white rounded-full animate-spin"></span>{{ langStore.t.linkingLabel }}
            </span>
            <span v-else>{{ langStore.t.linkBtn }}</span>
          </button>
          <button
            v-else
            type="button"
            @click="unlinkProvider(p.key)"
            :disabled="unlinkingProvider === p.key"
            class="px-4 py-1.5 rounded-xl text-xs font-bold text-red-400 border border-red-500/20 hover:border-red-500/50 bg-red-500/5 hover:bg-red-500/10 transition-all disabled:opacity-50"
          >
            <span v-if="unlinkingProvider === p.key" class="flex items-center gap-1.5">
              <span class="w-3 h-3 border border-t-transparent border-red-400 rounded-full animate-spin"></span>
            </span>
            <span v-else>{{ langStore.t.unlinkBtn }}</span>
          </button>
        </div>
      </template>

      <!-- Устройства и активные сессии -->
      <div class="pt-5 mt-2 border-t border-brand-border">
        <div class="flex items-center justify-between mb-3">
          <div>
            <p class="text-sm font-semibold text-white">{{ langStore.t.devicesTitle }}</p>
            <p class="text-xs text-white/45">{{ langStore.t.devicesDesc }}</p>
          </div>
          <button
            v-if="sessions.filter(s => !s.current).length > 0"
            type="button"
            @click="revokeOtherSessions"
            :disabled="revokingOthers"
            class="px-3 py-1.5 rounded-xl text-xs font-bold text-red-400 border border-red-500/20 hover:border-red-500/50 bg-red-500/5 hover:bg-red-500/10 transition-all disabled:opacity-50 whitespace-nowrap"
          >{{ langStore.t.revokeAllOthersBtn }}</button>
        </div>

        <div v-if="sessionsLoading" class="flex justify-center py-6">
          <span class="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></span>
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="s in sessions" :key="s.id"
            class="flex items-center justify-between p-4 rounded-2xl border transition-all"
            :class="s.current ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-brand-border/50 bg-brand-bg/30'"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                <svg class="w-4.5 h-4.5 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </div>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-white truncate">
                  {{ s.device_name ?? langStore.t.unknownDeviceLabel }}
                  <span v-if="s.current" class="ml-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold align-middle" style="background:rgba(16,185,129,0.15);color:#34d399">{{ langStore.t.currentSessionBadge }}</span>
                </p>
                <p class="text-xs text-white/45 truncate">
                  {{ s.ip_address ?? '—' }} · {{ langStore.t.lastActiveLabel }} {{ new Date(s.last_used_at).toLocaleString() }}
                </p>
              </div>
            </div>
            <button
              v-if="!s.current"
              type="button"
              @click="revokeSession(s.id)"
              :disabled="revokingSessionId === s.id"
              class="px-4 py-1.5 rounded-xl text-xs font-bold text-red-400 border border-red-500/20 hover:border-red-500/50 bg-red-500/5 hover:bg-red-500/10 transition-all disabled:opacity-50 flex-shrink-0"
            >
              <span v-if="revokingSessionId === s.id" class="flex items-center gap-1.5">
                <span class="w-3 h-3 border border-t-transparent border-red-400 rounded-full animate-spin"></span>
              </span>
              <span v-else>{{ langStore.t.revokeBtn }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
