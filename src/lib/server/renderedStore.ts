import { randomUUID } from 'node:crypto';

type Entry = {
  svg: string;
  createdAtMs: number;
  expiresAtMs: number;
};

const MAX_BYTES = 2 * 1024 * 1024; // 2 MiB
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ID_LENGTH = 128;

const store = new Map<string, Entry>();

const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

const cleanupExpired = (nowMs: number) => {
  for (const [id, entry] of store.entries()) {
    if (entry.expiresAtMs <= nowMs) {
      store.delete(id);
    }
  }
};

const validateId = (id: string) => {
  if (id.length === 0 || id.length > MAX_ID_LENGTH) {
    throw new Error(`Invalid id length (1-${MAX_ID_LENGTH}).`);
  }
  // Keep it URL-safe without forcing UUIDs.
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error('Invalid id format (allowed: A-Z a-z 0-9 . _ -).');
  }
};

export const putRenderedSvg = (svg: string, ttlMs: number = DEFAULT_TTL_MS, id?: string) => {
  const nowMs = Date.now();
  cleanupExpired(nowMs);

  const size = byteLength(svg);
  if (size > MAX_BYTES) {
    throw new Error(`SVG too large (${size} bytes). Max is ${MAX_BYTES} bytes.`);
  }

  const resolvedId = id ?? randomUUID();
  if (id) validateId(id);

  store.set(resolvedId, {
    svg,
    createdAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs
  });
  return { id: resolvedId, expiresAtMs: nowMs + ttlMs };
};

export const getRenderedSvg = (id: string) => {
  const nowMs = Date.now();
  cleanupExpired(nowMs);
  const entry = store.get(id);
  if (!entry) return;
  if (entry.expiresAtMs <= nowMs) {
    store.delete(id);
    return;
  }
  return entry;
};
