import { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Flower2, Mail, Lock, User, ArrowRight } from 'lucide-react-native';
import { useSession } from '../../src/stores/session';
import { GradientButton } from '../../src/components/GradientButton';

export default function RegisterScreen() {
  const router = useRouter();
  const register = useSession((s) => s.register);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!username || !email || !password) return;
    setLoading(true);
    setError(null);
    try {
      await register(username.trim(), email.trim(), password);
      router.push({ pathname: '/(auth)/verify-otp', params: { email: email.trim() } });
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Не удалось зарегистрироваться');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-brand-bg" edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center px-6 py-10" keyboardShouldPersistTaps="handled">
          <View className="items-center mb-8">
            <View className="mb-4 h-20 w-20 items-center justify-center rounded-3xl bg-brand-card">
              <Flower2 size={40} color="#4C67CF" />
            </View>
            <Text className="text-3xl font-extrabold text-brand-accent">Bloomly</Text>
          </View>

          <Text className="mb-1 text-2xl font-extrabold text-brand-offwhite">Добро пожаловать 🌸</Text>
          <Text className="mb-6 text-brand-muted">Создай аккаунт и найди своё сообщество.</Text>

          <View className="mb-6 flex-row rounded-2xl bg-brand-card p-1">
            <Link href="/(auth)/login" asChild>
              <Pressable className="flex-1 items-center justify-center py-3">
                <Text className="font-bold text-brand-muted">Вход</Text>
              </Pressable>
            </Link>
            <View className="flex-1 rounded-xl bg-brand-accent py-3">
              <Text className="text-center font-bold text-brand-offwhite">Регистрация</Text>
            </View>
          </View>

          <View className="mb-4 flex-row items-center rounded-2xl border border-brand-border bg-brand-card px-4">
            <User size={18} color="#3A4060" />
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="username"
              placeholderTextColor="#3A4060"
              autoCapitalize="none"
              className="ml-3 flex-1 py-4 text-brand-offwhite"
            />
          </View>

          <View className="mb-4 flex-row items-center rounded-2xl border border-brand-border bg-brand-card px-4">
            <Mail size={18} color="#3A4060" />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#3A4060"
              autoCapitalize="none"
              keyboardType="email-address"
              className="ml-3 flex-1 py-4 text-brand-offwhite"
            />
          </View>

          <View className="mb-6 flex-row items-center rounded-2xl border border-brand-border bg-brand-card px-4">
            <Lock size={18} color="#3A4060" />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="минимум 8 символов"
              placeholderTextColor="#3A4060"
              secureTextEntry
              className="ml-3 flex-1 py-4 text-brand-offwhite"
            />
          </View>

          {error ? <Text className="mb-4 text-center text-brand-error">{error}</Text> : null}

          <GradientButton onPress={onSubmit} loading={loading} icon={<ArrowRight size={18} color="#F9FAFD" />}>
            Создать аккаунт
          </GradientButton>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
