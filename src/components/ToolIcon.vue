<template>
  <svg v-if="icon === 'pen'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
  <svg v-else-if="icon === 'hl'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 11l3 3m-2.5-2.5L4 17l5-1.5L19.5 5 15 3.5 9.5 8.5z M4 20l4-1" />
  </svg>
  <svg v-else-if="icon === 'eraser'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10M5.5 14.5L14 6l4.5 4.5-8.5 8.5H5.5v-4.5z" />
  </svg>
  <svg v-else-if="icon === 'hand'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 11V7a2 2 0 014 0v4m0-2a2 2 0 014 0v3m0-2a2 2 0 014 0v5a7 7 0 01-14 0V9a2 2 0 014 0v3" />
  </svg>
  <svg v-else-if="icon === 'select'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l14 7-6 2-2 6-6-15z" />
  </svg>
  <svg v-else-if="icon === 'line'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 20L20 4" />
  </svg>
  <svg v-else-if="icon === 'rect'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="4" y="4" width="16" height="16" rx="2" stroke-width="2" stroke="currentColor" />
  </svg>
  <svg v-else-if="icon === 'ellipse'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" stroke-width="2" stroke="currentColor" />
  </svg>
  <svg v-else-if="icon === 'arrow'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19L19 5M19 5v8M19 5H11" />
  </svg>
  <svg v-else-if="icon === 'text'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M12 6v14" />
  </svg>
  <svg v-else-if="icon === 'image'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2" stroke="currentColor" />
    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15l-5-5L5 21" />
  </svg>
</template>

<script setup lang="ts">
defineProps<{ icon: string }>()
</script>
