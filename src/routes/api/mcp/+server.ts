import { env } from '$lib/util/env';
import { serializeState, type SerdeType } from '$lib/util/serde';
import type { State } from '$lib/types';
import { json } from '@sveltejs/kit';
import { getSampleDiagramMap } from '$lib/server/sampleDiagrams';
import { parseMermaidLocally, renderSvgLocally } from '$lib/server/mermaidRender';
import { putRenderedSvg } from '$lib/server/renderedStore';
import { mcpTools, toJsonValue } from '$lib/server/mcp/tools';
import type { JsonRpcRequest, JsonRpcResponse, JsonValue } from '$lib/server/mcp/types';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
} as const;

const successEnvelope = (payload: JsonValue): JsonValue => {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if ('status' in (payload as Record<string, JsonValue>) || 'error' in (payload as Record<string, JsonValue>)) {
      return payload;
    }
    return { status: 'success', error: null, ...(payload as Record<string, JsonValue>) };
  }
  return { status: 'success', error: null, data: payload };
};

const errorEnvelope = (code: number, message: string, data?: JsonValue): JsonValue => {
  const details = data ?? null;
  return {
    status: 'fail',
    error: { code, message, details }
  };
};

const jsonRpcError = (id: JsonRpcResponse['id'], code: number, message: string, data?: JsonValue) => {
  const payload: JsonRpcResponse = {
    jsonrpc: '2.0',
    id,
    error: { code, message, data: errorEnvelope(code, message, data) }
  };
  return json(payload, { headers: corsHeaders });
};

const jsonRpcResult = (id: JsonRpcResponse['id'], result: JsonValue) => {
  const payload: JsonRpcResponse = {
    jsonrpc: '2.0',
    id,
    result: successEnvelope(result)
  };
  return json(payload, { headers: corsHeaders });
};

const coerceMermaidConfigString = (mermaidConfig: unknown): string => {
  if (mermaidConfig == null) {
    return JSON.stringify({ theme: 'default' }, undefined, 2);
  }
  if (typeof mermaidConfig === 'string') {
    return mermaidConfig;
  }
  if (typeof mermaidConfig === 'object') {
    return JSON.stringify(mermaidConfig, undefined, 2);
  }
  throw new Error('Invalid mermaidConfig (expected object or JSON string).');
};

const buildState = (code: string, mermaidConfig: unknown): State => ({
  code,
  grid: true,
  mermaid: coerceMermaidConfigString(mermaidConfig),
  panZoom: true,
  rough: false,
  updateDiagram: true
});

const getRendererUrls = (serialized: string) => {
  const rendererUrl = env.rendererUrl;
  if (!rendererUrl) {
    throw new Error('MERMAID_RENDERER_URL is not configured.');
  }
  return {
    svg: `${rendererUrl}/svg/${serialized}`,
    png: `${rendererUrl}/img/${serialized}?type=png`
  };
};

const renderSvgRemote = async (serialized: string): Promise<string> => {
  const { svg } = getRendererUrls(serialized);
  const res = await fetch(svg);
  if (!res.ok) {
    throw new Error(`Remote renderer failed: ${res.status} ${res.statusText}`);
  }
  return await res.text();
};

const detectMermaidErrorSvg = (svg: string): { message: string } | undefined => {
  if (!svg) return;
  if (svg.includes('aria-roledescription="error"') || svg.includes('class="error-text"')) {
    const match = svg.match(/<text[^>]*class="error-text"[^>]*>([^<]+)<\/text>/);
    const message = match?.[1]?.trim() || 'Mermaid renderer returned an error SVG.';
    return { message };
  }
  return;
};

type ToolCallParams = { name?: unknown; arguments?: unknown };

const asObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

export const OPTIONS = async () => {
  return new Response(null, { status: 204, headers: corsHeaders });
};

export const POST = async ({ request }) => {
  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, 'Parse error');
  }

  const id = body.id ?? null;
  if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    return jsonRpcError(id, -32600, 'Invalid Request');
  }

  try {
    if (body.method === 'tools/list') {
      return jsonRpcResult(id, toJsonValue({ tools: mcpTools }));
    }

    if (body.method !== 'tools/call') {
      return jsonRpcError(id, -32601, 'Method not found');
    }

    const params = asObject(body.params) as ToolCallParams;
    const name = params.name;
    const args = asObject(params.arguments);
    if (typeof name !== 'string') {
      return jsonRpcError(id, -32602, 'Invalid params', toJsonValue({ expected: 'params.name' }));
    }

    if (name === 'mermaid.sample_diagram_types') {
      const samples = getSampleDiagramMap();
      return jsonRpcResult(
        id,
        toJsonValue({
          content: [{ type: 'text', text: JSON.stringify(Object.keys(samples)) }],
          types: Object.keys(samples)
        })
      );
    }

    if (name === 'mermaid.sample_diagram_get') {
      const type = args.type;
      if (typeof type !== 'string') {
        return jsonRpcError(id, -32602, 'Invalid params', toJsonValue({ expected: 'type:string' }));
      }
      const samples = getSampleDiagramMap();
      const code = samples[type];
      if (!code) {
        return jsonRpcError(id, -32602, 'Unknown diagram type', toJsonValue({ type }));
      }
      return jsonRpcResult(
        id,
        toJsonValue({
          content: [{ type: 'text', text: code }],
          type,
          code
        })
      );
    }

    if (name === 'mermaid.serialize_state') {
      const code = args.code;
      if (typeof code !== 'string') {
        return jsonRpcError(id, -32602, 'Invalid params', toJsonValue({ expected: 'code:string' }));
      }
      const serde = (args.serde ?? 'pako') as SerdeType;
      if (serde !== 'pako' && serde !== 'base64') {
        return jsonRpcError(id, -32602, 'Invalid params', toJsonValue({ expected: 'serde:pako|base64' }));
      }
      const state = buildState(code, args.mermaidConfig);
      const serialized = serializeState(state, serde);
      return jsonRpcResult(
        id,
        toJsonValue({
          content: [{ type: 'text', text: serialized }],
          serialized
        })
      );
    }

    if (name === 'mermaid.render_svg_url' || name === 'mermaid.render_png_url') {
      const code = args.code;
      if (typeof code !== 'string') {
        return jsonRpcError(id, -32602, 'Invalid params', toJsonValue({ expected: 'code:string' }));
      }
      const state = buildState(code, args.mermaidConfig);
      const serialized = serializeState(state, 'pako');
      const urls = getRendererUrls(serialized);
      const url = name === 'mermaid.render_svg_url' ? urls.svg : urls.png;
      return jsonRpcResult(
        id,
        toJsonValue({
          content: [{ type: 'text', text: url }],
          url,
          serialized
        })
      );
    }

    if (name === 'mermaid.render_svg') {
      const code = args.code;
      if (typeof code !== 'string') {
        return jsonRpcError(id, -32602, 'Invalid params', toJsonValue({ expected: 'code:string' }));
      }
      const preferRemote = args.preferRemote !== false;
      const validate = args.validate !== false;

      if (validate) {
        try {
          await parseMermaidLocally(code, args.mermaidConfig);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return jsonRpcResult(
            id,
            toJsonValue({
              status: 'fail',
              error: { type: 'parse', message },
              code
            })
          );
        }
      }

      const state = buildState(code, args.mermaidConfig);
      const serialized = serializeState(state, 'pako');

      let svg: string;
      let renderer: 'remote' | 'local';

      if (preferRemote && env.rendererUrl) {
        svg = await renderSvgRemote(serialized);
        renderer = 'remote';
      } else {
        svg = await renderSvgLocally(code, args.mermaidConfig);
        renderer = 'local';
      }

      const remoteError = renderer === 'remote' ? detectMermaidErrorSvg(svg) : undefined;
      if (remoteError) {
        return jsonRpcResult(
          id,
          toJsonValue({
            status: 'fail',
            error: { type: 'render', message: remoteError.message },
            renderer,
            code,
            svg
          })
        );
      }

      return jsonRpcResult(
        id,
        toJsonValue({
          content: [{ type: 'text', text: svg }],
          renderer,
          code,
          svg
        })
      );
    }

    if (name === 'mermaid.render_svg_store') {
      const requestedId = args.id;
      const code = args.code;
      if (typeof code !== 'string') {
        return jsonRpcError(id, -32602, 'Invalid params', toJsonValue({ expected: 'code:string' }));
      }
      if (requestedId != null && typeof requestedId !== 'string') {
        return jsonRpcError(id, -32602, 'Invalid params', toJsonValue({ expected: 'id?:string' }));
      }
      const preferRemote = args.preferRemote !== false;
      const validate = args.validate !== false;
      const ttlSeconds = typeof args.ttlSeconds === 'number' ? args.ttlSeconds : 600;
      if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 3600) {
        return jsonRpcError(
          id,
          -32602,
          'Invalid params',
          toJsonValue({ expected: 'ttlSeconds:number (0, 3600]' })
        );
      }

      if (validate) {
        try {
          await parseMermaidLocally(code, args.mermaidConfig);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return jsonRpcResult(
            id,
            toJsonValue({
              status: 'fail',
              error: { type: 'parse', message },
              code
            })
          );
        }
      }

      const state = buildState(code, args.mermaidConfig);
      const serialized = serializeState(state, 'pako');

      let svg: string;
      let renderer: 'remote' | 'local';
      if (preferRemote && env.rendererUrl) {
        svg = await renderSvgRemote(serialized);
        renderer = 'remote';
      } else {
        svg = await renderSvgLocally(code, args.mermaidConfig);
        renderer = 'local';
      }

      const { id: svgId, expiresAtMs } = putRenderedSvg(svg, ttlSeconds * 1000, requestedId);
      const url = `/api/rendered/${svgId}`;

      const remoteError = renderer === 'remote' ? detectMermaidErrorSvg(svg) : undefined;
      if (remoteError) {
        return jsonRpcResult(
          id,
          toJsonValue({
            status: 'fail',
            error: { type: 'render', message: remoteError.message },
            content: [{ type: 'text', text: url }],
            renderer,
            id: svgId,
            url,
            expiresAtMs,
            code
          })
        );
      }

      return jsonRpcResult(
        id,
        toJsonValue({
          content: [{ type: 'text', text: url }],
          renderer,
          id: svgId,
          url,
          expiresAtMs,
          code
        })
      );
    }

    return jsonRpcError(id, -32601, 'Tool not found', toJsonValue({ name }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonRpcError(id, -32603, 'Internal error', toJsonValue({ message }));
  }
};
