import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { API } from '../../services/api';
import { Colors, FontSize, Spacing, Radius } from '../../constants/theme';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SUGGESTIONS = [
  'How much can I deduct this month?',
  'Classify my last 5 trips',
  'What is the 2024 IRS mileage rate?',
  'Generate my tax summary',
  'How can I maximize my deductions?',
];

export default function AIAssistantScreen() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: '👋 Hi! I\'m your AI mileage & tax assistant. I can help you:\n\n• Understand your tax deductions\n• Classify trips for maximum savings\n• Generate report summaries\n• Answer IRS mileage questions\n\nWhat would you like to know?',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(`chat_${Date.now()}`);
  const scrollRef = useRef<ScrollView>(null);
  const { token } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: messageText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const result = await API.aiChat(token!, messageText, sessionId);
      const aiMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: result.response, timestamp: new Date() };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e: any) {
      const errMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Sorry, I\'m having trouble connecting right now. Please try again in a moment.', timestamp: new Date() };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity testID="ai-back-btn" onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={Colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.aiAvatar}>
            <Feather name="zap" size={16} color={Colors.brand.primary} />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Assistant</Text>
            <Text style={styles.headerSub}>Tax & Mileage Intelligence</Text>
          </View>
        </View>
        <View style={styles.onlineDot} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messageList}
          contentContainerStyle={{ paddingHorizontal: Spacing.screen, paddingTop: 12, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map(msg => (
            <View key={msg.id} style={[styles.msgWrap, msg.role === 'user' ? styles.userMsgWrap : styles.aiMsgWrap]}>
              {msg.role === 'assistant' && (
                <View style={styles.aiMsgAvatar}>
                  <Feather name="zap" size={12} color={Colors.brand.primary} />
                </View>
              )}
              <View style={[styles.msgBubble, msg.role === 'user' ? styles.userBubble : styles.aiBubble]}>
                <Text style={[styles.msgText, msg.role === 'user' ? styles.userMsgText : styles.aiMsgText]}>{msg.content}</Text>
                <Text style={styles.msgTime}>{msg.timestamp.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</Text>
              </View>
            </View>
          ))}
          {loading && (
            <View style={styles.aiMsgWrap}>
              <View style={styles.aiMsgAvatar}>
                <Feather name="zap" size={12} color={Colors.brand.primary} />
              </View>
              <View style={styles.typingBubble}>
                <ActivityIndicator size="small" color={Colors.brand.primary} />
                <Text style={styles.typingText}>Thinking...</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Suggestions */}
        {messages.length === 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestions} contentContainerStyle={{ paddingHorizontal: Spacing.screen, gap: 8 }}>
            {SUGGESTIONS.map((s, i) => (
              <TouchableOpacity key={i} testID={`suggestion-${i}`} style={styles.suggestionChip} onPress={() => sendMessage(s)}>
                <Text style={styles.suggestionText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Input */}
        <View style={[styles.inputWrap, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            testID="ai-chat-input"
            style={styles.chatInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask me anything about your mileage & taxes..."
            placeholderTextColor={Colors.text.tertiary}
            multiline
            maxLength={500}
            onSubmitEditing={() => sendMessage()}
          />
          <TouchableOpacity
            testID="ai-send-btn"
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={!input.trim() || loading}
          >
            {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Feather name="send" size={18} color="#FFF" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.primary },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.screen, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 6, marginRight: 8 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.brand.primaryDim, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.brand.primary + '40' },
  headerTitle: { color: Colors.text.primary, fontSize: FontSize.base, fontWeight: '700' },
  headerSub: { color: Colors.text.tertiary, fontSize: FontSize.xs },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.brand.primary },
  messageList: { flex: 1 },
  msgWrap: { marginBottom: 12 },
  userMsgWrap: { alignItems: 'flex-end' },
  aiMsgWrap: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  aiMsgAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.brand.primaryDim, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  msgBubble: { maxWidth: '80%', borderRadius: Radius.xl, padding: 12, paddingBottom: 8 },
  userBubble: { backgroundColor: Colors.brand.primary, borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: Colors.bg.secondary, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 4 },
  msgText: { fontSize: FontSize.sm, lineHeight: 20 },
  userMsgText: { color: Colors.text.inverse },
  aiMsgText: { color: Colors.text.primary },
  msgTime: { color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 4, textAlign: 'right' },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, padding: 12, borderWidth: 1, borderColor: Colors.border },
  typingText: { color: Colors.text.tertiary, fontSize: FontSize.xs },
  suggestions: { maxHeight: 52, marginBottom: 8 },
  suggestionChip: { backgroundColor: Colors.bg.secondary, borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: Colors.border },
  suggestionText: { color: Colors.text.secondary, fontSize: FontSize.xs },
  inputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: Spacing.screen, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.bg.primary },
  chatInput: { flex: 1, backgroundColor: Colors.bg.secondary, borderRadius: Radius.xl, paddingHorizontal: 16, paddingVertical: 10, color: Colors.text.primary, fontSize: FontSize.sm, maxHeight: 120, borderWidth: 1, borderColor: Colors.border },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.brand.primary, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: Colors.bg.tertiary },
});
