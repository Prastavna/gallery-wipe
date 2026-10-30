# Gallery Wipe — Plan

Tinder-style swiping through the device photo/video library to free up storage: swipe left to trash, right to keep. Deletions are batched and committed together.

**Targets:** iOS + Android only (no web). **Stack:** Expo SDK 58, Expo Router, Reanimated 4, Gesture Handler 3, pnpm.

## Decisions

- **Keep is remembered permanently.** Kept items never reappear in a deck. Settings has a "reset kept items" action.
- **Library grid with multi-select delete is in the MVP**, alongside the swipe deck.
- **Mobile only.** Web is removed from `app.json`.
- **Nothing is deleted on swipe.** Swipe-left queues to Trash; commit calls `Asset.delete([...])` in chunks, so the user sees one OS confirmation dialog per batch.

## Platform constraints (SDK 58)

| Fact | Consequence |
|---|---|
| `expo-media-library` uses `Asset` / `Album` / `Query` classes; old `*Async` functions throw unless imported from `/legacy` | Use the class API only |
| `Query` filters/sorts on `creationTime`, `modificationTime`, `duration`, `width`, `height`, `mediaType`, `isFavorite`; paginates with `limit`/`offset` | Fast metadata pass via `exeForMetadata()` |
| **No `fileSize`** on assets | Own SQLite index; size via `expo-file-system` `File(uri).size` after `asset.getUri()` |
| iOS-only `getMediaSubtypes()` (screenshot, live, HDR) and `getIsInCloud()` | Screenshot filter on iOS; skip iCloud-only items during size enrichment. Android: detect screenshots by album name |
| Deletion requires OS confirmation (PhotoKit / MediaStore delete request); declining rejects the promise and deletes nothing in that batch | Batch commit from Trash screen |
| Android 11+ `createDeleteRequest` deletes **permanently** (no Recently Deleted); Android 10 and older delete with no OS prompt | Platform-specific copy on the Trash screen; in-app confirmation on Android 10 and older |
| iOS `getUri()` allows network access, so it would download iCloud-only assets | Always check `getIsInCloud()` before resolving a URI for size |
| Limited access on iOS 14+ / Android 14+ | Banner + `presentPermissionsPicker()` |
| Google Play restricts full photo/video access | File the Play Console declaration early |
| `expo-video`: iOS `ph://` sources only load asynchronously (the `useVideoPlayer` constructor path is async, sync `replace` throws); Android allows one `VideoView` per player; a `SurfaceView` does not follow view transforms | One player per mounted video card (max 3); `surfaceType="textureView"` on Android |
| Native modules | Development build required (`eas build --profile development`); Expo Go is insufficient |

## Stack

- `expo-media-library` for query and delete. `expo-image` for thumbnails with disk cache.
- `expo-video` for previews. `expo-file-system` for file sizes.
- `expo-sqlite` for the asset index, decisions, sessions and settings.
- `zustand` for UI/session state. `expo-haptics` for feedback.
- Gesture Handler 3 + Reanimated 4 for the deck.

## Architecture

```
src/
  app/                      # routes only
    _layout.tsx             # Stack + permission gate
    onboarding.tsx          # explain + request permission
    (tabs)/_layout.tsx
    (tabs)/index.tsx        # Home: stats, start cleaning, presets
    (tabs)/library.tsx      # grid browse + multi-select delete
    (tabs)/settings.tsx
    swipe.tsx               # deck (full-screen modal)
    filters.tsx             # filter/sort sheet (formSheet)
    trash.tsx               # pending deletions review + commit
    viewer/[id].tsx         # full-screen photo/video
    summary.tsx             # post-commit "Freed X GB"
  features/
    media/   indexer.ts, query-builder.ts, delete.ts, permissions.ts
    deck/    swipe-deck.tsx, swipe-card.tsx, video-layer.tsx, use-deck.ts
    filters/ types.ts, presets.ts, FilterSheet.tsx
    trash/   TrashGrid.tsx, useTrash.ts
  db/        schema.ts, migrations.ts, repo.ts
  store/     session.ts, filters.ts
```

### Data model (SQLite)

All times are epoch **milliseconds** and durations are milliseconds. That is what `expo-media-library` returns natively on both platforms, even though its type docs say seconds.

**`assets`** has these columns:
- `id`, `media_type`, `filename`, `ext`, `width`, `height`, `duration`
- `creation_time`, `modification_time`, `is_favorite`, `is_screenshot`, `subtypes` (iOS)
- `size`, `in_cloud`, `enriched_at` (filled lazily; cleared when `modification_time` changes)
- `scan_id`

Indexes: `(creation_time)`, `(media_type, creation_time)`, `(size)`.

The other tables:
- **`albums`** (`id`, `title`, `scan_id`) and **`asset_albums`** (join table). On iOS an asset can be in several albums.
- **`decisions`**: `asset_id` (PK), `decision` (`keep` | `trash` | `skip`), `decided_at`, `session_id`. There is deliberately no foreign key to `assets`: a partial scan must never wipe "keep" history. Rows for deleted assets are removed on commit.
- **`sessions`**: `id`, `filter_spec`, `started_at`, `ended_at`, counts, `bytes_freed`.
- **`settings`**: key/JSON value.

Migrations are an append-only list in `src/db/migrations.ts`, tracked with `PRAGMA user_version`.

### Indexer

1. **Fast pass.** `Query().exeForMetadata()` in pages of 500. Each page is upserted with a single SQL statement (the page as JSON through `json_each`). The scan is mark-and-sweep: rows not stamped with the current `scan_id` are deleted, but only after the scan completes. Then an album pass runs (`Album.getAlbumsMetadata()` + `Query().album()`), which also marks Android screenshots by folder name.
2. **Enrichment.** Resolve URI, then read size and subtypes, in small concurrent batches while idle. It pauses while the deck animates and shows progress.
3. **Sync.** A full metadata scan runs on mount, on app foreground, and on `addListener` change events (debounced 1 s). Concurrent requests coalesce into one follow-up scan. Android events carry no details, and a full metadata scan is cheap enough that iOS uses the same path.
4. **Querying.** Once indexed, all filtering and sorting runs in SQLite.

## Filters and sort

**Filters:**
- Media type, date range (with presets), albums (include/exclude)
- Size > X MB, video duration > X s
- Screenshots, favorites (excluded by default), orientation
- File type (HEIC/PNG/GIF/MP4…), has location
- Review state (not reviewed / kept / skipped), exclude iCloud-only (iOS)

**Sort:** newest, oldest, largest, longest video, random, by album.

**Presets:** Biggest videos, Screenshots, Old stuff (>2y), This month, Random 50.

A single serializable `FilterSpec` maps to SQL `WHERE`/`ORDER BY`. It is stored per session so the user can resume.

## Swipe deck

**Gestures:**
- Left = trash, right = keep, up = skip.
- Tap opens the viewer; long-press shows info.
- On-screen buttons mirror every gesture.

**Undo:** reverses the last 50 decisions. This is free because nothing is deleted until commit. Decisions are written to SQLite immediately through a serial write chain (decide → undo → refill stay ordered). Undo restores whatever decision the item had before, and the card flies back in from the side it left.

**Rendering:**
- 3 mounted cards. `expo-image` with `recyclingKey` and `cachePolicy="memory"`. The two cards behind the top one act as the prefetch. `Image.prefetch` is deliberately not used: it decodes full-resolution library photos with no target size, which costs too much memory.
- Each card owns its own shared values, so a removed card never hands a mid-animation transform to the next one. Shared values use `.get()`/`.set()` (required under the React Compiler).
- All motion in Reanimated worklets, with threshold stamps and a haptic on crossing.

**Video:**
- The deck now includes videos; photo/video filtering arrives in milestone 5.
- Each mounted video card owns its own `useVideoPlayer` (so at most 3 players). This replaced the planned shared pool: it is simpler, and the card behind the top one is already buffered when it moves up.
- Only the top card on a focused screen plays. The two top cards render a `VideoView`; the third only buffers. The surface fades in on `onFirstFrameRender` over the expo-image poster, which expo-image loads from the asset itself, so `generateThumbnailsAsync` is not needed.
- Videos loop muted. The sound toggle is a session-wide preference.
- The scrub bar `block`s the card's swipe pan and turns `scrubbingModeOptions` on only while dragging. Progress comes from `timeUpdate` events (every 0.25 s) into a shared value, so the bar never re-renders React.
- The viewer plays videos full screen with native controls and sound.

**Progress header:** count reviewed and bytes marked.

**Auto-commit prompt:** every 50 items trashed in a session. The 1 GB trigger waits for milestone 5, because sizes are only measured for trash items until then. The trash count in the header opens Trash at any time. When the deck regains focus it prunes cards whose asset no longer exists, so undo never brings back a deleted photo.

## Trash and commit

1. Opening Trash runs a scan first, so assets deleted outside the app drop out before we ask the OS to delete them.
2. Grid of pending items. Tap to select, then "Put back" returns them to undecided.
3. Sizes for trash items are measured on demand (`fillMissingSizes`, 4 at a time) and cached on the asset. The total shows "+ N not measured" for iCloud-only or unreadable items.
4. Commit uses `Asset.delete()`. On iOS it is one batch (one confirmation). On Android it uses batches of 400 to stay under the Binder transaction limit, stopping at the first declined batch.
   - If the user declines, items stay in Trash with a "Nothing was deleted" notice.
   - Each successful batch credits bytes to its sessions and to the lifetime total, then removes the asset, decision and album rows.
5. Summary screen shows bytes freed, anything still in Trash, and the lifetime total. Home shows the lifetime total and a "Review N to delete" button.
6. Platform copy: iOS → Recently Deleted for 30 days; Android → permanent.

## Permissions

1. Explainer screen, then `requestPermissionsAsync(false, ['photo', 'video'])`.
2. `limited` → banner with "Manage access".
3. `none` → screen linking to system Settings.
4. iOS usage strings and Android permissions are configured via the `expo-media-library` config plugin.

## Milestones

- [ ] **0. Setup.** Remove template screens, drop web, install libraries, config plugins, `eas.json` dev/preview/production profiles. *Done when:* dev build runs on device. *(Code done; on-device dev build not yet verified.)*
- [ ] **1. Index.** Permissions, SQLite schema/migrations, indexer fast pass. *Done when:* 10k+ assets indexed in under 3 s. *(Code done; on-device timing not yet verified. Home shows the asset-pass time.)*
- [ ] **2. Photo deck.** keep/trash/skip, undo, persisted decisions. *Done when:* smooth on a mid-range Android. *(Code done, including a basic full-screen viewer; on-device smoothness not yet verified.)*
- [ ] **3. Trash + commit.** Batch delete, cancel handling. *Done when:* real deletion works on both platforms. *(Code done; on-device deletion not yet verified.)*
- [ ] **4. Video.** Video cards, player pool, scrub, mute. *Done when:* no dropped frames moving between video cards. *(Code done; on-device frame rate and Android video posters not yet verified.)*
- [ ] **5. Filters.** Filter/sort sheet, presets, size enrichment, sort by size. *Done when:* all filters work and the spec persists.
- [ ] **6. Screens.** Home stats, Library grid with multi-select delete, Summary, Settings (reset kept). *Done when:* feature-complete MVP.
- [ ] **7. Polish.** Haptics, dark mode, accessibility labels, empty and error states (iCloud, missing files). *Done when:* TestFlight / Play internal test.
- [ ] **8. Post-MVP.** Similar/duplicate detection, burst grouping, video compression offer, widgets.

## Risks

- **iOS size enrichment on large libraries is slow.** Skip iCloud-only items and let sizes fill in progressively.
- **Libraries with 100k+ items.** Use paging and SQLite indexes from day one.
- **Android OEM differences** (screenshot album names, MediaStore quirks). Test on Samsung and Pixel at minimum.
- **Play Store photo-permission review.** Start the declaration early.
