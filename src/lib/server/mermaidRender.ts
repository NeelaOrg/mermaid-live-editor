import { JSDOM } from 'jsdom';
import type { MermaidConfig } from 'mermaid';

let iconPacksRegistered: Promise<void> | null = null;

const ensureIconPacksRegistered = async (mermaid: typeof import('mermaid').default) => {
  if (iconPacksRegistered) {
    console.warn('[fa-diag] icon pack registration already initialized (server)');
    await iconPacksRegistered;
    const isIconAvailable = (mermaid as unknown as { isIconAvailable?: (name: string) => Promise<boolean> })
      .isIconAvailable;
    if (isIconAvailable) {
      const [faBook, faFaBook] = await Promise.allSettled([
        isIconAvailable('fa:book'),
        isIconAvailable('fa:fa-book')
      ]);
      console.warn('[fa-diag] recheck fa:book (server)', faBook);
      console.warn('[fa-diag] recheck fa:fa-book (server)', faFaBook);
    }
    return iconPacksRegistered;
  }

  iconPacksRegistered = (async () => {
    try {
      console.warn('[fa-diag] registering fa icon pack (server)');
      mermaid.registerIconPacks([
        {
          name: 'fa',
          loader: async () => {
    const mod = await import('@iconify-json/fa/icons.json');
            return 'default' in mod ? mod.default : mod;
          }
        }
      ]);
      const isIconAvailable = (mermaid as unknown as { isIconAvailable?: (name: string) => Promise<boolean> })
        .isIconAvailable;
      if (isIconAvailable) {
        const [faBook, faFaBook] = await Promise.allSettled([
          isIconAvailable('fa:book'),
          isIconAvailable('fa:fa-book')
        ]);
        console.warn('[fa-diag] isIconAvailable fa:book', faBook);
        console.warn('[fa-diag] isIconAvailable fa:fa-book', faFaBook);
      } else {
        console.warn('[fa-diag] isIconAvailable not available on mermaid (server)');
      }
    } catch (error) {
      console.warn('[fa-diag] failed to register fa icon pack (server)', error);
    }
  })();

  return iconPacksRegistered;
};

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

    await ensureIconPacksRegistered(mermaid);
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
    await ensureIconPacksRegistered(mermaid);
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
