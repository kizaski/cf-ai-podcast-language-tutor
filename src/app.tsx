import { ChatHeader } from "./components/chat/ChatHeader";
import { MessageList } from "./components/chat/messages/MessageList";
import { ChatInput } from "./components/chat/ChatInput";
import { useTextareaAutoResize } from "./hooks/useTextareaAutoResize";
import { useAutoScroll } from "./hooks/useAutoScroll";
import { useChatAgent } from "./hooks/useChatAgent";
import { useTheme } from "./hooks/useTheme";
import { useEffect, useState } from "react";
import { AudioPlayerPanel } from "./components/audio-player/AudioPlayerPanel";
import { useEpisode } from "./hooks/useEpisode";
import { useParams } from "react-router-dom";
import { useAudioFile } from "./hooks/useAudioFile";

export default function Chat() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const { episode, fetchEpisode, setEpisode } = useEpisode({});

  const audioFileState = useAudioFile();
  const audioFile = { props: audioFileState };

  const { theme, toggleTheme } = useTheme();
  const [showDebug, setShowDebug] = useState(false);

  const {
    messages,
    // sendMessage,
    clearHistory,
    stop,
    addToolOutput,
    status,
    pendingToolConfirmation,
    toolsRequiringConfirmation,
    handleAgentInputChange,
    handleAgentSubmit,
    agentInput
  } = useChatAgent();

  const endRef = useAutoScroll([messages]);
  const textarea = useTextareaAutoResize();

  // Load episode if episodeId is in URL
  useEffect(() => {
    if (episodeId) fetchEpisode(episodeId);
  }, [episodeId, fetchEpisode]);

  return (
    <div className="h-screen w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
      <div
        className={`w-full max-w-7xl mx-auto flex gap-6 h-[calc(100vh-2rem)] ${!episodeId ? "justify-center" : "justify-start"}`}
      >
        {/* Chat Section */}
        <div className="relative w-full md:w-[450px] lg:w-[500px] shrink-0 flex flex-col shadow-xl rounded-md overflow-hidden border border-neutral-300 dark:border-neutral-800">
          <ChatHeader
            theme={theme}
            toggleTheme={toggleTheme}
            showDebug={showDebug}
            setShowDebug={setShowDebug}
            clearHistory={clearHistory}
          />

          {/* Chat Messages Area */}
          <div className="flex-1 relative">
            <MessageList
              messages={messages}
              showDebug={showDebug}
              endRef={endRef}
              addToolOutput={addToolOutput}
              toolsRequiringConfirmation={toolsRequiringConfirmation}
              audioFile={audioFile}
            />
          </div>

          {/* Chat Input */}
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
            audioFile={audioFile}
          />
        </div>

        {/* Audio Player Panel if on episode URL / have episode  */}
        {episodeId && (
          <AudioPlayerPanel
            episodeData={episode ?? undefined}
            setEpisodeData={setEpisode}
          />
        )}
      </div>
    </div>
  );
}
