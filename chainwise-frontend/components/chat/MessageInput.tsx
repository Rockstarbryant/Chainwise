'use client';

import { useState, useRef, useCallback } from 'react';
import { Send, Square } from 'lucide-react';

interface Props {
  onSend: (text: string) => void;
  loading: boolean;
  disabled?: boolean;
}

export default function MessageInput({ onSend, loading, disabled }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const text = value.trim();
    if (!text || loading) return;
    onSend(text);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, loading, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const canSend = value.trim() && !loading && !disabled;

  return (
    <div className="border-t border-brand-border bg-brand-bg/80 backdrop-blur-sm px-4 py-3">
      <div className="max-w-3xl mx-auto">
        <div className={`
          flex items-end gap-3 rounded-2xl border px-4 py-3
          bg-brand-surface transition-colors duration-200
          ${loading ? 'border-brand-muted' : 'border-brand-border focus-within:border-brand-dim'}
        `}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about fees, bridges, P2P availability, giveaways..."
            rows={1}
            disabled={disabled}
            className="
              flex-1 bg-transparent resize-none outline-none
              font-mono text-sm text-brand-text placeholder:text-brand-muted
              min-h-[22px] max-h-[160px] leading-relaxed
              disabled:opacity-50
            "
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={`
              flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center
              transition-all duration-200
              ${canSend
                ? 'bg-gradient-to-br from-brand-green to-brand-blue text-black shadow-[0_0_12px_rgba(0,255,136,0.3)] hover:shadow-[0_0_20px_rgba(0,255,136,0.5)] active:scale-95'
                : 'bg-brand-border text-brand-muted cursor-not-allowed'
              }
            `}
          >
            {loading
              ? <Square className="w-3.5 h-3.5" />
              : <Send className="w-3.5 h-3.5" />
            }
          </button>
        </div>
        <p className="text-center text-[10px] text-brand-muted font-mono mt-2 tracking-widest">
          POWERED BY CLAUDE · LI.FI · COINGECKO
        </p>
      </div>
    </div>
  );
}