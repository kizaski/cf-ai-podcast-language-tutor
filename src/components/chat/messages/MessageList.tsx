import { MessageItem } from "./MessageItem";
import { EmptyState } from "./EmptyState";

export function MessageList({ messages, showDebug, endRef }: any) {
  if (!messages.length) return <EmptyState />;

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 max-h-[calc(100vh-10rem)]">
      {messages.map((m: any, i: number) => (
        <MessageItem
          key={m.id}
          message={m}
          previous={messages[i - 1]}
          showDebug={showDebug}
          formatTime={formatTime}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}
