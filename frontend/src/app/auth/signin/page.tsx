'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SignInPage() {
  const router = useRouter();

  useEffect(() => {
    // NextAuthのCognito認証URLを使用してリダイレクト
    console.log('Redirecting to NextAuth Cognito signin...');
    window.location.href = '/api/auth/signin/cognito';
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Cognitoにリダイレクト中...</h1>
        <p>AWS Cognito認証ページに移動しています。</p>
      </div>
    </div>
  );
}
