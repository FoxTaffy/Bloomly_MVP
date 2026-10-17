<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'

const router = useRouter()
const langStore = useLangStore()
</script>

<template>
  <div class="legal-root">
    <div class="legal-bg"></div>

    <div class="relative z-10 min-h-screen flex flex-col items-center px-4 py-12">
      <!-- Back button -->
      <div class="w-full max-w-3xl mb-8">
        <button @click="router.back()" class="back-btn">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Назад
        </button>
      </div>

      <div class="legal-card max-w-3xl w-full">
        <!-- Header -->
        <div class="mb-10">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/8 border border-white/12 text-xs font-bold text-white/50 mb-5">
            <span class="w-1.5 h-1.5 rounded-full bg-brand-purple"></span>
            bloomly.fun
          </div>
          <h1 class="text-3xl font-black text-white mb-2">{{ langStore.t.privacyTitle }}</h1>
          <p class="text-sm text-white/35">Последнее обновление: 1 июня 2026 г.</p>
        </div>

        <div class="legal-body">

          <section>
            <h2>1. Введение</h2>
            <p>Настоящая Политика конфиденциальности описывает, как платформа Bloomly («мы», «нас», «наш») собирает, использует и защищает ваши персональные данные. Используя Сервис, вы соглашаетесь с условиями настоящей Политики.</p>
          </section>

          <section>
            <h2>2. Какие данные мы собираем</h2>
            <p><strong>Данные, которые вы предоставляете:</strong></p>
            <ul>
              <li>Имя пользователя, email-адрес и пароль при регистрации.</li>
              <li>Информация профиля: аватар, имя, описание, дата рождения, местоположение.</li>
              <li>Контент, который вы публикуете: посты, комментарии, сообщения, медиафайлы.</li>
              <li>Данные о фурсоне и фурсьюте (при заполнении).</li>
            </ul>
            <p><strong>Данные, собираемые автоматически:</strong></p>
            <ul>
              <li>IP-адрес и приблизительное географическое местоположение.</li>
              <li>Информация о браузере, операционной системе и устройстве.</li>
              <li>Данные об активности: просмотры, лайки, подписки, время сессий.</li>
              <li>Файлы cookie и аналогичные технологии.</li>
            </ul>
            <p><strong>Данные от третьих лиц:</strong></p>
            <ul>
              <li>При входе через OAuth (Google, Яндекс, X, Twitch) — публичные данные профиля из этих сервисов.</li>
            </ul>
          </section>

          <section>
            <h2>3. Цели обработки данных</h2>
            <p>Мы используем ваши данные для:</p>
            <ul>
              <li>Предоставления и улучшения функций платформы.</li>
              <li>Персонализации ленты и рекомендаций контента.</li>
              <li>Обработки платежей и управления подписками.</li>
              <li>Обеспечения безопасности аккаунтов и борьбы с мошенничеством.</li>
              <li>Отправки уведомлений о деятельности на платформе.</li>
              <li>Соблюдения требований законодательства.</li>
              <li>Предоставления поддержки пользователям.</li>
            </ul>
          </section>

          <section>
            <h2>4. Хранение и защита данных</h2>
            <p>Данные хранятся на защищённых серверах в России и/или ЕС. Мы применяем шифрование в транзите (TLS) и в покое для чувствительных данных, включая пароли (bcrypt) и переписку.</p>
            <p>Срок хранения данных — в течение всего времени существования аккаунта плюс 90 дней после его удаления (для соблюдения законодательных требований). Резервные копии хранятся до 30 дней.</p>
          </section>

          <section>
            <h2>5. Передача данных третьим лицам</h2>
            <p>Мы не продаём ваши персональные данные. Данные могут передаваться:</p>
            <ul>
              <li><strong>Платёжным системам</strong> — для обработки транзакций.</li>
              <li><strong>Провайдерам OAuth</strong> — только в рамках процедуры аутентификации.</li>
              <li><strong>Сервисам хранения файлов</strong> — для хранения загруженного медиаконтента.</li>
              <li><strong>Аналитическим сервисам</strong> — в обезличенном виде для улучшения платформы.</li>
              <li><strong>Государственным органам</strong> — при наличии законного требования.</li>
            </ul>
          </section>

          <section>
            <h2>6. Ваши права</h2>
            <p>В соответствии с применимым законодательством вы имеете право:</p>
            <ul>
              <li><strong>Доступ:</strong> запросить копию ваших персональных данных.</li>
              <li><strong>Исправление:</strong> обновить или исправить неточные данные через настройки профиля.</li>
              <li><strong>Удаление:</strong> удалить аккаунт и связанные данные через настройки.</li>
              <li><strong>Ограничение обработки:</strong> ограничить использование ваших данных в определённых целях.</li>
              <li><strong>Переносимость:</strong> получить ваши данные в машиночитаемом формате.</li>
              <li><strong>Возражение:</strong> возражать против обработки в целях прямого маркетинга.</li>
            </ul>
            <p>Для реализации своих прав обратитесь по адресу: <span class="contact-link">privacy@bloomly.fun</span></p>
          </section>

          <section>
            <h2>7. Файлы cookie</h2>
            <p>Мы используем необходимые cookie для аутентификации и безопасности сессий, а также аналитические cookie (с вашего согласия) для понимания использования платформы. Вы можете управлять настройками cookie в своём браузере.</p>
          </section>

          <section>
            <h2>8. Несовершеннолетние</h2>
            <p>Мы не собираем намеренно данные детей до 13 лет. Если вам стало известно, что ребёнок зарегистрировался без родительского согласия, просьба сообщить нам по адресу <span class="contact-link">privacy@bloomly.fun</span>.</p>
          </section>

          <section>
            <h2>9. Изменения политики</h2>
            <p>Мы можем обновлять настоящую Политику. О существенных изменениях мы уведомим через приложение или по электронной почте. Продолжение использования Сервиса после вступления изменений в силу означает ваше согласие.</p>
          </section>

          <section>
            <h2>10. Контакты</h2>
            <p>По вопросам конфиденциальности: <span class="contact-link">privacy@bloomly.fun</span></p>
            <p>Общие вопросы: <span class="contact-link">support@bloomly.fun</span></p>
          </section>

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.legal-root {
  position: relative;
  min-height: 100svh;
  background: #080b1a;
  color: white;
  font-family: 'Nunito', sans-serif;
}

.legal-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 70% 50% at 80% 10%, rgba(205, 131, 245, 0.18) 0%, transparent 60%),
    radial-gradient(ellipse 50% 40% at 10% 80%, rgba(76, 103, 207, 0.14) 0%, transparent 55%),
    #080b1a;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.back-btn:hover {
  background: rgba(255, 255, 255, 0.09);
  color: rgba(255, 255, 255, 0.8);
}

.legal-card {
  background: rgba(12, 15, 32, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 24px;
  backdrop-filter: blur(32px);
  padding: 40px;
}
@media (max-width: 640px) {
  .legal-card { padding: 24px 20px; border-radius: 16px; }
}

.legal-body section {
  margin-bottom: 28px;
}
.legal-body section:last-child {
  margin-bottom: 0;
}

.legal-body h2 {
  font-size: 15px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.legal-body p {
  font-size: 14px;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 10px;
}
.legal-body p:last-child { margin-bottom: 0; }

.legal-body strong {
  color: rgba(255, 255, 255, 0.7);
  font-weight: 800;
}

.legal-body ul {
  list-style: none;
  padding: 0;
  margin: 8px 0 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.legal-body ul li {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.6;
  padding-left: 18px;
  position: relative;
}
.legal-body ul li::before {
  content: '·';
  position: absolute;
  left: 4px;
  color: rgba(205, 131, 245, 0.6);
  font-size: 18px;
  line-height: 1.2;
}

.contact-link {
  color: #cd83f5;
  font-weight: 700;
}
</style>
