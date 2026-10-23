import { watchEffect } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { activeBgImage, activeTheme, themeTokens } from '@/lib/theme'

/**
 * Применяет цветовую тему пользователя (настройки → Стиль профиля) ко всему приложению:
 * переопределяет токены `--color-brand-accent*` и поверхности `--color-brand-bg/card/border` на :root,
 * а свой фон (profile_bg_url, Pro+) — картинкой под всеми страницами. Профиль, группы и остальные
 * экраны берут цвета из этих токенов, поэтому отдельной логики на странице не нужно.
 * Вызывается один раз в App.vue.
 */
export function useAppTheme() {
  const auth = useAuthStore()
  const root = document.documentElement
  let applied: string[] = []

  watchEffect(() => {
    applied.forEach(name => root.style.removeProperty(name))
    applied = []
    const bg = activeBgImage(auth.user?.profile_bg_url, auth.user?.subscription_tier)
    root.classList.toggle('has-custom-bg', !!bg)
    if (bg) {
      root.style.setProperty('--app-bg-image', bg)
      applied.push('--app-bg-image')
    }
    const theme = activeTheme(auth.user?.profile_theme, auth.user?.subscription_tier)
    if (!theme) return
    for (const [name, value] of Object.entries(themeTokens(theme))) {
      root.style.setProperty(name, value)
      applied.push(name)
    }
  })
}
