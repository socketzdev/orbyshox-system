import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { CommandPalette } from './command-palette';
import { OnboardingTour } from '../onboarding/onboarding-tour';

export function AppLayout() {
  return (
    <div className="min-h-screen w-full bg-[#f4f5f7] flex font-sans antialiased text-foreground selection:bg-zinc-200">
      {/* ─── Sidebar Idêntica à Referência ─── */}
      <Sidebar />

      {/* ─── Conteúdo Tela Cheia (Edge to Edge) ─── */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto px-6 sm:px-8 lg:px-10 py-6">
        <Header />
        <main className="flex-1 mt-2">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
      <OnboardingTour />
    </div>
  );
}
