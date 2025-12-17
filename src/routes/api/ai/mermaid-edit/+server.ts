import { mermaidEditWithAzureResponses } from '$lib/server/azureOpenAI';
import { json } from '@sveltejs/kit';

type MermaidEditRequest = {
  code?: unknown;
  instruction?: unknown;
  imageDataUrl?: unknown;
};

export const POST = async ({ request }) => {
  let body: MermaidEditRequest;
  try {
    body = (await request.json()) as MermaidEditRequest;
  } catch {
    return json(
      { status: 'fail', error: { message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  if (typeof body.code !== 'string' || !body.code.trim()) {
    return json(
      { status: 'fail', error: { message: 'Missing code' } },
      { status: 400 }
    );
  }
  if (typeof body.instruction !== 'string' || !body.instruction.trim()) {
    return json(
      { status: 'fail', error: { message: 'Missing instruction' } },
      { status: 400 }
    );
  }

  if (body.imageDataUrl != null) {
    if (typeof body.imageDataUrl !== 'string' || !body.imageDataUrl.startsWith('data:image/')) {
      return json(
        { status: 'fail', error: { message: 'Invalid imageDataUrl (expected data:image/* data URL)' } },
        { status: 400 }
      );
    }
  }

  try {
    const result = await mermaidEditWithAzureResponses({
      code: body.code,
      instruction: body.instruction,
      imageDataUrl: typeof body.imageDataUrl === 'string' ? body.imageDataUrl : undefined
    });

    return json({
      status: 'success',
      error: null,
      code: body.code,
      instruction: body.instruction,
      updatedCode: result.updatedCode,
      summary: result.summary ?? null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(
      { status: 'fail', error: { message }, code: body.code, instruction: body.instruction },
      { status: 500 }
    );
  }
};
