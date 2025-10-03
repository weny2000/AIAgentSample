import React, { useState } from 'react';
import { usePersonas, useCreatePersona, useUpdatePersona, useDeletePersona } from '../../hooks/useApi';
import { Persona } from '../../types';

interface PersonaFormData {
  name: string;
  description: string;
  style: string;
  leadership_style: 'collaborative' | 'directive' | 'coaching' | 'supportive';
  team_id: string;
  rules: string[];
  escalation_criteria: string[];
  decision_patterns: Record<string, any>;
}

export const PersonaManagement: React.FC = () => {
  const { data: personas, isLoading } = usePersonas();
  const createPersona = useCreatePersona();
  const updatePersona = useUpdatePersona();
  const deletePersona = useDeletePersona();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [formData, setFormData] = useState<PersonaFormData>({
    name: '',
    description: '',
    style: '',
    leadership_style: 'collaborative',
    team_id: '',
    rules: [],
    escalation_criteria: [],
    decision_patterns: {},
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      if (editingPersona) {
        await updatePersona.mutateAsync({ id: editingPersona.id, data: formData });
      } else {
        await createPersona.mutateAsync(formData);
      }
      
      setIsModalOpen(false);
      setEditingPersona(null);
      resetForm();
    } catch (error) {
      console.error('Failed to save persona:', error);
    }
  };

  const handleEdit = (persona: Persona) => {
    setEditingPersona(persona);
    setFormData({
      name: persona.name,
      description: persona.description,
      style: persona.style,
      leadership_style: persona.leadership_style || 'collaborative',
      team_id: persona.team_id,
      rules: persona.rules,
      escalation_criteria: persona.escalation_criteria || [],
      decision_patterns: persona.decision_patterns || {},
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this persona?')) {
      await deletePersona.mutateAsync(id);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      style: '',
      leadership_style: 'collaborative',
      team_id: '',
      rules: [],
      escalation_criteria: [],
      decision_patterns: {},
    });
  };

  const addRule = () => {
    setFormData(prev => ({
      ...prev,
      rules: [...prev.rules, '']
    }));
  };

  const updateRule = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      rules: prev.rules.map((rule, i) => i === index ? value : rule)
    }));
  };

  const removeRule = (index: number) => {
    setFormData(prev => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index)
    }));
  };

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading personas...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Persona Management</h2>
        <button
          onClick={() => {
            resetForm();
            setEditingPersona(null);
            setIsModalOpen(true);
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          Create Persona
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {personas?.map((persona: Persona) => (
          <div key={persona.id} className="bg-white border rounded-lg p-6 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-medium text-gray-900">{persona.name}</h3>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleEdit(persona)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(persona.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  Delete
                </button>
              </div>
            </div>
            
            <p className="text-gray-600 text-sm mb-3">{persona.description}</p>
            
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium">Team:</span> {persona.team_id}
              </div>
              <div>
                <span className="font-medium">Style:</span> {persona.leadership_style || 'Not specified'}
              </div>
              <div>
                <span className="font-medium">Rules:</span> {persona.rules.length}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium mb-4">
              {editingPersona ? 'Edit Persona' : 'Create Persona'}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Leadership Style
                </label>
                <select
                  value={formData.leadership_style}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    leadership_style: e.target.value as any 
                  }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="collaborative">Collaborative</option>
                  <option value="directive">Directive</option>
                  <option value="coaching">Coaching</option>
                  <option value="supportive">Supportive</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Team ID
                </label>
                <input
                  type="text"
                  value={formData.team_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, team_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Style Description
                </label>
                <textarea
                  value={formData.style}
                  onChange={(e) => setFormData(prev => ({ ...prev, style: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Describe the persona's communication style and approach..."
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Rules
                  </label>
                  <button
                    type="button"
                    onClick={addRule}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    Add Rule
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.rules.map((rule, index) => (
                    <div key={index} className="flex space-x-2">
                      <input
                        type="text"
                        value={rule}
                        onChange={(e) => updateRule(index, e.target.value)}
                        className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter rule..."
                      />
                      <button
                        type="button"
                        onClick={() => removeRule(index)}
                        className="text-red-600 hover:text-red-800 px-2"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingPersona(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createPersona.isPending || updatePersona.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {createPersona.isPending || updatePersona.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};