
import React, { useState } from 'react';
import { Icons } from './Icons';

interface CopyableTextProps {
  text: string;
  className?: string;
  showIcon?: boolean;
}

export const CopyableText: React.FC<CopyableTextProps> = ({ text, className = '', showIcon = false }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent click (like row opening)
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy!', err);
    }
  };

  return (
    <div 
      onClick={handleCopy} 
      className={`inline-flex items-center gap-1.5 cursor-pointer select-none group transition-all active:scale-95 ${className} ${copied ? 'bg-green-100 text-green-700 border-green-200' : ''}`}
      title="اضغط لنسخ الكود"
    >
      {copied ? (
        <>
          <span className="w-3 h-3"><Icons.Check /></span>
          <span>تم النسخ</span>
        </>
      ) : (
        <>
           {showIcon && <span className="opacity-0 group-hover:opacity-50 transition-opacity"><Icons.Upload /></span>} {/* Using Upload icon as proxy for Copy icon if needed, or just text */}
           {text}
        </>
      )}
    </div>
  );
};
