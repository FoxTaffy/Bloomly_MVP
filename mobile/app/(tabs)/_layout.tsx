import { Tabs } from 'expo-router';
import { House, Compass, MessageCircle, Grid3x3 } from 'lucide-react-native';
import { useSession } from '../../src/stores/session';
import { Avatar } from '../../src/components/Avatar';

export default function TabsLayout() {
  const user = useSession((s) => s.user);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4C67CF',
        tabBarInactiveTintColor: '#3A4060',
        tabBarStyle: { backgroundColor: '#16192F', borderTopColor: '#2A2D45' },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{ title: 'Главная', tabBarIcon: ({ color, size }) => <House color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="discover"
        options={{ title: 'Поиск', tabBarIcon: ({ color, size }) => <Compass color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Сообщения', tabBarIcon: ({ color, size }) => <MessageCircle color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="groups"
        options={{ title: 'Группы', tabBarIcon: ({ color, size }) => <Grid3x3 color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Профиль',
          tabBarIcon: ({ focused }) => (
            <Avatar uri={user?.avatar_url} name={user?.display_name ?? user?.username} size={28} ring={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
