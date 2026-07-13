import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, TextStyle, StyleProp } from 'react-native';

interface GradientTextProps {
  children: string;
  style?: StyleProp<TextStyle>;
  colors?: [string, string, ...string[]];
}

export function GradientText({ children, style, colors = ['#7B9CFF', '#CD83F5', '#F7A9E2'] }: GradientTextProps) {
  return (
    <MaskedView maskElement={<Text style={style}>{children}</Text>}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}
