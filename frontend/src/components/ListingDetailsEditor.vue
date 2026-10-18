<template>
  <div class="bg-white/3 border border-white/8 rounded-2xl p-4 stack-y-4">
    <p class="text-xs font-bold text-white/50 uppercase tracking-wider">Подробности карточки</p>

    <template v-if="commission">
      <div class="stack-y-2">
        <div class="flex items-center justify-between">
          <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">Форматы и цены</label>
          <button type="button" class="add" @click="draft.formats.length < 8 && draft.formats.push({ name: '', price: '' })">+ Добавить</button>
        </div>
        <div v-for="(f, i) in draft.formats" :key="i" class="flex gap-2">
          <input v-model="f.name" maxlength="40" placeholder="Халфбоди" class="inp flex-1" />
          <input v-model.number="f.price" type="number" min="0" placeholder="Цена" class="inp w-28" />
          <button type="button" class="del" @click="draft.formats.splice(i, 1)">✕</button>
        </div>
      </div>

      <div class="stack-y-2">
        <div class="flex items-center justify-between">
          <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">Дополнительно</label>
          <button type="button" class="add" @click="draft.addons.length < 12 && draft.addons.push({ name: '', hint: '', price: '' })">+ Добавить</button>
        </div>
        <div v-for="(a, i) in draft.addons" :key="i" class="flex gap-2 flex-wrap">
          <input v-model="a.name" maxlength="60" placeholder="Детальный фон" class="inp flex-1 min-w-32" />
          <input v-model="a.hint" maxlength="120" placeholder="Пояснение" class="inp flex-1 min-w-32" />
          <input v-model.number="a.price" type="number" min="0" placeholder="+Цена" class="inp w-24" />
          <button type="button" class="del" @click="draft.addons.splice(i, 1)">✕</button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="stack-y-1.5">
          <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">Рисую (через запятую)</label>
          <input v-model="draft.draws" placeholder="Фурри, Антро, Ферал" class="inp w-full" />
        </div>
        <div class="stack-y-1.5">
          <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">Не рисую (через запятую)</label>
          <input v-model="draft.doesntDraw" placeholder="Меха, Гуро" class="inp w-full" />
        </div>
      </div>

      <div class="stack-y-1.5">
        <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">Условия</label>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input v-model="draft.terms.revisions" maxlength="80" placeholder="Правки: 2 на эскизе" class="inp" />
          <input v-model="draft.terms.file" maxlength="80" placeholder="Файл: 3000×3000, PNG" class="inp" />
          <input v-model="draft.terms.rights" maxlength="80" placeholder="Права: личное использование" class="inp" />
          <input v-model="draft.terms.refund" maxlength="80" placeholder="Возврат: до старта эскиза" class="inp" />
          <input v-model="draft.terms.languages" maxlength="80" placeholder="Общение: RU · EN" class="inp" />
        </div>
      </div>
    </template>

    <div class="stack-y-2">
      <div class="flex items-center justify-between">
        <label class="text-[10px] font-bold text-white/35 uppercase tracking-wider">Блоки характеристик (призы, комплектация, размеры…)</label>
        <button type="button" class="add" @click="draft.sections.length < 4 && draft.sections.push({ title: '', items: [{ label: '', value: '' }] })">+ Блок</button>
      </div>
      <div v-for="(s, si) in draft.sections" :key="si" class="rounded-xl border border-white/8 p-3 stack-y-2">
        <div class="flex gap-2">
          <input v-model="s.title" maxlength="40" placeholder="Заголовок блока, напр. «Комплектация»" class="inp flex-1" />
          <button type="button" class="del" @click="draft.sections.splice(si, 1)">✕</button>
        </div>
        <div v-for="(it, ii) in s.items" :key="ii" class="flex gap-2">
          <input v-model="it.label" maxlength="40" placeholder="Название" class="inp w-2/5" />
          <input v-model="it.value" maxlength="80" placeholder="Значение" class="inp flex-1" />
          <button type="button" class="del" @click="s.items.splice(ii, 1)">✕</button>
        </div>
        <button type="button" class="add" @click="s.items.length < 12 && s.items.push({ label: '', value: '' })">+ Строка</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DetailsDraft } from '@/lib/listingDetails'
const props = defineProps<{ draft: DetailsDraft; commission: boolean }>()
</script>

<style scoped>
.inp { background: #0a0a1a; border: 1px solid rgba(255,255,255,0.1); border-radius: 0.75rem; padding: 0.55rem 0.75rem; font-size: 0.8rem; color: #fff; outline: none; }
.inp:focus { border-color: rgba(255,255,255,0.3); }
.add { font-size: 0.7rem; font-weight: 700; color: #93b4ff; }
.add:hover { color: #fff; }
.del { width: 2rem; flex-shrink: 0; border-radius: 0.6rem; background: rgba(255,0,0,0.08); color: rgba(255,120,120,0.8); font-size: 0.75rem; }
</style>
