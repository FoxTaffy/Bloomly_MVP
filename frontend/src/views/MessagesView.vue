<template>
  <div class="min-h-screen bg-brand-dark flex flex-col">
    <!-- Header -->
    <AppHeader />

    <div class="flex flex-1 overflow-hidden">
      <!-- Sidebar -->
      <AppSidebar />

      <!-- Main content -->
      <main class="flex-1 flex items-center justify-center p-8">
        <div class="max-w-md w-full text-center space-y-6">
          <!-- Icon -->
          <div class="flex justify-center">
            <div class="w-24 h-24 rounded-3xl bg-brand-surface border border-brand-border flex items-center justify-center">
              <BIcon name="MessageCircle" class="w-12 h-12 text-brand-accent" />
            </div>
          </div>

          <!-- Title -->
          <div class="space-y-2">
            <h1 class="text-2xl font-bold text-white">Сообщения</h1>
            <p class="text-brand-muted text-sm leading-relaxed">
              Личные сообщения пока в разработке.<br />
              Скоро вы сможете общаться напрямую с друзьями.
            </p>
          </div>

          <!-- Back button -->
          <button
            @click="router.push({ name: 'home' })"
            class="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-brand-accent hover:bg-brand-accent/80 text-white text-sm font-semibold transition-all"
          >
            <BIcon name="ArrowLeft" class="w-4 h-4" />
            На главную
          </button>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'

const router = useRouter()
</script>
