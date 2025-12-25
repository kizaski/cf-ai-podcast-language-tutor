import { MessageItem } from "./MessageItem";
import { EmptyState } from "./EmptyState";
import { formatTime } from "@/lib/utils";

export function MessageList({
  messages,
  showDebug,
  endRef,
  addToolOutput,
  toolsRequiringConfirmation,
  audioFile
}: any) {
  if (!messages.length) return <EmptyState audioFile={audioFile} />;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 max-h-[calc(100vh-10rem)]">
      {messages.map((m: any, i: number) => (
        <MessageItem
          key={m.id}
          message={m}
          previous={messages[i - 1]}
          showDebug={showDebug}
          formatTime={formatTime}
          addToolOutput={addToolOutput}
          toolsRequiringConfirmation={toolsRequiringConfirmation}
        />
      ))}
      <div ref={endRef} />
    </div>
  );
}
