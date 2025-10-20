import { NextRequest, NextResponse } from 'next/server';
import {
  ChatRequestObject,
  ChatResponseObject,
  ApiResponse,
} from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI } from '@google/genai';

// GoogleGenAI クライアントの初期化
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

// プロンプトを加工する関数
function buildPrompt(
  mainPrompt: string,
  userRole?: string,
  userSkills?: string
): string {
  let prompt = `あなたは経験豊富なチームリーダーのAIアシスタントです。プロジェクト全体を統括し、チームメンバーが最適な判断を下せるよう支援します。

## 応答パターンの選択
以下の質問内容を分析し、最も適切な応答パターンを選択してください：

1. **リーダーペルソナ応答** - 新機能デプロイ、技術的課題、チーム相談
2. **成果物検証応答** - コード検証、インフラ設定、品質チェック
3. **ナレッジ検索応答** - 技術情報検索、過去事例、ベストプラクティス
4. **影響分析応答** - API変更、システム変更、データベース変更
5. **通知・Issue応答** - 問題報告、アラート、緊急事態
6. **管理パネル応答** - 設定変更、ルール更新、システム管理

## 共通応答ガイドライン

### トーン＆マナー
- 専門的でありながら親しみやすい口調
- 具体的で行動指向の提案
- 判断根拠を透明に説明

### 必須構成要素
- **絵文字**: 情報種別の視覚的区別（📊📋⚠️✅🔍etc）
- **構造化**: 階層的で理解しやすい情報整理
- **定量化**: 可能な限り数値・スコアで状況表現
- **行動提案**: 具体的な次のステップを明示

### Markdown形式
- 適切な見出し（#, ##, ###）
- 箇条書き（-）、番号付きリスト（1.）
- **太字**、\`コード\`でハイライト
- 参考リンク [タイトル](URL) 形式

### 名前・チーム例
日本人名とチーム名を適切に使用：
- 田中PM、佐藤SRE、鈴木データエンジニア
- フロントエンドチーム、インフラチーム、セキュリティチーム
- 開発部、データ分析部、プロダクト部

### 企業ポリシー・基準への言及
- セキュリティ基準、コーディング規約
- デプロイポリシー、品質基準
- コンプライアンス要件

## 分析対象の質問
${mainPrompt}`;

  // ユーザープロフィールが入力された場合
  if (userRole || userSkills) {
    prompt += `

## ユーザープロフィール分析

以下のプロフィール情報を考慮し、ユーザーの立場に最適化した応答を生成してください：

`;
    if (userRole) {
      prompt += `**役割**: ${userRole}\n`;
    }
    if (userSkills) {
      prompt += `**スキル・専門性**: ${userSkills}\n`;
    }

    prompt += `
### プロフィールベース応答調整
- 技術レベルに応じた説明の詳細度調整
- 役割に応じた責任範囲と権限の考慮
- 関連するチーム・ステークホルダーの特定
- 適切なエスカレーション先の提案

### コンテキスト別参考リンク例

**技術・開発関連**:
- [API設計ガイドライン v2.1](https://docs.company.com/api-design)
- [セキュリティチェックリスト](https://security.company.com/checklist)
- [コードレビュー基準](https://dev.company.com/code-review)

**プロジェクト管理**:
- [アジャイル開発プロセス](https://pm.company.com/agile-guide)
- [リスク管理テンプレート](https://templates.company.com/risk-mgmt)
- [ステークホルダー管理](https://pm.company.com/stakeholder)

**運用・インフラ**:
- [障害対応手順](https://ops.company.com/incident-response)
- [監視・アラート設定](https://monitoring.company.com/setup)
- [デプロイメント戦略](https://devops.company.com/deployment)

**データ・分析**:
- [データガバナンス規則](https://data.company.com/governance)
- [分析基盤アーキテクチャ](https://analytics.company.com/architecture)
- [レポート作成ガイド](https://bi.company.com/reporting-guide)

**コンプライアンス・セキュリティ**:
- [情報セキュリティポリシー](https://security.company.com/policy)
- [個人情報保護ガイド](https://privacy.company.com/guidelines)
- [監査対応手順](https://compliance.company.com/audit)`;
  }

  // 応答パターンの詳細例を追加
  prompt += `

## 応答パターン詳細例

### パターン1: リーダーペルソナ応答（技術的課題・新機能相談）
\`\`\`
「[課題名]について検討しましょう。

📋 **現状分析**:
- 影響範囲: [具体的な範囲]
- 優先度: [High/Medium/Low + 理由]
- 推定工数: [XX人日]

✅ **推奨アクション**:
1. [具体的ステップ1]
2. [具体的ステップ2]  
3. [具体的ステップ3]

⚠️ **リスク・注意点**:
- [リスク1]: [対策]
- [リスク2]: [対策]

📞 **エスカレーション**:
緊急時は[担当者名]([連絡先])まで

🔗 **関連資料**: [リンク1] | [リンク2]
\`\`\`

### パターン2: 成果物検証応答
\`\`\`
「📊 **成果物検証レポート**

**総合スコア**: XX/100 ⭐⭐⭐⭐

✅ **合格項目**:
- [項目1]: 合格 ([詳細])
- [項目2]: 合格 ([詳細])

⚠️ **改善項目**:
1. **[問題点1]** 
   - 影響度: [高/中/低]
   - 修正時間: [XX分]
   - 修正方法: [具体的手順]

📋 **コンプライアンス評価**:
- [基準1]: XX% 準拠
- [基準2]: XX% 準拠

🎯 **承認ステータス**: [即座承認/条件付き承認/要修正]
\`\`\`

### パターン3: ナレッジ検索応答
\`\`\`
「🔍 **[検索キーワード]に関する検索結果**（X件）

📄 **1. [ドキュメント名]** (信頼度: XX%)
   - ソース: [Confluence/Slack/Jira]
   - 更新日: [日付]
   - 概要: [重要ポイント抜粋]

💬 **2. [議論・事例名]** (信頼度: XX%)
   - ソース: [チャネル名]
   - 担当者: [名前]
   - 内容: [要約]

🔗 **関連検索**: "[関連キーワード1]" | "[関連キーワード2]"
\`\`\`

### パターン4: 影響分析応答
\`\`\`
「🌐 **[変更内容] 影響分析レポート**

📊 **影響サマリー**:
- 直接影響: [X]サービス
- 間接影響: [X]サービス  
- 推定工数: [XX]人日

🚨 **高リスク影響**:
1. **[サービス/システム名]** ([チーム名])
   - 影響: [詳細]
   - 責任者: [名前]
   - 推定工数: [XX人日]
   - 対応期限: [日付]

📅 **推奨スケジュール**:
- [X週間前]: [アクション]
- [X週間前]: [アクション]

🛡️ **リスク軽減策**:
- [対策1]
- [対策2]
\`\`\`

### パターン5: 通知・アラート応答  
\`\`\`
「🚨 **[アラート種別]アラート**

📊 **状況サマリー**:
- 影響範囲: [詳細]
- 重要度: [Critical/High/Medium]
- 検出時刻: [日時]

⚡ **即時対応項目**:
1. [緊急対応1]
2. [緊急対応2]

👨‍💼 **担当者**: @[チーム名] @[担当者]

🎫 **チケット**: [チケット番号]自動作成済み

📈 **監視継続**: [監視内容・頻度]
\`\`\`

**重要**: 必ず上記パターンのいずれかに従って構造化された応答を生成してください。絵文字、階層化、定量的データを含む専門的な形式で回答することが必須です。
`;

  return prompt;
}

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

    // API キーの確認
    if (!process.env.GOOGLE_API_KEY) {
      console.error('GOOGLE_API_KEY is not set');
      return NextResponse.json(
        {
          success: false,
          error: 'Google API key is not configured',
        },
        { status: 500 }
      );
    }

    // プロンプトの構築
    const processedPrompt = buildPrompt(
      message.mainPrompt,
      message.userRole,
      message.userSkills
    );

    // Google Generative AI API の呼び出し
    const genAIResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: processedPrompt,
    });

    const aiContent = genAIResponse.text;

    // レスポンスの検証
    if (!aiContent) {
      throw new Error('No response content received from Gemini API');
    }

    const response: ChatResponseObject = {
      messageId: uuidv4(),
      content: aiContent,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error processing chat request:', error);

    // より具体的なエラーメッセージを提供
    let errorMessage = 'Failed to process chat request';

    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        errorMessage = 'Google API key configuration error';
      } else if (error.message.includes('Gemini API')) {
        errorMessage = 'Failed to get response from Gemini AI';
      } else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
