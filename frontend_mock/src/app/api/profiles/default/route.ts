/**
 * デフォルトプロフィール設定API
 * PUT: デフォルトプロフィールを設定
 * GET: 現在のデフォルトプロフィールを取得
 */

import { NextRequest, NextResponse } from 'next/server';
import { setDefaultProfile, getDefaultProfile } from '@/lib/aws/dynamodb';
import { ProfileResponse } from '@/lib/types';

// デフォルトプロフィール設定
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const profileId = searchParams.get('profileId');

    if (!userId || !profileId) {
      return NextResponse.json(
        { success: false, error: 'userId and profileId are required' },
        { status: 400 }
      );
    }

    await setDefaultProfile(userId, profileId);

    return NextResponse.json({
      success: true,
      message: 'Default profile set successfully',
    });
  } catch (error) {
    console.error('Error setting default profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to set default profile' },
      { status: 500 }
    );
  }
}

// 現在のデフォルトプロフィール取得
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    const defaultProfile = await getDefaultProfile(userId);

    if (!defaultProfile) {
      return NextResponse.json({
        success: true,
        data: null,
        message: 'No default profile found',
      });
    }

    const response: ProfileResponse = {
      profileId: defaultProfile.profileId,
      role: defaultProfile.role,
      skills: defaultProfile.skills,
      isDefault: defaultProfile.isDefault,
      createdAt: defaultProfile.createdAt,
      updatedAt: defaultProfile.updatedAt,
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error getting default profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get default profile' },
      { status: 500 }
    );
  }
}
