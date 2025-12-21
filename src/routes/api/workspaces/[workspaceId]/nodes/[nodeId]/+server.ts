import { deleteNode, getNode, getWorkspace } from '$lib/server/workspaces/db';
import { json } from '@sveltejs/kit';

export const DELETE = async ({ params }) => {
  const workspaceId = params.workspaceId;
  const nodeId = params.nodeId;

  const workspace = getWorkspace(workspaceId);
  if (!workspace) {
    return json(
      { status: 'fail', error: { message: 'Workspace not found' } },
      { status: 404 }
    );
  }

  const node = getNode(nodeId);
  if (!node || node.workspaceId !== workspaceId) {
    return json(
      { status: 'fail', error: { message: 'Node not found' } },
      { status: 404 }
    );
  }

  if (node.parentId === null) {
    return json(
      { status: 'fail', error: { message: 'Cannot delete root folder' } },
      { status: 400 }
    );
  }

  deleteNode(nodeId);
  return json({ status: 'success' });
};
