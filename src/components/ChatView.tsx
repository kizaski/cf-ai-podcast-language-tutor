import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AudioPlayerPanel } from "./audio-player/AudioPlayerPanel";
import { ChatHeader } from "./chat/ChatHeader";
import { ChatInput } from "./chat/ChatInput";
import { MessageList } from "./chat/messages/MessageList";
import { useAudioFile } from "@/hooks/useAudioFile";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { useChatAgent } from "@/hooks/useChatAgent";
import { useEpisode } from "@/hooks/useEpisode";
import { useTextareaAutoResize } from "@/hooks/useTextareaAutoResize";
import { usePodcastPlaybackState } from "@/stores/usePlaybackstate";

export function ChatView({
  sessionId,
  theme,
  toggleTheme
}: {
  sessionId: string;
  theme: any;
  toggleTheme: any;
}) {
  const { episodeId } = useParams<{ episodeId: string }>();
  const { episode, fetchEpisode, setEpisode } = useEpisode({});
  const audioFileState = useAudioFile();
  const audioFile = { props: audioFileState };
  const [showBottomMessage, setShowBottomMessage] = useState(true);
  const [showDebug, setShowDebug] = useState(false);

  const {
    messages,
    clearHistory,
    stop,
    addToolOutput,
    status,
    pendingToolConfirmation,
    toolsRequiringConfirmation,
    handleAgentInputChange,
    handleAgentSubmit,
    agentInput
  } = useChatAgent({ sessionId, episodeId });

  const endRef = useAutoScroll([messages]);
  const textarea = useTextareaAutoResize();

  const currentTime = usePodcastPlaybackState((state) => state.currentTime);
  const isPlaying = usePodcastPlaybackState((state) => state.isPlaying);

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
            onSubmit={(e: React.FormEvent) => {
              handleAgentSubmit(e, {
                currentTime: currentTime,
                isPlaying: isPlaying
              });
            }}
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

      <div
        className={`fixed ${showBottomMessage ? "bottom-0" : "-bottom-20"} transition-all duration-300 ease-in-out left-0 right-0 flex items-center justify-between bg-yellow-200 text-black p-3 border-t border-yellow-300 z-50`}
      >
        <div className="w-full max-w-7xl mx-auto flex items-center">
          <div className="w-10 opacity-0">×</div>
          <div className="flex-1 flex justify-center items-center">
            <div className="flex items-center">
              <span className="font-medium">
                Important! Enable autoplay for inserted clips to work properly.
              </span>
            </div>
          </div>
          <button
            className="w-10 flex justify-center font-bold text-red-500 hover:text-red-700 text-lg transition-colors"
            onClick={() => setShowBottomMessage(false)}
            aria-label="Dismiss message"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
