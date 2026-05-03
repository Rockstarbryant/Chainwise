'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ToolBadge from './ToolBadge';
import type { ChatMessage } from '@/lib/types';

interface Props {
  message: ChatMessage;
}

export default function Message({ message }: Props) {
  const isUser = message.role === 'user';
  const uniqueTools = Array.from(new Set((message.toolsUsed || []).map(t => t.tool)));

  return (
    <div className={`flex gap-3 animate-fade-up ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>

      {/* Avatar */}
      <div className={`
        flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mt-1
        ${isUser
          ? 'bg-brand-surface border border-brand-border text-brand-green'
          : 'bg-gradient-to-br from-brand-green to-brand-blue text-black shadow-[0_0_12px_rgba(0,255,136,0.35)]'
        }
      `}>
        {isUser ? 'U' : '⚡'}
      </div>

      <div className={`flex flex-col gap-1.5 max-w-[82%] ${isUser ? 'items-end' : 'items-start'}`}>

        {/* Tool badges */}
        {uniqueTools.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {uniqueTools.map(t => <ToolBadge key={t} tool={t} />)}
          </div>
        )}

        {/* Bubble */}
        <div className={`
          px-4 py-3 rounded-2xl text-sm leading-relaxed
          ${isUser
            ? 'bg-gradient-to-br from-brand-dim to-brand-blue text-black font-medium rounded-tr-sm'
            : message.isError
              ? 'bg-red-950 border border-red-800 text-red-300 rounded-tl-sm font-mono text-xs'
              : 'bg-brand-surface border border-brand-border rounded-tl-sm'
          }
        `}>
          {isUser ? (
            <p className="font-mono text-[13px]">{message.content}</p>
          ) : (
            <div className="prose-chainwise">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Timestamp */}
        {message.timestamp && (
          <span className="text-[10px] text-brand-muted font-mono px-1">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
}