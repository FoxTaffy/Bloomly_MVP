import { createApp } from 'vue'
import { createPinia } from 'pinia'
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
app.use(createPinia())
app.use(router)
app.use(head)

app.mount('#app')
