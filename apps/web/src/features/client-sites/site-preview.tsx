import React from 'react';
import type { ClientSiteData, SiteContent, SiteTheme } from '@projeto-saas/shared-types';

type SitePreviewProps = {
  data: ClientSiteData;
  compact?: boolean;
};

function radiusValue(radius: SiteTheme['radius']) {
  if (radius === 'sharp') return '4px';
  if (radius === 'round') return '28px';
  return '16px';
}

function fontValue(font: SiteTheme['font']) {
  if (font === 'serif') return 'Georgia, Cambria, serif';
  if (font === 'mono') return 'ui-monospace, SFMono-Regular, Menlo, monospace';
  return 'Inter, ui-sans-serif, system-ui, sans-serif';
}

function SiteHeader({ data, theme, content }: { data: ClientSiteData; theme: SiteTheme; content: SiteContent }) {
  const name = data.tenant.tradeName || data.tenant.companyName;
  return (
    <header className="flex items-center justify-between gap-4 border-b px-5 py-4" style={{ borderColor: `${theme.text}18` }}>
      <div className="flex min-w-0 items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center text-sm font-bold text-white"
          style={{ backgroundColor: theme.primary, borderRadius: radiusValue(theme.radius) }}
        >
          {name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold" style={{ color: theme.text }}>{name}</p>
          <p className="text-[10px] uppercase tracking-[0.14em]" style={{ color: theme.muted }}>{data.tenant.niche}</p>
        </div>
      </div>
      <a
        href={`tel:${content.phone.replace(/\D/g, '')}`}
        className="hidden shrink-0 text-xs font-semibold sm:block"
        style={{ color: theme.primary }}
      >
        {content.phone}
      </a>
    </header>
  );
}

export function SitePreview({ data, compact = false }: SitePreviewProps) {
  const { theme, content } = data.site;
  const name = data.tenant.tradeName || data.tenant.companyName;
  const radius = radiusValue(theme.radius);

  return (
    <div
      className={`overflow-hidden border shadow-2xl shadow-black/10 ${compact ? 'text-[85%]' : ''}`}
      style={{
        backgroundColor: theme.background,
        color: theme.text,
        borderColor: `${theme.text}16`,
        borderRadius: compact ? '18px' : '0px',
        fontFamily: fontValue(theme.font),
      }}
    >
      <SiteHeader data={data} theme={theme} content={content} />

      <main>
        <section
          className="relative overflow-hidden px-6 py-14 sm:px-12 sm:py-20"
          style={{ background: `linear-gradient(135deg, ${theme.surface}, ${theme.primary}14)` }}
        >
          <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-20 blur-3xl" style={{ backgroundColor: theme.accent }} />
          <div className="relative max-w-2xl">
            <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: theme.primary }}>
              {data.site.templateKey.replace('-', ' ')}
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.05] tracking-[-0.05em] sm:text-6xl" style={{ color: theme.text }}>
              {content.heroTitle}
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-7 sm:text-base" style={{ color: theme.muted }}>
              {content.heroSubtitle}
            </p>
            <button
              type="button"
              className="mt-8 px-5 py-3 text-xs font-bold text-white shadow-lg transition hover:brightness-105"
              style={{ backgroundColor: theme.primary, borderRadius: radius }}
            >
              {content.ctaLabel}
            </button>
          </div>
        </section>

        <section className="px-6 py-12 sm:px-12">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: theme.primary }}>Experiência</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{content.servicesTitle}</h2>
            </div>
            <span className="hidden text-xs sm:block" style={{ color: theme.muted }}>{content.services.length} opções em destaque</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {content.services.map((service, index) => (
              <article
                key={`${service.name}-${index}`}
                className="border p-5"
                style={{ backgroundColor: theme.surface, borderColor: `${theme.text}14`, borderRadius: radius }}
              >
                <div className="mb-8 flex h-8 w-8 items-center justify-center text-xs font-bold" style={{ backgroundColor: `${theme.primary}18`, color: theme.primary, borderRadius: radius }}>
                  {String(index + 1).padStart(2, '0')}
                </div>
                <h3 className="text-sm font-bold">{service.name}</h3>
                <p className="mt-2 min-h-10 text-xs leading-5" style={{ color: theme.muted }}>{service.description}</p>
                {service.price && <p className="mt-5 text-xs font-bold" style={{ color: theme.primary }}>{service.price}</p>}
              </article>
            ))}
          </div>
        </section>

        <footer className="grid gap-4 border-t px-6 py-7 text-xs sm:grid-cols-3 sm:px-12" style={{ borderColor: `${theme.text}16`, color: theme.muted }}>
          <div><strong className="block text-[10px] uppercase tracking-wider" style={{ color: theme.text }}>Onde estamos</strong><span className="mt-1 block">{content.address}</span></div>
          <div><strong className="block text-[10px] uppercase tracking-wider" style={{ color: theme.text }}>Horários</strong><span className="mt-1 block">{content.openingHours}</span></div>
          <div><strong className="block text-[10px] uppercase tracking-wider" style={{ color: theme.text }}>Instagram</strong><span className="mt-1 block">{content.instagram}</span></div>
        </footer>
      </main>
    </div>
  );
}
