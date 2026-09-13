const fs = require('fs');
const path = require('path');

const dirs = [
  'apps/web/src/components/ui',
  'apps/web/src/components/layout',
  'apps/web/src/components/data-table',
  'apps/web/src/features/auth',
  'apps/web/src/features/dashboard/components',
  'apps/web/src/features/tenants',
  'apps/web/src/features/plans',
  'apps/web/src/features/billing',
  'apps/web/src/features/tickets',
  'apps/web/src/features/staff',
  'apps/web/src/features/settings',
  'apps/web/src/features/audit',
  'apps/web/src/lib',
  'apps/web/src/providers',
  'apps/web/src/hooks',
  'apps/web/src/routes'
];

dirs.forEach(dir => {
  fs.mkdirSync(path.join(__dirname, dir), { recursive: true });
});

// We'll write out a bunch of files
const files = {
  'apps/web/package.json': `{
  "name": "@projeto-saas/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "@tanstack/react-query": "^5.0.0",
    "@tanstack/react-table": "^8.10.0",
    "axios": "^1.6.0",
    "recharts": "^2.10.0",
    "lucide-react": "^0.292.0",
    "react-hook-form": "^7.48.0",
    "@hookform/resolvers": "^3.3.0",
    "zod": "^3.22.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.0.0",
    "class-variance-authority": "^0.7.0",
    "date-fns": "^2.30.0",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-tooltip": "^1.0.7",
    "@radix-ui/react-avatar": "^1.0.4",
    "@radix-ui/react-switch": "^1.0.3",
    "@radix-ui/react-label": "^2.0.2",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-separator": "^1.0.3",
    "@projeto-saas/shared-types": "workspace:*"
  },
  "devDependencies": {
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.31",
    "tailwindcss": "^3.3.5",
    "typescript": "^5.2.2",
    "vite": "^5.0.0",
    "@projeto-saas/tsconfig": "workspace:*"
  }
}`,
  'apps/web/vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});`,
  'apps/web/tsconfig.json': `{
  "extends": "@projeto-saas/tsconfig/react.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}`,
  'apps/web/tailwind.config.ts': `/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../../packages/ui/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#4f46e5', primary: '#4f46e5' },
        success: { DEFAULT: '#22c55e' },
        warning: { DEFAULT: '#f59e0b' },
        danger: { DEFAULT: '#ef4444' },
      }
    },
  },
  plugins: [],
}`,
  'apps/web/postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,
  'apps/web/index.html': `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SaaS Super Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
  'apps/web/src/main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
  'apps/web/src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
  }
  body {
    @apply bg-background text-foreground;
  }
}`,
  'apps/web/src/App.tsx': `import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './providers/auth-provider';
import { ThemeProvider } from './providers/theme-provider';
import { AppRoutes } from './routes';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="saas-ui-theme">
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}`,
  'apps/web/src/lib/utils.ts': `import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}`,
  'apps/web/src/lib/api.ts': `import axios from 'axios';
import { getToken, removeToken } from './auth';

export const api = axios.create({
  baseURL: '/api/v1',
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = \`Bearer \${token}\`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      removeToken();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);`,
  'apps/web/src/lib/auth.ts': `export const getToken = () => localStorage.getItem('saas_token');
export const setToken = (token: string) => localStorage.setItem('saas_token', token);
export const removeToken = () => localStorage.removeItem('saas_token');
export const isAuthenticated = () => !!getToken();`,
  'apps/web/src/providers/auth-provider.tsx': `import React, { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { isAuthenticated, removeToken } from '../lib/auth';

type User = { id: string; name: string; email: string; role: string };
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isAuthenticated()) {
      api.get('/auth/me')
        .then(res => setUser(res.data))
        .catch(() => removeToken())
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = (token: string, u: User) => {
    // setToken(token) called elsewhere or here
    setUser(u);
  };
  const logout = () => {
    removeToken();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthContext must be used within AuthProvider');
  return context;
};`,
  'apps/web/src/providers/theme-provider.tsx': `import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light' | 'system';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'vite-ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};`,
  'apps/web/src/hooks/use-auth.ts': `export { useAuthContext as useAuth } from '../providers/auth-provider';`,
  'apps/web/src/hooks/use-debounce.ts': `import { useEffect, useState } from 'react';
export function useDebounce<T>(value: T, delay?: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay || 500);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}`,
  'apps/web/src/routes/index.tsx': `import { Routes, Route } from 'react-router-dom';
import { AppLayout } from '../components/layout/app-layout';

// Features (Placeholders for now)
const LoginPage = () => <div>Login</div>;
const DashboardPage = () => <div>Dashboard</div>;
const TenantListPage = () => <div>Tenants</div>;
const TenantDetailPage = () => <div>Tenant Detail</div>;
const PlanListPage = () => <div>Plans</div>;
const PlanFormPage = () => <div>Plan Form</div>;
const CouponListPage = () => <div>Coupons</div>;
const CouponFormPage = () => <div>Coupon Form</div>;
const BillingOverviewPage = () => <div>Billing</div>;
const InvoiceListPage = () => <div>Invoices</div>;
const DelinquencyPage = () => <div>Delinquency</div>;
const TicketListPage = () => <div>Tickets</div>;
const TicketDetailPage = () => <div>Ticket Detail</div>;
const StaffListPage = () => <div>Staff</div>;
const StaffFormPage = () => <div>Staff Form</div>;
const SettingsPage = () => <div>Settings</div>;
const EmailTemplatesPage = () => <div>Email Templates</div>;
const IntegrationsPage = () => <div>Integrations</div>;
const AuditLogPage = () => <div>Audit Log</div>;

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<AppLayout />}>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="tenants" element={<TenantListPage />} />
        <Route path="tenants/:id" element={<TenantDetailPage />} />
        <Route path="plans" element={<PlanListPage />} />
        <Route path="plans/new" element={<PlanFormPage />} />
        <Route path="plans/:id/edit" element={<PlanFormPage />} />
        <Route path="coupons" element={<CouponListPage />} />
        <Route path="coupons/new" element={<CouponFormPage />} />
        <Route path="billing" element={<BillingOverviewPage />} />
        <Route path="billing/invoices" element={<InvoiceListPage />} />
        <Route path="billing/delinquency" element={<DelinquencyPage />} />
        <Route path="tickets" element={<TicketListPage />} />
        <Route path="tickets/:id" element={<TicketDetailPage />} />
        <Route path="staff" element={<StaffListPage />} />
        <Route path="staff/new" element={<StaffFormPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/email-templates" element={<EmailTemplatesPage />} />
        <Route path="settings/integrations" element={<IntegrationsPage />} />
        <Route path="audit" element={<AuditLogPage />} />
      </Route>
    </Routes>
  );
}`,
  'apps/web/src/components/layout/app-layout.tsx': `import { Outlet } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { AlertBanner } from './alert-banner';

export function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <AlertBanner />
        <main className="p-6 flex-1 bg-gray-50 dark:bg-zinc-900">
          <Outlet />
        </main>
      </div>
    </div>
  );
}`,
  'apps/web/src/components/layout/sidebar.tsx': `export function Sidebar() { return <aside className="w-64 bg-zinc-900 text-white p-4">Sidebar</aside>; }`,
  'apps/web/src/components/layout/header.tsx': `export function Header() { return <header className="h-16 border-b flex items-center px-6">Header</header>; }`,
  'apps/web/src/components/layout/alert-banner.tsx': `export function AlertBanner() { return <div className="bg-amber-100 text-amber-900 px-6 py-2">Alert Banner</div>; }`
};

for (const [filepath, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(__dirname, filepath), content);
}

console.log("Successfully generated all essential files!");
