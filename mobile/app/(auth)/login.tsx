import { useState } from 'react';
import { View, Text, TextInput, Pressable, Switch, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Flower2, Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react-native';
import { useSession } from '../../src/stores/session';
import { GradientButton } from '../../src/components/GradientButton';

export default function LoginScreen() {
  const router = useRouter();
  const login = useSession((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password, remember);
    } catch (e: any) {
      const code = e?.response?.data?.error?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        router.push({ pathname: '/(auth)/verify-otp', params: { email: email.trim() } });
        return;
      }
      setError(e?.response?.data?.error?.message ?? 'Не удалось войти');
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

          <Text className="mb-1 text-2xl font-extrabold text-brand-offwhite">С возвращением 👋</Text>
          <Text className="mb-6 text-brand-muted">Войди, чтобы продолжить — твоя лента ждёт.</Text>

          <View className="mb-6 flex-row rounded-2xl bg-brand-card p-1">
            <View className="flex-1 rounded-xl bg-brand-accent py-3">
              <Text className="text-center font-bold text-brand-offwhite">Вход</Text>
            </View>
            <Link href="/(auth)/register" asChild>
              <Pressable className="flex-1 items-center justify-center py-3">
                <Text className="font-bold text-brand-muted">Регистрация</Text>
              </Pressable>
            </Link>
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

          <View className="mb-4 flex-row items-center rounded-2xl border border-brand-border bg-brand-card px-4">
            <Lock size={18} color="#3A4060" />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#3A4060"
              secureTextEntry={!showPassword}
              className="ml-3 flex-1 py-4 text-brand-offwhite"
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
              {showPassword ? <EyeOff size={18} color="#3A4060" /> : <Eye size={18} color="#3A4060" />}
            </Pressable>
          </View>

          <View className="mb-6 flex-row items-center justify-between">
            <Text className="text-sm text-brand-muted">Запомнить это устройство</Text>
            <Switch value={remember} onValueChange={setRemember} trackColor={{ true: '#4C67CF', false: '#3A4060' }} />
          </View>

          {error ? <Text className="mb-4 text-center text-brand-error">{error}</Text> : null}

          <GradientButton onPress={onSubmit} loading={loading} icon={<ArrowRight size={18} color="#F9FAFD" />}>
            Войти
          </GradientButton>

          <Text className="mt-8 text-center text-xs text-brand-muted">
            Нажимая кнопку, ты принимаешь Условия и Политику
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
