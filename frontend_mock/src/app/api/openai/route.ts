import { NextRequest, NextResponse } from 'next/server';
import {
  ChatRequestObject,
  ChatResponseObject,
  ApiResponse,
} from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<ChatResponseObject>>> {
  try {
    const body: ChatRequestObject = await request.json();
    const { chatId, message } = body;

    // バリデーション
    if (!chatId || !message || !message.mainPrompt) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request: chatId and message.mainPrompt are required',
        },
        { status: 400 }
      );
    }

    // 2.0秒の遅延を追加してロード状態を確認できるようにする
    await new Promise(resolve => setTimeout(resolve, 2000));

    // モックレスポンスの生成
    const mockResponses = [
      `ご質問いただきありがとうございます。**${message.userRole || 'エンジニア'}**として、**${message.userSkills || '技術スキル'}**を活用した観点からお答えします。

${message.mainPrompt}について、以下のような観点で考察してみました：

## 主なポイント

- **実装方法**: モダンな技術スタックを活用した効率的なアプローチ
- **ベストプラクティス**: 業界標準に沿った開発手法の適用
- **パフォーマンス**: スケーラビリティと保守性を考慮した設計

## 具体的な提案

1. **アーキテクチャ設計**: 要件に応じた最適な技術選択
2. **実装戦略**: 段階的な開発アプローチ
3. **品質保証**: テスト駆動開発とコードレビュー

さらに詳しい情報が必要でしたら、具体的な技術的詳細についてもお答えできます。何かご不明な点はございますか？`,

      `**${message.userRole || 'プロフェッショナル'}**の視点から、**${message.userSkills || '専門スキル'}**を踏まえてお答えします。

## ${message.mainPrompt}について

この課題に対する包括的なアプローチをご提案いたします：

### 分析フェーズ
- 現状の課題と要件の詳細分析
- ステークホルダーのニーズ把握
- 技術的制約と機会の評価

### 解決策の設計
- 最適なソリューションアーキテクチャの構築
- リスク評価と軽減戦略
- 実装ロードマップの策定

### 実行計画
1. 要件定義とプロトタイプ作成
2. 段階的な実装と検証
3. パフォーマンステストと最適化
4. デプロイとモニタリング

### 成功要因
- チームコラボレーション
- 継続的な改善
- ユーザーフィードバックの活用

このアプローチにより、効率的で持続可能なソリューションを実現できると考えています。`,

      `ありがとうございます！**${message.userRole || 'エキスパート'}**としての経験と**${message.userSkills || '専門知識'}**を活かして、詳しく解説いたします。

# ${message.mainPrompt}

## 概要

この分野においては、以下の要素が重要になります：

### 技術的観点
- **最新技術の活用**: 効率性と革新性のバランス
- **セキュリティ**: データ保護とプライバシー対策
- **スケーラビリティ**: 将来の成長を見据えた設計

### ビジネス観点
- **ROI最大化**: 投資対効果の最適化
- **ユーザー体験**: 直感的で使いやすいインターフェース
- **競争優位性**: 市場での差別化要因

## 実装戦略

### フェーズ1: 基盤構築
- 要件分析と技術選定
- プロトタイプ開発
- PoC（概念実証）の実施

### フェーズ2: 開発・テスト
- アジャイル開発手法の採用
- 継続的インテグレーション
- 品質保証プロセス

### フェーズ3: デプロイ・運用
- 段階的リリース
- モニタリングとログ分析
- 継続的改善

詳細について、特定の側面をさらに深掘りしたい点はございますか？`,
    ];

    // ランダムに応答を選択
    const randomResponse =
      mockResponses[Math.floor(Math.random() * mockResponses.length)];

    const response: ChatResponseObject = {
      messageId: uuidv4(),
      content: randomResponse,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error processing chat request:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process chat request',
      },
      { status: 500 }
    );
  }
}
