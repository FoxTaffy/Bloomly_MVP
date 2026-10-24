<script setup lang="ts">
defineProps<{ modelValue: boolean; tone?: 'error' | 'accent' }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <button type="button" role="switch" :aria-checked="modelValue" @click="emit('update:modelValue', !modelValue)"
    class="w-12 h-6 rounded-full transition-all relative shrink-0"
    :class="modelValue ? (tone === 'accent' ? 'bg-brand-accent' : 'bg-brand-error') : 'bg-white/10'">
    <span class="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all shadow-md"
      :class="modelValue ? 'left-6' : 'left-0.5'" />
  </button>
</template>
