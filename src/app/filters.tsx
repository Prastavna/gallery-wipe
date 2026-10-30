import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState, type ReactNode } from 'react';
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
  DATE_LABELS,
  DEFAULT_FILTERS,
  SORT_LABELS,
  type DatePreset,
  type FilterSpec,
  type SortKey,
} from '@/features/filters/spec';
import { useFilters } from '@/features/filters/store';
import { useSizeEnrichment } from '@/features/media/size-enrichment';
import { numberFormat } from '@/utils/format';

const MB = 1_000_000;
const ALBUMS_COLLAPSED = 8;

const MEDIA_OPTIONS = [
  { value: 'all', label: 'Everything' },
  { value: 'image', label: 'Photos' },
  { value: 'video', label: 'Videos' },
] as const;
const DATE_OPTIONS = (Object.keys(DATE_LABELS) as DatePreset[]).map((value) => ({ value, label: DATE_LABELS[value] }));
const SORT_OPTIONS = (Object.keys(SORT_LABELS) as SortKey[]).map((value) => ({ value, label: SORT_LABELS[value] }));
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

export default function FiltersScreen() {
  const db = useSQLiteContext();
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
      setMatches(count);
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

  async function onApply() {
    await apply(db, draft);
    router.back();
  }

  const dependsOnSize = draft.sort === 'largest' || draft.minSizeBytes !== null;
  const visibleAlbums = showAllAlbums ? albums : albums.slice(0, ALBUMS_COLLAPSED);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <ThemedText type="subtitle">Filters</ThemedText>
          <Button
            title="Reset"
            variant="secondary"
            onPress={() => setDraft({ ...DEFAULT_FILTERS, sort: draft.sort })}
          />
        </View>

        <Section title="Show">
          <ChipGroup options={MEDIA_OPTIONS} value={draft.mediaType} onChange={(mediaType) => update({ mediaType })} />
        </Section>

        <Section title="Sort">
          <ChipGroup options={SORT_OPTIONS} value={draft.sort} onChange={(sort) => update({ sort })} />
        </Section>

        <Section title="Date">
          <ChipGroup options={DATE_OPTIONS} value={draft.date} onChange={(date) => update({ date })} />
        </Section>

        <Section title="File size">
          <ChipGroup options={SIZE_OPTIONS} value={draft.minSizeBytes} onChange={(minSizeBytes) => update({ minSizeBytes })} />
        </Section>

        {draft.mediaType !== 'image' && (
          <Section title="Video length">
            <ChipGroup
              options={DURATION_OPTIONS}
              value={draft.minDurationMs}
              onChange={(minDurationMs) => update({ minDurationMs })}
            />
          </Section>
        )}

        <Section title="Orientation">
          <ChipGroup options={ORIENTATION_OPTIONS} value={draft.orientation} onChange={(orientation) => update({ orientation })} />
        </Section>

        <Section title="Review status">
          <ChipGroup options={REVIEW_OPTIONS} value={draft.review} onChange={(review) => update({ review })} />
        </Section>

        {albums.length > 0 && (
          <Section title="Albums" hint={draft.albumIds.length ? undefined : 'All albums'}>
            <View style={styles.wrap}>
              {visibleAlbums.map((album) => (
                <Chip
                  key={album.id}
                  label={`${album.title} · ${numberFormat.format(album.count)}`}
                  selected={draft.albumIds.includes(album.id)}
                  onPress={() => update({ albumIds: toggleIn(draft.albumIds, album.id) })}
                />
              ))}
              {albums.length > ALBUMS_COLLAPSED && (
                <Chip
                  label={showAllAlbums ? 'Show fewer' : `+${albums.length - ALBUMS_COLLAPSED} more`}
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
                  label={`${option.ext.toUpperCase()} · ${numberFormat.format(option.count)}`}
                  selected={draft.extensions.includes(option.ext)}
                  onPress={() => update({ extensions: toggleIn(draft.extensions, option.ext) })}
                />
              ))}
            </View>
          </Section>
        )}

        <Section title="More">
          <ToggleRow
            label="Screenshots only"
            value={draft.screenshotsOnly}
            onChange={(screenshotsOnly) => update({ screenshotsOnly })}
          />
          <ToggleRow
            label="Include favorites"
            value={draft.includeFavorites}
            onChange={(includeFavorites) => update({ includeFavorites })}
          />
          {Platform.OS === 'ios' && (
            <ToggleRow
              label="Skip items stored only in iCloud"
              value={draft.excludeCloud}
              onChange={(excludeCloud) => update({ excludeCloud })}
            />
          )}
        </Section>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.three }]}>
        {dependsOnSize && unmeasured > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            {`Still measuring ${numberFormat.format(unmeasured)} items; size results will grow.`}
          </ThemedText>
        )}
        <Button
          title={matches === null ? 'Apply' : `Show ${numberFormat.format(matches)} items`}
          disabled={matches === 0}
          onPress={onApply}
        />
      </View>
    </ThemedView>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">
        {title}
        {hint ? <ThemedText type="small" themeColor="textSecondary">{`  ${hint}`}</ThemedText> : null}
      </ThemedText>
      {children}
    </View>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <ThemedText style={styles.toggleLabel}>{label}</ThemedText>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  section: {
    gap: Spacing.two,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    minHeight: 44,
  },
  toggleLabel: {
    flex: 1,
  },
  footer: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
  },
});
