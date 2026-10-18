import type { Ref } from 'vue'
import { useHead } from '@unhead/vue'
import type { UserProfile } from '@/stores/user'

/** <head> tags (title, description, OpenGraph, Twitter, JSON-LD) of a public profile page. */
export function useProfileSeo(viewedProfile: Ref<UserProfile | null>, routeUsername: () => unknown) {
  const BASE = 'https://bloomly.fun'
  useHead({
    title: () => {
      if (!viewedProfile.value) return 'Bloomly'
      const name = viewedProfile.value.display_name || viewedProfile.value.username
      return `${name} (@${viewedProfile.value.username}) — Bloomly`
    },
    meta: [
      { name: 'robots', content: () => (!viewedProfile.value || (viewedProfile.value as { profile_visibility?: string }).profile_visibility === 'friends' || (viewedProfile.value as { profile_visibility?: string }).profile_visibility === 'only_me') ? 'noindex, nofollow' : 'index, follow' },
      { name: 'description', content: () => {
          if (!viewedProfile.value) return 'Bloomly — Creative Social Network.'
          const name = viewedProfile.value.display_name || viewedProfile.value.username
          return (viewedProfile.value.bio)
            ? `${viewedProfile.value.bio.slice(0, 155)}…`
            : `${name}'s profile on Bloomly — the creative social network.`
        }
      },
      { property: 'og:type', content: 'profile' },
      { property: 'og:site_name', content: 'Bloomly' },
      { property: 'og:title', content: () => {
          if (!viewedProfile.value) return 'Bloomly'
          const name = viewedProfile.value.display_name || viewedProfile.value.username
          return `${name} (@${viewedProfile.value.username})`
        }
      },
      { property: 'og:description', content: () => {
          if (!viewedProfile.value) return ''
          const name = viewedProfile.value.display_name || viewedProfile.value.username
          return viewedProfile.value.bio?.slice(0, 200) || `${name}'s profile on Bloomly.`
        }
      },
      { property: 'og:image', content: () => viewedProfile.value?.avatar_url || `${BASE}/og-default.png` },
      { property: 'og:url', content: () => `${BASE}/profile/${viewedProfile.value?.username || routeUsername()}` },
      { name: 'twitter:card', content: 'summary' },
      { name: 'twitter:title', content: () => {
          if (!viewedProfile.value) return 'Bloomly'
          return `${viewedProfile.value.display_name || viewedProfile.value.username} (@${viewedProfile.value.username})`
        }
      },
      { name: 'twitter:image', content: () => viewedProfile.value?.avatar_url || `${BASE}/og-default.png` },
    ],
    link: [
      { rel: 'canonical', href: () => `${BASE}/profile/${viewedProfile.value?.username || routeUsername()}` },
    ],
    script: [
      {
        type: 'application/ld+json',
        innerHTML: () => {
          if (!viewedProfile.value) return ''
          const name = viewedProfile.value.display_name || viewedProfile.value.username
          return JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'ProfilePage',
            name,
            url: `${BASE}/profile/${viewedProfile.value.username}`,
            description: viewedProfile.value.bio || '',
            ...(viewedProfile.value.avatar_url ? {
              image: { '@type': 'ImageObject', url: viewedProfile.value.avatar_url },
            } : {}),
          })
        },
      },
    ],
  })
}
