'use client';

import { SessionProvider } from 'next-auth/react';
import { createContext, useContext } from 'react';

// 認証スキップモードのコンテキスト
const AuthSkipContext = createContext<{
  isSkipMode: boolean;
  mockUser: any;
}>({
  isSkipMode: false,
  mockUser: null,
});

export const useAuthSkip = () => useContext(AuthSkipContext);

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // 開発時に認証をスキップするかどうか（ここをtrueにすると認証をスキップ）
  const isSkipMode = true; // 一時的に認証をスキップ
  
  const mockUser = {
    user: {
      email: 'dev@example.com',
      name: '開発ユーザー',
    },
  };

  return (
    <SessionProvider>
      <AuthSkipContext.Provider value={{ isSkipMode, mockUser }}>
        {children}
      </AuthSkipContext.Provider>
    </SessionProvider>
  );
}
