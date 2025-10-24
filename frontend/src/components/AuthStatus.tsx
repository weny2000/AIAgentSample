'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { User, LogOut } from 'lucide-react';
import { useAuthSkip } from './AuthProvider';

export default function AuthStatus() {
  const { data: session, status } = useSession();
  const { isSkipMode, mockUser } = useAuthSkip();

  // 認証スキップモードの場合
  if (isSkipMode && mockUser) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-sm">
          <User className="h-4 w-4" />
          <span>{mockUser.user.email}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => console.log('開発モードではサインアウトできません')}
          className="gap-1"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">ログアウト</span>
        </Button>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <Badge variant="secondary" className="animate-pulse">
        読み込み中...
      </Badge>
    );
  }

  if (session) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-sm">
          <User className="h-4 w-4" />
          <span>{session.user?.email || session.user?.name}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => signOut()}
          className="gap-1"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">ログアウト</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Badge variant="secondary" className="hidden sm:flex">
        Beta Version
      </Badge>
      <Button variant="outline" size="sm" onClick={() => signIn('cognito')}>
        サインイン
      </Button>
    </div>
  );
}
