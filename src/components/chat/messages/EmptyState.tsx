import { Card } from "@/components/card/Card";
import { Robot } from "@phosphor-icons/react";
import { useRef } from "react";
import { useEpisode } from "@/hooks/useEpisode";

export function EmptyState({ audioFile }: any) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { file, duration, onFileChange, error } = audioFile.props;
  const {
    uploadAndCreateEpisode,
    error: uploadError,
    isLoading,
    progress
  } = useEpisode();

  return (
    <div className="h-full w-full flex items-center justify-center">
      <Card className="p-6 max-w-md mx-auto bg-neutral-100 dark:bg-neutral-900">
        <div className="text-center space-y-4">
          <div className="bg-[#F48120]/10 text-[#F48120] rounded-full p-3 inline-flex">
            <Robot size={24} />
          </div>

          <h3 className="font-semibold text-lg">Welcome to Podcast Tutor</h3>

          {/* TODO -- instructions */}

          <div className="">
            <p className="text-muted-foreground text-sm mb-2">
              Upload a file (max 2h30m, 150mb)
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={onFileChange}
            hidden
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-sm p-2 outline outline-amber-600 cursor-pointer rounded-lg"
          >
            📎 Browse
          </button>

          {(error || uploadError) && (
            <p className="text-sm text-red-500">{error || uploadError}</p>
          )}

          {file && duration && (
            <p className="text-sm">
              {file.name} · {Math.round(duration)}s
            </p>
          )}

          <button
            className="w-full bg-[#F48120] text-white rounded-md py-2 disabled:opacity-50"
            disabled={!file || !duration || isLoading}
            onClick={() => uploadAndCreateEpisode(file!, duration!)}
          >
            {isLoading ? "Uploading…" : "Upload & Process"}
          </button>

          {isLoading && (
            <progress className="w-full" value={progress} max={100} />
          )}

          <div className="pt-4 border-t text-left">
            <p className="text-muted-foreground text-sm mb-2">
              Or try a sample:
            </p>
            <ul className="text-sm space-y-2">
              <li className="flex items-center gap-2">
                <span className="text-[#F48120]">•</span>
                <span>Sample 1</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[#F48120]">•</span>
                <span>Sample 2</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[#F48120]">•</span>
                <span>Sample 3</span>
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
