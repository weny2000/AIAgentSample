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
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({
      token,
      account,
      user,
    }: {
      token: JWT;
      account: Account | null;
      user: User;
    }) {
      // 必要に応じてトークンに情報を追加
      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      // セッションにカスタム情報を追加可能
      return session;
    },
  },
};
