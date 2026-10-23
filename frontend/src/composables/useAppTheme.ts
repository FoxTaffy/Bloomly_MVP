import { watchEffect } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { activeTheme, themeTokens } from '@/lib/theme'

/**
 * Применяет цветовую тему пользователя (настройки → Стиль профиля) ко всему приложению:
 * переопределяет токены `--color-brand-accent*` и поверхности `--color-brand-bg/card/border` на :root. Профиль, группы и остальные
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
    const theme = activeTheme(auth.user?.profile_theme, auth.user?.subscription_tier)
    if (!theme) return
    for (const [name, value] of Object.entries(themeTokens(theme))) {
      root.style.setProperty(name, value)
      applied.push(name)
    }
  })
}
