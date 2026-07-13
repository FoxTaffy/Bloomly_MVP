import { Dimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

const { width: W, height: H } = Dimensions.get('window');

export function AuroraBackground() {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
      <Svg width={W} height={H}>
        <Defs>
          <RadialGradient id="g1" cx="20%" cy="18%" r="55%">
            <Stop offset="0%" stopColor="#4C67CF" stopOpacity={0.34} />
            <Stop offset="100%" stopColor="#4C67CF" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="g2" cx="85%" cy="70%" r="55%">
            <Stop offset="0%" stopColor="#CD83F5" stopOpacity={0.26} />
            <Stop offset="100%" stopColor="#CD83F5" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="g3" cx="70%" cy="6%" r="42%">
            <Stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
            <Stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="g4" cx="6%" cy="88%" r="48%">
            <Stop offset="0%" stopColor="#8B6ED8" stopOpacity={0.18} />
            <Stop offset="100%" stopColor="#8B6ED8" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="#080b1a" />
        <Rect x={0} y={0} width={W} height={H} fill="url(#g1)" />
        <Rect x={0} y={0} width={W} height={H} fill="url(#g2)" />
        <Rect x={0} y={0} width={W} height={H} fill="url(#g3)" />
        <Rect x={0} y={0} width={W} height={H} fill="url(#g4)" />
      </Svg>
    </View>
  );
}
