import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './assets/style.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)

// Порядок важен: Pinia должна быть до Router,
// чтобы useAuthStore() внутри navigation guard работал корректно.
app.use(createPinia())
app.use(router)

app.mount('#app')
