import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  MessageSquare,
  Sparkles,
  Zap,
  Shield,
  ArrowRight,
  Bot,
  Users,
  Globe,
  Target,
  BarChart3,
  Lightbulb,
  TrendingUp,
  Code2,
  Palette,
} from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold">Project AI Assistant</h1>
          </div>
          <Badge variant="secondary" className="hidden sm:flex">
            Beta Version
          </Badge>
        </div>
      </header>

      <main className="container mx-auto px-4">
        {/* Hero Section */}
        <section className="py-20 text-center">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                プロジェクトリーダーの
                <br />
                AI パートナー
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                経験豊富なプロジェクトマネージャーの視点から、技術課題やチーム運営に関する
                具体的で実践的なアドバイスを提供する専門AIアシスタントです。
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/chat">
                <Button size="lg" className="gap-2 text-lg px-8 py-6">
                  <MessageSquare className="h-5 w-5" />
                  チャットを開始
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <Button variant="outline" size="lg" className="text-lg px-8 py-6">
                <Globe className="h-5 w-5 mr-2" />
                デモを見る
              </Button>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">
              プロジェクト成功を導く3つの特徴
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              単純なQ&Aではなく、プロジェクトマネージャーの豊富な経験に基づいた
              戦略的で実用的なアドバイスを提供します。
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-0 bg-card/50 backdrop-blur-sm hover:bg-card transition-colors">
              <CardContent className="p-6 text-center space-y-4">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">リーダーペルソナ</h3>
                <p className="text-muted-foreground">
                  プロジェクトマネージャーの視点から、チーム運営や技術課題に対する
                  具体的で実践的なアドバイスを提供します。
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-card/50 backdrop-blur-sm hover:bg-card transition-colors">
              <CardContent className="p-6 text-center space-y-4">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <MessageSquare className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">構造化された応答</h3>
                <p className="text-muted-foreground">
                  リスク評価、工数見積もり、具体的なアクションプランを含む
                  体系的で分かりやすい回答形式を採用しています。
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-card/50 backdrop-blur-sm hover:bg-card transition-colors">
              <CardContent className="p-6 text-center space-y-4">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">専門的な知識ベース</h3>
                <p className="text-muted-foreground">
                  技術文書、過去事例、ベストプラクティスを参照した
                  信頼度の高い情報を基にした回答を生成します。
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Use Cases Section */}
        <section className="py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">
              プロジェクト成功のための活用シーン
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              リーダー視点での具体的なアドバイスで、あらゆるプロジェクト課題を解決します。
            </p>
          </div>

          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8 md:gap-12">
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="h-10 w-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center shrink-0">
                    <Code2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">
                      技術課題・アーキテクチャ相談
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      システム設計の判断、技術選定の根拠、開発チームへの技術指導方針について具体的なアドバイスを提供
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="h-10 w-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center shrink-0">
                    <Target className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">
                      プロジェクト計画・リスク管理
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      工数見積もり、スケジュール調整、リスク評価と対策、チームのタスク優先度決定をサポート
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="h-10 w-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center shrink-0">
                    <Palette className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">UI/UX・品質向上</h3>
                    <p className="text-muted-foreground text-sm">
                      ユーザビリティ改善方針、デザインレビューの観点、品質基準の設定と評価方法の提案
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="h-10 w-10 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center shrink-0">
                    <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">成果物検証・レビュー</h3>
                    <p className="text-muted-foreground text-sm">
                      コード品質、ドキュメント完成度、デプロイ準備状況の評価と改善提案を構造化して提示
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="h-10 w-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center shrink-0">
                    <BarChart3 className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">チーム運営・影響分析</h3>
                    <p className="text-muted-foreground text-sm">
                      変更による他チームへの影響分析、ステークホルダー調整、エスカレーション判断の支援
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="h-10 w-10 bg-cyan-100 dark:bg-cyan-900/30 rounded-full flex items-center justify-center shrink-0">
                    <Lightbulb className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">
                      知識共有・ベストプラクティス
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      過去事例の参照、技術文書の作成支援、チーム内での知識共有方法の提案
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 text-center">
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold">
              プロジェクトを成功に導きましょう
            </h2>
            <p className="text-muted-foreground text-lg">
              経験豊富なプロジェクトマネージャーの知見を活用して、
              より良い意思決定とチーム運営を実現してください。
            </p>
            <Link href="/chat">
              <Button size="lg" className="gap-2 text-lg px-8 py-6">
                <MessageSquare className="h-5 w-5" />
                プロジェクトAIに相談する
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/20 py-8 mt-16">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2024 Project AI Assistant. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
