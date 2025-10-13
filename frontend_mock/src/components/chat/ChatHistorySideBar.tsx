'use client';

import { ChatHistorySummaryObject } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { maskEmail } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from '@/components/ui/sidebar';
import {
  Plus,
  MessageSquare,
  User,
  Clock,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { v4 as uuidv4 } from 'uuid';

interface ChatHistorySideBarProps {
  histories: ChatHistorySummaryObject[];
  currentChatId: string | null;
  isLoading?: boolean;
  isMobile?: boolean;
}

export function ChatHistorySideBar({
  histories,
  currentChatId,
  isLoading = false,
  isMobile = false,
}: ChatHistorySideBarProps) {
  const router = useRouter();
  const { data: session } = useSession();

  const handleNewChat = () => {
    const newChatId = uuidv4();
    router.push(`/chat/${newChatId}`);
  };

  const handleChatSelect = (chatId: string) => {
    if (chatId !== currentChatId) {
      router.push(`/chat/${chatId}`);
    }
  };

  const handleProfileEdit = () => {
    // プロフィール編集機能（未実装）
    console.log('プロフィール編集が選択されました');
  };

  const handleSignOut = () => {
    // サインアウト機能（未実装）
    console.log('サインアウトが選択されました');
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return '今日';
    } else if (diffDays === 1) {
      return '昨日';
    } else if (diffDays < 7) {
      return `${diffDays}日前`;
    } else {
      return date.toLocaleDateString('ja-JP', {
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const sortedHistories = [...histories].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  // ユーザー表示情報を取得
  const getUserDisplayName = () => {
    return (
      session?.user?.name || session?.user?.email?.split('@')[0] || 'ユーザー'
    );
  };

  const getUserDisplayEmail = () => {
    return session?.user?.email
      ? maskEmail(session.user.email)
      : 'メール未設定';
  };

  // モバイル表示用のコンテンツ
  const sidebarContent = (
    <>
      {/* ユーザープロフィール - ドロップダウンメニュー */}
      <div className="p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-3 mb-4 w-full justify-start p-2 h-auto"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">{getUserDisplayName()}</p>
                <p className="text-xs text-muted-foreground">
                  {getUserDisplayEmail()}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuItem onClick={handleProfileEdit}>
              <Settings className="mr-2 h-4 w-4" />
              プロフィール編集
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              サインアウト
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          onClick={handleNewChat}
          className="w-full justify-start gap-2"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          新しいチャット
        </Button>
      </div>

      <Separator />

      <div className="flex-1 overflow-y-auto px-2">
        <div className="p-2">
          <h3 className="text-sm font-medium text-muted-foreground mb-2 px-2">
            チャット履歴
          </h3>
        </div>

        {isLoading ? (
          // ローディング中のスケルトン
          <div className="space-y-2 px-2">
            {[...Array(5)].map((_, index) => (
              <div
                key={index}
                className="h-16 bg-muted animate-pulse rounded-md"
              />
            ))}
          </div>
        ) : sortedHistories.length === 0 ? (
          // チャット履歴がない場合
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              チャット履歴がありません
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              新しいチャットを始めましょう
            </p>
          </div>
        ) : (
          // チャット履歴リスト
          <div className="space-y-1 px-2">
            {sortedHistories.map(history => (
              <div key={history.chatId}>
                <Button
                  variant="ghost"
                  onClick={() => handleChatSelect(history.chatId)}
                  className={`w-full h-auto p-3 flex flex-col items-start gap-1 hover:bg-muted/50 transition-colors ${
                    currentChatId === history.chatId
                      ? 'bg-muted border-l-2 border-primary'
                      : ''
                  }`}
                >
                  <div className="flex items-start justify-between w-full">
                    <h4 className="text-sm font-medium truncate flex-1 text-left">
                      {history.title}
                    </h4>
                    {currentChatId === history.chatId && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        現在
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{formatDate(history.updatedAt)}</span>
                  </div>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 border-t">
        <div className="text-xs text-muted-foreground text-center">
          AI チャットボット v1.0
        </div>
      </div>
    </>
  );

  // モバイル表示の場合は単純なdivレイアウト、デスクトップは通常のSidebarコンポーネント
  if (isMobile) {
    return (
      <div className="h-full flex flex-col bg-background">{sidebarContent}</div>
    );
  }

  return (
    <Sidebar className="w-80 border-r">
      <SidebarHeader className="p-4">
        {/* ユーザープロフィール - ドロップダウンメニュー */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-3 mb-4 w-full justify-start p-2 h-auto"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left">
                <p className="text-sm font-medium">{getUserDisplayName()}</p>
                <p className="text-xs text-muted-foreground">
                  {getUserDisplayEmail()}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start">
            <DropdownMenuItem onClick={handleProfileEdit}>
              <Settings className="mr-2 h-4 w-4" />
              プロフィール編集
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              サインアウト
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          onClick={handleNewChat}
          className="w-full justify-start gap-2"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          新しいチャット
        </Button>
      </SidebarHeader>

      <Separator />

      <SidebarContent className="px-2">
        <SidebarMenu>
          <div className="p-2">
            <h3 className="text-sm font-medium text-muted-foreground mb-2 px-2">
              チャット履歴
            </h3>
          </div>

          {isLoading ? (
            // ローディング中のスケルトン
            <div className="space-y-2 px-2">
              {[...Array(5)].map((_, index) => (
                <div
                  key={index}
                  className="h-16 bg-muted animate-pulse rounded-md"
                />
              ))}
            </div>
          ) : sortedHistories.length === 0 ? (
            // チャット履歴がない場合
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                チャット履歴がありません
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                新しいチャットを始めましょう
              </p>
            </div>
          ) : (
            // チャット履歴リスト
            <div className="space-y-1 px-2">
              {sortedHistories.map(history => (
                <SidebarMenuItem key={history.chatId}>
                  <SidebarMenuButton
                    onClick={() => handleChatSelect(history.chatId)}
                    className={`w-full h-auto p-3 flex flex-col items-start gap-1 hover:bg-muted/50 transition-colors ${
                      currentChatId === history.chatId
                        ? 'bg-muted border-l-2 border-primary'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between w-full">
                      <h4 className="text-sm font-medium truncate flex-1 text-left">
                        {history.title}
                      </h4>
                      {currentChatId === history.chatId && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          現在
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{formatDate(history.updatedAt)}</span>
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </div>
          )}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="text-xs text-muted-foreground text-center">
          AI チャットボット v1.0
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
