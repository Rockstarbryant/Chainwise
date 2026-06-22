import { Suspense } from 'react';
import ChatWindow from '@/components/chat/ChatWindow';

export const metadata = { title: 'Agent Chat — ChainWise' };

export default function ChatPage() {
  return (
    <div className="h-full flex flex-col">
      <Suspense fallback={null}>
        <ChatWindow />
      </Suspense>
    </div>
  );
}