import "./styles.css";
import { createRoot } from "react-dom/client";
import App from "./app";
import { Providers } from "@/providers";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Layout wrapper
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-neutral-50 text-base text-neutral-900 antialiased transition-colors selection:bg-blue-700 selection:text-white dark:bg-neutral-950 dark:text-neutral-100">
    {children}
  </div>
);

const NotFound: React.FC = () => (
  <main className="w-max h-dvh">
    <h1>404 - Page Not Found</h1>
    <p>The page you are looking for does not exist.</p>
  </main>
);

const root = createRoot(document.getElementById("app")!);

root.render(
  <Providers>
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <AppLayout>
              <App />
            </AppLayout>
          }
        />
        <Route
          path="/episodes/:episodeId"
          element={
            <AppLayout>
              <App />
            </AppLayout>
          }
        />
        <Route
          path="*"
          element={
            <AppLayout>
              <NotFound />
            </AppLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  </Providers>
);
