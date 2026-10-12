import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { ChevronLeft, Wifi, Send, Mic, Square } from 'lucide-react-native';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { fetchMessages, sendMessage, markConversationRead } from '../../src/api/messages';
import { uploadMedia } from '../../src/api/media';
import { useChatSocket } from '../../src/hooks/useChatSocket';
import { useSession } from '../../src/stores/session';
import { Avatar } from '../../src/components/Avatar';
import { MessageBubble } from '../../src/components/MessageBubble';
import type { Conversation, Message } from '../../src/types/api';

export default function ChatThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const myId = useSession((s) => s.user?.id);
  const listRef = useRef<FlatList<Message>>(null);
  const [draft, setDraft] = useState('');

  const conversation = queryClient.getQueryData<Conversation[]>(['conversations'])?.find((c) => c.id === id);
  const other = conversation && !conversation.is_group ? conversation.participants.find((p) => p.id !== myId) : null;
  const title = conversation?.is_group ? conversation.name ?? 'Группа' : other?.display_name ?? other?.username ?? '...';

  const messagesQuery = useQuery({
    queryKey: ['messages', id],
    queryFn: () => fetchMessages(id),
    enabled: !!id,
  });

  const messages = useMemo(
    () => [...(messagesQuery.data ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [messagesQuery.data],
  );

  useEffect(() => {
    if (id) markConversationRead(id).catch(() => {});
  }, [id]);

  const appendMessage = useCallback(
    (msg: Message) => {
      queryClient.setQueryData<Message[]>(['messages', id], (prev) => (prev ? [...prev, msg] : [msg]));
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    },
    [id, queryClient],
  );

  const { connected } = useChatSocket(id, appendMessage);

  const sendMutation = useMutation({
    mutationFn: (body: { content: string; file_url?: string; media_type?: string }) => sendMessage(id, body),
    onSuccess: (msg) => appendMessage(msg),
  });

  const onSend = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    sendMutation.mutate({ content: text });
  };

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);

  const onToggleRecord = async () => {
    if (recorderState.isRecording) {
      await recorder.stop();
      const uri = recorder.uri;
      if (uri) {
        try {
          const { url } = await uploadMedia(uri, 'messages', 'audio/m4a');
          sendMutation.mutate({ content: '', file_url: url, media_type: 'voice' });
        } catch {
          // upload failed — drop silently for now
        }
      }
      return;
    }
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) return;
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  return (
    <SafeAreaView className="flex-1 bg-brand-bg" edges={['top', 'bottom']}>
      <View className="flex-row items-center gap-3 border-b border-brand-border px-4 py-2">
        <Pressable onPress={() => router.back()} className="h-9 w-9 items-center justify-center rounded-full bg-brand-card">
          <ChevronLeft size={18} color="#F9FAFD" />
        </Pressable>
        <Avatar uri={conversation?.is_group ? conversation.avatar_url : other?.avatar_url} name={title} size={36} />
        <View className="flex-1">
          <Text className="font-bold text-brand-offwhite">{title}</Text>
          <View className="flex-row items-center gap-1">
            <Wifi size={10} color={connected ? '#66C770' : '#7C86AE'} />
            <Text className="text-xs text-brand-muted">{connected ? 'На связи' : 'Подключение...'}</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1" keyboardVerticalOffset={90}>
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerClassName="px-4 py-3"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => <MessageBubble message={item} isMine={item.sender_id === myId} />}
        />

        <View className="flex-row items-center gap-2 border-t border-brand-border px-3 py-2">
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Сообщение..."
            placeholderTextColor="#7C86AE"
            className="flex-1 rounded-2xl border border-brand-border bg-brand-card px-4 py-2.5 text-brand-offwhite"
            multiline
          />
          {draft.trim().length > 0 ? (
            <Pressable onPress={onSend} className="h-11 w-11 items-center justify-center rounded-full bg-brand-accent">
              <Send size={18} color="#F9FAFD" />
            </Pressable>
          ) : (
            <Pressable
              onPress={onToggleRecord}
              className={`h-11 w-11 items-center justify-center rounded-full ${recorderState.isRecording ? 'bg-brand-error' : 'bg-brand-accent'}`}
            >
              {recorderState.isRecording ? <Square size={16} color="#F9FAFD" /> : <Mic size={18} color="#F9FAFD" />}
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
