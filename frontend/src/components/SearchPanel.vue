<template>
  <div class="bg-brand-card/70 backdrop-blur-md border border-brand-border p-4 rounded-2xl mb-6">
    <div class="relative mb-4">
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <BIcon name="Search" class="h-5 w-5 text-brand-muted" />
      </div>
      <input
        type="text"
        v-model="searchQuery"
        @input="onSearchInput"
        placeholder="Search posts..."
        class="block w-full pl-10 pr-3 py-2.5 border border-brand-border rounded-xl leading-5 bg-brand-bg text-brand-offwhite placeholder-brand-muted focus:outline-none focus:ring-1 focus:ring-brand-accent focus:border-brand-accent text-sm transition-all"
      />
    </div>

    <div class="categories-scroll flex overflow-x-auto space-x-2 pb-2 hide-scrollbar">
      <button
        v-for="category in categories"
        :key="category.id"
        @click="selectCategory(category.id)"
        :class="[
          'px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200',
          selectedCategory === category.id
            ? 'bg-brand-accent text-white shadow-lg shadow-brand-accent/30'
            : 'bg-brand-bg border border-brand-border text-brand-muted hover:text-brand-offwhite hover:border-brand-accent/40'
        ]"
      >
        {{ category.name }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import BIcon from './BIcon.vue';

const props = defineProps<{
  modelValue: string;
  selectedCategory: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'update:selectedCategory', value: string): void;
  (e: 'search'): void;
}>();

const searchQuery = ref(props.modelValue);
const categories = ref([
  { id: '', name: 'All' },
  { id: 'digital_art', name: 'Digital Art' },
  { id: 'photography', name: 'Photography' },
  { id: '3d', name: '3D' },
  { id: 'animation', name: 'Animation' },
  { id: 'writing', name: 'Writing' },
  { id: 'other', name: 'Other' },
]);

let debounceTimeout: ReturnType<typeof setTimeout>;

const onSearchInput = () => {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    emit('update:modelValue', searchQuery.value);
    emit('search');
  }, 300);
};

const selectCategory = (categoryId: string) => {
  emit('update:selectedCategory', categoryId);
  emit('search');
};

watch(() => props.modelValue, (newValue) => {
  if (newValue !== searchQuery.value) {
    searchQuery.value = newValue;
  }
});
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
