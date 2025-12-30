import { ModalProvider } from "@/providers/ModalProvider";
import { TooltipProvider } from "@/providers/TooltipProvider";
import { SessionProvider } from "./SessionProvider";

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <SessionProvider>
      <TooltipProvider>
        <ModalProvider>{children}</ModalProvider>
      </TooltipProvider>
    </SessionProvider>
  );
};
