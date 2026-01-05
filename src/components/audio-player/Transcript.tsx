import type { TranscriptSegment, Insert } from "@/types/audio-types";
import { formatTime } from "@/lib/utils";

interface TranscriptProps {
  segments: TranscriptSegment[];
  inserts: Insert[];
  currentTime: number;
  onSeek: (time: number) => void;
}

export const Transcript = ({
  segments,
  inserts,
  currentTime,
  onSeek
}: TranscriptProps) => {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">Transcript</h3>
      <div className="space-y-3 h-52 overflow-scroll rounded-lg">
        {segments.map((segment, idx) => {
          const hasInsert = inserts.some(
            (insert) =>
              insert.startTime >= segment.startTime &&
              insert.startTime <= segment.endTime
          );

          return (
            <div
              key={`${segment.id}-${idx}`}
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
