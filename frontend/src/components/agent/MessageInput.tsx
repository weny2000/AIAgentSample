import React, { forwardRef, useCallback, useRef, useImperativeHandle } from 'react';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}

export interface MessageInputRef {
  focus: () => void;
  clear: () => void;
}

export const MessageInput = forwardRef<MessageInputRef, MessageInputProps>(({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = 'Type your message...',
  maxLength = 2000,
  className = ''
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    clear: () => onChange('')
  }));

  // Handle form submission
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSend(value.trim());
  }, [value, disabled, onSend]);

  // Handle key down events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  // Auto-resize textarea
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    onChange(textarea.value);

    // Auto-resize
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [onChange]);

  // Character count and validation
  const characterCount = value.length;
  const isOverLimit = characterCount > maxLength;
  const canSend = value.trim().length > 0 && !disabled && !isOverLimit;

  return (
    <div className={`border-t border-gray-200 p-4 bg-white ${className}`}>
      <form onSubmit={handleSubmit} className="flex space-x-3">
        <div className="flex-1">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className={`block w-full px-3 py-2 border rounded-md shadow-sm resize-none focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors ${
                isOverLimit
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
              } ${disabled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : 'bg-white'}`}
              style={{ minHeight: '40px', maxHeight: '120px' }}
            />
            
            {/* Character count */}
            {maxLength && (
              <div className={`absolute bottom-1 right-2 text-xs ${
                isOverLimit ? 'text-red-500' : 'text-gray-400'
              }`}>
                {characterCount}/{maxLength}
              </div>
            )}
          </div>
          
          {/* Error message */}
          {isOverLimit && (
            <p className="mt-1 text-sm text-red-600">
              Message is too long. Please keep it under {maxLength} characters.
            </p>
          )}
        </div>
        
        {/* Send button */}
        <button
          type="submit"
          disabled={!canSend}
          className={`inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md transition-colors ${
            canSend
              ? 'text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
              : 'text-gray-400 bg-gray-100 cursor-not-allowed'
          }`}
        >
          {disabled ? (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
          <span className="ml-1">Send</span>
        </button>
      </form>
      
      {/* Help text */}
      <p className="mt-2 text-xs text-gray-500">
        Press Enter to send, Shift+Enter for new line
        {disabled && ' • Connection required to send messages'}
      </p>
    </div>
  );
});