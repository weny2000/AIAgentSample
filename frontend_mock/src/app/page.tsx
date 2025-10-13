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
            <h1 className="text-xl font-bold">TacitAi(タシタイ)</h1>
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
                TacitAi(タシタイ)で
                <br />
                業務効率を革新する
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                あなたの専門性を理解し、最適化されたAIサポートを提供。
                プロジェクト管理からコーディングまで、あらゆる業務をサポートします。
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
              なぜTacitAi(タシタイ)を選ぶのか
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              従来のAIチャットボットとは異なる、あなた専用にカスタマイズされた体験をお届けします。
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-0 bg-card/50 backdrop-blur-sm hover:bg-card transition-colors">
              <CardContent className="p-6 text-center space-y-4">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">パーソナライズ</h3>
                <p className="text-muted-foreground">
                  あなたの役割とスキルセットを学習し、最適化されたアドバイスを提供。
                  エンジニア、デザイナー、PMなど、職種に特化した回答を生成します。
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-card/50 backdrop-blur-sm hover:bg-card transition-colors">
              <CardContent className="p-6 text-center space-y-4">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">高速レスポンス</h3>
                <p className="text-muted-foreground">
                  最新の大規模言語モデルを活用し、即座に高品質な回答を生成。
                  リアルタイムでの問題解決をサポートします。
                </p>
              </CardContent>
            </Card>

            <Card className="border-0 bg-card/50 backdrop-blur-sm hover:bg-card transition-colors">
              <CardContent className="p-6 text-center space-y-4">
                <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold">セキュリティ重視</h3>
                <p className="text-muted-foreground">
                  エンタープライズグレードのセキュリティを実装。
                  機密情報も安心してご利用いただけます。
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Use Cases Section */}
        <section className="py-16">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">活用シーン</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              様々な職種・業務でTacitAi(タシタイ)をご活用いただけます。
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="h-8 w-8 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-blue-600 dark:text-blue-400 font-semibold text-sm">
                    1
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">
                    技術相談・コードレビュー
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    プログラミングの問題解決、アーキテクチャ設計、ベストプラクティスの提案
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="h-8 w-8 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-green-600 dark:text-green-400 font-semibold text-sm">
                    2
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">プロジェクト管理</h3>
                  <p className="text-muted-foreground text-sm">
                    タスク優先度の決定、リスク管理、チームコミュニケーションの改善
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="h-8 w-8 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-purple-600 dark:text-purple-400 font-semibold text-sm">
                    3
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">デザイン・UX相談</h3>
                  <p className="text-muted-foreground text-sm">
                    ユーザビリティの改善、デザインシステム構築、アクセシビリティ対応
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="h-8 w-8 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-orange-600 dark:text-orange-400 font-semibold text-sm">
                    4
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">ビジネス戦略</h3>
                  <p className="text-muted-foreground text-sm">
                    市場分析、競合調査、成長戦略の立案と実行計画
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="h-8 w-8 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-red-600 dark:text-red-400 font-semibold text-sm">
                    5
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">データ分析・AI/ML</h3>
                  <p className="text-muted-foreground text-sm">
                    データの前処理、モデル選択、パフォーマンス改善の提案
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="h-8 w-8 bg-cyan-100 dark:bg-cyan-900/30 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-cyan-600 dark:text-cyan-400 font-semibold text-sm">
                    6
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">学習・スキルアップ</h3>
                  <p className="text-muted-foreground text-sm">
                    新しい技術の学習ロードマップ、キャリア開発のアドバイス
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 text-center">
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold">今すぐ始めましょう</h2>
            <p className="text-muted-foreground text-lg">
              無料でTacitAi(タシタイ)を体験し、あなたの業務効率を向上させてください。
            </p>
            <Link href="/chat">
              <Button size="lg" className="gap-2 text-lg px-8 py-6">
                <Users className="h-5 w-5" />
                無料で始める
                <ArrowRight className="h-5 w-5" />
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-muted/20 py-8 mt-16">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2024 TacitAi(タシタイ). All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
