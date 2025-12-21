import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type WorkspaceLanguage = 'mermaid' | 'likec4';

export type WorkspaceRecord = {
  id: string;
  name: string;
  language: WorkspaceLanguage;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceNodeRecord = {
  id: string;
  workspaceId: string;
  parentId: string | null;
  type: 'folder' | 'file';
  name: string;
  ext: string | null;
  createdAt: string;
  updatedAt: string;
};

let db: Database.Database | null = null;

const resolveSqlitePath = (dbUrl?: string): string => {
  if (!dbUrl) {
    return env.WORKSPACE_DB_PATH ?? 'data/workspaces.db';
  }
  if (!dbUrl.startsWith('sqlite:')) {
    throw new Error(
      'Unsupported WORKSPACE_DB_URL. Only sqlite: URLs are supported for now (e.g. sqlite:./data/workspaces.db).'
    );
  }
  let pathValue = dbUrl.slice('sqlite:'.length);
  if (pathValue.startsWith('//')) {
    pathValue = pathValue.slice(2);
  }
  const stripped = pathValue.split('?')[0]?.split('#')[0] ?? '';
  return stripped || 'data/workspaces.db';
};

const normalizeDbPath = (dbPath: string): string => {
  let normalized = dbPath.trim();
  if (normalized.startsWith('~/')) {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    normalized = home ? path.join(home, normalized.slice(2)) : normalized;
  }
  if (normalized.endsWith(path.sep)) {
    normalized = path.join(normalized, 'workspaces.db');
  }
  return normalized;
};

const getDbPath = (): string => {
  const dbUrl = env.WORKSPACE_DB_URL ?? env.DATABASE_URL;
  return resolveSqlitePath(dbUrl);
};

const migrate = (database: Database.Database): void => {
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      language TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workspace_nodes (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      parent_id TEXT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      ext TEXT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES workspace_nodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS file_contents (
      file_id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (file_id) REFERENCES workspace_nodes(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_workspace_nodes_workspace_id
      ON workspace_nodes(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_workspace_nodes_parent_id
      ON workspace_nodes(parent_id);
  `);
};

export const getDb = (): Database.Database => {
  if (db) return db;

  const dbPath = normalizeDbPath(getDbPath());
  const resolved = path.resolve(dbPath);
  const directory = path.dirname(resolved);
  try {
    fs.mkdirSync(directory, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create workspace db directory "${directory}": ${message}`);
  }

  try {
    db = new Database(resolved);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to open workspace db at "${resolved}": ${message}`);
  }
  migrate(db);
  return db;
};

const mapWorkspace = (row: any): WorkspaceRecord => ({
  id: row.id,
  name: row.name,
  language: row.language,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const mapNode = (row: any): WorkspaceNodeRecord => ({
  id: row.id,
  workspaceId: row.workspace_id,
  parentId: row.parent_id,
  type: row.type,
  name: row.name,
  ext: row.ext,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export const listWorkspaces = (): WorkspaceRecord[] => {
  const database = getDb();
  const rows = database
    .prepare('SELECT * FROM workspaces ORDER BY updated_at DESC')
    .all();
  return rows.map(mapWorkspace);
};

export const createWorkspace = ({
  name,
  language
}: {
  name: string;
  language: WorkspaceLanguage;
}): { workspace: WorkspaceRecord; rootNode: WorkspaceNodeRecord } => {
  const database = getDb();
  const now = new Date().toISOString();
  const workspaceId = crypto.randomUUID();
  const rootId = crypto.randomUUID();

  database
    .prepare(
      'INSERT INTO workspaces (id, name, language, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(workspaceId, name, language, now, now);

  database
    .prepare(
      'INSERT INTO workspace_nodes (id, workspace_id, parent_id, type, name, ext, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(rootId, workspaceId, null, 'folder', name, null, now, now);

  return {
    workspace: {
      id: workspaceId,
      name,
      language,
      createdAt: now,
      updatedAt: now
    },
    rootNode: {
      id: rootId,
      workspaceId,
      parentId: null,
      type: 'folder',
      name,
      ext: null,
      createdAt: now,
      updatedAt: now
    }
  };
};

export const getWorkspace = (workspaceId: string): WorkspaceRecord | null => {
  const database = getDb();
  const row = database.prepare('SELECT * FROM workspaces WHERE id = ?').get(workspaceId);
  return row ? mapWorkspace(row) : null;
};

export const listNodes = (workspaceId: string): WorkspaceNodeRecord[] => {
  const database = getDb();
  const rows = database
    .prepare('SELECT * FROM workspace_nodes WHERE workspace_id = ? ORDER BY type, name')
    .all(workspaceId);
  return rows.map(mapNode);
};

export const getNode = (nodeId: string): WorkspaceNodeRecord | null => {
  const database = getDb();
  const row = database.prepare('SELECT * FROM workspace_nodes WHERE id = ?').get(nodeId);
  return row ? mapNode(row) : null;
};

export const createNode = ({
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
}): WorkspaceNodeRecord => {
  const database = getDb();
  const now = new Date().toISOString();
  const nodeId = crypto.randomUUID();

  database
    .prepare(
      'INSERT INTO workspace_nodes (id, workspace_id, parent_id, type, name, ext, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(nodeId, workspaceId, parentId, type, name, ext, now, now);

  if (type === 'file') {
    database
      .prepare('INSERT INTO file_contents (file_id, content, updated_at) VALUES (?, ?, ?)')
      .run(nodeId, '', now);
  }

  return {
    id: nodeId,
    workspaceId,
    parentId,
    type,
    name,
    ext,
    createdAt: now,
    updatedAt: now
  };
};

export const deleteNode = (nodeId: string): void => {
  const database = getDb();
  database.prepare('DELETE FROM workspace_nodes WHERE id = ?').run(nodeId);
};

export const deleteWorkspace = (workspaceId: string): void => {
  const database = getDb();
  database.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId);
};

export const getFileContent = (fileId: string): { content: string; updatedAt: string } | null => {
  const database = getDb();
  const row = database
    .prepare('SELECT content, updated_at FROM file_contents WHERE file_id = ?')
    .get(fileId);
  if (!row) return null;
  return { content: row.content, updatedAt: row.updated_at };
};

export const updateFileContent = ({
  fileId,
  content
}: {
  fileId: string;
  content: string;
}): { updatedAt: string } => {
  const database = getDb();
  const now = new Date().toISOString();
  database
    .prepare('UPDATE file_contents SET content = ?, updated_at = ? WHERE file_id = ?')
    .run(content, now, fileId);
  database
    .prepare('UPDATE workspace_nodes SET updated_at = ? WHERE id = ?')
    .run(now, fileId);
  return { updatedAt: now };
};

export const isNodeInWorkspace = ({
  workspaceId,
  nodeId
}: {
  workspaceId: string;
  nodeId: string;
}): boolean => {
  const database = getDb();
  const row = database
    .prepare('SELECT 1 FROM workspace_nodes WHERE id = ? AND workspace_id = ?')
    .get(nodeId, workspaceId);
  return Boolean(row);
};
