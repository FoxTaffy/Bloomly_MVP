import { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

interface Option {
  key: string;
  label: string;
}

export function TabSwitch({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Option[] }) {
  const [width, setWidth] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const translateX = useSharedValue(0);

  useEffect(() => {
    if (width > 0) translateX.value = withTiming((width / options.length) * index, { duration: 280 });
  }, [index, width, options.length, translateX]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const pillWidth = width > 0 ? width / options.length - 8 : 0;

  return (
    <View
      onLayout={onLayout}
      className="flex-row rounded-2xl border border-white/[0.07] bg-white/[0.04] p-1"
    >
      {width > 0 ? (
        <Animated.View
          style={[{ position: 'absolute', top: 4, bottom: 4, left: 4, width: pillWidth, borderRadius: 14 }, pillStyle]}
        >
          <LinearGradient colors={['#4C67CF', '#7B6FD4']} style={{ flex: 1, borderRadius: 14 }} />
        </Animated.View>
      ) : null}
      {options.map((o) => (
        <Pressable key={o.key} onPress={() => onChange(o.key)} className="flex-1 items-center py-2.5">
          <Text className={`font-nunito-extrabold text-[13px] ${value === o.key ? 'text-white' : 'text-white/35'}`}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
