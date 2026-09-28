<script setup lang="ts">
// App shell (SPEC.md §B9): skip link, header with navigation and theme switch, main content.
import { Theme } from '@repo/contracts';

const t = useT();
const colorMode = useColorMode();
const { designPageEnabled } = useRuntimeConfig().public;

const isLight = computed(() => colorMode.value === Theme.Light);

function toggleTheme(): void {
  colorMode.preference = isLight.value ? Theme.Dark : Theme.Light;
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-canvas text-ink">
    <a
      href="#main"
      class="sr-only rounded-md bg-accent px-4 py-2 text-on-accent focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
    >{{ t('app.skip_to_content') }}</a>
    <header class="border-b border-line bg-surface-1">
      <div class="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-4 px-4">
        <NuxtLink
          to="/"
          class="mr-auto flex min-h-target items-center gap-2 font-semibold sm:mr-0"
        >
          <UIcon
            name="i-lucide-clapperboard"
            class="size-5 text-accent"
            aria-hidden="true"
          />
          <span>{{ t('app.name') }}</span>
        </NuxtLink>
        <nav
          :aria-label="t('nav.primary')"
          class="order-last -mx-3 flex w-full items-center gap-1 sm:order-none sm:mx-0 sm:w-auto sm:flex-1"
        >
          <NuxtLink
            to="/"
            class="flex min-h-target items-center rounded-md px-3 text-ink-muted hover:text-ink aria-[current=page]:text-ink"
          >
            {{ t('nav.projects') }}
          </NuxtLink>
          <NuxtLink
            v-if="designPageEnabled"
            to="/_design"
            class="flex min-h-target items-center rounded-md px-3 text-ink-muted hover:text-ink aria-[current=page]:text-ink"
          >
            {{ t('nav.design') }}
          </NuxtLink>
        </nav>
        <ClientOnly>
          <button
            type="button"
            class="inline-flex size-target items-center justify-center rounded-md border border-line-strong text-ink"
            :aria-label="isLight ? t('theme.switch_to_dark') : t('theme.switch_to_light')"
            data-theme-toggle
            @click="toggleTheme"
          >
            <UIcon
              :name="isLight ? 'i-lucide-moon' : 'i-lucide-sun'"
              class="size-5"
              aria-hidden="true"
            />
          </button>
        </ClientOnly>
      </div>
    </header>
    <main
      id="main"
      tabindex="-1"
      class="mx-auto w-full max-w-6xl flex-1 px-4 py-8"
    >
      <slot />
    </main>
  </div>
</template>
