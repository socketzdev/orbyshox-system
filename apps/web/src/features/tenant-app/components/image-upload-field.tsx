import React, { useState, useRef } from 'react';
import { Upload, Camera, X, Image as ImageIcon, Loader2, Link2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { compressImageFile } from '@/lib/image-upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  helperText?: string;
  className?: string;
}

export const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  value,
  onChange,
  label = 'Foto do Prato / Produto',
  helperText = 'Formatos aceitos: JPG, PNG, WEBP. A foto é otimizada automaticamente.',
  className = '',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor, selecione um arquivo de imagem válido.');
      return;
    }

    try {
      setIsProcessing(true);
      const compressed = await compressImageFile(file, 900, 0.82);
      onChange(compressed);
      toast.success('Foto carregada com sucesso!');
    } catch (err) {
      toast.error('Não foi possível processar esta imagem.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleApplyUrl = () => {
    if (!urlDraft.trim()) {
      toast.error('Informe a URL da imagem');
      return;
    }
    onChange(urlDraft.trim());
    setShowUrlInput(false);
    setUrlDraft('');
    toast.success('Imagem vinculada com sucesso!');
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5 text-amber-500" />
          <span>{label}</span>
          <span className="text-[10px] font-normal text-zinc-400 font-sans">
            (Opcional)
          </span>
        </label>

        {!value && (
          <button
            type="button"
            onClick={() => setShowUrlInput((prev) => !prev)}
            className="text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Link2 className="w-3 h-3" />
            <span>{showUrlInput ? 'Ocultar link' : 'Colar link da web'}</span>
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Input de URL da Web */}
      {showUrlInput && !value && (
        <div className="flex items-center gap-1.5 p-2 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/50">
          <Input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://exemplo.com/foto-do-prato.jpg"
            className="h-8 text-xs rounded-xl bg-white dark:bg-zinc-900 border-zinc-200"
            autoFocus
          />
          <Button
            type="button"
            size="sm"
            onClick={handleApplyUrl}
            className="h-8 px-3 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-zinc-950 shrink-0 cursor-pointer"
          >
            Aplicar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowUrlInput(false)}
            className="h-8 px-2 text-xs text-zinc-500 cursor-pointer"
          >
            ✕
          </Button>
        </div>
      )}

      {/* Preview Quando Já Tem Imagem */}
      {value ? (
        <div className="relative group rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 p-2.5 flex items-center gap-3 shadow-2xs">
          <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 shrink-0 border border-zinc-200/80 dark:border-zinc-700">
            <img
              src={value}
              alt="Preview do produto"
              className="w-full h-full object-cover"
            />
            {isProcessing && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 truncate">
              Foto Selecionada
            </p>
            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
              Exibida no cardápio, mesas e pedidos
            </p>

            <div className="flex items-center gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="h-7 px-2.5 text-[11px] font-semibold rounded-lg border-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3 text-zinc-500" />
                <span>Trocar foto</span>
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange('')}
                disabled={isProcessing}
                className="h-7 px-2 text-[11px] font-semibold rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3 h-3" />
                <span>Remover</span>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Dropzone / Upload Botão */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/20 scale-[0.99]'
              : 'border-zinc-200 dark:border-zinc-800 hover:border-amber-400/80 bg-zinc-50/60 dark:bg-zinc-900/50 hover:bg-amber-50/30'
          }`}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Otimizando e comprimindo imagem...
              </span>
            </div>
          ) : (
            <>
              <div className="w-10 h-10 rounded-2xl bg-amber-100/70 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2 shadow-2xs">
                <Upload className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block">
                Clique ou arraste uma foto aqui
              </span>
              <span className="text-[11px] text-zinc-400 block mt-0.5">
                {helperText}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};
