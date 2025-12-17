import { env as privateEnv } from '$env/dynamic/private';
import { createOpenAI, type OpenAIResponsesProviderOptions } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

type AzureConfig = {
  endpoint: string;
  apiKey: string;
  deployment: string;
  model: string;
};

const getAzureConfig = (): AzureConfig => {
  const endpoint = privateEnv.AZURE_OPENAI_ENDPOINT ?? '';
  const apiKey = privateEnv.AZURE_OPENAI_API_KEY ?? '';
  const deployment = privateEnv.AZURE_OPENAI_DEPLOYMENT ?? '';
  const model = privateEnv.AZURE_OPENAI_MODEL ?? deployment;

  if (!endpoint || !apiKey || !deployment) {
    throw new Error(
      'Azure OpenAI is not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT.'
    );
  }

  return { endpoint, apiKey, deployment, model };
};

type MermaidEditResult = {
  updatedCode: string;
  summary: string;
};

const mermaidEditSchema = z.object({
  updatedCode: z.string(),
  summary: z.string()
});

const parseImageDataUrl = (dataUrl: string): { mimeType: string; bytes: Uint8Array } => {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid imageDataUrl (expected base64 data URL).');

  const mimeType = match[1] ?? 'application/octet-stream';
  const base64 = match[2] ?? '';
  const bytes = Buffer.from(base64, 'base64');

  if (!bytes.length) throw new Error('Invalid imageDataUrl (empty image).');
  return { mimeType, bytes };
};

export const mermaidEditWithAzureResponses = async ({
  code,
  instruction,
  imageDataUrl
}: {
  code: string;
  instruction: string;
  imageDataUrl?: string;
}): Promise<MermaidEditResult> => {
  const { endpoint, apiKey, model } = getAzureConfig();

  const rawEndpoint = endpoint.replace(/\/+$/, '');
  // Azure OpenAI "OpenAI-compatible" endpoints typically look like:
  // https://{resource}.openai.azure.com/openai/v1
  const openai = createOpenAI({
    apiKey,
    baseURL: rawEndpoint
  });

  const system = [
    'You are an expert Mermaid diagram editor.',
    'Given Mermaid code and a requested change, produce an updated Mermaid code that satisfies the request.',
    'Return JSON only matching the provided schema.',
    'Do not include Markdown, code fences, or extra keys.',
    'Preserve the diagram type and intent unless explicitly requested to change it.',
    'Keep Mermaid syntax valid.'
  ].join(' ');

  const userText = [
    'Current Mermaid code:',
    code,
    '',
    'Requested change:',
    instruction
  ].join('\n');

  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; image: Uint8Array }
  > = [{ type: 'text', text: userText }];

  if (imageDataUrl) {
    const { bytes } = parseImageDataUrl(imageDataUrl);
    userContent.push({
      type: 'image',
      image: bytes
    });
  }

  try {
    const result = await generateObject({
      model: openai.responses(model),
      schema: mermaidEditSchema,
      system,
      messages: [{ role: 'user', content: userContent }],
      providerOptions: {
        openai: {
          parallelToolCalls: false,
          store: false,
          strictJsonSchema: true,
          textVerbosity: 'low'
        } satisfies OpenAIResponsesProviderOptions
      }
    });

    return result.object;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Azure OpenAI request failed: ${message}`);
  }
};

