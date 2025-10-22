/**
 * チャットサマリーとネットワーク図表示用のDrawerコンポーネント
 */

'use client';

import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, ExternalLink, Maximize2, Minimize2, X } from 'lucide-react';
import { useNetworkGraph } from '@/hooks/useNetworkGraph';
import { ChatSummary } from '@/lib/types';

interface ChatSummaryDrawerProps {
  userId: string;
  chatId?: string;
  timestamp?: string;
  isOpen?: boolean;
  className?: string;
  focusNodeId?: string; // フォーカスする人名を指定
  summary?: ChatSummary | null; // 親から渡されるサマリーデータ
  isGenerating?: boolean; // 親から渡される生成状態
  error?: string | null; // 親から渡されるエラー状態
  isNetworkExpanded?: boolean; // 親から渡されるネットワーク図拡大状態
  setIsNetworkExpanded?: (expanded: boolean) => void; // 親の状態を更新する関数
}

export default function ChatSummaryDrawer({
  userId,
  isOpen = true,
  className = '',
  focusNodeId = 'alice_tanaka', // デフォルトでalice_tanakaにフォーカス
  summary,
  isGenerating = false,
  error,
  isNetworkExpanded: parentIsNetworkExpanded = false,
  setIsNetworkExpanded: parentSetIsNetworkExpanded,
}: ChatSummaryDrawerProps) {
  const { error: networkError } = useNetworkGraph(userId);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 親から状態管理を受け取る場合はそれを使用、そうでなければローカル状態を使用
  const [localIsNetworkExpanded, setLocalIsNetworkExpanded] = useState(false);
  const isNetworkExpanded = parentSetIsNetworkExpanded
    ? parentIsNetworkExpanded
    : localIsNetworkExpanded;
  const setIsNetworkExpanded =
    parentSetIsNetworkExpanded || setLocalIsNetworkExpanded;

  // useEffectは不要（カスタムフックが自動で呼び出し）

  if (!isOpen) {
    return null;
  }

  return (
    <div className={`h-screen flex flex-col ${className}`}>
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Chat Analysis</h2>
      </div>

      {(error || networkError) && (
        <div className="p-4 text-sm text-red-600 bg-red-50 border-b">
          {error || networkError}
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col">
        {/* サマリー表示 - 残りのスペースを使用してスクロール可能 */}
        <div className="flex-1 overflow-hidden p-4 pb-2">
          <Card className="h-full flex flex-col">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="text-sm">チャットの要約</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              <ScrollArea className="h-full w-full p-4">
                {isGenerating ? (
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
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* ネットワーク図表示 - 下部に固定、固定高さ */}
        <div className="flex-shrink-0 px-4 py-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">ネットワーク図</CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsNetworkExpanded(!isNetworkExpanded)}
                  className="flex items-center gap-1 h-8 px-2"
                >
                  {isNetworkExpanded ? (
                    <Minimize2 className="h-3 w-3" />
                  ) : (
                    <Maximize2 className="h-3 w-3" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    window.open(
                      `/team_network.html?focus=${focusNodeId}`,
                      '_blank'
                    )
                  }
                  className="flex items-center gap-1 h-8 px-2"
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-0 m-0">
              <div className="h-60">
                <iframe
                  ref={iframeRef}
                  src={`/team_network.html?focus=${focusNodeId}`}
                  className="w-full h-full border-0 rounded-b-lg"
                  title="Team Network Diagram"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
