import { getWorkspace, listNodes } from '$lib/server/workspaces/db';
import { json } from '@sveltejs/kit';

export const GET = async ({ params }) => {
  const workspaceId = params.workspaceId;
  const workspace = getWorkspace(workspaceId);
  if (!workspace) {
    return json(
      { status: 'fail', error: { message: 'Workspace not found' } },
      { status: 404 }
    );
  }

  return json({ status: 'success', workspace, nodes: listNodes(workspaceId) });
};
