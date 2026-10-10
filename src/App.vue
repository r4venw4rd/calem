<script setup>
import { Analytics } from '@vercel/analytics/vue';
</script>

<template>
  <Analytics />
  <RouterView />
</template>

<style>
html, body { height: 100%; margin: 0; overflow: hidden; }
</style>
