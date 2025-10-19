/**
 * チャットサマリー管理用のカスタムフック（JSON データ版）
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChatSummary,
  CreateSummaryRequest,
  CreateSummaryResponse,
} from '@/lib/types';

export function useChatSummary(
  userId: string,
  timestamp?: string,
  chatId?: string
) {
  const [summary, setSummary] = useState<ChatSummary | null>(null);
  const [summaries, setSummaries] = useState<ChatSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // サマリーデータを取得（JSON API + LLM生成 API）
  const fetchSummary = useCallback(
    async (
      targetTimestamp?: string,
      targetChatId?: string,
      _forceRefresh?: boolean
    ) => {
      if (!userId && !targetChatId) return;

      try {
        setIsLoading(true);
        setError(null);

        // まず生成されたサマリーから取得を試みる
        let url: string;
        if (targetChatId) {
          // LLM生成APIから取得
          url = `/api/chat/summary?chatId=${targetChatId}`;
        } else if (targetTimestamp) {
          url = `/api/db/chat/summary?userId=${userId}&timestamp=${targetTimestamp}`;
        } else {
          url = `/api/db/chat/summary?userId=${userId}`;
        }

        const response = await fetch(url);
        if (!response.ok && !targetChatId) {
          throw new Error('Failed to load summaries from JSON');
        }

        if (response.ok) {
          const result = await response.json();
          if (result.success) {
            const data: ChatSummary[] = Array.isArray(result.data)
              ? result.data
              : [result.data];

            // 指定されたuserIdのサマリーのみフィルタリング（chatId検索の場合は不要）
            const filteredSummaries = targetChatId
              ? data
              : data.filter(sum => sum.userId === userId);

            if (targetTimestamp) {
              const targetSummary = filteredSummaries.find(
                sum => sum.timestamp === targetTimestamp
              );
              setSummary(targetSummary || null);
            } else if (targetChatId) {
              // chatIdで検索した場合は単一のサマリーを設定
              setSummary(filteredSummaries[0] || null);
            } else {
              setSummaries(filteredSummaries);
              // timestampが指定されていない場合は、最新のサマリーを表示
              if (filteredSummaries.length > 0) {
                const latestSummary = filteredSummaries.sort(
                  (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
                )[0];
                setSummary(latestSummary);
              }
            }
            return; // 成功した場合は終了
          }
        }

        // LLM生成APIで取得できない場合、JSONファイルにフォールバック
        if (targetChatId) {
          const fallbackUrl = `/api/db/chat/summary?chatId=${targetChatId}`;
          const fallbackResponse = await fetch(fallbackUrl);

          if (fallbackResponse.ok) {
            const fallbackResult = await fallbackResponse.json();
            if (fallbackResult.success) {
              const data: ChatSummary[] = Array.isArray(fallbackResult.data)
                ? fallbackResult.data
                : [fallbackResult.data];
              setSummary(data[0] || null);
              return;
            }
          }
        }

        // どちらからも取得できない場合、サマリーは未作成として扱う
        console.log('No summary found - treating as not created yet');
        setSummary(null);
      } catch (err) {
        // ネットワークエラーなど、実際のエラーが発生した場合のみエラーとして扱う
        if (err instanceof TypeError && err.message.includes('fetch')) {
          setError('ネットワークエラーが発生しました');
        } else {
          // その他のエラーもサマリー未作成として扱う
          console.log('Error occurred, treating as no summary available:', err);
          setSummary(null);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [userId]
  ); // userIdのみを依存配列に含める

  // サマリー生成・保存（サンプルデータ版）
  const createSummary = async (
    summaryData: CreateSummaryRequest
  ): Promise<CreateSummaryResponse | null> => {
    try {
      setError(null);

      const timestamp = new Date().toISOString();

      // 新しいサマリーを生成（実際にはサンプルの内容）
      const newSummary: ChatSummary = {
        userId: summaryData.userId || '',
        timestamp,
        title: '新しいチャットサマリー',
        summary: `【会話サマリー】\n最新の質問: ${summaryData.latestQuestion}\n\n対話の概要:\n- 新しい議論が開始されました\n- 重要なポイントが共有されました\n- 次のステップが決定されました`,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      // ローカル状態を更新
      setSummaries(prev => [newSummary, ...prev]);

      return {
        summary: newSummary.summary,
        timestamp: newSummary.timestamp,
      };
    } catch {
      setError('Failed to create summary');
      return null;
    }
  };

  // 全サマリー履歴を取得
  const fetchSummaryHistory = useCallback(async () => {
    await fetchSummary();
  }, [fetchSummary]);

  // 新しいサマリーを生成（LLM使用）
  const generateSummary = useCallback(async (targetChatId: string) => {
    try {
      setIsGenerating(true);
      setError(null);

      console.log('Generating new summary for chatId:', targetChatId);

      const response = await fetch('/api/chat/summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chatId: targetChatId }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }

      const result = await response.json();

      if (result.success && result.data) {
        setSummary(result.data);
        console.log('Summary generated successfully');
        return result.data;
      } else {
        throw new Error(result.error || 'Failed to generate summary');
      }
    } catch (err) {
      setError('Failed to generate summary');
      console.error('Summary generation error:', err);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, []); // 依存配列は空（内部の状態更新のみ）

  useEffect(() => {
    if (userId || chatId) {
      if (timestamp) {
        fetchSummary(timestamp);
      } else if (chatId) {
        fetchSummary(undefined, chatId);
      } else {
        fetchSummaryHistory();
      }
    }
  }, [userId, timestamp, chatId]); // 関数を依存配列から除外

  return {
    summary,
    summaries,
    isLoading,
    isGenerating,
    error,
    fetchSummary,
    generateSummary,
    createSummary,
    fetchSummaryHistory,
    clearError: () => setError(null),
  };
}
