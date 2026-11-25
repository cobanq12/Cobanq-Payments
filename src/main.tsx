import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './index.css';
import { AdaptersProvider, type PlatformAdapters } from '@core/adapters';
import { configureApi } from '@core/api/client';
import { SessionProvider } from '@core/hooks/useSession';
import { App } from '@web/App';
import { browserFilePicker, browserFileSaver, browserShare } from '@web/adapters/files';
import { jsPdfAdapter } from '@web/adapters/pdf';
import { localStorageAdapter } from '@web/adapters/storage';
import { ToastProvider } from '@web/components/Toast';
import { ThemeProvider } from '@web/theme';

// Platform wiring: the web app supplies browser adapters; the mobile app will supply native ones.
const adapters: PlatformAdapters = {
  storage: localStorageAdapter,
  filePicker: browserFilePicker,
  fileSaver: browserFileSaver,
  pdf: jsPdfAdapter,
  share: browserShare,
};

configureApi({ storage: adapters.storage });

// The hosted preview cannot change the address bar, so it routes in memory.
const Router = import.meta.env.VITE_EMBED ? MemoryRouter : BrowserRouter;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 1000 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AdaptersProvider value={adapters}>
        <ThemeProvider>
          <ToastProvider>
            <SessionProvider>
              <Router>
                <App />
              </Router>
            </SessionProvider>
          </ToastProvider>
        </ThemeProvider>
      </AdaptersProvider>
    </QueryClientProvider>
  </StrictMode>,
);
