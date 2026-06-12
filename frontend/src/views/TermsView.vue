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
            <span class="w-1.5 h-1.5 rounded-full bg-[#7b9cff]"></span>
            bloomly.fun
          </div>
          <h1 class="text-3xl font-black text-white mb-2">{{ langStore.t.termsTitle }}</h1>
          <p class="text-sm text-white/35">Последнее обновление: 1 июня 2026 г.</p>
        </div>

        <div class="legal-body">

          <section>
            <h2>1. Общие положения</h2>
            <p>Настоящие Условия использования («Условия») регулируют отношения между пользователями и платформой Bloomly («Сервис», «Платформа»), доступной по адресу bloomly.fun. Регистрируясь и используя Сервис, вы соглашаетесь соблюдать настоящие Условия.</p>
          </section>

          <section>
            <h2>2. Регистрация и аккаунт</h2>
            <p>Для использования Сервиса необходима регистрация. Вы обязуетесь:</p>
            <ul>
              <li>Предоставлять достоверную и актуальную информацию при регистрации.</li>
              <li>Хранить свои учётные данные в тайне и нести ответственность за все действия, совершённые с вашего аккаунта.</li>
              <li>Незамедлительно уведомлять нас о несанкционированном доступе к вашему аккаунту.</li>
              <li>Не создавать несколько аккаунтов с целью обхода ограничений или модерации.</li>
            </ul>
            <p>Минимальный возраст для регистрации — 13 лет. Пользователи до 18 лет могут использовать Сервис только с разрешения родителей или законных представителей.</p>
          </section>

          <section>
            <h2>3. Правила поведения и контент</h2>
            <p>Пользователи несут ответственность за весь публикуемый контент. Запрещается:</p>
            <ul>
              <li>Публиковать материалы, нарушающие законодательство РФ и международное право.</li>
              <li>Размещать CSAM, пропаганду насилия, экстремизма или терроризма.</li>
              <li>Преследовать, запугивать или угрожать другим пользователям.</li>
              <li>Распространять спам, вредоносное ПО, фишинговые материалы.</li>
              <li>Публиковать персональные данные третьих лиц без их согласия (доксинг).</li>
              <li>Нарушать авторские права и права на товарные знаки.</li>
            </ul>
            <p>Контент для взрослых (18+/NSFW) разрешён только в специально отмеченных разделах при наличии подтверждённого возраста.</p>
          </section>

          <section>
            <h2>4. Интеллектуальная собственность</h2>
            <p>Публикуя контент на платформе, вы сохраняете все права на него, но предоставляете Bloomly неисключительную лицензию на хранение, отображение, распространение и продвижение вашего контента в рамках работы Сервиса.</p>
            <p>Все объекты интеллектуальной собственности Bloomly (логотип, дизайн, программный код) принадлежат платформе и не могут использоваться без письменного разрешения.</p>
          </section>

          <section>
            <h2>5. Монетизация и Premium-подписки</h2>
            <p>Платформа предлагает платные подписки (Lite, Pro, Business) и внутреннюю валюту. Все платежи обрабатываются через сторонние платёжные системы. Возврат средств осуществляется в соответствии с применимым законодательством в течение 14 дней с момента покупки, при условии что услуга не была использована.</p>
            <p>Bloomly оставляет за собой право изменять тарифы, предварительно уведомив пользователей за 30 дней.</p>
          </section>

          <section>
            <h2>6. Модерация и санкции</h2>
            <p>Bloomly оставляет за собой право без предварительного уведомления удалять контент, блокировать или удалять аккаунты, нарушающие настоящие Условия. При систематических нарушениях возможна перманентная блокировка с запретом регистрации новых аккаунтов.</p>
          </section>

          <section>
            <h2>7. Ограничение ответственности</h2>
            <p>Сервис предоставляется «как есть» без каких-либо гарантий. Bloomly не несёт ответственности за убытки, возникшие в результате использования или невозможности использования Сервиса, за действия третьих лиц или за точность пользовательского контента.</p>
          </section>

          <section>
            <h2>8. Изменения условий</h2>
            <p>Мы можем обновлять настоящие Условия. О существенных изменениях мы уведомим пользователей через приложение или по электронной почте не менее чем за 14 дней. Продолжение использования Сервиса после вступления изменений в силу означает ваше согласие с новыми Условиями.</p>
          </section>

          <section>
            <h2>9. Применимое право</h2>
            <p>Настоящие Условия регулируются законодательством Российской Федерации. Все споры подлежат разрешению в суде по месту нахождения Bloomly.</p>
          </section>

          <section>
            <h2>10. Контакты</h2>
            <p>По вопросам, связанным с настоящими Условиями, обращайтесь: <span class="contact-link">support@bloomly.fun</span></p>
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
    radial-gradient(ellipse 70% 50% at 20% 10%, rgba(76, 103, 207, 0.2) 0%, transparent 60%),
    radial-gradient(ellipse 50% 40% at 80% 80%, rgba(205, 131, 245, 0.14) 0%, transparent 55%),
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
  color: rgba(123, 156, 255, 0.6);
  font-size: 18px;
  line-height: 1.2;
}

.contact-link {
  color: #7b9cff;
  font-weight: 700;
}
</style>
