import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Share2, Download, X } from 'lucide-react';
import { toast } from 'sonner';

/** Contêiner no <body> que recebe o cupom apenas durante a impressão. */
const PRINT_HOST_ID = 'receipt-print-host';
/** Id da área do cupom (usada pelo CSS de impressão). */
const PRINT_AREA_ID = 'receipt-print-area';

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  notes?: string | null;
  modifiers?: string[];
}

export interface ReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Título do modal, ex.: "Fechamento da comanda". */
  title: string;
  storeName?: string;
  /** Linhas extras de identificação da loja (CNPJ, endereço). */
  storeInfo?: string[];
  /** Referência do documento, ex.: "Mesa 01 · Pedidos #101, #102". */
  reference: string;
  createdAt?: string | Date | null;
  items: ReceiptItem[];
  subtotalCents: number;
  discountCents?: number;
  /** Hoje o modelo Order não tem taxa de entrega; a linha só aparece se vier. */
  deliveryFeeCents?: number;
  /** 10% (taxa de serviço) pago na comanda — só aparece se vier maior que zero. */
  tipCents?: number;
  /** Rótulo da linha dos 10%. */
  tipLabel?: string;
  totalCents: number;
  paymentMethod?: string | null;
  /** Linhas adicionais (troco, cliente, operador...). */
  extraRows?: { label: string; value: string }[];
  footerMessage?: string;
  closeLabel?: string;
}

const brl = (cents: number) =>
  (Number(cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });

const dashes = '-'.repeat(42);

/**
 * Recibo do pedido / comanda.
 *
 * Mostra tudo que o cliente precisa conferir — itens com quantidade, preço
 * unitário e subtotal, desconto, taxa de entrega (quando houver), total e forma
 * de pagamento — e oferece imprimir, compartilhar e baixar.
 *
 * A impressão isola `#receipt-print-area` no CSS `@media print`, então sai só o
 * cupom, sem o resto da aplicação.
 */
export const ReceiptDialog: React.FC<ReceiptDialogProps> = ({
  open,
  onOpenChange,
  title,
  storeName,
  storeInfo = [],
  reference,
  createdAt,
  items,
  subtotalCents,
  discountCents = 0,
  deliveryFeeCents = 0,
  tipCents = 0,
  tipLabel = 'TAXA DE SERVIÇO (10%)',
  totalCents,
  paymentMethod,
  extraRows = [],
  footerMessage = 'Obrigado pela preferência! Volte sempre.',
  closeLabel = 'Fechar e voltar',
}) => {
  const when = createdAt ? new Date(createdAt) : new Date();

  // O cupom precisa sair de dentro do <Dialog> para ser impresso por inteiro
  // (o diálogo usa position:fixed, o que cortava o conteúdo). Renderizamos o
  // MESMO markup em dois lugares: aqui dentro (o que o usuário vê) e, durante a
  // impressão, num contêiner no <body>. Duplicar o markup é intencional —
  // manter uma única instância exigiria movê-la no DOM antes do print, e o
  // navegador pode não re-renderizar a tempo do window.print().
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = useCallback(() => {
    setIsPrinting(true);
    // Dois rAF garantem que o portal já pintou no DOM antes de abrir o diálogo
    // nativo de impressão; com um só, a primeira impressão saía vazia.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        setIsPrinting(false);
      });
    });
  }, []);

  // Se o componente sair da tela durante a impressão, o host ficaria no DOM
  // vazando regra de CSS para a próxima impressão.
  useEffect(() => {
    if (!isPrinting) return;
    return () => setIsPrinting(false);
  }, [isPrinting]);

  /**
   * Markup do cupom, sem wrapper — é renderizado na tela e, na impressão,
   * dentro do portal. Precisa ser idêntico nos dois lugares, por isso vive numa
   * função só. As classes usam cores explícitas (não tokens do tema) para o
   * cupom sair sempre preto no branco, mesmo no modo escuro.
   */
  const ReceiptBody = () => (
    <>
      {storeName && (
        <div className="text-center font-black text-xl uppercase tracking-wider">{storeName}</div>
      )}
      {storeInfo.map((s, i) => (
        <div key={i} className="text-center text-sm text-zinc-500 print:text-black">
          {s}
        </div>
      ))}
      <div aria-hidden className="border-t border-dashed border-zinc-300 print:border-black" />

      <div className="flex justify-between gap-2 text-sm">
        <span className="font-bold">{reference}</span>
        <span className="shrink-0">{when.toLocaleString('pt-BR')}</span>
      </div>
      <div aria-hidden className="border-t border-dashed border-zinc-300 print:border-black" />

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="text-center text-sm text-zinc-500 py-2">
            Nenhum item lançado nesta comanda.
          </div>
        ) : (
          items.map((it, i) => (
            <div key={i} className="space-y-0.5 receipt-item">
              <div className="flex justify-between gap-2 text-base">
                <span className="font-bold break-words">
                  {i + 1}. {it.quantity}x {it.name}
                </span>
                <span className="shrink-0 font-black">{brl(it.subtotalCents)}</span>
              </div>
              <div className="text-sm text-zinc-500 print:text-black pl-3">
                {brl(it.unitPriceCents)} cada
              </div>
              {it.modifiers && it.modifiers.length > 0 && (
                <div className="text-sm text-zinc-500 print:text-black pl-3">
                  + {it.modifiers.join(', ')}
                </div>
              )}
              {it.notes && (
                <div className="text-sm italic pl-3">Obs: {it.notes}</div>
              )}
            </div>
          ))
        )}
      </div>

      <div aria-hidden className="border-t border-dashed border-zinc-300 print:border-black" />

      <div className="flex justify-between text-sm">
        <span>SUBTOTAL:</span>
        <span className="font-bold">{brl(subtotalCents)}</span>
      </div>
      {discountCents > 0 && (
        <div className="flex justify-between text-sm text-amber-700 font-bold print:text-black">
          <span>DESCONTO:</span>
          <span>- {brl(discountCents)}</span>
        </div>
      )}
      {deliveryFeeCents > 0 && (
        <div className="flex justify-between text-sm">
          <span>TAXA DE ENTREGA:</span>
          <span className="font-bold">{brl(deliveryFeeCents)}</span>
        </div>
      )}
      {tipCents > 0 && (
        <div className="flex justify-between text-sm">
          <span>{tipLabel}:</span>
          <span className="font-bold">{brl(tipCents)}</span>
        </div>
      )}

      <div className="flex justify-between font-black text-2xl pt-1 border-t border-zinc-300 print:border-black">
        <span>TOTAL A PAGAR:</span>
        <span>{brl(totalCents)}</span>
      </div>
      {tipCents > 0 && (
        <div className="flex justify-between text-sm font-bold">
          <span>TOTAL GERAL (COM 10%):</span>
          <span>{brl(totalCents + tipCents)}</span>
        </div>
      )}

      {paymentMethod && (
        <div className="flex justify-between gap-2 text-base">
          <span>PAGAMENTO:</span>
          <span className="font-bold text-right">{paymentMethod}</span>
        </div>
      )}
      {extraRows.map((r, i) => (
        <div key={i} className="flex justify-between gap-2 text-sm">
          <span>{r.label}:</span>
          <span className="font-bold text-right">{r.value}</span>
        </div>
      ))}

      <div aria-hidden className="border-t border-dashed border-zinc-300 print:border-black" />
      <div className="text-center text-sm text-zinc-500 print:text-black italic">
        {footerMessage}
      </div>
    </>
  );

  const buildText = () => {
    const out: string[] = [];
    if (storeName) out.push(storeName);
    storeInfo.forEach((s) => out.push(s));
    if (storeName || storeInfo.length) out.push(dashes);
    out.push(reference);
    out.push(when.toLocaleString('pt-BR'));
    out.push(dashes);

    items.forEach((it, i) => {
      out.push(`${i + 1}. ${it.quantity}x ${it.name}`);
      out.push(`    ${brl(it.unitPriceCents)} un  =  ${brl(it.subtotalCents)}`);
      if (it.modifiers?.length) out.push(`    + ${it.modifiers.join(', ')}`);
      if (it.notes) out.push(`    Obs: ${it.notes}`);
    });

    out.push(dashes);
    out.push(`SUBTOTAL: ${brl(subtotalCents)}`);
    if (discountCents > 0) out.push(`DESCONTO: - ${brl(discountCents)}`);
    if (deliveryFeeCents > 0) out.push(`TAXA DE ENTREGA: ${brl(deliveryFeeCents)}`);
    if (tipCents > 0) out.push(`${tipLabel}: ${brl(tipCents)}`);
    out.push(`TOTAL A PAGAR: ${brl(totalCents)}`);
    if (tipCents > 0) out.push(`TOTAL GERAL (COM 10%): ${brl(totalCents + tipCents)}`);
    if (paymentMethod) out.push(`PAGAMENTO: ${paymentMethod}`);
    extraRows.forEach((r) => out.push(`${r.label}: ${r.value}`));

    out.push(dashes);
    out.push(footerMessage);
    return out.join('\n');
  };

  const handleShare = async () => {
    const text = buildText();
    const nav = navigator as any;
    if (nav?.share) {
      try {
        await nav.share({ title: reference, text });
      } catch {
        // Usuário cancelou — não é erro.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Resumo copiado. Cole onde quiser compartilhar.');
    } catch {
      toast.error('Não foi possível compartilhar este resumo.');
    }
  };

  const handleDownload = () => {
    const safeName = reference.replace(/[^\w.-]+/g, '-');
    const blob = new Blob([buildText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibo-${safeName}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Recibo baixado.');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-sm max-h-[92dvh] overflow-y-auto bg-card rounded-3xl p-4 sm:p-6 border-border">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
            <Printer className="w-4 h-4 text-muted-foreground" />
            {title}
          </DialogTitle>
          <DialogDescription>
            Confira os itens e o valor a pagar antes de finalizar o atendimento.
          </DialogDescription>
        </DialogHeader>

        {/* Cópia visível na tela. A cópia impressa é o portal abaixo. */}
        <div className="bg-muted border border-dashed border-border p-4 rounded-xl font-mono text-base text-foreground space-y-2 leading-snug select-text">
          <ReceiptBody />
        </div>

        <DialogFooter className="grid grid-cols-2 gap-2 pt-2">
          <Button
            size="sm"
            onClick={handlePrint}
            className="h-11 bg-primary text-primary-foreground text-xs font-bold rounded-xl gap-1.5"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            className="h-11 text-xs font-bold rounded-xl gap-1.5"
          >
            <Share2 className="w-3.5 h-3.5" />
            Compartilhar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="h-11 text-xs font-bold rounded-xl gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Baixar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="h-11 text-xs font-bold rounded-xl gap-1.5"
          >
            <X className="w-3.5 h-3.5" />
            {closeLabel}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Cópia impressa: vive fora do <Dialog>, direto no <body>, para o
          navegador imprimir o cupom inteiro (ver CSS @media print). */}
      {isPrinting && typeof document !== 'undefined'
        ? createPortal(
            <div
              id={PRINT_HOST_ID}
              className="hidden print:block bg-white font-mono text-base text-black leading-snug"
            >
              <div id={PRINT_AREA_ID}>
                <ReceiptBody />
              </div>
            </div>,
            document.body,
          )
        : null}

      <style>{`
        /* Área imprimível.
           O recibo é renderizado dentro de um <Dialog> (Radix), que usa
           position:fixed + transform. Ao imprimir, esse contexto de
           posicionamento cortava o conteúdo: só saía o que cabia numa página.
           Por isso o cupom é renderizado num contêiner próprio no <body>
           (#receipt-print-host) e todo o resto da aplicação é escondido.

           A regra usa visibility + display:none, nessa ordem:
           - display:none em "body *" esconderia também o host e os filhos,
             então o par visibility:hidden + reexibição é o que funciona com
             pouca especificidade e sem quebrar o CSS-in-template-literal.
           - visibility:hidden sozinho reserva o espaço ocupado e gerava
             páginas em branco; por isso o display:none entra em seguida. */
        @media print {
          @page { margin: 2mm; }

          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
            height: auto !important;
            overflow: visible !important;
          }

          body * {
            visibility: hidden !important;
          }

          #receipt-print-host,
          #receipt-print-host * {
            visibility: visible !important;
          }

          /* Esconde do fluxo tudo que NÃO é o cupom, sem tocar no cupom. */
          body *:not(#receipt-print-host):not(#receipt-print-host *) {
            display: none !important;
          }

          #receipt-print-host {
            display: block !important;
          }

          #receipt-print-area {
            position: static !important;
            width: 100% !important;
            max-width: 72mm !important;
            margin: 0 auto !important;
            border: none !important;
            border-radius: 0 !important;
            background: #fff !important;
            box-shadow: none !important;
            color: #000 !important;
            font-size: 16px !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            page-break-inside: auto;
          }

          /* Impede que um item seja partido entre duas páginas. */
          #receipt-print-area .receipt-item {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>
    </Dialog>
  );
};

export default ReceiptDialog;
