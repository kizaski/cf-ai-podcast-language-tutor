import { create } from "zustand";

type ChatInputState = {
  agentInput: string;
  setAgentInput: (value: string) => void;
  clearAgentInput: () => void;
};

export const useChatInputStore = create<ChatInputState>((set) => ({
  agentInput: "",
  setAgentInput: (value) => set({ agentInput: value }),
  clearAgentInput: () => set({ agentInput: "" })
}));
