import { ChatHeader } from "./components/chat/ChatHeader";
import { MessageList } from "./components/chat/messages/MessageList";
import { ChatInput } from "./components/chat/ChatInput";
import { useTextareaAutoResize } from "./hooks/useTextareaAutoResize";
import { useAutoScroll } from "./hooks/useAutoScroll";
import { useChatAgent } from "./hooks/useChatAgent";
import { useTheme } from "./hooks/useTheme";
import { useState } from "react";

export default function Chat() {
  const { theme, toggleTheme } = useTheme();
  const [showDebug, setShowDebug] = useState(false);

  const {
    messages,
    // sendMessage,
    clearHistory,
    stop,
    status,
    pendingToolConfirmation,
    handleAgentInputChange,
    handleAgentSubmit,
    agentInput
  } = useChatAgent();

  const endRef = useAutoScroll([messages]);
  const textarea = useTextareaAutoResize();

  return (
    <div className="h-screen w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
      <div className="h-[calc(100vh-2rem)] w-full mx-auto max-w-lg flex flex-col shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800">
        <ChatHeader
          theme={theme}
          toggleTheme={toggleTheme}
          showDebug={showDebug}
          setShowDebug={setShowDebug}
          clearHistory={clearHistory}
        />

        <MessageList
          messages={messages}
          showDebug={showDebug}
          endRef={endRef}
        />

        <ChatInput
          value={agentInput}
          onChange={handleAgentInputChange}
          onSubmit={handleAgentSubmit}
          onStop={stop}
          disabled={pendingToolConfirmation}
          status={status}
          textareaHeight={textarea.height}
          placeholder={
            pendingToolConfirmation
              ? "Please respond to the tool confirmation above..."
              : "Send a message..."
          }
        />
      </div>
    </div>
  );
}
