# Gallery Wipe

Swipe through your photos and videos to clean up storage: left to trash, right to keep. See [PLAN.md](./PLAN.md) for the design and milestones.

iOS and Android only.

## Develop

This app uses native modules (`expo-media-library`, `expo-video`, `expo-sqlite`), so it needs a development build. Expo Go is not enough.

```bash
pnpm install
pnpm dlx eas-cli build --profile development --platform android   # or ios
# install the build on your device, then:
pnpm start
```

To build locally instead (requires Android Studio / Xcode): `pnpm expo run:android` or `pnpm expo run:ios`.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm dlx expo-doctor
```
