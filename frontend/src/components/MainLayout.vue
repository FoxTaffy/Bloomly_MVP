<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  Search, Bell, MessageCircle, LogOut, Home, Compass, User, Settings,
  Image as ImageIcon, MapPin, Plus, Calendar, Heart, MessageSquare, Bookmark, TrendingUp, ChevronRight
} from 'lucide-vue-next'

const router = useRouter()
const auth = useAuthStore()
const activeNav = ref('home')
const postContent = ref('')

const handleLogout = () => { auth.logout(); router.push({ name: 'login' }) }
</script>

<template>
  <div class="min-h-screen bg-[#16192F] text-white font-sans">
    <header class="fixed top-0 inset-x-0 h-16 bg-[#1F223C] border-b border-[#2A2D45] flex items-center justify-between px-6 z-50">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 bg-gradient-to-br from-[#4C67CF] to-[#7B5EA7] rounded-lg flex items-center justify-center font-bold">B</div>
        <span class="text-xl font-black tracking-tighter">Bloomly</span>
      </div>
      <div class="flex-1 max-w-md mx-4 relative">
        <Search class="absolute left-3 top-2.5 h-4 w-4 text-gray-500" />
        <input type="text" placeholder="Поиск..." class="w-full bg-[#16192F] border border-[#2A2D45] rounded-xl py-2 pl-10 pr-4 text-sm outline-none focus:border-[#4C67CF]" />
      </div>
      <div class="flex items-center gap-4">
        <Bell class="h-5 w-5 text-gray-400" />
        <button @click="handleLogout" class="text-gray-400 hover:text-red-400 transition-colors"><LogOut class="h-5 w-5" /></button>
      </div>
    </header>

    <div class="max-w-6xl mx-auto flex pt-20 px-4 gap-6">
      <aside class="w-64 hidden lg:block sticky top-20 h-fit">
        <div class="bg-[#1F223C] border border-[#2A2D45] rounded-2xl p-4 text-center mb-6">
          <img :src="auth.avatarUrl" class="w-16 h-16 rounded-2xl mx-auto mb-3 ring-2 ring-[#4C67CF]" />
          <h3 class="font-bold">{{ auth.displayName }}</h3>
          <p class="text-xs text-gray-500">@{{ auth.user?.username }}</p>
        </div>
        <nav class="space-y-1">
          <button v-for="i in ['home','explore','messages','profile']" :key="i" @click="activeNav = i" 
            class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all"
            :class="activeNav === i ? 'bg-[#4C67CF] text-white shadow-lg' : 'text-gray-400 hover:bg-[#1F223C]'">
            <component :is="i === 'home' ? Home : i === 'explore' ? Compass : i === 'messages' ? MessageCircle : User" class="w-5 h-5" />
            <span class="capitalize">{{ i }}</span>
          </button>
        </nav>
      </aside>

      <main class="flex-1 max-w-2xl space-y-6">
        <div class="bg-[#1F223C] border border-[#2A2D45] rounded-2xl p-4">
          <textarea v-model="postContent" placeholder="Что нового?" class="w-full bg-[#16192F] border border-[#2A2D45] rounded-xl p-3 text-sm outline-none focus:border-[#4C67CF] resize-none h-24 mb-4"></textarea>
          <div class="flex justify-between items-center border-t border-[#2A2D45] pt-3">
            <div class="flex gap-2 text-gray-500"><ImageIcon class="w-5 h-5" /><MapPin class="w-5 h-5" /></div>
            <button class="bg-[#4C67CF] px-6 py-2 rounded-xl text-sm font-bold hover:bg-[#5a77e0]">Пост</button>
          </div>
        </div>

        <div class="bg-[#1F223C] border border-[#2A2D45] rounded-2xl overflow-hidden">
          <div class="p-4 flex items-center gap-3">
            <div class="w-10 h-10 bg-[#4C67CF] rounded-xl flex items-center justify-center font-bold">B</div>
            <div><p class="text-sm font-bold">Bloomly Team</p><p class="text-xs text-gray-500">Официальное событие</p></div>
          </div>
          <img src="https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&q=80" class="w-full h-64 object-cover" />
          <div class="p-4">
            <h2 class="text-lg font-bold mb-2">Добро пожаловать в Bloomly!</h2>
            <p class="text-sm text-gray-400 mb-4">Это ваш новый социальный хаб. Исследуйте, общайтесь и делитесь контентом.</p>
            <div class="flex gap-4 border-t border-[#2A2D45] pt-4 text-gray-500">
              <button class="flex items-center gap-1.5 hover:text-red-400"><Heart class="w-5 h-5" /> 128</button>
              <button class="flex items-center gap-1.5 hover:text-[#4C67CF]"><MessageSquare class="w-5 h-5" /> 32</button>
              <Bookmark class="ml-auto w-5 h-5 hover:text-[#4C67CF]" />
            </div>
          </div>
        </div>
      </main>
    </div>
  </div>
</template>
