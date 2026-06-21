'use client';

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot, Copy, Check, RotateCcw, Pencil, ThumbsUp, ThumbsDown } from 'lucide-react';
import ToolBadge from './ToolBadge';
import type { ChatMessage } from '@/lib/types';

interface Props {
  message: ChatMessage;
  isLast?: boolean;
  onRetry?: () => void;
  onEdit?: (index: number) => void;
  onFeedback?: (index: number, vote: 'up' | 'down') => void;
  messageIndex: number;
}

export default function Message({ message, isLast, onRetry, onEdit, onFeedback, messageIndex }: Props) {
  const isUser      = message.role === 'user';
  const isStreaming = !!message.isStreaming;
  const uniqueTools = Array.from(new Set((message.toolsUsed || []).map(t => t.tool)));

  const [copied,  setCopied]  = useState(false);

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
    <div className={`flex gap-2.5 sm:gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      
      {/* Avatar */}
      <div className={`
        flex-shrink-0 w-8 h-8 flex items-center justify-center font-black border-2 border-black
        ${isUser ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white'}
      `}>
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
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
          px-3.5 sm:px-5 py-2.5 sm:py-3.5 font-bold text-sm leading-relaxed border-2 border-black
          ${isUser
            ? 'bg-indigo-600 text-white'
            : message.isError
              ? 'bg-red-600 text-white'
              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-950 dark:text-emerald-100'
          }
        `}>
          {isUser ? (
            <p className="font-sans text-[13px] sm:text-[14px] break-words">{message.content}</p>
          ) : (
            <div className="prose-chainwise text-[13px] sm:text-[14px]">
              {isStreaming && !message.content ? (
                <div className="flex gap-1.5 items-center h-4">
                  {[0, 1, 2].map(j => (
                    <span
                      key={j}
                      className={`w-2 h-2 ${message.isError ? 'bg-white' : 'bg-emerald-800 dark:bg-emerald-300'} animate-pulse`}
                      style={{ animationDelay: `${j * 0.2}s` }}
                    />
                  ))}
                </div>
              ) : (
                <>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                  {isStreaming && (
                    <span
                      className="inline-block w-1.5 h-3.5 bg-black dark:bg-white ml-1 align-middle"
                      style={{ animation: 'blink 0.8s step-end infinite' }}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Actions row */}
        {!isStreaming && (
          <div className={`flex items-center gap-2 px-0.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
            {message.timestamp && (
              <span className="text-[10px] sm:text-xs font-black bg-slate-300 dark:bg-slate-700 text-slate-900 dark:text-slate-100 px-1.5 py-0.5 border border-slate-500">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCopy}
                title="Copy message"
                className="p-1.5 border-2 border-slate-500 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold touch-manipulation"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 font-black" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              {isUser && onEdit && (
                <button
                  onClick={() => onEdit(messageIndex)}
                  title="Edit message"
                  className="p-1.5 border-2 border-slate-500 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold touch-manipulation"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}

              {!isUser && isLast && onRetry && (
                <button
                  onClick={onRetry}
                  title="Retry response"
                  className="p-1.5 border-2 border-slate-500 bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold touch-manipulation"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}

              {!isUser && onFeedback && (
                <>
                  <button
                    onClick={() => onFeedback(messageIndex, 'up')}
                    title="Good response"
                    className={`p-1.5 border-2 border-slate-500 font-bold touch-manipulation
                      ${message.feedback === 'up'
                        ? 'bg-emerald-500 text-white border-emerald-800'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                      }`}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => onFeedback(messageIndex, 'down')}
                    title="Bad response"
                    className={`p-1.5 border-2 border-slate-500 font-bold touch-manipulation
                      ${message.feedback === 'down'
                        ? 'bg-red-500 text-white border-red-800'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                      }`}
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}