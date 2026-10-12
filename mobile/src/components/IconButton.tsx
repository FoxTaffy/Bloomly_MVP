import { Pressable, PressableProps } from 'react-native';
import type { ReactNode } from 'react';

interface IconButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  children: ReactNode;
  /** Visual size of the circle; the touch target stays at least 44pt regardless. */
  size?: number;
  tone?: 'card' | 'overlay' | 'plain';
}

const TONE: Record<NonNullable<IconButtonProps['tone']>, string> = {
  card: 'bg-brand-card',
  overlay: 'bg-black/50',
  plain: 'bg-transparent',
};

export function IconButton({ label, children, size = 40, tone = 'card', className, ...rest }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={(44 - size) / 2 + 2}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      className={`items-center justify-center active:opacity-60 ${TONE[tone]} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </Pressable>
  );
}
