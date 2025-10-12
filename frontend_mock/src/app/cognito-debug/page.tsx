'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink, Settings } from 'lucide-react';

export default function CognitoTestPage() {
  const cognitoHostedUIUrl = `https://your-cognito-domain.auth.us-west-2.amazoncognito.com/login?client_id=${process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID}&response_type=code&scope=email+openid+profile&redirect_uri=${encodeURIComponent('http://localhost:3000/api/auth/callback/cognito')}`;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl font-bold text-center">
            Cognito設定デバッグ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 現在の設定表示 */}
          <div className="bg-gray-100 p-4 rounded-lg space-y-2">
            <h3 className="font-semibold">現在の環境変数</h3>
            <div className="text-sm space-y-1">
              <p>
                <strong>COGNITO_CLIENT_ID:</strong>{' '}
                {process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '未設定'}
              </p>
              <p>
                <strong>COGNITO_ISSUER:</strong>{' '}
                {process.env.NEXT_PUBLIC_COGNITO_ISSUER || '未設定'}
              </p>
              <p>
                <strong>NEXTAUTH_URL:</strong> http://localhost:3000
              </p>
            </div>
          </div>

          {/* Hosted UI設定手順 */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-800 mb-3">
              <Settings className="inline h-4 w-4 mr-1" />
              Hosted UI設定手順（AWSコンソール）
            </h3>
            <div className="text-sm text-blue-700 space-y-3">
              <div>
                <h4 className="font-semibold">1. User Pool → アプリクライアント設定</h4>
                <ul className="ml-4 space-y-1 list-disc">
                  <li>AWSコンソール → Cognito → ユーザープール</li>
                  <li>User Pool: <code>us-west-2_OBddYFoLa</code></li>
                  <li>「アプリの統合」→「アプリクライアント」</li>
                  <li>Client ID: <code>5787g9fap5dmd9esilbo46e732</code></li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-semibold">2. 必須設定項目</h4>
                <ul className="ml-4 space-y-1 list-disc">
                  <li>✅ Hosted UIを有効にする</li>
                  <li>✅ コールバックURL: <code>http://localhost:3000/api/auth/callback/cognito</code></li>
                  <li>✅ サインアウトURL: <code>http://localhost:3000</code></li>
                  <li>✅ OAuth フロー: Authorization code grant</li>
                  <li>✅ OAuth スコープ: email, openid, profile</li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold">3. ドメイン設定</h4>
                <ul className="ml-4 space-y-1 list-disc">
                  <li>「アプリの統合」→「ドメイン」</li>
                  <li>Cognito提供ドメインまたはカスタムドメイン設定</li>
                  <li>例: <code>your-app.auth.us-west-2.amazoncognito.com</code></li>
                </ul>
              </div>
            </div>
          </div>

          {/* テストボタン */}
          <div className="space-y-3">
            <Button
              onClick={() =>
                (window.location.href = '/api/auth/signin/cognito')
              }
              className="w-full"
            >
              NextAuth経由でCognitoサインイン
            </Button>

            <Button
              variant="outline"
              onClick={() => {
                console.log('Debug info:', {
                  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID,
                  issuer: process.env.NEXT_PUBLIC_COGNITO_ISSUER,
                  callbackUrl:
                    'http://localhost:3000/api/auth/callback/cognito',
                });
              }}
              className="w-full"
            >
              <Settings className="h-4 w-4 mr-2" />
              コンソールにデバッグ情報を出力
            </Button>
          </div>

          {/* 手順 */}
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-800 mb-2">解決手順</h3>
            <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
              <li>AWS Cognitoコンソールでアプリクライアント設定を確認</li>
              <li>Hosted UIが有効になっていることを確認</li>
              <li>コールバックURLが正しく設定されていることを確認</li>
              <li>OAuth設定が正しいことを確認</li>
              <li>上のボタンでテスト実行</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
