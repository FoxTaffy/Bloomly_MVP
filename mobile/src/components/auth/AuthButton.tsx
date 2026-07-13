import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { ArrowRight } from 'lucide-react-native';
import type { ReactNode } from 'react';

export function AuthButton({
  onPress,
  children,
  loading,
  disabled,
}: {
  onPress?: () => void;
  children: ReactNode;
  loading?: boolean;
  disabled?: boolean;
}) {
  const shimmer = useSharedValue(-1);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.linear }), -1, false);
  }, [shimmer]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmer.value * 220 }, { rotate: '20deg' }],
  }));

  return (
    <Pressable onPress={onPress} disabled={disabled || loading} className="mt-1 active:opacity-90">
      <LinearGradient
        colors={disabled ? ['#3A4060', '#3A4060'] : ['#3d56c4', '#6057cc', '#7B4FD0']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ borderRadius: 18, overflow: 'hidden' }}
      >
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
          <Animated.View style={[{ position: 'absolute', top: -40, bottom: -40, width: 60 }, shimmerStyle]}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.22)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ flex: 1 }}
            />
          </Animated.View>
        </View>
        <View className="flex-row items-center justify-center gap-2.5 px-7 py-4">
          {loading ? (
            <ActivityIndicator color="#F9FAFD" />
          ) : (
            <>
              <Text className="font-nunito-black text-[15px] tracking-wide text-white">{children}</Text>
              <ArrowRight size={18} color="#F9FAFD" />
            </>
          )}
        </View>
      </LinearGradient>
    </Pressable>
  );
}
