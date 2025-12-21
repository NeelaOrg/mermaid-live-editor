<script lang="ts">
  import ChevronDown from 'lucide-svelte/icons/chevron-down';
  import ChevronRight from 'lucide-svelte/icons/chevron-right';
  import FilePlus from 'lucide-svelte/icons/file-plus';
  import FileText from 'lucide-svelte/icons/file-text';
  import Folder from 'lucide-svelte/icons/folder';
  import FolderPlus from 'lucide-svelte/icons/folder-plus';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import type { WorkspaceNode } from '$/util/workspaces';
  import WorkspaceTreeNode from './WorkspaceTreeNode.svelte';

  const {
    node,
    nodes,
    depth,
    expanded,
    activeFileId,
    selectedFolderId,
    onToggle,
    onOpenFile,
    onSelectFolder,
    onCreateFolder,
    onCreateFile,
    onDeleteNode
  } = $props<{
    node: WorkspaceNode;
    nodes: WorkspaceNode[];
    depth: number;
    expanded: Record<string, boolean>;
    activeFileId: string | null;
    selectedFolderId: string | null;
    onToggle: (id: string) => void;
    onOpenFile: (node: WorkspaceNode) => void;
    onSelectFolder: (node: WorkspaceNode) => void;
    onCreateFolder: (node: WorkspaceNode) => void;
    onCreateFile: (node: WorkspaceNode) => void;
    onDeleteNode: (node: WorkspaceNode) => void;
  }>();

  const children = $derived(
    nodes
      .filter((child) => child.parentId === node.id)
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
  );

  const isExpanded = $derived(expanded[node.id] ?? depth === 0);
  const displayName = node.ext ? `${node.name}.${node.ext}` : node.name;
  const isActiveFile = $derived(activeFileId === node.id);
  const isSelectedFolder = $derived(selectedFolderId === node.id);
  const paddingLeft = `${depth * 12 + 8}px`;
  const canDelete = node.parentId !== null;
</script>

<li>
  <div
    class={[
      'group flex items-center gap-1 rounded-md px-2 py-1 text-sm text-foreground/80 hover:bg-muted',
      node.type === 'file' && isActiveFile && 'bg-muted text-foreground',
      node.type === 'folder' && isSelectedFolder && 'bg-muted text-foreground'
    ]}
    style={`padding-left: ${paddingLeft}`}> 
    {#if node.type === 'folder'}
      <button
        class="rounded-sm p-0.5 text-foreground/60 hover:text-foreground"
        type="button"
        aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
        onclick={() => onToggle(node.id)}>
        {#if isExpanded}
          <ChevronDown class="size-3.5" />
        {:else}
          <ChevronRight class="size-3.5" />
        {/if}
      </button>
      <Folder class="size-4 text-foreground/70" />
      <button
        type="button"
        class="flex-1 truncate text-left"
        onclick={() => {
          onSelectFolder(node);
          onToggle(node.id);
        }}>
        {displayName}
      </button>
      <div class="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          class="rounded-sm p-1 text-foreground/60 hover:text-foreground"
          aria-label="New folder"
          onclick={() => onCreateFolder(node)}>
          <FolderPlus class="size-3.5" />
        </button>
        <button
          type="button"
          class="rounded-sm p-1 text-foreground/60 hover:text-foreground"
          aria-label="New file"
          onclick={() => onCreateFile(node)}>
          <FilePlus class="size-3.5" />
        </button>
        <button
          type="button"
          class="rounded-sm p-1 text-foreground/60 hover:text-foreground disabled:opacity-40"
          aria-label="Delete folder"
          onclick={() => onDeleteNode(node)}
          disabled={!canDelete}>
          <Trash2 class="size-3.5" />
        </button>
      </div>
    {:else}
      <span class="size-3.5"></span>
      <FileText class="size-4 text-foreground/70" />
      <button
        type="button"
        class="flex-1 truncate text-left"
        onclick={() => onOpenFile(node)}>
        {displayName}
      </button>
      <div class="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          class="rounded-sm p-1 text-foreground/60 hover:text-foreground disabled:opacity-40"
          aria-label="Delete file"
          onclick={() => onDeleteNode(node)}
          disabled={!canDelete}>
          <Trash2 class="size-3.5" />
        </button>
      </div>
    {/if}
  </div>

  {#if node.type === 'folder' && isExpanded && children.length}
    <ul>
      {#each children as child (child.id)}
        <WorkspaceTreeNode
          node={child}
          nodes={nodes}
          depth={depth + 1}
          expanded={expanded}
          activeFileId={activeFileId}
          selectedFolderId={selectedFolderId}
          onToggle={onToggle}
          onOpenFile={onOpenFile}
          onSelectFolder={onSelectFolder}
          onCreateFolder={onCreateFolder}
          onCreateFile={onCreateFile}
          onDeleteNode={onDeleteNode} />
      {/each}
    </ul>
  {/if}
</li>
