/**
 * ネットワーク図 API
 * POST: ネットワーク図生成・S3保存
 * GET: ネットワーク図URL取得
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  uploadNetworkGraph,
  uploadNetworkJson,
  generateNetworkGraphKey,
  generateNetworkJsonKey,
} from '@/lib/aws/s3';
import { updateChatSummary, getChatSummary } from '@/lib/aws/dynamodb';
import {
  CreateNetworkGraphRequest,
  CreateNetworkGraphResponse,
} from '@/lib/types';

// ネットワーク図生成・S3保存
export async function POST(request: NextRequest) {
  try {
    const body: CreateNetworkGraphRequest = await request.json();

    if (
      !body.userId ||
      !body.chatId ||
      !body.latestQuestion ||
      !body.latestAnswer
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'userId, chatId, latestQuestion, and latestAnswer are required',
        },
        { status: 400 }
      );
    }

    const timestamp = new Date().toISOString();

    // ネットワーク図生成（初期実装：固定HTML+JSON）
    const { networkHtml, networkJson } = generateNetworkGraph(
      body.previousNetworkJson,
      body.latestQuestion,
      body.latestAnswer
    );

    // S3にアップロード用のキー生成
    const htmlKey = generateNetworkGraphKey(
      body.userId,
      body.chatId,
      timestamp
    );
    const jsonKey = generateNetworkJsonKey(body.userId, body.chatId, timestamp);

    // S3にアップロード
    const [networkGraphUrl, networkJsonUrl] = await Promise.all([
      uploadNetworkGraph(htmlKey, networkHtml),
      uploadNetworkJson(jsonKey, networkJson),
    ]);

    // DynamoDBにURLを保存（チャットサマリーテーブルを更新）
    await updateChatSummary(body.userId, timestamp, {
      networkGraph: networkGraphUrl,
      networkJson: networkJsonUrl,
    });

    const response: CreateNetworkGraphResponse = {
      networkGraphUrl,
      networkJsonUrl,
      timestamp,
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error creating network graph:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create network graph' },
      { status: 500 }
    );
  }
}

// ネットワーク図URL取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const timestamp = searchParams.get('timestamp');

    if (!userId || !timestamp) {
      return NextResponse.json(
        { success: false, error: 'userId and timestamp are required' },
        { status: 400 }
      );
    }

    const chatSummary = await getChatSummary(userId, timestamp);

    if (!chatSummary) {
      return NextResponse.json(
        { success: false, error: 'Chat summary not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        networkGraphUrl: chatSummary.networkGraph || null,
        networkJsonUrl: chatSummary.networkJson || null,
        timestamp: chatSummary.timestamp,
      },
    });
  } catch (error) {
    console.error('Error getting network graph:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get network graph' },
      { status: 500 }
    );
  }
}

/**
 * ネットワーク図生成（固定HTML+JSON版）
 */
function generateNetworkGraph(
  previousNetworkJson?: string,
  latestQuestion?: string,
  latestAnswer?: string
): { networkHtml: string; networkJson: string } {
  // サンプルのネットワーク図JSON
  const networkJson = JSON.stringify(
    {
      nodes: [
        { id: 1, name: 'ユーザー', type: 'user', x: 100, y: 100 },
        { id: 2, name: 'AIアシスタント', type: 'ai', x: 300, y: 100 },
        {
          id: 3,
          name: '質問',
          type: 'question',
          x: 200,
          y: 200,
          text: latestQuestion?.substring(0, 50) || '質問',
        },
        {
          id: 4,
          name: '回答',
          type: 'answer',
          x: 200,
          y: 300,
          text: latestAnswer?.substring(0, 50) || '回答',
        },
      ],
      links: [
        { source: 1, target: 3, type: 'asks' },
        { source: 3, target: 2, type: 'processes' },
        { source: 2, target: 4, type: 'responds' },
        { source: 4, target: 1, type: 'delivers' },
      ],
      metadata: {
        createdAt: new Date().toISOString(),
        previousNetwork: !!previousNetworkJson,
      },
    },
    null,
    2
  );

  // サンプルのHTML（D3.jsを使用した可視化）
  const networkHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>チャットネットワーク図</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .node { stroke: #fff; stroke-width: 2px; }
        .node.user { fill: #69b3a2; }
        .node.ai { fill: #404080; }
        .node.question { fill: #ff6b6b; }
        .node.answer { fill: #4ecdc4; }
        .link { stroke: #999; stroke-opacity: 0.6; stroke-width: 2px; }
        .label { font-size: 12px; text-anchor: middle; }
        #network { border: 1px solid #ccc; }
    </style>
</head>
<body>
    <h1>チャットネットワーク図</h1>
    <p>生成日時: ${new Date().toLocaleString('ja-JP')}</p>
    <svg id="network" width="800" height="600"></svg>

    <script>
        const data = ${networkJson};
        
        const svg = d3.select("#network");
        const width = 800;
        const height = 600;

        // ノードとリンクを描画
        const link = svg.selectAll(".link")
            .data(data.links)
            .enter().append("line")
            .attr("class", "link")
            .attr("x1", d => {
                const source = data.nodes.find(n => n.id === d.source);
                return source ? source.x : 0;
            })
            .attr("y1", d => {
                const source = data.nodes.find(n => n.id === d.source);
                return source ? source.y : 0;
            })
            .attr("x2", d => {
                const target = data.nodes.find(n => n.id === d.target);
                return target ? target.x : 0;
            })
            .attr("y2", d => {
                const target = data.nodes.find(n => n.id === d.target);
                return target ? target.y : 0;
            });

        const node = svg.selectAll(".node")
            .data(data.nodes)
            .enter().append("circle")
            .attr("class", d => "node " + d.type)
            .attr("r", 30)
            .attr("cx", d => d.x)
            .attr("cy", d => d.y);

        const label = svg.selectAll(".label")
            .data(data.nodes)
            .enter().append("text")
            .attr("class", "label")
            .attr("x", d => d.x)
            .attr("y", d => d.y + 5)
            .text(d => d.name);

        // ツールチップ
        node.append("title")
            .text(d => d.text || d.name);
    </script>
</body>
</html>`;

  return { networkHtml, networkJson };
}
