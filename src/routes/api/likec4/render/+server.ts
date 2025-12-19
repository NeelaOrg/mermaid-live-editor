import { json } from '@sveltejs/kit';
import { LikeC4 } from 'likec4';
import { parse } from 'node-html-parser';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

interface LikeC4RenderRequest {
  code?: unknown;
  viewId?: unknown;
}

interface LikeC4ErrorDetail {
  endColumn?: number;
  endLine?: number;
  message: string;
  sourceFsPath?: string;
  startColumn?: number;
  startLine: number;
}

const formatLikeC4Errors = (errors: LikeC4ErrorDetail[]): string => {
  const lines = errors
    .slice(0, 20)
    .map((e) => {
      const col =
        typeof e.startColumn === 'number' && e.startColumn >= 0 ? `:${e.startColumn + 1}` : '';
      return `line ${e.startLine}${col}: ${e.message}`;
    });
  const suffix = errors.length > 20 ? `\n… and ${errors.length - 20} more` : '';
  return `LikeC4 source has errors:\n${lines.join('\n')}${suffix}`;
};

const decodeDataUrl = (src: string): string | undefined => {
  if (src.startsWith('data:image/svg+xml;base64,')) {
    const raw = src.slice('data:image/svg+xml;base64,'.length);
    return Buffer.from(raw, 'base64').toString('utf-8');
  }
  if (src.startsWith('data:image/svg+xml,')) {
    return decodeURIComponent(src.slice('data:image/svg+xml,'.length));
  }
  return undefined;
};

const toNumeric = (value?: string | null): number | undefined => {
  if (!value) return undefined;
  const match = value.match(/-?\\d*\\.?\\d+/);
  if (!match) return undefined;
  const num = Number.parseFloat(match[0]);
  return Number.isFinite(num) ? num : undefined;
};

const prefixSvgIds = (root: ReturnType<typeof parse>, prefix: string): void => {
  const idMap = new Map<string, string>();
  root.querySelectorAll('[id]').forEach((el) => {
    const id = el.getAttribute('id');
    if (!id) return;
    const nextId = `${prefix}${id}`;
    idMap.set(id, nextId);
    el.setAttribute('id', nextId);
  });
  if (!idMap.size) return;

  const replaceRefs = (value: string) =>
    value
      .replace(/url\\(#([^)]+)\\)/g, (_, id: string) => `url(#${idMap.get(id) ?? id})`)
      .replace(/^#(.+)$/, (_, id: string) => `#${idMap.get(id) ?? id}`);

  const refAttrs = ['href', 'xlink:href', 'fill', 'stroke', 'filter', 'mask', 'clip-path', 'style'];
  root.querySelectorAll('*').forEach((el) => {
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

const iconCache = new Map<string, string>();

const resolveBuiltInIcon = async (iconId: string): Promise<string | null> => {
  const cacheKey = `builtin:${iconId}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const [group, name] = iconId.split(':');
  if (!group || !name) return null;
  const basePath = `likec4/icons/${group}/${name}.js`;
  const candidates = [basePath, basePath.replace(/\\.js$/, '-icon.js')];
  for (const candidate of candidates) {
    try {
      const mod = (await import(/* @vite-ignore */ candidate)) as {
        default?: (props: Record<string, unknown>) => unknown;
      };
      if (!mod.default) continue;
      const svgMarkup = renderToStaticMarkup(createElement(mod.default));
      if (!svgMarkup.includes('<svg')) continue;
      iconCache.set(cacheKey, svgMarkup);
      return svgMarkup;
    } catch {
      // try next candidate
    }
  }
  return null;
};

const resolveIconSvg = async (icon: string): Promise<string | null> => {
  if (!icon || icon === 'none') return null;
  const cached = iconCache.get(icon);
  if (cached) return cached;

  if (icon.startsWith('http://') || icon.startsWith('https://')) {
    try {
      const res = await fetch(icon);
      if (!res.ok) return null;
      const text = await res.text();
      if (!text.includes('<svg')) return null;
      iconCache.set(icon, text);
      return text;
    } catch {
      return null;
    }
  }

  if (icon.startsWith('data:image/svg+xml')) {
    const text = decodeDataUrl(icon);
    if (text?.includes('<svg')) {
      iconCache.set(icon, text);
      return text;
    }
  }

  if (icon.includes(':')) {
    const builtIn = await resolveBuiltInIcon(icon);
    if (builtIn) return builtIn;
  }

  return null;
};

const mapPoint = (
  value: number,
  boundsStart: number,
  boundsSize: number,
  viewStart: number,
  viewSize: number
) => viewStart + ((value - boundsStart) / boundsSize) * viewSize;

const injectDiagramIcons = async (
  svgText: string,
  diagram: { nodes: Array<any>; bounds: any },
  iconByNodeId: Map<string, string>,
  iconByTitle: Map<string, string>
): Promise<{
  svg: string;
  iconCount: number;
  iconDiagnostics: Array<{
    nodeId: string | null;
    nodeTitle: string | null;
    iconId: string | null;
    iconSource: string | null;
    resolved: boolean;
    reason?: string;
    nodeIdType?: string | null;
    nodeIdString?: string | null;
    mapHitById?: boolean;
    mapHitByTitle?: boolean;
  }>;
  lookupDiagnostics: Array<{
    nodeId: string | null;
    nodeIdType: string | null;
    nodeIdString: string | null;
    nodeTitle: string | null;
    iconIdRaw: string | null;
    mapHitById: boolean;
    mapHitByTitle: boolean;
  }>;
  injectorState: {
    called: boolean;
    svgFound: boolean;
    viewBoxFound: boolean;
    boundsFound: boolean;
    nodesCount: number;
    loopEntered: boolean;
    svgAttrViewBox: string | null;
    svgAttrViewbox: string | null;
    svgRawAttrs: Record<string, string> | null;
  };
}> => {
  const root = parse(svgText, { lowerCaseTagName: false, comment: true });
  const svg = root.querySelector('svg');
  const svgAttrViewBox = svg?.getAttribute?.('viewBox') ?? null;
  const svgAttrViewbox = svg?.getAttribute?.('viewbox') ?? null;
  const svgRawAttrs = (svg as unknown as { rawAttrs?: Record<string, string> }).rawAttrs ?? null;
  if (!svg) {
    return {
      svg: svgText,
      iconCount: 0,
      iconDiagnostics: [],
      lookupDiagnostics: [],
      injectorState: {
        called: true,
        svgFound: false,
        viewBoxFound: false,
        boundsFound: false,
        nodesCount: 0,
        loopEntered: false,
        svgAttrViewBox: null,
        svgAttrViewbox: null,
        svgRawAttrs
      }
    };
  }
  const vb = extractSvgViewBox(svg);
  if (!vb) {
    return {
      svg: svgText,
      iconCount: 0,
      iconDiagnostics: [],
      lookupDiagnostics: [],
      injectorState: {
        called: true,
        svgFound: true,
        viewBoxFound: false,
        boundsFound: false,
        nodesCount: 0,
        loopEntered: false,
        svgAttrViewBox,
        svgAttrViewbox,
        svgRawAttrs
      }
    };
  }
  const bounds = diagram.bounds;
  if (!bounds || !diagram.nodes?.length) {
    return {
      svg: svgText,
      iconCount: 0,
      iconDiagnostics: [],
      lookupDiagnostics: [],
      injectorState: {
        called: true,
        svgFound: true,
        viewBoxFound: true,
        boundsFound: !!bounds,
        nodesCount: diagram.nodes?.length ?? 0,
        loopEntered: false,
        svgAttrViewBox,
        svgAttrViewbox,
        svgRawAttrs
      }
    };
  }

  let counter = 0;
  const iconDiagnostics: Array<{
    nodeId: string | null;
    nodeTitle: string | null;
    iconId: string | null;
    iconSource: string | null;
    resolved: boolean;
    reason?: string;
    nodeIdType?: string | null;
    nodeIdString?: string | null;
    mapHitById?: boolean;
    mapHitByTitle?: boolean;
  }> = [];
  const lookupDiagnostics: Array<{
    nodeId: string | null;
    nodeIdType: string | null;
    nodeIdString: string | null;
    nodeTitle: string | null;
    iconIdRaw: string | null;
    mapHitById: boolean;
    mapHitByTitle: boolean;
  }> = [];
  let loopEntered = false;
  for (const node of diagram.nodes) {
    loopEntered = true;
    const nodeIdRaw = node.id;
    const nodeIdString = nodeIdRaw !== undefined ? String(nodeIdRaw) : null;
    const nodeTitle = typeof node.title === 'string' ? node.title : null;
    const iconIdFromNode =
      (typeof node.icon === 'string' && node.icon) ||
      (typeof node.style?.icon === 'string' && node.style.icon) ||
      undefined;
    const mapHitById = nodeIdString ? iconByNodeId.has(nodeIdString) : false;
    const mapHitByTitle = nodeTitle ? iconByTitle.has(nodeTitle) : false;
    const iconId =
      (typeof node.icon === 'string' && node.icon) ||
      (typeof node.style?.icon === 'string' && node.style.icon) ||
      (nodeIdString ? iconByNodeId.get(nodeIdString) : undefined) ||
      (nodeTitle ? iconByTitle.get(nodeTitle) : undefined) ||
      undefined;
    if (lookupDiagnostics.length < 10) {
      lookupDiagnostics.push({
        nodeId: nodeIdString,
        nodeIdType: nodeIdRaw ? typeof nodeIdRaw : null,
        nodeIdString,
        nodeTitle,
        iconIdRaw: iconId ?? null,
        mapHitById,
        mapHitByTitle
      });
    }
    if (!iconId || iconId === 'none') continue;
    const iconMarkup = await resolveIconSvg(iconId);
    if (!iconMarkup) {
      if (iconDiagnostics.length < 20) {
        iconDiagnostics.push({
          nodeId: nodeIdString,
          nodeTitle,
          iconId,
          iconSource: iconIdFromNode ? 'diagram.node.icon' : iconByNodeId.has(node.id)
            ? 'model.node.icon'
            : iconByTitle.has(node.title)
              ? 'model.title.icon'
              : 'unknown',
          resolved: false,
          reason: 'resolveIconSvg failed',
          nodeIdType: nodeIdRaw ? typeof nodeIdRaw : null,
          nodeIdString,
          mapHitById,
          mapHitByTitle
        });
      }
      continue;
    }
    const iconRoot = parse(iconMarkup, { lowerCaseTagName: false, comment: true });
    const iconSvg = iconRoot.querySelector('svg');
    if (!iconSvg) {
      if (iconDiagnostics.length < 20) {
        iconDiagnostics.push({
          nodeId: nodeIdString,
          nodeTitle,
          iconId,
          iconSource: iconIdFromNode ? 'diagram.node.icon' : iconByNodeId.has(node.id)
            ? 'model.node.icon'
            : iconByTitle.has(node.title)
              ? 'model.title.icon'
              : 'unknown',
          resolved: false,
          reason: 'icon svg parse failed',
          nodeIdType: nodeIdRaw ? typeof nodeIdRaw : null,
          nodeIdString,
          mapHitById,
          mapHitByTitle
        });
      }
      continue;
    }
    const iconViewBox = extractSvgViewBox(iconSvg);
    if (!iconViewBox) {
      if (iconDiagnostics.length < 20) {
        iconDiagnostics.push({
          nodeId: nodeIdString,
          nodeTitle,
          iconId,
          iconSource: iconIdFromNode ? 'diagram.node.icon' : iconByNodeId.has(node.id)
            ? 'model.node.icon'
            : iconByTitle.has(node.title)
              ? 'model.title.icon'
              : 'unknown',
          resolved: false,
          reason: 'icon viewBox missing',
          nodeIdType: nodeIdRaw ? typeof nodeIdRaw : null,
          nodeIdString,
          mapHitById,
          mapHitByTitle
        });
      }
      continue;
    }

    prefixSvgIds(iconRoot, `likec4-node-icon-${counter}-`);
    counter += 1;

    const nodeX = mapPoint(node.x, bounds.x, bounds.width, vb.x, vb.width);
    const nodeY = mapPoint(node.y, bounds.y, bounds.height, vb.y, vb.height);
    const nodeW = (node.width / bounds.width) * vb.width;
    const nodeH = (node.height / bounds.height) * vb.height;
    const padding = Math.max(4, Math.min(nodeW, nodeH) * 0.08);

    const labelBBox = node.labelBBox ?? null;
    let iconSize = Math.max(12, Math.min(nodeW, nodeH) * 0.18);
    let iconX = nodeX + padding;
    let iconY = nodeY + padding;

    if (labelBBox && labelBBox.width && labelBBox.height) {
      const labelX = mapPoint(labelBBox.x, bounds.x, bounds.width, vb.x, vb.width);
      const labelY = mapPoint(labelBBox.y, bounds.y, bounds.height, vb.y, vb.height);
      const labelH = (labelBBox.height / bounds.height) * vb.height;
      iconSize = Math.max(12, Math.min(labelH, Math.min(nodeW, nodeH) * 0.22));
      const gap = Math.max(2, iconSize * 0.2);
      iconX = labelX - iconSize - gap;
      iconY = labelY + Math.max(0, (labelH - iconSize) / 2);
    }

    const minX = nodeX + padding;
    const minY = nodeY + padding;
    const maxX = nodeX + nodeW - padding - iconSize;
    const maxY = nodeY + nodeH - padding - iconSize;
    iconX = Math.max(minX, Math.min(iconX, maxX));
    iconY = Math.max(minY, Math.min(iconY, maxY));

    const inlineSvg = parse('<svg></svg>').querySelector('svg');
    if (!inlineSvg) continue;
    inlineSvg.setAttribute('x', `${iconX}`);
    inlineSvg.setAttribute('y', `${iconY}`);
    inlineSvg.setAttribute('width', `${iconSize}`);
    inlineSvg.setAttribute('height', `${iconSize}`);
    inlineSvg.setAttribute('viewBox', `${iconViewBox.x} ${iconViewBox.y} ${iconViewBox.width} ${iconViewBox.height}`);
    inlineSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    iconSvg.childNodes.forEach((nodeChild) => {
      inlineSvg.appendChild(nodeChild);
    });

    svg.appendChild(inlineSvg);
    if (iconDiagnostics.length < 20) {
      iconDiagnostics.push({
        nodeId: nodeIdString,
        nodeTitle,
        iconId,
        iconSource: iconIdFromNode ? 'diagram.node.icon' : iconByNodeId.has(node.id)
          ? 'model.node.icon'
          : iconByTitle.has(node.title)
            ? 'model.title.icon'
            : 'unknown',
        resolved: true,
        nodeIdType: nodeIdRaw ? typeof nodeIdRaw : null,
        nodeIdString,
        mapHitById,
        mapHitByTitle
      });
    }
  }

  return {
    svg: root.toString(),
    iconCount: counter,
    iconDiagnostics,
    lookupDiagnostics,
    injectorState: {
      called: true,
      svgFound: true,
      viewBoxFound: true,
      boundsFound: !!bounds,
      nodesCount: diagram.nodes.length,
      loopEntered,
      svgAttrViewBox,
      svgAttrViewbox,
      svgRawAttrs
    }
  };
};

const extractSvgViewBox = (svgEl: ReturnType<typeof parse>) => {
  const rawAttrs = (svgEl as unknown as { rawAttrs?: Record<string, string> }).rawAttrs;
  const viewBox =
    svgEl.getAttribute('viewBox') ??
    svgEl.getAttribute('viewbox') ??
    rawAttrs?.viewBox ??
    rawAttrs?.viewbox;
  if (viewBox) {
    const parts = viewBox.split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }
  const width = toNumeric(svgEl.getAttribute('width')) ?? toNumeric(rawAttrs?.width);
  const height = toNumeric(svgEl.getAttribute('height')) ?? toNumeric(rawAttrs?.height);
  if (width && height) {
    return { x: 0, y: 0, width, height };
  }
  return undefined;
};

const inlineSvgImages = async (svgText: string): Promise<string> => {
  const root = parse(svgText, { lowerCaseTagName: false, comment: true });
  const svg = root.querySelector('svg');
  if (!svg) return svgText;
  const images = svg.querySelectorAll('image');
  if (!images.length) return svgText;

  let counter = 0;
  for (const image of images) {
    const href = image.getAttribute('href') ?? image.getAttribute('xlink:href');
    if (!href) continue;
    const dataSvg = decodeDataUrl(href);
    const isSvgUrl = href.startsWith('http://') || href.startsWith('https://') || dataSvg;
    if (!isSvgUrl) continue;

    let svgMarkup: string | undefined;
    if (dataSvg) {
      svgMarkup = dataSvg;
    } else if (href.startsWith('http://') || href.startsWith('https://')) {
      try {
        const res = await fetch(href);
        if (!res.ok) continue;
        const text = await res.text();
        if (!text.includes('<svg')) continue;
        svgMarkup = text;
      } catch {
        continue;
      }
    }
    if (!svgMarkup) continue;

    const iconRoot = parse(svgMarkup, { lowerCaseTagName: false, comment: true });
    const iconSvg = iconRoot.querySelector('svg');
    if (!iconSvg) continue;
    const vb = extractSvgViewBox(iconSvg);
    if (!vb) continue;

    prefixSvgIds(iconRoot, `likec4-icon-${counter}-`);
    counter += 1;

    const x = toNumeric(image.getAttribute('x')) ?? 0;
    const y = toNumeric(image.getAttribute('y')) ?? 0;
    const width = toNumeric(image.getAttribute('width')) ?? vb.width;
    const height = toNumeric(image.getAttribute('height')) ?? vb.height;
    const preserve = image.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet';

    const inlineSvg = parse('<svg></svg>').querySelector('svg');
    if (!inlineSvg) continue;
    inlineSvg.setAttribute('x', `${x}`);
    inlineSvg.setAttribute('y', `${y}`);
    inlineSvg.setAttribute('width', `${width}`);
    inlineSvg.setAttribute('height', `${height}`);
    inlineSvg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
    inlineSvg.setAttribute('preserveAspectRatio', preserve);

    iconSvg.childNodes.forEach((node) => {
      inlineSvg.appendChild(node);
    });

    image.replaceWith(inlineSvg);
  }

  return root.toString();
};

export const POST = async ({ request }) => {
  let body: LikeC4RenderRequest;
  try {
    body = (await request.json()) as LikeC4RenderRequest;
  } catch {
    return json({ error: { message: 'Invalid JSON body' }, status: 'fail' }, { status: 400 });
  }

  if (typeof body.code !== 'string' || !body.code.trim()) {
    return json({ error: { message: 'Missing code' }, status: 'fail' }, { status: 400 });
  }

  const requestedViewId =
    typeof body.viewId === 'string' && body.viewId.trim() ? body.viewId.trim() : undefined;

  let likec4: LikeC4 | undefined;
  try {
    likec4 = await LikeC4.fromSource(body.code, {
      graphviz: 'wasm',
      logger: false,
      printErrors: false,
      throwIfInvalid: false,
      watch: false
    });

    if (likec4.hasErrors()) {
      const details: LikeC4ErrorDetail[] = likec4.getErrors().map((e) => ({
        endColumn: (e.range as { end?: { character?: number } } | undefined)?.end?.character,
        endLine: (e.range as { end?: { line?: number } } | undefined)?.end?.line,
        message: e.message,
        sourceFsPath: e.sourceFsPath,
        startColumn: (e.range as { start?: { character?: number } } | undefined)?.start?.character,
        startLine: e.line
      }));
      return json(
        { error: { details, message: formatLikeC4Errors(details) }, status: 'fail' },
        { status: 400 }
      );
    }

    likec4.ensureSingleProject();
    const projectId = likec4.projects()[0];
    const views = await likec4.viewsService.viewsAsGraphvizOut(projectId);
    if (!views.length) {
      return json(
        { error: { message: 'No LikeC4 views found. Add a `views { view ... }` section.' }, status: 'fail' },
        { status: 400 }
      );
    }

    const selected =
      (requestedViewId ? views.find((v) => v.id === requestedViewId) : undefined) ?? views[0];

    if (!selected) {
      return json(
        { error: { message: `View not found: ${requestedViewId}` }, status: 'fail' },
        { status: 404 }
      );
    }

    const diagrams = await likec4.viewsService.diagrams(projectId);
    const iconByNodeId = new Map<string, string>();
    const iconByTitle = new Map<string, string>();
    try {
      const layoutedModel = await likec4.langium.likec4.LanguageServices.layoutedModel(projectId);
      const layoutedView = layoutedModel?.$data?.views?.[selected.id];
      if (layoutedView?.nodes?.length) {
        layoutedView.nodes.forEach((node) => {
          const icon =
            (typeof node.icon === 'string' && node.icon) ||
            (typeof node.style?.icon === 'string' && node.style.icon) ||
            undefined;
          if (icon) {
            iconByNodeId.set(String(node.id), icon);
            if (typeof node.title === 'string' && node.title) {
              iconByTitle.set(node.title, icon);
            }
          }
        });
      }
    } catch {
      // ignore model failures, fall back to diagram data only
    }
    const selectedDiagram =
      (requestedViewId ? diagrams.find((v) => v.id === requestedViewId) : undefined) ?? diagrams[0];
    let svg = await inlineSvgImages(selected.svg);
    let iconCount = 0;
    let iconDiagnostics: Array<{
      nodeId: string | null;
      nodeTitle: string | null;
      iconId: string | null;
      iconSource: string | null;
      resolved: boolean;
      reason?: string;
      nodeIdType?: string | null;
      nodeIdString?: string | null;
      mapHitById?: boolean;
      mapHitByTitle?: boolean;
    }> = [];
    let lookupDiagnostics: Array<{
      nodeId: string | null;
      nodeIdType: string | null;
      nodeIdString: string | null;
      nodeTitle: string | null;
      iconIdRaw: string | null;
      mapHitById: boolean;
      mapHitByTitle: boolean;
    }> = [];
    let injectorState: {
      called: boolean;
      svgFound: boolean;
      viewBoxFound: boolean;
      boundsFound: boolean;
      nodesCount: number;
      loopEntered: boolean;
      svgAttrViewBox: string | null;
      svgAttrViewbox: string | null;
      svgRawAttrs: Record<string, string> | null;
    } | null = null;
    const diagramNodeIds = new Set<string>();
    const diagramNodeTitles = new Set<string>();
    if (selectedDiagram?.nodes?.length) {
      selectedDiagram.nodes.forEach((node) => {
        if (typeof node.id === 'string') diagramNodeIds.add(node.id);
        if (typeof node.title === 'string') diagramNodeTitles.add(node.title);
      });
    }
    if (selectedDiagram) {
      const result = await injectDiagramIcons(svg, selectedDiagram, iconByNodeId, iconByTitle);
      svg = result.svg;
      iconCount = result.iconCount;
      iconDiagnostics = result.iconDiagnostics;
      lookupDiagnostics = result.lookupDiagnostics ?? [];
      injectorState = result.injectorState ?? null;
    }
    const svgRoot = parse(svg, { lowerCaseTagName: false, comment: true }).querySelector('svg');
    const svgViewBox = svgRoot?.getAttribute('viewBox') ?? null;
    const unmatchedModelNodeIds = Array.from(iconByNodeId.keys()).filter((id) => !diagramNodeIds.has(id));
    const unmatchedModelTitles = Array.from(iconByTitle.keys()).filter((title) => !diagramNodeTitles.has(title));
    const diag = {
      viewId: selected.id,
      diagramsCount: diagrams.length,
      diagramNodesCount: selectedDiagram?.nodes?.length ?? 0,
      modelIconsByNodeId: iconByNodeId.size,
      modelIconsByTitle: iconByTitle.size,
      svgViewBox,
      bounds: selectedDiagram?.bounds ?? null,
      sampleNodeIds: selectedDiagram?.nodes?.slice(0, 5).map((n) => n.id) ?? [],
      sampleNodeTitles: selectedDiagram?.nodes?.slice(0, 5).map((n) => n.title) ?? [],
      modelIconNodeIds: Array.from(iconByNodeId.keys()).slice(0, 10),
      modelIconTitles: Array.from(iconByTitle.keys()).slice(0, 10),
      unmatchedModelNodeIds: unmatchedModelNodeIds.slice(0, 10),
      unmatchedModelTitles: unmatchedModelTitles.slice(0, 10)
    };
    return json({
      status: 'success',
      viewId: selected.id,
      svg,
      iconCount,
      iconDiagnostics,
      lookupDiagnostics,
      injectorState,
      diagnostics: diag,
      views: views.map((v) => ({
        id: v.id,
        title: v.title ?? v.name ?? v.id
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: { message }, status: 'fail' }, { status: 500 });
  } finally {
    try {
      await likec4?.dispose();
    } catch {
      // ignore
    }
  }
};
