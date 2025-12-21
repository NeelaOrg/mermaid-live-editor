<script lang="ts">
  import Editor from '$/components/Editor.svelte';
  import WorkspaceTreeNode from '$/components/WorkspaceTreeNode.svelte';
  import { stateStore, updateCode, updateDiagramLanguage } from '$/util/state';
  import { workspaceApi, type WorkspaceLanguage, type WorkspaceNode, type WorkspaceSummary } from '$/util/workspaces';
  import { debounce } from 'lodash-es';
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import FolderPlus from 'lucide-svelte/icons/folder-plus';
  import FilePlus from 'lucide-svelte/icons/file-plus';
  import Layers from 'lucide-svelte/icons/layers';
  import PanelLeftClose from 'lucide-svelte/icons/panel-left-close';
  import PanelLeftOpen from 'lucide-svelte/icons/panel-left-open';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { onMount } from 'svelte';

  const { isMobile } = $props<{ isMobile: boolean }>();

  let workspaces = $state<WorkspaceSummary[]>([]);
  let activeWorkspaceId = $state('');
  let nodes = $state<WorkspaceNode[]>([]);
  let activeFileId = $state<string | null>(null);
  let selectedFolderId = $state<string | null>(null);
  let expanded = $state<Record<string, boolean>>({});
  let loading = $state(false);
  let errorMessage = $state<string | null>(null);
  let treeOpen = $state(!isMobile);

  const activeWorkspace = $derived(workspaces.find((workspace) => workspace.id === activeWorkspaceId));
  const rootNode = $derived(nodes.find((node) => node.parentId === null) ?? null);

  const defaultExtForLanguage = (language: WorkspaceLanguage): string =>
    language === 'likec4' ? 'c4' : 'mmd';

  const parseFileName = (raw: string, language: WorkspaceLanguage) => {
    const value = raw.trim();
    if (!value) return null;
    const lastDot = value.lastIndexOf('.');
    if (lastDot > 0 && lastDot < value.length - 1) {
      return {
        name: value.slice(0, lastDot),
        ext: value.slice(lastDot + 1)
      };
    }
    return { name: value, ext: defaultExtForLanguage(language) };
  };

  const languageFromExtension = (ext: string | null | undefined): WorkspaceLanguage | null => {
    const normalized = ext?.toLowerCase() ?? '';
    if (normalized === 'c4') return 'likec4';
    if (normalized === 'mermaid' || normalized === 'mmd') return 'mermaid';
    return null;
  };

  const saveFileDebounced = debounce(
    async (workspaceId: string, fileId: string, content: string) => {
      try {
        await workspaceApi.saveFileContent({ workspaceId, fileId, content });
      } catch (error) {
        console.error('Failed to save file', error);
      }
    },
    600
  );

  const loadTree = async (workspaceId: string) => {
    loading = true;
    errorMessage = null;
    try {
      const { workspace, nodes: treeNodes } = await workspaceApi.getTree(workspaceId);
      const root = treeNodes.find((node) => node.parentId === null) ?? null;
      activeWorkspaceId = workspace.id;
      nodes = treeNodes;
      expanded = root ? { [root.id]: true } : {};
      selectedFolderId = root?.id ?? null;
      activeFileId = null;
      const firstFile = treeNodes.find((node) => node.type === 'file');
      if (firstFile) {
        await openFile(firstFile);
      } else {
        updateCode('', { updateDiagram: true, resetPanZoom: true });
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load workspace tree.';
    } finally {
      loading = false;
    }
  };

  const ensureWorkspace = async () => {
    loading = true;
    errorMessage = null;
    const timeoutId = window.setTimeout(() => {
      if (loading) {
        loading = false;
        errorMessage = 'Workspace service did not respond. Please retry.';
      }
    }, 9000);
    try {
      const list = await workspaceApi.listWorkspaces();
      if (!list.length) {
        const language = $stateStore.language ?? 'mermaid';
        const created = await workspaceApi.createWorkspace({
          name: 'Workspace',
          language
        });
        workspaces = [created.workspace];
        nodes = [created.rootNode];
        activeWorkspaceId = created.workspace.id;
        selectedFolderId = created.rootNode.id;
        expanded = { [created.rootNode.id]: true };
        updateDiagramLanguage(created.workspace.language);
      } else {
        workspaces = list;
        await loadTree(list[0].id);
        updateDiagramLanguage(list[0].language);
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load workspaces.';
    } finally {
      loading = false;
      window.clearTimeout(timeoutId);
    }
  };

  const createWorkspacePrompt = async () => {
    const name = window.prompt('Workspace name');
    if (!name) return;
    try {
      const language = $stateStore.language ?? 'mermaid';
      const created = await workspaceApi.createWorkspace({
        name,
        language
      });
      workspaces = [created.workspace, ...workspaces];
      nodes = [created.rootNode];
      activeWorkspaceId = created.workspace.id;
      activeFileId = null;
      selectedFolderId = created.rootNode.id;
      expanded = { [created.rootNode.id]: true };
      updateDiagramLanguage(created.workspace.language);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to create workspace.';
    }
  };

  const createFolderPrompt = async (parent?: WorkspaceNode) => {
    if (!activeWorkspaceId) return;
    const name = window.prompt('Folder name');
    if (!name) return;
    const parentId = parent?.id ?? selectedFolderId ?? rootNode?.id ?? null;
    try {
      const node = await workspaceApi.createNode({
        workspaceId: activeWorkspaceId,
        parentId,
        type: 'folder',
        name: name.trim(),
        ext: null
      });
      nodes = [...nodes, node];
      selectedFolderId = node.id;
      expanded = { ...expanded, [parentId ?? node.id]: true, [node.id]: true };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to create folder.';
    }
  };

  const createFilePrompt = async (parent?: WorkspaceNode) => {
    if (!activeWorkspaceId || !activeWorkspace) return;
    const rawName = window.prompt('File name');
    if (!rawName) return;
    const fileName = parseFileName(rawName, activeWorkspace.language);
    if (!fileName) return;
    const parentId = parent?.id ?? selectedFolderId ?? rootNode?.id ?? null;
    try {
      const node = await workspaceApi.createNode({
        workspaceId: activeWorkspaceId,
        parentId,
        type: 'file',
        name: fileName.name,
        ext: fileName.ext
      });
      nodes = [...nodes, node];
      expanded = { ...expanded, [parentId ?? node.id]: true };
      await openFile(node);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to create file.';
    }
  };

  const openFile = async (node: WorkspaceNode) => {
    if (!activeWorkspaceId || node.type !== 'file') return;
    activeFileId = node.id;
    selectedFolderId = node.parentId;
    const language = languageFromExtension(node.ext);
    if (language) {
      updateDiagramLanguage(language);
    }
    try {
      const content = await workspaceApi.getFileContent(activeWorkspaceId, node.id);
      updateCode(content, { updateDiagram: true, resetPanZoom: true });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to open file.';
    }
  };

  const handleWorkspaceChange = async (event: Event) => {
    const target = event.currentTarget as HTMLSelectElement | null;
    if (!target?.value) return;
    await loadTree(target.value);
    const selected = workspaces.find((workspace) => workspace.id === target.value);
    if (selected) {
      updateDiagramLanguage(selected.language);
    }
  };

  const handleToggle = (id: string) => {
    expanded = { ...expanded, [id]: !expanded[id] };
  };

  const handleSelectFolder = (node: WorkspaceNode) => {
    selectedFolderId = node.id;
  };

  const collectDescendants = (nodeId: string): Set<string> => {
    const ids = new Set<string>();
    const stack = [nodeId];
    while (stack.length) {
      const current = stack.pop();
      if (!current) continue;
      ids.add(current);
      nodes.forEach((node) => {
        if (node.parentId === current) {
          stack.push(node.id);
        }
      });
    }
    return ids;
  };

  const handleDeleteNode = async (node: WorkspaceNode) => {
    if (!activeWorkspaceId) return;
    if (node.parentId === null) return;
    const label = node.type === 'folder' ? 'folder and its contents' : 'file';
    const confirmed = window.confirm(`Delete this ${label}?`);
    if (!confirmed) return;

    try {
      await workspaceApi.deleteNode(activeWorkspaceId, node.id);
      const toRemove = collectDescendants(node.id);
      nodes = nodes.filter((item) => !toRemove.has(item.id));
      if (activeFileId && toRemove.has(activeFileId)) {
        activeFileId = null;
        updateCode('', { updateDiagram: true, resetPanZoom: true });
      }
      if (selectedFolderId && toRemove.has(selectedFolderId)) {
        selectedFolderId = rootNode?.id ?? null;
      }
      const updatedExpanded = { ...expanded };
      toRemove.forEach((id) => {
        delete updatedExpanded[id];
      });
      expanded = updatedExpanded;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to delete node.';
    }
  };

  const handleEditorUpdate = (text: string) => {
    if (!activeWorkspaceId || !activeFileId || $stateStore.editorMode !== 'code') {
      return;
    }
    saveFileDebounced(activeWorkspaceId, activeFileId, text);
  };

  const handleDeleteWorkspace = async () => {
    if (!activeWorkspaceId) return;
    const confirmed = window.confirm('Delete this workspace and all files?');
    if (!confirmed) return;

    try {
      await workspaceApi.deleteWorkspace(activeWorkspaceId);
      const remaining = workspaces.filter((workspace) => workspace.id !== activeWorkspaceId);
      workspaces = remaining;
      activeWorkspaceId = '';
      activeFileId = null;
      nodes = [];
      expanded = {};
      selectedFolderId = null;
      updateCode('', { updateDiagram: true, resetPanZoom: true });
      if (remaining.length) {
        await loadTree(remaining[0].id);
        updateDiagramLanguage(remaining[0].language);
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to delete workspace.';
    }
  };

  const retryLoad = () => {
    void ensureWorkspace();
  };

  onMount(() => {
    void ensureWorkspace();
  });
</script>

<div class="flex h-full min-h-0 flex-1 flex-col">
  <div class="flex items-center gap-2 border-b border-border/60 px-3 py-2 text-xs sm:text-sm">
    <button
      type="button"
      class="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-xs text-foreground/80 hover:bg-muted sm:hidden"
      aria-label="Toggle explorer"
      title="Toggle explorer"
      onclick={() => {
        treeOpen = !treeOpen;
      }}>
      <Layers class="size-3.5" />
      <ChevronDown class="size-3.5" />
    </button>

    <select
      class="h-7 rounded-md border border-border bg-background px-2 text-xs"
      bind:value={activeWorkspaceId}
      onchange={handleWorkspaceChange}>
      {#if !workspaces.length}
        <option value="" disabled>Loading workspaces...</option>
      {:else}
        {#each workspaces as workspace (workspace.id)}
          <option value={workspace.id}>{workspace.name}</option>
        {/each}
      {/if}
    </select>

    <button
      type="button"
      class="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-xs text-foreground/80 hover:bg-muted"
      aria-label="New workspace"
      title="New workspace"
      onclick={createWorkspacePrompt}>
      <Layers class="size-3.5" />
    </button>
    <button
      type="button"
      class="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-xs text-foreground/80 hover:bg-muted disabled:opacity-50"
      aria-label="Delete workspace"
      title="Delete workspace"
      onclick={handleDeleteWorkspace}
      disabled={!activeWorkspaceId}>
      <Trash2 class="size-3.5" />
    </button>

    <div class="ml-auto flex items-center gap-2">
      <button
        type="button"
        class="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-xs text-foreground/80 hover:bg-muted"
        aria-label={treeOpen ? 'Collapse' : 'Expand'}
        title={treeOpen ? 'Collapse' : 'Expand'}
        onclick={() => {
          treeOpen = !treeOpen;
        }}>
        {#if treeOpen}
          <PanelLeftClose class="size-3.5" />
        {:else}
          <PanelLeftOpen class="size-3.5" />
        {/if}
      </button>
      <button
        type="button"
        class="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-xs text-foreground/80 hover:bg-muted"
        aria-label="New folder"
        title="New folder"
        onclick={() => createFolderPrompt()}
        disabled={!activeWorkspaceId}>
        <FolderPlus class="size-3.5" />
      </button>
      <button
        type="button"
        class="inline-flex items-center justify-center rounded-md border border-border px-2 py-1 text-xs text-foreground/80 hover:bg-muted"
        aria-label="New file"
        title="New file"
        onclick={() => createFilePrompt()}
        disabled={!activeWorkspaceId}>
        <FilePlus class="size-3.5" />
      </button>
    </div>
  </div>

  <div class="flex min-h-0 flex-1 overflow-hidden">
    <aside
      class={[
        'h-full w-60 border-r border-border/60 bg-muted/20',
        !treeOpen && 'hidden'
      ]}>
      <div class="h-full overflow-auto py-2">
        {#if loading}
          <p class="px-3 text-xs text-foreground/60">Loading...</p>
        {:else if errorMessage}
          <div class="flex flex-col gap-2 px-3 text-xs text-destructive">
            <p class="break-words">{errorMessage}</p>
            <button
              type="button"
              class="w-fit rounded-md border border-border px-2 py-1 text-xs text-foreground/80 hover:bg-muted"
              onclick={retryLoad}>
              Retry
            </button>
          </div>
        {:else if !nodes.length}
          <p class="px-3 text-xs text-foreground/60">No files yet. Create one.</p>
        {:else if rootNode}
          <ul>
            <WorkspaceTreeNode
              node={rootNode}
              nodes={nodes}
              depth={0}
              expanded={expanded}
              activeFileId={activeFileId}
              selectedFolderId={selectedFolderId}
              onToggle={handleToggle}
              onOpenFile={openFile}
              onSelectFolder={handleSelectFolder}
              onCreateFolder={createFolderPrompt}
              onCreateFile={createFilePrompt}
              onDeleteNode={handleDeleteNode} />
          </ul>
        {/if}
      </div>
    </aside>

    <div class="min-w-0 flex-1">
      <Editor {isMobile} onExternalUpdate={handleEditorUpdate} />
    </div>
  </div>
</div>
