<script lang="ts">
  import type { State, ValidatedState } from '$/types';
  import { recordRenderTime, shouldRefreshView } from '$/util/autoSync';
  import { render as renderDiagram } from '$/util/mermaid';
  import { PanZoomState } from '$/util/panZoom';
  import { inputStateStore, stateStore, updateCodeStore } from '$/util/state';
  import { logEvent, saveStatistics } from '$/util/stats';
  import FontAwesome, { mayContainFontAwesome } from '$lib/components/FontAwesome.svelte';
  import '$lib/likec4-viewer';
  import uniqueID from 'lodash-es/uniqueId';
  import type { MermaidConfig } from 'mermaid';
  import { mode } from 'mode-watcher';
  import { onMount } from 'svelte';
  import { Svg2Roughjs } from 'svg2roughjs';

  let {
    panZoomState = new PanZoomState(),
    shouldShowGrid = true
  }: { panZoomState?: PanZoomState; shouldShowGrid?: boolean } = $props();
  let code = '';
  let config = '';
  let container: HTMLDivElement | undefined = $state();
  let rough: boolean;
  let view: HTMLDivElement | undefined = $state();
  let error = $state(false);
  let availableViews: Array<{ id: string; title: string }> = $state([]);
  let currentLikec4View: Record<string, unknown> | undefined = $state();
  let selectedViewId: string | undefined = $state();
  let currentLanguage: string | undefined = $state('mermaid');
  let panZoom = true;
  let manualUpdate = true;
  let waitForFontAwesomeToLoad: FontAwesome['waitForFontAwesomeToLoad'] | undefined = $state();

  // Set up panZoom state observer to update the store when pan/zoom changes
  const setupPanZoomObserver = () => {
    panZoomState.onPanZoomChange = (pan, zoom) => {
      updateCodeStore({ pan, zoom });
      logEvent('panZoom');
    };
  };

  const handlePanZoom = (state: State, graphDiv: SVGSVGElement) => {
    try {
      panZoomState.updateElement(graphDiv, state);
    } catch (error) {
      console.error('PanZoom error:', error);
    }
  };

  const handleStateChange = async (state: ValidatedState) => {
    const startTime = Date.now();
    const forceRender = state.updateDiagram;
    if (state.error !== undefined) {
      error = true;
      return;
    }
    error = false;
    let diagramType: string | undefined;
    try {
      if (container) {
        manualUpdate = true;
        // Do not render if there is no change in Code/Config/PanZoom
        if (
          code === state.code &&
          config === state.mermaid &&
          rough === state.rough &&
          panZoom === state.panZoom &&
          !forceRender
        ) {
          return;
        }

        if (!shouldRefreshView()) {
          return;
        }

        code = state.code;
        config = state.mermaid;
        currentLanguage = state.language ?? 'mermaid';
        rough = state.rough;
        panZoom = state.panZoom ?? true;

        const scroll = view?.parentElement?.scrollTop;
        delete container.dataset.processed;
        if ((state.language ?? 'mermaid') === 'likec4') {
          diagramType = 'likec4';
          const viewer =
            container?.querySelector<HTMLElement>('likec4-viewer') ??
            document.createElement('likec4-viewer');
          viewer.style.display = 'block';
          viewer.style.width = '100%';
          viewer.style.height = '100%';

          const handleReady = (event: Event) => {
            const detail = (event as CustomEvent).detail as
              | { views: Array<{ id: string; title: string }>; viewId: string }
              | undefined;
            if (!detail) return;
            availableViews = detail.views ?? [];
            const hasSelected =
              selectedViewId && availableViews.some((v) => v.id === selectedViewId);
            if (!hasSelected) {
              selectedViewId = detail.viewId ?? availableViews[0]?.id;
            }
          };

          const handleError = (event: Event) => {
            const message =
              ((event as CustomEvent).detail as { message?: string } | undefined)?.message ??
              'LikeC4 render failed.';
            // eslint-disable-next-line svelte/no-dom-manipulating
            container.innerHTML = '';
            const pre = document.createElement('pre');
            pre.style.padding = '12px';
            pre.style.whiteSpace = 'pre-wrap';
            pre.textContent = message;
            // eslint-disable-next-line svelte/no-dom-manipulating
            container.append(pre);
            error = true;
          };

          const anyViewer = viewer as unknown as {
            __readyHandler?: (event: Event) => void;
            __errorHandler?: (event: Event) => void;
          };
          if (anyViewer.__readyHandler) {
            viewer.removeEventListener('likec4ready', anyViewer.__readyHandler);
          }
          if (anyViewer.__errorHandler) {
            viewer.removeEventListener('likec4error', anyViewer.__errorHandler);
          }
          viewer.addEventListener('likec4ready', handleReady);
          viewer.addEventListener('likec4error', handleError);
          anyViewer.__readyHandler = handleReady;
          anyViewer.__errorHandler = handleError;

          (viewer as unknown as { code: string }).code = state.code;
          (viewer as unknown as { viewId?: string | null }).viewId = selectedViewId ?? null;
          // likec4/react expects a named background theme, not an arbitrary hex.
          // Avoid ReactFlow auto-fit zoom; show at native scale.
          (viewer as unknown as { fitView: boolean }).fitView = false;

          if (!container?.contains(viewer)) {
            // eslint-disable-next-line svelte/no-dom-manipulating
            container.replaceChildren(viewer);
          }
          error = false;
        } else {
          if (mayContainFontAwesome(code)) {
            await waitForFontAwesomeToLoad?.();
          }

          const viewID = uniqueID('graph-');
          const {
            svg,
            bindFunctions,
            diagramType: detectedDiagramType
          } = await renderDiagram(JSON.parse(state.mermaid) as MermaidConfig, code, viewID);
          diagramType = detectedDiagramType;
          if (svg.length > 0) {
            // eslint-disable-next-line svelte/no-dom-manipulating
            container.innerHTML = svg;
            let graphDiv = document.querySelector<SVGSVGElement>(`#${viewID}`);
            if (!graphDiv) {
              throw new Error('graph-div not found');
            }
            if (state.rough) {
              const svg2roughjs = new Svg2Roughjs('#container');
              svg2roughjs.svg = graphDiv;
              await svg2roughjs.sketch();
              graphDiv.remove();
              const sketch = document.querySelector<SVGSVGElement>('#container > svg');
              if (!sketch) {
                throw new Error('sketch not found');
              }
              const height = sketch.getAttribute('height');
              const width = sketch.getAttribute('width');
              sketch.setAttribute('id', 'graph-div');
              sketch.setAttribute('height', '100%');
              sketch.setAttribute('width', '100%');
              sketch.setAttribute('viewBox', `0 0 ${width} ${height}`);
              sketch.style.maxWidth = '100%';
              graphDiv = sketch;
            } else {
              graphDiv.setAttribute('height', '100%');
              graphDiv.style.maxWidth = '100%';
              if (bindFunctions) {
                bindFunctions(graphDiv);
              }
            }
            if (state.panZoom) {
              handlePanZoom(state, graphDiv);
            }
          }
        }
        if (view?.parentElement && scroll) {
          view.parentElement.scrollTop = scroll;
        }
        error = false;
      } else if (manualUpdate) {
        manualUpdate = false;
      }
      if (forceRender) {
        updateCodeStore({ updateDiagram: false });
      }
    } catch (error_) {
      console.error('view fail', error_);
      error = true;
    }
    const renderTime = Date.now() - startTime;
    saveStatistics({ code, diagramType, isRough: state.rough, renderTime });
    recordRenderTime(renderTime, () => {
      $inputStateStore.updateDiagram = true;
    });
  };

  onMount(() => {
    setupPanZoomObserver();
    // Queue state changes to avoid race condition
    let pendingStateChange = Promise.resolve();
    stateStore.subscribe((state) => {
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      pendingStateChange = pendingStateChange.then(() => handleStateChange(state).catch(() => {}));
    });
  });
</script>

<FontAwesome bind:waitForFontAwesomeToLoad />

<div
  id="view"
  bind:this={view}
  class={['h-full w-full', shouldShowGrid && `grid-bg-${$mode}`, error && 'opacity-50']}>
  {#if (currentLanguage ?? 'mermaid') === 'likec4' && availableViews.length > 1}
    <div class="flex items-center gap-2 px-3 py-2">
      <label for="view-select" class="text-sm text-muted-foreground whitespace-nowrap">View</label>
      <select
        id="view-select"
        class="select select-sm max-w-xs"
        bind:value={selectedViewId}
        onchange={() => {
          updateCodeStore({ updateDiagram: true });
        }}>
        {#each availableViews as v}
          <option value={v.id}>{v.title}</option>
        {/each}
      </select>
    </div>
  {/if}
  <div id="container" bind:this={container} class="h-full overflow-auto"></div>
</div>

<style>
  .grid-bg-light {
    background-size: 30px 30px;
    background-image: radial-gradient(circle, #e4e4e48c 2px, #0000 2px);
  }

  .grid-bg-dark {
    background-size: 30px 30px;
    background-image: radial-gradient(circle, #46464646 2px, #0000 2px);
  }
</style>
