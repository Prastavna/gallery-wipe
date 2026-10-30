import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Chip, ChipGroup } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { countDeckItems } from '@/db/decisions';
import {
  countUnmeasured,
  getAlbumOptions,
  getExtensionOptions,
  type AlbumOption,
  type ExtensionOption,
} from '@/db/filter-options';
import { buildDeckQuery, NO_SESSION } from '@/features/filters/query';
import {
  countActiveFilters,
  DATE_LABELS,
  DEFAULT_FILTERS,
  isDefaultFilters,
  SORT_LABELS,
  type DatePreset,
  type FilterSpec,
  type SortKey,
} from '@/features/filters/spec';
import { useFilters } from '@/features/filters/store';
import { useSizeEnrichment } from '@/features/media/size-enrichment';
import { useTheme } from '@/hooks/use-theme';
import { numberFormat } from '@/utils/format';

const MB = 1_000_000;
const ALBUMS_COLLAPSED = 8;

// Screenshots are a kind of photo, but people look for them as their own thing.
type Kind = 'all' | 'image' | 'video' | 'screenshots';

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'all', label: 'Everything' },
  { value: 'image', label: 'Photos' },
  { value: 'video', label: 'Videos' },
  { value: 'screenshots', label: 'Screenshots' },
];
const DATE_OPTIONS = (Object.keys(DATE_LABELS) as DatePreset[]).map((value) => ({ value, label: DATE_LABELS[value] }));
const SIZE_OPTIONS = [
  { value: null, label: 'Any size' },
  { value: 5 * MB, label: '5 MB+' },
  { value: 25 * MB, label: '25 MB+' },
  { value: 100 * MB, label: '100 MB+' },
  { value: 500 * MB, label: '500 MB+' },
];
const DURATION_OPTIONS = [
  { value: null, label: 'Any length' },
  { value: 30_000, label: '30 s+' },
  { value: 60_000, label: '1 min+' },
  { value: 5 * 60_000, label: '5 min+' },
];
const ORIENTATION_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'square', label: 'Square' },
] as const;
const REVIEW_OPTIONS = [
  { value: 'unreviewed', label: 'Not reviewed' },
  { value: 'skipped', label: 'Saved for later' },
  { value: 'kept', label: 'Previously kept' },
] as const;
const LIMIT_OPTIONS = [
  { value: null, label: 'Everything' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
];

function kindOf(spec: FilterSpec): Kind {
  return spec.screenshotsOnly ? 'screenshots' : spec.mediaType;
}

/**
 * Switching what to show also drops filters that can no longer match, so a hidden setting never
 * leaves the deck silently empty (a video length while showing photos, say).
 */
function patchForKind(kind: Kind, spec: FilterSpec): Partial<FilterSpec> {
  const photosOnly = kind === 'image' || kind === 'screenshots';
  return {
    mediaType: kind === 'screenshots' ? 'image' : kind,
    screenshotsOnly: kind === 'screenshots',
    minDurationMs: kind === 'video' ? spec.minDurationMs : null,
    sort: photosOnly && spec.sort === 'longest' ? 'newest' : spec.sort,
  };
}

export default function FiltersScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const saved = useFilters((state) => state.spec);
  const apply = useFilters((state) => state.apply);
  const measuring = useSizeEnrichment((state) => state.running);
  const [draft, setDraft] = useState<FilterSpec>(saved);
  const [matches, setMatches] = useState<number | null>(null);
  const [albums, setAlbums] = useState<AlbumOption[]>([]);
  const [extensions, setExtensions] = useState<ExtensionOption[]>([]);
  const [unmeasured, setUnmeasured] = useState(0);
  const [showAllAlbums, setShowAllAlbums] = useState(false);

  useEffect(() => {
    getAlbumOptions(db).then(setAlbums);
    getExtensionOptions(db).then(setExtensions);
  }, [db]);

  // Live match count; also re-checks how many sizes are still unknown while measurement runs.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const [count, pending] = await Promise.all([
        countDeckItems(db, buildDeckQuery(draft, NO_SESSION)),
        countUnmeasured(db),
      ]);
      if (cancelled) return;
      setMatches(draft.limit ? Math.min(count, draft.limit) : count);
      setUnmeasured(pending);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [db, draft, measuring]);

  function update(patch: Partial<FilterSpec>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function toggleIn(list: string[], value: string) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  // Swiping the sheet away or pressing back keeps the changes too; only a deck with no matches is dropped.
  const latest = useRef({ draft, matches });
  useEffect(() => {
    latest.current = { draft, matches };
  }, [draft, matches]);
  useEffect(
    () => () => {
      const { draft: final, matches: finalMatches } = latest.current;
      if (finalMatches === 0) return;
      if (JSON.stringify(final) === JSON.stringify(useFilters.getState().spec)) return;
      useFilters.getState().apply(db, final);
    },
    [db]
  );

  async function onApply() {
    await apply(db, draft);
    router.back();
  }

  const kind = kindOf(draft);
  const active = countActiveFilters(draft);
  const dependsOnSize = draft.sort === 'largest' || draft.minSizeBytes !== null;
  const visibleAlbums = showAllAlbums ? albums : albums.slice(0, ALBUMS_COLLAPSED);
  const sortOptions = (Object.keys(SORT_LABELS) as SortKey[])
    .filter((value) => value !== 'longest' || kind === 'all' || kind === 'video')
    .map((value) => ({ value, label: SORT_LABELS[value] }));

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.titleRow, { borderBottomColor: theme.line }]}>
        <View style={styles.flex}>
          <ThemedText type="subtitle" accessibilityRole="header">
            Filters
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {active === 0 ? 'Showing everything not yet reviewed' : `${active} ${active === 1 ? 'filter' : 'filters'} on`}
          </ThemedText>
        </View>
        <Button
          title="Reset"
          variant="secondary"
          size="compact"
          disabled={isDefaultFilters(draft)}
          onPress={() => setDraft(DEFAULT_FILTERS)}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section title="Show">
          <ChipGroup options={KIND_OPTIONS} value={kind} onChange={(value) => update(patchForKind(value, draft))} />
        </Section>

        {(kind === 'all' || kind === 'video') && (
          <Section title="Video length" hint={kind === 'all' ? 'Picking a length shows only videos' : undefined}>
            <ChipGroup
              options={DURATION_OPTIONS}
              value={draft.minDurationMs}
              onChange={(minDurationMs) =>
                update(minDurationMs === null ? { minDurationMs } : { minDurationMs, ...patchForKind('video', draft) })
              }
            />
          </Section>
        )}

        <Section title="Date">
          <ChipGroup options={DATE_OPTIONS} value={draft.date} onChange={(date) => update({ date })} />
        </Section>

        <Section
          title="File size"
          hint={draft.minSizeBytes !== null && unmeasured > 0 ? 'Some sizes are still being measured' : undefined}>
          <ChipGroup options={SIZE_OPTIONS} value={draft.minSizeBytes} onChange={(minSizeBytes) => update({ minSizeBytes })} />
        </Section>

        <Section title="Orientation">
          <ChipGroup options={ORIENTATION_OPTIONS} value={draft.orientation} onChange={(orientation) => update({ orientation })} />
        </Section>

        <Section title="Review status">
          <ChipGroup options={REVIEW_OPTIONS} value={draft.review} onChange={(review) => update({ review })} />
        </Section>

        {albums.length > 0 && (
          <Section
            title="Albums"
            hint={draft.albumIds.length ? `${draft.albumIds.length} selected` : 'All albums'}
            action={
              draft.albumIds.length > 0 ? (
                <Button title="Clear" variant="secondary" size="compact" onPress={() => update({ albumIds: [] })} />
              ) : undefined
            }>
            <View style={styles.wrap}>
              {visibleAlbums.map((album) => (
                <Chip
                  key={album.id}
                  label={`${album.title} (${numberFormat.format(album.count)})`}
                  selected={draft.albumIds.includes(album.id)}
                  onPress={() => update({ albumIds: toggleIn(draft.albumIds, album.id) })}
                />
              ))}
              {albums.length > ALBUMS_COLLAPSED && (
                <Chip
                  label={showAllAlbums ? 'Show fewer' : `${albums.length - ALBUMS_COLLAPSED} more`}
                  selected={false}
                  onPress={() => setShowAllAlbums((value) => !value)}
                />
              )}
            </View>
          </Section>
        )}

        {extensions.length > 1 && (
          <Section title="File type" hint={draft.extensions.length ? undefined : 'Any type'}>
            <View style={styles.wrap}>
              {extensions.map((option) => (
                <Chip
                  key={option.ext}
                  label={`${option.ext.toUpperCase()} (${numberFormat.format(option.count)})`}
                  selected={draft.extensions.includes(option.ext)}
                  onPress={() => update({ extensions: toggleIn(draft.extensions, option.ext) })}
                />
              ))}
            </View>
          </Section>
        )}

        <Section title="Order">
          <ChipGroup options={sortOptions} value={draft.sort} onChange={(sort) => update({ sort })} />
        </Section>

        <Section title="Stop after" hint="Ends the session after this many decisions">
          <ChipGroup options={LIMIT_OPTIONS} value={draft.limit} onChange={(limit) => update({ limit })} />
        </Section>

        <Section title="More">
          <ToggleRow
            label="Include favorites"
            detail="Favorites are left out unless you turn this on."
            value={draft.includeFavorites}
            onChange={(includeFavorites) => update({ includeFavorites })}
          />
          {Platform.OS === 'ios' && (
            <ToggleRow
              label="Skip items stored only in iCloud"
              detail="These have to download before you can see them."
              value={draft.excludeCloud}
              onChange={(excludeCloud) => update({ excludeCloud })}
            />
          )}
        </Section>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.line, paddingBottom: insets.bottom + Spacing.three }]}>
        {matches === 0 ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            Nothing matches these filters. Remove one, or tap Reset.
          </ThemedText>
        ) : dependsOnSize && unmeasured > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {`Still measuring ${numberFormat.format(unmeasured)} items, so size results will grow.`}
          </ThemedText>
        ) : null}
        <Button
          title={matches === null ? 'Apply' : matches === 0 ? 'No matches' : `Show ${numberFormat.format(matches)} items`}
          disabled={matches === 0}
          onPress={onApply}
        />
      </View>
    </ThemedView>
  );
}

type SectionProps = { title: string; hint?: string; action?: ReactNode; children: ReactNode };

function Section({ title, hint, action, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.flex}>
          <ThemedText type="defaultBold" accessibilityRole="header">
            {title}
          </ThemedText>
          {hint ? (
            <ThemedText type="small" themeColor="textSecondary">
              {hint}
            </ThemedText>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

type ToggleRowProps = { label: string; detail: string; value: boolean; onChange: (value: boolean) => void };

function ToggleRow({ label, detail, value, onChange }: ToggleRowProps) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <ThemedText>{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 44,
  },
  footer: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
