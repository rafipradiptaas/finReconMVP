import { ChatBox } from '@/components/chatbot/chat-box';
import { getSessionContext } from '@/lib/auth';

export default async function ChatPage() {
  const session = await getSessionContext();

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Chatbot</h1>
      {session?.role === 'ap_staff' ? (
        <p className="text-muted-foreground text-sm">Chatbot hanya untuk approver dan admin.</p>
      ) : (
        <ChatBox />
      )}
    </section>
  );
}
