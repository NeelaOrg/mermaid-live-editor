import { env as privateEnv } from '$env/dynamic/private';

interface AzureConfig {
  endpoint: string;
  apiKey: string;
  deployment: string;
  model: string;
  apiVersion: string;
  useDeploymentBasedUrls: boolean;
  webSearchEnabled: boolean;
  webSearchForce: boolean;
  debugLog: boolean;
  reasoningSummary: 'auto' | 'detailed' | undefined;
}

const getAzureConfig = (): AzureConfig => {
  const endpoint = privateEnv.AZURE_OPENAI_ENDPOINT ?? '';
  const apiKey = privateEnv.AZURE_OPENAI_API_KEY ?? '';
  const deployment = privateEnv.AZURE_OPENAI_DEPLOYMENT ?? '';
  const model = privateEnv.AZURE_OPENAI_MODEL ?? deployment;
  const apiVersion = privateEnv.AZURE_OPENAI_API_VERSION ?? '';
  const useDeploymentBasedUrls = (privateEnv.AZURE_OPENAI_USE_DEPLOYMENT_URLS ?? '') === 'true';
  const webSearchEnabled = (privateEnv.AZURE_OPENAI_ENABLE_WEB_SEARCH ?? 'false') === 'true';
  const webSearchForce = (privateEnv.AZURE_OPENAI_FORCE_WEB_SEARCH ?? 'false') === 'true';
  const debugLog = (privateEnv.AZURE_OPENAI_DEBUG_LOG ?? 'false') === 'true';
  const reasoningSummaryRaw = privateEnv.AZURE_OPENAI_REASONING_SUMMARY ?? '';
  const reasoningSummary =
    reasoningSummaryRaw === 'high' || reasoningSummaryRaw === 'high'
      ? (reasoningSummaryRaw as 'high' | 'high')
      : 'medium';

  if (!endpoint || !apiKey || !deployment) {
    throw new Error(
      'Azure OpenAI is not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT.'
    );
  }

  return {
    apiKey,
    apiVersion: apiVersion || 'v1',
    debugLog,
    deployment,
    endpoint,
    model,
    reasoningSummary,
    useDeploymentBasedUrls,
    webSearchEnabled,
    webSearchForce
  };
};

interface MermaidEditResult {
  updatedCode: string;
  summary: string;
  toolCalls?: ToolCallSummary[];
  reasoning?: string;
  responseId?: string;
}

const parseImageDataUrl = (dataUrl: string): { mimeType: string; bytes: Uint8Array } => {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid imageDataUrl (expected base64 data URL).');

  const mimeType = match[1] ?? 'application/octet-stream';
  const base64 = match[2] ?? '';
  const bytes = Buffer.from(base64, 'base64');

  if (!bytes.length) throw new Error('Invalid imageDataUrl (empty image).');
  return { mimeType, bytes };
};

type ToolCallSummary = {
  toolName: string;
  action?: {
    type: string;
    query?: string;
    url?: string | null;
    pattern?: string | null;
  };
  sources?: Array<{ type: string; url?: string; name?: string }>;
};

const extractToolCallsFromOpenAIResponse = (body: unknown): ToolCallSummary[] => {
  const b = body as { output?: unknown[] };
  const output = Array.isArray(b?.output) ? b.output : [];
  const toolCalls: ToolCallSummary[] = [];

  for (const item of output) {
    const it = item as { type?: unknown; name?: unknown; action?: unknown; sources?: unknown };
    const type = typeof it.type === 'string' ? it.type : undefined;
    if (!type) continue;

    // OpenAI Responses tool calls show up as e.g. `web_search_call`.
    if (!type.endsWith('_call')) continue;

    const toolNameFromType = type.replace(/_call$/, '');
    const toolName = typeof it.name === 'string' ? it.name : toolNameFromType;
    const action = it.action as
      | {
          type?: unknown;
          query?: unknown;
          url?: unknown;
          pattern?: unknown;
        }
      | undefined;

    toolCalls.push({
      action: action
        ? {
            pattern: typeof action.pattern === 'string' ? action.pattern : null,
            query: typeof action.query === 'string' ? action.query : undefined,
            type: typeof action.type === 'string' ? action.type : 'unknown',
            url: typeof action.url === 'string' ? action.url : null
          }
        : undefined,
      sources: Array.isArray(it.sources)
        ? (it.sources as Array<{ type?: unknown; url?: unknown; name?: unknown }>).map((s) => ({
            name: typeof s.name === 'string' ? s.name : undefined,
            type: typeof s.type === 'string' ? s.type : 'unknown',
            url: typeof s.url === 'string' ? s.url : undefined
          }))
        : undefined,
      toolName
    });
  }

  return toolCalls;
};

const safeSnippet = (value: unknown, max = 200): string => {
  try {
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return str.length > max ? `${str.slice(0, max)}…` : str;
  } catch {
    return '';
  }
};

const buildAzureResponsesUrl = ({
  apiVersion,
  baseURL,
  deployment,
  useDeploymentBasedUrls
}: {
  apiVersion: string;
  baseURL: string;
  deployment: string;
  useDeploymentBasedUrls: boolean;
}): string => {
  const base = baseURL.replace(/\/+$/, '');
  const url = useDeploymentBasedUrls
    ? `${base}/deployments/${encodeURIComponent(deployment)}/responses`
    : `${base}/v1/responses`;
  return `${url}?api-version=${encodeURIComponent(apiVersion)}`;
};

const formatProviderError = (error: unknown): string => {
  const e = error as Record<string, unknown> | null;
  if (!e || typeof e !== 'object') return String(error);

  const parts: string[] = [];
  const name = typeof e.name === 'string' ? e.name : undefined;
  const message = typeof e.message === 'string' ? e.message : undefined;
  const statusCode = typeof e.statusCode === 'number' ? e.statusCode : undefined;
  const url = typeof e.url === 'string' ? e.url : undefined;
  const responseBody =
    typeof e.responseBody === 'string'
      ? e.responseBody
      : e.responseBody != null
        ? safeSnippet(e.responseBody, 800)
        : undefined;

  if (name) parts.push(name);
  if (message) parts.push(message);
  if (statusCode != null) parts.push(`statusCode=${statusCode}`);
  if (url) parts.push(`url=${url}`);
  if (responseBody) parts.push(`responseBody=${responseBody}`);

  if (parts.length) return parts.join(' ');
  return String(error);
};

const summarizeMessages = (
  content: Array<{ type: 'text'; text: string } | { type: 'image'; image: Uint8Array }>
) => {
  return content.map((part) =>
    part.type === 'text'
      ? { type: 'text', chars: part.text.length, preview: safeSnippet(part.text, 160) }
      : { type: 'image', bytes: part.image.byteLength }
  );
};

export const mermaidEditWithAzureResponses = async ({
  code,
  instruction,
  imageDataUrl,
  language
}: {
  code: string;
  instruction: string;
  imageDataUrl?: string;
  language?: 'likec4' | 'mermaid';
}): Promise<MermaidEditResult> => {
  const {
    endpoint,
    apiKey,
    apiVersion,
    deployment,
    model,
    useDeploymentBasedUrls,
    webSearchEnabled,
    webSearchForce,
    debugLog,
    reasoningSummary
  } = getAzureConfig();

  const rawEndpoint = endpoint.replace(/\/+$/, '');
  // `@ai-sdk/azure` expects `baseURL` without `/v1` (it appends `/v1{path}` itself).
  // Typical env value: `https://{resource}.openai.azure.com/openai/v1`
  const baseURL = rawEndpoint.replace(/\/v1$/i, '');

  const diagramLanguage = language ?? 'mermaid';
  let system =
    diagramLanguage === 'likec4'
      ? [
          'You are an expert LikeC4 DSL diagram editor.',
          'Given LikeC4 source code and a requested change, produce updated LikeC4 source code that satisfies the request.',
          'Return JSON only matching the provided schema.',
          'Do not include Markdown, code fences, or extra keys.',
          'Keep LikeC4 syntax valid and preserve the intent unless explicitly requested to change it.',
          'Must use the web search tool to get the latest syntax.'
        ].join(' ')
      : [
          'You are an expert Mermaid diagram editor.',
          'Given Mermaid code and a requested change, produce an updated Mermaid code that satisfies the request.',
          'Return JSON only matching the provided schema.',
          'Do not include Markdown, code fences, or extra keys.',
          'Preserve the diagram type and intent unless explicitly requested to change it.',
          'Keep Mermaid syntax valid.',
          'Must use the web search tool to get the latest syntax.'
        ].join(' ');
  if (webSearchEnabled) {
    system = `${system} If you are unsure about syntax, use the web_search tool to verify the correct language and keywords before editing.`;
  }

  const userText =
    diagramLanguage === 'likec4'
      ? [
          'Current LikeC4 source:',
          code,
          '',
          'Requested change:',
          instruction,
          '',
          'Notes:',
          "- LikeC4 needs a `views { view ... }` section to render. Don't remove views unless requested.",
          '- Output LikeC4 source in updatedCode.'
        ].join('\n')
      : ['Current Mermaid code:', code, '', 'Requested change:', instruction].join('\n');

  const userContent: ({ type: 'text'; text: string } | { type: 'image'; image: Uint8Array })[] = [
    { type: 'text', text: userText }
  ];

  if (imageDataUrl) {
    const { bytes } = parseImageDataUrl(imageDataUrl);
    userContent.push({
      type: 'image',
      image: bytes
    });
  }

  const tools = webSearchEnabled ? [{ type: 'web_search_preview' as const }] : undefined;
  const toolChoice = undefined;
  const messagesForModel = [{ role: 'user', content: userContent }] as const;
  const messagesForLog = [
    {
      role: 'user',
      content: userContent.map((part) =>
        part.type === 'image'
          ? { type: 'image', bytes: part.image.byteLength }
          : { type: 'text', text: part.text }
      )
    }
  ];

  try {
    if (debugLog) {
      console.log(
        '[ai-edit] request',
        JSON.stringify({
          apiVersion,
          diagramLanguage,
          endpoint,
          hasImage: Boolean(imageDataUrl),
          instructionChars: instruction.length,
          model,
          requestPayload: {
            system,
            messages: userContent,
            tools,
            toolChoice
          },
          resolvedResponsesUrl: buildAzureResponsesUrl({
            apiVersion,
            baseURL,
            deployment,
            useDeploymentBasedUrls
          }),
          toolChoice: toolChoice ? 'force_web_search_preview' : tools ? 'auto' : 'none',
          useDeploymentBasedUrls,
          webSearchEnabled
        })
      );

      const generateArgsForLog = {
        model: deployment,
        system,
        messages: messagesForLog,
        providerOptions: {
          openai: {
            parallelToolCalls: false,
            reasoningSummary,
            store: false,
            strictJsonSchema: true,
            textVerbosity: 'low'
          }
        },
        toolChoice,
        tools
      };
      console.log('[ai-edit] generateObject payload', JSON.stringify(generateArgsForLog, null, 2));
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'api-key': apiKey
    };

    const mapContent = (parts: typeof userContent, imageUrl?: string) =>
      parts.map((part) =>
        part.type === 'image'
          ? { type: 'input_image' as const, image_url: imageUrl }
          : { type: 'input_text' as const, text: part.text }
      );

    const body = {
      model: deployment,
      input: [
        { role: 'system', content: [{ type: 'input_text' as const, text: system }] },
        {
          role: 'user',
          content: mapContent(userContent, imageDataUrl)
        }
      ],
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: true,
      store: true,
      reasoning: reasoningSummary ? { effort: reasoningSummary } : undefined,
      text: {
        format: {
          type: 'json_schema',
          name: 'response',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              updatedCode: { type: 'string' },
              summary: { type: 'string' }
            },
            required: ['updatedCode', 'summary'],
            additionalProperties: false
          }
        },
        verbosity: 'low'
      }
    };

    const response = await fetch(
      `${rawEndpoint}/responses?api-version=${encodeURIComponent(apiVersion)}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      }
    );

    const rawText = await response.text();
    let rawJson: any = null;
    try {
      rawJson = JSON.parse(rawText);
    } catch {
      /* ignore */
    }

    if (debugLog) {
      console.log('[ai-edit] response raw', rawText);
    }

    if (!response.ok) {
      throw new Error(
        `Azure OpenAI request failed: status=${response.status} body=${safeSnippet(rawText, 2000)}`
      );
    }

    const outputArray: any[] = Array.isArray(rawJson?.output) ? rawJson.output : [];
    const toolCalls = extractToolCallsFromOpenAIResponse(rawJson);
    const responseId =
      rawJson?.id ||
      (rawJson?.providerMetadata?.azure?.responseId ??
        rawJson?.providerMetadata?.openai?.responseId);

    const messageContent = outputArray.find((o) => o.type === 'message');
    let updatedCode: string | undefined;
    let summary: string | undefined;
    if (messageContent?.content?.[0]?.text) {
      const text = messageContent.content[0].text as string;
      try {
        const parsed = JSON.parse(text);
        updatedCode = parsed.updatedCode;
        summary = parsed.summary;
      } catch {
        updatedCode = text;
      }
    }

    if (!updatedCode) {
      throw new Error('Azure OpenAI response missing updatedCode');
    }

    if (debugLog) {
      console.log(
        '[ai-edit] response',
        JSON.stringify(
          {
            responseId: typeof responseId === 'string' ? responseId : undefined,
            rawJson,
            toolCalls: toolCalls.map((t) => ({
              actionType: t.action?.type,
              query: t.action?.query,
              toolName: t.toolName,
              sources: t.sources
            })),
            usage: rawJson?.usage,
            updatedCode,
            summary
          },
          null,
          2
        )
      );
    }

    return {
      updatedCode,
      summary: summary ?? '',
      reasoning: rawJson?.reasoning?.summary ?? undefined,
      responseId: typeof responseId === 'string' ? responseId : undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined
    };
  } catch (error) {
    const message = formatProviderError(error);
    throw new Error(
      `Azure OpenAI request failed: ${message} url=${buildAzureResponsesUrl({
        apiVersion,
        baseURL,
        deployment,
        useDeploymentBasedUrls
      })} deployment=${deployment} apiVersion=${apiVersion} useDeploymentBasedUrls=${useDeploymentBasedUrls}`
    );
  }
};
