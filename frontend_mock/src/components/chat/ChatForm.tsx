'use client';

import {
  InputPromptObject,
  ChatRequestObject,
  ChatResponseObject,
  ApiResponse,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Send, Loader2, Briefcase } from 'lucide-react';
import { useState } from 'react';
import { ChatFormUserProfile } from './ChatFormUserProfile';

interface ChatFormProps {
  chatId: string;
  onMessageSent: (userMessage: string, assistantMessage: string) => void;
  isSubmitting: boolean;
  setIsSubmitting: (isSubmitting: boolean) => void;
}

export function ChatForm({
  chatId,
  onMessageSent,
  isSubmitting,
  setIsSubmitting,
}: ChatFormProps) {
  const [formData, setFormData] = useState<InputPromptObject>({
    mainPrompt: '',
    userRole: '',
    userSkills: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.mainPrompt.trim() || isSubmitting) {
      return;
    }

    const userMessage = formData.mainPrompt.trim();

    // ユーザーメッセージを即座に表示
    onMessageSent(userMessage, '');

    // フォームをリセット
    setFormData({
      ...formData,
      mainPrompt: '',
    });

    setIsSubmitting(true);

    try {
      const requestBody: ChatRequestObject = {
        chatId,
        message: {
          mainPrompt: userMessage,
          userRole: formData.userRole,
          userSkills: formData.userSkills,
        },
      };

      const response = await fetch('/api/openai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const result: ApiResponse<ChatResponseObject> = await response.json();

      if (result.success && result.data) {
        // アシスタントの返答を追加
        onMessageSent('', result.data.content);
      } else {
        console.error('Failed to send message:', result.error);
        // エラー処理: エラーメッセージを表示
        onMessageSent('', 'エラーが発生しました。もう一度お試しください。');
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // エラー処理: エラーメッセージを表示
      onMessageSent('', '通信エラーが発生しました。もう一度お試しください。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const syntheticEvent = {
        preventDefault: () => {},
      } as React.FormEvent;
      handleSubmit(syntheticEvent);
    }
  };

  const isFormValid = formData.mainPrompt.trim().length > 0;

  const handleFormDataChange = (newFormData: InputPromptObject) => {
    setFormData(newFormData);
  };

  return (
    <div className="w-full bg-background border rounded-lg p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Tabs defaultValue="chat" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="chat" className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              チャット
            </TabsTrigger>
            <TabsTrigger value="profile" className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              プロフィール設定
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="space-y-3 mt-4">
            {/* メインプロンプト入力エリア */}
            <div className="relative">
              <Textarea
                id="mainPrompt"
                placeholder="質問や相談内容を入力してください... (Ctrl/Cmd + Enter で送信)"
                value={formData.mainPrompt}
                onChange={e =>
                  setFormData({ ...formData, mainPrompt: e.target.value })
                }
                onKeyDown={handleKeyDown}
                className="w-full min-h-[120px] max-h-[300px] resize-none pr-16 text-sm"
                rows={5}
                disabled={isSubmitting}
              />

              {/* 送信ボタン - テキストエリア内の右下に配置 */}
              <Button
                type="submit"
                disabled={!isFormValid || isSubmitting}
                size="sm"
                className="absolute bottom-2 right-2 h-8 px-3"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* 現在のプロフィール設定の概要表示 */}
            {(formData.userRole || formData.userSkills) && (
              <div className="p-3 bg-muted/50 rounded-md border">
                <h4 className="text-sm font-medium mb-2">
                  現在のプロフィール設定:
                </h4>
                {formData.userRole && (
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium">役割:</span>{' '}
                    {formData.userRole}
                  </p>
                )}
                {formData.userSkills && (
                  <p className="text-sm text-muted-foreground mt-1">
                    <span className="font-medium">スキル:</span>{' '}
                    {formData.userSkills}
                  </p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="profile" className="mt-4">
            {/* ChatFormUserProfileコンポーネントを使用 */}
            <ChatFormUserProfile
              formData={formData}
              onFormDataChange={handleFormDataChange}
            />
          </TabsContent>
        </Tabs>
      </form>
    </div>
  );
}
