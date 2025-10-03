import React, { useState } from 'react';
import { useSystemSettings, useUpdateSystemSetting } from '../../hooks/useApi';
import { SystemSettings as SystemSettingsType } from '../../types';

interface SettingFormData {
  value: any;
  description: string;
}

export const SystemSettings: React.FC = () => {
  const { data: settings, isLoading } = useSystemSettings();
  const updateSetting = useUpdateSystemSetting();

  const [editingSetting, setEditingSetting] = useState<SystemSettingsType | null>(null);
  const [formData, setFormData] = useState<SettingFormData>({
    value: '',
    description: '',
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const handleEdit = (setting: SystemSettingsType) => {
    setEditingSetting(setting);
    setFormData({
      value: setting.value,
      description: setting.description,
    });
  };

  const handleSave = async () => {
    if (!editingSetting) return;

    try {
      await updateSetting.mutateAsync({
        key: editingSetting.key,
        data: {
          value: formData.value,
          description: formData.description,
        },
      });
      setEditingSetting(null);
      resetForm();
    } catch (error) {
      console.error('Failed to update setting:', error);
    }
  };

  const handleCancel = () => {
    setEditingSetting(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      value: '',
      description: '',
    });
  };

  const renderValueInput = (setting: SystemSettingsType) => {
    const value = editingSetting?.key === setting.key ? formData.value : setting.value;
    const isEditing = editingSetting?.key === setting.key;

    // Determine input type based on value type
    if (typeof value === 'boolean') {
      return (
        <select
          value={String(value)}
          onChange={(e) => setFormData(prev => ({ 
            ...prev, 
            value: e.target.value === 'true' 
          }))}
          disabled={!isEditing}
          className={`w-full border rounded-md px-3 py-2 text-sm ${
            isEditing 
              ? 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500' 
              : 'border-gray-200 bg-gray-50'
          }`}
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      );
    }

    if (typeof value === 'number') {
      return (
        <input
          type="number"
          value={value}
          onChange={(e) => setFormData(prev => ({ 
            ...prev, 
            value: parseFloat(e.target.value) || 0 
          }))}
          disabled={!isEditing}
          className={`w-full border rounded-md px-3 py-2 text-sm ${
            isEditing 
              ? 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500' 
              : 'border-gray-200 bg-gray-50'
          }`}
        />
      );
    }

    // Handle arrays and objects
    if (typeof value === 'object') {
      return (
        <textarea
          value={JSON.stringify(value, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              setFormData(prev => ({ ...prev, value: parsed }));
            } catch {
              // Invalid JSON, keep as string for now
              setFormData(prev => ({ ...prev, value: e.target.value }));
            }
          }}
          disabled={!isEditing}
          rows={4}
          className={`w-full border rounded-md px-3 py-2 text-sm font-mono ${
            isEditing 
              ? 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500' 
              : 'border-gray-200 bg-gray-50'
          }`}
        />
      );
    }

    // Default to text input
    return (
      <input
        type="text"
        value={String(value)}
        onChange={(e) => setFormData(prev => ({ ...prev, value: e.target.value }))}
        disabled={!isEditing}
        className={`w-full border rounded-md px-3 py-2 text-sm ${
          isEditing 
            ? 'border-gray-300 focus:outline-none focus:ring-2 focus:ring-red-500' 
            : 'border-gray-200 bg-gray-50'
        }`}
      />
    );
  };

  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'security':
        return 'text-red-600 bg-red-100';
      case 'integration':
        return 'text-blue-600 bg-blue-100';
      case 'performance':
        return 'text-green-600 bg-green-100';
      case 'ui':
      case 'interface':
        return 'text-purple-600 bg-purple-100';
      case 'notification':
        return 'text-yellow-600 bg-yellow-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const filteredSettings = settings?.filter((setting: SystemSettingsType) => {
    const matchesSearch = !searchTerm || 
      setting.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      setting.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = !categoryFilter || setting.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  const categories = [...new Set(settings?.map((s: SystemSettingsType) => s.category) || [])];

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading system settings...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">System Settings</h2>
        <div className="text-sm text-gray-500">
          {filteredSettings?.length || 0} settings
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Search settings..."
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="">All categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Settings List */}
      <div className="space-y-4">
        {filteredSettings?.map((setting: SystemSettingsType) => (
          <div key={setting.id} className="bg-white border rounded-lg p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className="text-lg font-medium text-gray-900">{setting.key}</h3>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(setting.category)}`}>
                    {setting.category}
                  </span>
                </div>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  {editingSetting?.key === setting.key ? (
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                      rows={2}
                    />
                  ) : (
                    <p className="text-gray-600 text-sm">{setting.description}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Value
                  </label>
                  {renderValueInput(setting)}
                </div>
              </div>
              
              <div className="flex space-x-2 ml-4">
                {editingSetting?.key === setting.key ? (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={updateSetting.isPending}
                      className="text-green-600 hover:text-green-800 disabled:opacity-50"
                    >
                      {updateSetting.isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancel}
                      className="text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleEdit(setting)}
                    className="text-red-600 hover:text-red-800"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            <div className="text-xs text-gray-500 border-t pt-3">
              Last updated by {setting.updated_by} on {new Date(setting.updated_at).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {(!filteredSettings || filteredSettings.length === 0) && (
        <div className="text-center py-8 text-gray-500">
          No settings found matching the current filters.
        </div>
      )}
    </div>
  );
};