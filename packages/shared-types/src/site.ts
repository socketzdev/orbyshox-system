import { z } from 'zod';

export const CLIENT_SITE_NICHES = ['RESTAURANT', 'BARBERSHOP', 'SUPERMARKET', 'UNIVERSAL'] as const;
export type ClientSiteNiche = (typeof CLIENT_SITE_NICHES)[number];

// These paths belong to the platform itself and cannot be claimed by a tenant.
export const SITE_RESERVED_SLUGS = [
  'login',
  'dashboard',
  'tenants',
  'plans',
  'coupons',
  'billing',
  'tickets',
  'knowledge',
  'staff',
  'settings',
  'audit',
  'api',
] as const;

export const clientSiteNicheSchema = z.enum(CLIENT_SITE_NICHES);

export const siteThemeSchema = z.object({
  primary: z.string().regex(/^#[0-9a-f]{6}$/i),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  background: z.string().regex(/^#[0-9a-f]{6}$/i),
  surface: z.string().regex(/^#[0-9a-f]{6}$/i),
  text: z.string().regex(/^#[0-9a-f]{6}$/i),
  muted: z.string().regex(/^#[0-9a-f]{6}$/i),
  radius: z.enum(['sharp', 'soft', 'round']),
  font: z.enum(['sans', 'serif', 'mono']),
});

export const siteServiceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(240),
  price: z.string().trim().max(80).optional(),
});

export const siteContentSchema = z.object({
  heroTitle: z.string().trim().min(1).max(120),
  heroSubtitle: z.string().trim().min(1).max(320),
  ctaLabel: z.string().trim().min(1).max(60),
  servicesTitle: z.string().trim().min(1).max(80),
  services: z.array(siteServiceSchema).max(12),
  address: z.string().trim().max(180),
  openingHours: z.string().trim().max(180),
  phone: z.string().trim().max(40),
  instagram: z.string().trim().max(80),
});

export const updateClientSiteSchema = z.object({
  niche: clientSiteNicheSchema.optional(),
  slug: z.string().trim().min(3).max(48).regex(/^[a-z0-9-]+$/).optional(),
  templateKey: z.string().trim().min(1).max(40).optional(),
  theme: siteThemeSchema.partial().optional(),
  content: siteContentSchema.partial().optional(),
  isPublished: z.boolean().optional(),
});

export type SiteTheme = {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  radius: 'sharp' | 'soft' | 'round';
  font: 'sans' | 'serif' | 'mono';
};

export type SiteService = {
  name: string;
  description: string;
  price?: string;
};

export type SiteContent = {
  heroTitle: string;
  heroSubtitle: string;
  ctaLabel: string;
  servicesTitle: string;
  services: SiteService[];
  address: string;
  openingHours: string;
  phone: string;
  instagram: string;
};

export type ClientSiteData = {
  tenant: {
    id: string;
    companyName: string;
    tradeName?: string | null;
    niche: ClientSiteNiche;
    status: string;
  };
  site: {
    slug: string;
    templateKey: string;
    theme: SiteTheme;
    content: SiteContent;
    isPublished: boolean;
  };
};

export const DEFAULT_SITE_THEME: SiteTheme = {
  primary: '#e87932',
  accent: '#facc15',
  background: '#fffaf4',
  surface: '#ffffff',
  text: '#172033',
  muted: '#667085',
  radius: 'soft',
  font: 'sans',
};

export const DEFAULT_SITE_CONTENT_BY_NICHE: Record<ClientSiteNiche, SiteContent> = {
  RESTAURANT: {
    heroTitle: 'Sabor que vira memória',
    heroSubtitle: 'Uma experiência feita com ingredientes selecionados, cuidado e personalidade.',
    ctaLabel: 'Ver nosso menu',
    servicesTitle: 'Destaques da casa',
    services: [
      { name: 'Menu executivo', description: 'Pratos do dia com ingredientes frescos.', price: 'A partir de R$ 32' },
      { name: 'Experiência da casa', description: 'Uma seleção especial para compartilhar.', price: 'A partir de R$ 68' },
      { name: 'Carta de bebidas', description: 'Drinks autorais, cafés e opções sem álcool.', price: 'Confira a carta' },
    ],
    address: 'Rua da Harmonia, 120 · Centro',
    openingHours: 'Terça a domingo · 11h às 23h',
    phone: '(11) 99999-0000',
    instagram: '@suaempresa',
  },
  BARBERSHOP: {
    heroTitle: 'Seu estilo, sua assinatura',
    heroSubtitle: 'Cortes precisos, barba impecável e uma pausa na rotina para você.',
    ctaLabel: 'Agendar horário',
    servicesTitle: 'Serviços mais procurados',
    services: [
      { name: 'Corte masculino', description: 'Consultoria de estilo e acabamento detalhado.', price: 'R$ 55' },
      { name: 'Corte + barba', description: 'O ritual completo para renovar o visual.', price: 'R$ 85' },
      { name: 'Barba premium', description: 'Toalha quente, hidratação e finalização.', price: 'R$ 45' },
    ],
    address: 'Av. Central, 480 · Jardim',
    openingHours: 'Segunda a sábado · 9h às 20h',
    phone: '(11) 99999-0000',
    instagram: '@suaempresa',
  },
  SUPERMARKET: {
    heroTitle: 'Tudo perto de você',
    heroSubtitle: 'Qualidade, variedade e economia para deixar sua rotina mais leve.',
    ctaLabel: 'Ver ofertas da semana',
    servicesTitle: 'Encontre no mercado',
    services: [
      { name: 'Hortifruti fresco', description: 'Produtos selecionados todos os dias.', price: 'Confira as ofertas' },
      { name: 'Açougue e padaria', description: 'Qualidade para o almoço e para o café.', price: 'Produção diária' },
      { name: 'Clube de vantagens', description: 'Preços especiais para quem compra com a gente.', price: 'Cadastre-se grátis' },
    ],
    address: 'Rua das Palmeiras, 900 · Vila Nova',
    openingHours: 'Todos os dias · 7h às 22h',
    phone: '(11) 99999-0000',
    instagram: '@suaempresa',
  },
  UNIVERSAL: {
    heroTitle: 'Tudo que o seu negócio precisa',
    heroSubtitle: 'Vendas, estoque, equipe e financeiro em um só lugar.',
    ctaLabel: 'Conhecer a empresa',
    servicesTitle: 'O que oferecemos',
    services: [
      { name: 'Produtos & Serviços', description: 'Catálogo completo com preços atualizados.', price: 'Consulte' },
      { name: 'Atendimento ágil', description: 'Compra rápida no balcão ou com entrega.', price: 'Fale com a gente' },
      { name: 'Ofertas da semana', description: 'Novidades e condições especiais.', price: 'Confira' },
    ],
    address: 'Rua Central, 100 · Centro',
    openingHours: 'Segunda a sábado · 8h às 20h',
    phone: '(11) 99999-0000',
    instagram: '@suaempresa',
  },
};

export const SITE_TEMPLATE_CATALOG = [
  {
    key: 'bistro',
    name: 'Bistrô Editorial',
    description: 'Visual acolhedor com foco em história, cardápio e reserva.',
    niches: ['RESTAURANT'] as ClientSiteNiche[],
    preview: 'warm',
    defaultPrimary: '#e87932',
  },
  {
    key: 'studio',
    name: 'Studio Signature',
    description: 'Layout elegante para destacar serviços, agenda e profissionais.',
    niches: ['BARBERSHOP'] as ClientSiteNiche[],
    preview: 'dark',
    defaultPrimary: '#a78bfa',
  },
  {
    key: 'market',
    name: 'Market Fresh',
    description: 'Grade objetiva para ofertas, categorias e conveniência.',
    niches: ['SUPERMARKET', 'UNIVERSAL'] as ClientSiteNiche[],
    preview: 'fresh',
    defaultPrimary: '#16a34a',
  },
  {
    key: 'minimal',
    name: 'Minimal Canvas',
    description: 'Uma presença limpa e versátil para qualquer tipo de negócio.',
    niches: CLIENT_SITE_NICHES as unknown as ClientSiteNiche[],
    preview: 'minimal',
    defaultPrimary: '#2563eb',
  },
] as const;

export type SiteTemplateDefinition = (typeof SITE_TEMPLATE_CATALOG)[number];
