'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Square, X } from 'lucide-react';

interface Props {
  onSend: (text: string) => void;
  loading: boolean;
  disabled?: boolean;
  prefillText?: string;
  onCancelEdit?: () => void;
}

export default function MessageInput({ onSend, loading, disabled, prefillText, onCancelEdit }: Props) {
  const [value, setValue]   = useState('');
  const textareaRef         = useRef<HTMLTextAreaElement>(null);
  const isEditMode          = !!prefillText && !!onCancelEdit;

  useEffect(() => {
    if (prefillText !== undefined) {
      setValue(prefillText);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 160) + 'px';
        el.setSelectionRange(el.value.length, el.value.length);
      });
    }
  }, [prefillText]);

  const resetHeight = () => {
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleSend = useCallback(() => {
    const text = value.trim();
    if (!text || loading) return;
    onSend(text);
    setValue('');
    resetHeight();
  }, [value, loading, onSend]);

  const handleCancel = useCallback(() => {
    setValue('');
    resetHeight();
    onCancelEdit?.();
  }, [onCancelEdit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && isEditMode) handleCancel();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };

  const canSend = value.trim() && !loading && !disabled;

  return (
    <div className="
      flex-shrink-0
      border-t-4 border-amber-600
      bg-amber-300 dark:bg-amber-800
      px-3 sm:px-4
      pt-3 pb-3
      pb-[max(0.75rem,env(safe-area-inset-bottom))]
    ">
      <div className="max-w-3xl mx-auto space-y-2">

        {isEditMode && (
          <div className="flex items-center justify-between bg-white px-2 py-1 border-2 border-amber-600 mb-2">
            <span className="text-xs font-black text-amber-700 tracking-wide uppercase">
              Editing message
            </span>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 text-xs font-bold text-red-700 touch-manipulation bg-red-100 px-2 py-0.5 border border-red-300"
            >
              <X className="w-3 h-3" />
              Cancel
            </button>
          </div>
        )}

        <div className={`
          flex items-end gap-2 sm:gap-3 border-4 px-3 sm:px-4 py-2.5 sm:py-3
          bg-white dark:bg-slate-950 border-amber-600
        `}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={isEditMode
              ? 'Edit your message…'
              : 'Ask about fees, bridges, P2P availability, giveaways…'
            }
            rows={1}
            disabled={disabled}
            className="
              flex-1 bg-transparent resize-none outline-none
              font-sans font-bold text-[14px] sm:text-sm
              text-slate-900 dark:text-slate-100
              placeholder:text-slate-400 dark:placeholder:text-slate-500
              min-h-[22px] max-h-[160px] leading-relaxed
              disabled:opacity-50
            "
          />

          {isEditMode && (
            <button
              onClick={handleCancel}
              title="Cancel edit (Esc)"
              className="
                flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9
                flex items-center justify-center font-bold
                bg-red-600 text-white border-2 border-red-800
                touch-manipulation
              "
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleSend}
            disabled={!canSend}
            title={isEditMode ? 'Send edited message (Enter)' : 'Send (Enter)'}
            className={`
              flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9
              flex items-center justify-center font-bold border-2
              touch-manipulation
              ${canSend
                ? 'bg-amber-600 text-white border-amber-800'
                : 'bg-slate-300 dark:bg-slate-800 text-slate-500 border-slate-500 cursor-not-allowed'
              }
            `}
          >
            {loading
              ? <Square className="w-4 h-4" />
              : <Send className="w-4 h-4 ml-0.5" />
            }
          </button>
        </div>

        <p className="text-center text-[10px] font-black tracking-widest text-amber-900 dark:text-amber-200 uppercase bg-amber-400 dark:bg-amber-700 py-1 border-2 border-amber-600">
          Powered by Claude · LI.FI · CoinGecko
        </p>
      </div>
    </div>
  );
}