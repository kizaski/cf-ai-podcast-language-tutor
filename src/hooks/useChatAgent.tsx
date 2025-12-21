import { useAgent } from "agents/react";
import { useAgentChat } from "agents/ai-react";
import { isToolUIPart } from "ai";
import type { UIMessage } from "@ai-sdk/react";
import type { tools } from "../tools";
import { useState } from "react";

// List of tools that require human confirmation
// NOTE: this should match the tools that don't have execute functions in tools.ts
const toolsRequiringConfirmation: (keyof typeof tools)[] = [
  "getWeatherInformation"
];

export function useChatAgent() {
  const [agentInput, setAgentInput] = useState("");
  const agent = useAgent({ agent: "chat" });

  const chat = useAgentChat<unknown, UIMessage<{ createdAt: string }>>({
    agent
  });

  const pendingToolConfirmation = chat.messages.some((m) =>
    m.parts?.some(
      (p) =>
        isToolUIPart(p) &&
        p.state === "input-available" &&
        toolsRequiringConfirmation.includes(
          p.type.replace("tool-", "") as keyof typeof tools
        )
    )
  );

  const handleAgentInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setAgentInput(e.target.value);
  };

  const handleAgentSubmit = async (
    e: React.FormEvent,
    extraData: Record<string, unknown> = {}
  ) => {
    e.preventDefault();
    if (!agentInput.trim()) return;

    const message = agentInput;
    setAgentInput("");

    // Send message to agent
    await chat.sendMessage(
      {
        role: "user",
        parts: [{ type: "text", text: message }]
      },
      {
        body: extraData
      }
    );
  };

  return {
    ...chat,
    pendingToolConfirmation,
    toolsRequiringConfirmation,
    agentInput,
    handleAgentInputChange,
    handleAgentSubmit
  };
}
