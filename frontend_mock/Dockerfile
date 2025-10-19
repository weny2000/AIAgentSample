FROM node:20-bookworm AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# ビルド時の環境変数を設定（実際の値は実行時に設定）
ENV COGNITO_CLIENT_ID=dummy
ENV COGNITO_CLIENT_SECRET=dummy
ENV COGNITO_ISSUER=dummy
ENV NEXTAUTH_URL=http://localhost:3000
ENV NEXTAUTH_SECRET=dummy
RUN npm run build

FROM node:20-bookworm AS production

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production
COPY --from=build /app/.next ./.next

# 実行時の環境変数を設定可能にする
ENV COGNITO_CLIENT_ID=""
ENV COGNITO_CLIENT_SECRET=""
ENV COGNITO_ISSUER=""
ENV NEXTAUTH_URL=""
ENV NEXTAUTH_SECRET=""

EXPOSE 3000
USER node
CMD ["npm", "start"]
