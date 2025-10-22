import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse, ChatRequestObject, ChatResponseObject } from '@/lib/types';
import { getDefaultProfile } from '@/lib/aws/dynamodb';

interface ExtendedProfile {
  role: string;
  skills: string;
  profileId?: string;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

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

    // Get user profile information from DynamoDB
    // TODO: Replace with actual user ID from authentication
    const userId = 'user-1';
    let profileInfo: ExtendedProfile = { role: message.userRole, skills: message.userSkills };
    
    try {
      const defaultProfile = await getDefaultProfile(userId);
      if (defaultProfile) {
        profileInfo = {
          role: message.userRole || defaultProfile.role,
          skills: message.userSkills || defaultProfile.skills,
          profileId: defaultProfile.profileId,
          isDefault: defaultProfile.isDefault,
          createdAt: defaultProfile.createdAt,
          updatedAt: defaultProfile.updatedAt,
        };
      }
    } catch (error) {
      console.warn('Failed to fetch user profile, using form data only:', error);
    }

    const res = await fetch(`${serviceUrl}/agents/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId,
        prompt: message.mainPrompt,
        profile: profileInfo,
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

    const data = (await res.json()) as { 
      content: string;
      debug?: {
        keywords?: string[];
        selected_person?: string;
        search_summary?: string;
        tacit_knowledge?: unknown[];
      };
      validation?: {
        is_good?: boolean;
        score?: number;
        feedback?: string;
        loops_executed?: number;
        optimization_history?: unknown[];
      };
      ace?: {
        instructions_applied?: string;
        quality_score?: number;
        patterns_found?: number;
        suggestions?: string[];
        deltas_added?: number;
      };
      performance?: {
        total_time_ms?: number;
        previous_state_loaded?: boolean;
      };
    };

    // Log additional information for debugging
    if (data.validation) {
      console.log('Validation:', {
        score: data.validation.score,
        is_good: data.validation.is_good,
        loops: data.validation.loops_executed
      });
    }
    if (data.performance) {
      console.log('Performance:', {
        total_time_ms: data.performance.total_time_ms
      });
    }

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