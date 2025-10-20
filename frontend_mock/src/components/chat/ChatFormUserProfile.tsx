/**
 * 改修されたプロフィール設定コンポーネント
 * プリセット管理機能を統合（追加・編集・コピー・削除）
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Plus, Edit, Copy, Trash2, Star, StarOff } from 'lucide-react';
import { InputPromptObject, ProfileResponse } from '@/lib/types';
import { useProfiles } from '@/hooks/useProfiles';

interface ChatFormUserProfileProps {
  formData: InputPromptObject;
  onFormDataChange: (formData: InputPromptObject) => void;
}

interface ProfileDialogData {
  role: string;
  skills: string;
}

export function ChatFormUserProfile({
  formData,
  onFormDataChange,
}: ChatFormUserProfileProps) {
  const userId = 'user-1'; // TODO: 実際のユーザーIDに置き換え
  const {
    profiles,
    isLoading,
    error,
    createProfile,
    updateProfile,
    deleteProfile,
    setDefaultProfile,
    clearError,
  } = useProfiles(userId);

  // Dialog states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | 'copy'>(
    'create'
  );
  const [editingProfile, setEditingProfile] = useState<ProfileResponse | null>(
    null
  );
  const [dialogData, setDialogData] = useState<ProfileDialogData>({
    role: '',
    skills: '',
  });

  // 選択されたプリセットのID（アイコン表示用）
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  // 初期状態でデフォルトプロフィールを設定
  useEffect(() => {
    if (profiles.length > 0 && !formData.userRole && !formData.userSkills) {
      const defaultProfile = profiles.find(profile => profile.isDefault);
      if (defaultProfile) {
        onFormDataChange({
          ...formData,
          userRole: defaultProfile.role,
          userSkills: defaultProfile.skills,
        });
      }
    }
  }, [profiles]);

  // プリセット選択ハンドラー
  const handlePresetSelect = (profile: ProfileResponse) => {
    // 同じプリセットをクリックした場合はアイコンの表示/非表示を切り替え
    if (selectedPresetId === profile.profileId) {
      setSelectedPresetId(null);
    } else {
      setSelectedPresetId(profile.profileId);
      onFormDataChange({
        ...formData,
        userRole: profile.role,
        userSkills: profile.skills,
      });
    }
  };

  // Dialog開く処理
  const openDialog = (
    mode: 'create' | 'edit' | 'copy',
    profile?: ProfileResponse
  ) => {
    setDialogMode(mode);
    setEditingProfile(profile || null);

    if (mode === 'create') {
      setDialogData({ role: '', skills: '' });
    } else if (profile) {
      setDialogData({ role: profile.role, skills: profile.skills });
    }

    setIsDialogOpen(true);
  };

  // Dialog保存処理
  const handleDialogSave = async () => {
    if (!dialogData.role.trim() || !dialogData.skills.trim()) {
      return;
    }

    let success = false;

    if (dialogMode === 'edit' && editingProfile) {
      success = await updateProfile(editingProfile.profileId, {
        role: dialogData.role,
        skills: dialogData.skills,
      });
    } else {
      success = await createProfile({
        role: dialogData.role,
        skills: dialogData.skills,
      });
    }

    if (success) {
      setIsDialogOpen(false);
      setDialogData({ role: '', skills: '' });
      setEditingProfile(null);
    }
  };

  // デフォルト設定処理
  const handleSetDefault = async (profileId: string) => {
    await setDefaultProfile(profileId);
  };

  // プロフィール削除処理
  const handleDelete = async (profile: ProfileResponse) => {
    if (profile.isDefault) {
      alert(
        'デフォルトプロフィールは削除できません。他のプロフィールをデフォルトに設定してから削除してください。'
      );
      return;
    }

    await deleteProfile(profile.profileId);
  };

  if (error) {
    return (
      <div className="p-4 text-red-600 bg-red-50 rounded-md">
        <p>エラー: {error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={clearError}
          className="mt-2"
        >
          再試行
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* プリセットプロフィール */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">プリセットプロフィール</h3>

        {isLoading ? (
          <div className="text-sm text-gray-500">読み込み中...</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {/* 既存プロフィール */}
            {profiles.map(profile => (
              <div key={profile.profileId} className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  className={`flex items-center gap-2 ${
                    selectedPresetId === profile.profileId
                      ? 'bg-gray-100 border-gray-300 text-gray-800'
                      : formData.userRole === profile.role &&
                          formData.userSkills === profile.skills
                        ? 'bg-blue-50 border-blue-200 text-blue-800'
                        : ''
                  }`}
                  onClick={() => handlePresetSelect(profile)}
                >
                  <span className="text-sm">{profile.role}</span>
                  {profile.isDefault && (
                    <Badge variant="default" className="text-xs">
                      <Star className="h-3 w-3 mr-1" />
                      デフォルト
                    </Badge>
                  )}
                </Button>

                {/* 選択されたプリセットのアイコン */}
                {selectedPresetId === profile.profileId && (
                  <div className="absolute top-full left-0 mt-1 flex items-center gap-1 bg-white border rounded-md shadow-lg p-1 z-10">
                    {/* デフォルト設定ボタン */}
                    {!profile.isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetDefault(profile.profileId)}
                        className="h-7 w-7 p-0"
                        title="デフォルトに設定"
                      >
                        <StarOff className="h-3 w-3" />
                      </Button>
                    )}

                    {/* 編集ボタン */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDialog('edit', profile)}
                      className="h-7 w-7 p-0"
                      title="編集"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>

                    {/* コピーボタン */}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openDialog('copy', profile)}
                      className="h-7 w-7 p-0"
                      title="コピー"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>

                    {/* 削除ボタン */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-800"
                          disabled={profile.isDefault}
                          title="削除"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            プロフィールを削除
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            「{profile.role}
                            」のプロフィールを削除しますか？この操作は取り消せません。
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>キャンセル</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(profile)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            削除
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            ))}

            {/* 新規作成ボタン */}
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 border-2 border-dashed border-gray-300 hover:border-gray-400 hover:bg-gray-50"
              onClick={() => openDialog('create')}
            >
              <Plus className="h-3 w-3" />
              <span className="text-sm">新規作成</span>
            </Button>
          </div>
        )}
      </div>

      {/* 現在選択されているプロフィール情報 */}
      {(formData.userRole || formData.userSkills) && (
        <div className="p-3 bg-blue-50 rounded-md border">
          <h4 className="text-sm font-medium mb-2 text-blue-800">
            選択中のプロフィール:
          </h4>
          {formData.userRole && (
            <p className="text-sm text-blue-700">
              <span className="font-medium">役割:</span> {formData.userRole}
            </p>
          )}
          {formData.userSkills && (
            <p className="text-sm text-blue-700 mt-1">
              <span className="font-medium">スキル:</span> {formData.userSkills}
            </p>
          )}
        </div>
      )}

      {/* プロフィール編集・作成Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'create' && '新しいプロフィールを作成'}
              {dialogMode === 'edit' && 'プロフィールを編集'}
              {dialogMode === 'copy' && 'プロフィールをコピーして作成'}
            </DialogTitle>
            <DialogDescription>
              あなたの役割とスキルを入力してください。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label htmlFor="role" className="text-sm font-medium">
                あなたの役割
              </label>
              <Input
                id="role"
                placeholder="例: フロントエンドエンジニア"
                value={dialogData.role}
                onChange={e =>
                  setDialogData(prev => ({ ...prev, role: e.target.value }))
                }
              />
            </div>

            <div>
              <label htmlFor="skills" className="text-sm font-medium">
                保有スキル・専門知識
              </label>
              <Textarea
                id="skills"
                placeholder="例: React, TypeScript, Next.js, UI/UXデザイン"
                rows={3}
                value={dialogData.skills}
                onChange={e =>
                  setDialogData(prev => ({ ...prev, skills: e.target.value }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              キャンセル
            </Button>
            <Button
              onClick={handleDialogSave}
              disabled={!dialogData.role.trim() || !dialogData.skills.trim()}
            >
              {dialogMode === 'edit' ? '更新' : '登録'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
