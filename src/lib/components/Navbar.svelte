<script lang="ts" module>
  import { logEvent, plausible } from '$lib/util/stats';
  import { version } from 'mermaid/package.json';

  void logEvent('version', {
    mermaidVersion: version
  });
</script>

<script lang="ts">
  import MainMenu from '$/components/MainMenu.svelte';
  import { dismissPromotion, getActivePromotion } from '$lib/util/promos/promo';
  import type { Snippet } from 'svelte';
  import CloseIcon from '~icons/material-symbols/close-rounded';

  interface Props {
    mobileToggle?: Snippet;
    children: Snippet;
  }

  let { children, mobileToggle }: Props = $props();

  let activePromotion = $state(getActivePromotion());

  const trackBannerClick = () => {
    if (!plausible || !activePromotion) {
      return;
    }
    logEvent('bannerClick', {
      promotion: activePromotion.id
    });
  };
</script>

{#if activePromotion}
  <div class="top-bar z-10 flex h-fit w-full bg-primary">
    <div
      class="flex flex-grow"
      role="button"
      tabindex="0"
      onclick={trackBannerClick}
      onkeypress={trackBannerClick}>
      <activePromotion.component {closeBanner} />
    </div>
    {#snippet closeBanner()}
      <Button
        title="Dismiss banner"
        variant="ghost"
        class="hover:bg-transparent hover:text-[#261A56]"
        size="sm"
        onclick={() => {
          dismissPromotion(activePromotion?.id);
          activePromotion = undefined;
        }}>
        <CloseIcon />
      </Button>
    {/snippet}
  </div>
{/if}

<nav class="z-50 flex p-4 sm:p-6">
  <div class="flex flex-1 items-center gap-2">
    <MainMenu />
    <div
      id="switcher"
      class="flex items-center justify-center gap-4 font-medium">
      <a href="/" class="whitespace-nowrap text-accent">Live Editor</a>
    </div>
  </div>
  <div
    id="menu"
    class="hidden flex-nowrap items-center justify-between gap-3 overflow-hidden md:flex">
    {@render children?.()}
  </div>
  {@render mobileToggle?.()}
</nav>
