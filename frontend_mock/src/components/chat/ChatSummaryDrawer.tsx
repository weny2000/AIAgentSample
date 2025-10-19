/**
 * チャットサマリーとネットワーク図表示用のDrawerコンポーネント
 */

'use client';

import React, { useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, ExternalLink } from 'lucide-react';
import { ChatSummary } from '@/lib/types';
import { useChatSummary } from '@/hooks/useChatSummary';
import { useNetworkGraph } from '@/hooks/useNetworkGraph';

interface ChatSummaryDrawerProps {
  userId: string;
  chatId?: string;
  timestamp?: string;
  isOpen?: boolean;
  className?: string;
}

export default function ChatSummaryDrawer({
  userId,
  chatId,
  timestamp,
  isOpen = true,
  className = '',
}: ChatSummaryDrawerProps) {
  // カスタムフックを使用 - chatIdを優先して使用
  const {
    summary,
    isLoading,
    isGenerating,
    error,
    fetchSummary,
    generateSummary,
  } = useChatSummary(userId, timestamp, chatId);

  const { fetchNetworkGraph, error: networkError } = useNetworkGraph(userId);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // データの更新（カスタムフック使用）
  const refreshData = async () => {
    console.log('Refreshing summary data...', { userId, chatId, timestamp });
    if (chatId) {
      await fetchSummary(undefined, chatId, true);
    } else {
      await fetchSummary();
    }
  };

  // useEffectは不要（カスタムフックが自動で呼び出し）

  if (!isOpen) {
    return null;
  }

  return (
    <div className={`h-screen flex flex-col ${className}`}>
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Chat Analysis</h2>
        <div className="flex items-center gap-2">
          {chatId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateSummary(chatId)}
              disabled={isGenerating}
              className="flex items-center gap-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`}
              />
              {isGenerating ? 'Generating...' : 'Generate'}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshData}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      {(error || networkError) && (
        <div className="p-4 text-sm text-red-600 bg-red-50 border-b">
          {error || networkError}
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-4">
          {/* サマリー表示 - スクロール可能 */}
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-sm">Chat Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-80 overflow-hidden">
                <ScrollArea className="h-full w-full p-4">
                  {isLoading || isGenerating ? (
                    <div className="space-y-3">
                      {isGenerating && (
                        <div className="text-sm text-blue-600 font-medium flex items-center gap-2 mb-4">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          AIがサマリーを生成中...
                        </div>
                      )}
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-3 w-1/3" />
                      <div className="pt-2">
                        <Skeleton className="h-6 w-20" />
                      </div>
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-4/5" />
                      <Skeleton className="h-3 w-3/5" />
                    </div>
                  ) : summary ? (
                    <div className="space-y-3 pr-2">
                      <h4 className="font-medium text-sm text-gray-900">
                        {summary.title}
                      </h4>
                      <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                        {summary.summary}
                      </div>
                      <div className="text-xs text-gray-400 pt-2 border-t">
                        Updated: {new Date(summary.updatedAt).toLocaleString()}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 text-center py-8">
                      <div className="mb-2">
                        No summary available for this chat
                      </div>
                      <div className="text-xs">
                        Start a conversation to generate a summary!
                      </div>
                      {process.env.NODE_ENV === 'development' && (
                        <div className="mt-2 text-xs text-blue-600">
                          Debug: userId={userId}, chatId={chatId}, timestamp=
                          {timestamp}
                        </div>
                      )}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </CardContent>
          </Card>

          {/* ネットワーク図表示 - 固定高さ */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">Network Graph</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open('/team_network.html', '_blank')}
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-3 w-3" />
                Open Full View
              </Button>
            </CardHeader>
            <CardContent className="p-0 pb-0 m-0">
              <iframe
                ref={iframeRef}
                src="/team_network.html"
                className="w-full border-0 rounded-b-lg"
                title="Team Network Diagram"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
