import Database from 'better-sqlite3';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync } from 'fs';

const baseDir = join(homedir(), '.ticket-tui');
mkdirSync(baseDir, { recursive: true });

const dbPath = join(baseDir, 'cache.db');
const db = new Database(dbPath) as any;

// Better concurrency for read-heavy usage
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS cache (
    namespace TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (namespace, key)
  );

  CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache (expires_at);

  CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    meta TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(kind, key)
  );

  CREATE TABLE IF NOT EXISTS recents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    meta TEXT,
    accessed_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_recents_kind ON recents (kind, accessed_at);
`);

export { db, dbPath };
