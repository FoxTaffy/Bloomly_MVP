<template>
  <a
    v-if="ad"
    :href="safeHref(ad.link_url)"
    target="_blank"
    rel="noopener noreferrer sponsored"
    @click="trackClick"
    class="block bg-brand-card border border-brand-accent/25 rounded-3xl overflow-hidden shadow-xl hover:border-brand-accent/50 transition-all group"
    :class="variant === 'hero' ? 'flex flex-col sm:flex-row' : ''"
  >
    <img
      v-if="ad.image_url"
      :src="ad.image_url"
      class="object-cover"
      :class="variant === 'hero' ? 'w-full sm:w-56 h-36 sm:h-auto shrink-0' : 'w-full max-h-28'"
    />
    <div class="px-4 py-3 flex-1 min-w-0" :class="variant === 'hero' ? 'flex flex-col justify-center' : ''">
      <span class="text-[9px] font-bold uppercase tracking-wider text-brand-accent bg-brand-accent/10 px-2 py-0.5 rounded-full border border-brand-accent/20">
        Реклама
      </span>
      <p class="font-bold text-white group-hover:text-brand-accent transition-colors leading-snug mt-1.5" :class="variant === 'hero' ? 'text-base' : 'text-xs'">
        {{ ad.title }}
      </p>
      <p v-if="ad.description" class="text-white/55 mt-0.5" :class="variant === 'hero' ? 'text-sm line-clamp-2' : 'text-[11px] line-clamp-2'">
        {{ ad.description }}
      </p>
    </div>
  </a>

  <!-- Empty placement: invite an advertiser -->
  <button
    v-else
    type="button"
    @click="showRequestModal = true"
    class="w-full text-left border border-dashed border-white/10 rounded-3xl overflow-hidden hover:border-brand-accent/30 hover:bg-white/3 transition-all group"
    :class="variant === 'hero' ? 'flex items-center gap-4 px-5 py-5' : 'px-4 py-5'"
  >
    <div
      class="rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center shrink-0 group-hover:border-brand-accent/30 transition-colors"
      :class="variant === 'hero' ? 'w-14 h-14' : 'w-10 h-10 mb-2.5'"
    >
      <BIcon name="Megaphone" class="text-white/25 group-hover:text-brand-accent/70 transition-colors" :class="variant === 'hero' ? 'w-6 h-6' : 'w-5 h-5'" />
    </div>
    <div class="min-w-0">
      <p class="font-bold text-white/50 group-hover:text-white/80 transition-colors" :class="variant === 'hero' ? 'text-sm' : 'text-xs'">
        Здесь может быть ваша реклама
      </p>
      <p class="text-white/25 mt-0.5" :class="variant === 'hero' ? 'text-xs' : 'text-[11px]'">
        Разместите баннер на Bloomly за BLM — нажмите, чтобы выбрать срок
      </p>
    </div>
  </button>

  <AdRequestModal v-model="showRequestModal" :placement="placement" />
</template>

<script setup lang="ts">
import { safeHref } from '@/utils/safeHref'
import { ref, watch } from 'vue'
import BIcon from '../BIcon.vue'
import AdRequestModal from './AdRequestModal.vue'
import api from '@/api'

const props = defineProps<{
  ad?: { id: string; title: string; description?: string | null; image_url?: string | null; link_url: string } | null
  variant?: 'sidebar' | 'hero'
  /** Место этого слота — окно покупки откроется сразу на нём */
  placement?: 'feed_top' | 'groups_page' | 'left_menu' | 'right_column'
}>()

const showRequestModal = ref(false)

let trackedImpressionFor: string | null = null
watch(() => props.ad?.id, (id) => {
  if (id && id !== trackedImpressionFor) {
    trackedImpressionFor = id
    api.post(`/admin/ads/${id}/impression`).catch(() => null)
  }
}, { immediate: true })

function trackClick() {
  if (props.ad?.id) api.post(`/admin/ads/${props.ad.id}/click`).catch(() => null)
}
</script>
