'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

export default function ChatPage() {
  const router = useRouter();

  useEffect(() => {
    // ユニークなchatIdを生成してリダイレクト
    const newChatId = uuidv4();
    router.push(`/chat/${newChatId}`);
  }, [router]);

  // リダイレクト中の表示（通常は一瞬で切り替わる）
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="text-muted-foreground">チャットを準備しています...</p>
      </div>
    </div>
  );
}
