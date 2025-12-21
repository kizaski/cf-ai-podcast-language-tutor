import { Card } from "@/components/card/Card";
import { Avatar } from "@/components/avatar/Avatar";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { isToolUIPart } from "ai";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";

interface MessageItemProps {
  message: any;
  previous?: any;
  showDebug?: boolean;
  formatTime: (date: Date) => string;
  toolsRequiringConfirmation?: string[];
  addToolResult?: (params: {
    tool: string;
    toolCallId: string;
    output: any;
  }) => void;
}

export function MessageItem({
  message,
  previous,
  showDebug,
  formatTime,
  toolsRequiringConfirmation = [],
  addToolResult
}: MessageItemProps) {
  const isUser = message.role === "user";
  const showAvatar = !previous || previous.role !== message.role;

  return (
    <div id={message.id}>
      {showDebug && (
        <pre className="text-xs text-muted-foreground overflow-scroll">
          {JSON.stringify(message, null, 2)}
        </pre>
      )}

      <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`flex gap-2 max-w-[85%] ${
            isUser ? "flex-row-reverse" : "flex-row"
          }`}
        >
          {showAvatar && !isUser ? (
            <Avatar username="AI" className="shrink-0" />
          ) : (
            !isUser && <div className="w-8" />
          )}

          <div>
            <div>
              {message.parts?.map((part: any, i: number) => {
                if (part.type === "text") {
                  const isScheduled = part.text.startsWith("scheduled message");

                  return (
                    <div key={`${message.id}-${i}`}>
                      <Card
                        className={`p-3 rounded-md bg-neutral-100 dark:bg-neutral-900 ${
                          isUser
                            ? "rounded-br-none"
                            : "rounded-bl-none border-assistant-border"
                        } ${isScheduled ? "border-accent/50" : ""} relative`}
                      >
                        {isScheduled && (
                          <span className="absolute -top-3 -left-2 text-base">
                            🕒
                          </span>
                        )}
                        <MemoizedMarkdown
                          id={`${message.id}-${i}`}
                          content={part.text.replace(
                            /^scheduled message: /,
                            ""
                          )}
                        />
                      </Card>
                      <p
                        className={`text-xs text-muted-foreground mt-1 ${
                          isUser ? "text-right" : "text-left"
                        }`}
                      >
                        {formatTime(
                          message.metadata?.createdAt
                            ? new Date(message.metadata.createdAt)
                            : new Date()
                        )}
                      </p>
                    </div>
                  );
                }

                if (isToolUIPart(part) && message.role === "assistant") {
                  const toolCallId = part.toolCallId;
                  const toolName = part.type.replace("tool-", "");
                  const needsConfirmation =
                    toolsRequiringConfirmation.includes(toolName);

                  if (addToolResult) {
                    return (
                      <ToolInvocationCard
                        key={`${toolCallId}-${i}`}
                        toolUIPart={part}
                        toolCallId={toolCallId}
                        needsConfirmation={needsConfirmation}
                        onSubmit={({ toolCallId, result }) => {
                          addToolResult({
                            tool: part.type.replace("tool-", ""),
                            toolCallId,
                            output: result
                          });
                        }}
                        addToolResult={(toolCallId, result) => {
                          addToolResult({
                            tool: part.type.replace("tool-", ""),
                            toolCallId,
                            output: result
                          });
                        }}
                      />
                    );
                  }
                }

                return null;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
