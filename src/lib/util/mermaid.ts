import { diagramData } from '@mermaid-js/examples';
import elkLayouts from '@mermaid-js/layout-elk';
import tidyTreeLayouts from '@mermaid-js/layout-tidy-tree';
import zenuml from '@mermaid-js/mermaid-zenuml';
import type { MermaidConfig, RenderResult } from 'mermaid';
import mermaid from 'mermaid';

mermaid.registerLayoutLoaders([...elkLayouts, ...tidyTreeLayouts]);
const init = mermaid.registerExternalDiagrams([zenuml]);
let iconPacksRegistered: Promise<void> | null = null;

const ensureIconPacksRegistered = async () => {
  if (iconPacksRegistered) {
    console.warn('[fa-diag] icon pack registration already initialized (client)');
    await iconPacksRegistered;
    const isIconAvailable = (mermaid as unknown as { isIconAvailable?: (name: string) => Promise<boolean> })
      .isIconAvailable;
    console.warn('[fa-diag] mermaid icon api (client)', {
      hasRegister: typeof mermaid.registerIconPacks === 'function',
      hasIsIconAvailable: typeof isIconAvailable === 'function'
    });
    if (isIconAvailable) {
      const [faBook, faFaBook] = await Promise.allSettled([
        isIconAvailable('fa:book'),
        isIconAvailable('fa:fa-book')
      ]);
      console.warn('[fa-diag] recheck fa:book (client)', faBook);
      console.warn('[fa-diag] recheck fa:fa-book (client)', faFaBook);
    }
    return iconPacksRegistered;
  }

  iconPacksRegistered = (async () => {
    try {
      console.warn('[fa-diag] registering fa icon pack (client)');
      const hasRegister = typeof mermaid.registerIconPacks === 'function';
      console.warn('[fa-diag] mermaid.registerIconPacks available', { hasRegister });
      if (!hasRegister) {
        return;
      }
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
        console.warn('[fa-diag] isIconAvailable not available on mermaid (client)');
      }
    } catch (error) {
      console.warn('[fa-diag] failed to register fa icon pack (client)', error);
    }
  })();

  return iconPacksRegistered;
};

export const render = async (
  config: MermaidConfig,
  code: string,
  id: string
): Promise<RenderResult> => {
  console.warn('[fa-diag] mermaid.render invoked', { id });
  await init;
  await ensureIconPacksRegistered();

  // Should be able to call this multiple times without any issues.
  mermaid.initialize(config);
  const result = await mermaid.render(id, code);
  const svg = result.svg ?? '';
  console.warn('[fa-diag] mermaid.render svg scan', {
    hasFaClass: svg.includes('fa-'),
    hasIconify: svg.includes('iconify'),
    hasForeignObject: svg.includes('<foreignObject'),
    faIndex: svg.indexOf('fa-'),
    iconifyIndex: svg.indexOf('iconify')
  });
  return result;
};

export const parse = async (code: string) => {
  console.warn('[fa-diag] mermaid.parse invoked');
  await ensureIconPacksRegistered();
  return await mermaid.parse(code);
};

export const standardizeDiagramType = (diagramType: string) => {
  switch (diagramType) {
    case 'class':
    case 'classDiagram': {
      return 'classDiagram';
    }
    case 'graph':
    case 'flowchart':
    case 'flowchart-elk':
    case 'flowchart-v2': {
      return 'flowchart';
    }
    default: {
      return diagramType;
    }
  }
};

type DiagramDefinition = (typeof diagramData)[number];

const isValidDiagram = (diagram: DiagramDefinition): diagram is Required<DiagramDefinition> => {
  return Boolean(diagram.name && diagram.examples && diagram.examples.length > 0);
};

export const getSampleDiagrams = () => {
  const diagrams = diagramData
    .filter((d) => isValidDiagram(d))
    .map(({ examples, ...rest }) => ({
      ...rest,
      example: examples?.filter(({ isDefault }) => isDefault)[0]
    }));
  const examples: Record<string, string> = {};
  for (const diagram of diagrams) {
    examples[diagram.name.replace(/ (Diagram|Chart|Graph)/, '')] = diagram.example.code;
  }
  return examples;
};
