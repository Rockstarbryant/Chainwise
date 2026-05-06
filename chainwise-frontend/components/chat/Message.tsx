'use client';

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot, Copy, Check, RotateCcw, Pencil } from 'lucide-react';
import ToolBadge from './ToolBadge';
import type { ChatMessage } from '@/lib/types';

interface Props {
  message: ChatMessage;
  isLast?: boolean;
  onRetry?: () => void;
  onEdit?: (index: number) => void;
  messageIndex: number;
}

export default function Message({ message, isLast, onRetry, onEdit, messageIndex }: Props) {
  const isUser      = message.role === 'user';
  const uniqueTools = Array.from(new Set((message.toolsUsed || []).map(t => t.tool)));

  const [copied,  setCopied]  = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      const el = document.createElement('textarea');
      el.value = message.content;
      el.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  return (
    <div
      className={`flex gap-2.5 sm:gap-4 animate-fade-up ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Avatar */}
      <div className={`
        flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full
        flex items-center justify-center mt-0.5
        ${isUser
          ? 'bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300'
          : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
        }
      `}>
        {isUser
          ? <User className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          : <Bot  className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        }
      </div>

      <div className={`flex flex-col gap-1.5 sm:gap-2 min-w-0 max-w-[86%] sm:max-w-[82%] ${isUser ? 'items-end' : 'items-start'}`}>

        {/* Tool badges */}
        {uniqueTools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {uniqueTools.map(t => <ToolBadge key={t} tool={t} />)}
          </div>
        )}

        {/* Bubble */}
        <div className={`
          px-3.5 sm:px-5 py-2.5 sm:py-3.5 rounded-2xl text-sm leading-relaxed
          ${isUser
            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium rounded-tr-sm'
            : message.isError
              ? 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 rounded-tl-sm text-xs'
              : 'bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-tl-sm'
          }
        `}>
          {isUser ? (
            <p className="font-sans text-[13px] sm:text-[14px] break-words">{message.content}</p>
          ) : (
            <div className="prose-chainwise text-[13px] sm:text-[14px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Actions row — timestamp + buttons */}
        <div className={`flex items-center gap-1.5 sm:gap-2 px-0.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>

          {/* Timestamp */}
          {message.timestamp && (
            <span className="text-[10px] sm:text-xs text-zinc-400 dark:text-zinc-500">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}

          {/* Action buttons */}
          {/* On touch devices always show; on pointer devices show on hover */}
          <div className={`
            flex items-center gap-0.5
            transition-opacity duration-150
            sm:${hovered ? 'opacity-100' : 'opacity-0'}
            opacity-100 sm:opacity-0
            ${hovered ? 'sm:opacity-100' : ''}
          `}>

            {/* Copy */}
            <button
              onClick={handleCopy}
              title="Copy message"
              className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700 transition-colors touch-manipulation"
            >
              {copied
                ? <Check  className="w-3.5 h-3.5 text-emerald-500" />
                : <Copy   className="w-3.5 h-3.5" />
              }
            </button>

            {/* Edit — user messages only */}
            {isUser && onEdit && (
              <button
                onClick={() => onEdit(messageIndex)}
                title="Edit message"
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700 transition-colors touch-manipulation"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Retry — last assistant message only */}
            {!isUser && isLast && onRetry && (
              <button
                onClick={onRetry}
                title="Retry response"
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700 transition-colors touch-manipulation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}