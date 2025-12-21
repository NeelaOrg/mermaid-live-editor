import { deleteWorkspace, getWorkspace } from '$lib/server/workspaces/db';
import { json } from '@sveltejs/kit';

export const DELETE = async ({ params }) => {
  const workspaceId = params.workspaceId;
  const workspace = getWorkspace(workspaceId);
  if (!workspace) {
    return json(
      { status: 'fail', error: { message: 'Workspace not found' } },
      { status: 404 }
    );
  }

  deleteWorkspace(workspaceId);
  return json({ status: 'success' });
};
