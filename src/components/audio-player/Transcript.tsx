import { useRef, useEffect, useState, useCallback } from "react";
import type { TranscriptSegment, Insert } from "@/types/audio-types";
import { formatTime } from "@/lib/utils";

interface TranscriptProps {
  segments: TranscriptSegment[];
  inserts: Insert[];
  currentTime: number;
  onSeek: (time: number) => void;
  expanded: "both" | "transcript" | "inserts";
  onExpand: () => void;
  onReset: () => void;
}

export const Transcript = ({
  segments,
  inserts,
  currentTime,
  onSeek,
  expanded,
  onExpand,
  onReset
}: TranscriptProps) => {
  const segmentRefs = useRef<(HTMLDivElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [allowScrollIntoView, setAllowScrollIntoView] = useState(true);

  // Track the last segment ID we scrolled to, to prevent "jitter"
  // if currentTime updates 60 times a second
  const lastScrolledId = useRef<string | null>(null);

  const scrollToCurrentSegment = useCallback(
    (isManual = false) => {
      const currentIndex = segments.findIndex(
        (s) => currentTime >= s.startTime && currentTime <= s.endTime
      );

      const segment = segments[currentIndex];
      if (!segment || !segmentRefs.current[currentIndex]) return;

      // Don't scroll if we are already showing this segment (unless 'Now' was clicked)
      if (!isManual && segment.id === lastScrolledId.current) return;

      segmentRefs.current[currentIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      lastScrolledId.current = segment.id;
    },
    [currentTime, segments]
  );

  // Detect ONLY User Interaction (Wheel, Touch, Scrollbar Click)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const stopAutoScroll = () => {
      if (allowScrollIntoView) setAllowScrollIntoView(false);
    };

    // 'scroll' event fires for everything.
    // These events ONLY fire for user input.
    container.addEventListener("wheel", stopAutoScroll);
    container.addEventListener("touchmove", stopAutoScroll);
    container.addEventListener("mousedown", stopAutoScroll);

    return () => {
      container.removeEventListener("wheel", stopAutoScroll);
      container.removeEventListener("touchmove", stopAutoScroll);
      container.removeEventListener("mousedown", stopAutoScroll);
    };
  }, [allowScrollIntoView]);

  // Auto-scroll logic
  useEffect(() => {
    if (allowScrollIntoView) {
      scrollToCurrentSegment();
    }
  }, [currentTime, allowScrollIntoView, scrollToCurrentSegment]);

  // Handle Layout Shifts (The "Unsyncing" you mentioned)
  // When 'expanded' changes, wait for the CSS transition to finish before scrolling
  useEffect(() => {
    if (allowScrollIntoView) {
      const timer = setTimeout(() => scrollToCurrentSegment(true), 550); // duration-500 + buffer
      return () => clearTimeout(timer);
    }
  }, [expanded, allowScrollIntoView, scrollToCurrentSegment]);

  const handleNowClick = () => {
    setAllowScrollIntoView(true);
    // Small delay to ensure state has updated before triggering scroll
    setTimeout(() => scrollToCurrentSegment(true), 10);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold">Transcript</h3>
          {expanded === "both" && (
            <button
              onClick={onExpand}
              className="rounded-lg p-1.5 text-md bg-blue-600 dark:bg-blue-800 text-white"
            >
              Expand
            </button>
          )}
          {expanded === "transcript" && (
            <button
              onClick={onReset}
              className="rounded-lg p-1.5 text-md bg-blue-600 dark:bg-blue-800 text-white"
            >
              Retract
            </button>
          )}
        </div>

        <button
          onClick={handleNowClick}
          className="rounded-lg px-3 py-2 text-md bg-blue-600 text-white"
        >
          Now
        </button>
      </div>

      <div
        ref={containerRef}
        className={`space-y-3 transition-all duration-500 ease-in-out ${
          expanded === "both" ? "max-h-[28vh]" : "max-h-0"
        } ${expanded === "transcript" ? "max-h-[50vh]" : ""} overflow-y-auto rounded-lg`}
      >
        {(expanded === "both" || expanded === "transcript") &&
          segments.map((segment, idx) => {
            const hasInsert = inserts.some(
              (insert) =>
                insert.startTime >= segment.startTime &&
                insert.startTime <= segment.endTime
            );

            return (
              <div
                key={`${segment.id}-${idx}`}
                ref={(el) => {
                  segmentRefs.current[idx] = el;
                }}
                className={`p-4 rounded-lg border cursor-pointer transition hover:bg-neutral-100 dark:hover:bg-neutral-750 ${
                  currentTime >= segment.startTime &&
                  currentTime <= segment.endTime
                    ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                    : "bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700"
                }`}
                onClick={() => onSeek(segment.startTime)}
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
                </div>
                <p className="text-neutral-700 dark:text-neutral-300">
                  {segment.text}
                </p>
              </div>
            );
          })}
      </div>
    </div>
  );
};
