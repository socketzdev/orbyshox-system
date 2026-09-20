import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenant } from '../context/tenant-context';
import {
  Barcode,
  Search,
  ShoppingCart,
  Zap,
  Trash2,
  DollarSign,
  CreditCard,
  QrCode,
  UserCheck,
  AlertTriangle,
  Scale,
  Wifi,
  WifiOff,
  Keyboard,
  ArrowDownCircle,
  ArrowUpCircle,
  HelpCircle,
  CheckCircle2,
  Receipt,
  FileSpreadsheet,
  Printer,
  Share2,
  Download,
  X,
  Lock,
  XCircle,
  Banknote,
  Coins,
  Sparkles,
} from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  parseScaleBarcode,
  checkCustomerCreditLimit,
} from './barcode-scale';
import {
  calculateSmartChange,
  getQuickCashPresets,
} from './smart-change';
import { normalizePaymentMethod } from '../pos/domain/payment-methods';
import { useCart } from '../pos/hooks/use-cart';
import { lineTotalCents, type CartLine } from '../pos/domain/cart';
import { formatCurrency } from '@/lib/format';
import { toast } from 'sonner';

/**
 * Emite o som autêntico de bipe de caixa de supermercado via Web Audio API.
 * Funciona nativamente em qualquer navegador sem bibliotecas externas.
 */
function playPosBeep(type: 'success' | 'error' = 'success') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (type === 'success') {
      // Bipe agudo característico de caixa de supermercado (1400Hz, 70ms)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } else {
      // Tom grave de erro quando o código não existe (260Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, ctx.currentTime);
      gain.gain.setValueAtTime(0.28, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    }
  } catch {
    // Silencia caso haja restrição de autoplay do navegador antes de interação do usuário
  }
}

/**
 * Linha do cupom. Estende `CartLine` do domínio — todo valor monetário é
 * **inteiro em centavos**. Antes a linha guardava reais (`unitPrice`, `total`)
 * e a tela reconvertia com `Math.round(x * 100)` a cada render, o que abria
 * margem para divergência de arredondamento entre o exibido e o enviado.
 */
export interface PosLineItem extends CartLine {
  barcode: string;
}

export const SupermarketPosPage: React.FC = () => {
  const { slug, currentUser } = useTenant();
  const queryClient = useQueryClient();

  // ─── Backend Queries ────────────────────────────────────────────────────────
  const { data: rawProductsData } = useQuery({
    queryKey: ['supermarket-products', slug],
    queryFn: () => apiGet<any>(`/tenant-app/${slug}/products`),
    refetchInterval: 30000,
  });

  const dbProducts = useMemo(() => {
    if (Array.isArray(rawProductsData)) return rawProductsData;
    if (rawProductsData && Array.isArray(rawProductsData.products)) return rawProductsData.products;
    return [];
  }, [rawProductsData]);

  const { data: dbCustomers = [] } = useQuery({
    queryKey: ['supermarket-customers', slug],
    queryFn: () => apiGet<any[]>(`/tenant-app/${slug}/customers`),
    refetchInterval: 30000,
  });

  const { data: cashRegisterData, refetch: refetchCashRegister } = useQuery({
    queryKey: ['supermarket-cash-register', slug],
    queryFn: () => apiGet<any>(`/tenant-app/${slug}/cash-register`),
    refetchInterval: 10000,
  });

  const { data: storeSettings } = useQuery({
    queryKey: ['supermarket-settings', slug],
    queryFn: () => apiGet<any>(`/tenant-app/${slug}/settings/store`),
  });

  // Normalized catalog list from database or fallback to mock
  const catalogList = useMemo(() => {
    if (dbProducts && dbProducts.length > 0) {
      return dbProducts.map((p: any) => ({
        id: p.id,
        barcode: p.barcode || p.sku || '',
        secondaryBarcodes: (p.barcodes || []).map((b: any) => ({
          barcode: b.barcode,
          type: b.type,
          multiplier: Number(b.multiplier) || 1,
        })),
        packQuantity: Number(p.packQuantity) || 1,
        internalCode: p.sku || (p.barcode ? p.barcode.slice(-5) : p.id.slice(-5)),
        name: p.name,
        price: (p.salePriceCents || 0) / 100,
        unit: p.unit || 'un',
        isWeighable: p.unit === 'kg' || (p.barcode && p.barcode.startsWith('2')),
      }));
    }
    return [];
  }, [dbProducts]);

  // Normalized customer list from database
  const customerList = useMemo(() => {
    if (dbCustomers && dbCustomers.length > 0) {
      return dbCustomers.map((c: any) => ({
        id: c.id,
        name: c.name,
        cpf: c.document || '',
        currentDebt: (c.currentDebtCents || 0) / 100,
        creditLimit: (c.creditLimitCents || 50000) / 100,
      }));
    }
    return [];
  }, [dbCustomers]);

  // Carrinho — estado e aritmética vêm do domínio compartilhado.
  // `mergeLines: false` preserva o comportamento original deste PDV: cada
  // leitura de código de barras gera uma linha própria no cupom.
  const {
    cart: items,
    addItem,
    removeItem,
    clear: clearCartItems,
    discountPercent,
    applyPercentDiscount,
    clearDiscount,
    totals,
  } = useCart({ mergeLines: false });

  const [barcodeInput, setBarcodeInput] = useState('');
  const [multiplier, setMultiplier] = useState<number>(1);

  // Network / Offline Strategy State
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [pendingSyncQueue, setPendingSyncQueue] = useState<any[]>(() => {
    const saved = localStorage.getItem(`supermarket_pending_sales_${slug}`);
    return saved ? JSON.parse(saved) : [];
  });

  // Modal States
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSearchProductOpen, setIsSearchProductOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [isQuantityModalOpen, setIsQuantityModalOpen] = useState(false);
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [isSangriaModalOpen, setIsSangriaModalOpen] = useState(false);
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);

  // Open Cash Register Modal
  const [isOpenRegisterModalOpen, setIsOpenRegisterModalOpen] = useState(false);
  const [openingBalance, setOpeningBalance] = useState<number>(100.0);
  const [openingNotes, setOpeningNotes] = useState('Abertura inicial de turno');
  const [isOpeningRegister, setIsOpeningRegister] = useState(false);

  // Manager PIN Cancel Modal
  const [isManagerPinModalOpen, setIsManagerPinModalOpen] = useState(false);
  const [managerPin, setManagerPin] = useState('');
  const [isAuthorizingManager, setIsAuthorizingManager] = useState(false);

  // Manager PIN Cancel Item Modal
  const [itemIndexToRemove, setItemIndexToRemove] = useState<number | null>(null);
  const [isRemoveItemModalOpen, setIsRemoveItemModalOpen] = useState(false);
  const [removeItemPin, setRemoveItemPin] = useState('');
  const [isAuthorizingRemoveItem, setIsAuthorizingRemoveItem] = useState(false);

  // Thermal Receipt Modal
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  // Liga a cópia do cupom que vive fora do <Dialog>, direto no <body>. O
  // diálogo usa position:fixed e cortava o cupom longo na impressão.
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);

  /**
   * Corpo do cupom térmico, sem wrapper.
   *
   * Renderizado em dois lugares: na tela (dentro do diálogo) e, durante a
   * impressão, num contêiner no <body> via portal. O diálogo do Radix usa
   * position:fixed, o que fazia o conteúdo longo ser cortado na primeira
   * página — saíam só os primeiros itens, sem o total.
   */
  const ThermalReceiptBody = () => (
    <>
      <div className="text-center font-bold text-xs uppercase tracking-wider">
        {storeSettings?.storeName || 'SUPERMERCADO MODELO'}
      </div>
      <div className="text-center text-[10px] text-muted-foreground print:text-black">
        {storeSettings?.cnpj ? `CNPJ: ${storeSettings.cnpj}` : 'CNPJ: 12.345.678/0001-90'}
      </div>
      {storeSettings?.address && (
        <div className="text-center text-[10px] text-muted-foreground print:text-black">
          {storeSettings.address}
        </div>
      )}
      <div className="text-center text-[10px] text-muted-foreground print:text-black">
        ------------------------------------------------
      </div>
      <div className="flex justify-between text-[10px]">
        <span>CUPOM Nº {String(completedSaleOrder?.orderNumber || '000').padStart(6, '0')}</span>
        <span>{new Date(completedSaleOrder?.createdAt || Date.now()).toLocaleString('pt-BR')}</span>
      </div>
      <div className="text-center text-[10px] text-muted-foreground print:text-black">
        ------------------------------------------------
      </div>
      <div className="space-y-1">
        {completedSaleOrder?.items?.map((it: any, idx: number) => (
          <div key={idx} className="flex justify-between text-[10px] receipt-item">
            <span className="truncate max-w-[170px]">
              {idx + 1}. {it.name}
            </span>
            <span className="shrink-0 font-bold">
              {it.quantity}
              {it.unit} x {formatCurrency(it.unitPriceCents)} ={' '}
              {formatCurrency(it.unitPriceCents * it.quantity)}
            </span>
          </div>
        ))}
      </div>
      <div className="text-center text-[10px] text-muted-foreground print:text-black">
        ------------------------------------------------
      </div>
      <div className="flex justify-between">
        <span>SUBTOTAL:</span>
        <span>{formatCurrency(completedSaleOrder?.rawSubtotal || 0)}</span>
      </div>
      {(completedSaleOrder?.discountAmount || 0) > 0 && (
        <div className="flex justify-between text-amber-700 font-bold print:text-black">
          <span>DESCONTO:</span>
          <span>- {formatCurrency(completedSaleOrder?.discountAmount || 0)}</span>
        </div>
      )}
      {/* A linha só aparece quando houver taxa: o modelo Order não tem
          esse campo hoje, então nada é exibido nas vendas atuais. */}
      {(completedSaleOrder?.deliveryFee || 0) > 0 && (
        <div className="flex justify-between text-[10px]">
          <span>TAXA DE ENTREGA:</span>
          <span>{formatCurrency(completedSaleOrder.deliveryFee)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-xs pt-1 border-t border-border print:border-black">
        <span>TOTAL A PAGAR:</span>
        <span>{formatCurrency(completedSaleOrder?.finalTotal || 0)}</span>
      </div>
      <div className="flex justify-between text-[10px]">
        <span>FORMA DE PAGAMENTO:</span>
        <span className="font-bold">{completedSaleOrder?.paymentMethod}</span>
      </div>
      {completedSaleOrder?.cashGiven > 0 && (
        <>
          <div className="flex justify-between text-[10px]">
            <span>VALOR RECEBIDO:</span>
            <span>R$ {completedSaleOrder.cashGiven.toFixed(2).replace('.', ',')}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span>TROCO:</span>
            <span>R$ {(completedSaleOrder.changeDue || 0).toFixed(2).replace('.', ',')}</span>
          </div>
        </>
      )}
      {completedSaleOrder?.customerName && (
        <div className="flex justify-between text-[10px]">
          <span>CLIENTE (FIADO):</span>
          <span className="font-bold">{completedSaleOrder.customerName}</span>
        </div>
      )}
      {completedSaleOrder?.cpf && (
        <div className="flex justify-between text-[10px]">
          <span>CPF NA NOTA:</span>
          <span>{completedSaleOrder.cpf}</span>
        </div>
      )}
      <div className="text-center text-[10px] text-muted-foreground print:text-black">
        ------------------------------------------------
      </div>
      <div className="text-center text-[10px] text-muted-foreground print:text-black italic">
        {storeSettings?.receiptFooterMessage || 'Obrigado pela preferência! Volte sempre.'}
      </div>
      <div className="text-center text-[9px] text-muted-foreground print:text-black">
        Operador: {completedSaleOrder?.operator || currentUser?.name || 'Caixa 01'}
      </div>
    </>
  );
  const [completedSaleOrder, setCompletedSaleOrder] = useState<any>(null);
  const [isFinalizingSale, setIsFinalizingSale] = useState(false);

  // Sangria Form
  const [sangriaType, setSangriaType] = useState<'SANGRIA' | 'SUPRIMENTO'>('SANGRIA');
  const [sangriaAmount, setSangriaAmount] = useState<number>(100.0);
  const [sangriaReason, setSangriaReason] = useState('Sangria periódica para o cofre central');
  const [cashRegisterBalance, setCashRegisterBalance] = useState<number>(640.0);

  // Checkout Form
  const [cpfOnSlip, setCpfOnSlip] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'DINHEIRO' | 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'FIADO' | 'VALE'>('DINHEIRO');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [cashGiven, setCashGiven] = useState<number>(0);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Set default customer when customerList is populated
  useEffect(() => {
    if (customerList.length > 0 && !selectedCustomerId) {
      setSelectedCustomerId(customerList[0].id);
    }
  }, [customerList, selectedCustomerId]);

  // Keep focus on barcode input
  useEffect(() => {
    if (
      !isHelpOpen &&
      !isSearchProductOpen &&
      !isQuantityModalOpen &&
      !isDiscountModalOpen &&
      !isSangriaModalOpen &&
      !isCheckoutModalOpen &&
      !isOpenRegisterModalOpen &&
      !isManagerPinModalOpen &&
      !isRemoveItemModalOpen &&
      !isReceiptModalOpen
    ) {
      barcodeInputRef.current?.focus();
    }
  }, [
    isHelpOpen,
    isSearchProductOpen,
    isQuantityModalOpen,
    isDiscountModalOpen,
    isSangriaModalOpen,
    isCheckoutModalOpen,
    isOpenRegisterModalOpen,
    isManagerPinModalOpen,
    isRemoveItemModalOpen,
    isReceiptModalOpen,
  ]);

  // Global Keyboard Shortcuts (F1, F2, F3, F4, F7, F10, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        setIsHelpOpen(true);
      } else if (e.key === 'F2') {
        e.preventDefault();
        setIsSearchProductOpen(true);
      } else if (e.key === 'F3') {
        e.preventDefault();
        setIsQuantityModalOpen(true);
      } else if (e.key === 'F4') {
        e.preventDefault();
        setIsDiscountModalOpen(true);
      } else if (e.key === 'F7') {
        e.preventDefault();
        setIsSangriaModalOpen(true);
      } else if (e.key === 'F10') {
        e.preventDefault();
        if (items.length > 0) {
          setIsCheckoutModalOpen(true);
        }
      } else if (e.key === 'Escape') {
        if (items.length > 0 && !isCheckoutModalOpen && !isSearchProductOpen && !isQuantityModalOpen && !isDiscountModalOpen && !isSangriaModalOpen && !isReceiptModalOpen) {
          e.preventDefault();
          setIsManagerPinModalOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items.length, isCheckoutModalOpen, isSearchProductOpen, isQuantityModalOpen, isDiscountModalOpen, isSangriaModalOpen, isReceiptModalOpen]);

  // Totais — calculados pela camada de domínio (em centavos, nunca negativos).
  // Os nomes antigos são mantidos como alias para não reescrever todo o JSX.
  const rawSubtotal = totals.subtotalCents;
  const discountAmount = totals.discountCents;
  const finalTotal = totals.totalCents;
  const totalCents = totals.totalCents;

  const cashGivenCents = useMemo(() => Math.round(cashGiven * 100), [cashGiven]);

  const smartChange = useMemo(() => {
    return calculateSmartChange(totalCents, cashGivenCents);
  }, [totalCents, cashGivenCents]);

  const quickPresets = useMemo(() => {
    return getQuickCashPresets(totalCents);
  }, [totalCents]);

  const changeDue = useMemo(() => {
    return smartChange.changeCents / 100;
  }, [smartChange]);

  // Selected customer for Fiado
  const selectedCustomer = useMemo(() => {
    return customerList.find((c) => c.id === selectedCustomerId) || customerList[0] || {
      id: '',
      name: 'Cliente Padrão',
      cpf: '',
      currentDebt: 0,
      creditLimit: 500,
    };
  }, [customerList, selectedCustomerId]);

  // `checkCustomerCreditLimit` trabalha em REAIS (o cadastro do cliente guarda
  // dívida/limite em reais), por isso o total em centavos é convertido aqui.
  const creditCheck = useMemo(() => {
    return checkCustomerCreditLimit(
      selectedCustomer.currentDebt,
      selectedCustomer.creditLimit,
      finalTotal / 100,
    );
  }, [selectedCustomer, finalTotal]);

  // Computed drawer balance from server or local fallback
  const displayCashBalance = useMemo(() => {
    if (cashRegisterData?.isOpen && cashRegisterData.register) {
      if (cashRegisterData.metrics?.cashInDrawerCents !== undefined) {
        return cashRegisterData.metrics.cashInDrawerCents / 100;
      }
      const initial = (cashRegisterData.register.initialBalanceCents || 0) / 100;
      const sales = (cashRegisterData.metrics?.totalSalesCents || 0) / 100;
      return initial + sales;
    }
    return cashRegisterBalance;
  }, [cashRegisterData, cashRegisterBalance]);

  // Handle barcode submission (scanner triggers 'Enter')
  const handleProcessBarcode = (codeToProcess?: string) => {
    const code = (codeToProcess || barcodeInput).trim();
    if (!code) return;

    // Check if it is a scale barcode (starts with 2 and length 13)
    const scaleParsed = parseScaleBarcode(code);

    let matchedProduct: any = null;
    // Preço unitário e total em CENTAVOS. `catalogList.price` vem em reais
    // (salePriceCents / 100), por isso a conversão acontece aqui, uma única vez.
    let unitPriceCents = 0;
    let computedQty = multiplier;
    let isWeighable = false;

    if (scaleParsed.isWeighable) {
      matchedProduct = catalogList.find((p: any) => p.internalCode === scaleParsed.productCode);
      if (matchedProduct) {
        isWeighable = true;
        // Etiqueta de balança já traz o valor total da pesagem em reais.
        unitPriceCents = Math.round(scaleParsed.embeddedValue * 100);
        computedQty = 1;
      }
    } else {
      matchedProduct = catalogList.find((p: any) => {
        if (p.barcode === code || p.internalCode === code) return true;
        if (p.secondaryBarcodes?.some((b: any) => b.barcode === code)) return true;
        return false;
      });

      if (matchedProduct) {
        const secondary = matchedProduct.secondaryBarcodes?.find((b: any) => b.barcode === code);
        const effectiveMultiplier = secondary && secondary.multiplier > 1
          ? computedQty * secondary.multiplier
          : computedQty;
        computedQty = effectiveMultiplier;
        unitPriceCents = Math.round(matchedProduct.price * 100);
      }
    }

    if (matchedProduct) {
      playPosBeep('success');
      const newLineItem: PosLineItem = {
        productId: matchedProduct.id,
        barcode: code,
        name: matchedProduct.name,
        unit: matchedProduct.unit,
        quantity: computedQty,
        unitPriceCents,
        isWeighable,
      };
      addItem(newLineItem);
      setBarcodeInput('');
      setMultiplier(1);
    } else {
      playPosBeep('error');
      toast.error(`Produto não encontrado para o código de barras: ${code}. Use F2 para buscar pelo nome.`);
      setBarcodeInput('');
    }
  };

  // Request remove line item (opens manager PIN modal)
  const handleRequestRemoveItem = (index: number) => {
    setItemIndexToRemove(index);
    setRemoveItemPin('');
    setIsRemoveItemModalOpen(true);
  };

  // Authorize remove line item with manager PIN
  const handleAuthorizeRemoveItem = async () => {
    if (itemIndexToRemove === null) return;
    setIsAuthorizingRemoveItem(true);
    try {
      await apiPost(`/tenant-app/${slug}/pos/authorize-manager`, { pin: removeItemPin });
      removeItem(itemIndexToRemove);
      setIsRemoveItemModalOpen(false);
      setItemIndexToRemove(null);
      setRemoveItemPin('');
      toast.success('Item cancelado com sucesso pela gerência!');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'PIN de gerente inválido');
    } finally {
      setIsAuthorizingRemoveItem(false);
    }
  };

  // Confirm Sangria / Suprimento (Persisted to Backend API)
  const handleConfirmSangria = async () => {
    try {
      await apiPost(`/tenant-app/${slug}/cash-register/movement`, {
        type: sangriaType,
        amountCents: Math.round(sangriaAmount * 100),
        reason: sangriaReason,
      });
      await queryClient.invalidateQueries({ queryKey: ['supermarket-cash-register', slug] });
      toast.success(`${sangriaType === 'SANGRIA' ? 'Sangria' : 'Suprimento'} de R$ ${sangriaAmount.toFixed(2)} registrado com sucesso no caixa.`);
      setIsSangriaModalOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Erro ao registrar movimentação no caixa');
    }
  };

  // Open Cash Register
  const handleOpenCashRegister = async () => {
    setIsOpeningRegister(true);
    try {
      await apiPost(`/tenant-app/${slug}/cash-register/open`, {
        initialBalanceCents: Math.round(openingBalance * 100),
        notes: openingNotes,
      });
      await queryClient.invalidateQueries({ queryKey: ['supermarket-cash-register', slug] });
      setIsOpenRegisterModalOpen(false);
      toast.success('Caixa aberto com sucesso!');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao abrir caixa');
    } finally {
      setIsOpeningRegister(false);
    }
  };

  // Manager PIN Cart Cancellation
  const handleAuthorizeCancelCart = async () => {
    if (!managerPin) return;
    setIsAuthorizingManager(true);
    try {
      await apiPost(`/tenant-app/${slug}/pos/authorize-manager`, { pin: managerPin });
      clearCartItems();
      clearDiscount();
      setMultiplier(1);
      setBarcodeInput('');
      setIsManagerPinModalOpen(false);
      setManagerPin('');
      toast.success('Cupom atual cancelado com sucesso pela gerência!');
    } catch (err: any) {
      toast.error(err?.message || 'PIN de gerente inválido');
    } finally {
      setIsAuthorizingManager(false);
    }
  };

  // Finalize Sale
  const handleFinalizeSale = async () => {
    if (paymentMethod === 'FIADO' && !creditCheck.allowed) {
      toast.error(`Operação cancelada! O limite de crédito do cliente (${selectedCustomer.name}) foi ultrapassado em R$ ${creditCheck.exceededBy.toFixed(2)}.`);
      return;
    }

    if (paymentMethod === 'DINHEIRO' && smartChange.isShort) {
      toast.error(`Valor recebido insuficiente! Faltam R$ ${(smartChange.shortCents / 100).toFixed(2).replace('.', ',')}.`);
      return;
    }

    setIsFinalizingSale(true);

    // Enviado no vocabulário canônico. Antes este bloco convertia para inglês
    // (DINHEIRO → CASH, FIADO → ON_CREDIT) enquanto o outro PDV já mandava
    // inglês — o mesmo método chegava ao banco com dois valores diferentes e o
    // relatório, que agrupa pelo campo cru, separava "Dinheiro" em duas linhas.
    // O backend normaliza na escrita, então basta não traduzir aqui.
    const payload = {
      items: items.map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        unitPrice: it.unitPriceCents,
      })),
      discountCents: discountAmount,
      paymentMethod: normalizePaymentMethod(paymentMethod),
      customerId: paymentMethod === 'FIADO' ? selectedCustomer.id : undefined,
      notes: cpfOnSlip ? `CPF na Nota: ${cpfOnSlip}` : undefined,
    };

    let serverOrder: any = null;
    if (!isOfflineMode) {
      try {
        serverOrder = await apiPost<any>(`/tenant-app/${slug}/orders`, payload);
        queryClient.invalidateQueries({ queryKey: ['supermarket-cash-register', slug] });
        queryClient.invalidateQueries({ queryKey: ['supermarket-products', slug] });
        queryClient.invalidateQueries({ queryKey: ['supermarket-customers', slug] });
      } catch (err: any) {
        console.error('Erro ao registrar venda na API:', err);
        toast.error('Falha na comunicação com o servidor. Salvando venda localmente...');
      }
    }

    const saleRecord = {
      id: serverOrder?.id || `sale-${Date.now()}`,
      orderNumber: serverOrder?.orderNumber || Math.floor(100 + Math.random() * 900),
      createdAt: serverOrder?.createdAt || new Date().toISOString(),
      items: [...items],
      rawSubtotal,
      discountAmount,
      finalTotal,
      paymentMethod,
      cpf: cpfOnSlip || null,
      customerName: paymentMethod === 'FIADO' ? selectedCustomer.name : null,
      cashGiven: paymentMethod === 'DINHEIRO' ? cashGiven : 0,
      changeDue: paymentMethod === 'DINHEIRO' ? changeDue : 0,
      operator: currentUser?.name || 'Operador Caixa 01',
    };

    if (isOfflineMode || !serverOrder) {
      const newQueue = [...pendingSyncQueue, saleRecord];
      setPendingSyncQueue(newQueue);
      localStorage.setItem(`supermarket_pending_sales_${slug}`, JSON.stringify(newQueue));
    }

    // Set order for receipt and open receipt dialog
    setCompletedSaleOrder(saleRecord);
    setIsReceiptModalOpen(true);
    toast.success(`Venda #${saleRecord.orderNumber} finalizada com sucesso!`);

    // Reset register for next customer
    clearCartItems();
    clearDiscount();
    setMultiplier(1);
    setCpfOnSlip('');
    setCashGiven(0);
    setIsCheckoutModalOpen(false);
    setIsFinalizingSale(false);
  };

  /**
   * Versão texto do cupom — mesma informação do visor, em formato portátil.
   * Serve para compartilhar e para baixar, sem depender do layout em tela.
   */
  const buildReceiptText = () => {
    const o = completedSaleOrder;
    if (!o) return '';
    const line = '-'.repeat(48);
    const out: string[] = [];

    out.push(storeSettings?.storeName || 'SUPERMERCADO MODELO');
    if (storeSettings?.cnpj) out.push(`CNPJ: ${storeSettings.cnpj}`);
    if (storeSettings?.address) out.push(storeSettings.address);
    out.push(line);
    out.push(`CUPOM Nº ${String(o.orderNumber || '000').padStart(6, '0')}`);
    out.push(new Date(o.createdAt || Date.now()).toLocaleString('pt-BR'));
    out.push(line);

    (o.items || []).forEach((it: any, i: number) => {
      out.push(`${i + 1}. ${it.quantity}${it.unit} x ${it.name}`);
      out.push(
        `    ${formatCurrency(it.unitPriceCents)} un  =  ${formatCurrency(
          it.unitPriceCents * it.quantity,
        )}`,
      );
    });

    out.push(line);
    out.push(`SUBTOTAL: ${formatCurrency(o.rawSubtotal || 0)}`);
    if ((o.discountAmount || 0) > 0) {
      out.push(`DESCONTO: - ${formatCurrency(o.discountAmount)}`);
    }
    // Hoje o modelo Order não tem taxa de entrega; a linha aparece se existir.
    if ((o.deliveryFee || 0) > 0) {
      out.push(`TAXA DE ENTREGA: ${formatCurrency(o.deliveryFee)}`);
    }
    out.push(`TOTAL: ${formatCurrency(o.finalTotal || 0)}`);
    out.push(`PAGAMENTO: ${o.paymentMethod}`);

    if (o.cashGiven > 0) {
      out.push(`RECEBIDO: R$ ${o.cashGiven.toFixed(2).replace('.', ',')}`);
      out.push(`TROCO: R$ ${(o.changeDue || 0).toFixed(2).replace('.', ',')}`);
    }
    if (o.customerName) out.push(`CLIENTE (FIADO): ${o.customerName}`);
    if (o.cpf) out.push(`CPF NA NOTA: ${o.cpf}`);

    out.push(line);
    out.push(storeSettings?.receiptFooterMessage || 'Obrigado pela preferência! Volte sempre.');
    out.push(`Operador: ${o.operator || currentUser?.name || 'Caixa 01'}`);
    return out.join('\n');
  };

  /**
   * Compartilha o resumo. Usa a Web Share API quando existe (celular) e cai
   * para a área de transferência no desktop, onde não há share nativo.
   */
  const handleShareReceipt = async () => {
    const text = buildReceiptText();
    if (!text) return;
    const orderNumber = completedSaleOrder?.orderNumber ?? '';

    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({
          title: `Cupom ${orderNumber}`,
          text,
        });
        return;
      } catch {
        // Usuário cancelou o compartilhamento — não é erro, só não faz nada.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success('Resumo copiado. Cole onde quiser compartilhar.');
    } catch {
      toast.error('Não foi possível compartilhar este resumo.');
    }
  };

  /** Baixa o cupom como arquivo de texto. */
  const handleDownloadReceipt = () => {
    const text = buildReceiptText();
    if (!text) return;
    const orderNumber = String(completedSaleOrder?.orderNumber || '000').padStart(6, '0');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cupom-${orderNumber}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Cupom baixado.');
  };

  // Sync offline sales
  const handleSyncOfflineSales = async () => {
    if (pendingSyncQueue.length === 0) return;
    try {
      for (const sale of pendingSyncQueue) {
        await apiPost(`/tenant-app/${slug}/orders`, {
          items: sale.items.map((it: any) => ({
            productId: it.productId,
            quantity: it.quantity,
            // Vendas enfileiradas antes desta versão ainda podem ter
            // `unitPrice` em reais; o fallback cobre a migração da fila local.
            unitPrice: it.unitPriceCents ?? Math.round((it.unitPrice || 0) * 100),
          })),
          discountCents: sale.discountAmount || 0,
          paymentMethod: normalizePaymentMethod(sale.paymentMethod),
          notes: sale.cpf ? `CPF: ${sale.cpf}` : 'Venda Sincronizada Offline',
        });
      }
      setPendingSyncQueue([]);
      localStorage.removeItem(`supermarket_pending_sales_${slug}`);
      queryClient.invalidateQueries({ queryKey: ['supermarket-cash-register', slug] });
      queryClient.invalidateQueries({ queryKey: ['supermarket-products', slug] });
      toast.success('Sincronização concluída com sucesso! Todas as vendas pendentes foram transmitidas ao servidor.');
    } catch (err) {
      toast.error('Erro ao sincronizar vendas offline.');
    }
  };

  return (
    <div className="space-y-4 pb-12 select-none">
      {/* ─── Top Bar: Operador, Atalhos & Offline Strategy ─── */}
      <div className="bg-card rounded-2xl p-4 border border-border/80 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        {/* Left: Register info & Hotkeys hint */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-bold font-mono text-sm">
            PDV 01
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-foreground block">
                {cashRegisterData?.isOpen ? 'Caixa Aberto' : 'Caixa Livre'} • {currentUser?.name || 'Operador 01'}
              </span>
              {cashRegisterData?.isOpen === false ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Fechado
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Aberto
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
              <span>Saldo em gaveta: R$ {displayCashBalance.toFixed(2).replace('.', ',')}</span>
              {cashRegisterData?.isOpen === false && (
                <button
                  type="button"
                  onClick={() => setIsOpenRegisterModalOpen(true)}
                  className="text-emerald-700 hover:text-emerald-800 font-bold underline ml-1 cursor-pointer font-sans"
                >
                  Abrir Caixa Agora
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Middle: Shortcut Badges */}
        <div className="hidden xl:flex items-center gap-2">
          {[
            { key: 'F1', label: 'Ajuda' },
            { key: 'F2', label: 'Buscar' },
            { key: 'F3', label: 'Qtd' },
            { key: 'F4', label: 'Desconto' },
            { key: 'F7', label: 'Sangria' },
            { key: 'F10', label: 'Finalizar' },
          ].map((s) => (
            <span
              key={s.key}
              className="text-[11px] font-medium bg-muted text-foreground px-2 py-1 rounded-lg border border-border flex items-center gap-1 font-mono"
            >
              <strong className="text-foreground">{s.key}</strong> {s.label}
            </span>
          ))}
        </div>

        {/* Right: Offline / Online Strategy Toggle */}
        <div className="flex items-center gap-3">
          {pendingSyncQueue.length > 0 && (
            <Button
              size="sm"
              onClick={handleSyncOfflineSales}
              className="h-8 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-zinc-950 rounded-xl gap-1 shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Sincronizar {pendingSyncQueue.length} vendas
            </Button>
          )}

          <button
            type="button"
            onClick={() => setIsOfflineMode(!isOfflineMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
              isOfflineMode
                ? 'bg-amber-100 text-amber-900 border-amber-300 ring-2 ring-amber-300/40'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}
          >
            {isOfflineMode ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-700" />
                <span>Modo Offline Ativo</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                <span>Online (Conectado)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─── Main POS Layout (Two Columns) ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Side: Virtual Receipt / Item List (Col 8) */}
        <div className="lg:col-span-8 bg-card rounded-3xl p-5 border border-border/80 shadow-2xs flex flex-col justify-between min-h-[560px]">
          <div>
            {/* Slip Header */}
            <div className="flex items-center justify-between pb-3 border-b border-border mb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-muted-foreground" />
                <span className="font-bold text-sm text-foreground">Cupom Fiscal / Itens Registrados</span>
              </div>
              <span className="text-xs font-mono text-muted-foreground">
                {items.length} {items.length === 1 ? 'item' : 'itens'}
              </span>
            </div>

            {/* Table Header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 pb-2">
              <div className="col-span-1">Item</div>
              <div className="col-span-2">Código</div>
              <div className="col-span-5">Descrição</div>
              <div className="col-span-1 text-center">Qtd</div>
              <div className="col-span-1 text-right">Unit</div>
              <div className="col-span-2 text-right">Total (R$)</div>
            </div>

            {/* Line items container */}
            <div className="max-h-[380px] overflow-y-auto space-y-1.5 pr-1 font-mono text-xs">
              {items.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border rounded-2xl space-y-2">
                  <Barcode className="w-8 h-8 text-muted-foreground stroke-[1.5]" />
                  <span className="text-xs font-sans font-medium text-muted-foreground">
                    Aguardando bipe ou leitura de código de barras...
                  </span>
                  <span className="text-[11px] font-sans text-muted-foreground">
                    Dica: Teste bipando <code className="bg-muted px-1 py-0.5 rounded text-foreground">200123004509</code> (balança R$ 4,50) ou <code className="bg-muted px-1 py-0.5 rounded text-foreground">7891000100101</code> (arroz)
                  </span>
                </div>
              ) : (
                items.map((item, index) => (
                  <div
                    key={index}
                    className="p-2.5 rounded-xl bg-muted/70 hover:bg-muted/80 border border-border/60 transition group flex flex-col sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center"
                  >
                    <div className="flex items-center justify-between sm:contents">
                      <div className="hidden sm:block sm:col-span-1 text-muted-foreground font-bold">
                        {String(index + 1).padStart(3, '0')}
                      </div>
                      <div className="hidden sm:block sm:col-span-2 text-muted-foreground truncate text-[11px]">
                        {item.barcode}
                      </div>
                      <div className="sm:col-span-5 font-bold text-foreground truncate flex items-center gap-1.5 font-sans min-w-0 pr-2">
                        {item.isWeighable && (
                          <span title="Item Pesável de Balança">
                            <Scale className="w-3 h-3 text-amber-600 shrink-0" />
                          </span>
                        )}
                        <span className="truncate">{item.name}</span>
                      </div>
                      <div className="text-right sm:text-center font-bold text-foreground sm:col-span-1 shrink-0">
                        {item.quantity} {item.unit}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1 sm:mt-0 sm:contents pt-1 sm:pt-0 border-t sm:border-0 border-border/30">
                      <div className="sm:col-span-1 sm:text-right text-muted-foreground text-[11px]">
                        {formatCurrency(item.unitPriceCents)}
                      </div>
                      <div className="sm:col-span-2 text-right font-bold text-foreground flex items-center justify-end gap-1.5">
                        <span>{formatCurrency(lineTotalCents(item))}</span>
                        <button
                          type="button"
                          onClick={() => handleRequestRemoveItem(index)}
                          title="Cancelar este item (requer PIN da gerência)"
                          className="opacity-80 sm:opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-700 p-0.5 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Slip Bottom: Barcode Scanner Input */}
          <div className="pt-4 border-t border-border space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={barcodeInputRef}
                  placeholder={
                    multiplier > 1
                      ? `Multiplicador ${multiplier}x ativo — Digite ou bipe o código...`
                      : 'Bipe o código de barras ou digite o código do produto...'
                  }
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleProcessBarcode();
                    }
                  }}
                  className="pl-9 h-11 text-sm font-mono rounded-2xl bg-muted border-border focus:bg-card transition"
                />
              </div>

              <Button
                onClick={() => handleProcessBarcode()}
                className="h-11 px-5 bg-primary text-primary-foreground rounded-2xl font-bold text-xs hover:bg-primary/90"
              >
                Lançar
              </Button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1 font-mono">
              <span>F3 Multiplicador: {multiplier}x</span>
              <span>F4 Desconto: {discountPercent}%</span>
              <span>Pressione F10 para fechar cupom</span>
            </div>
          </div>
        </div>

        {/* Right Side: Totals & Direct Actions (Col 4) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Big Total Card */}
          <div className="bg-primary text-primary-foreground rounded-3xl p-6 border border-border shadow-md flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
                <span>SUBTOTAL</span>
                <span className="font-mono">{formatCurrency(rawSubtotal)}</span>
              </div>

              {discountPercent > 0 && (
                <div className="flex items-center justify-between text-amber-400 text-xs mb-1">
                  <span>DESCONTO ({discountPercent}%)</span>
                  <span className="font-mono">- {formatCurrency(discountAmount)}</span>
                </div>
              )}

              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold block mt-4">
                Total a Pagar
              </span>
              <p className="text-4xl font-extrabold font-mono text-white mt-0.5 tracking-tight">
                {formatCurrency(finalTotal)}
              </p>
            </div>

            <Button
              disabled={items.length === 0}
              onClick={() => setIsCheckoutModalOpen(true)}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-extrabold text-sm rounded-2xl h-12 mt-6 shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>FINALIZAR VENDA (F10)</span>
            </Button>
          </div>

          {/* Quick Actions Panel */}
          <div className="bg-card rounded-3xl p-5 border border-border/80 shadow-2xs space-y-2.5">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-1">
              Atalhos Rápidos
            </span>

            <Button
              variant="outline"
              onClick={() => setIsSearchProductOpen(true)}
              className="w-full justify-between h-9 text-xs font-semibold rounded-xl text-foreground bg-muted/50 hover:bg-muted"
            >
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Consultar Produto sem Código</span>
              </div>
              <span className="font-mono font-bold text-muted-foreground text-[10px]">F2</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => setIsQuantityModalOpen(true)}
              className="w-full justify-between h-9 text-xs font-semibold rounded-xl text-foreground bg-muted/50 hover:bg-muted"
            >
              <div className="flex items-center gap-2">
                <Keyboard className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Multiplicador de Quantidade ({multiplier}x)</span>
              </div>
              <span className="font-mono font-bold text-muted-foreground text-[10px]">F3</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => setIsDiscountModalOpen(true)}
              className="w-full justify-between h-9 text-xs font-semibold rounded-xl text-foreground bg-muted/50 hover:bg-muted"
            >
              <div className="flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Aplicar Desconto no Total</span>
              </div>
              <span className="font-mono font-bold text-muted-foreground text-[10px]">F4</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => setIsSangriaModalOpen(true)}
              className="w-full justify-between h-9 text-xs font-semibold rounded-xl text-amber-700 bg-amber-50/50 border-amber-200 hover:bg-amber-100/60"
            >
              <div className="flex items-center gap-2">
                <ArrowDownCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Sangria / Suprimento de Caixa</span>
              </div>
              <span className="font-mono font-bold text-amber-700 text-[10px]">F7</span>
            </Button>

            <Button
              variant="outline"
              onClick={() => setIsHelpOpen(true)}
              className="w-full justify-between h-9 text-xs font-semibold rounded-xl text-muted-foreground bg-transparent hover:bg-muted"
            >
              <div className="flex items-center gap-2">
                <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Manual de Teclas de Atalho</span>
              </div>
              <span className="font-mono font-bold text-muted-foreground text-[10px]">F1</span>
            </Button>

            <Button
              variant="outline"
              disabled={items.length === 0}
              onClick={() => setIsManagerPinModalOpen(true)}
              className="w-full justify-between h-9 text-xs font-semibold rounded-xl text-rose-700 bg-rose-50/50 border-rose-200 hover:bg-rose-100/60 disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>Cancelar Venda Atual (PIN Gerente)</span>
              </div>
              <span className="font-mono font-bold text-rose-700 text-[10px]">Esc</span>
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Modal F1: Ajuda de Atalhos ─── */}
      <Dialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
        <DialogContent className="max-w-md bg-card rounded-3xl p-6 border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-muted-foreground" />
              Atalhos do Teclado no PDV Universal
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Projetado para operar em velocidade máxima sem uso do mouse
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-3 text-xs">
            {[
              { key: 'F1', desc: 'Abre este manual de ajuda' },
              { key: 'F2', desc: 'Consulta rápida de itens no catálogo' },
              { key: 'F3', desc: 'Define quantidade para o próximo produto' },
              { key: 'F4', desc: 'Aplica desconto no cupom atual' },
              { key: 'F7', desc: 'Efetua sangria ou suprimento na gaveta' },
              { key: 'F10', desc: 'Abre a tela de pagamento e emissão fiscal' },
              { key: 'Enter', desc: 'Confirma o código de barras digitado' },
            ].map((shortcut) => (
              <div
                key={shortcut.key}
                className="flex items-center justify-between p-2 rounded-xl bg-muted border border-border/80"
              >
                <kbd className="font-mono font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded text-[11px]">
                  {shortcut.key}
                </kbd>
                <span className="text-foreground font-medium">{shortcut.desc}</span>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button
              size="sm"
              onClick={() => setIsHelpOpen(false)}
              className="w-full bg-primary text-primary-foreground rounded-xl text-xs font-bold"
            >
              Entendido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal F2: Consulta Rápida de Produtos ─── */}
      <Dialog open={isSearchProductOpen} onOpenChange={setIsSearchProductOpen}>
        <DialogContent className="max-w-xl bg-card rounded-3xl p-6 border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground" />
              Busca Rápida de Produto (F2)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Input
              placeholder="Digite o nome do produto..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="h-9 text-xs rounded-xl"
              autoFocus
            />

            <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
              {catalogList.filter((p: any) =>
                p.name.toLowerCase().includes(searchFilter.toLowerCase())
              ).map((p: any) => (
                <div
                  key={p.id}
                  onClick={() => {
                    handleProcessBarcode(p.barcode);
                    setIsSearchProductOpen(false);
                    setSearchFilter('');
                  }}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-muted hover:bg-muted border border-border/70 cursor-pointer transition"
                >
                  <div>
                    <span className="font-bold text-xs text-foreground block">{p.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      EAN: {p.barcode} • Cód: {p.internalCode}
                    </span>
                  </div>
                  <span className="font-mono font-bold text-xs text-foreground">
                    R$ {p.price.toFixed(2).replace('.', ',')} / {p.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Modal F3: Multiplicador de Quantidade ─── */}
      <Dialog open={isQuantityModalOpen} onOpenChange={setIsQuantityModalOpen}>
        <DialogContent className="max-w-xs bg-card rounded-3xl p-6 border-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground">
              Alterar Quantidade (F3)
            </DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <Label className="text-xs text-muted-foreground mb-1 block">Quantidade do próximo item:</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={multiplier}
              onChange={(e) => setMultiplier(Math.max(1, Number(e.target.value)))}
              className="h-10 text-center font-mono font-bold text-base rounded-xl"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') setIsQuantityModalOpen(false);
              }}
            />
          </div>

          <DialogFooter>
            <Button
              size="sm"
              onClick={() => setIsQuantityModalOpen(false)}
              className="w-full bg-primary text-primary-foreground rounded-xl text-xs font-bold"
            >
              Definir Multiplicador
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal F4: Desconto ─── */}
      <Dialog open={isDiscountModalOpen} onOpenChange={setIsDiscountModalOpen}>
        <DialogContent className="max-w-xs bg-card rounded-3xl p-6 border-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground">
              Aplicar Desconto (F4)
            </DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <Label className="text-xs text-muted-foreground mb-1 block">Desconto em %:</Label>
            <Input
              type="number"
              min={0}
              max={50}
              value={discountPercent}
              onChange={(e) => applyPercentDiscount(Math.max(0, Math.min(50, Number(e.target.value))))}
              className="h-10 text-center font-mono font-bold text-base rounded-xl"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') setIsDiscountModalOpen(false);
              }}
            />
          </div>

          <DialogFooter>
            <Button
              size="sm"
              onClick={() => setIsDiscountModalOpen(false)}
              className="w-full bg-primary text-primary-foreground rounded-xl text-xs font-bold"
            >
              Aplicar Desconto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal F7: Sangria / Suprimento ─── */}
      <Dialog open={isSangriaModalOpen} onOpenChange={setIsSangriaModalOpen}>
        <DialogContent className="max-w-md bg-card rounded-3xl p-6 border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <ArrowDownCircle className="w-4 h-4 text-amber-600" />
              Movimentação de Gaveta (F7)
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Registre sangrias para o cofre ou suprimento de troco
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSangriaType('SANGRIA')}
                className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  sangriaType === 'SANGRIA'
                    ? 'bg-amber-100 text-amber-900 border-amber-400'
                    : 'bg-muted text-muted-foreground border-border'
                }`}
              >
                <ArrowDownCircle className="w-3.5 h-3.5" /> Sangria (Retirada)
              </button>

              <button
                type="button"
                onClick={() => setSangriaType('SUPRIMENTO')}
                className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                  sangriaType === 'SUPRIMENTO'
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
                    : 'bg-muted text-muted-foreground border-border'
                }`}
              >
                <ArrowUpCircle className="w-3.5 h-3.5" /> Suprimento (Entrada)
              </button>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Valor da Operação (R$)</Label>
              <Input
                type="number"
                step="10.00"
                value={sangriaAmount}
                onChange={(e) => setSangriaAmount(Number(e.target.value))}
                className="h-9 text-xs rounded-xl font-mono"
              />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Motivo / Justificativa</Label>
              <Input
                value={sangriaReason}
                onChange={(e) => setSangriaReason(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>

            <div className="p-3 bg-muted rounded-xl border border-border text-xs text-muted-foreground">
              <span>Saldo Atual da Gaveta: </span>
              <strong className="font-mono text-foreground">
                R$ {cashRegisterBalance.toFixed(2).replace('.', ',')}
              </strong>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSangriaModalOpen(false)}
              className="text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmSangria}
              className="bg-primary text-primary-foreground text-xs font-bold rounded-xl"
            >
              Confirmar Lançamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal F10: Finalizar Venda & Pagamento (Com Fiado & Limite) ─── */}
      <Dialog open={isCheckoutModalOpen} onOpenChange={setIsCheckoutModalOpen}>
        <DialogContent className="max-w-lg bg-card rounded-3xl p-6 border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-600 fill-emerald-600" />
              Finalizar Venda & Pagamento
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Total display */}
            <div className="p-4 bg-primary text-primary-foreground rounded-2xl flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Total do Cupom</span>
              <span className="text-2xl font-bold font-mono text-emerald-400">
                {formatCurrency(finalTotal)}
              </span>
            </div>

            {/* CPF na Nota */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">CPF na Nota (Opcional)</Label>
              <Input
                placeholder="000.000.000-00"
                value={cpfOnSlip}
                onChange={(e) => setCpfOnSlip(e.target.value)}
                className="h-9 text-xs rounded-xl font-mono"
              />
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Forma de Pagamento</Label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {[
                  { id: 'DINHEIRO', label: 'Dinheiro', icon: DollarSign },
                  { id: 'PIX', label: 'PIX', icon: QrCode },
                  { id: 'CARTAO_DEBITO', label: 'Débito', icon: CreditCard },
                  { id: 'CARTAO_CREDITO', label: 'Crédito', icon: CreditCard },
                  { id: 'VALE', label: 'Vale Alim.', icon: Receipt },
                  { id: 'FIADO', label: 'Fiado', icon: UserCheck },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`p-2 rounded-xl border text-[11px] font-bold flex flex-col items-center gap-1 transition ${
                      paymentMethod === m.id
                        ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                        : 'bg-card text-muted-foreground border-border hover:bg-muted'
                    }`}
                  >
                    <m.icon className="w-3.5 h-3.5" />
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Dinheiro: Calculadora Inteligente de Troco */}
            {paymentMethod === 'DINHEIRO' && (
              <div className="p-3.5 bg-muted rounded-2xl border border-border/80 space-y-3">
                {/* Header & Inputs */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <Label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <Banknote className="w-4 h-4 text-emerald-600" />
                      Valor Recebido do Cliente (R$)
                    </Label>
                    {cashGiven > 0 && (
                      <button
                        type="button"
                        onClick={() => setCashGiven(0)}
                        className="text-[11px] text-muted-foreground hover:text-foreground underline font-medium cursor-pointer"
                      >
                        Limpar valor
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-muted-foreground">
                        R$
                      </span>
                      <Input
                        type="number"
                        step="0.50"
                        placeholder="0,00"
                        value={cashGiven || ''}
                        onChange={(e) => setCashGiven(Math.max(0, Number(e.target.value)))}
                        className="pl-9 h-11 text-base rounded-xl font-mono font-bold bg-card border-border focus:bg-card"
                        autoFocus
                      />
                    </div>

                    {/* Change Display Status Box */}
                    <div
                      className={`p-2.5 rounded-xl border flex flex-col justify-center px-3 font-mono transition ${
                        smartChange.isShort
                          ? 'bg-rose-50 border-rose-200 text-rose-800'
                          : smartChange.isExact
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : cashGivenCents > finalTotal
                          ? 'bg-emerald-100/70 border-emerald-300 text-emerald-950 shadow-2xs'
                          : 'bg-muted border-border text-muted-foreground'
                      }`}
                    >
                      <span className="text-[10px] uppercase font-bold tracking-wider font-sans">
                        {smartChange.isShort
                          ? 'Valor Insuficiente'
                          : smartChange.isExact
                          ? 'Total Exato'
                          : cashGivenCents > finalTotal
                          ? 'Troco a Devolver'
                          : 'Aguardando Dinheiro'}
                      </span>
                      <span className="text-lg font-extrabold leading-tight">
                        {smartChange.isShort
                          ? `Falta R$ ${(smartChange.shortCents / 100).toFixed(2).replace('.', ',')}`
                          : smartChange.isExact
                          ? 'R$ 0,00 (Sem troco)'
                          : `R$ ${(smartChange.changeCents / 100).toFixed(2).replace('.', ',')}`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sugestões Rápidas de Notas */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Sugestões Rápidas:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPresets.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCashGiven(preset.amount)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition cursor-pointer ${
                          cashGiven === preset.amount
                            ? 'bg-primary text-primary-foreground border-primary shadow-2xs'
                            : 'bg-card hover:bg-muted text-foreground border-border'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Somar Cédulas Recebidas (+R$ 2, +R$ 5, +R$ 10...) */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Somar Cédulas Físicas:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {[2, 5, 10, 20, 50, 100, 200].map((note) => (
                      <button
                        key={note}
                        type="button"
                        onClick={() => setCashGiven((prev) => Number((prev + note).toFixed(2)))}
                        className="px-2 py-0.5 rounded-lg text-[11px] font-mono font-semibold bg-card hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 border border-border text-muted-foreground transition cursor-pointer"
                      >
                        +R$ {note}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Decomposição do Troco: Notas e Moedas da Gaveta */}
                {smartChange.breakdown.length > 0 && (
                  <div className="p-2.5 bg-card rounded-xl border border-emerald-200 space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between text-[11px] font-bold text-emerald-900">
                      <span className="flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-emerald-600" />
                        Composição do Troco (Pegar na Gaveta):
                      </span>
                      <span className="font-mono text-emerald-700">
                        {smartChange.breakdown.reduce((acc, item) => acc + item.count, 0)} itens
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {smartChange.breakdown.map((item, idx) => (
                        <span
                          key={idx}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold border ${
                            item.type === 'BILL'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}
                        >
                          <span className="font-sans text-[10px] opacity-75">
                            {item.count}x
                          </span>
                          <span>{item.label}</span>
                          <span className="text-[9px] font-sans text-muted-foreground font-normal">
                            ({item.type === 'BILL' ? 'nota' : 'moeda'})
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dica Inteligente de Troco Facilitado */}
                {smartChange.smartTip && (
                  <div className="p-2.5 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block">💡 Dica de Troco Facilitado:</span>
                      <p className="text-[11px] text-amber-800 mt-0.5 leading-snug">
                        {smartChange.smartTip.explanation}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* FIADO: Customer selection + Credit limit verification */}
            {paymentMethod === 'FIADO' && (
              <div className="p-3.5 bg-amber-50/70 rounded-2xl border border-amber-200/80 space-y-3">
                <Label className="text-xs font-bold text-amber-900">
                  Selecionar Conta do Cliente (Fiado)
                </Label>

                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger className="h-9 text-xs rounded-xl bg-card border-amber-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {customerList.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.cpf ? `(CPF: ${c.cpf})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Credit Limit Verification Box */}
                <div className="p-2.5 bg-card rounded-xl border border-amber-200 text-xs space-y-1 font-mono">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Limite Total Aprovado:</span>
                    <span>R$ {creditCheck.creditLimit.toFixed(2).replace('.', ',')}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Dívida Atual em Aberto:</span>
                    <span>R$ {creditCheck.currentDebt.toFixed(2).replace('.', ',')}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Crédito Disponível:</span>
                    <span>R$ {creditCheck.availableCredit.toFixed(2).replace('.', ',')}</span>
                  </div>

                  {!creditCheck.allowed && (
                    <div className="pt-2 border-t border-rose-200 text-rose-700 font-sans font-bold text-xs flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>
                        Limite Excedido em R$ {creditCheck.exceededBy.toFixed(2).replace('.', ',')}! Venda bloqueada.
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCheckoutModalOpen(false)}
              className="text-xs rounded-xl"
            >
              Voltar
            </Button>
            <Button
              size="sm"
              disabled={
                (paymentMethod === 'FIADO' && !creditCheck.allowed) ||
                (paymentMethod === 'DINHEIRO' && (cashGiven === 0 || smartChange.isShort)) ||
                isFinalizingSale
              }
              onClick={handleFinalizeSale}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isFinalizingSale ? 'Emitindo...' : 'Confirmar e Emitir Cupom'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Abertura de Caixa ─── */}
      <Dialog open={isOpenRegisterModalOpen} onOpenChange={setIsOpenRegisterModalOpen}>
        <DialogContent className="max-w-sm bg-card rounded-3xl p-6 border-border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Abertura de Caixa
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Informe o fundo de troco inicial para abrir o turno deste PDV.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Fundo de Troco Inicial (R$)</Label>
              <Input
                type="number"
                step="10.00"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(Number(e.target.value))}
                className="h-9 text-xs rounded-xl font-mono"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Observações (Opcional)</Label>
              <Input
                placeholder="Ex: Turno da manhã, Caixa 01"
                value={openingNotes}
                onChange={(e) => setOpeningNotes(e.target.value)}
                className="h-9 text-xs rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOpenRegisterModalOpen(false)}
              className="text-xs rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={isOpeningRegister}
              onClick={handleOpenCashRegister}
              className="bg-primary text-primary-foreground text-xs font-bold rounded-xl"
            >
              {isOpeningRegister ? 'Abrindo...' : 'Confirmar Abertura'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal PIN do Gerente (Cancelamento de Venda) ─── */}
      <Dialog open={isManagerPinModalOpen} onOpenChange={setIsManagerPinModalOpen}>
        <DialogContent className="max-w-xs bg-card rounded-3xl p-6 border-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4 text-rose-600" />
              Autorização do Gerente
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Insira o PIN de 4 dígitos do gerente para cancelar o cupom atual.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">PIN do Gerente</Label>
              <Input
                type="password"
                maxLength={6}
                placeholder="••••"
                value={managerPin}
                onChange={(e) => setManagerPin(e.target.value)}
                className="h-10 text-center font-mono text-lg tracking-widest rounded-xl"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAuthorizeCancelCart();
                }}
              />
            </div>
          </div>

          <DialogFooter className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsManagerPinModalOpen(false);
                setManagerPin('');
              }}
              className="text-xs rounded-xl"
            >
              Voltar
            </Button>
            <Button
              size="sm"
              disabled={!managerPin || isAuthorizingManager}
              onClick={handleAuthorizeCancelCart}
              className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl"
            >
              {isAuthorizingManager ? 'Validando...' : 'Cancelar Venda'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal PIN do Gerente para Cancelar Item Específico ─── */}
      <Dialog open={isRemoveItemModalOpen} onOpenChange={setIsRemoveItemModalOpen}>
        <DialogContent className="max-w-xs bg-card rounded-3xl p-6 border-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600" />
              Cancelar Item
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {itemIndexToRemove !== null && items[itemIndexToRemove] ? (
                <>Deseja cancelar o item <strong>{items[itemIndexToRemove].name}</strong>? Insira o PIN do gerente para autorizar.</>
              ) : (
                'Insira o PIN do gerente para autorizar o cancelamento do item.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">PIN do Gerente</Label>
              <Input
                type="password"
                maxLength={6}
                placeholder="••••"
                value={removeItemPin}
                onChange={(e) => setRemoveItemPin(e.target.value)}
                className="h-10 text-center font-mono text-lg tracking-widest rounded-xl"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAuthorizeRemoveItem();
                }}
              />
            </div>
          </div>

          <DialogFooter className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsRemoveItemModalOpen(false);
                setRemoveItemPin('');
                setItemIndexToRemove(null);
              }}
              className="text-xs rounded-xl"
            >
              Voltar
            </Button>
            <Button
              size="sm"
              disabled={!removeItemPin || isAuthorizingRemoveItem}
              onClick={handleAuthorizeRemoveItem}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl"
            >
              {isAuthorizingRemoveItem ? 'Validando...' : 'Excluir Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Modal Cupom Térmico / Impressão de Recibo ─── */}
      <Dialog open={isReceiptModalOpen} onOpenChange={setIsReceiptModalOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-sm max-h-[92dvh] overflow-y-auto bg-card rounded-3xl p-4 sm:p-6 border-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Printer className="w-4 h-4 text-muted-foreground" />
              Comprovante da Venda / Cupom Térmico
            </DialogTitle>
          </DialogHeader>

          {/* Printable thermal receipt view */}
          <div className="bg-muted border border-dashed border-border p-4 rounded-xl font-mono text-[11px] text-foreground space-y-2 leading-tight select-text">
            {ThermalReceiptBody()}
          </div>

          {/* Botões com área de toque confortável (h-11): o operador usa isso
              no celular, entre um atendimento e outro. */}
          <DialogFooter className="grid grid-cols-2 gap-2 pt-2">
            <Button
              size="sm"
              onClick={() => {
                setIsPrintingReceipt(true);
                // Dois rAF: garante que a cópia do cupom já foi movida para o
                // <body> antes de abrir o diálogo nativo de impressão.
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    window.print();
                    setIsPrintingReceipt(false);
                  });
                });
              }}
              className="h-11 bg-primary text-primary-foreground text-xs font-bold rounded-xl gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              Imprimir
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleShareReceipt}
              className="h-11 text-xs font-bold rounded-xl gap-1.5"
            >
              <Share2 className="w-3.5 h-3.5" />
              Compartilhar
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadReceipt}
              className="h-11 text-xs font-bold rounded-xl gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Baixar
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsReceiptModalOpen(false);
                barcodeInputRef.current?.focus();
              }}
              className="h-11 text-xs font-bold rounded-xl gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Fechar e voltar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cópia impressa do cupom: fora do <Dialog>, direto no <body>, para o
          navegador imprimir o cupom inteiro em vez de cortar no primeiro
          item. O portal só existe durante o window.print(). */}
      {isPrintingReceipt && typeof document !== 'undefined'
        ? createPortal(
            <div
              id="thermal-receipt-host"
              className="hidden print:block bg-white font-mono text-[11px] text-black leading-tight"
            >
              <div id="thermal-receipt">{ThermalReceiptBody()}</div>
            </div>,
            document.body,
          )
        : null}

      {/* Thermal Print CSS.
          O cupom é impresso a partir de #thermal-receipt-host, um contêiner
          direto no <body> (ver o portal acima), porque o <Dialog> usa
          position:fixed e cortava o conteúdo longo na primeira página.
          visibility + display:none juntos: só visibility reserva o espaço
          ocupado pelo conteúdo escondido e saem páginas em branco. */}
      <style>{`
        @media print {
          @page { margin: 6mm; }

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

          #thermal-receipt-host,
          #thermal-receipt-host * {
            visibility: visible !important;
          }

          body *:not(#thermal-receipt-host):not(#thermal-receipt-host *) {
            display: none !important;
          }

          #thermal-receipt-host {
            display: block !important;
          }

          #thermal-receipt {
            position: static !important;
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
            padding: 2mm !important;
            background: white !important;
            color: black !important;
            border: none !important;
            border-radius: 0 !important;
            font-size: 11px !important;
            box-shadow: none !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
          }

          #thermal-receipt .receipt-item {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};
