'use client';

import { useState } from 'react';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';

interface ResultDisplayProps {
  original: string | null;
  result: string;
}

export default function ResultDisplay({ original, result }: ResultDisplayProps) {
  const [showComparison, setShowComparison] = useState(true);

  const downloadImage = async () => {
    try {
      const response = await fetch(result);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ai-edited-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download image');
    }
  };

  return (
    <div>
      {/* Toggle View */}
      <div className="flex justify-center mb-6 gap-4">
        <button
          onClick={() => setShowComparison(true)}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${showComparison
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
        >
          Compare
        </button>
        <button
          onClick={() => setShowComparison(false)}
          className={`px-6 py-2 rounded-lg font-medium transition-colors ${!showComparison
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
        >
          Result Only
        </button>
      </div>

      {/* Image Display */}
      {showComparison && original ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <p className="text-center font-semibold text-gray-700 mb-3">Original</p>
            <img
              src={original}
              alt="Original"
              className="w-full rounded-lg shadow-lg"
            />
          </div>
          <div>
            <p className="text-center font-semibold text-gray-700 mb-3">AI Edited</p>
            <img
              src={result}
              alt="Result"
              className="w-full rounded-lg shadow-lg"
            />
          </div>
        </div>
      ) : (
        <div className="flex justify-center">
          <img
            src={result}
            alt="Result"
            className="max-w-full rounded-lg shadow-2xl"
          />
        </div>
      )}

      {/* Download Button */}
      <div className="flex justify-center mt-8">
        <button
          onClick={downloadImage}
          className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors shadow-lg hover:shadow-xl"
        >
          <ArrowDownTrayIcon className="w-5 h-5" />
          Download Result
        </button>
      </div>
    </div>
  );
}