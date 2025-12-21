import { Textarea } from "@/components/textarea/Textarea";
import { PaperPlaneTilt, Stop } from "@phosphor-icons/react";

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  disabled,
  status,
  textareaHeight
}: any) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter without Shift (allows Shift+Enter for new line)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Prevent default new line behavior

      // Check if composing (IME input for Asian languages)
      if (!e.nativeEvent.isComposing) {
        onSubmit(e);
      }
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="p-3 bg-neutral-50 relative bottom-0 left-0 right-0 z-10 border-t border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900"
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

          <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
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
