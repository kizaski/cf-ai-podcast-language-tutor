import { Textarea } from "@/components/textarea/Textarea";
import { PaperPlaneTilt, Stop } from "@phosphor-icons/react";
import { useRef } from "react";
import { useEpisode } from "@/hooks/useEpisode";

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled,
  status,
  textareaHeight,
  audioFile
}: any) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { file, duration, onFileChange } = audioFile.props;
  const { uploadAndCreateEpisode } = useEpisode({});

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!e.nativeEvent.isComposing) {
        onSubmit(e);
      }
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="absolute bottom-0 left-0 right-0 p-3 bg-neutral-50 border-t border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900"
    >
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Textarea
            value={value}
            onChange={onChange}
            style={{ height: textareaHeight }}
            className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2  ring-offset-background placeholder:text-neutral-500 dark:placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-neutral-700 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm min-h-6 max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl text-base! pb-10 dark:bg-neutral-900"
            disabled={disabled}
            onKeyDown={handleKeyDown}
          />

          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={async (e) => {
              await onFileChange(e);

              if (file && duration) {
                uploadAndCreateEpisode(file, duration);
              }
            }}
          />

          <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-col gap-2 justify-end">
            {/* Upload Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex cursor-pointer items-center justify-center gap-2 text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded-full p-1.5 h-fit border border-neutral-200 dark:border-neutral-800"
              aria-label="Upload files"
            >
              📎
            </button>

            {/* Send / Stop Buttons */}
            {status === "submitted" || status === "streaming" ? (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-1.5 h-fit border border-neutral-200 dark:border-neutral-800"
                aria-label="Stop generation"
              >
                <Stop size={16} />
              </button>
            ) : (
              <button
                type="submit"
                className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full p-1.5 h-fit border border-neutral-200 dark:border-neutral-800"
                disabled={disabled || !value?.trim()}
                aria-label="Send message"
              >
                <PaperPlaneTilt size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
