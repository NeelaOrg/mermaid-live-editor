import { json } from '@sveltejs/kit';
import { LikeC4 } from 'likec4';

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

    return json({
      status: 'success',
      viewId: selected.id,
      svg: selected.svg,
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
