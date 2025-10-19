# DynamoDB 分離テーブル設計

## テーブル構成

### 1. ChatSummary テーブル

チャットの概要情報を管理

| 項目           | 型     | 説明                |
| -------------- | ------ | ------------------- |
| userId (PK)    | String | ユーザーID          |
| updatedAt (SK) | String | 更新日時 (ISO 8601) |
| chatId         | String | チャットID          |
| title          | String | チャットタイトル    |
| createdAt      | String | 作成日時 (ISO 8601) |

### 2. ChatMessages テーブル

チャットメッセージの詳細を管理

| 項目           | 型     | 説明                      |
| -------------- | ------ | ------------------------- |
| chatId (PK)    | String | チャットID                |
| timestamp (SK) | String | メッセージタイムスタンプ  |
| userId         | String | ユーザーID                |
| role           | String | 'user' または 'assistant' |
| content        | String | メッセージ内容            |

## アクセスパターン

### ChatSummary テーブル

- **チャット一覧取得**: `PK = userId` (自動的に更新日時順でソート)
- **特定チャット情報取得**: `PK = userId AND SK = updatedAt` または chatId で検索

### ChatMessages テーブル

- **チャットメッセージ取得**: `PK = chatId` (時系列順)
- **新規メッセージ追加**: chatId + timestamp で挿入

## GSI (Global Secondary Index)

- 今回は不要

## 操作例

### チャット一覧表示（チャット画面のサイドバー）

1. ChatSummary テーブルから `userId` でクエリ
2. 自動的に `updatedAt` (SK) でソートされて取得

### チャット詳細表示（チャット画面のメイン）

1. チャット一覧から、チャットを選択（chatIdを取得）
2. ChatMessages テーブルから `chatId` でクエリ
3. メッセージを `timestamp` 順で取得

### 新規メッセージ追加

1. ChatMessages テーブルに新規メッセージ挿入
2. ChatSummary テーブルの `updatedAt` を更新
