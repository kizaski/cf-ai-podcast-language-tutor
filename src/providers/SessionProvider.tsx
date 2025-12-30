// CookieContext.js
import { createContext, useContext, useState, useEffect } from "react";

type SessionContext = {
  sessionId: string;
  isLoadedSession: boolean;
};

const SessionContext = createContext<SessionContext | undefined>(undefined);

export const SessionProvider = ({ children }: any) => {
  const [sessionId, setSessionId] = useState("");
  const [isLoadedSession, setIsLoadedSession] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data: any) => {
        if (data.sessionId) {
          setSessionId(data.sessionId);
          setIsLoadedSession(true);
        }
      })
      .catch(() => {
        setSessionId("unauthorized");
        setIsLoadedSession(true);
      });
  }, []);

  return (
    <SessionContext.Provider value={{ sessionId, isLoadedSession }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
};
