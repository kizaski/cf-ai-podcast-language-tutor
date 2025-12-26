import type { Insert } from "@/types/audio-types";
import { formatTime, getInsertColor } from "@/lib/utils";

interface InsertsListProps {
  inserts: Insert[];
  onToggleInsert: (id: string) => void;
  onSeek: (time: number) => void;
}

export const InsertsList = ({
  inserts,
  onToggleInsert,
  onSeek
}: InsertsListProps) => {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Inserts ({inserts.length})</h3>
        <button className="text-sm px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition">
          ̶+̶ ̶A̶d̶d̶ ̶I̶n̶s̶e̶r̶t̶
        </button>
      </div>

      <div className="space-y-3">
        {inserts.map((insert) => (
          <div
            key={insert.id}
            className={`p-4 rounded-lg border transition cursor-pointer ${
              insert.enabled
                ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                : "bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700"
            }`}
            onClick={() => onToggleInsert(insert.id)}
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
                      onToggleInsert(insert.id);
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
                    onSeek(insert.startTime);
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
  );
};
