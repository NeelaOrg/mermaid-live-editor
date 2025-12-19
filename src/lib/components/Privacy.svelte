<script>
  import ExternalLinkWrapper from '$/components/ExternalLinkWrapper.svelte';
  import * as Dialog from '$/components/ui/dialog';
  import ShieldIcon from '~icons/material-symbols/shield-lock-outline-rounded';
</script>

<Dialog.Root>
  <Dialog.Trigger>
    <ShieldIcon />
  </Dialog.Trigger>
  <Dialog.Content class="max-h-full overflow-hidden overflow-y-auto p-12">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2 text-xl">
        <ShieldIcon class="size-8 text-green-700" />
        Data security
      </Dialog.Title>
    </Dialog.Header>

    <p class="text-xl font-semibold">Your diagrams never leave your browser.</p>
    <p>They're only stored in the URL and your browser's local storage.</p>
    <p>
      This is a fully open source, client-side app that works offline as a
      <a href="https://web.dev/explore/progressive-web-apps" target="_blank">Progressive Web App</a
      >.
    </p>
    <p>
      We use self hosted, privacy-friendly analytics to collect anonymous usage metadata (diagram
      types, feature usage, etc.).
    </p>
    <ExternalLinkWrapper domain="example.com" isVisible>
      <p class="text-left">
        External services (PNG/SVG/Kroki exports, etc) will share your diagram with those 3rd
        parties, and are highlighted in the UI on hover.
      </p>
    </ExternalLinkWrapper>
  </Dialog.Content>
</Dialog.Root>
