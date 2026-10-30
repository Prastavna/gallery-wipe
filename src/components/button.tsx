import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'regular' | 'compact';
};

export function Button({ title, variant = 'primary', size = 'regular', style, disabled, ...rest }: ButtonProps) {
  const theme = useTheme();
  const background = { primary: theme.text, secondary: theme.backgroundElement, danger: theme.danger }[variant];
  const foreground = { primary: theme.background, secondary: theme.text, danger: theme.background }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={(state) => [
        styles.button,
        size === 'compact' && styles.compact,
        { backgroundColor: background },
        disabled ? styles.disabled : state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      <ThemedText type={size === 'compact' ? 'smallBold' : 'defaultBold'} style={{ color: foreground }}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
  },
  compact: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: 18,
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.4,
  },
});
