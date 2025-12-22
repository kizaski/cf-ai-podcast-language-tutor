import { useState, useCallback, useEffect, useRef } from "react";
import { useAudioEngine } from "./useAudioEngine";
import type { EpisodeData, PlaybackState, Insert } from "@/types/audio-types";

// Mock audio URLs - replace with real audio files in production
const MOCK_AUDIO_BASE_URL = "ignore-public/APO6849342593.mp3";
const MOCK_INSERT_AUDIO_URL = "ignore-public/section_1_intro.wav";
const MOCK_INSERT_AUDIO_URLo = "ignore-public/section_1_outro.mp3";
const MOCK_INSERT_AUDIO_URL2i = "ignore-public/section_2_intro.mp3";

const createMockEpisodeData = (): EpisodeData => ({
  episode: {
    id: "ep_123",
    title: "The Future of AI in Podcasting",
    duration: 2723,
    audioUrl: MOCK_AUDIO_BASE_URL,
    publishedDate: "2024-01-15",
    description:
      "Exploring how artificial intelligence is transforming podcast creation and consumption."
  },
  inserts: [
    {
      id: "insert_1",
      type: "primer_intro",
      title: "Welcome Primer",
      audioUrl: MOCK_INSERT_AUDIO_URL,
      duration: 10,
      startTime: 0,
      endTime: 10,
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
      audioUrl: MOCK_INSERT_AUDIO_URLo,
      duration: 15,
      startTime: 120,
      endTime: 135,
      enabled: true,
      metadata: {
        category: "cta",
        version: "v1",
        creator: "host"
      }
      // hasLoaded: false
    },
    {
      id: "insert_3",
      type: "ad",
      title: "Sponsor Message",
      audioUrl: MOCK_INSERT_AUDIO_URL2i,
      duration: 20,
      startTime: 60,
      endTime: 75,
      enabled: true,
      metadata: {
        category: "monetization",
        sponsor: "TechCorp",
        campaign: "Q1_2024"
      }
      // hasLoaded: false
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
  ]
});

export const useEnhancedAudioPlayer = (initialData?: EpisodeData) => {
  const [episodeData, setEpisodeData] = useState<EpisodeData>(
    initialData || createMockEpisodeData()
  );

  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    currentTime: 0,
    isPlaying: false,
    volume: 0.8,
    playbackRate: 1.0,
    activeInserts:
      initialData?.inserts.filter((i) => i.enabled).map((i) => i.id) || []
  });

  // Keep track of loaded audio buffers
  const [loadedEpisodeData, setLoadedEpisodeData] =
    useState<EpisodeData | null>(null);
  const initialLoadDone = useRef(false);

  // Initialize audio engine
  const audioEngine = useAudioEngine({
    episodeData: loadedEpisodeData || episodeData,
    onTimeUpdate: (currentTime) => {
      setPlaybackState((prev) => ({
        ...prev,
        currentTime: Math.min(currentTime, episodeData.episode.duration)
      }));
    },
    onPlayStateChange: (isPlaying) => {
      setPlaybackState((prev) => ({ ...prev, isPlaying }));
    }
  });

  // Load audio on mount
  useEffect(() => {
    const loadAudio = async () => {
      if (initialLoadDone.current) return;

      const updatedData = await audioEngine.loadAllAudio();
      if (updatedData) {
        setLoadedEpisodeData(updatedData);
        initialLoadDone.current = true;
      }
    };

    loadAudio();
  }, []);

  // Update loaded episode data when episodeData changes
  useEffect(() => {
    if (loadedEpisodeData) {
      // Update inserts with current enabled/disabled state
      const updatedInserts = loadedEpisodeData.inserts.map((loadedInsert) => {
        const currentInsert = episodeData.inserts.find(
          (i) => i.id === loadedInsert.id
        );
        return currentInsert
          ? { ...loadedInsert, enabled: currentInsert.enabled }
          : loadedInsert;
      });

      setLoadedEpisodeData({
        ...loadedEpisodeData,
        inserts: updatedInserts
      });
    }
  }, [episodeData.inserts]);

  // Handlers
  const handlePlayPause = useCallback(async () => {
    if (audioEngine.isLoading || !audioEngine.hasLoaded) return;

    if (playbackState.isPlaying) {
      // Pause playback
      audioEngine.pause();
    } else {
      // Play or resume
      const activeInserts = episodeData.inserts
        .filter((insert) => insert.enabled)
        .map((insert) => insert.id);

      // Use current time for resume, 0 for first play
      const startTime =
        playbackState.currentTime > 0 ? playbackState.currentTime : 0;

      await audioEngine.play(startTime, activeInserts);
    }
  }, [
    audioEngine.isLoading,
    audioEngine.hasLoaded,
    audioEngine.pause,
    audioEngine.play,
    playbackState.isPlaying,
    playbackState.currentTime,
    episodeData.inserts
  ]);

  const handleSeek = useCallback(
    (time: number) => {
      if (audioEngine.isLoading || !audioEngine.hasLoaded) return;

      const clampedTime = Math.max(
        0,
        Math.min(time, episodeData.episode.duration)
      );

      audioEngine.seek(clampedTime);
    },
    [
      audioEngine.isLoading,
      audioEngine.hasLoaded,
      audioEngine.seek,
      episodeData.episode.duration
    ]
  );

  const handleToggleInsert = useCallback(
    (insertId: string) => {
      // Update local state
      setEpisodeData((prev) => ({
        ...prev,
        inserts: prev.inserts.map((insert) =>
          insert.id === insertId
            ? { ...insert, enabled: !insert.enabled }
            : insert
        )
      }));

      // Update active inserts
      setPlaybackState((prev) => {
        const isCurrentlyActive = prev.activeInserts.includes(insertId);
        const newActiveInserts = isCurrentlyActive
          ? prev.activeInserts.filter((id) => id !== insertId)
          : [...prev.activeInserts, insertId];

        return {
          ...prev,
          activeInserts: newActiveInserts
        };
      });

      // Update audio engine's insert tracking
      audioEngine.toggleInsert(insertId);
    },
    [audioEngine]
  );

  const handleSkipBackward = useCallback(() => {
    const newTime = Math.max(0, playbackState.currentTime - 10);
    handleSeek(newTime);
  }, [playbackState.currentTime, handleSeek]);

  const handleSkipForward = useCallback(() => {
    const newTime = Math.min(
      episodeData.episode.duration,
      playbackState.currentTime + 30
    );
    handleSeek(newTime);
  }, [playbackState.currentTime, episodeData.episode.duration, handleSeek]);

  const handleVolumeChange = useCallback(
    (value: number) => {
      setPlaybackState((prev) => ({
        ...prev,
        volume: value
      }));

      // If we have audio context and gain nodes, update volume
      if (audioEngine.audioContext && audioEngine.nodes?.mainGain) {
        audioEngine.mainGain.gain.value = value;
      }
    },
    [audioEngine.audioContext, audioEngine.nodes]
  );

  const handlePlaybackRateChange = useCallback(
    (rate: number) => {
      setPlaybackState((prev) => ({
        ...prev,
        playbackRate: rate
      }));

      // Update playback rate if we have a main source
      if (audioEngine.nodes?.mainSource) {
        audioEngine.nodes.mainSource.playbackRate.value = rate;
      }
    },
    [audioEngine.nodes]
  );

  const handleToggleInserts = useCallback(() => {
    const allEnabled = episodeData.inserts.every((insert) => insert.enabled);
    const newEnabledState = !allEnabled;

    // Update all inserts
    const updatedInserts = episodeData.inserts.map((insert) => ({
      ...insert,
      enabled: newEnabledState
    }));

    setEpisodeData((prev) => ({
      ...prev,
      inserts: updatedInserts
    }));

    // Update active inserts
    const newActiveInserts = newEnabledState
      ? updatedInserts.map((insert) => insert.id)
      : [];

    setPlaybackState((prev) => ({
      ...prev,
      activeInserts: newActiveInserts
    }));

    // If currently playing, we need to restart with new insert configuration
    if (playbackState.isPlaying) {
      // Clear all insert tracking and restart
      updatedInserts.forEach((insert) => {
        if (newEnabledState) {
          audioEngine.toggleInsert(insert.id); // Add if enabling all
        } else {
          audioEngine.toggleInsert(insert.id); // Remove if disabling all
        }
      });

      // Seek to current time to restart with new insert configuration
      audioEngine.seek(playbackState.currentTime);
    }
  }, [
    episodeData.inserts,
    playbackState.isPlaying,
    playbackState.currentTime,
    audioEngine
  ]);

  const handleAddInsert = useCallback(
    (newInsert: Insert) => {
      setEpisodeData((prev) => ({
        ...prev,
        inserts: [...prev.inserts, newInsert]
      }));

      setPlaybackState((prev) => ({
        ...prev,
        activeInserts: [...prev.activeInserts, newInsert.id]
      }));

      // Load the audio buffer for the new insert
      const loadNewInsert = async () => {
        try {
          const response = await fetch(newInsert.audioUrl);
          const arrayBuffer = await response.arrayBuffer();
          const audioContext = audioEngine.audioContext;
          if (audioContext) {
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            // Update loaded episode data
            if (loadedEpisodeData) {
              setLoadedEpisodeData({
                ...loadedEpisodeData,
                inserts: [
                  ...loadedEpisodeData.inserts,
                  { ...newInsert, audioBuffer } //, hasLoaded}
                ]
              });
            }
          }
        } catch (error) {
          console.error("Failed to load new insert audio:", error);
        }
      };

      loadNewInsert();
    },
    [audioEngine.audioContext, loadedEpisodeData]
  );

  const handleAddInsertAtTime = useCallback(
    (time: number) => {
      const newInsert: Insert = {
        id: `insert_${Date.now()}`,
        type: "primer_intro",
        title: "New Insert",
        audioUrl: MOCK_INSERT_AUDIO_URL,
        duration: 60,
        startTime: time,
        endTime: time + 60,
        enabled: true,
        // hasLoaded: false,
        metadata: {
          category: "custom",
          created: new Date().toISOString()
        }
      };

      handleAddInsert(newInsert);
    },
    [handleAddInsert]
  );

  const handleStop = useCallback(() => {
    audioEngine.stop();
    setPlaybackState((prev) => ({ ...prev, currentTime: 0, isPlaying: false }));
  }, [audioEngine]);

  // Sync playback state with audio engine
  useEffect(() => {
    setPlaybackState((prev) => ({
      ...prev,
      isPlaying: audioEngine.isPlaying || false,
      currentTime: audioEngine.currentTime || 0
    }));
  }, [audioEngine.isPlaying, audioEngine.currentTime]);

  return {
    // State
    episodeData,
    playbackState,
    isLoading: audioEngine.isLoading,
    loadProgress: audioEngine.loadProgress,
    hasLoaded: audioEngine.hasLoaded,
    isPlaying: audioEngine.isPlaying,
    currentTime: audioEngine.currentTime,

    // Setters
    setEpisodeData,
    setPlaybackState,

    // Handlers
    handlePlayPause,
    handleSeek,
    handleToggleInsert,
    handleSkipBackward,
    handleSkipForward,
    handleVolumeChange,
    handlePlaybackRateChange,
    handleToggleInserts,
    handleAddInsert,
    handleAddInsertAtTime,
    handleStop,

    // Audio engine access
    audioEngine,

    // Active inserts from audio engine
    activeInserts: audioEngine.activeInserts || []
  };
};
