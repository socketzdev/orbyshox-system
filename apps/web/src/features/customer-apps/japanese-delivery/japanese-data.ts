export interface JapaneseProduct {
  id: string;
  name: string;
  category: 'combinados' | 'uramaki' | 'sashimi' | 'nigiri' | 'hot-rolls' | 'temaki' | 'sobremesas' | 'bebidas';
  pieces: number;
  weightGrams: number;
  caloriesKcal: number;
  priceCents: number;
  oldPriceCents?: number;
  rating: number;
  reviewsCount: number;
  description: string;
  image: string;
  heroImage?: string;
  tags: string[];
  isChefSelection?: boolean;
  isSpecialOffer?: boolean;
  discountPercent?: number;
}

export interface SpecialOffer {
  id: string;
  title: string;
  subtitle: string;
  discountPercent: number;
  badgeText: string;
  image: string;
  productId: string;
  priceCents: number;
  oldPriceCents: number;
}

export const JAPANESE_CATEGORIES = [
  { id: 'todos', name: 'Todos', emoji: '🥢' },
  { id: 'combinados', name: 'Combinados', emoji: '🍱' },
  { id: 'uramaki', name: 'Uramaki', emoji: '🍙' },
  { id: 'sashimi', name: 'Sashimi', emoji: '🐟' },
  { id: 'nigiri', name: 'Nigiri', emoji: '🍣' },
  { id: 'hot-rolls', name: 'Hot Rolls', emoji: '🔥' },
  { id: 'temaki', name: 'Temaki', emoji: '🥟' },
  { id: 'sobremesas', name: 'Sobremesas', emoji: '🍡' },
  { id: 'bebidas', name: 'Bebidas', emoji: '🍶' },
];

export const SPECIAL_OFFERS: SpecialOffer[] = [
  {
    id: 'offer-1',
    title: 'DESTAQUES DO MÊS',
    subtitle: 'Nossos rolls mais requisitados da estação reunidos com valor especial.',
    discountPercent: 20,
    badgeText: '-20%',
    image: '/templates/japanese/assets/offer-this-month.jpg',
    productId: 'prod-month-highlight',
    priceCents: 6490,
    oldPriceCents: 8100,
  },
  {
    id: 'offer-2',
    title: 'COMBO PREMIUM SET',
    subtitle: '32 peças de pura excelência artesanal para os verdadeiros conhecedores.',
    discountPercent: 15,
    badgeText: '-15%',
    image: '/templates/japanese/assets/offer-premium-set.jpg',
    productId: 'prod-precision-set',
    priceCents: 12900,
    oldPriceCents: 15190,
  },
  {
    id: 'offer-3',
    title: 'SAKURA EXPERIENCE',
    subtitle: 'Edição limitada da florada japonesa com trufas e flor de sal.',
    discountPercent: 25,
    badgeText: '-25%',
    image: '/templates/japanese/assets/banner-sakura.jpg',
    productId: 'prod-sakura-wave',
    priceCents: 9800,
    oldPriceCents: 13000,
  },
];

export const JAPANESE_PRODUCTS: JapaneseProduct[] = [
  {
    id: 'prod-sakura-wave',
    name: 'SAKURA WAVE SET',
    category: 'combinados',
    pieces: 18,
    weightGrams: 460,
    caloriesKcal: 580,
    priceCents: 9800,
    oldPriceCents: 13000,
    rating: 5.0,
    reviewsCount: 142,
    description: 'Edição exclusiva da estação: lâminas nobres de atum Bluefin fresco, arroz selado com infusão de pétalas de sakura e vieiras de Hokkaido tostadas no maçarico com azeite trufado.',
    image: '/templates/japanese/assets/hero-sushi-platter.jpg',
    heroImage: '/templates/japanese/assets/banner-sakura.jpg',
    tags: ['Edição Limitada', 'Artesanal', 'Exclusivo', 'Bluefin'],
    isChefSelection: true,
    isSpecialOffer: true,
    discountPercent: 25,
  },
  {
    id: 'prod-emerald-line',
    name: 'EMERALD LINE',
    category: 'uramaki',
    pieces: 8,
    weightGrams: 270,
    caloriesKcal: 430,
    priceCents: 4990,
    rating: 4.9,
    reviewsCount: 128,
    description: 'Leve, elegante e perfeitamente equilibrado. King crab marinado, avocado cremoso e cream cheese artesanal, delicadamente envolto em lâminas translúcidas de pepino japonês, finalizado com caviar de tobiko negro e gotas de yuzu cítrico.',
    image: '/templates/japanese/assets/dish-emerald.jpg',
    heroImage: '/templates/japanese/assets/dish-emerald-hero.jpg',
    tags: ['Assinatura', 'Fresco', 'Low Carb', 'Sem Glúten'],
    isChefSelection: true,
  },
  {
    id: 'prod-philadelphia-luxe',
    name: 'PHILADELPHIA LUXE',
    category: 'uramaki',
    pieces: 8,
    weightGrams: 320,
    caloriesKcal: 480,
    priceCents: 4590,
    rating: 4.9,
    reviewsCount: 215,
    description: 'O clássico uramaki elevado ao estado da arte. Salmão fresco selecionado da Patagônia, fatias nobres de salmão maçaricado por fora, cream cheese Philadelphia original, cebolinha fresca e ovas negras.',
    image: '/templates/japanese/assets/dish-philadelphia.jpg',
    tags: ['Mais Pedido', 'Salmão Fresco', 'Cremoso'],
    isChefSelection: true,
  },
  {
    id: 'prod-jade-harmony',
    name: 'JADE HARMONY',
    category: 'uramaki',
    pieces: 8,
    weightGrams: 320,
    caloriesKcal: 410,
    priceCents: 4790,
    rating: 4.8,
    reviewsCount: 94,
    description: 'Combinação harmônica de avocado hass chileno perfeitamente maturado, tataki de atum em crosta de gergelim moído e emulsão artesanal de wasabi suave.',
    image: '/templates/japanese/assets/dish-jade.jpg',
    tags: ['Super Fresh', 'Rico em Ômega-3'],
    isChefSelection: true,
  },
  {
    id: 'prod-precision-set',
    name: 'PRECISION SET',
    category: 'combinados',
    pieces: 32,
    weightGrams: 780,
    caloriesKcal: 940,
    priceCents: 12900,
    oldPriceCents: 15190,
    rating: 5.0,
    reviewsCount: 310,
    description: 'O combinado definitivo para momentos especiais. 8 fatias de Sashimi de Salmão Maçaricado, 8 Uramakis Philadelphia Luxe, 8 Niguiris Trufados com flor de sal e 8 Hot Rolls Crocantes.',
    image: '/templates/japanese/assets/dish-precision.jpg',
    tags: ['Para Compartilhar', 'Chef Choice', 'Experiência Completa'],
    isChefSelection: true,
    isSpecialOffer: true,
    discountPercent: 15,
  },
  {
    id: 'prod-truffle-shadow',
    name: 'TRUFFLE SHADOW',
    category: 'uramaki',
    pieces: 8,
    weightGrams: 320,
    caloriesKcal: 490,
    priceCents: 5290,
    rating: 4.9,
    reviewsCount: 88,
    description: 'Roll envolto em gergelim negro tostado, recheado com salmão fresco e cream cheese, coroado com tartare de salmão trufado e redução artesanal de vinho do porto e shoyu.',
    image: '/templates/japanese/assets/dish-truffle.jpg',
    tags: ['Azeite Trufado', 'Sabor Intenso', 'Gourmet'],
    isChefSelection: true,
  },
  {
    id: 'prod-spicy-ember',
    name: 'SPICY EMBER ROLL',
    category: 'uramaki',
    pieces: 8,
    weightGrams: 320,
    caloriesKcal: 460,
    priceCents: 4690,
    rating: 4.8,
    reviewsCount: 76,
    description: 'Para os apreciadores de notas picantes. Salmão e atum marinados em sriracha com óleo de gergelim torrado, cobertura de pimenta togarashi e crisps crocantes de alho-poró.',
    image: '/templates/japanese/assets/dish-spicy-ember.jpg',
    tags: ['Levemente Picante', 'Crocante', 'Autoral'],
    isChefSelection: true,
  },
  {
    id: 'prod-amber-glaze',
    name: 'AMBER GLAZE NIGIRI',
    category: 'nigiri',
    pieces: 8,
    weightGrams: 280,
    caloriesKcal: 390,
    priceCents: 5490,
    rating: 4.9,
    reviewsCount: 104,
    description: 'Oito peças de niguiri de salmão com crosta caramelizada no maçarico, glaceados com molho teriyaki artesanal feito com gengibre e sakê mirin, finalizados com raspas de limão siciliano.',
    image: '/templates/japanese/assets/dish-amber-glaze.jpg',
    tags: ['Maçaricado', 'Agridoce Sutil', 'Nigiri Premium'],
    isChefSelection: true,
  },
  {
    id: 'prod-hot-roll-crocante',
    name: 'HOT ROLL MINAMI CRUNCH',
    category: 'hot-rolls',
    pieces: 8,
    weightGrams: 340,
    caloriesKcal: 520,
    priceCents: 3990,
    rating: 4.8,
    reviewsCount: 165,
    description: 'Roll empanado em flocos de farinha Panko japonesa super crocante, recheio de salmão fresco e cream cheese cremoso, finalizado com fios de molho tarê e cebolinha verde.',
    image: '/templates/japanese/assets/piece-hot-roll.jpg',
    tags: ['Frito & Quente', 'Crocante', 'Favorito'],
    isChefSelection: false,
  },
  {
    id: 'prod-sashimi-salmon',
    name: 'SASHIMI SALMÃO PURO',
    category: 'sashimi',
    pieces: 10,
    weightGrams: 220,
    caloriesKcal: 310,
    priceCents: 5690,
    rating: 4.9,
    reviewsCount: 180,
    description: 'Dez cortes nobres e espessos do lombo do salmão fresco do Atlântico, servidos sobre cama de daikon ralado com folhas de shissô e raiz forte fresca.',
    image: '/templates/japanese/assets/piece-salmon-nigiri.jpg',
    tags: ['Corte Nobre', 'Zero Carb', 'Fresco do Dia'],
    isChefSelection: false,
  },
  {
    id: 'prod-temaki-especial',
    name: 'TEMAKI SALMÃO COM TOBIKO',
    category: 'temaki',
    pieces: 1,
    weightGrams: 240,
    caloriesKcal: 380,
    priceCents: 3490,
    rating: 4.9,
    reviewsCount: 130,
    description: 'Alga Nori ultra crocante grelhada na hora, arroz shari no ponto exato, cubos generosos de salmão com cream cheese, cebolinha e ovas de peixe voador (tobiko).',
    image: '/templates/japanese/assets/sushi-box.jpg',
    tags: ['Crocância Garantida', 'Generoso'],
    isChefSelection: false,
  },
  {
    id: 'prod-mochi-matcha',
    name: 'DUO MOCHI JAPONÊS',
    category: 'sobremesas',
    pieces: 2,
    weightGrams: 140,
    caloriesKcal: 210,
    priceCents: 2490,
    rating: 4.9,
    reviewsCount: 65,
    description: 'Tradicional doce japonês de arroz glutinoso com recheio cremoso gelado nos sabores Chá Verde Matcha e Morango Fresco.',
    image: '/templates/japanese/assets/mascot.jpg',
    tags: ['Sobremesa Típica', 'Refrescante'],
    isChefSelection: false,
  },
  {
    id: 'prod-cha-verde-gelado',
    name: 'CHÁ VERDE MATCHA ICED',
    category: 'bebidas',
    pieces: 1,
    weightGrams: 400,
    caloriesKcal: 15,
    priceCents: 1490,
    rating: 4.7,
    reviewsCount: 42,
    description: 'Chá verde importado de Uji preparado a frio com notas cítricas de limão yuzu. Sem adição de açúcar.',
    image: '/templates/japanese/assets/piece-ebi.jpg',
    tags: ['Antioxidante', 'Zero Açúcar', 'Gourmet'],
    isChefSelection: false,
  },
];

export const SAUCE_OPTIONS = [
  { id: 'shoyu-tradicional', name: 'Shoyu Tradicional (Kikkoman)', priceCents: 0, default: true },
  { id: 'shoyu-light', name: 'Shoyu Light (Menos Sódio)', priceCents: 0, default: false },
  { id: 'tare-artesanal', name: 'Molho Tarê Artesanal da Casa', priceCents: 300, default: false },
  { id: 'ponzu-yuzu', name: 'Molho Ponzu Cítrico com Yuzu', priceCents: 450, default: false },
  { id: 'azeite-trufado', name: 'Gotas de Azeite Trufado Extra', priceCents: 600, default: false },
];

export const CUTLERY_OPTIONS = [
  { id: 'hashi-bambu', name: 'Par de Hashis de Bambu Premium', priceCents: 0, default: true },
  { id: 'hashi-adaptador', name: 'Hashi com Adaptador Infantil / Iniciante', priceCents: 0, default: false },
  { id: 'sem-talher', name: 'Não preciso de hashis nem talheres 🌱', priceCents: 0, default: false },
];

export const EXTRAS_OPTIONS = [
  { id: 'gengibre-extra', name: 'Gengibre Rosa Marinado Extra (Gari)', priceCents: 400 },
  { id: 'wasabi-extra', name: 'Wasabi Fresco Artesanal Extra', priceCents: 350 },
  { id: 'molheira-descartavel', name: 'Molheira para Shoyu (2 un)', priceCents: 0 },
];
