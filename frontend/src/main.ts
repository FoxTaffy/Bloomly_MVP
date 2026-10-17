import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { useLangStore } from './stores/lang'
import { createHead } from '@unhead/vue/legacy'
import './assets/style.css'
import 'flag-icons/css/flag-icons.min.css'
import App from './App.vue'
import router from './router'
import { clickOutside } from './directives/clickOutside'

const app = createApp(App)
const head = createHead()
app.directive('click-outside', clickOutside)

// Порядок важен: Pinia должна быть до Router,
// чтобы useAuthStore() внутри navigation guard работал корректно.
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(head)

// Словарь выбранного языка грузится отдельным чанком — монтируем после него
useLangStore(pinia).ready.finally(() => app.mount('#app'))
