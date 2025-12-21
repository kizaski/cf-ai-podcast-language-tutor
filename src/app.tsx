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
      <div className="w-full max-w-7xl mx-auto flex gap-6 h-[calc(100vh-2rem)]">
        {/* Chat Section - Fixed width */}
        <div className="w-full md:w-[450px] lg:w-[500px] flex-shrink-0 flex flex-col shadow-xl rounded-md overflow-hidden border border-neutral-300 dark:border-neutral-800">
          <ChatHeader
            theme={theme}
            toggleTheme={toggleTheme}
            showDebug={showDebug}
            setShowDebug={setShowDebug}
            clearHistory={clearHistory}
          />

          {/* Chat Messages Area - Takes available space */}
          <div className="flex-1 relative">
            <MessageList
              messages={messages}
              showDebug={showDebug}
              endRef={endRef}
            />
          </div>

          {/* Chat Input - Fixed at bottom of chat div */}
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

        {/* Audio Player Section - Takes remaining space */}
        <div className="flex-1 min-w-0 flex flex-col shadow-xl rounded-md overflow-hidden border border-neutral-300 dark:border-neutral-800">
          {/* Audio Player Header */}
          <div className="px-6 py-4 border-b border-neutral-300 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
            <h1 className="text-xl font-bold">Audio Player with Inserts</h1>
          </div>

          {/* Audio Player Content - Scrollable */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              {/* Audio Player */}
              <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold">Current Episode</h2>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      Episode #123 • 45:23
                    </p>
                  </div>
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                    Play All
                  </button>
                </div>

                {/* Audio controls placeholder */}
                <div className="space-y-4">
                  <div className="h-2 bg-neutral-300 dark:bg-neutral-700 rounded-full"></div>
                  <div className="flex justify-between text-sm">
                    <span>0:00</span>
                    <span>45:23</span>
                  </div>
                  <div className="flex justify-center gap-4">
                    <button className="p-3 rounded-full bg-neutral-200 dark:bg-neutral-700">
                      ⏮
                    </button>
                    <button className="p-4 rounded-full bg-blue-600 text-white">
                      ▶
                    </button>
                    <button className="p-3 rounded-full bg-neutral-200 dark:bg-neutral-700">
                      ⏭
                    </button>
                  </div>
                </div>
              </div>

              {/* Transcript Section */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Transcript</h3>
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-750 cursor-pointer transition"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                          0:{i * 5}:00
                        </span>
                        <button className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">
                          Insert
                        </button>
                      </div>
                      <p className="text-neutral-700 dark:text-neutral-300">
                        This is a sample transcript line {i}. You can click to
                        insert this text into the chat.
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
