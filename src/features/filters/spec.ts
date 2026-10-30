export type MediaFilter = 'all' | 'image' | 'video';
export type DatePreset = 'any' | 'thisMonth' | 'last30' | 'thisYear' | 'olderThan1y' | 'olderThan2y';
export type Orientation = 'any' | 'portrait' | 'landscape' | 'square';
// 'any' ignores decisions entirely; used by the Library grid, not offered for decks.
export type ReviewState = 'unreviewed' | 'skipped' | 'kept' | 'any';
export type SortKey = 'newest' | 'oldest' | 'largest' | 'longest' | 'random' | 'album';

/** Everything that decides which items a deck shows and in what order. Stored with each session. */
export type FilterSpec = {
  mediaType: MediaFilter;
  date: DatePreset;
  // Empty means every album.
  albumIds: string[];
  minSizeBytes: number | null;
  // Milliseconds; when set, only videos can match.
  minDurationMs: number | null;
  screenshotsOnly: boolean;
  includeFavorites: boolean;
  orientation: Orientation;
  // Lowercase file extensions; empty means any.
  extensions: string[];
  review: ReviewState;
  // iOS only: skip items that would have to be downloaded from iCloud to preview.
  excludeCloud: boolean;
  sort: SortKey;
  // Ends the session after this many decisions ("Random 50").
  limit: number | null;
};

export const DEFAULT_FILTERS: FilterSpec = {
  mediaType: 'all',
  date: 'any',
  albumIds: [],
  minSizeBytes: null,
  minDurationMs: null,
  screenshotsOnly: false,
  includeFavorites: false,
  orientation: 'any',
  extensions: [],
  review: 'unreviewed',
  excludeCloud: false,
  sort: 'newest',
  limit: null,
};

export type Preset = {
  key: string;
  title: string;
  subtitle: string;
  spec: FilterSpec;
};

export const PRESETS: Preset[] = [
  {
    key: 'biggest-videos',
    title: 'Biggest videos',
    subtitle: 'Largest first',
    spec: { ...DEFAULT_FILTERS, mediaType: 'video', sort: 'largest' },
  },
  {
    key: 'screenshots',
    title: 'Screenshots',
    subtitle: 'Oldest first',
    spec: { ...DEFAULT_FILTERS, screenshotsOnly: true, sort: 'oldest' },
  },
  {
    key: 'old',
    title: 'Old stuff',
    subtitle: 'Over 2 years old',
    spec: { ...DEFAULT_FILTERS, date: 'olderThan2y', sort: 'oldest' },
  },
  {
    key: 'this-month',
    title: 'This month',
    subtitle: 'Newest first',
    spec: { ...DEFAULT_FILTERS, date: 'thisMonth' },
  },
  {
    key: 'random',
    title: 'Random 50',
    subtitle: 'A quick session',
    spec: { ...DEFAULT_FILTERS, sort: 'random', limit: 50 },
  },
];

export const DATE_LABELS: Record<DatePreset, string> = {
  any: 'Any time',
  thisMonth: 'This month',
  last30: 'Last 30 days',
  thisYear: 'This year',
  olderThan1y: 'Over 1 year old',
  olderThan2y: 'Over 2 years old',
};

export const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  largest: 'Largest first',
  longest: 'Longest videos first',
  random: 'Random',
  album: 'By album',
};

/** Fills in fields added after a spec was saved, so old sessions and settings keep working. */
export function normalizeFilters(saved: Partial<FilterSpec> | null | undefined): FilterSpec {
  const spec = { ...DEFAULT_FILTERS, ...saved };
  // Older versions could keep a video length while showing only photos, which matches nothing.
  const photosOnly = spec.mediaType === 'image' || spec.screenshotsOnly;
  return photosOnly && spec.minDurationMs !== null ? { ...spec, minDurationMs: null } : spec;
}

/** Short human summary, e.g. "Videos, over 2 years old, largest first". */
export function describeFilters(spec: FilterSpec): string {
  const parts: string[] = [];
  if (spec.screenshotsOnly) parts.push('Screenshots');
  else if (spec.mediaType !== 'all') parts.push(spec.mediaType === 'video' ? 'Videos' : 'Photos');
  else parts.push('Photos & videos');
  if (spec.date !== 'any') parts.push(DATE_LABELS[spec.date]);
  if (spec.minSizeBytes) parts.push(`Over ${Math.round(spec.minSizeBytes / 1_000_000)} MB`);
  if (spec.minDurationMs) parts.push(`Over ${Math.round(spec.minDurationMs / 1000)} s`);
  if (spec.albumIds.length) parts.push(`${spec.albumIds.length} album${spec.albumIds.length > 1 ? 's' : ''}`);
  if (spec.orientation !== 'any') parts.push(spec.orientation[0].toUpperCase() + spec.orientation.slice(1));
  if (spec.extensions.length) parts.push(spec.extensions.map((ext) => ext.toUpperCase()).join('/'));
  if (spec.review === 'skipped') parts.push('Saved for later');
  if (spec.review === 'kept') parts.push('Previously kept');
  if (spec.includeFavorites) parts.push('Incl. favorites');
  parts.push(spec.limit ? `${SORT_LABELS[spec.sort]}, ${spec.limit} items` : SORT_LABELS[spec.sort]);
  return parts.map((part, index) => (index === 0 ? part : lowerFirst(part))).join(', ');
}

// "Over 2 years old" reads "over 2 years old" mid-sentence; acronyms like "JPG" stay as they are.
function lowerFirst(text: string) {
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

/** How many filters narrow the deck; sort order doesn't count, a session size does. */
export function countActiveFilters(spec: FilterSpec): number {
  return [
    spec.mediaType !== DEFAULT_FILTERS.mediaType || spec.screenshotsOnly,
    spec.date !== DEFAULT_FILTERS.date,
    spec.albumIds.length > 0,
    spec.minSizeBytes !== null,
    spec.minDurationMs !== null,
    spec.includeFavorites !== DEFAULT_FILTERS.includeFavorites,
    spec.orientation !== DEFAULT_FILTERS.orientation,
    spec.extensions.length > 0,
    spec.review !== DEFAULT_FILTERS.review,
    spec.excludeCloud !== DEFAULT_FILTERS.excludeCloud,
    spec.limit !== null,
  ].filter(Boolean).length;
}

export function isDefaultFilters(spec: FilterSpec): boolean {
  return countActiveFilters(spec) === 0 && spec.sort === DEFAULT_FILTERS.sort;
}
