<script setup lang="ts">
import type { Project } from '@repo/contracts';
import { apiErrorMessage } from '~/utils/api';

const t = useT();
useHead({ title: () => t('projects.title') });

const { data: projects, error } = await useFetch<Project[]>('/api/projects', { default: () => [] });
const errorMessage = computed(() => (error.value === undefined ? null : apiErrorMessage(error.value)));

const locale = useLocaleTag();
const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }));
</script>

<template>
  <section class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">
        {{ t('projects.title') }}
      </h1>
      <NuxtLink
        to="/import"
        class="inline-flex min-h-target items-center gap-2 rounded-md border border-accent bg-accent px-4 font-semibold text-on-accent"
      >
        <UIcon
          name="i-lucide-file-plus"
          class="size-4"
          aria-hidden="true"
        />
        {{ t('projects.import_cta') }}
      </NuxtLink>
    </div>
    <p
      v-if="errorMessage !== null"
      class="rounded-md border border-error p-4 text-error"
      role="alert"
    >
      {{ t(errorMessage) }}
    </p>
    <ul
      v-else-if="projects.length > 0"
      class="flex flex-col gap-2"
    >
      <li
        v-for="project in projects"
        :key="project.id"
        class="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-line bg-surface-1 p-4"
        data-project
      >
        <span class="font-semibold">{{ project.title }}</span>
        <span class="text-sm text-ink-muted">{{ t('projects.updated', { date: dateFormat.format(new Date(project.updatedAt)) }) }}</span>
      </li>
    </ul>
    <div
      v-else
      class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface-1 px-6 py-12 text-center"
    >
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
