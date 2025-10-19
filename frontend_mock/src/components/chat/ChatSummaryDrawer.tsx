/**
 * チャットサマリーとネットワーク図表示用のDrawerコンポーネント
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

  // カスタムフックを使用
  const {
    summary,
    summaries,
    isLoading,
    error,
    fetchSummary,
    fetchSummaryHistory,
  } = useChatSummary(userId, timestamp);

  const { fetchNetworkGraph, error: networkError } = useNetworkGraph(userId);

  // データの更新（カスタムフック使用）
  const refreshData = async () => {
    await fetchSummary();
  };

  // useEffectは不要（カスタムフックが自動で呼び出し）

  if (!isOpen) {
    return null;
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Chat Analysis</h2>
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

      {(error || networkError) && (
        <div className="p-4 text-sm text-red-600 bg-red-50 border-b">
          {error || networkError}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={value => setActiveTab(value as 'current' | 'history')}
        >
          <TabsList className="w-full">
            <TabsTrigger value="current" className="flex-1">
              Current Chat
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="h-full mt-0">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-4">
                {/* サマリー表示 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Chat Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    ) : summary ? (
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">{summary.title}</h4>
                        <div className="text-sm text-gray-600 whitespace-pre-wrap">
                          {summary.summary}
                        </div>
                        <div className="text-xs text-gray-400">
                          Updated:{' '}
                          {new Date(summary.updatedAt).toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 text-center py-4">
                        No summary available for this chat
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* ネットワーク図表示 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Network Graph</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <Skeleton className="h-40 w-full" />
                    ) : summary?.networkGraph ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <iframe
                            src={summary.networkGraph}
                            className="w-full h-40 border rounded"
                            title="Network Graph"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              window.open(summary.networkGraph, '_blank')
                            }
                            className="flex items-center gap-2"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Open Full View
                          </Button>
                          {summary.networkJson && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                window.open(summary.networkJson, '_blank')
                              }
                              className="flex items-center gap-2"
                            >
                              JSON Data
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 text-center py-8">
                        No network graph available
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="history" className="h-full mt-0">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-3">
                {summaries.length === 0 ? (
                  <div className="text-sm text-gray-500 text-center py-8">
                    No chat history found
                  </div>
                ) : (
                  summaries.map(historySummary => (
                    <Card
                      key={historySummary.timestamp}
                      className="cursor-pointer hover:bg-gray-50"
                    >
                      <CardContent className="p-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-sm line-clamp-1">
                              {historySummary.title}
                            </h4>
                            <span className="text-xs text-gray-400">
                              {new Date(
                                historySummary.createdAt
                              ).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-2">
                            {historySummary.summary}
                          </p>
                          <div className="flex gap-1">
                            {historySummary.networkGraph && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={e => {
                                  e.stopPropagation();
                                  window.open(
                                    historySummary.networkGraph,
                                    '_blank'
                                  );
                                }}
                                className="text-xs h-6"
                              >
                                View Graph
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
