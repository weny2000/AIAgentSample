'use client';

import { useSession, signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { MessageSquare, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useAuthSkip } from './AuthProvider';

interface AuthChatButtonProps {
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
}

export default function AuthChatButton({
  size = 'lg',
  className,
}: AuthChatButtonProps) {
  const { data: session, status } = useSession();
  const { isSkipMode } = useAuthSkip();

  const handleChatStart = () => {
    if (!session) {
      // 未認証の場合、Cognitoでサインイン
      signIn('cognito');
    }
  };

  // 認証スキップモードまたは認証済みの場合、チャットページへ遷移
  if (isSkipMode || session) {
    return (
      <Link href="/chat">
        <Button size={size} className={className}>
          <MessageSquare className="h-5 w-5" />
          チャットを開始
          <ArrowRight className="h-5 w-5" />
        </Button>
      </Link>
    );
  }

  if (status === 'loading') {
    return (
      <Button size={size} className={className} disabled>
        <MessageSquare className="h-5 w-5" />
        読み込み中...
        <ArrowRight className="h-5 w-5" />
      </Button>
    );
  }

  // 未認証の場合、サインインボタン
  return (
    <Button size={size} className={className} onClick={handleChatStart}>
      <MessageSquare className="h-5 w-5" />
      サインインしてチャット開始
      <ArrowRight className="h-5 w-5" />
    </Button>
  );
}
