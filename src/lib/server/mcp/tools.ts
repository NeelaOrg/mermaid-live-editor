import type { JsonValue, McpToolDefinition } from './types';

export const mcpTools: McpToolDefinition[] = [
  {
    name: 'mermaid.sample_diagram_types',
    description: 'List available sample diagram types.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {}
    }
  },
  {
    name: 'mermaid.sample_diagram_get',
    description: 'Get a sample Mermaid diagram (starter code) by type.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: {
        type: { type: 'string', description: 'Diagram type name (e.g. Flowchart, Sequence).' }
      }
    }
  },
  {
    name: 'mermaid.serialize_state',
    description:
      'Serialize Mermaid Live Editor state (compatible with rendererUrl / view links).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['code'],
      properties: {
        code: { type: 'string' },
        mermaidConfig: {
          description: 'Mermaid config as JSON object or JSON string.',
          anyOf: [{ type: 'object' }, { type: 'string' }, { type: 'null' }]
        },
        serde: { type: 'string', enum: ['pako', 'base64'], default: 'pako' }
      }
    }
  },
  {
    name: 'mermaid.render_svg_url',
    description: 'Return a URL that renders the diagram to SVG using rendererUrl.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['code'],
      properties: {
        code: { type: 'string' },
        mermaidConfig: {
          description: 'Mermaid config as JSON object or JSON string.',
          anyOf: [{ type: 'object' }, { type: 'string' }, { type: 'null' }]
        }
      }
    }
  },
  {
    name: 'mermaid.render_png_url',
    description: 'Return a URL that renders the diagram to PNG using rendererUrl.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['code'],
      properties: {
        code: { type: 'string' },
        mermaidConfig: {
          description: 'Mermaid config as JSON object or JSON string.',
          anyOf: [{ type: 'object' }, { type: 'string' }, { type: 'null' }]
        }
      }
    }
  },
  {
    name: 'mermaid.render_svg',
    description:
      'Render Mermaid code to an SVG string. Uses rendererUrl if configured, otherwise renders locally.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['code'],
      properties: {
        code: { type: 'string' },
        mermaidConfig: {
          description: 'Mermaid config as JSON object or JSON string.',
          anyOf: [{ type: 'object' }, { type: 'string' }, { type: 'null' }]
        },
        validate: {
          type: 'boolean',
          default: true,
          description:
            'Validate Mermaid syntax before rendering (recommended). If false, remote render errors may only be visible in the SVG output.'
        },
        preferRemote: { type: 'boolean', default: true }
      }
    }
  },
  {
    name: 'mermaid.render_svg_store',
    description:
      'Render Mermaid to SVG, store it on the server, and return an id + fetch URL (avoids JSON escaping).',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['code'],
      properties: {
        id: {
          type: 'string',
          description:
            'Optional id to overwrite/update a previously stored SVG (URL-safe: A-Z a-z 0-9 . _ -).'
        },
        code: { type: 'string' },
        mermaidConfig: {
          description: 'Mermaid config as JSON object or JSON string.',
          anyOf: [{ type: 'object' }, { type: 'string' }, { type: 'null' }]
        },
        validate: {
          type: 'boolean',
          default: true,
          description:
            'Validate Mermaid syntax before rendering (recommended). If false, remote render errors may only be visible in the SVG output.'
        },
        preferRemote: { type: 'boolean', default: true },
        ttlSeconds: { type: 'number', default: 600, description: 'Time-to-live for the stored SVG.' }
      }
    }
  }
];

export const toJsonValue = (value: unknown): JsonValue => value as JsonValue;
