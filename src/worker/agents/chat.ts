import { tools, executions } from "@/tools";
import { cleanupMessages, processToolCalls } from "@/utils";
import type { Schedule } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  type StreamTextOnFinishCallback,
  type ToolSet,
  createUIMessageStream,
  streamText,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStreamResponse,
  generateId
} from "ai";
import { env } from "cloudflare:workers";
import { createWorkersAI } from "workers-ai-provider";

const workersai = createWorkersAI({ binding: env.AI });
const model = workersai("@cf/meta/llama-3.1-8b-instruct-fp8");
/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools
      // ...this.mcp.getAITools()
    };
    const transcriberStub = env.Transcriber.getByName(this.name);

    const lastMessageWithTime = [...this.messages]
      .reverse()
      .find((item) => item.metadata != null);

    // TODO -- move as {...} to schema
    const currentTime = lastMessageWithTime
      ? (
          lastMessageWithTime.metadata as {
            currentTime: number;
            isPlaying: boolean;
          }
        ).currentTime
      : null;

    const isPlayingPodcast = lastMessageWithTime
      ? (
          lastMessageWithTime.metadata as {
            currentTime: number;
            isPlaying: boolean;
          }
        ).isPlaying
      : false;

    const fullTranscript =
      await transcriberStub.getTranscriptWindow(currentTime);

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        // const modelMessages = convertToModelMessages(processedMessages);

        // const messagesWithTranscript = fullTranscript
        //   ? [
        //       {
        //         role: "system" as const,
        //         content: ""
        //       },
        //       ...modelMessages
        //     ]
        //   : modelMessages;

        // messagesWithTranscript.forEach((e) => console.log(e));

        console.log("is playing pod: ", isPlayingPodcast ? "true" : "false");
        console.log(
          isPlayingPodcast
            ? "Respond normally"
            : "At the end of your message, clearly urge the user to play the podcast before continuing"
        );

        const result = streamText({
          system: `Autonomous Language Tutor
You are an autonomous language tutor helping a learner with a foreign-language podcast.

Inputs you receive:
CURRENT_AUDIO_CONTEXT: Verbatim transcript snippets from the podcast.

Instructions:

Content:
Only explain, clarify, or comment on what appears in CURRENT_AUDIO_CONTEXT.
Do not invent content or speculate beyond the transcript.

Behavior based on podcast status:
${
  isPlayingPodcast
    ? "Respond normally"
    : "At the end of your message, urge the user to play the podcast before continuing gently."
}

Interaction style:
Be encouraging and supportive.
Correct language issues gently, using examples from the transcript.
Keep explanations concise but clear and don't forget to urge the user if podcast status requires it.

CURRENT_AUDIO_CONTEXT:
${fullTranscript || "No transcript available"}
`,
          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          // Type boundary: streamText expects specific tool types, but base class uses ToolSet
          // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    this.messages.forEach((e) => console.log(e));

    return createUIMessageStreamResponse({ stream });
  }

  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }
}
