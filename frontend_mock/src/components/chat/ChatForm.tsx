'use client';

import {
  InputPromptObject,
  ChatRequestObject,
  ChatResponseObject,
  ApiResponse,
} from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Send, Loader2 } from 'lucide-react';
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

      // Use environment variable to determine which API endpoint to call
      const chatApi = process.env.NEXT_PUBLIC_CHAT_API || 'strands';
      const apiEndpoint = chatApi === 'strands' ? '/api/strands' : '/api/openai';

      const response = await fetch(apiEndpoint, {
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
      handleSubmit(e as any);
    }
  };

  const isFormValid = formData.mainPrompt.trim().length > 0;

  return (
    <div className="w-full bg-background border rounded-lg p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
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
            className="w-full min-h-[80px] max-h-[200px] resize-none pr-16 text-sm"
            rows={3}
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

        {/* プロフィール設定（コンパクト表示） */}
        <details className="group">
          <summary className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            <span>プロフィール設定</span>
            <span className="text-xs group-open:hidden">(クリックして展開)</span>
          </summary>
          <div className="mt-3 space-y-3 pl-2 border-l-2 border-muted">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="userRole" className="text-xs font-medium text-muted-foreground">
                  役割・職業
                </label>
                <Textarea
                  id="userRole"
                  placeholder="例: ソフトウェアエンジニア"
                  value={formData.userRole}
                  onChange={e =>
                    setFormData({ ...formData, userRole: e.target.value })
                  }
                  className="mt-1 text-sm h-16 resize-none"
                  disabled={isSubmitting}
                />
              </div>
              <div>
                <label htmlFor="userSkills" className="text-xs font-medium text-muted-foreground">
                  スキル・専門分野
                </label>
                <Textarea
                  id="userSkills"
                  placeholder="例: React, TypeScript, AWS"
                  value={formData.userSkills}
                  onChange={e =>
                    setFormData({ ...formData, userSkills: e.target.value })
                  }
                  className="mt-1 text-sm h-16 resize-none"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>
        </details>
      </form>
    </div>
  );
}
