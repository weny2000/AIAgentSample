/**
 * プロフィールプリセット管理コンポーネント
 * プロフィールの一覧表示、作成、編集、削除、デフォルト設定機能
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreVertical, Check, Trash2, Edit } from 'lucide-react';
import { ProfileResponse } from '@/lib/types';

interface ProfilePresetManagerProps {
  userId: string;
  onProfileSelect?: (profile: ProfileResponse) => void;
  className?: string;
}

export default function ProfilePresetManager({
  userId,
  onProfileSelect,
  className = '',
}: ProfilePresetManagerProps) {
  const [profiles, setProfiles] = useState<ProfileResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ProfileResponse | null>(
    null
  );
  const [newProfile, setNewProfile] = useState({ role: '', skills: '' });
  const [error, setError] = useState<string | null>(null);

  // プロフィール一覧を取得
  const fetchProfiles = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/profiles?userId=${userId}`);
      const data = await response.json();

      if (data.success) {
        setProfiles(data.data || []);
      } else {
        setError(data.error || 'Failed to fetch profiles');
      }
    } catch (err) {
      setError('Network error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // 新規プロフィール作成
  const createProfile = async () => {
    if (!newProfile.role.trim() || !newProfile.skills.trim()) {
      setError('Role and skills are required');
      return;
    }

    try {
      const response = await fetch(`/api/profiles?userId=${userId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProfile),
      });

      const data = await response.json();

      if (data.success) {
        setNewProfile({ role: '', skills: '' });
        setIsEditing(false);
        await fetchProfiles();
      } else {
        setError(data.error || 'Failed to create profile');
      }
    } catch (err) {
      setError('Network error occurred');
    }
  };

  // プロフィール更新
  const updateProfile = async (
    profileId: string,
    updates: { role?: string; skills?: string }
  ) => {
    try {
      const response = await fetch(
        `/api/profiles?userId=${userId}&profileId=${profileId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }
      );

      const data = await response.json();

      if (data.success) {
        setEditingProfile(null);
        await fetchProfiles();
      } else {
        setError(data.error || 'Failed to update profile');
      }
    } catch (err) {
      setError('Network error occurred');
    }
  };

  // デフォルトプロフィール設定
  const setDefaultProfile = async (profileId: string) => {
    try {
      const response = await fetch(
        `/api/profiles/default?userId=${userId}&profileId=${profileId}`,
        {
          method: 'PUT',
        }
      );

      const data = await response.json();

      if (data.success) {
        await fetchProfiles();
      } else {
        setError(data.error || 'Failed to set default profile');
      }
    } catch (err) {
      setError('Network error occurred');
    }
  };

  // プロフィール削除
  const deleteProfile = async (profileId: string) => {
    if (!confirm('Are you sure you want to delete this profile?')) {
      return;
    }

    try {
      const response = await fetch(
        `/api/profiles?userId=${userId}&profileId=${profileId}`,
        {
          method: 'DELETE',
        }
      );

      const data = await response.json();

      if (data.success) {
        await fetchProfiles();
      } else {
        setError(data.error || 'Failed to delete profile');
      }
    } catch (err) {
      setError('Network error occurred');
    }
  };

  useEffect(() => {
    if (userId) {
      fetchProfiles();
    }
  }, [userId]);

  if (isLoading) {
    return <div className={`p-4 ${className}`}>Loading profiles...</div>;
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Profile Presets</h3>
        <Button
          size="sm"
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Profile
        </Button>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
          {error}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setError(null)}
            className="ml-2 text-red-600 hover:text-red-800"
          >
            ✕
          </Button>
        </div>
      )}

      {/* 新規作成フォーム */}
      {isEditing && !editingProfile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Create New Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Role (e.g., Software Engineer)"
              value={newProfile.role}
              onChange={e =>
                setNewProfile(prev => ({ ...prev, role: e.target.value }))
              }
            />
            <Textarea
              placeholder="Skills (e.g., React, TypeScript, Node.js)"
              value={newProfile.skills}
              onChange={e =>
                setNewProfile(prev => ({ ...prev, skills: e.target.value }))
              }
              rows={3}
            />
            <div className="flex gap-2">
              <Button onClick={createProfile} size="sm">
                Save Profile
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setNewProfile({ role: '', skills: '' });
                }}
                size="sm"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* プロフィール一覧 */}
      <div className="space-y-2">
        {profiles.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-center text-gray-500">
              No profiles found. Create your first profile to get started.
            </CardContent>
          </Card>
        ) : (
          profiles.map(profile => (
            <Card key={profile.profileId} className="relative">
              <CardContent className="p-4">
                {editingProfile?.profileId === profile.profileId ? (
                  // 編集フォーム
                  <div className="space-y-3">
                    <Input
                      value={editingProfile.role}
                      onChange={e =>
                        setEditingProfile(prev =>
                          prev ? { ...prev, role: e.target.value } : null
                        )
                      }
                    />
                    <Textarea
                      value={editingProfile.skills}
                      onChange={e =>
                        setEditingProfile(prev =>
                          prev ? { ...prev, skills: e.target.value } : null
                        )
                      }
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() =>
                          updateProfile(profile.profileId, {
                            role: editingProfile.role,
                            skills: editingProfile.skills,
                          })
                        }
                        size="sm"
                      >
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setEditingProfile(null)}
                        size="sm"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  // 表示モード
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{profile.role}</h4>
                        {profile.isDefault && (
                          <Badge variant="default" className="text-xs">
                            Default
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {profile.skills}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onProfileSelect?.(profile)}
                        >
                          Use This Profile
                        </Button>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setEditingProfile(profile)}
                          className="flex items-center gap-2"
                        >
                          <Edit className="h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        {!profile.isDefault && (
                          <DropdownMenuItem
                            onClick={() => setDefaultProfile(profile.profileId)}
                            className="flex items-center gap-2"
                          >
                            <Check className="h-4 w-4" />
                            Set as Default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => deleteProfile(profile.profileId)}
                          className="flex items-center gap-2 text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
