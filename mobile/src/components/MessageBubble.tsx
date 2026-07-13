import { View, Text } from 'react-native';
import { Mic, Lock } from 'lucide-react-native';
import type { Message } from '../types/api';

export function MessageBubble({ message, isMine }: { message: Message; isMine: boolean }) {
  const isVoice = message.type === 'voice' || message.type === 'audio';
  const isEncryptedPlaceholder = !!message.encrypted_text && !message.text;

  return (
    <View className={`mb-2 max-w-[78%] ${isMine ? 'self-end' : 'self-start'}`}>
      <View
        className={`rounded-2xl px-4 py-2.5 ${isMine ? 'bg-brand-accent rounded-br-sm' : 'bg-brand-card rounded-bl-sm border border-brand-border'}`}
      >
        {isVoice ? (
          <View className="flex-row items-center gap-2">
            <Mic size={16} color={isMine ? '#F9FAFD' : '#A1B4FF'} />
            <Text className={isMine ? 'text-brand-offwhite' : 'text-brand-offwhite'}>Голосовое сообщение</Text>
          </View>
        ) : isEncryptedPlaceholder ? (
          <View className="flex-row items-center gap-2">
            <Lock size={14} color={isMine ? '#F9FAFD' : '#A1B4FF'} />
            <Text className="italic text-brand-offwhite">Зашифрованное сообщение</Text>
          </View>
        ) : (
          <Text className="text-brand-offwhite">{message.text}</Text>
        )}
      </View>
    </View>
  );
}
