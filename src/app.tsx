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
    <div className="h-screen w-full p-4 flex flex-wrap justify-center items-center bg-fixed overflow-y-auto md:overflow-hidden">
      <div className="w-full md:h-[calc(100vh-2rem)] md:overflow-y-auto md:flex-1"></div>
      <div className="w-full mx-2 max-w-lg flex flex-col shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800 md:h-[calc(100vh-2rem)]">
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

      <div className="w-full md:h-[calc(100vh-2rem)] md:overflow-y-auto md:flex-1">
        <div className="sticky top-0 left-0 right-0 w-full p-5">
          <div className="p-8">
            <h1 className="text-2xl font-bold mb-4">
              Audio Player with Inserts
            </h1>
            {/* TODO -- audio player */}
          </div>
        </div>
        {/* TODO -- transcript */}
        <div className="h-[200vh]">TEST</div>
      </div>
    </div>
  );
}
