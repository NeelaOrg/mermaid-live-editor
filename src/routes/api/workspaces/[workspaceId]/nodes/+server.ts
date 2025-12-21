import { createNode, getNode, getWorkspace } from '$lib/server/workspaces/db';
import { json } from '@sveltejs/kit';

type CreateNodeRequest = {
  parentId?: unknown;
  type?: unknown;
  name?: unknown;
  ext?: unknown;
};

export const POST = async ({ params, request }) => {
  const workspaceId = params.workspaceId;
  const workspace = getWorkspace(workspaceId);
  if (!workspace) {
    return json(
      { status: 'fail', error: { message: 'Workspace not found' } },
      { status: 404 }
    );
  }

  let body: CreateNodeRequest;
  try {
    body = (await request.json()) as CreateNodeRequest;
  } catch {
    return json(
      { status: 'fail', error: { message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  const type = body.type === 'folder' ? 'folder' : body.type === 'file' ? 'file' : null;
  if (!type) {
    return json(
      { status: 'fail', error: { message: 'Invalid node type' } },
      { status: 400 }
    );
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return json(
      { status: 'fail', error: { message: 'Missing node name' } },
      { status: 400 }
    );
  }

  const parentId = typeof body.parentId === 'string' ? body.parentId : null;
  if (parentId) {
    const parentNode = getNode(parentId);
    if (!parentNode || parentNode.workspaceId !== workspaceId || parentNode.type !== 'folder') {
      return json(
        { status: 'fail', error: { message: 'Invalid parent folder' } },
        { status: 400 }
      );
    }
  }

  const ext = typeof body.ext === 'string' ? body.ext.trim() || null : null;
  const node = createNode({
    workspaceId,
    parentId,
    type,
    name,
    ext
  });

  return json({ status: 'success', node });
};
