/**
 * Gallery Wipe treats your camera roll like a contact sheet: neutral surfaces so photos read in
 * true color, ink for text, and two grease-pencil marker colors for the only decisions that matter.
 */

import { Platform } from 'react-native';

export const Colors = {
  light: {
    // Ink on a light table.
    text: '#15171C',
    background: '#F4F5F7',
    backgroundElement: '#E7E9ED',
    backgroundSelected: '#D7DAE0',
    textSecondary: '#5B616D',
    line: '#D3D6DC',
    // Marker red and marker green.
    danger: '#D2321F',
    success: '#17855A',
  },
  dark: {
    // Darkroom: true black around the photos.
    text: '#F2F3F5',
    background: '#000000',
    backgroundElement: '#17181B',
    backgroundSelected: '#26282D',
    textSecondary: '#9CA1AB',
    line: '#2A2C31',
    danger: '#FF5A47',
    success: '#3BCB85',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Loaded in the root layout. Each weight is its own family so Android never synthesizes one. */
export const FontFamily = {
  regular: 'Barlow_400Regular',
  medium: 'Barlow_500Medium',
  semiBold: 'Barlow_600SemiBold',
  // Headlines and numbers, like the engraving on a camera's frame counter.
  condensed: 'BarlowCondensed_600SemiBold',
  condensedBold: 'BarlowCondensed_700Bold',
  // Grease pencil; only for the marks on a swipe card.
  marker: 'PermanentMarker_400Regular',
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  // Thumbnails and small controls.
  small: 6,
  // Buttons and grouped rows.
  medium: 12,
  // Photo cards.
  large: 22,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
