import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#080b1a' } }}>
      <Stack.Screen name="login" />
    </Stack>
  );
}
