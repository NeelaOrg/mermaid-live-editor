<script lang="ts">
  import Card from '$/components/Card/Card.svelte';
  import ExternalLinkWrapper from '$/components/ExternalLinkWrapper.svelte';
  import { Button } from '$/components/ui/button';
  import { Input } from '$/components/ui/input';
  import * as ToggleGroup from '$/components/ui/toggle-group';
  import { getDomain } from '$/util/util';
  import { render as renderMermaid } from '$/util/mermaid';
  import { browser } from '$app/environment';
  import { waitForRender } from '$lib/util/autoSync';
  import { inputStateStore, stateStore, urlsStore } from '$lib/util/state';
  import { logEvent } from '$lib/util/stats';
  import { version as FAVersion } from '@fortawesome/fontawesome-free/package.json';
  import dayjs from 'dayjs';
  import DownloadIcon from '~icons/material-symbols/download';
  import ExternalLinkIcon from '~icons/material-symbols/open-in-new-rounded';
  import WidthIcon from '~icons/material-symbols/width-rounded';

  const FONT_AWESOME_URL = `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/${FAVersion}/css/all.min.css`;

  type Exporter = (context: CanvasRenderingContext2D, image: HTMLImageElement) => () => void;

  let { embedded = false }: { embedded?: boolean } = $props();
  let showSizeControls = $state(false);

  const getFileName = (extension: string) =>
    `mermaid-diagram-${dayjs().format('YYYY-MM-DD-HHmmss')}.${extension}`;

  let currentLanguage = 'mermaid';
  let currentCode = '';
  let currentMermaidConfig = '';
  stateStore.subscribe(({ language, code, mermaid }) => {
    currentLanguage = language ?? 'mermaid';
    currentCode = code;
    currentMermaidConfig = mermaid ?? '';
  });

  const logExport = (...args: unknown[]) => {
    if (typeof console !== 'undefined') console.info('[export]', ...args);
  };

  const currentViewId = () =>
    (document.getElementById('view-select') as HTMLSelectElement | null)?.value ?? undefined;

  const buildLikec4DomSnapshot = (): HTMLElement | undefined => {
    const likec4El = document.querySelector('likec4-viewer') as HTMLElement | null;
    const shadow = likec4El?.shadowRoot;
    if (!likec4El || !shadow) return undefined;
    logExport('snapshot: using live likec4-viewer shadow DOM');

    const xhtmlNS = 'http://www.w3.org/1999/xhtml';
    const bounds = likec4El.getBoundingClientRect();
    const w = Math.max(1, Math.round(bounds.width)) || 1200;
    const h = Math.max(1, Math.round(bounds.height)) || 800;

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', `${w}`);
    svg.setAttribute('height', `${h}`);
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('xmlns', svgNS);
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

    const allStyles = Array.from(shadow.querySelectorAll('style'));

    // For SVG elements (edges, background), keep styles inside <defs>.
    const defs = document.createElementNS(svgNS, 'defs');
    allStyles.forEach((st) => {
      const styleEl = document.createElementNS(svgNS, 'style');
      styleEl.textContent = st.textContent ?? '';
      defs.append(styleEl);
    });
    svg.append(defs);

    const fo = document.createElementNS(svgNS, 'foreignObject');
    fo.setAttribute('width', `${w}`);
    fo.setAttribute('height', `${h}`);
    fo.setAttribute('x', '0');
    fo.setAttribute('y', '0');

    const host = document.createElementNS(xhtmlNS, 'body');
    host.setAttribute('xmlns', xhtmlNS);
    host.style.width = '100%';
    host.style.height = '100%';
    host.style.margin = '0';

    // Copy custom properties from the host so CSS variables resolve when exported.
    const computed = getComputedStyle(likec4El);
    for (let i = 0; i < computed.length; i += 1) {
      const name = computed[i];
      if (name.startsWith('--')) {
        host.style.setProperty(name, computed.getPropertyValue(name));
      }
    }

    // Apply the shadow styles inside the HTML subtree so HTML icons/layout render.
    if (allStyles.length) {
      const styleEl = document.createElementNS(xhtmlNS, 'style');
      styleEl.textContent = allStyles.map((s) => s.textContent ?? '').join('\n');
      host.append(styleEl);
    }

    // Clone the rendered content.
    shadow.childNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'STYLE') {
        return;
      }
      host.append(node.cloneNode(true));
    });

    fo.append(host);
    svg.append(fo);

    logExport('snapshot host innerHTML length', host.innerHTML.length);
    logExport('snapshot svg innerHTML length', svg.innerHTML.length);
    return svg as unknown as HTMLElement;
  };

  const fetchLikec4Svg = async (): Promise<HTMLElement | undefined> => {
    try {
      const res = await fetch('/api/likec4/render', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: currentCode, viewId: currentViewId() })
      });
      const data = await res.json();
      const svgText = typeof data?.svg === 'string' ? data.svg.trim() : '';
      if (!svgText) return undefined;
       logExport('api svg length', svgText.length, 'view', data?.viewId);
      const tpl = document.createElement('template');
      tpl.innerHTML = svgText;
      return tpl.content.querySelector('svg') ?? undefined;
    } catch (error) {
      console.error('LikeC4 export failed', error);
      return undefined;
    }
  };

  type LikeC4IconSnapshot = {
    svg: SVGSVGElement;
    x: number;
    y: number;
    width: number;
    height: number;
    color?: string;
    nodeId?: string;
    relX?: number;
    relY?: number;
    relW?: number;
    relH?: number;
    nodeTitle?: string;
    nodeX?: number;
    nodeY?: number;
    nodeWidth?: number;
    nodeHeight?: number;
  };

  const parseSvgText = (text: string): SVGSVGElement | null => {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    return doc.querySelector('svg');
  };

  const renderMermaidPngSvg = async (): Promise<SVGSVGElement | undefined> => {
    try {
      const rawConfig = currentMermaidConfig ? (JSON.parse(currentMermaidConfig) as Record<string, unknown>) : {};
      const pngConfig = {
        ...rawConfig,
        htmlLabels: false,
        flowchart: { ...(rawConfig.flowchart as Record<string, unknown> | undefined), htmlLabels: false },
        sequence: { ...(rawConfig.sequence as Record<string, unknown> | undefined), htmlLabels: false },
        state: { ...(rawConfig.state as Record<string, unknown> | undefined), htmlLabels: false },
        class: { ...(rawConfig.class as Record<string, unknown> | undefined), htmlLabels: false },
        er: { ...(rawConfig.er as Record<string, unknown> | undefined), htmlLabels: false },
        gantt: { ...(rawConfig.gantt as Record<string, unknown> | undefined), htmlLabels: false },
        journey: { ...(rawConfig.journey as Record<string, unknown> | undefined), htmlLabels: false }
      };
      const result = await renderMermaid(pngConfig, currentCode, `png-${Date.now()}`);
      const svgText = result?.svg?.trim();
      if (!svgText) return undefined;
      const svgEl = parseSvgText(svgText);
      if (svgEl) {
        svgEl.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      }
      logExport('png mermaid render', { hasForeignObject: svgText.includes('<foreignObject') });
      return svgEl ?? undefined;
    } catch (error) {
      logExport('png mermaid render failed', error);
      return undefined;
    }
  };

  const fetchSvgFromUrl = async (src: string): Promise<SVGSVGElement | null> => {
    const tryParse = (text: string) => {
      const svg = parseSvgText(text);
      return svg && svg.tagName.toLowerCase() === 'svg' ? svg : null;
    };
    try {
      const res = await fetch(src, { credentials: 'omit', mode: 'cors' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const text = await res.text();
      const svg = tryParse(text);
      if (svg) return svg;
      throw new Error('invalid svg');
    } catch (error) {
      logExport('icon fetch failed, trying proxy', src, error);
    }
    try {
      const res = await fetch(`/api/fetch-svg?url=${encodeURIComponent(src)}`);
      if (!res.ok) return null;
      const text = await res.text();
      return tryParse(text);
    } catch (error) {
      logExport('icon proxy fetch failed', src, error);
      return null;
    }
  };

  const parseSvgDataUrl = (src: string): SVGSVGElement | null => {
    const base64Prefix = 'data:image/svg+xml;base64,';
    const utf8Prefix = 'data:image/svg+xml,';
    let raw: string | undefined;
    if (src.startsWith(base64Prefix)) {
      raw = atob(src.slice(base64Prefix.length));
    } else if (src.startsWith(utf8Prefix)) {
      raw = decodeURIComponent(src.slice(utf8Prefix.length));
    }
    if (!raw) return null;
    const tpl = document.createElement('template');
    tpl.innerHTML = raw.trim();
    return tpl.content.querySelector('svg');
  };

  const extractIconSvg = async (iconEl: Element): Promise<SVGSVGElement | null> => {
    if (iconEl instanceof SVGSVGElement) return iconEl;
    const svg = iconEl.querySelector?.('svg');
    if (svg instanceof SVGSVGElement) return svg;
    const img =
      iconEl instanceof HTMLImageElement ? iconEl : (iconEl.querySelector?.('img') as HTMLImageElement | null);
    if (!img) return null;
    const src = img.getAttribute('src') ?? '';
    if (!src) return null;
    if (src.startsWith('data:image/svg+xml')) {
      return parseSvgDataUrl(src);
    }
    if (src.startsWith('http://') || src.startsWith('https://')) {
      return await fetchSvgFromUrl(src);
    }
    return null;
  };

  const waitForImage = async (img: HTMLImageElement): Promise<void> => {
    if (img.complete && img.naturalWidth > 0) return;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      setTimeout(done, 1500);
    });
  };

  const collectRoots = (likec4El: HTMLElement): ParentNode[] => {
    const roots = new Set<ParentNode>();
    const add = (root?: ParentNode | null) => {
      if (root) roots.add(root);
    };
    add(likec4El.shadowRoot ?? undefined);
    add(likec4El);
    add(document);

    const visit = (el: Element) => {
      const shadow = (el as HTMLElement).shadowRoot;
      if (shadow) {
        add(shadow);
        shadow.querySelectorAll('*').forEach(visit);
      }
      el.querySelectorAll(':scope > *').forEach(visit);
    };
    visit(likec4El);
    return Array.from(roots);
  };

  const collectLikec4Icons = async (): Promise<LikeC4IconSnapshot[]> => {
    const likec4El = document.querySelector('likec4-viewer') as HTMLElement | null;
    if (!likec4El) return [];

    const hostRect = likec4El.getBoundingClientRect();
    if (!hostRect.width || !hostRect.height) return [];

    const roots = collectRoots(likec4El);
    const iconSelector =
      '[data-likec4-icon], .likec4-element-icon, .likec4-shape-icon, img[data-likec4-icon]';
    let icons = roots.flatMap((root) =>
      Array.from(root.querySelectorAll<HTMLElement>(iconSelector))
    );
    logExport('likec4 icon elements found', icons.length);
    if (!icons.length) {
      const nodes = roots.flatMap((root) =>
        Array.from(root.querySelectorAll<HTMLElement>('.react-flow__node'))
      );
      logExport('likec4 nodes found', nodes.length);
      nodes.forEach((node) => {
        const candidate = node.querySelector('img') ?? node.querySelector('svg');
        if (candidate) {
          icons.push(candidate as HTMLElement);
        }
      });
      logExport('likec4 icon candidates from nodes', icons.length);
    }
    const round = (value?: number) =>
      typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value;
    const snapshots = await Promise.all(
      icons.map(async (iconEl) => {
        const img =
          iconEl instanceof HTMLImageElement
            ? iconEl
            : (iconEl.querySelector?.('img') as HTMLImageElement | null);
        if (img) {
          await waitForImage(img);
        }
        const icon = await extractIconSvg(iconEl);
        if (!icon) return null;
        const rect = icon.getBoundingClientRect();
        const fallbackRect = iconEl.getBoundingClientRect();
        const finalRect =
          rect.width && rect.height
            ? rect
            : fallbackRect.width && fallbackRect.height
              ? fallbackRect
              : null;
        if (!finalRect) return null;
        const computed = getComputedStyle(iconEl);
        const closestNodeEl =
          iconEl instanceof HTMLElement
            ? (iconEl.closest('[data-testid^="rf__node-"], [data-id]') as HTMLElement | null)
            : null;
        let nodeId: string | undefined;
        const dataId = closestNodeEl?.getAttribute('data-id');
        if (dataId) {
          nodeId = dataId;
        } else {
          const testId = closestNodeEl?.getAttribute('data-testid');
          if (testId?.startsWith('rf__node-')) {
            nodeId = testId.slice('rf__node-'.length);
          }
        }
        const resolvedNodeEl = nodeId
          ? (roots
              .flatMap((root) => Array.from(root.querySelectorAll<HTMLElement>('[data-id], [data-testid^="rf__node-"]')))
              .find((el) => el.getAttribute('data-id') === nodeId || el.getAttribute('data-testid') === `rf__node-${nodeId}`) ??
            null)
          : closestNodeEl;
        if (nodeId && !resolvedNodeEl) {
          logExport('likec4 node element not found for icon', nodeId);
        }
        const nodeRect = resolvedNodeEl?.getBoundingClientRect();
        const nodeTitle =
          resolvedNodeEl?.querySelector<HTMLElement>('[data-likec4-node-title]')?.textContent?.trim() ??
          resolvedNodeEl?.querySelector<HTMLElement>('.likec4-element-title')?.textContent?.trim() ??
          undefined;
        const relX =
          nodeRect && nodeRect.width ? (finalRect.left - nodeRect.left) / nodeRect.width : undefined;
        const relY =
          nodeRect && nodeRect.height ? (finalRect.top - nodeRect.top) / nodeRect.height : undefined;
        const relW = nodeRect && nodeRect.width ? finalRect.width / nodeRect.width : undefined;
        const relH = nodeRect && nodeRect.height ? finalRect.height / nodeRect.height : undefined;
        logExport('likec4 icon snapshot', {
          nodeId,
          nodeTitle,
          iconRect: {
            x: round(finalRect.left - hostRect.left),
            y: round(finalRect.top - hostRect.top),
            width: round(finalRect.width),
            height: round(finalRect.height)
          },
          nodeRect: nodeRect
            ? {
                x: round(nodeRect.left - hostRect.left),
                y: round(nodeRect.top - hostRect.top),
                width: round(nodeRect.width),
                height: round(nodeRect.height)
              }
            : null,
          rel: {
            x: round(relX),
            y: round(relY),
            w: round(relW),
            h: round(relH)
          }
        });
        return {
          svg: icon,
          x: finalRect.left - hostRect.left,
          y: finalRect.top - hostRect.top,
          width: finalRect.width,
          height: finalRect.height,
          color: computed.color,
          nodeId,
          relX,
          relY,
          relW,
          relH,
          nodeTitle,
          nodeX: nodeRect ? nodeRect.left - hostRect.left : undefined,
          nodeY: nodeRect ? nodeRect.top - hostRect.top : undefined,
          nodeWidth: nodeRect?.width,
          nodeHeight: nodeRect?.height
        } satisfies LikeC4IconSnapshot;
      })
    );
    return snapshots.filter((snap): snap is LikeC4IconSnapshot => !!snap);
  };

  const prefixSvgIds = (svg: SVGSVGElement, prefix: string): void => {
    const idMap = new Map<string, string>();
    svg.querySelectorAll('[id]').forEach((el) => {
      const id = el.getAttribute('id');
      if (!id) return;
      const nextId = `${prefix}${id}`;
      idMap.set(id, nextId);
      el.setAttribute('id', nextId);
    });
    if (!idMap.size) return;

    const replaceRefs = (value: string) =>
      value
        .replace(/url\(#([^)]+)\)/g, (_, id: string) => `url(#${idMap.get(id) ?? id})`)
        .replace(/^#(.+)$/, (_, id: string) => `#${idMap.get(id) ?? id}`);

    const refAttrs = ['href', 'xlink:href', 'fill', 'stroke', 'filter', 'mask', 'clip-path', 'style'];
    svg.querySelectorAll('*').forEach((el) => {
      refAttrs.forEach((attr) => {
        const value = el.getAttribute(attr);
        if (!value) return;
        const replaced = replaceRefs(value);
        if (replaced !== value) {
          el.setAttribute(attr, replaced);
        }
      });
    });
  };

  const getSvgNodeBBox = (node: Element): { x: number; y: number; width: number; height: number } | undefined => {
    const polygon = node.querySelector('polygon');
    if (polygon) {
      const points = polygon.getAttribute('points')?.trim();
      if (points) {
        const coords = points
          .split(/\s+/)
          .map((pair) => pair.split(',').map((v) => Number.parseFloat(v)))
          .filter((pair) => pair.length === 2 && pair.every((n) => Number.isFinite(n))) as Array<
          [number, number]
        >;
        if (coords.length) {
          const xs = coords.map((p) => p[0]);
          const ys = coords.map((p) => p[1]);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const minY = Math.min(...ys);
          const maxY = Math.max(...ys);
          return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
        }
      }
    }
    const rect = node.querySelector('rect');
    if (rect) {
      const x = Number.parseFloat(rect.getAttribute('x') ?? '0');
      const y = Number.parseFloat(rect.getAttribute('y') ?? '0');
      const width = Number.parseFloat(rect.getAttribute('width') ?? '0');
      const height = Number.parseFloat(rect.getAttribute('height') ?? '0');
      if ([x, y, width, height].every((n) => Number.isFinite(n))) {
        return { x, y, width, height };
      }
    }
    const ellipse = node.querySelector('ellipse');
    if (ellipse) {
      const cx = Number.parseFloat(ellipse.getAttribute('cx') ?? '0');
      const cy = Number.parseFloat(ellipse.getAttribute('cy') ?? '0');
      const rx = Number.parseFloat(ellipse.getAttribute('rx') ?? '0');
      const ry = Number.parseFloat(ellipse.getAttribute('ry') ?? '0');
      if ([cx, cy, rx, ry].every((n) => Number.isFinite(n))) {
        return { x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
      }
    }
    return undefined;
  };

  const describeSvgNode = (node: Element) => ({
    tag: node.tagName.toLowerCase(),
    id: node.getAttribute('id'),
    class: node.getAttribute('class'),
    likec4Id:
      node.getAttribute('likec4_id') ??
      node.getAttribute('data-likec4-id') ??
      node.getAttribute('likec4-id'),
    dataId: node.getAttribute('data-id'),
    dataTestId: node.getAttribute('data-testid'),
    transform: node.getAttribute('transform')
  });

  const getSvgElementBBox = (node: Element): { x: number; y: number; width: number; height: number } | undefined => {
    try {
      if ('getBBox' in node) {
        const bbox = (node as SVGGraphicsElement).getBBox();
        if (bbox && bbox.width > 0 && bbox.height > 0) {
          return { x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height };
        }
      }
    } catch {
      // getBBox can throw for non-rendered nodes; ignore for diagnostics
    }
    return getSvgNodeBBox(node);
  };

  const logSvgDiagnostics = (svg: SVGSVGElement, nodeTitle?: string, nodeId?: string): void => {
    const viewBox = svg.getAttribute('viewBox') ?? '';
    const viewBoxParts = viewBox.split(/\s+/).map(Number);
    const vb =
      viewBoxParts.length === 4 && viewBoxParts.every((n) => Number.isFinite(n))
        ? { x: viewBoxParts[0], y: viewBoxParts[1], width: viewBoxParts[2], height: viewBoxParts[3] }
        : undefined;
    logExport('likec4 svg viewBox', vb ?? viewBox);
    logExport('likec4 svg size', {
      width: svg.getAttribute('width'),
      height: svg.getAttribute('height')
    });

    const candidateSelectors = [
      'g.node',
      'g.react-flow__node',
      '[likec4_id]',
      '[data-likec4-id]',
      '[likec4-id]',
      '[data-testid^="rf__node-"]'
    ];
    const candidates = candidateSelectors.flatMap((selector) =>
      Array.from(svg.querySelectorAll(selector))
    );
    if (candidates.length) {
      logExport('likec4 svg node candidates', {
        count: candidates.length,
        selectors: candidateSelectors
      });
    }

    if (!nodeTitle && !nodeId) return;
    const textMatches = Array.from(svg.querySelectorAll('text'))
      .map((text) => ({
        text,
        value: text.textContent?.trim() ?? ''
      }))
      .filter(({ value }) => value && (value === nodeTitle || value.includes(nodeTitle ?? '')))
      .slice(0, 3);
    if (textMatches.length) {
      logExport(
        'likec4 svg text matches',
        textMatches.map(({ text, value }) => ({
          value,
          parent: describeSvgNode(text.closest('g') ?? text.parentElement ?? text),
          bbox: getSvgElementBBox(text.closest('g') ?? text)
        }))
      );
    }

    const idMatches = nodeId
      ? candidates.filter((node) => {
          const likec4Id =
            node.getAttribute('likec4_id') ??
            node.getAttribute('data-likec4-id') ??
            node.getAttribute('likec4-id');
          const title = node.querySelector('title')?.textContent?.trim();
          return likec4Id === nodeId || title === nodeId;
        })
      : [];
    if (idMatches.length) {
      logExport(
        'likec4 svg id matches',
        idMatches.slice(0, 3).map((node) => ({
          node: describeSvgNode(node),
          bbox: getSvgElementBBox(node)
        }))
      );
    } else {
      logExport('likec4 svg node match not found', { nodeId, nodeTitle, vb });
    }
  };

  const injectLikec4Icons = (svg: SVGSVGElement, icons: LikeC4IconSnapshot[]): void => {
    const likec4El = document.querySelector('likec4-viewer') as HTMLElement | null;
    if (!likec4El) return;
    const hostRect = likec4El.getBoundingClientRect();
    const { width: hostWidth, height: hostHeight } = hostRect;
    if (!hostWidth || !hostHeight) return;

    const viewBox = svg.getAttribute('viewBox');
    const viewBoxParts = viewBox?.split(/\s+/).map(Number) ?? [];
    const viewBoxX = viewBoxParts.length === 4 ? viewBoxParts[0] : 0;
    const viewBoxY = viewBoxParts.length === 4 ? viewBoxParts[1] : 0;
    const viewBoxW = viewBoxParts.length === 4 ? viewBoxParts[2] : undefined;
    const viewBoxH = viewBoxParts.length === 4 ? viewBoxParts[3] : undefined;
    const measuredSvg = svg.cloneNode(true) as SVGSVGElement;
    if (viewBoxW && viewBoxH) {
      measuredSvg.setAttribute('width', `${viewBoxW}`);
      measuredSvg.setAttribute('height', `${viewBoxH}`);
    }
    measuredSvg.style.position = 'fixed';
    measuredSvg.style.left = '-10000px';
    measuredSvg.style.top = '-10000px';
    measuredSvg.style.visibility = 'hidden';
    measuredSvg.style.pointerEvents = 'none';
    document.body.append(measuredSvg);

    const roots = collectRoots(likec4El);
    const viewport =
      roots.map((root) => root.querySelector<HTMLElement>('.react-flow__viewport')).find(Boolean) ??
      null;
    const viewportRect = viewport?.getBoundingClientRect();
    logExport('likec4 viewport rect', viewportRect ? {
      x: Math.round(viewportRect.left),
      y: Math.round(viewportRect.top),
      width: Math.round(viewportRect.width),
      height: Math.round(viewportRect.height)
    } : null);
    logExport('likec4 host rect', {
      x: Math.round(hostRect.left),
      y: Math.round(hostRect.top),
      width: Math.round(hostRect.width),
      height: Math.round(hostRect.height)
    });
    const transform = viewport ? getComputedStyle(viewport).transform : 'none';
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    if (transform && transform !== 'none') {
      const match = transform.match(/matrix\\(([^)]+)\\)/);
      if (match) {
        const parts = match[1].split(',').map((v) => Number.parseFloat(v.trim()));
        if (parts.length >= 6) {
          scale = parts[0] || 1;
          translateX = parts[4] || 0;
          translateY = parts[5] || 0;
        }
      } else {
        const match3d = transform.match(/matrix3d\\(([^)]+)\\)/);
        if (match3d) {
          const parts = match3d[1].split(',').map((v) => Number.parseFloat(v.trim()));
          if (parts.length >= 16) {
            scale = parts[0] || 1;
            translateX = parts[12] || 0;
            translateY = parts[13] || 0;
          }
        }
      }
    }
    logExport('likec4 viewport transform', { scale, translateX, translateY });

    const liveSvg = likec4El.shadowRoot?.querySelector('svg') as SVGSVGElement | null;
    const liveRect = liveSvg?.getBoundingClientRect();
    const liveViewBox = liveSvg?.getAttribute('viewBox') ?? '';
    const liveViewBoxParts = liveViewBox.split(/\s+/).map(Number);
    const liveVB =
      liveViewBoxParts.length === 4 && liveViewBoxParts.every((n) => Number.isFinite(n))
        ? {
            x: liveViewBoxParts[0],
            y: liveViewBoxParts[1],
            width: liveViewBoxParts[2],
            height: liveViewBoxParts[3]
          }
        : undefined;
    if (liveRect && liveVB) {
      logExport('likec4 live svg metrics', {
        rect: {
          x: Math.round(liveRect.left),
          y: Math.round(liveRect.top),
          width: Math.round(liveRect.width),
          height: Math.round(liveRect.height)
        },
        viewBox: liveVB
      });
    }

    const mapViaLiveSvg = (icon: LikeC4IconSnapshot) => {
      if (!liveRect || !liveVB || !viewBoxW || !viewBoxH) return null;
      if (!liveRect.width || !liveRect.height) return null;
      const screenX = hostRect.left + icon.x;
      const screenY = hostRect.top + icon.y;
      const liveScaleX = liveVB.width / liveRect.width;
      const liveScaleY = liveVB.height / liveRect.height;
      const liveX = (screenX - liveRect.left) * liveScaleX + liveVB.x;
      const liveY = (screenY - liveRect.top) * liveScaleY + liveVB.y;
      const liveW = icon.width * liveScaleX;
      const liveH = icon.height * liveScaleY;
      const exportScaleX = viewBoxW / liveVB.width;
      const exportScaleY = viewBoxH / liveVB.height;
      return {
        x: (liveX - liveVB.x) * exportScaleX + viewBoxX,
        y: (liveY - liveVB.y) * exportScaleY + viewBoxY,
        width: liveW * exportScaleX,
        height: liveH * exportScaleY
      };
    };

    const mapViaViewportToSvg = (icon: LikeC4IconSnapshot) => {
      if (!viewportRect || !viewBoxW || !viewBoxH) return null;
      if (!viewportRect.width || !viewportRect.height) return null;
      const screenX = hostRect.left + icon.x;
      const screenY = hostRect.top + icon.y;
      const viewportX = (screenX - viewportRect.left - translateX) / scale;
      const viewportY = (screenY - viewportRect.top - translateY) / scale;
      const scaleX = viewBoxW / viewportRect.width;
      const scaleY = viewBoxH / viewportRect.height;
      return {
        x: viewportX * scaleX + viewBoxX,
        y: viewportY * scaleY + viewBoxY,
        width: (icon.width / scale) * scaleX,
        height: (icon.height / scale) * scaleY
      };
    };

    const mapNodeRectViaViewportToSvg = (icon: LikeC4IconSnapshot) => {
      if (
        icon.nodeX === undefined ||
        icon.nodeY === undefined ||
        icon.nodeWidth === undefined ||
        icon.nodeHeight === undefined
      ) {
        return null;
      }
      if (!viewportRect || !viewBoxW || !viewBoxH) return null;
      if (!viewportRect.width || !viewportRect.height) return null;
      const screenX = hostRect.left + icon.nodeX;
      const screenY = hostRect.top + icon.nodeY;
      const viewportX = (screenX - viewportRect.left - translateX) / scale;
      const viewportY = (screenY - viewportRect.top - translateY) / scale;
      const scaleX = viewBoxW / viewportRect.width;
      const scaleY = viewBoxH / viewportRect.height;
      return {
        x: viewportX * scaleX + viewBoxX,
        y: viewportY * scaleY + viewBoxY,
        width: (icon.nodeWidth / scale) * scaleX,
        height: (icon.nodeHeight / scale) * scaleY
      };
    };

    const isPlacementInView = (x: number, y: number, width: number, height: number) => {
      if (!Number.isFinite(x + y + width + height)) return false;
      if (viewBoxW === undefined || viewBoxH === undefined) return true;
      const minX = viewBoxX - 1;
      const minY = viewBoxY - 1;
      const maxX = viewBoxX + viewBoxW + 1;
      const maxY = viewBoxY + viewBoxH + 1;
      return x + width >= minX && y + height >= minY && x <= maxX && y <= maxY;
    };

    icons.forEach((icon, index) => {
      const clone = icon.svg.cloneNode(true) as SVGSVGElement;
      prefixSvgIds(clone, `likec4-icon-${index}-`);
      if (icon.color) {
        clone.setAttribute('color', icon.color);
        clone.style.color = icon.color;
      }
      let x = icon.x;
      let y = icon.y;
      let width = icon.width;
      let height = icon.height;
      let usedNodeMapping = false;
      let usedMeasuredMapping = false;
      logExport('likec4 icon placement', {
        index,
        nodeId: icon.nodeId,
        nodeTitle: icon.nodeTitle,
        relX: icon.relX,
        relY: icon.relY,
        relW: icon.relW,
        relH: icon.relH
      });
      logSvgDiagnostics(svg, icon.nodeTitle, icon.nodeId);
      const nodeId = icon.nodeId;
      const nodeTitle = icon.nodeTitle;
      const relReady =
        icon.relX !== undefined &&
        icon.relY !== undefined &&
        icon.relW !== undefined &&
        icon.relH !== undefined;

      const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
      if (relReady && nodeTitle) {
        const measuredText = Array.from(measuredSvg.querySelectorAll<SVGTextElement>('text')).find((text) => {
          const value = text.textContent?.trim();
          return value === nodeTitle || value?.includes(nodeTitle);
        });
        const measuredNode =
          (measuredText?.closest('g.node') as SVGGElement | null) ??
          (measuredText?.closest('g') as SVGGElement | null);
        if (measuredNode) {
          try {
            const bbox = measuredNode.getBBox();
            if (bbox && bbox.width > 1 && bbox.height > 1) {
              const padding = Math.min(bbox.width, bbox.height) * 0.08;
              const innerW = Math.max(1, bbox.width - padding * 2);
              const innerH = Math.max(1, bbox.height - padding * 2);
              const relW = clamp(icon.relW!, 0.1, 1);
              const relH = clamp(icon.relH!, 0.1, 1);
              width = Math.min(innerW, relW * bbox.width);
              height = Math.min(innerH, relH * bbox.height);
              const relX = clamp(icon.relX!, 0, 1);
              const relY = clamp(icon.relY!, 0, 1);
              x = bbox.x + padding + relX * Math.max(0, innerW - width);
              y = bbox.y + padding + relY * Math.max(0, innerH - height);
              usedNodeMapping = true;
              usedMeasuredMapping = true;
              logExport('likec4 icon placement using measured svg node', {
                bbox,
                padding,
                relX: icon.relX,
                relY: icon.relY,
                relW: icon.relW,
                relH: icon.relH,
                matchedText: measuredText?.textContent?.trim() ?? null
              });
            }
          } catch {
            // fallback to other mappings below
          }
        }
      }
      if (relReady && !usedNodeMapping) {
        const mappedNode = mapNodeRectViaViewportToSvg(icon);
        if (mappedNode && mappedNode.width > 1 && mappedNode.height > 1) {
          const relW = clamp(icon.relW!, 0, 1);
          const relH = clamp(icon.relH!, 0, 1);
          const relX = clamp(icon.relX!, 0, Math.max(0, 1 - relW));
          const relY = clamp(icon.relY!, 0, Math.max(0, 1 - relH));
          x = mappedNode.x + relX * mappedNode.width;
          y = mappedNode.y + relY * mappedNode.height;
          width = Math.max(1, relW * mappedNode.width);
          height = Math.max(1, relH * mappedNode.height);
          usedNodeMapping = true;
          logExport('likec4 icon placement using mapped node rect', {
            mappedNode,
            relX: icon.relX,
            relY: icon.relY,
            relW: icon.relW,
            relH: icon.relH,
            clampedRelX: relX,
            clampedRelY: relY,
            clampedRelW: relW,
            clampedRelH: relH
          });
        }
      }

      if (
        !usedNodeMapping &&
        nodeId &&
        relReady
      ) {
        const nodeEl =
          svg.querySelector(`[likec4_id="${nodeId}"]`) ??
          svg.querySelector(`[data-likec4-id="${nodeId}"]`) ??
          svg.querySelector(`[likec4-id="${nodeId}"]`);
        if (nodeEl && 'getBBox' in nodeEl) {
          try {
            const bbox =
              getSvgNodeBBox(nodeEl) ?? (nodeEl as SVGGraphicsElement).getBBox();
            if (bbox && bbox.width > 1 && bbox.height > 1) {
              const mappedWidth = icon.relW * bbox.width;
              const mappedHeight = icon.relH * bbox.height;
              const isValid =
                Number.isFinite(mappedWidth) &&
                Number.isFinite(mappedHeight) &&
                mappedWidth > 1 &&
                mappedHeight > 1;
              if (isValid) {
                x = bbox.x + icon.relX * bbox.width;
                y = bbox.y + icon.relY * bbox.height;
                width = mappedWidth;
                height = mappedHeight;
                usedNodeMapping = true;
              }
              logExport('likec4 svg node bbox (id)', nodeId, {
                bbox,
                relX: icon.relX,
                relY: icon.relY,
                relW: icon.relW,
                relH: icon.relH,
                mappedWidth,
                mappedHeight,
                usedNodeMapping
              });
            }
          } catch {
            // fallback to viewport mapping below
          }
        } else {
          logExport('likec4 svg node not found for icon', nodeId);
        }
      }
      if (!usedNodeMapping && nodeId) {
        const titleMatches = Array.from(svg.querySelectorAll('g.node > title')).find(
          (title) => title.textContent?.trim() === nodeId
        );
        const titleNode = titleMatches?.parentElement as SVGGraphicsElement | null;
        if (titleNode) {
          try {
            const bbox = getSvgNodeBBox(titleNode) ?? titleNode.getBBox();
            if (
              icon.relX !== undefined &&
              icon.relY !== undefined &&
              icon.relW !== undefined &&
              icon.relH !== undefined &&
              bbox &&
              bbox.width > 1 &&
              bbox.height > 1
            ) {
              const mappedWidth = icon.relW * bbox.width;
              const mappedHeight = icon.relH * bbox.height;
              const isValid =
                Number.isFinite(mappedWidth) &&
                Number.isFinite(mappedHeight) &&
                mappedWidth > 1 &&
                mappedHeight > 1;
              if (isValid) {
                x = bbox.x + icon.relX * bbox.width;
                y = bbox.y + icon.relY * bbox.height;
                width = mappedWidth;
                height = mappedHeight;
                usedNodeMapping = true;
              }
              logExport('likec4 svg node bbox (title)', nodeTitle, {
                bbox,
                relX: icon.relX,
                relY: icon.relY,
                relW: icon.relW,
                relH: icon.relH,
                mappedWidth,
                mappedHeight,
                usedNodeMapping
              });
            }
          } catch {
            // fallback to viewport mapping below
          }
        }
      }
      if (!usedNodeMapping && nodeTitle) {
        const nodes = Array.from(svg.querySelectorAll<SVGGElement>('g.node'));
        const match = nodes.find((node) =>
          Array.from(node.querySelectorAll('text')).some((text) => {
            const value = text.textContent?.trim();
            return value === nodeTitle || value?.includes(nodeTitle);
          })
        );
        if (match) {
          try {
            const bbox = getSvgNodeBBox(match) ?? match.getBBox();
            if (
              icon.relX !== undefined &&
              icon.relY !== undefined &&
              icon.relW !== undefined &&
              icon.relH !== undefined &&
              bbox &&
              bbox.width > 1 &&
              bbox.height > 1
            ) {
              const mappedWidth = icon.relW * bbox.width;
              const mappedHeight = icon.relH * bbox.height;
              const isValid =
                Number.isFinite(mappedWidth) &&
                Number.isFinite(mappedHeight) &&
                mappedWidth > 1 &&
                mappedHeight > 1;
              if (isValid) {
                x = bbox.x + icon.relX * bbox.width;
                y = bbox.y + icon.relY * bbox.height;
                width = mappedWidth;
                height = mappedHeight;
                usedNodeMapping = true;
              }
              logExport('likec4 svg node bbox (text)', nodeTitle, {
                bbox,
                relX: icon.relX,
                relY: icon.relY,
                relW: icon.relW,
                relH: icon.relH,
                mappedWidth,
                mappedHeight,
                usedNodeMapping
              });
            }
          } catch {
            // fallback to viewport mapping below
          }
        }
      }
      if (!usedNodeMapping && nodeTitle) {
        const textEl = Array.from(svg.querySelectorAll<SVGTextElement>('text')).find((text) => {
          const value = text.textContent?.trim();
          return value === nodeTitle || value?.includes(nodeTitle);
        });
        const group = textEl?.closest('g') as SVGGraphicsElement | null;
        if (group) {
          try {
            const bbox = getSvgNodeBBox(group) ?? group.getBBox();
            if (
              icon.relX !== undefined &&
              icon.relY !== undefined &&
              icon.relW !== undefined &&
              icon.relH !== undefined &&
              bbox &&
              bbox.width > 1 &&
              bbox.height > 1
            ) {
              const mappedWidth = icon.relW * bbox.width;
              const mappedHeight = icon.relH * bbox.height;
              const isValid =
                Number.isFinite(mappedWidth) &&
                Number.isFinite(mappedHeight) &&
                mappedWidth > 1 &&
                mappedHeight > 1;
              if (isValid) {
                x = bbox.x + icon.relX * bbox.width;
                y = bbox.y + icon.relY * bbox.height;
                width = mappedWidth;
                height = mappedHeight;
                usedNodeMapping = true;
              }
              logExport('likec4 svg node bbox (text-any)', nodeTitle, {
                bbox,
                relX: icon.relX,
                relY: icon.relY,
                relW: icon.relW,
                relH: icon.relH,
                mappedWidth,
                mappedHeight,
                usedNodeMapping
              });
            }
          } catch {
            // fallback to viewport mapping below
          }
        }
        if (!usedNodeMapping) {
          logExport('likec4 svg node not found for icon title', nodeTitle);
        }
      }
      if (!usedNodeMapping && viewport && viewportRect) {
        const mapped = mapViaViewportToSvg(icon);
        if (mapped) {
          x = mapped.x;
          y = mapped.y;
          width = mapped.width;
          height = mapped.height;
          logExport('likec4 icon placement using viewport->svg mapping', mapped);
        }
      } else if (!usedNodeMapping) {
        const { width: svgWidth, height: svgHeight } = getSvgSize(svg);
        const scaleX = svgWidth / hostWidth;
        const scaleY = svgHeight / hostHeight;
        x = icon.x * scaleX;
        y = icon.y * scaleY;
        width = icon.width * scaleX;
        height = icon.height * scaleY;
      }
      if (usedNodeMapping && !usedMeasuredMapping && !isPlacementInView(x, y, width, height)) {
        const mappedLive = mapViaLiveSvg(icon);
        const mappedViewport = mapViaViewportToSvg(icon);
        if (mappedLive) {
          logExport('likec4 icon placement out of view, using live svg mapping', mappedLive);
          x = mappedLive.x;
          y = mappedLive.y;
          width = mappedLive.width;
          height = mappedLive.height;
          usedNodeMapping = false;
        } else if (mappedViewport) {
          logExport('likec4 icon placement out of view, using viewport->svg mapping', mappedViewport);
          x = mappedViewport.x;
          y = mappedViewport.y;
          width = mappedViewport.width;
          height = mappedViewport.height;
          usedNodeMapping = false;
        } else {
          logExport('likec4 icon placement out of view, keeping node mapping', { x, y, width, height });
        }
      }
      if (usedMeasuredMapping && viewBoxW !== undefined && viewBoxH !== undefined) {
        const minX = viewBoxX;
        const minY = viewBoxY;
        const maxX = viewBoxX + viewBoxW - width;
        const maxY = viewBoxY + viewBoxH - height;
        x = clamp(x, minX, maxX);
        y = clamp(y, minY, maxY);
      }
      logExport('likec4 icon final placement', { x, y, width, height, usedNodeMapping });
      clone.setAttribute('x', `${usedNodeMapping ? x : x + viewBoxX}`);
      clone.setAttribute('y', `${usedNodeMapping ? y : y + viewBoxY}`);
      clone.setAttribute('width', `${width}`);
      clone.setAttribute('height', `${height}`);
      clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      clone.removeAttribute('class');
      svg.append(clone);
    });
    measuredSvg.remove();
  };

  const fetchLikec4VectorSvg = async (): Promise<SVGSVGElement | undefined> => {
    // Server now inlines icons into the SVG; return it as-is to avoid client-side remapping.
    return (await fetchLikec4Svg()) as SVGSVGElement | undefined;
  };

  const getSvgElement = async (): Promise<HTMLElement | undefined> => {
    if (currentLanguage === 'likec4') {
      // Prefer DOM snapshot with foreignObject so HTML icons and styles are preserved.
      const domSnapshot = buildLikec4DomSnapshot();
      if (domSnapshot) {
        logExport('using snapshot svg');
        return domSnapshot;
      }

      // Fallback to the server-rendered SVG (no icons, but at least something).
      const fetched = await fetchLikec4Svg();
      if (fetched) {
        logExport('using fetched svg');
        fetched.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        fetched.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        return fetched;
      }

      // Fallback to the live viewer DOM if the API failed.
      const likec4El = document.querySelector('likec4-viewer') as HTMLElement | null;
      const shadow = likec4El?.shadowRoot;
      const liveSvg = shadow?.querySelector('svg');
      if (likec4El && liveSvg && shadow) {
        const bounds = likec4El.getBoundingClientRect();
        const w = Math.max(1, Math.round(bounds.width)) || 1200;
        const h = Math.max(1, Math.round(bounds.height)) || 800;
        const clone = liveSvg.cloneNode(true) as SVGElement;
        clone.setAttribute('width', `${w}`);
        clone.setAttribute('height', `${h}`);
        clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        const styleTags = Array.from(shadow.querySelectorAll('style'));
        if (styleTags.length) {
          let defs = clone.querySelector('defs');
          if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            clone.insertBefore(defs, clone.firstChild);
          }
          styleTags.forEach((st) => {
            const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
            styleEl.textContent = st.textContent ?? '';
            defs!.append(styleEl);
          });
        }
        logExport('using live svg clone', { w, h, styles: styleTags.length });
        return clone as unknown as HTMLElement;
      }
    }

    const mermaidSvg = document
      .querySelector('#container svg')
      ?.cloneNode(true) as HTMLElement | undefined;
    if (mermaidSvg) {
      logExport('using mermaid svg');
      mermaidSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      return mermaidSvg;
    }
    return undefined;
  };

  const getPngSvgElement = async (): Promise<HTMLElement | undefined> => {
    if (currentLanguage === 'likec4') {
      const fetched = await fetchLikec4VectorSvg();
      if (fetched) {
        logExport('png using fetched svg');
        fetched.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        fetched.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        return fetched;
      }
    } else if (currentLanguage === 'mermaid') {
      const rendered = await renderMermaidPngSvg();
      if (rendered) {
        logExport('png using mermaid render');
        rendered.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        return rendered as unknown as HTMLElement;
      }
    }
    return getSvgElement();
  };

  const buildSvgString = async (
    svg?: HTMLElement,
    width?: number,
    height?: number
  ): Promise<string> => {
    if (svg) {
      svg = svg.cloneNode(true) as HTMLElement;
    } else {
      svg = await getSvgElement();
    }
    if (!svg) {
      throw new Error('svg not found');
    }
    // Ensure width/height are present when exporting fetched LikeC4 SVGs.
    const viewBox = svg.getAttribute('viewBox');
    if (!width && !height && viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        svg.setAttribute('width', `${parts[2]}`);
        svg.setAttribute('height', `${parts[3]}`);
      }
    }
    if (height) {
      svg?.setAttribute('height', `${height}px`);
    }
    if (width) {
      svg?.setAttribute('width', `${width}px`);
    }
    // Workaround https://stackoverflow.com/questions/28690643/firefox-error-rendering-an-svg-image-to-html5-canvas-with-drawimage
    svg.style.backgroundColor = window.getComputedStyle(document.body).getPropertyValue('--background');

    const serializer = new XMLSerializer();
    let svgString = serializer
      .serializeToString(svg as unknown as SVGElement)
      .replaceAll('<br>', '<br/>')
      .replaceAll(/<img([^>]*)>/g, (m, g: string) => `<img ${g} />`);
    if (!svgString.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgString = svgString.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!svgString.includes('xmlns:xlink=')) {
      svgString = svgString.replace('<svg', '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    }
    logExport('built svg string length', svgString.length);
    logExport('svg export contains foreignObject', svgString.includes('<foreignObject'));

    return `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet href="${FONT_AWESOME_URL}" type="text/css"?>
${svgString}`;
  };

  const getSvgSize = (svg: SVGElement): { width: number; height: number } => {
    const wAttr = svg.getAttribute('width');
    const hAttr = svg.getAttribute('height');
    const w = wAttr ? Number.parseFloat(wAttr) : NaN;
    const h = hAttr ? Number.parseFloat(hAttr) : NaN;
    if (Number.isFinite(w) && Number.isFinite(h)) {
      return { width: w, height: h };
    }
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
        return { width: parts[2], height: parts[3] };
      }
    }
    return { width: 1200, height: 800 };
  };

  const getSvgObjectUrl = async (svg?: HTMLElement, width?: number, height?: number): Promise<string> => {
    const svgString = await buildSvgString(svg, width, height);
    console.log('[export-png] svg string length', svgString.length);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    console.log('[export-png] svg blob size', blob.size);
    return URL.createObjectURL(blob);
  };

  const rasterizeSvgToSvgImage = async (svg: SVGElement): Promise<string> => {
    const { width, height } = getSvgSize(svg);
    const image = new Image();
    const loadPromise = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load SVG image'));
    });
    const objectUrl = await getSvgObjectUrl(svg as unknown as HTMLElement, width, height);
    image.src = objectUrl;
    await loadPromise;
    URL.revokeObjectURL(objectUrl);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('context not found');
    }
    context.fillStyle = window.getComputedStyle(document.body).getPropertyValue('--background');
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const pngDataUrl = canvas.toDataURL('image/png');
    const rasterSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    rasterSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    rasterSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    rasterSvg.setAttribute('width', `${canvas.width}`);
    rasterSvg.setAttribute('height', `${canvas.height}`);
    rasterSvg.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
    const imageEl = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    imageEl.setAttribute('width', `${canvas.width}`);
    imageEl.setAttribute('height', `${canvas.height}`);
    imageEl.setAttribute('href', pngDataUrl);
    rasterSvg.append(imageEl);
    return buildSvgString(rasterSvg);
  };

  const simulateDownload = (download: string, href: string): void => {
    const a = document.createElement('a');
    a.download = download;
    a.href = href;
    a.click();
    a.remove();
  };

  const exportImage = async (event: Event, exporter: Exporter, preferVectorSvg = false) => {
    $inputStateStore.panZoom = false;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await waitForRender();
    const canvas = document.createElement('canvas');
    const svg = preferVectorSvg ? await getPngSvgElement() : await getSvgElement();
    if (!svg) {
      throw new Error('svg not found');
    }

    const box = svg.getBoundingClientRect();
    const svgSize = getSvgSize(svg);
    const baseWidth = box.width > 0 ? box.width : svgSize.width;
    const baseHeight = box.height > 0 ? box.height : svgSize.height;

    if (imageSizeMode === 'width') {
      const ratio = baseHeight / baseWidth;
      canvas.width = imageSize;
      canvas.height = imageSize * ratio;
    } else if (imageSizeMode === 'height') {
      const ratio = baseWidth / baseHeight;
      canvas.width = imageSize * ratio;
      canvas.height = imageSize;
    } else {
      const multiplier = 2;
      canvas.width = baseWidth * multiplier;
      canvas.height = baseHeight * multiplier;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('context not found');
    }

    context.fillStyle = window.getComputedStyle(document.body).getPropertyValue('--background');
    context.fillRect(0, 0, canvas.width, canvas.height);

    const image = new Image();
    let objectUrl: string | null = null;
    image.addEventListener('load', () => {
      console.log('[export-png] image loaded', {
        width: image.naturalWidth,
        height: image.naturalHeight
      });
      exporter(context, image)();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      $inputStateStore.panZoom = true;
    });
    image.addEventListener('error', (event) => {
      console.error('[export-png] image load error', event);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
    objectUrl = await getSvgObjectUrl(svg, canvas.width, canvas.height);
    console.log('[export-png] canvas size', { width: canvas.width, height: canvas.height });
    console.log('[export-png] object url', objectUrl);
    image.src = objectUrl;
    // Fallback to set panZoom to true after 2 seconds
    // This is a workaround for the case when the image is not loaded
    setTimeout(() => {
      if (!$inputStateStore.panZoom) {
        $inputStateStore.panZoom = true;
      }
    }, 2000);
    event.stopPropagation();
    event.preventDefault();
  };

  const downloadImage: Exporter = (context, image) => {
    return () => {
      const { canvas } = context;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            console.error('[export-png] png blob is empty', {
              canvasWidth: canvas.width,
              canvasHeight: canvas.height
            });
            return;
          }
          console.log('[export-png] png blob size', blob.size);
          const url = URL.createObjectURL(blob);
          simulateDownload(getFileName('png'), url);
          setTimeout(() => URL.revokeObjectURL(url), 0);
        },
        'image/png',
        1
      );
    };
  };

  const onDownloadPNG = async (event: Event) => {
    await exportImage(event, downloadImage, true);
    logEvent('download', {
      type: 'png'
    });
  };

  const onDownloadSVG = async () => {
    let svgEl: HTMLElement | undefined;
    if (currentLanguage === 'likec4') {
      svgEl = await fetchLikec4VectorSvg();
      if (svgEl) {
        logExport('download svg using vector likec4 svg');
        svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svgEl.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      }
    }
    let svgText: string;
    svgText = await buildSvgString(svgEl);
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    simulateDownload(getFileName('svg'), url);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    logEvent('download', {
      type: 'svg'
    });
  };

  let imageSizeMode: 'auto' | 'width' | 'height' = $state('auto');

  $effect(() => {
    if (!imageSizeMode) {
      imageSizeMode = 'auto';
    }
  });

  let imageSize = $state(1080);

  const isNetlify = browser && window.location.host.includes('netlify');
</script>

{#snippet dualActionButton(text: string, download: (event: Event) => unknown, url?: string)}
  <div class="flex w-full min-w-0 gap-0.5">
    <Button
      class={['w-full min-w-0', url && 'rounded-r-none']}
      onclick={download}
      data-testid="download-{text}">
      <DownloadIcon />
      {text}
    </Button>
    {#if url}
      <ExternalLinkWrapper domain={getDomain(url)} isVisible>
        <Button class="w-full min-w-0 rounded-l-none" href={url} target="_blank" rel="noreferrer noopener">
          <ExternalLinkIcon />
        </Button>
      </ExternalLinkWrapper>
    {/if}
  </div>
{/snippet}

{#snippet exportContent()}
  <div class={['flex flex-col gap-2 p-2', embedded ? 'w-full min-w-0' : 'min-w-fit']}>
    {#if embedded}
      <div class="flex items-center gap-2 flex-wrap">
        <div class="text-xs font-medium">PNG</div>
        <Button
          size="sm"
          variant="ghost"
          class="h-7 px-2 text-xs shrink-0"
          onclick={() => (showSizeControls = !showSizeControls)}>
          Size: {imageSizeMode}
        </Button>
      </div>
      {#if showSizeControls}
        <div class="flex flex-col gap-2 rounded-md border border-border bg-background/40 p-2">
          <ToggleGroup.Root type="single" variant="outline" bind:value={imageSizeMode}>
            <ToggleGroup.Item value="auto">Auto</ToggleGroup.Item>
            <ToggleGroup.Item value="width">Width</ToggleGroup.Item>
            <ToggleGroup.Item value="height">Height</ToggleGroup.Item>
          </ToggleGroup.Root>
          <div class="flex items-center gap-2">
            {#if imageSizeMode !== 'auto'}
              <WidthIcon
                class={['size-5 shrink-0 transition-all', imageSizeMode === 'width' && 'rotate-90']} />
            {/if}
            <Input
              type="number"
              min="3"
              max="10000"
              disabled={imageSizeMode === 'auto'}
              bind:value={imageSize} />
          </div>
        </div>
      {/if}
    {:else}
      <div class="flex w-full items-center gap-2 py-2 whitespace-nowrap">
        PNG size
        <ToggleGroup.Root type="single" variant="outline" bind:value={imageSizeMode}>
          <ToggleGroup.Item value="auto">Auto</ToggleGroup.Item>
          <ToggleGroup.Item value="width">Width</ToggleGroup.Item>
          <ToggleGroup.Item value="height">Height</ToggleGroup.Item>
        </ToggleGroup.Root>
        {#if imageSizeMode !== 'auto'}
          <WidthIcon
            class={['size-6 shrink-0 transition-all', imageSizeMode === 'width' && 'rotate-90']} />
        {/if}
        <Input
          type="number"
          min="3"
          max="10000"
          disabled={imageSizeMode === 'auto'}
          bind:value={imageSize} />
      </div>
    {/if}
    {#if embedded}
      <div class="grid w-full grid-cols-2 gap-2">
        <Button class="w-full h-8 px-3 text-xs" size="sm" onclick={onDownloadPNG}>
          <DownloadIcon />
          PNG
        </Button>
        <Button class="w-full h-8 px-3 text-xs" size="sm" onclick={onDownloadSVG}>
          <DownloadIcon />
          SVG
        </Button>
      </div>
    {:else}
      <div class="flex flex-wrap gap-2">
        {@render dualActionButton('PNG', onDownloadPNG)}
        {@render dualActionButton('SVG', onDownloadSVG)}
      </div>
    {/if}
    {#if isNetlify}
      <div class="flex w-full items-center justify-center">
        <a class="link text-sm text-gray-500 underline" href="https://netlify.com">
          This site is powered by Netlify
        </a>
      </div>
    {/if}
  </div>
{/snippet}

{#if embedded}
  <div class="w-[360px] max-w-[75vw] overflow-hidden">
    {@render exportContent()}
  </div>
{:else}
  <Card title="Export" isStackable icon={{ component: DownloadIcon, class: 'rotate-180' }}>
    {@render exportContent()}
  </Card>
{/if}
