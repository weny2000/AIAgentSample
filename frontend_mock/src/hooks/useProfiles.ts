/**
 * プロフィール管理用のカスタムフック（JSON データ版）
 */

'use client';

import { useState, useEffect } from 'react';
import {
  ProfileResponse,
  CreateProfileRequest,
  UpdateProfileRequest,
} from '@/lib/types';

export function useProfiles(userId: string) {
  const [profiles, setProfiles] = useState<ProfileResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // プロフィール一覧を取得（JSONデータから）
  const fetchProfiles = async () => {
    if (!userId) return;

    try {
      setIsLoading(true);
      setError(null);

      // サンプルデータからプロフィールを読み込み
      const response = await fetch('/profiles.json');
      if (!response.ok) {
        throw new Error('Failed to load profiles');
      }

      const data: ProfileResponse[] = await response.json();
      setProfiles(data);
    } catch (err) {
      setError('Failed to load profiles');
      console.error('Profile fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 新規プロフィール作成（サンプルデータ版）
  const createProfile = async (
    profileData: CreateProfileRequest
  ): Promise<boolean> => {
    try {
      setError(null);

      // 新しいプロフィールID生成
      const newProfileId = `profile-${Date.now()}`;
      const timestamp = new Date().toISOString();

      const newProfile: ProfileResponse = {
        profileId: newProfileId,
        role: profileData.role,
        skills: profileData.skills,
        isDefault: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      // ローカル状態を更新
      setProfiles(prev => [...prev, newProfile]);
      return true;
    } catch (err) {
      setError('Failed to create profile');
      return false;
    }
  };

  // プロフィール更新（サンプルデータ版）
  const updateProfile = async (
    profileId: string,
    updates: UpdateProfileRequest
  ): Promise<boolean> => {
    try {
      setError(null);

      const timestamp = new Date().toISOString();

      // ローカル状態を更新
      setProfiles(prev =>
        prev.map(profile =>
          profile.profileId === profileId
            ? {
                ...profile,
                ...updates,
                updatedAt: timestamp,
              }
            : profile
        )
      );
      return true;
    } catch (err) {
      setError('Failed to update profile');
      return false;
    }
  };

  // デフォルトプロフィール設定（サンプルデータ版）
  const setDefaultProfile = async (profileId: string): Promise<boolean> => {
    try {
      setError(null);

      const timestamp = new Date().toISOString();

      // 全てのプロフィールのisDefaultをfalseにして、指定されたプロフィールのみtrueにする
      setProfiles(prev =>
        prev.map(profile => ({
          ...profile,
          isDefault: profile.profileId === profileId,
          updatedAt: timestamp,
        }))
      );
      return true;
    } catch (err) {
      setError('Failed to set default profile');
      return false;
    }
  };

  // プロフィール削除（サンプルデータ版）
  const deleteProfile = async (profileId: string): Promise<boolean> => {
    try {
      setError(null);

      // ローカル状態から削除
      setProfiles(prev =>
        prev.filter(profile => profile.profileId !== profileId)
      );
      return true;
    } catch (err) {
      setError('Failed to delete profile');
      return false;
    }
  };

  // デフォルトプロフィールを取得
  const getDefaultProfile = (): ProfileResponse | null => {
    return profiles.find(profile => profile.isDefault) || null;
  };

  useEffect(() => {
    if (userId) {
      fetchProfiles();
    }
  }, [userId]);

  return {
    profiles,
    isLoading,
    error,
    fetchProfiles,
    createProfile,
    updateProfile,
    setDefaultProfile,
    deleteProfile,
    getDefaultProfile,
    clearError: () => setError(null),
  };
}
