import { Pressable, Text, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';

interface GradientButtonProps {
  onPress?: () => void;
  children: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}

export function GradientButton({ onPress, children, loading, disabled, icon }: GradientButtonProps) {
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} className="active:opacity-80">
      <LinearGradient
        colors={disabled ? ['#3A4060', '#3A4060'] : ['#4C67CF', '#7B5FE0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        className="flex-row items-center justify-center gap-2 rounded-2xl py-4"
      >
        {loading ? (
          <ActivityIndicator color="#F9FAFD" />
        ) : (
          <>
            <Text className="text-base font-bold text-brand-offwhite">{children}</Text>
            {icon}
          </>
        )}
      </LinearGradient>
    </Pressable>
  );
}
