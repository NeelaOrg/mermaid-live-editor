import { JSDOM } from 'jsdom';
import type { MermaidConfig } from 'mermaid';

const coerceConfig = (mermaidConfig?: unknown): MermaidConfig => {
  if (!mermaidConfig) {
    return {};
  }
  if (typeof mermaidConfig === 'string') {
    return JSON.parse(mermaidConfig) as MermaidConfig;
  }
  if (typeof mermaidConfig === 'object') {
    return mermaidConfig as MermaidConfig;
  }
  throw new Error('Invalid mermaidConfig (expected object or JSON string).');
};

const sanitizeConfig = (config: MermaidConfig): MermaidConfig => {
  const sanitized = { ...config };
  if (sanitized.securityLevel && sanitized.securityLevel !== 'strict') {
    delete sanitized.securityLevel;
  }
  return sanitized;
};

export const renderSvgLocally = async (code: string, mermaidConfig?: unknown): Promise<string> => {
  const config = sanitizeConfig(coerceConfig(mermaidConfig));

  const dom = new JSDOM('<!doctype html><html><body><div id="container"></div></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/'
  });

  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevDOMParser = (globalThis as unknown as { DOMParser?: unknown }).DOMParser;

  try {
    globalThis.window = dom.window as unknown as Window & typeof globalThis;
    globalThis.document = dom.window.document;
    (globalThis as unknown as { DOMParser: unknown }).DOMParser = dom.window.DOMParser;

    const mermaid = (await import('mermaid')).default;

    mermaid.initialize(config);
    const id = `mcp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const result = await mermaid.render(id, code);
    return result.svg ?? '';
  } finally {
    if (prevWindow) globalThis.window = prevWindow as unknown as Window & typeof globalThis;
    else delete (globalThis as unknown as { window?: unknown }).window;

    if (prevDocument) globalThis.document = prevDocument;
    else delete (globalThis as unknown as { document?: unknown }).document;

    if (prevDOMParser) (globalThis as unknown as { DOMParser?: unknown }).DOMParser = prevDOMParser;
    else delete (globalThis as unknown as { DOMParser?: unknown }).DOMParser;
  }
};

export const parseMermaidLocally = async (code: string, mermaidConfig?: unknown): Promise<void> => {
  const config = sanitizeConfig(coerceConfig(mermaidConfig));

  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'http://localhost/'
  });

  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevDOMParser = (globalThis as unknown as { DOMParser?: unknown }).DOMParser;

  try {
    globalThis.window = dom.window as unknown as Window & typeof globalThis;
    globalThis.document = dom.window.document;
    (globalThis as unknown as { DOMParser: unknown }).DOMParser = dom.window.DOMParser;

    const mermaid = (await import('mermaid')).default;
    mermaid.initialize(config);
    await mermaid.parse(code);
  } finally {
    if (prevWindow) globalThis.window = prevWindow as unknown as Window & typeof globalThis;
    else delete (globalThis as unknown as { window?: unknown }).window;

    if (prevDocument) globalThis.document = prevDocument;
    else delete (globalThis as unknown as { document?: unknown }).document;

    if (prevDOMParser) (globalThis as unknown as { DOMParser?: unknown }).DOMParser = prevDOMParser;
    else delete (globalThis as unknown as { DOMParser?: unknown }).DOMParser;
  }
};
