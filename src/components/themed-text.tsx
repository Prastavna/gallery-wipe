import { StyleSheet, Text, type TextProps } from 'react-native';

import { FontFamily, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'defaultBold' | 'title' | 'subtitle' | 'heading' | 'small' | 'smallBold' | 'caption';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

// Custom families carry their own weight; setting fontWeight as well makes Android fall back.
const styles = StyleSheet.create({
  caption: {
    fontFamily: FontFamily.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  small: {
    fontFamily: FontFamily.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  smallBold: {
    fontFamily: FontFamily.semiBold,
    fontSize: 14,
    lineHeight: 20,
  },
  default: {
    fontFamily: FontFamily.regular,
    fontSize: 17,
    lineHeight: 24,
  },
  defaultBold: {
    fontFamily: FontFamily.semiBold,
    fontSize: 17,
    lineHeight: 24,
  },
  heading: {
    fontFamily: FontFamily.condensed,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontFamily: FontFamily.condensed,
    fontSize: 34,
    lineHeight: 38,
  },
  title: {
    fontFamily: FontFamily.condensedBold,
    fontSize: 72,
    lineHeight: 74,
    letterSpacing: -1,
  },
});
