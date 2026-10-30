import {
  Album,
  AssetField,
  MediaSubtype,
  MediaType,
  Query,
  type AssetMetadata,
} from 'expo-media-library';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { create } from 'zustand';

import {
  markScreenshotsFromAlbums,
  sweepStaleRows,
  upsertAlbum,
  upsertAssets,
  type AssetRow,
} from '@/db/assets';
import { getSetting, setSetting } from '@/db/settings';

const PAGE_SIZE = 500;
const LAST_SCAN_KEY = 'lastScan';

export type ScanSummary = {
  finishedAt: number;
  // Asset metadata pass only; the deck can start once this is done.
  assetsMs: number;
  durationMs: number;
  count: number;
};

type IndexState = {
  scanning: boolean;
  scanned: number;
  lastScan: ScanSummary | null;
  error: string | null;
  // Bumped after every successful scan so screens know to re-query.
  version: number;
};

export const useIndexStatus = create<IndexState>(() => ({
  scanning: false,
  scanned: 0,
  lastScan: null,
  error: null,
  version: 0,
}));

let running: Promise<void> | null = null;
let rerunRequested = false;

/**
 * Re-indexes the library. Calls made while a scan is running are coalesced into a single follow-up
 * scan, so it is safe to call from every change event and foreground transition.
 */
export function requestScan(db: SQLiteDatabase): Promise<void> {
  if (running) {
    rerunRequested = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        rerunRequested = false;
        await scanLibrary(db);
      } while (rerunRequested);
    } finally {
      running = null;
    }
  })();
  return running;
}

export async function loadLastScan(db: SQLiteDatabase) {
  const lastScan = await getSetting<ScanSummary>(db, LAST_SCAN_KEY);
  useIndexStatus.setState({ lastScan });
}

async function scanLibrary(db: SQLiteDatabase) {
  const startedAt = Date.now();
  // Monotonic per scan; rows not stamped with it at the end were not seen and get swept.
  const scanId = startedAt;
  useIndexStatus.setState({ scanning: true, scanned: 0, error: null });

  try {
    let offset = 0;
    for (;;) {
      const page = await new Query()
        .within(AssetField.MEDIA_TYPE, [MediaType.IMAGE, MediaType.VIDEO])
        .orderBy({ key: AssetField.CREATION_TIME, ascending: false })
        .limit(PAGE_SIZE)
        .offset(offset)
        .exeForMetadata();

      await db.withTransactionAsync(() => upsertAssets(db, page.map(toAssetRow), scanId));
      offset += page.length;
      useIndexStatus.setState({ scanned: offset });
      if (page.length < PAGE_SIZE) break;
    }

    const assetsMs = Date.now() - startedAt;
    await indexAlbums(db, scanId);
    await db.withTransactionAsync(async () => {
      if (Platform.OS === 'android') await markScreenshotsFromAlbums(db);
      await sweepStaleRows(db, scanId);
    });

    const lastScan: ScanSummary = {
      finishedAt: Date.now(),
      assetsMs,
      durationMs: Date.now() - startedAt,
      count: offset,
    };
    await setSetting(db, LAST_SCAN_KEY, lastScan);
    useIndexStatus.setState((state) => ({
      scanning: false,
      lastScan,
      version: state.version + 1,
    }));
  } catch (error) {
    useIndexStatus.setState({
      scanning: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function indexAlbums(db: SQLiteDatabase, scanId: number) {
  const albums = await Album.getAlbumsMetadata();
  for (const album of albums) {
    const assets = await new Query().album(new Album(album.id)).exeForMetadata();
    await db.withTransactionAsync(() =>
      upsertAlbum(
        db,
        album,
        assets.map((asset) => asset.id),
        scanId
      )
    );
  }
}

function toAssetRow(asset: AssetMetadata): AssetRow {
  const filename = asset.filename;
  const dot = filename?.lastIndexOf('.') ?? -1;
  return {
    id: asset.id,
    mediaType: asset.mediaType === MediaType.VIDEO ? 'video' : 'image',
    filename,
    ext: filename && dot > 0 ? filename.slice(dot + 1).toLowerCase() : null,
    width: asset.width,
    height: asset.height,
    duration: asset.duration,
    creationTime: asset.creationTime,
    modificationTime: asset.modificationTime,
    isFavorite: asset.isFavorite,
    isScreenshot: asset.mediaSubtypes?.includes(MediaSubtype.SCREENSHOT) ?? false,
    subtypes: asset.mediaSubtypes?.length ? asset.mediaSubtypes.join(',') : null,
  };
}
