import { ChatHeader } from "./components/chat/ChatHeader";
import { MessageList } from "./components/chat/messages/MessageList";
import { ChatInput } from "./components/chat/ChatInput";
import { useTextareaAutoResize } from "./hooks/useTextareaAutoResize";
import { useAutoScroll } from "./hooks/useAutoScroll";
import { useChatAgent } from "./hooks/useChatAgent";
import { useTheme } from "./hooks/useTheme";
import { useState } from "react";
import { formatTime } from "./lib/utils";

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

  // ---- BEGIN AUDIO PLAYER PANEL ----
  // Helper functions (define these outside the component or as utils)

  const getInsertColor = (type: string): string => {
    const colors: Record<string, string> = {
      primer_intro: "#3b82f6", // blue
      primer_outro: "#8b5cf6", // purple
      ad: "#10b981", // green
      transition: "#f59e0b" // amber
    };
    return colors[type] || "#6b7280"; // default gray
  };

  // Event handlers
  const handlePlayPause = () => {
    setPlaybackState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
  };

  const handleSeek = (time: number) => {
    setPlaybackState((prev) => ({ ...prev, currentTime: time }));
  };

  const handleToggleInsert = (insertId: string) => {
    // Toggle insert enabled state
    setEpisodeData((prev) => ({
      ...prev,
      inserts: prev.inserts.map((insert) =>
        insert.id === insertId
          ? { ...insert, enabled: !insert.enabled }
          : insert
      )
    }));

    // Update playbackState.activeInserts
    const insert = episodeData.inserts.find((i) => i.id === insertId);
    if (insert) {
      setPlaybackState((prev) => {
        const isCurrentlyActive = prev.activeInserts.includes(insertId);
        if (isCurrentlyActive) {
          // Remove from active inserts
          return {
            ...prev,
            activeInserts: prev.activeInserts.filter((id) => id !== insertId)
          };
        } else {
          // Add to active inserts
          return {
            ...prev,
            activeInserts: [...prev.activeInserts, insertId]
          };
        }
      });
    }
  };

  const handleSkipBackward = () => {
    setPlaybackState((prev) => ({
      ...prev,
      currentTime: Math.max(0, prev.currentTime - 10)
    }));
  };

  const handleSkipForward = () => {
    setPlaybackState((prev) => ({
      ...prev,
      currentTime: Math.min(episodeData.episode.duration, prev.currentTime + 30)
    }));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaybackState((prev) => ({
      ...prev,
      volume: parseFloat(e.target.value)
    }));
  };

  const handlePlaybackRateChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setPlaybackState((prev) => ({
      ...prev,
      playbackRate: parseFloat(e.target.value)
    }));
  };

  const handleToggleInserts = () => {
    // Toggle all inserts on/off
    const allEnabled = episodeData.inserts.every((insert) => insert.enabled);

    setEpisodeData((prev) => ({
      ...prev,
      inserts: prev.inserts.map((insert) => ({
        ...insert,
        enabled: !allEnabled
      }))
    }));

    setPlaybackState((prev) => ({
      ...prev,
      activeInserts: !allEnabled
        ? episodeData.inserts.map((insert) => insert.id)
        : []
    }));
  };

  const handleAddInsert = () => {
    // This would open a modal or form to add a new insert
    // For now, let's just log and add a dummy insert
    const newInsert = {
      id: "insert_1",
      type: "primer_intro", // "primer_intro", "primer_outro", "ad", "transition"
      title: "Welcome Primer",
      audioUrl: "https://example.com/inserts/welcome_primer.mp3",
      duration: 75, // seconds (1:15)
      startTime: 0, // where it should be inserted (in seconds from episode start)
      endTime: 75,
      enabled: true,
      metadata: {
        category: "branding",
        version: "v2",
        creator: "studio_team"
      }
    };

    setEpisodeData((prev) => ({
      ...prev,
      inserts: [...prev.inserts, newInsert]
    }));

    setPlaybackState((prev) => ({
      ...prev,
      activeInserts: [...prev.activeInserts, newInsert.id]
    }));
  };

  const handleAddInsertAtTime = (time: number) => {
    const newInsert = {
      id: "insert_1",
      type: "primer_intro", // "primer_intro", "primer_outro", "ad", "transition"
      title: "Welcome Primer",
      audioUrl: "https://example.com/inserts/welcome_primer.mp3",
      duration: 75, // seconds (1:15)
      startTime: 0, // where it should be inserted (in seconds from episode start)
      endTime: 75,
      enabled: true,
      metadata: {
        category: "branding",
        version: "v2",
        creator: "studio_team"
      }
    };

    setEpisodeData((prev) => ({
      ...prev,
      inserts: [...prev.inserts, newInsert]
    }));

    setPlaybackState((prev) => ({
      ...prev,
      activeInserts: [...prev.activeInserts, newInsert.id]
    }));
  };

  // Example state management -- mock
  const [episodeData, setEpisodeData] = useState({
    episode: {
      id: "ep_123",
      title: "The Future of AI in Podcasting",
      duration: 2723, // total seconds (45:23)
      audioUrl: "https://example.com/audio/episode123.mp3",
      publishedDate: "2024-01-15",
      description:
        "Exploring how artificial intelligence is transforming podcast creation and consumption."
    },
    inserts: [
      {
        id: "insert_1",
        type: "primer_intro", // "primer_intro", "primer_outro", "ad", "transition"
        title: "Welcome Primer",
        audioUrl: "https://example.com/inserts/welcome_primer.mp3",
        duration: 75, // seconds (1:15)
        startTime: 0, // where it should be inserted (in seconds from episode start)
        endTime: 75,
        enabled: true,
        metadata: {
          category: "branding",
          version: "v2",
          creator: "studio_team"
        }
      },
      {
        id: "insert_2",
        type: "primer_outro",
        title: "Closing Remarks",
        audioUrl: "https://example.com/inserts/closing_reminder.mp3",
        duration: 90,
        startTime: 2633, // inserted at 43:53 (total 45:23 - 1:30)
        endTime: 2723,
        enabled: true,
        metadata: {
          category: "cta",
          version: "v1",
          creator: "host"
        }
      },
      {
        id: "insert_3",
        type: "ad",
        title: "Sponsor Message",
        audioUrl: "https://example.com/inserts/sponsor_ad.mp3",
        duration: 60,
        startTime: 900, // inserted at 15:00
        endTime: 960,
        enabled: true,
        metadata: {
          category: "monetization",
          sponsor: "TechCorp",
          campaign: "Q1_2024"
        }
      }
    ],
    transcript: [
      {
        id: "transcript_1",
        startTime: 0,
        endTime: 300,
        text: "Welcome to today's episode about AI in podcasting. This technology is revolutionizing how we create and consume audio content.",
        speaker: "host"
      },
      {
        id: "transcript_2",
        startTime: 300,
        endTime: 600,
        text: "One of the most exciting developments is AI-powered editing tools that can automatically remove filler words and enhance audio quality.",
        speaker: "host"
      }
    ],
    playbackState: {
      currentTime: 0,
      isPlaying: false,
      volume: 0.8,
      playbackRate: 1.0,
      activeInserts: ["insert_1", "insert_2", "insert_3"]
    }
  });

  const [playbackState, setPlaybackState] = useState({
    currentTime: 0,
    isPlaying: false,
    volume: 0.8,
    playbackRate: 1.0,
    activeInserts: episodeData.inserts.filter((i) => i.enabled).map((i) => i.id)
  });
  // ---- END AUDIO PLAYER PANEL ----

  return (
    <div className="h-screen w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
      <div className="w-full max-w-7xl mx-auto flex gap-6 h-[calc(100vh-2rem)]">
        {/* Chat Section - Fixed width */}
        <div className="relative w-full md:w-[450px] lg:w-[500px] shrink-0 flex flex-col shadow-xl rounded-md overflow-hidden border border-neutral-300 dark:border-neutral-800">
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

        {/* ---- BEGIN AUDIO PLAYER PANEL ---- */}
        {/* Audio Player Section - Takes remaining space */}
        <div className="flex-1 min-w-0 flex flex-col shadow-xl rounded-md overflow-hidden border border-neutral-300 dark:border-neutral-800">
          {/* ... header remains the same */}

          {/* Audio Player Content - Scrollable */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6">
              {/* Audio Player */}
              <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold">Current Playback</h2>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                      {formatTime(playbackState.currentTime)} /{" "}
                      {formatTime(episodeData.episode.duration)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleToggleInserts} // FIXED: Changed from toggleInserts
                      className={`px-3 py-2 rounded-lg transition ${
                        playbackState.activeInserts.length > 0
                          ? "bg-blue-600 text-white"
                          : "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300"
                      }`}
                    >
                      {playbackState.activeInserts.length > 0
                        ? "Inserts On"
                        : "Inserts Off"}
                    </button>
                    <button
                      onClick={handlePlayPause} // FIXED: Changed from conditional playAudio
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    >
                      {playbackState.isPlaying ? "Pause" : "Play All"}
                    </button>
                  </div>
                </div>

                {/* Progress Bar with Insert Markers */}
                <div className="space-y-4">
                  <div className="relative h-2 bg-neutral-300 dark:bg-neutral-700 rounded-full">
                    {/* Insert markers */}
                    {episodeData.inserts
                      .filter((insert) => insert.enabled)
                      .map((insert) => (
                        <div
                          key={insert.id}
                          className="absolute top-1/2 transform -translate-y-1/2 w-3 h-3 rounded-full cursor-pointer"
                          style={{
                            left: `${(insert.startTime / episodeData.episode.duration) * 100}%`,
                            backgroundColor: getInsertColor(insert.type)
                          }}
                          title={`${insert.title} (${insert.type})`}
                          onClick={() => handleSeek(insert.startTime)}
                        />
                      ))}

                    {/* Progress fill */}
                    <div
                      className="absolute top-0 left-0 h-full bg-blue-600 rounded-full"
                      style={{
                        width: `${(playbackState.currentTime / episodeData.episode.duration) * 100}%`
                      }}
                    />
                  </div>

                  <div className="flex justify-between text-sm">
                    <span>{formatTime(playbackState.currentTime)}</span>
                    <span>{formatTime(episodeData.episode.duration)}</span>
                  </div>

                  {/* Audio Controls */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Speed:</span>
                      <select
                        value={playbackState.playbackRate}
                        onChange={handlePlaybackRateChange} // FIXED: Added handler
                        className="px-2 py-1 bg-neutral-200 dark:bg-neutral-700 rounded text-sm"
                      >
                        <option value="0.5">0.5x</option>
                        <option value="0.75">0.75x</option>
                        <option value="1">1x</option>
                        <option value="1.25">1.25x</option>
                        <option value="1.5">1.5x</option>
                        <option value="2">2x</option>
                      </select>
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={handleSkipBackward} // FIXED: Added handler
                        className="p-3 rounded-full bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition"
                      >
                        ⏮
                      </button>
                      <button
                        onClick={handlePlayPause} // FIXED: Removed conditional playAudio
                        className="p-4 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition"
                      >
                        {playbackState.isPlaying ? "⏸" : "▶"}
                      </button>
                      <button
                        onClick={handleSkipForward} // FIXED: Added handler
                        className="p-3 rounded-full bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition"
                      >
                        ⏭
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm">Volume:</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={playbackState.volume}
                        onChange={handleVolumeChange} // FIXED: Added handler
                        className="w-24"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Inserts Section */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">
                    Inserts ({episodeData.inserts.length})
                  </h3>
                  <button
                    onClick={handleAddInsert} // FIXED: Added handler
                    className="text-sm px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition"
                  >
                    + Add Insert
                  </button>
                </div>

                <div className="space-y-3">
                  {episodeData.inserts.map((insert) => (
                    <div
                      key={insert.id}
                      className={`p-4 rounded-lg border transition cursor-pointer ${
                        insert.enabled
                          ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                          : "bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700"
                      }`}
                      onClick={() => handleToggleInsert(insert.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor: getInsertColor(insert.type)
                            }}
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{insert.title}</h4>
                              <span className="text-xs px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded">
                                {formatTime(insert.duration)}
                              </span>
                            </div>
                            <p className="text-sm text-neutral-600 dark:text-neutral-400">
                              {insert.type.replace("_", " ")} • Starts at{" "}
                              {formatTime(insert.startTime)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={insert.enabled}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleToggleInsert(insert.id);
                              }}
                              className="rounded"
                            />
                            <span className="text-sm">
                              {insert.enabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSeek(insert.startTime);
                            }}
                            className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition"
                          >
                            Preview
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transcript Section */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Transcript</h3>
                <div className="space-y-3">
                  {episodeData.transcript.map((segment) => {
                    const hasInsert = episodeData.inserts.some(
                      (insert) =>
                        insert.startTime >= segment.startTime &&
                        insert.startTime <= segment.endTime
                    );

                    return (
                      <div
                        key={segment.id}
                        className={`p-4 rounded-lg border cursor-pointer transition hover:bg-neutral-100 dark:hover:bg-neutral-750 ${
                          playbackState.currentTime >= segment.startTime &&
                          playbackState.currentTime <= segment.endTime
                            ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                            : "bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700"
                        }`}
                        onClick={() => handleSeek(segment.startTime)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                              {formatTime(segment.startTime)}
                            </span>
                            {hasInsert && (
                              <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded">
                                Has Insert
                              </span>
                            )}
                            {segment.speaker && (
                              <span className="text-xs px-2 py-1 bg-neutral-200 dark:bg-neutral-700 rounded">
                                {segment.speaker}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddInsertAtTime(segment.startTime); // FIXED: Added handler
                            }}
                            className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition"
                          >
                            + Insert Here
                          </button>
                        </div>
                        <p className="text-neutral-700 dark:text-neutral-300">
                          {segment.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
