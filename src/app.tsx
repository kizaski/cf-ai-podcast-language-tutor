import { useTheme } from "./hooks/useTheme";
import { ChatView } from "./components/ChatView";
import { useSession } from "./providers/SessionProvider";
import { EmptyState } from "./components/empty-state/EmptyState";
import { useAudioFile } from "./hooks/useAudioFile";
import { useParams } from "react-router-dom";

export default function Chat() {
  const { sessionId, isLoadedSession } = useSession();
  const { theme, toggleTheme } = useTheme();
  const audioFileState = useAudioFile();
  const audioFile = { props: audioFileState };
  const { episodeId } = useParams<{ episodeId: string }>();

  if (!isLoadedSession) {
    return (
      <div className="h-screen flex items-center justify-center">
        Loading session...
      </div>
    );
  }

  if (sessionId === "unauthorized" || !sessionId) {
    return (
      <div className="h-screen flex items-center justify-center">
        Unauthorized Access
      </div>
    );
  }

  if (!episodeId)
    return (
      <div className="h-screen w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
        <div
          className={`w-full max-w-7xl mx-auto flex gap-6 h-[calc(100vh-2rem)] justify-center`}
        >
          <EmptyState audioFile={audioFile} />
        </div>
      </div>
    );

  return (
    <ChatView sessionId={sessionId!} theme={theme} toggleTheme={toggleTheme} />
  );
}
