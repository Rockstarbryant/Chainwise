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

  /* ── Pre-fill on edit trigger ─────────────────────────────────────────── */
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
    /* pb-safe ensures the input clears the iOS home indicator */
    <div className="
      flex-shrink-0
      border-t border-zinc-200 dark:border-zinc-800
      bg-white/90 dark:bg-zinc-950/90
      backdrop-blur-sm
      px-3 sm:px-4
      pt-3 pb-3
      pb-[max(0.75rem,env(safe-area-inset-bottom))]
    ">
      <div className="max-w-3xl mx-auto space-y-2">

        {/* Edit mode banner */}
        {isEditMode && (
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400 tracking-wide uppercase">
              Editing message
            </span>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors touch-manipulation"
            >
              <X className="w-3 h-3" />
              Cancel
            </button>
          </div>
        )}

        <div className={`
          flex items-end gap-2 sm:gap-3 rounded-2xl border px-3 sm:px-4 py-2.5 sm:py-3
          bg-zinc-50 dark:bg-zinc-900 transition-colors duration-200
          ${isEditMode
            ? 'border-amber-400 dark:border-amber-500/60'
            : loading
              ? 'border-zinc-200 dark:border-zinc-800'
              : 'border-zinc-300 dark:border-zinc-700 focus-within:border-zinc-500 dark:focus-within:border-zinc-400'
          }
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
              font-sans text-[14px] sm:text-sm
              text-zinc-900 dark:text-zinc-100
              placeholder:text-zinc-400 dark:placeholder:text-zinc-500
              min-h-[22px] max-h-[160px] leading-relaxed
              disabled:opacity-50
            "
          />

          {/* Cancel (edit mode) */}
          {isEditMode && (
            <button
              onClick={handleCancel}
              title="Cancel edit (Esc)"
              className="
                flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl
                flex items-center justify-center
                bg-zinc-200 dark:bg-zinc-800
                text-zinc-500 hover:bg-zinc-300 dark:hover:bg-zinc-700
                transition-colors duration-200 touch-manipulation
              "
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            title={isEditMode ? 'Send edited message (Enter)' : 'Send (Enter)'}
            className={`
              flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-xl
              flex items-center justify-center
              transition-colors duration-200 touch-manipulation
              ${canSend
                ? isEditMode
                  ? 'bg-amber-500 dark:bg-amber-400 text-white dark:text-zinc-900 hover:bg-amber-600 dark:hover:bg-amber-300 active:bg-amber-700'
                  : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 active:bg-zinc-700'
                : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
              }
            `}
          >
            {loading
              ? <Square className="w-4 h-4" />
              : <Send   className="w-4 h-4 ml-0.5" />
            }
          </button>
        </div>

        <p className="text-center text-[9px] sm:text-[10px] text-zinc-400 dark:text-zinc-500 font-sans tracking-wide uppercase">
          Powered by Claude · LI.FI · CoinGecko
        </p>
      </div>
    </div>
  );
}