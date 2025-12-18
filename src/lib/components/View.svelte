<script lang="ts">
  import type { State, ValidatedState } from '$/types';
  import { recordRenderTime, shouldRefreshView } from '$/util/autoSync';
  import { render as renderDiagram } from '$/util/mermaid';
  import { PanZoomState } from '$/util/panZoom';
  import { inputStateStore, stateStore, updateCodeStore } from '$/util/state';
  import { logEvent, saveStatistics } from '$/util/stats';
  import FontAwesome, { mayContainFontAwesome } from '$lib/components/FontAwesome.svelte';
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
          panZoom === state.panZoom
        ) {
          return;
        }

        if (!shouldRefreshView()) {
          return;
        }

        code = state.code;
        config = state.mermaid;
        rough = state.rough;
        panZoom = state.panZoom ?? true;

        const scroll = view?.parentElement?.scrollTop;
        delete container.dataset.processed;
        if ((state.language ?? 'mermaid') === 'likec4') {
          const res = await fetch('/api/likec4/render', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code: state.code })
          });
          const data = (await res.json().catch(() => null)) as
            | {
                status: 'success';
                svg: string;
                viewId: string;
              }
            | {
                status: 'fail';
                error: { message: string; details?: unknown };
              }
            | null;

          if (!data) {
            throw new Error('Invalid response from LikeC4 renderer.');
          }
          if (data.status !== 'success') {
            // eslint-disable-next-line svelte/no-dom-manipulating
            container.innerHTML = '';
            const pre = document.createElement('pre');
            pre.style.padding = '12px';
            pre.style.whiteSpace = 'pre-wrap';
            const details = data.error?.details;
            if (Array.isArray(details) && details.length) {
              const lines = details
                .slice(0, 50)
                .map((d) => {
                  const startLine = (d as { startLine?: unknown }).startLine;
                  const startColumn = (d as { startColumn?: unknown }).startColumn;
                  const message = (d as { message?: unknown }).message;
                  const line = typeof startLine === 'number' ? startLine : '?';
                  const col = typeof startColumn === 'number' ? `:${startColumn + 1}` : '';
                  return `line ${line}${col}: ${typeof message === 'string' ? message : ''}`;
                })
                .join('\n');
              pre.textContent = `${data.error?.message ?? 'LikeC4 render failed.'}\n\n${lines}`;
            } else {
              pre.textContent = data.error?.message ?? 'LikeC4 render failed.';
            }
            // eslint-disable-next-line svelte/no-dom-manipulating
            container.append(pre);
            error = true;
            return;
          }

          diagramType = 'likec4';
          // eslint-disable-next-line svelte/no-dom-manipulating
          container.innerHTML = data.svg;
          let graphDiv = container.querySelector<SVGSVGElement>('svg');
          if (!graphDiv) {
            throw new Error('graph-div not found');
          }
          graphDiv.setAttribute('height', '100%');
          graphDiv.style.maxWidth = '100%';
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
          }

          if (state.panZoom) {
            handlePanZoom(state, graphDiv);
          }
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
