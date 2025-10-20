## チャット一覧＆サマリー用テーブル

| 項目           | 型       | 説明                          |
| -------------- | -------- | ----------------------------- |
| userId (PK)    | String   | ユーザーID                    |
| timestamp (SK) | Datetime | メッセージタイムスタンプ      |
| title          | String   | チャットタイトル              |
| summary        | String   | サマリー                      |
| networkGraph   | String   | ネットワーク図URL             |
| networkJson    | String   | ネットワークのJSONファイルURL |

## 2. UserProfiles テーブル

ユーザープロフィールの管理（1ユーザーあたり複数プロフィール可能）

| 項目           | 型      | 説明                           |
| -------------- | ------- | ------------------------------ |
| userId (PK)    | String  | ユーザーID                     |
| profileId (SK) | String  | プロフィールID（UUID等）       |
| role           | String  | ユーザーの役割                 |
| skills         | String  | ユーザーのスキル               |
| isDefault      | Boolean | デフォルトプロフィールかどうか |
| createdAt      | String  | 作成日時 (ISO 8601)            |
| updatedAt      | String  | 更新日時 (ISO 8601)            |
