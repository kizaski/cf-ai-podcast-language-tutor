import { Card } from "@/components/card/Card";
import { Robot } from "@phosphor-icons/react";
import { useRef } from "react";
import { useEpisode } from "@/hooks/useEpisode";
import { useNavigate } from "react-router-dom";

export function EmptyState({ audioFile }: any) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { file, duration, onFileChange, error } = audioFile.props;
  const {
    uploadAndCreateEpisode,
    error: uploadError,
    isLoading,
    progress
  } = useEpisode();
  const navigate = useNavigate();

  return (
    <div className="h-full w-full flex items-center justify-center">
      <Card
        className={`p-6 ${
          import.meta.env.VITE_SAMPLE_EP_1_ID ? "w-lg" : "w-md"
        } bg-neutral-100 dark:bg-neutral-900`}
      >
        <div className="text-center space-y-4">
          <div className="bg-[#F48120]/10 text-[#F48120] rounded-full p-3 inline-flex">
            <Robot size={24} />
          </div>

          <h3 className="font-semibold text-lg">Welcome to Podcast Tutor</h3>

          <h2 className="flex flex-col mb-2 justify-center">
            <div className="mb-2">Learn any language through podcasts</div>
            <div className="text-muted-foreground text-sm mb-2 w-9/12 mx-auto">
              Listen, get real-time explanations and build your vocabulary. All
              while enjoying the original podcast.
            </div>
          </h2>

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

          <div className="pt-4 border-t border-amber-700 text-center">
            Importnant! Enable autoplay.
          </div>

          <div
            className={`flex ${
              import.meta.env.VITE_SAMPLE_EP_1_ID ? "flex-row" : "flex-col"
            } pt-4 border-t border-amber-700 text-left`}
          >
            <div
              className={`flex flex-col px-4 ${
                import.meta.env.VITE_SAMPLE_EP_1_ID
                  ? "border-r border-amber-700"
                  : ""
              }`}
            >
              <p className="text-muted-foreground text-sm mb-2">
                Recommended (download and upload):
              </p>
              <ul className="text-sm space-y-2">
                <li className="flex items-center gap-2">
                  <span className="text-[#F48120]">•</span>
                  <a
                    className="underline text-blue-400"
                    href="https://podcastindex.org/podcast/143170"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Deutsch lernen durch Hören
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#F48120]">•</span>
                  <a
                    className="underline text-blue-400"
                    href="https://podcastindex.org/podcast/6409524"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    The Dutch Historian Geschiedenis
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#F48120]">•</span>
                  <a
                    className="underline text-blue-400"
                    href="https://podcastindex.org/podcast/743692"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    La Story by: Les Echos
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-[#F48120]">•</span>
                  <a
                    className="underline text-blue-400"
                    href="https://podcastindex.org/podcast/3563812"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ゆる言語学ラジオ
                  </a>
                </li>
              </ul>
            </div>

            {import.meta.env.VITE_SAMPLE_EP_1_ID && (
              <div className="px-4 text-left">
                <p className="text-muted-foreground text-sm mb-2">
                  Or try a sample:
                </p>
                <ul className="text-sm space-y-2">
                  {import.meta.env.VITE_SAMPLE_EP_1_ID && (
                    <li className="flex items-center gap-2">
                      <span className="text-[#F48120]">•</span>
                      <span>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/episodes/${import.meta.env.VITE_SAMPLE_EP_1_ID}`
                            )
                          }
                          className="text-sm p-1 outline outline-amber-600 cursor-pointer rounded-lg"
                        >
                          {import.meta.env.VITE_SAMPLE_EP_1_TITLE}
                        </button>
                      </span>
                    </li>
                  )}
                  {import.meta.env.VITE_SAMPLE_EP_2_ID && (
                    <li className="flex items-center gap-2">
                      <span className="text-[#F48120]">•</span>
                      <span>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/episodes/${import.meta.env.VITE_SAMPLE_EP_2_ID}`
                            )
                          }
                          className="text-sm p-1 outline outline-amber-600 cursor-pointer rounded-lg"
                        >
                          {import.meta.env.VITE_SAMPLE_EP_2_TITLE}
                        </button>
                      </span>
                    </li>
                  )}
                  {import.meta.env.VITE_SAMPLE_EP_2_ID && (
                    <li className="flex items-center gap-2">
                      <span className="text-[#F48120]">•</span>
                      <span>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/episodes/${import.meta.env.VITE_SAMPLE_EP_3_ID}`
                            )
                          }
                          className="text-sm p-1 outline outline-amber-600 cursor-pointer rounded-lg"
                        >
                          {import.meta.env.VITE_SAMPLE_EP_3_TITLE}
                        </button>
                      </span>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
