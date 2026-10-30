import type { DatePreset, FilterSpec, SortKey } from '@/features/filters/spec';

export type DeckQuery = {
  // SQL over `assets a LEFT JOIN decisions d ON d.asset_id = a.id`.
  where: string;
  orderBy: string;
  params: Record<string, string | number>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Session id used when counting matches outside any session (the filter sheet).
export const NO_SESSION = -1;

const REVIEW_CLAUSES = {
  // Undecided, plus anything skipped in an earlier session.
  unreviewed: `(d.asset_id IS NULL OR (d.decision = 'skip' AND d.session_id IS NOT $sessionId))`,
  skipped: `(d.decision = 'skip' AND d.session_id IS NOT $sessionId)`,
  // Revisiting "keep"; once re-decided in this session the item drops out.
  kept: `(d.decision = 'keep' AND d.session_id IS NOT $sessionId)`,
};

const ALBUM_TITLE = `(SELECT MIN(al.title) FROM asset_albums aa JOIN albums al ON al.id = aa.album_id
  WHERE aa.asset_id = a.id)`;

const ORDER_BY: Record<SortKey, string> = {
  newest: 'a.creation_time DESC, a.id DESC',
  oldest: 'a.creation_time IS NULL, a.creation_time ASC, a.id ASC',
  // Unmeasured items go last; they move up as background size measurement catches up.
  largest: 'a.size IS NULL, a.size DESC, a.creation_time DESC',
  longest: 'a.duration IS NULL, a.duration DESC, a.creation_time DESC',
  random: 'random()',
  album: `${ALBUM_TITLE} IS NULL, ${ALBUM_TITLE} COLLATE NOCASE, a.creation_time DESC`,
};

/** Translates a filter spec into SQL. Pure, so it can be tested without a device. */
export function buildDeckQuery(spec: FilterSpec, sessionId: number, now = Date.now()): DeckQuery {
  const clauses = [REVIEW_CLAUSES[spec.review]];
  const params: DeckQuery['params'] = { $sessionId: sessionId };

  if (spec.mediaType !== 'all') {
    clauses.push('a.media_type = $mediaType');
    params.$mediaType = spec.mediaType;
  }
  if (!spec.includeFavorites) clauses.push('a.is_favorite = 0');
  if (spec.screenshotsOnly) clauses.push('a.is_screenshot = 1');

  const { from, to } = dateRange(spec.date, now);
  if (from !== null) {
    clauses.push('a.creation_time >= $dateFrom');
    params.$dateFrom = from;
  }
  if (to !== null) {
    clauses.push('a.creation_time < $dateTo');
    params.$dateTo = to;
  }

  if (spec.minSizeBytes) {
    clauses.push('a.size >= $minSize');
    params.$minSize = spec.minSizeBytes;
  }
  if (spec.minDurationMs) {
    clauses.push(`a.media_type = 'video' AND a.duration >= $minDuration`);
    params.$minDuration = spec.minDurationMs;
  }

  if (spec.orientation === 'portrait') clauses.push('a.height > a.width');
  if (spec.orientation === 'landscape') clauses.push('a.width > a.height');
  if (spec.orientation === 'square') clauses.push('a.width = a.height');

  if (spec.extensions.length) {
    clauses.push('a.ext IN (SELECT value FROM json_each($extensions))');
    params.$extensions = JSON.stringify(spec.extensions);
  }
  if (spec.albumIds.length) {
    clauses.push(`EXISTS (SELECT 1 FROM asset_albums aa WHERE aa.asset_id = a.id
      AND aa.album_id IN (SELECT value FROM json_each($albumIds)))`);
    params.$albumIds = JSON.stringify(spec.albumIds);
  }
  if (spec.excludeCloud) clauses.push('COALESCE(a.in_cloud, 0) = 0');

  return { where: clauses.join('\n  AND '), orderBy: ORDER_BY[spec.sort], params };
}

function dateRange(preset: DatePreset, now: number): { from: number | null; to: number | null } {
  const date = new Date(now);
  switch (preset) {
    case 'any':
      return { from: null, to: null };
    case 'thisMonth':
      return { from: new Date(date.getFullYear(), date.getMonth(), 1).getTime(), to: null };
    case 'last30':
      return { from: now - 30 * DAY_MS, to: null };
    case 'thisYear':
      return { from: new Date(date.getFullYear(), 0, 1).getTime(), to: null };
    case 'olderThan1y':
      return { from: null, to: new Date(date.getFullYear() - 1, date.getMonth(), date.getDate()).getTime() };
    case 'olderThan2y':
      return { from: null, to: new Date(date.getFullYear() - 2, date.getMonth(), date.getDate()).getTime() };
  }
}
