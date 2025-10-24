'use client';

import { useState, useEffect } from 'react';
import { ChatHistorySummaryObject, ApiResponse } from '@/lib/types';
import { ChatHistorySideBar } from '@/components/chat/ChatHistorySideBar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useAuthSkip } from '@/components/AuthProvider';

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const { isSkipMode } = useAuthSkip();
  const [chatHistories, setChatHistories] = useState<
    ChatHistorySummaryObject[]
  >([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // 現在のチャットIDを取得
  const currentChatId = pathname.split('/')[2] || null;

  // 認証チェック - レイアウトレベルで全チャット関連ページを保護
  useEffect(() => {
    // 認証スキップモードの場合は認証チェックをスキップ
    if (isSkipMode) return;
    
    if (status === 'loading') return; // セッションロード中は待機

    if (status === 'unauthenticated') {
      // 未認証の場合はホームページにリダイレクト
      router.push('/');
      return;
    }
  }, [status, router, isSkipMode]);

  // チャット履歴一覧の取得（認証済みまたはスキップモードの場合のみ実行）
  useEffect(() => {
    const fetchChatHistories = async () => {
      try {
        const response = await fetch('/api/db/chat');
        const result: ApiResponse<ChatHistorySummaryObject[]> =
          await response.json();

        if (result.success && result.data) {
          setChatHistories(result.data);
        } else {
          console.error('Failed to fetch chat histories:', result.error);
        }
      } catch (error) {
        console.error('Error fetching chat histories:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // 認証スキップモードまたは認証済みの場合のみチャット履歴を取得
    if (isSkipMode || status === 'authenticated') {
      fetchChatHistories();
    }
  }, [status, isSkipMode]);

  // サイドバートグル
  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // 認証チェック中または未認証の場合は何も表示しない（スキップモードは除く）
  if (!isSkipMode && (status === 'loading' || status === 'unauthenticated')) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="h-screen w-screen overflow-hidden">
        {/* モバイル用サイドバーオーバーレイ */}
        <div
          className={`
          lg:hidden fixed inset-0 z-50 transition-opacity duration-300
          ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
        `}
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={toggleSidebar}
          />
          <div
            className={`
            absolute left-0 top-0 h-full w-80 bg-background border-r shadow-lg transform transition-transform duration-300 ease-in-out
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
          >
            <div className="flex justify-end p-4 border-b">
              <Button variant="ghost" size="sm" onClick={toggleSidebar}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="h-full pb-16">
              <ChatHistorySideBar
                histories={chatHistories}
                currentChatId={currentChatId}
                isLoading={isLoading}
                isMobile={true}
              />
            </div>
          </div>
        </div>

        {/* デスクトップレイアウト - サイドバーとメインコンテンツを横並び */}
        <div className="hidden lg:flex h-screen">
          {/* デスクトップ用サイドバー */}
          <div className="w-80 h-full flex-shrink-0">
            <ChatHistorySideBar
              histories={chatHistories}
              currentChatId={currentChatId}
              isLoading={isLoading}
            />
          </div>

          {/* メインコンテンツエリア - 残り領域全体を使用 */}
          <div className="flex-1 flex flex-col h-full">
            {/* コンテンツエリア */}
            <div className="flex-1 flex flex-col w-full">{children}</div>
          </div>
        </div>

        {/* モバイルレイアウト */}
        <div className="lg:hidden flex flex-col h-screen">
          {/* ハンバーガーメニューボタン - 左上固定 */}
          <div className="absolute top-4 left-4 z-40">
            <Button
              variant="outline"
              size="sm"
              className="h-9 w-9 p-0 bg-background/90 backdrop-blur-sm border shadow-sm"
              onClick={toggleSidebar}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>

          {/* コンテンツエリア */}
          <div className="flex-1 flex flex-col w-full">{children}</div>
        </div>
      </div>
    </SidebarProvider>
  );
}
