<template>
  <div class="emoji-picker w-72 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden flex flex-col" style="max-height: 320px">
    <!-- Search -->
    <div class="px-2 pt-2 pb-1 shrink-0">
      <div class="flex items-center gap-1.5 bg-brand-bg rounded-xl px-2.5 py-1.5 border border-brand-border/60">
        <BIcon name="Search" class="w-3 h-3 text-white/55 shrink-0" />
        <input
          v-model="search"
          type="text"
          placeholder="Поиск эмодзи..."
          class="bg-transparent text-xs text-white placeholder-brand-muted outline-hidden w-full"
        />
      </div>
    </div>

    <!-- Category tabs -->
    <div v-if="!search" class="flex items-center gap-0.5 px-2 pb-1 shrink-0 overflow-x-auto hide-scrollbar">
      <button
        v-for="cat in CATEGORIES"
        :key="cat.id"
        @click="activeCat = cat.id"
        :class="[
          'shrink-0 w-7 h-7 rounded-lg text-base flex items-center justify-center transition-all',
          activeCat === cat.id ? 'bg-brand-accent/20 ring-1 ring-brand-accent/40' : 'hover:bg-brand-bg',
        ]"
        :title="cat.label"
      >{{ cat.icon }}</button>
    </div>

    <!-- Emoji grid -->
    <div ref="gridEl" class="flex-1 overflow-y-auto px-1.5 pb-2 min-h-0">
      <div v-if="filtered.length" class="grid grid-cols-8 gap-0.5">
        <button
          v-for="emoji in filtered"
          :key="emoji"
          @click="$emit('pick', emoji)"
          class="w-8 h-8 text-lg flex items-center justify-center rounded-lg hover:bg-brand-bg transition-all active:scale-90"
          :title="emoji"
        >{{ emoji }}</button>
      </div>
      <div v-else class="flex items-center justify-center py-6 text-white/55 text-xs">
        Ничего не найдено
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import BIcon from '@/components/BIcon.vue'

defineEmits<{ (e: 'pick', emoji: string): void }>()

const search = ref('')
const activeCat = ref('smileys')
const gridEl = ref<HTMLElement | null>(null)

const CATEGORIES = [
  { id: 'smileys',  icon: '😀', label: 'Смайлы' },
  { id: 'people',   icon: '👋', label: 'Люди' },
  { id: 'animals',  icon: '🐶', label: 'Животные' },
  { id: 'food',     icon: '🍕', label: 'Еда' },
  { id: 'travel',   icon: '✈️', label: 'Путешествия' },
  { id: 'objects',  icon: '💡', label: 'Объекты' },
  { id: 'symbols',  icon: '❤️', label: 'Символы' },
  { id: 'flags',    icon: '🚩', label: 'Флаги' },
]

const EMOJIS: Record<string, string[]> = {
  smileys: ['😀','😁','😂','🤣','😃','😄','😅','😆','😇','😈','🤗','🤔','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑','😲','🙁','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵','🥶','😳','🤪','😵','🥴','😠','😡','🤬','😷','🤒','🤕','🤢','🤧','🥳','🤠','🥸','🤡','👿','💀','☠️','💩','👻','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾'],
  people: ['👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦵','🦶','👂','🦻','👃','🧠','🫁','🫀','🦷','🦴','👀','👁️','👅','👄','🤦','🤷','💃','🕺','🧍','🧎','🏃','🧑','👦','👧','🧒','👩','👨','👶','🧓','👴','👵'],
  animals: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦏','🦛','🍀'],
  food: ['🍕','🍔','🍟','🌭','🍿','🧂','🥓','🥚','🍳','🧇','🥞','🧈','🍞','🥐','🥖','🫓','🥨','🥯','🧀','🥗','🥙','🥪','🌮','🌯','🫔','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🥠','🥡','🍦','🍧','🍨','🍩','🍪','🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍷','🍸','🍹','🥂','🍾','🍺','🥤','🧃','☕','🍵'],
  travel: ['✈️','🚀','🛸','🚁','🛺','🚗','🚕','🚙','🚌','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🚲','🛴','🛹','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','⛵','🚤','🛥️','🛳️','⛴️','🚢','🌍','🌎','🌏','🗺️','🗾','🧭','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏗️','🏘️','🏙️','🏚️','🏛️','🏟️','🏠','🏡','🏢','🏣'],
  objects: ['💡','🔦','🕯️','🔌','🔋','📱','💻','🖥️','🖨️','⌨️','🖱️','🖲️','💾','💿','📀','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','⏱️','⏲️','⏰','🕰️','⌚','📡','🔭','🔬','🩺','🩻','💊','💉','🩹','🧬','🦠','🧪','🧫','🧲','💣','🔫','🪖','🛡️','🪛','🔧','🔨','⚙️','🗜️','⚖️','🔗','⛓️','🪝','🧰','🪜','🧲','🔩','🔐','🔏','🔒','🔓'],
  symbols: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','🕍','🛕','⚡','🌈','☁️','⛅','🌤️','🌥️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️','💨','🌀','🌊','🌫️','🌈','💥','💫','⭐','🌟','✨','🎇','🎆','🌙','☀️','🌞','⭕','✅','❌','❎','💠','🔵','🟣','⚫','⚪','🟤','🔴','🟠','🟡','🟢','🔶','🔷','🔸','🔹'],
  flags: ['🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇷🇺','🇺🇸','🇬🇧','🇩🇪','🇫🇷','🇯🇵','🇨🇳','🇰🇷','🇮🇳','🇧🇷','🇦🇺','🇨🇦','🇮🇹','🇪🇸','🇵🇹','🇵🇱','🇺🇦','🇧🇾','🇰🇿','🇦🇿','🇦🇲','🇬🇪','🇹🇷','🇮🇷','🇮🇱','🇸🇦','🇦🇪','🇪🇬','🇿🇦','🇳🇬','🇲🇽','🇦🇷','🇨🇱','🇨🇴','🇵🇪','🇻🇪','🇸🇬','🇹🇭','🇻🇳','🇮🇩','🇵🇭','🇲🇾'],
}

const SEARCH_INDEX = Object.values(EMOJIS).flat()

const filtered = computed(() => {
  if (search.value.trim()) {
    // Simple search: filter emojis. In real world you'd have emoji names, but here
    // we just return smileys + animals + food filtered by text match on the emoji itself
    const q = search.value.toLowerCase()
    // Return all emojis that "contain" the query - basic mapping of emojis to keywords
    return SEARCH_INDEX.filter((e) => KEYWORD_MAP[e]?.some((k) => k.includes(q))) || EMOJIS.smileys.slice(0, 32)
  }
  return EMOJIS[activeCat.value] ?? []
})

// Basic keyword map for search (abbreviated)
const KEYWORD_MAP: Record<string, string[]> = {
  '😀': ['smile','happy','grinning'],
  '😂': ['laugh','cry','tears'],
  '🤣': ['rolling','laugh','floor'],
  '😊': ['smile','blush','happy'],
  '😍': ['love','heart','eyes'],
  '🥰': ['love','hearts','smiling'],
  '😘': ['kiss','love','heart'],
  '😭': ['cry','sob','sad'],
  '😢': ['cry','sad','tear'],
  '😡': ['angry','mad','rage'],
  '🤔': ['thinking','hmm'],
  '👍': ['thumbs up','ok','good','yes'],
  '👎': ['thumbs down','bad','no'],
  '❤️': ['heart','love','red'],
  '🔥': ['fire','hot','flame'],
  '💀': ['skull','dead','death'],
  '🎉': ['party','celebrate','confetti'],
  '🎊': ['party','celebrate'],
  '💯': ['100','perfect','score'],
  '✅': ['check','yes','done','ok'],
  '❌': ['cross','no','error'],
  '🐶': ['dog','puppy','animal'],
  '🐱': ['cat','kitten','animal'],
  '🐻': ['bear','animal'],
  '🦊': ['fox','animal'],
  '🍕': ['pizza','food'],
  '🍔': ['burger','hamburger','food'],
  '🍟': ['fries','food'],
  '☕': ['coffee','drink','hot'],
  '🎮': ['game','gaming','controller'],
  '🎵': ['music','note','song'],
}
</script>
