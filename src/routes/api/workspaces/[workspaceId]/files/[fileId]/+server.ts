import {
  getFileContent,
  getNode,
  getWorkspace,
  updateFileContent
} from '$lib/server/workspaces/db';
import { json } from '@sveltejs/kit';

type UpdateFileRequest = {
  content?: unknown;
};

export const GET = async ({ params }) => {
  const workspaceId = params.workspaceId;
  const fileId = params.fileId;

  const workspace = getWorkspace(workspaceId);
  if (!workspace) {
    return json(
      { status: 'fail', error: { message: 'Workspace not found' } },
      { status: 404 }
    );
  }

  const node = getNode(fileId);
  if (!node || node.workspaceId !== workspaceId || node.type !== 'file') {
    return json(
      { status: 'fail', error: { message: 'File not found' } },
      { status: 404 }
    );
  }

  const content = getFileContent(fileId);
  if (!content) {
    return json(
      { status: 'fail', error: { message: 'File content missing' } },
      { status: 404 }
    );
  }

  return json({ status: 'success', content: content.content, updatedAt: content.updatedAt });
};

export const PUT = async ({ params, request }) => {
  const workspaceId = params.workspaceId;
  const fileId = params.fileId;

  const workspace = getWorkspace(workspaceId);
  if (!workspace) {
    return json(
      { status: 'fail', error: { message: 'Workspace not found' } },
      { status: 404 }
    );
  }

  const node = getNode(fileId);
  if (!node || node.workspaceId !== workspaceId || node.type !== 'file') {
    return json(
      { status: 'fail', error: { message: 'File not found' } },
      { status: 404 }
    );
  }

  let body: UpdateFileRequest;
  try {
    body = (await request.json()) as UpdateFileRequest;
  } catch {
    return json(
      { status: 'fail', error: { message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  if (typeof body.content !== 'string') {
    return json(
      { status: 'fail', error: { message: 'Missing content' } },
      { status: 400 }
    );
  }

  const result = updateFileContent({ fileId, content: body.content });
  return json({ status: 'success', updatedAt: result.updatedAt });
};
