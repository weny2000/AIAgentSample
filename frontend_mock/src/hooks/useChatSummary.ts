/**
 * チャットサマリー管理用のカスタムフック（JSON データ版）
 */

'use client';

import { useState, useEffect } from 'react';
import {
  ChatSummary,
  CreateSummaryRequest,
  CreateSummaryResponse,
} from '@/lib/types';

export function useChatSummary(userId: string, timestamp?: string) {
  const [summary, setSummary] = useState<ChatSummary | null>(null);
  const [summaries, setSummaries] = useState<ChatSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // サマリーデータを取得（JSONファイルから）
  const fetchSummary = async (targetTimestamp?: string) => {
    if (!userId) return;

    try {
      setIsLoading(true);
      setError(null);

      // サンプルデータからサマリーを読み込み
      const response = await fetch('/summaries.json');
      if (!response.ok) {
        throw new Error('Failed to load summaries');
      }

      const data: ChatSummary[] = await response.json();

      // 指定されたuserIdのサマリーのみフィルタリング
      const userSummaries = data.filter(sum => sum.userId === userId);

      if (targetTimestamp) {
        const targetSummary = userSummaries.find(
          sum => sum.timestamp === targetTimestamp
        );
        setSummary(targetSummary || null);
      } else {
        setSummaries(userSummaries);
      }
    } catch (err) {
      setError('Failed to load summaries');
      console.error('Summary fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // サマリー生成・保存（サンプルデータ版）
  const createSummary = async (
    summaryData: CreateSummaryRequest
  ): Promise<CreateSummaryResponse | null> => {
    try {
      setError(null);

      const timestamp = new Date().toISOString();

      // 新しいサマリーを生成（実際にはサンプルの内容）
      const newSummary: ChatSummary = {
        userId: summaryData.userId,
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
    } catch (err) {
      setError('Failed to create summary');
      return null;
    }
  };

  // 全サマリー履歴を取得
  const fetchSummaryHistory = async () => {
    await fetchSummary();
  };

  useEffect(() => {
    if (userId) {
      if (timestamp) {
        fetchSummary(timestamp);
      } else {
        fetchSummaryHistory();
      }
    }
  }, [userId, timestamp]);

  return {
    summary,
    summaries,
    isLoading,
    error,
    fetchSummary,
    createSummary,
    fetchSummaryHistory,
    clearError: () => setError(null),
  };
}
