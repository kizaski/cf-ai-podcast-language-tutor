import { useTheme } from "./hooks/useTheme";
import { ChatView } from "./ChatView";
import { useSession } from "./providers/SessionProvider";

export default function Chat() {
  const { sessionId, isLoadedSession } = useSession();
  const { theme, toggleTheme } = useTheme();

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

  return (
    <ChatView sessionId={sessionId!} theme={theme} toggleTheme={toggleTheme} />
  );
}
