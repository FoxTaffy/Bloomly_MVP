import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '../../src/stores/session';
import { ProfileContent } from '../../src/components/ProfileContent';

export default function OwnProfileScreen() {
  const user = useSession((s) => s.user);
  if (!user) return null;

  return (
    <SafeAreaView className="flex-1 bg-brand-bg" edges={['top']}>
      <ProfileContent username={user.username} isOwn />
    </SafeAreaView>
  );
}
