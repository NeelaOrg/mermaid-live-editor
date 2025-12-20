<script lang="ts">
  import Actions from '$/components/Actions.svelte';
  import AiEdit from '$/components/AiEdit.svelte';
  import Card from '$/components/Card/Card.svelte';
  import Editor from '$/components/Editor.svelte';
  import Navbar from '$/components/Navbar.svelte';
  import PanZoomToolbar from '$/components/PanZoomToolbar.svelte';
  import Preset from '$/components/Preset.svelte';
  import SyncRoughToolbar from '$/components/SyncRoughToolbar.svelte';
  import * as Popover from '$/components/ui/popover';
  import { Button } from '$/components/ui/button';
  import * as Resizable from '$/components/ui/resizable';
  import { Switch } from '$/components/ui/switch';
  import VersionSecurityToolbar from '$/components/VersionSecurityToolbar.svelte';
  import View from '$/components/View.svelte';
  import type { DiagramLanguage, EditorMode, Tab } from '$/types';
  import { PanZoomState } from '$/util/panZoom';
  import { stateStore, updateCodeStore, updateDiagramLanguage } from '$/util/state';
  import { logEvent } from '$/util/stats';
  import { initHandler } from '$/util/util';
  import { onMount } from 'svelte';
  import CodeIcon from '~icons/custom/code';
  import DownloadIcon from '~icons/material-symbols/download';
  import SamplesIcon from '~icons/material-symbols/account-tree-outline-rounded';
  import GearIcon from '~icons/material-symbols/settings-outline-rounded';

  const panZoomState = new PanZoomState();

  let activeEditorTab = $state<Tab['id']>('code');
  let lastEditorMode = $state<EditorMode>('code');
  let editorOpen = $state(true);
  let aiOpen = $state(true);

  const tabSelectHandler = (tab: Tab) => {
    if (tab.id === 'samples') {
      activeEditorTab = 'samples';
      return;
    }
    const editorMode: EditorMode = tab.id === 'code' ? 'code' : 'config';
    lastEditorMode = editorMode;
    activeEditorTab = editorMode;
    updateCodeStore({ editorMode });
  };

  $effect(() => {
    const mode = ($stateStore.editorMode ?? 'code') as EditorMode;
    lastEditorMode = mode;
    if (activeEditorTab !== 'samples') {
      activeEditorTab = mode;
    }
  });

  const editorTabs: Tab[] = [
    {
      icon: SamplesIcon,
      id: 'samples',
      title: 'Samples'
    },
    {
      icon: CodeIcon,
      id: 'code',
      title: 'Code'
    },
    {
      icon: GearIcon,
      id: 'config',
      title: 'Config'
    }
  ];

  const onDiagramLanguageChange = (e: Event) => {
    const value = (e.currentTarget as HTMLSelectElement | null)?.value as DiagramLanguage | undefined;
    if (!value) return;
    updateDiagramLanguage(value);
  };

  let width = $state(0);
  let isMobile = $derived(width < 640);
  let isViewMode = $state(true);

  onMount(async () => {
    await initHandler();
    window.addEventListener('appinstalled', () => {
      logEvent('pwaInstalled', { isMobile });
    });
  });

  let editorPane: Resizable.Pane | undefined;
  $effect(() => {
    if (isMobile) {
      editorPane?.resize(50);
    }
  });
</script>

<div class="flex h-full flex-col overflow-hidden">
  {#snippet mobileToggle()}
    <div class="flex items-center gap-2">
      Edit <Switch
        id="editorMode"
        class="data-[state=checked]:bg-accent"
        bind:checked={isViewMode}
        onclick={() => {
          logEvent('mobileViewToggle');
        }} /> View
    </div>
  {/snippet}

  <Navbar mobileToggle={isMobile ? mobileToggle : undefined}>
    <Popover.Root>
      <Popover.Trigger class="ml-auto mr-16">
        <Button size="sm" class="gap-2">
          <DownloadIcon class="size-4 rotate-180" />
          Export
        </Button>
      </Popover.Trigger>
      <Popover.Content align="end" sideOffset={12} class="border-2 p-0">
        <Actions embedded />
      </Popover.Content>
    </Popover.Root>
  </Navbar>

  <div class="flex flex-1 flex-col overflow-hidden" bind:clientWidth={width}>
    <div
      class={[
        'size-full',
        isMobile && ['w-[200%] duration-300', isViewMode && '-translate-x-1/2']
      ]}>
      <Resizable.PaneGroup
        direction="horizontal"
        autoSaveId="liveEditor"
        class="gap-4 p-2 pt-0 sm:gap-0 sm:p-6 sm:pt-0">
        <Resizable.Pane bind:this={editorPane} defaultSize={30} minSize={15}>
          <div
            class={[
              'grid h-full gap-4 sm:gap-6',
              editorOpen && aiOpen && 'grid-rows-[1fr_1fr]',
              editorOpen && !aiOpen && 'grid-rows-[1fr_auto]',
              !editorOpen && aiOpen && 'grid-rows-[auto_1fr]',
              !editorOpen && !aiOpen && 'grid-rows-[auto_auto]'
            ]}>
            <Card
              onselect={tabSelectHandler}
              bind:isOpen={editorOpen}
              tabs={editorTabs}
              activeTabID={activeEditorTab}
              isClosable={false}
              fullHeight>
              {#snippet tabsPrefix()}
                <div class="mr-2 flex items-center gap-2 text-xs opacity-80">
                  <label class="sr-only" for="diagram-language">Diagram language</label>
                  <select
                    id="diagram-language"
                    class="h-7 rounded-md border border-border bg-background px-2 text-xs"
                    value={$stateStore.language ?? 'mermaid'}
                    onchange={onDiagramLanguageChange}>
                    <option value="mermaid">Mermaid</option>
                    <option value="likec4">LikeC4</option>
                  </select>
                </div>
              {/snippet}
              {#if activeEditorTab === 'samples'}
                <Preset embedded />
              {:else}
                <Editor {isMobile} />
              {/if}
            </Card>

            <AiEdit bind:isOpen={aiOpen} fullHeight />
          </div>
        </Resizable.Pane>
        <Resizable.Handle class="mr-1 hidden opacity-0 sm:block" />
        <Resizable.Pane minSize={15} class="relative flex h-full flex-1 flex-col overflow-hidden">
          <View {panZoomState} shouldShowGrid={$stateStore.grid} />
          <div class="absolute top-0 right-0"><PanZoomToolbar {panZoomState} /></div>
          <div class="absolute right-0 bottom-0"><VersionSecurityToolbar /></div>
          <div class="absolute bottom-0 left-0 sm:left-5"><SyncRoughToolbar /></div>
        </Resizable.Pane>
      </Resizable.PaneGroup>
    </div>
  </div>
</div>
