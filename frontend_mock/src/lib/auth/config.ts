import { type NextAuthOptions } from 'next-auth';
import { type JWT } from 'next-auth/jwt';
import { type User, type Account, type Session } from 'next-auth';
import CognitoProvider from 'next-auth/providers/cognito';

const cognitoClientId = process.env.COGNITO_CLIENT_ID;
const cognitoClientSecret = process.env.COGNITO_CLIENT_SECRET;
const cognitoIssuer = process.env.COGNITO_ISSUER;

if (!cognitoClientId || !cognitoClientSecret || !cognitoIssuer) {
  throw new Error('Missing required Cognito environment variables');
}

export const authConfig: NextAuthOptions = {
  providers: [
    CognitoProvider({
      clientId: cognitoClientId,
      clientSecret: cognitoClientSecret,
      issuer: cognitoIssuer,
      authorization: {
        params: {
          scope: 'openid email',
          response_type: 'code',
          lang: 'ja',
          ui_locales: 'ja-JP',
        },
      },
      // NextAuthのサインインページをスキップしてCognitoに直接リダイレクト
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  debug: process.env.NODE_ENV === 'development',
  callbacks: {
    async jwt({ token, account, user }) {
      // 初回サインイン時にCognitoの情報を保存
      if (account && user) {
        token.cognitoSub = user.id; // プライマリキー（Cognito Sub）
        token.email = user.email; // 表示用
        token.accessToken = account.access_token; // AWS API用
        token.refreshToken = account.refresh_token;

        // ID トークンから追加情報を取得
        if (account.id_token) {
          try {
            const idTokenPayload = JSON.parse(
              Buffer.from(account.id_token.split('.')[1], 'base64').toString()
            );
            token.username = idTokenPayload['cognito:username'];
            token.groups = idTokenPayload['cognito:groups'] || [];
          } catch (error) {
            console.error('ID token parsing error:', error);
          }
        }
      }
      return token;
    },

    async session({ session, token }) {
      // クライアントにはユーザーIDを送信しない（セキュリティ方針）
      if (session.user) {
        session.user.email = token.email;
        session.user.name = token.name;
      }
      // token.cognitoSub はサーバー側でのみ使用し、クライアントには送信しない
      return session;
    },

    async redirect({ url, baseUrl }) {
      // サインイン後のリダイレクト先を制御
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      else if (new URL(url).origin === baseUrl) return url;
      // デフォルトでチャットページにリダイレクト
      return `${baseUrl}/chat`;
    },
  },
};
