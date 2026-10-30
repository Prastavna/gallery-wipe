import type { SQLiteDatabase } from 'expo-sqlite';

// Each entry upgrades the schema by one version; never edit a shipped entry, append a new one.
// Times are epoch milliseconds and durations are milliseconds (what expo-media-library returns
// natively on both platforms, despite its type docs saying seconds).
const MIGRATIONS: string[] = [
  `
  CREATE TABLE assets (
    id                TEXT PRIMARY KEY NOT NULL,
    media_type        TEXT NOT NULL,
    filename          TEXT,
    ext               TEXT,
    width             INTEGER,
    height            INTEGER,
    duration          INTEGER,
    creation_time     INTEGER,
    modification_time INTEGER,
    is_favorite       INTEGER NOT NULL DEFAULT 0,
    is_screenshot     INTEGER NOT NULL DEFAULT 0,
    subtypes          TEXT,
    size              INTEGER,
    in_cloud          INTEGER,
    enriched_at       INTEGER,
    scan_id           INTEGER NOT NULL
  );
  CREATE INDEX assets_creation_time ON assets (creation_time);
  CREATE INDEX assets_media_type_creation_time ON assets (media_type, creation_time);
  CREATE INDEX assets_size ON assets (size);

  CREATE TABLE albums (
    id      TEXT PRIMARY KEY NOT NULL,
    title   TEXT NOT NULL,
    scan_id INTEGER NOT NULL
  );

  CREATE TABLE asset_albums (
    asset_id TEXT NOT NULL,
    album_id TEXT NOT NULL,
    PRIMARY KEY (asset_id, album_id)
  ) WITHOUT ROWID;
  CREATE INDEX asset_albums_album_id ON asset_albums (album_id);

  CREATE TABLE sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    filter_spec TEXT NOT NULL,
    started_at  INTEGER NOT NULL,
    ended_at    INTEGER,
    kept        INTEGER NOT NULL DEFAULT 0,
    trashed     INTEGER NOT NULL DEFAULT 0,
    skipped     INTEGER NOT NULL DEFAULT 0,
    bytes_freed INTEGER NOT NULL DEFAULT 0
  );

  -- No foreign key to assets on purpose: a partial scan (limited access, library churn) must
  -- never wipe a user's "keep" history. Rows for deleted assets are removed on commit.
  CREATE TABLE decisions (
    asset_id   TEXT PRIMARY KEY NOT NULL,
    decision   TEXT NOT NULL CHECK (decision IN ('keep', 'trash', 'skip')),
    decided_at INTEGER NOT NULL,
    session_id INTEGER
  );
  CREATE INDEX decisions_decision ON decisions (decision);

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
  `,
];

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  for (let version = currentVersion; version < MIGRATIONS.length; version++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
