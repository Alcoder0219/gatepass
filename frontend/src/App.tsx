import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { SocketProvider } from '@/contexts/SocketContext';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { AppRoutes } from '@/routes';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      // A 401/403 is not transient — retrying it just burns a round-trip.
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403 || status === 404) return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: false },
  },
});

export const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <SocketProvider>
              <AppRoutes />

              <Toaster
                position="top-right"
                gutter={12}
                toastOptions={{
                  duration: 4000,
                  // Inherit the theme tokens instead of react-hot-toast's own colours.
                  className:
                    '!bg-[rgb(var(--surface-raised))] !text-[rgb(var(--content))] !border !border-[rgb(var(--line))] !rounded-2xl !shadow-glass',
                  success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
                  error: { iconTheme: { primary: '#ef4444', secondary: '#fff' }, duration: 6000 },
                }}
              />
            </SocketProvider>
          </AuthProvider>
        </BrowserRouter>

        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
