// via https://github.com/vercel/ai/blob/main/examples/next-openai/app/api/use-chat-human-in-the-loop/utils.ts

import type {
  UIMessage,
  UIMessageStreamWriter,
  ToolSet,
  ToolCallOptions
} from "ai";
import { convertToModelMessages, isToolUIPart } from "ai";
import { APPROVAL } from "./shared";
import { parseBuffer } from "music-metadata";
import type { Phrase, Word } from "./types/audio-types";

export interface TranscriptMetadata {
  status: "pending" | "in_progress" | "complete" | "error";
  message?: string;
}

export function setupDatabase(sql: SqlStorage) {
  // Create tables if they don't exist
  sql.exec(`
    CREATE TABLE IF NOT EXISTS transcripts (
      audioKey TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      message TEXT
    );
    CREATE TABLE IF NOT EXISTS segments (
      id TEXT PRIMARY KEY,
      audioKey TEXT NOT NULL,
      text TEXT NOT NULL,
      startTime REAL NOT NULL,
      endTime REAL NOT NULL,
      speaker TEXT,
      FOREIGN KEY(audioKey) REFERENCES transcripts(audioKey)
    );
  `);
}

// For inserts generation, not yet used
const WORDS_PER_MINUTE = 155;
const MIN_MINUTES = 9;
export const MIN_WORDS = WORDS_PER_MINUTE * MIN_MINUTES;

export async function getAudioDuration(
  arrayBuffer: ArrayBuffer
): Promise<number> {
  const metadata = await parseBuffer(Buffer.from(arrayBuffer), "audio/mpeg");
  return metadata.format.duration || 0;
}

export const sendEvent = async (
  data: unknown,
  writer: WritableStreamDefaultWriter,
  encoder?: TextEncoder
) => {
  if (!encoder) encoder = new TextEncoder();
  await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
};

export function extractPhrases(words: Word[]) {
  const phrases: Phrase[] = [];
  let current: Word[] = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    current.push(w);

    const next = words[i + 1];
    const duration = current[current.length - 1].end - current[0].start;
    const wordCount = current.length;

    let shouldSplit = false;

    // 1. Hard boundary: pause
    if (next && next.start - w.end >= 0.6) {
      shouldSplit = true;
    }

    // 2. Hard boundary: terminal punctuation
    if (/[.!?]$/.test(w.word)) {
      shouldSplit = true;
    }

    // 3. Soft boundary: clause punctuation
    if (/,|;|:$/.test(w.word) && duration >= 2.5 && wordCount >= 5) {
      shouldSplit = true;
    }

    // 4. Safety caps
    if (duration >= 7 || wordCount >= 25) {
      shouldSplit = true;
    }

    if (shouldSplit) {
      phrases.push(makePhrase(current));
      current = [];
    }
  }

  if (current.length) {
    phrases.push(makePhrase(current));
  }

  return phrases;
}

function makePhrase(words: Word[]): Phrase {
  if (words.length === 0) {
    throw new Error("makePhrase called with empty word list");
  }

  const start = words[0].start;
  const end = words[words.length - 1].end;

  // Normalize text:
  // - single spaces
  // - no space before punctuation
  // - preserve ASR punctuation if present
  const text = words
    .map((w) => w.word)
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();

  const id =
    "p_" +
    Math.floor(start * 100).toString() +
    "_" +
    Math.floor(end * 100).toString();

  return {
    id,
    text,
    start,
    end,
    wordCount: words.length,
    words
  };
}

function isValidToolName<K extends PropertyKey, T extends object>(
  key: K,
  obj: T
): key is K & keyof T {
  return key in obj;
}

/**
 * Processes tool invocations where human input is required, executing tools when authorized.
 */
export async function processToolCalls<Tools extends ToolSet>({
  dataStream,
  messages,
  executions
}: {
  tools: Tools; // used for type inference
  dataStream: UIMessageStreamWriter;
  messages: UIMessage[];
  executions: Record<
    string,
    // biome-ignore lint/suspicious/noExplicitAny: needs a better type
    (args: any, context: ToolCallOptions) => Promise<unknown>
  >;
}): Promise<UIMessage[]> {
  // Process all messages, not just the last one
  const processedMessages = await Promise.all(
    messages.map(async (message) => {
      const parts = message.parts;
      if (!parts) return message;

      const processedParts = await Promise.all(
        parts.map(async (part) => {
          // Only process tool UI parts
          if (!isToolUIPart(part)) return part;

          const toolName = part.type.replace(
            "tool-",
            ""
          ) as keyof typeof executions;

          // Only process tools that require confirmation (are in executions object) and are in 'input-available' state
          if (!(toolName in executions) || part.state !== "output-available")
            return part;

          let result: unknown;

          if (part.output === APPROVAL.YES) {
            // User approved the tool execution
            if (!isValidToolName(toolName, executions)) {
              return part;
            }

            const toolInstance = executions[toolName];
            if (toolInstance) {
              result = await toolInstance(part.input, {
                messages: convertToModelMessages(messages),
                toolCallId: part.toolCallId
              });
            } else {
              result = "Error: No execute function found on tool";
            }
          } else if (part.output === APPROVAL.NO) {
            result = "Error: User denied access to tool execution";
          } else {
            // If no approval input yet, leave the part as-is for user interaction
            return part;
          }

          // Forward updated tool result to the client.
          dataStream.write({
            type: "tool-output-available",
            toolCallId: part.toolCallId,
            output: result
          });

          // Return updated tool part with the actual result.
          return {
            ...part,
            output: result
          };
        })
      );

      return { ...message, parts: processedParts };
    })
  );

  return processedMessages;
}

/**
 * Clean up incomplete tool calls from messages before sending to API
 * Prevents API errors from interrupted or failed tool executions
 */
export function cleanupMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    if (!message.parts) return true;

    // Filter out messages with incomplete tool calls
    const hasIncompleteToolCall = message.parts.some((part) => {
      if (!isToolUIPart(part)) return false;
      // Remove tool calls that are still streaming or awaiting input without results
      return (
        part.state === "input-streaming" ||
        (part.state === "input-available" && !part.output && !part.errorText)
      );
    });

    return !hasIncompleteToolCall;
  });
}

export function base64ToUint8Array(base64Audio: string) {
  if (!base64Audio) {
    console.error("base64ToUint8Array received empty/undefined input");
    return new Uint8Array(0);
  }

  // Strip prefix if present
  const base64 = base64Audio.includes(",")
    ? base64Audio.split(",")[1]
    : base64Audio;

  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function base64ToArrayBuffer(base64Audio: string): ArrayBuffer {
  const buffer = Buffer.from(base64Audio, "base64");
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
}

export function getSessionId(request: Request): string | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  // Split by semicolon to get individual pairs
  const pairs = cookieHeader.split(";");

  for (let pair of pairs) {
    // Use a limit of 2 on split to handle '=' inside the value
    const [name, ...valueParts] = pair.trim().split("=");

    if (name === "session_id") {
      const value = valueParts.join("="); // Rejoin in case the value had an '='
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}
