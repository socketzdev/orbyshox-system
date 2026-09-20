import React, { createContext, useContext, useState, useEffect } from 'react';
import { JapaneseProduct, JAPANESE_PRODUCTS } from '../japanese-data';

export interface JapaneseCartLine {
  id: string;
  product: JapaneseProduct;
  quantity: number;
  sauces: string[];
  cutlery: string;
  extras: string[];
  notes: string;
  unitPriceCents: number;
  totalPriceCents: number;
}

export interface PlacedOrder {
  id: string;
  orderNumber: string;
  createdAt: string;
  items: JapaneseCartLine[];
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  address: {
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
  };
  needCutlery: boolean;
  scheduleType: 'asap' | 'scheduled';
  scheduledTime?: string;
  paymentMethod: 'pix' | 'credit_card' | 'cash';
  status: 'received' | 'preparing' | 'on_the_way' | 'delivered';
  courier: {
    name: string;
    phone: string;
    vehicle: string;
    plate: string;
    rating: number;
    avatar: string;
  };
}

export interface JapaneseAddress {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  label: string;
}

interface JapaneseContextType {
  cart: JapaneseCartLine[];
  addToCart: (
    product: JapaneseProduct,
    quantity: number,
    options?: {
      sauces?: string[];
      cutlery?: string;
      extras?: string[];
      notes?: string;
      extraPriceCents?: number;
    }
  ) => void;
  updateQuantity: (cartId: string, delta: number) => void;
  removeFromCart: (cartId: string) => void;
  clearCart: () => void;
  cartCount: number;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  activeTab: 'home' | 'favorites' | 'cart' | 'profile';
  setActiveTab: (tab: 'home' | 'favorites' | 'cart' | 'profile') => void;
  favorites: string[];
  toggleFavorite: (productId: string) => void;
  isFavorite: (productId: string) => boolean;
  selectedProduct: JapaneseProduct | null;
  setSelectedProduct: (product: JapaneseProduct | null) => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  isCheckoutOpen: boolean;
  setIsCheckoutOpen: (open: boolean) => void;
  activeOrder: PlacedOrder | null;
  setActiveOrder: (order: PlacedOrder | null) => void;
  orderHistory: PlacedOrder[];
  deliveryAddress: JapaneseAddress;
  setDeliveryAddress: React.Dispatch<React.SetStateAction<JapaneseAddress>>;
  needCutlery: boolean;
  setNeedCutlery: (need: boolean) => void;
  scheduleType: 'asap' | 'scheduled';
  setScheduleType: (st: 'asap' | 'scheduled') => void;
  scheduledTime: string;
  setScheduledTime: (time: string) => void;
  paymentMethod: 'pix' | 'credit_card' | 'cash';
  setPaymentMethod: (pm: 'pix' | 'credit_card' | 'cash') => void;
  couponCode: string;
  appliedCoupon: string | null;
  applyCoupon: (code: string) => boolean;
  removeCoupon: () => void;
  placeOrder: () => PlacedOrder;
  restaurantName: string;
}

const JapaneseCartContext = createContext<JapaneseContextType | null>(null);

const STORAGE_KEY_CART = 'minami_sushi_cart';
const STORAGE_KEY_FAVS = 'minami_sushi_favorites';
const STORAGE_KEY_ORDERS = 'minami_sushi_orders';

export const JapaneseCartProvider: React.FC<{
  children: React.ReactNode;
  initialRestaurantName?: string;
}> = ({ children, initialRestaurantName = 'MINAMI' }) => {
  const [cart, setCart] = useState<JapaneseCartLine[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CART);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FAVS);
      return saved ? JSON.parse(saved) : ['prod-philadelphia-luxe', 'prod-emerald-line'];
    } catch {
      return ['prod-philadelphia-luxe', 'prod-emerald-line'];
    }
  });

  const [activeTab, setActiveTab] = useState<'home' | 'favorites' | 'cart' | 'profile'>('home');
  const [selectedProduct, setSelectedProduct] = useState<JapaneseProduct | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<PlacedOrder | null>(null);

  const [deliveryAddress, setDeliveryAddress] = useState<JapaneseAddress>({
    street: 'Rua Oscar Freire',
    number: '1420',
    complement: 'Apto 102',
    neighborhood: 'Cerqueira César',
    city: 'São Paulo - SP',
    label: 'Casa',
  });

  const [needCutlery, setNeedCutlery] = useState(true);
  const [scheduleType, setScheduleType] = useState<'asap' | 'scheduled'>('asap');
  const [scheduledTime, setScheduledTime] = useState('19:45');
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'credit_card' | 'cash'>('pix');
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);

  const [orderHistory, setOrderHistory] = useState<PlacedOrder[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_ORDERS);
      if (saved) return JSON.parse(saved);
    } catch {}
    // default demo past order
    return [
      {
        id: 'ord-hist-1',
        orderNumber: '#MN-4821',
        createdAt: 'Ontem às 20:42',
        items: [
          {
            id: 'item-prev-1',
            product: JAPANESE_PRODUCTS[1], // Emerald Line
            quantity: 2,
            sauces: ['Shoyu Tradicional'],
            cutlery: 'Par de Hashis',
            extras: [],
            notes: 'Caprichar no gengibre por favor',
            unitPriceCents: 4990,
            totalPriceCents: 9980,
          },
          {
            id: 'item-prev-2',
            product: JAPANESE_PRODUCTS[2], // Philadelphia Luxe
            quantity: 1,
            sauces: ['Tarê artesanal'],
            cutlery: 'Par de Hashis',
            extras: [],
            notes: '',
            unitPriceCents: 4590,
            totalPriceCents: 4590,
          },
        ],
        subtotalCents: 14570,
        deliveryFeeCents: 800,
        discountCents: 0,
        totalCents: 15370,
        address: {
          street: 'Rua Oscar Freire',
          number: '1420',
          neighborhood: 'Cerqueira César',
          city: 'São Paulo - SP',
        },
        needCutlery: true,
        scheduleType: 'asap',
        paymentMethod: 'pix',
        status: 'delivered',
        courier: {
          name: 'Carlos Silva',
          phone: '(11) 98765-4321',
          vehicle: 'Honda CG 160 Fan',
          plate: 'BRA2E19',
          rating: 4.9,
          avatar: '/templates/japanese/assets/piece-salmon-nigiri.jpg',
        },
      },
    ];
  });

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(cart));
    } catch {}
  }, [cart]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_FAVS, JSON.stringify(favorites));
    } catch {}
  }, [favorites]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ORDERS, JSON.stringify(orderHistory));
    } catch {}
  }, [orderHistory]);

  const addToCart = (
    product: JapaneseProduct,
    quantity: number,
    options: {
      sauces?: string[];
      cutlery?: string;
      extras?: string[];
      notes?: string;
      extraPriceCents?: number;
    } = {}
  ) => {
    const extraPrice = options.extraPriceCents || 0;
    const unitPrice = product.priceCents + extraPrice;
    const lineId = `${product.id}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    const newLine: JapaneseCartLine = {
      id: lineId,
      product,
      quantity,
      sauces: options.sauces || ['Shoyu Tradicional'],
      cutlery: options.cutlery || 'Par de Hashis de Bambu',
      extras: options.extras || [],
      notes: options.notes || '',
      unitPriceCents: unitPrice,
      totalPriceCents: unitPrice * quantity,
    };

    setCart(prev => [...prev, newLine]);
  };

  const updateQuantity = (cartId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.id === cartId) {
            const nextQty = item.quantity + delta;
            if (nextQty <= 0) return null;
            return {
              ...item,
              quantity: nextQty,
              totalPriceCents: item.unitPriceCents * nextQty,
            };
          }
          return item;
        })
        .filter(Boolean) as JapaneseCartLine[]
    );
  };

  const removeFromCart = (cartId: string) => {
    setCart(prev => prev.filter(i => i.id !== cartId));
  };

  const clearCart = () => {
    setCart([]);
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCents = cart.reduce((sum, item) => sum + item.totalPriceCents, 0);
  const deliveryFeeCents = subtotalCents > 15000 || cartCount === 0 ? 0 : 800; // Frete grátis acima de R$ 150
  const discountCents = appliedCoupon === 'MINAMI20' ? Math.round(subtotalCents * 0.2) : 0;
  const totalCents = Math.max(0, subtotalCents + deliveryFeeCents - discountCents);

  const toggleFavorite = (productId: string) => {
    setFavorites(prev =>
      prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
    );
  };

  const isFavorite = (productId: string) => favorites.includes(productId);

  const applyCoupon = (code: string) => {
    const clean = code.trim().toUpperCase();
    if (clean === 'MINAMI20' || clean === 'SUSHI20') {
      setAppliedCoupon('MINAMI20');
      return true;
    }
    return false;
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
  };

  const placeOrder = (): PlacedOrder => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const newOrder: PlacedOrder = {
      id: `ord-${Date.now()}`,
      orderNumber: `#MN-${randomNum}`,
      createdAt: 'Hoje às ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      items: [...cart],
      subtotalCents,
      deliveryFeeCents,
      discountCents,
      totalCents,
      address: {
        street: deliveryAddress.street,
        number: deliveryAddress.number,
        complement: deliveryAddress.complement,
        neighborhood: deliveryAddress.neighborhood,
        city: deliveryAddress.city,
      },
      needCutlery,
      scheduleType,
      scheduledTime: scheduleType === 'scheduled' ? scheduledTime : undefined,
      paymentMethod,
      status: 'received',
      courier: {
        name: 'Carlos Silva',
        phone: '(11) 98765-4321',
        vehicle: 'Honda CG 160 Fan',
        plate: 'BRA2E19',
        rating: 4.9,
        avatar: '/templates/japanese/assets/piece-salmon-nigiri.jpg',
      },
    };

    setOrderHistory(prev => [newOrder, ...prev]);
    setActiveOrder(newOrder);
    clearCart();
    setIsCheckoutOpen(false);
    setIsCartOpen(false);
    return newOrder;
  };

  return (
    <JapaneseCartContext.Provider
      value={{
        cart,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        cartCount,
        subtotalCents,
        deliveryFeeCents,
        discountCents,
        totalCents,
        activeTab,
        setActiveTab,
        favorites,
        toggleFavorite,
        isFavorite,
        selectedProduct,
        setSelectedProduct,
        isCartOpen,
        setIsCartOpen,
        isCheckoutOpen,
        setIsCheckoutOpen,
        activeOrder,
        setActiveOrder,
        orderHistory,
        deliveryAddress,
        setDeliveryAddress,
        needCutlery,
        setNeedCutlery,
        scheduleType,
        setScheduleType,
        scheduledTime,
        setScheduledTime,
        paymentMethod,
        setPaymentMethod,
        couponCode,
        appliedCoupon,
        applyCoupon,
        removeCoupon,
        placeOrder,
        restaurantName: initialRestaurantName,
      }}
    >
      {children}
    </JapaneseCartContext.Provider>
  );
};

export const useJapaneseCart = () => {
  const ctx = useContext(JapaneseCartContext);
  if (!ctx) {
    throw new Error('useJapaneseCart must be used within JapaneseCartProvider');
  }
  return ctx;
};
