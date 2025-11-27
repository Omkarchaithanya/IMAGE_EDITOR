'use client';

import { SparklesIcon } from '@heroicons/react/24/solid';

interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}

export default function PromptInput({ value, onChange, onSubmit, disabled }: PromptInputProps) {
  const suggestions = [
    'Remove background',
    'Make it black and white',
    'Add warm sunset lighting',
    'Turn into a watercolor painting',
  ];

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !disabled) {
      onSubmit();
    }
  };

  return (
    <div>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Describe what you want to do with the image..."
          className="w-full p-4 pr-12 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none text-lg text-gray-900"
        />
        <SparklesIcon className="absolute right-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-blue-500" />
      </div>

      {/* Quick Suggestions */}
      <div className="mt-4">
        <p className="text-sm text-gray-600 mb-2 font-medium">Quick commands:</p>
        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              onClick={() => onChange(suggestion)}
              disabled={disabled}
              className="px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm hover:bg-blue-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
