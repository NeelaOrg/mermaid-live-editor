<script lang="ts">
  import Card from '$/components/Card/Card.svelte';
  import CopyButton from '$/components/CopyButton.svelte';
  import CopyInput from '$/components/CopyInput.svelte';
  import ExternalLinkWrapper from '$/components/ExternalLinkWrapper.svelte';
  import { Button } from '$/components/ui/button';
  import { Input } from '$/components/ui/input';
  import { Separator } from '$/components/ui/separator';
  import * as ToggleGroup from '$/components/ui/toggle-group';
  import { TID } from '$/constants';
  import { getDomain } from '$/util/util';
  import { browser } from '$app/environment';
  import { waitForRender } from '$lib/util/autoSync';
  import { inputStateStore, stateStore, urlsStore } from '$lib/util/state';
  import { logEvent } from '$lib/util/stats';
  import { version as FAVersion } from '@fortawesome/fontawesome-free/package.json';
  import dayjs from 'dayjs';
  import { toBase64 } from 'js-base64';
  import DownloadIcon from '~icons/material-symbols/download';
  import ExternalLinkIcon from '~icons/material-symbols/open-in-new-rounded';
  import WidthIcon from '~icons/material-symbols/width-rounded';

  const FONT_AWESOME_URL = `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/${FAVersion}/css/all.min.css`;

  type Exporter = (context: CanvasRenderingContext2D, image: HTMLImageElement) => () => void;

  const getFileName = (extension: string) =>
    `mermaid-diagram-${dayjs().format('YYYY-MM-DD-HHmmss')}.${extension}`;

  let currentLanguage = 'mermaid';
  let currentCode = '';
  stateStore.subscribe(({ language, code }) => {
    currentLanguage = language ?? 'mermaid';
    currentCode = code;
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
  };

  const parseSvgText = (text: string): SVGSVGElement | null => {
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    return doc.querySelector('svg');
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
        const nodeEl =
          iconEl instanceof HTMLElement
            ? (iconEl.closest('[data-testid^="rf__node-"], [data-id]') as HTMLElement | null)
            : null;
        const nodeRect = nodeEl?.getBoundingClientRect();
        let nodeId: string | undefined;
        const dataId = nodeEl?.getAttribute('data-id');
        if (dataId) {
          nodeId = dataId;
        } else {
          const testId = nodeEl?.getAttribute('data-testid');
          if (testId?.startsWith('rf__node-')) {
            nodeId = testId.slice('rf__node-'.length);
          }
        }
        const relX =
          nodeRect && nodeRect.width ? (finalRect.left - nodeRect.left) / nodeRect.width : undefined;
        const relY =
          nodeRect && nodeRect.height ? (finalRect.top - nodeRect.top) / nodeRect.height : undefined;
        const relW = nodeRect && nodeRect.width ? finalRect.width / nodeRect.width : undefined;
        const relH = nodeRect && nodeRect.height ? finalRect.height / nodeRect.height : undefined;
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
          relH
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

    const roots = collectRoots(likec4El);
    const viewport =
      roots.map((root) => root.querySelector<HTMLElement>('.react-flow__viewport')).find(Boolean) ??
      null;
    const viewportRect = viewport?.getBoundingClientRect();
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
      const nodeId = icon.nodeId;
      if (
        nodeId &&
        icon.relX !== undefined &&
        icon.relY !== undefined &&
        icon.relW !== undefined &&
        icon.relH !== undefined
      ) {
        const nodeEl =
          svg.querySelector(`[likec4_id="${nodeId}"]`) ??
          svg.querySelector(`[data-likec4-id="${nodeId}"]`) ??
          svg.querySelector(`[likec4-id="${nodeId}"]`);
        if (nodeEl && 'getBBox' in nodeEl) {
          try {
            const bbox = (nodeEl as SVGGraphicsElement).getBBox();
            x = bbox.x + icon.relX * bbox.width;
            y = bbox.y + icon.relY * bbox.height;
            width = icon.relW * bbox.width;
            height = icon.relH * bbox.height;
            usedNodeMapping = true;
          } catch {
            // fallback to viewport mapping below
          }
        } else {
          logExport('likec4 svg node not found for icon', nodeId);
        }
      }
      if (!usedNodeMapping && viewport && viewportRect) {
        const screenX = hostRect.left + icon.x;
        const screenY = hostRect.top + icon.y;
        x = (screenX - viewportRect.left - translateX) / scale;
        y = (screenY - viewportRect.top - translateY) / scale;
        width = icon.width / scale;
        height = icon.height / scale;
      } else if (!usedNodeMapping) {
        const { width: svgWidth, height: svgHeight } = getSvgSize(svg);
        const scaleX = svgWidth / hostWidth;
        const scaleY = svgHeight / hostHeight;
        x = icon.x * scaleX;
        y = icon.y * scaleY;
        width = icon.width * scaleX;
        height = icon.height * scaleY;
      }
      clone.setAttribute('x', `${usedNodeMapping ? x : x + viewBoxX}`);
      clone.setAttribute('y', `${usedNodeMapping ? y : y + viewBoxY}`);
      clone.setAttribute('width', `${width}`);
      clone.setAttribute('height', `${height}`);
      clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      clone.removeAttribute('class');
      svg.append(clone);
    });
  };

  const fetchLikec4VectorSvg = async (): Promise<SVGSVGElement | undefined> => {
    const svgEl = (await fetchLikec4Svg()) as SVGSVGElement | undefined;
    if (!svgEl) return undefined;
    const icons = await collectLikec4Icons();
    if (icons.length) {
      logExport('likec4 icons found', icons.length);
      injectLikec4Icons(svgEl, icons);
    }
    return svgEl;
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

  const rasterizeSvgToSvgImage = async (svg: SVGElement): Promise<string> => {
    const { width, height } = getSvgSize(svg);
    const svgString = await buildSvgString(svg, width, height);
    const image = new Image();
    const loadPromise = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Failed to load SVG image'));
    });
    image.src = `data:image/svg+xml;base64,${toBase64(svgString)}`;
    await loadPromise;

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

  const getBase64SVG = async (svg?: HTMLElement, width?: number, height?: number): Promise<string> =>
    toBase64(await buildSvgString(svg, width, height));

  const simulateDownload = (download: string, href: string): void => {
    const a = document.createElement('a');
    a.download = download;
    a.href = href;
    a.click();
    a.remove();
  };

  const exportImage = async (event: Event, exporter: Exporter) => {
    $inputStateStore.panZoom = false;
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await waitForRender();
    const canvas = document.createElement('canvas');
    const svg = await getSvgElement();
    if (!svg) {
      throw new Error('svg not found');
    }

    const box = svg.getBoundingClientRect();

    if (imageSizeMode === 'width') {
      const ratio = box.height / box.width;
      canvas.width = imageSize;
      canvas.height = imageSize * ratio;
    } else if (imageSizeMode === 'height') {
      const ratio = box.width / box.height;
      canvas.width = imageSize * ratio;
      canvas.height = imageSize;
    } else {
      const multiplier = 2;
      canvas.width = box.width * multiplier;
      canvas.height = box.height * multiplier;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('context not found');
    }

    context.fillStyle = window.getComputedStyle(document.body).getPropertyValue('--background');
    context.fillRect(0, 0, canvas.width, canvas.height);

    const image = new Image();
    image.addEventListener('load', () => {
      exporter(context, image)();
      $inputStateStore.panZoom = true;
    });
    image.src = `data:image/svg+xml;base64,${await getBase64SVG(svg, canvas.width, canvas.height)}`;
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
      simulateDownload(
        getFileName('png'),
        canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream')
      );
    };
  };

  const isClipboardAvailable = (): boolean => {
    return Object.prototype.hasOwnProperty.call(window, 'ClipboardItem');
  };

  const clipboardCopy: Exporter = (context, image) => {
    return () => {
      const { canvas } = context;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        try {
          if (!blob) {
            throw new Error('blob is empty');
          }
          void navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob
            })
          ]);
        } catch (error) {
          console.error(error);
        }
      });
    };
  };

  const onCopyClipboard = async (event: Event) => {
    await exportImage(event, clipboardCopy);
    logEvent('copyClipboard');
  };

  const onDownloadPNG = async (event: Event) => {
    await exportImage(event, downloadImage);
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

  let gistURL = $state('');
  stateStore.subscribe(({ loader }) => {
    if (loader?.type === 'gist') {
      gistURL = loader.config.url;
    }
  });

  const loadGist = () => {
    if (!gistURL) {
      return alert('Please enter a Gist URL first');
    }
    window.location.href = `${window.location.pathname}?gist=${gistURL}`;
    logEvent('loadGist');
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
  <div class="flex flex-grow gap-0.5">
    <Button
      class={['flex-grow', url && 'rounded-r-none']}
      onclick={download}
      data-testid="download-{text}">
      <DownloadIcon />
      {text}
    </Button>
    <ExternalLinkWrapper domain={getDomain(url)} isVisible={!!url}>
      <Button class="rounded-l-none" href={url} target="_blank" rel="noreferrer noopener">
        <ExternalLinkIcon />
      </Button>
    </ExternalLinkWrapper>
  </div>
{/snippet}

<Card title="Actions" isStackable icon={{ component: DownloadIcon, class: 'rotate-180' }}>
  <div class="flex min-w-fit flex-col gap-2 p-2">
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
    <div class="flex gap-2">
      {@render dualActionButton('PNG', onDownloadPNG, $urlsStore.png)}
      {@render dualActionButton('SVG', onDownloadSVG, $urlsStore.svg)}
      <ExternalLinkWrapper domain={getDomain($urlsStore.kroki)} isVisible={!!$urlsStore.kroki}>
        <a target="_blank" rel="noreferrer" class="flex-grow" href={$urlsStore.kroki}>
          <Button class="action-btn flex w-full items-center gap-2">
            <ExternalLinkIcon /> Kroki
          </Button>
        </a>
      </ExternalLinkWrapper>
    </div>
    <Separator />
    {#if isClipboardAvailable()}
      <CopyButton onclick={onCopyClipboard} label="Copy Image" />
    {/if}
    <ExternalLinkWrapper
      labelPrefix="Thumbnail generated by"
      domain={getDomain($urlsStore.png)}
      isVisible={!!$urlsStore.mdCode}>
      <CopyInput value={$urlsStore.mdCode} label="Copy Markdown" testID={TID.copyMarkdown} />
    </ExternalLinkWrapper>
    <div class="flex w-full items-center gap-2">
      <Input type="url" bind:value={gistURL} placeholder="Enter Gist URL" />
      <Button onclick={loadGist}>Load Gist</Button>
    </div>
    {#if isNetlify}
      <div class="flex w-full items-center justify-center">
        <a class="link text-sm text-gray-500 underline" href="https://netlify.com">
          This site is powered by Netlify
        </a>
      </div>
    {/if}
  </div>
</Card>
