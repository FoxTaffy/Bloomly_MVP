import { View } from 'react-native';
import { BadgeCheck } from 'lucide-react-native';

export function VerifiedBadge({ size = 16 }: { size?: number }) {
  return (
    <View>
      <BadgeCheck size={size} color="#4C67CF" fill="#A1B4FF" />
    </View>
  );
}
