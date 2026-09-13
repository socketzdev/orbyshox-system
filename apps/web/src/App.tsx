import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './providers/auth-provider';
import { ThemeProvider } from './providers/theme-provider';
import { SidebarProvider } from './providers/sidebar-provider';
import { SearchProvider } from './providers/search-provider';
import { TooltipProvider } from './components/ui/tooltip';
import { AppRoutes } from './routes';
import { RequireAuth } from './components/require-auth';
import { ErrorBoundary } from './components/error-boundary';
import { Toaster } from 'sonner';

// High-performance QueryClient configuration:
// - 5 minute staleTime: instant page-to-page navigation from cache without flashing skeletons
// - 30 minute gcTime: keep visited pages ready in memory
// - refetchOnWindowFocus disabled: prevent UI stutter when switching apps
// - refetchOnMount false: immediate zero-latency render of cached data
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="saas-light-theme-v2">
        <TooltipProvider delayDuration={100}>
          <BrowserRouter>
            <SearchProvider>
              <AuthProvider>
                <SidebarProvider>
                  <ErrorBoundary>
                    <RequireAuth>
                      <AppRoutes />
                    </RequireAuth>
                  </ErrorBoundary>
                  <Toaster position="top-right" richColors closeButton />
                </SidebarProvider>
              </AuthProvider>
            </SearchProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
