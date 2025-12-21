import {
  createWorkspace,
  listWorkspaces,
  type WorkspaceLanguage
} from '$lib/server/workspaces/db';
import { json } from '@sveltejs/kit';

export const GET = async () => {
  return json({ status: 'success', workspaces: listWorkspaces() });
};

type CreateWorkspaceRequest = {
  name?: unknown;
  language?: unknown;
};

export const POST = async ({ request }) => {
  let body: CreateWorkspaceRequest;
  try {
    body = (await request.json()) as CreateWorkspaceRequest;
  } catch {
    return json(
      { status: 'fail', error: { message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return json(
      { status: 'fail', error: { message: 'Missing workspace name' } },
      { status: 400 }
    );
  }

  const language = body.language === 'likec4' ? 'likec4' : 'mermaid';
  const { workspace, rootNode } = createWorkspace({
    name,
    language: language as WorkspaceLanguage
  });

  return json({ status: 'success', workspace, rootNode });
};
