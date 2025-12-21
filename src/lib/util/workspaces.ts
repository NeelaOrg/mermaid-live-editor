export type WorkspaceLanguage = 'mermaid' | 'likec4';

export type WorkspaceSummary = {
  id: string;
  name: string;
  language: WorkspaceLanguage;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceNode = {
  id: string;
  workspaceId: string;
  parentId: string | null;
  type: 'folder' | 'file';
  name: string;
  ext: string | null;
  createdAt: string;
  updatedAt: string;
};

const apiRequest = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  let response: Response;
  try {
    response = await fetch(path, {
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers ?? {})
      },
      signal: controller.signal,
      ...options
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Workspace request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
};

export const workspaceApi = {
  listWorkspaces: async (): Promise<WorkspaceSummary[]> => {
    const result = await apiRequest<{ status: string; workspaces: WorkspaceSummary[] }>(
      '/api/workspaces'
    );
    return result.workspaces;
  },
  createWorkspace: async ({
    name,
    language
  }: {
    name: string;
    language: WorkspaceLanguage;
  }): Promise<{ workspace: WorkspaceSummary; rootNode: WorkspaceNode }> => {
    const result = await apiRequest<{
      status: string;
      workspace: WorkspaceSummary;
      rootNode: WorkspaceNode;
    }>('/api/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name, language })
    });
    return { workspace: result.workspace, rootNode: result.rootNode };
  },
  deleteWorkspace: async (workspaceId: string): Promise<void> => {
    await apiRequest(`/api/workspaces/${workspaceId}`, { method: 'DELETE' });
  },
  getTree: async (workspaceId: string): Promise<{ workspace: WorkspaceSummary; nodes: WorkspaceNode[] }> => {
    const result = await apiRequest<{
      status: string;
      workspace: WorkspaceSummary;
      nodes: WorkspaceNode[];
    }>(`/api/workspaces/${workspaceId}/tree`);
    return { workspace: result.workspace, nodes: result.nodes };
  },
  createNode: async ({
    workspaceId,
    parentId,
    type,
    name,
    ext
  }: {
    workspaceId: string;
    parentId: string | null;
    type: 'folder' | 'file';
    name: string;
    ext: string | null;
  }): Promise<WorkspaceNode> => {
    const result = await apiRequest<{ status: string; node: WorkspaceNode }>(
      `/api/workspaces/${workspaceId}/nodes`,
      {
        method: 'POST',
        body: JSON.stringify({ parentId, type, name, ext })
      }
    );
    return result.node;
  },
  deleteNode: async (workspaceId: string, nodeId: string): Promise<void> => {
    await apiRequest(`/api/workspaces/${workspaceId}/nodes/${nodeId}`, { method: 'DELETE' });
  },
  getFileContent: async (workspaceId: string, fileId: string): Promise<string> => {
    const result = await apiRequest<{ status: string; content: string }>(
      `/api/workspaces/${workspaceId}/files/${fileId}`
    );
    return result.content;
  },
  saveFileContent: async ({
    workspaceId,
    fileId,
    content
  }: {
    workspaceId: string;
    fileId: string;
    content: string;
  }): Promise<void> => {
    await apiRequest(`/api/workspaces/${workspaceId}/files/${fileId}`, {
      method: 'PUT',
      body: JSON.stringify({ content })
    });
  }
};
