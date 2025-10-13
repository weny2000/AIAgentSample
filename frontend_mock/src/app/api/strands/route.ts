import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse, ChatRequestObject, ChatResponseObject } from '@/lib/types';

export async function POST(
  request: NextRequest
): Promise<NextResponse<ApiResponse<ChatResponseObject>>> {
  try {
    const body: ChatRequestObject = await request.json();
    const { chatId, message } = body;

    if (!chatId || !message || !message.mainPrompt) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request: chatId and message.mainPrompt are required',
        },
        { status: 400 }
      );
    }

    const serviceUrl =
      process.env.STRANDS_SERVICE_URL || 'http://localhost:8001';

    const res = await fetch(`${serviceUrl}/agents/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId,
        prompt: message.mainPrompt,
        profile: { role: message.userRole, skills: message.userSkills },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Strands service error:', res.status, text);
      return NextResponse.json(
        { success: false, error: 'Strands service error' },
        { status: 502 }
      );
    }

    const data = (await res.json()) as { content: string };

    const response: ChatResponseObject = {
      messageId: uuidv4(),
      content: data.content,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, data: response });
  } catch (err) {
    console.error('Error processing strands chat:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
}