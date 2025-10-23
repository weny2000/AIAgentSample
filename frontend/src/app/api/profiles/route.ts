/**
 * プロフィール管理API
 * GET: プロフィール一覧取得
 * POST: 新規プロフィール作成
 * PUT: プロフィール更新
 * DELETE: プロフィール削除
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
  getUserProfiles,
  saveUserProfile,
  updateUserProfile,
  deleteUserProfile,
} from '@/lib/aws/dynamodb';
import {
  UserProfile,
  CreateProfileRequest,
  UpdateProfileRequest,
  ProfileResponse,
} from '@/lib/types';

// プロフィール一覧取得
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

    const profiles = await getUserProfiles(userId);

    const profileResponses: ProfileResponse[] = profiles.map(profile => ({
      profileId: profile.profileId,
      role: profile.role,
      skills: profile.skills,
      isDefault: profile.isDefault,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    }));

    return NextResponse.json({
      success: true,
      data: profileResponses,
    });
  } catch (error) {
    console.error('Error getting user profiles:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get user profiles' },
      { status: 500 }
    );
  }
}

// 新規プロフィール作成
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    const body: CreateProfileRequest = await request.json();

    if (!body.role || !body.skills) {
      return NextResponse.json(
        { success: false, error: 'role and skills are required' },
        { status: 400 }
      );
    }

    const profileId = uuidv4();
    const now = new Date().toISOString();

    // 最初のプロフィールの場合はデフォルトに設定
    const existingProfiles = await getUserProfiles(userId);
    const isDefault = existingProfiles.length === 0;

    const newProfile: UserProfile = {
      userId,
      profileId,
      role: body.role,
      skills: body.skills,
      isDefault,
      createdAt: now,
      updatedAt: now,
    };

    await saveUserProfile(newProfile);

    const response: ProfileResponse = {
      profileId: newProfile.profileId,
      role: newProfile.role,
      skills: newProfile.skills,
      isDefault: newProfile.isDefault,
      createdAt: newProfile.createdAt,
      updatedAt: newProfile.updatedAt,
    };

    return NextResponse.json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error('Error creating user profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create user profile' },
      { status: 500 }
    );
  }
}

// プロフィール更新
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

    const body: UpdateProfileRequest = await request.json();

    if (!body.role && !body.skills && body.isDefault === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'At least one field (role, skills, or isDefault) is required',
        },
        { status: 400 }
      );
    }

    const updates: Partial<UserProfile> = {};
    if (body.role) updates.role = body.role;
    if (body.skills) updates.skills = body.skills;
    if (body.isDefault !== undefined) updates.isDefault = body.isDefault;

    await updateUserProfile(userId, profileId, updates);

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update user profile' },
      { status: 500 }
    );
  }
}

// プロフィール削除
export async function DELETE(request: NextRequest) {
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

    await deleteUserProfile(userId, profileId);

    return NextResponse.json({
      success: true,
      message: 'Profile deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting user profile:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete user profile' },
      { status: 500 }
    );
  }
}
