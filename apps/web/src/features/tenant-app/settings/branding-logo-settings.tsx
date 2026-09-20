import React, { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Image as ImageIcon, Loader2, RotateCcw, Trash2, Upload } from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';

/**
 * Troca da logo do estabelecimento (Configurações > Personalização).
 *
 * Espelha as regras do backend (`branding-logo.ts`) para dar erro imediato sem
 * ida ao servidor — mas o backend revalida, porque validação de cliente é
 * conveniência, não garantia.
 */

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/svg+xml'];
const MAX_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Lê o arquivo como data URL. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

export const BrandingLogoSettings: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Prévia local — ainda não salva. `null` = mostrando a logo atual. */
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['branding-logo', slug],
    queryFn: () => apiGet<{ logoUrl: string | null }>(`/tenant-app/${slug}/settings/branding/logo`),
    enabled: !!slug,
  });

  const savedLogo = data?.logoUrl ?? null;
  const shownLogo = previewDataUrl ?? savedLogo;
  const hasUnsavedPreview = previewDataUrl !== null && previewDataUrl !== savedLogo;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['branding-logo', slug] });
    // A logo aparece no painel, no cardápio e no app do cliente — recarrega tudo.
    queryClient.invalidateQueries({ queryKey: ['tenant'] });
    queryClient.invalidateQueries({ queryKey: ['restaurant-menu'] });
  }, [queryClient, slug]);

  const saveMutation = useMutation({
    mutationFn: (dataUrl: string) =>
      apiPost(`/tenant-app/${slug}/settings/branding/logo`, { dataUrl }),
    onSuccess: () => {
      invalidate();
      setPreviewDataUrl(null);
      setFileName(null);
      setLocalError(null);
      toast.success('Logo atualizada com sucesso!');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message || 'Não foi possível salvar a logo.';
      setLocalError(Array.isArray(msg) ? msg.join(' ') : msg);
      toast.error('Falha ao salvar a logo.');
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => apiDelete(`/tenant-app/${slug}/settings/branding/logo`),
    onSuccess: () => {
      invalidate();
      setPreviewDataUrl(null);
      setFileName(null);
      setLocalError(null);
      toast.success('Logo removida. A padrão voltou a ser usada.');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message || 'Não foi possível remover a logo.'),
  });

  /** Valida e prepara a prévia. Nada é enviado ainda. */
  const handlePickFile = async (file: File | undefined) => {
    setLocalError(null);
    if (!file) return;

    if (!ALLOWED_MIME.includes(file.type)) {
      const msg = 'Formato não aceito. Envie uma imagem PNG, JPG ou SVG.';
      setLocalError(msg);
      toast.error(msg);
      return;
    }

    if (file.size > MAX_BYTES) {
      const msg = `A imagem tem ${formatBytes(file.size)} e o limite é ${formatBytes(MAX_BYTES)}. Reduza o arquivo.`;
      setLocalError(msg);
      toast.error(msg);
      return;
    }

    try {
      const dataUrl = await readAsDataUrl(file);
      setPreviewDataUrl(dataUrl);
      setFileName(file.name);
    } catch {
      const msg = 'Não foi possível ler o arquivo. Tente novamente.';
      setLocalError(msg);
      toast.error(msg);
    }
  };

  const resetInput = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
            <ImageIcon className="w-5 h-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-zinc-900">Logo do estabelecimento</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Aparece no painel, no cardápio e no app do cliente. Use PNG, JPG ou SVG
              de até {formatBytes(MAX_BYTES)}.
            </p>
          </div>
        </div>

        {/* Pré-visualização */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="w-32 h-32 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 flex items-center justify-center overflow-hidden shrink-0">
            {isLoading ? (
              <Loader2 className="w-6 h-6 text-zinc-300 animate-spin" />
            ) : shownLogo ? (
              <img
                src={shownLogo}
                alt="Pré-visualização da logo"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="text-center px-2">
                <ImageIcon className="w-7 h-7 text-zinc-300 mx-auto" />
                <p className="text-[10px] text-zinc-400 mt-1 font-bold">Logo padrão</p>
              </div>
            )}
          </div>

          <div className="flex-1 w-full space-y-2">
            {hasUnsavedPreview && (
              <p className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Pré-visualização — clique em <strong>Salvar logo</strong> para aplicar.
              </p>
            )}
            {fileName && (
              <p className="text-[11px] text-zinc-500 truncate">Arquivo: {fileName}</p>
            )}
            {localError && (
              <p className="text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                {localError}
              </p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml"
              className="hidden"
              onChange={(e) => {
                void handlePickFile(e.target.files?.[0]);
                resetInput();
              }}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={saveMutation.isPending}
                className="h-10 rounded-xl text-xs font-bold"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                {shownLogo ? 'Trocar logo' : 'Enviar logo'}
              </Button>

              {hasUnsavedPreview && (
                <Button
                  type="button"
                  onClick={() => previewDataUrl && saveMutation.mutate(previewDataUrl)}
                  disabled={saveMutation.isPending}
                  className="h-10 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar logo'
                  )}
                </Button>
              )}

              {hasUnsavedPreview && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setPreviewDataUrl(null);
                    setFileName(null);
                    setLocalError(null);
                  }}
                  disabled={saveMutation.isPending}
                  className="h-10 rounded-xl text-xs font-bold text-zinc-600"
                >
                  Descartar prévia
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Restaurar padrão */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 p-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h4 className="text-sm font-black text-zinc-900 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-zinc-500" />
            Restaurar logo padrão
          </h4>
          <p className="text-xs text-zinc-500 mt-0.5">
            Remove a logo enviada e volta a exibir a marca padrão do sistema.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => removeMutation.mutate()}
          disabled={!savedLogo || removeMutation.isPending}
          className="h-10 rounded-xl text-xs font-bold border-rose-200 text-rose-700 hover:bg-rose-50 shrink-0"
        >
          {removeMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              Removendo...
            </>
          ) : (
            <>
              <Trash2 className="w-4 h-4 mr-1.5" />
              Remover logo
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export default BrandingLogoSettings;
