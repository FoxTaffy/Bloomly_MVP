import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MailCheck, ArrowRight } from 'lucide-react-native';
import { useSession } from '../../src/stores/session';
import { GradientButton } from '../../src/components/GradientButton';

export default function VerifyOtpScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const verifyEmail = useSession((s) => s.verifyEmail);
  const resendOtp = useSession((s) => s.resendOtp);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const onSubmit = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    setError(null);
    try {
      await verifyEmail(email, code, true);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Неверный код');
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    try {
      await resendOtp(email, 'register');
      setResent(true);
    } catch {
      // ignore
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-brand-bg" edges={['top', 'bottom']}>
      <View className="flex-1 justify-center px-6">
        <View className="items-center mb-8">
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-3xl bg-brand-card">
            <MailCheck size={40} color="#4C67CF" />
          </View>
          <Text className="text-2xl font-extrabold text-brand-offwhite">Подтверди почту</Text>
          <Text className="mt-2 text-center text-brand-muted">Мы отправили код на {email}</Text>
        </View>

        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="000000"
          placeholderTextColor="#3A4060"
          keyboardType="number-pad"
          maxLength={6}
          className="mb-6 rounded-2xl border border-brand-border bg-brand-card px-4 py-4 text-center text-2xl tracking-[8px] text-brand-offwhite"
        />

        {error ? <Text className="mb-4 text-center text-brand-error">{error}</Text> : null}

        <GradientButton onPress={onSubmit} loading={loading} icon={<ArrowRight size={18} color="#F9FAFD" />}>
          Подтвердить
        </GradientButton>

        <Pressable onPress={onResend} className="mt-6">
          <Text className="text-center text-brand-accent">{resent ? 'Код отправлен повторно' : 'Отправить код ещё раз'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
