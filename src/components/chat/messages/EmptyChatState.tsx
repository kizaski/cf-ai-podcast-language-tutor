import { Card } from "@/components/card/Card";
import { useChatAgent } from "@/hooks/useChatAgent";
import { useSession } from "@/providers/SessionProvider";
import { Robot } from "@phosphor-icons/react";
import { useParams } from "react-router-dom";

export function EmptyChatState() {
  const { sessionId } = useSession();
  const { episodeId } = useParams<{ episodeId: string }>();
  const { setAgentInput } = useChatAgent({ sessionId, episodeId });

  return (
    <div className="h-full w-full flex items-center justify-center">
      <Card className="p-6 max-w-md mx-auto bg-neutral-100 dark:bg-neutral-900">
        <div className="text-center space-y-4">
          <div className="bg-[#F48120]/10 text-[#F48120] rounded-full p-3 inline-flex">
            <Robot size={24} />
          </div>

          <h3 className="font-semibold text-lg">Try starting a conversation</h3>

          <div className="">
            <p className="text-muted-foreground text-sm mb-2">
              You can ask anything related to the transcript
            </p>
            <p className="text-muted-foreground text-sm mb-2">
              Or use the 📎 button below to upload a new episode
            </p>
            {/* TODO -- proactive agent responses */}
            {/* <p className="text-muted-foreground text-sm mb-2">
              Do you want me to start the conversation instead and send you
              messages periodically during playback?
              <button
                type="button"
                onClick={() => null}
                className="text-sm px-2 py-1 mx-2 outline outline-amber-600 cursor-pointer rounded-lg"
              >
                Yes
              </button>
            </p> */}
          </div>

          {/* TODO --  */}
          {/* <button
            type="button"
            onClick={() => setAgentInput("Sample 2")}
            className="text-sm p-1 outline outline-amber-600 cursor-pointer rounded-lg"
          >
            Sample 2
          </button> */}
        </div>
      </Card>
    </div>
  );
}
