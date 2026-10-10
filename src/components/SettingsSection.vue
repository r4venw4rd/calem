<template>
  <details class="group mb-2 rounded-lg border border-[var(--chrome-border)]" :open="open">
    <summary
      class="flex items-center justify-between gap-2 px-2.5 py-2 cursor-pointer list-none select-none font-medium text-[var(--chrome-muted)] hover:text-[var(--chrome-title)]"
    >
      <span>{{ title }}</span>
      <span class="font-mono text-[10px] transition group-open:rotate-180">▾</span>
    </summary>
    <div class="px-2.5 pb-2.5 pt-1">
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
// Ayarlar panelindeki tüm bölümler aynı açılır-kapanır kabuğu paylaşır.
defineProps<{ title: string; open?: boolean }>()
</script>
