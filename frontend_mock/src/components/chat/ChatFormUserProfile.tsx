'use client';

import { InputPromptObject, UserProfileObject } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, Briefcase, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';
import userProfilesData from '@/sample_data/user_profiles.json';

interface ChatFormUserProfileProps {
  formData: InputPromptObject;
  onFormDataChange: (formData: InputPromptObject) => void;
  isExpanded: boolean;
  onToggleExpanded: () => void;
}

export function ChatFormUserProfile({
  formData,
  onFormDataChange,
  isExpanded,
  onToggleExpanded,
}: ChatFormUserProfileProps) {
  const [presetProfiles] = useState<UserProfileObject[]>(
    userProfilesData as UserProfileObject[]
  );

  const handleRoleChange = (value: string) => {
    onFormDataChange({
      ...formData,
      userRole: value,
    });
  };

  const handleSkillsChange = (value: string) => {
    onFormDataChange({
      ...formData,
      userSkills: value,
    });
  };

  const handlePresetSelect = (profile: UserProfileObject) => {
    onFormDataChange({
      ...formData,
      userRole: profile.role,
      userSkills: profile.skills,
    });
  };

  return (
    <div className="space-y-4">
      {/* 展開/折りたたみボタン */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onToggleExpanded}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <span>ユーザープロフィール設定</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </Button>

      {isExpanded && (
        <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
          {/* プリセットプロフィール */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              プリセットプロフィール
            </label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {presetProfiles.map((profile, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => handlePresetSelect(profile)}
                >
                  <Briefcase className="h-3 w-3 mr-1" />
                  {profile.role}
                </Badge>
              ))}
            </div>
          </div>

          {/* 役割入力 */}
          <div className="space-y-2">
            <label htmlFor="userRole" className="text-sm font-medium">
              あなたの役割
            </label>
            <Input
              id="userRole"
              placeholder="例: フロントエンドエンジニア, プロダクトマネージャー"
              value={formData.userRole}
              onChange={e => handleRoleChange(e.target.value)}
              className="w-full"
            />
          </div>

          {/* スキル入力 */}
          <div className="space-y-2">
            <label htmlFor="userSkills" className="text-sm font-medium">
              保有スキル・専門知識
            </label>
            <Textarea
              id="userSkills"
              placeholder="例: React, TypeScript, Next.js, UI/UXデザイン"
              value={formData.userSkills}
              onChange={e => handleSkillsChange(e.target.value)}
              className="w-full min-h-[80px]"
              rows={3}
            />
          </div>

          {/* 現在の設定表示 */}
          {(formData.userRole || formData.userSkills) && (
            <div className="p-3 bg-background rounded border">
              <h4 className="text-sm font-medium mb-2">現在の設定:</h4>
              {formData.userRole && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">役割:</span> {formData.userRole}
                </p>
              )}
              {formData.userSkills && (
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-medium">スキル:</span>{' '}
                  {formData.userSkills}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
