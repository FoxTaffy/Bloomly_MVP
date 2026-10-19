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
          <h1 class="text-3xl font-black text-white mb-2">Соглашение Dealers' Den для групп</h1>
          <p class="text-sm text-white/35">Последнее обновление: 19 октября 2026 г.</p>
        </div>

        <div class="legal-body">

          <section>
            <h2>1. Предмет соглашения</h2>
            <p>Настоящее Соглашение действует в дополнение к Условиям использования и Политике конфиденциальности Bloomly и применяется к владельцу группы («Владелец»), который подключает к группе раздел Dealers' Den («Площадка») и публикует лоты от имени группы. Подключая Площадку, Владелец подтверждает, что прочитал и принимает это Соглашение.</p>
          </section>

          <section>
            <h2>2. Условия подключения</h2>
            <ul>
              <li>Подключить Площадку может только владелец группы.</li>
              <li>Владелец должен пройти верификацию как художник, мастер или владелец магазина.</li>
              <li>Группа должна иметь тип «Творческая» или «Магазин».</li>
              <li>Сведения, указанные при верификации, должны быть достоверными и актуальными.</li>
            </ul>
          </section>

          <section>
            <h2>3. Публикация лотов от имени группы</h2>
            <p>Лоты публикуются от имени группы и отображаются на её странице и в общем каталоге Площадки. Владелец отвечает за содержание, цену, сроки и условия каждого лота, а также за права на материалы, которые в нём используются.</p>
            <p>Bloomly не является стороной сделки между продавцом и покупателем и не гарантирует результат сделки.</p>
          </section>

          <section>
            <h2>4. Правила поведения на Площадке</h2>
            <p>Владелец обязуется:</p>
            <ul>
              <li>Добросовестно выполнять принятые заказы в указанные сроки либо своевременно возвращать оплату.</li>
              <li>Давать покупателям точное описание товара или услуги и не вводить их в заблуждение.</li>
              <li>Вести общение вежливо и не принуждать покупателей к оплате вне Площадки.</li>
              <li>Не продавать запрещённые законом товары, чужие работы без разрешения автора, а также контент, запрещённый Условиями использования.</li>
              <li>Не использовать накрутку отзывов, подставные аккаунты и иные способы манипуляции рейтингом.</li>
            </ul>
          </section>

          <section>
            <h2>5. Мошенничество и санкции</h2>
            <p>При мошенничестве, систематическом невыполнении заказов или нарушении настоящего Соглашения Bloomly вправе без предварительного уведомления:</p>
            <ul>
              <li>снять лоты с публикации и отключить Площадку в группе;</li>
              <li>заморозить или заблокировать аккаунт Владельца и группу;</li>
              <li>отменить верификацию и передать сведения правоохранительным органам по их запросу.</li>
            </ul>
          </section>

          <section>
            <h2>6. Обработка данных</h2>
            <p>Для работы Площадки обрабатываются данные верификации, сведения о лотах, заказах и переписке между сторонами сделки. Порядок их обработки описан в Политике конфиденциальности. Владелец обязуется использовать данные покупателей только для выполнения заказов.</p>
          </section>

          <section>
            <h2>7. Отключение Площадки</h2>
            <p>Владелец может отключить Площадку в любой момент. До отключения он обязан выполнить уже принятые заказы. Bloomly вправе изменять это Соглашение, уведомив пользователей на Площадке.</p>
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
