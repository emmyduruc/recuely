<script setup lang="ts">
const t = useT();
useHead({ title: () => t('projects.title') });
</script>

<template>
  <section class="flex flex-col gap-6">
    <h1 class="text-2xl font-semibold">
      {{ t('projects.title') }}
    </h1>
    <div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface-1 px-6 py-12 text-center">
      <UIcon
        name="i-lucide-folder-open"
        class="size-8 text-ink-subtle"
        aria-hidden="true"
      />
      <h2 class="text-lg font-semibold">
        {{ t('projects.empty_title') }}
      </h2>
      <p class="text-ink-muted">
        {{ t('projects.empty_hint') }}
      </p>
    </div>
  </section>
</template>
