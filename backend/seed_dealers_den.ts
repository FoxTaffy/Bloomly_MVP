import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── real-looking furry art images from picsum/unsplash ─────────────────────
const ART_IMAGES = [
  'https://images.unsplash.com/photo-1547826039-bfc35e0f1ea8?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1541701494587-cb58502866ab?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1555680202-c86f0e12f086?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1632516643720-e7f5d7d6ecc9?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1638803040283-7a5ffd48dad5?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1637858868799-7f26a0640eb6?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1557672172-298e090bd0f1?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1643101452019-bc00c9bba76b?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1635322966219-b75ed372eb01?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1617791160505-6f00504e3519?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1618172193763-c511deb635ca?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1578301978162-7aae4d755744?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1563089145-599997674d42?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1574169208507-84376144848b?q=80&w=800&auto=format&fit=crop',
];

function img(i: number) { return ART_IMAGES[i % ART_IMAGES.length]; }

async function main() {
  console.log('🎨 Seeding Dealers\' Den...');

  // ── create/upsert seller accounts ────────────────────────────────────────
  const hash = await bcrypt.hash('password123', 10);

  const seller1 = await prisma.user.upsert({
    where: { username: 'artist_nova' },
    update: { is_verified: true, verification_type: 'artist' },
    create: {
      username: 'artist_nova',
      email: 'nova@bloomly.fun',
      password: hash,
      display_name: 'Nova Starbrush',
      avatar_url: 'https://api.dicebear.com/8.x/adventurer/svg?seed=nova&backgroundColor=b6e3f4',
      bio: 'Digital furry artist ✦ Commissions open!',
      is_verified: true,
      verification_type: 'artist',
      likes: [],
      dislikes: [],
    },
  });

  const seller2 = await prisma.user.upsert({
    where: { username: 'foxcraft_master' },
    update: { is_verified: true, verification_type: 'master' },
    create: {
      username: 'foxcraft_master',
      email: 'foxcraft@bloomly.fun',
      password: hash,
      display_name: 'FoxCraft Studio',
      avatar_url: 'https://api.dicebear.com/8.x/adventurer/svg?seed=foxcraft&backgroundColor=ffd5dc',
      bio: 'Fursuit maker & badge creator 🦊',
      is_verified: true,
      verification_type: 'master',
      likes: [],
      dislikes: [],
    },
  });

  const seller3 = await prisma.user.upsert({
    where: { username: 'pixel_wolf' },
    update: { is_verified: true, verification_type: 'artist' },
    create: {
      username: 'pixel_wolf',
      email: 'pixel@bloomly.fun',
      password: hash,
      display_name: 'Pixel Wolf',
      avatar_url: 'https://api.dicebear.com/8.x/adventurer/svg?seed=wolf&backgroundColor=c0aede',
      bio: 'Pixel art & traditional mixed artist 🐺',
      is_verified: true,
      verification_type: 'artist',
      likes: [],
      dislikes: [],
    },
  });

  const bidder = await prisma.user.upsert({
    where: { username: 'fluffy_bidder' },
    update: {},
    create: {
      username: 'fluffy_bidder',
      email: 'bidder@bloomly.fun',
      password: hash,
      display_name: 'Fluffy Bidder',
      avatar_url: 'https://api.dicebear.com/8.x/adventurer/svg?seed=fluffy&backgroundColor=d1f7c4',
      likes: [],
      dislikes: [],
    },
  });

  const bidder2 = await prisma.user.upsert({
    where: { username: 'dragon_collector' },
    update: {},
    create: {
      username: 'dragon_collector',
      email: 'dragon@bloomly.fun',
      password: hash,
      display_name: 'Dragon Collector',
      avatar_url: 'https://api.dicebear.com/8.x/adventurer/svg?seed=dragon&backgroundColor=ffcfab',
      likes: [],
      dislikes: [],
    },
  });

  // ── wipe existing demo listings ───────────────────────────────────────────
  const sellerIds = [seller1.id, seller2.id, seller3.id];
  await prisma.dealerBid.deleteMany({ where: { listing: { seller_id: { in: sellerIds } } } });
  await prisma.dealerListingComment.deleteMany({ where: { listing: { seller_id: { in: sellerIds } } } });
  await prisma.dealerListing.deleteMany({ where: { seller_id: { in: sellerIds } } });
  console.log('  Cleared old listings');

  // ════════════════════════════════════════════════════════════
  // FIXED PRICE — 10 listings
  // ════════════════════════════════════════════════════════════
  const fixedListings = [
    { title: 'Полноростовой портрет персонажа', price: 45, currency: 'USD', category: 'art', type: 'digital', description: 'Детализированный цифровой арт вашего персонажа в полный рост. Включает фон и спецэффекты. Срок —  7–10 дней.', tags: ['portrait', 'fullbody', 'digital', 'furry'], seller: seller1, qty: 3 },
    { title: 'Бейдж на конвент', price: 1500, currency: 'RUB', category: 'badge', type: 'physical', description: 'Цветной ламинированный бейдж A6. Прорезь для шнурка. Доставка по России.', tags: ['badge', 'convention', 'print'], seller: seller2, qty: 10 },
    { title: 'Эмоупаки (6 экспрессий)', price: 25, currency: 'USD', category: 'art', type: 'digital', description: '6 выражений лица вашего фурсоны: радость, шок, смущение, злость, грусть, дерзость.', tags: ['emotes', 'expression', 'commission'], seller: seller1, qty: 5 },
    { title: 'Fursuit partialhead (базовый Fox)', price: 45000, currency: 'RUB', category: 'fursuit', type: 'physical', description: 'Частичный голова-маска лисы. Шёрстка имитация, двигающийся рот, неодимовые зубы. Размер L.', tags: ['fursuit', 'partial', 'fox'], seller: seller2, qty: 1 },
    { title: 'Пиксельный аватар 64×64', price: 800, currency: 'RUB', category: 'art', type: 'digital', description: 'Ретро-пиксельный аватар вашего персонажа. Прозрачный фон, 4 цвета кожи.', tags: ['pixel', 'avatar', 'retro'], seller: seller3, qty: 20 },
    { title: 'Набор принтов A4 × 3шт.', price: 2200, currency: 'RUB', category: 'print', type: 'physical', description: '3 матовых принта А4 с авторскими иллюстрациями. Плёнка, контейнер, упаковка.', tags: ['print', 'art', 'set'], seller: seller1, qty: 7 },
    { title: 'Animated reference sheet', price: 65, currency: 'USD', category: 'art', type: 'digital', description: 'Полный референс-лист + 4 анимированных спрайта (idle, walk, run, attack).', tags: ['refsheet', 'animated', 'commission'], seller: seller3, qty: 2 },
    { title: 'Мерч: худи с принтом', price: 3500, currency: 'RUB', category: 'merch', type: 'physical', description: 'Хлопковое худи оверсайз с вышивкой авторского логотипа. Размеры S–XXL.', tags: ['hoodie', 'merch', 'wearable'], seller: seller2, qty: 15 },
    { title: 'Музыкальный джингл для стримера', price: 29, currency: 'USD', category: 'music', type: 'digital', description: 'Уникальный интро/аутро-джингл для Twitch/VK Play. 10–15 сек, WAV + OGG. 3–5 дней.', tags: ['music', 'stream', 'jingle'], seller: seller3, qty: 10 },
    { title: 'Handmade брошь из полимерки', price: 650, currency: 'RUB', category: 'craft', type: 'physical', description: 'Авторская брошь с фурсоной художника. Полимерная глина, ручная роспись, покрытие лаком.', tags: ['craft', 'brooch', 'handmade'], seller: seller2, qty: 4 },
  ];

  for (let i = 0; i < fixedListings.length; i++) {
    const d = fixedListings[i];
    await prisma.dealerListing.create({
      data: {
        seller_id: d.seller.id,
        title: d.title,
        description: d.description,
        price: d.price,
        currency: d.currency,
        category: d.category as any,
        type: d.type as any,
        listing_kind: 'fixed',
        images: [img(i), img(i + 1)],
        quantity: d.qty,
        quantity_sold: Math.floor(d.qty * 0.3),
        is_nsfw: false,
        tags: d.tags,
        status: 'active',
      },
    });
  }
  console.log('  ✅ 10 fixed listings');

  // ════════════════════════════════════════════════════════════
  // AUCTION — 10 listings, several with bids
  // ════════════════════════════════════════════════════════════
  const nowMs = Date.now();
  const auctionListings = [
    { title: 'Лимитированный принт «Лунная лиса»', price: 30, currency: 'USD', category: 'art', endsAt: new Date(nowMs + 2 * 3600 * 1000), inc: 5, ab: 250, seller: seller1, desc: 'Одна из 3 уникальных картин серии. Цифровой файл + сертификат.', tags: ['limited', 'print', 'fox'] },
    { title: 'Fullbody коммишн с фоном', price: 50, currency: 'USD', category: 'art', endsAt: new Date(nowMs + 12 * 3600 * 1000), inc: 10, ab: 300, seller: seller1, desc: 'Детализированный арт в моём стиле. Включает сложный фон.', tags: ['fullbody', 'background', 'commission'] },
    { title: 'Fursuit голова «Волк» (б/у)', price: 15000, currency: 'RUB', category: 'fursuit', endsAt: new Date(nowMs + 24 * 3600 * 1000), inc: 500, ab: 35000, seller: seller2, desc: 'Профессиональная голова волка в отличном состоянии. Носилась 2 раза.', tags: ['fursuit', 'wolf', 'used'] },
    { title: 'Редкий значок «Dragon NFT»', price: 500, currency: 'RUB', category: 'badge', endsAt: new Date(nowMs + 36 * 3600 * 1000), inc: 100, ab: null, seller: seller2, desc: 'Единственный экземпляр значка с голограммой.', tags: ['rare', 'badge', 'limited'] },
    { title: 'Анимированный портрет (10 кадров)', price: 80, currency: 'USD', category: 'art', endsAt: new Date(nowMs + 48 * 3600 * 1000), inc: 15, ab: 400, seller: seller3, desc: 'Детальная анимация персонажа с эффектами частиц.', tags: ['animated', 'portrait', 'commission'] },
    { title: 'Custom Track для игры/мода', price: 1500, currency: 'RUB', category: 'music', endsAt: new Date(nowMs + 3 * 24 * 3600 * 1000), inc: 200, ab: 8000, seller: seller3, desc: 'Авторская музыкальная тема. Права на использование переходят победителю.', tags: ['music', 'track', 'custom'] },
    { title: 'Набор стикеров 40шт. (физ.)', price: 1200, currency: 'RUB', category: 'sticker', endsAt: new Date(nowMs + 4 * 24 * 3600 * 1000), inc: 150, ab: null, seller: seller1, desc: '40 виниловых стикеров с авторскими персонажами. Водостойкие.', tags: ['sticker', 'vinyl', 'set'] },
    { title: 'Кастомный паттерн ткани', price: 60, currency: 'USD', category: 'art', endsAt: new Date(nowMs + 5 * 24 * 3600 * 1000), inc: 10, ab: 250, seller: seller3, desc: 'Бесшовный паттерн для текстиля. Файл 300dpi.', tags: ['pattern', 'fabric', 'design'] },
    { title: 'Полная пошивка хвоста (флаффи)', price: 3500, currency: 'RUB', category: 'fursuit', endsAt: new Date(nowMs + 6 * 24 * 3600 * 1000), inc: 300, ab: 12000, seller: seller2, desc: 'Пушистый хвост из искусственного меха. Крепление на ремень.', tags: ['fursuit', 'tail', 'handmade'] },
    { title: 'Иллюстрация «Конвент Воспоминания»', price: 100, currency: 'USD', category: 'art', endsAt: new Date(nowMs + 7 * 24 * 3600 * 1000), inc: 20, ab: 500, seller: seller1, desc: 'Сцена с несколькими персонажами на фоне конвента. Авторская работа.', tags: ['scene', 'convention', 'illustration'] },
  ];

  for (let i = 0; i < auctionListings.length; i++) {
    const d = auctionListings[i];
    const listing = await prisma.dealerListing.create({
      data: {
        seller_id: d.seller.id,
        title: d.title,
        description: d.desc,
        price: d.price,
        currency: d.currency,
        category: d.category as any,
        type: 'digital' as any,
        listing_kind: 'auction',
        images: [img(i + 5), img(i + 6)],
        quantity: 1,
        is_nsfw: false,
        tags: d.tags,
        status: 'active',
        auction_ends_at: d.endsAt,
        bid_increment: d.inc,
        auto_buy_price: d.ab ?? undefined,
        current_bid: null,
        bid_count: 0,
      },
    });

    // Add 2–4 bids to first 6 auctions
    if (i < 6) {
      const basePrice = typeof d.price === 'number' ? d.price : parseFloat(String(d.price));
      const bidAmounts = [
        basePrice,
        basePrice + d.inc,
        basePrice + d.inc * 2,
        basePrice + d.inc * 3,
      ].slice(0, i < 3 ? 4 : 2);

      let lastBid = 0;
      for (let b = 0; b < bidAmounts.length; b++) {
        const bidderId = b % 2 === 0 ? bidder.id : bidder2.id;
        await prisma.dealerBid.create({
          data: {
            listing_id: listing.id,
            bidder_id: bidderId,
            amount: bidAmounts[b],
            message: b === bidAmounts.length - 1 ? 'Моя последняя ставка! 🔥' : null,
            created_at: new Date(nowMs - (bidAmounts.length - b) * 3600 * 1000 * 2),
          },
        });
        lastBid = bidAmounts[b];
      }
      await prisma.dealerListing.update({
        where: { id: listing.id },
        data: { current_bid: lastBid, bid_count: bidAmounts.length },
      });
    }
  }
  console.log('  ✅ 10 auction listings + bids');

  // ════════════════════════════════════════════════════════════
  // YCH — 10 listings with slots
  // ════════════════════════════════════════════════════════════
  const ychListings = [
    { title: 'YCH — Тёмный рыцарь (3 слота)', price: 40, currency: 'USD', category: 'art', slots: 3, inc: 5, ab: 200, seller: seller1, desc: 'Ваш персонаж в позе тёмного рыцаря с мечом. Постобработка, фон включён.', tags: ['ych', 'knight', 'action'] },
    { title: 'YCH — Купание в реке (5 слотов)', price: 25, currency: 'USD', category: 'art', slots: 5, inc: 5, ab: 120, seller: seller1, desc: 'Летняя сцена, ваш персонаж купается в реке. Солнечное освещение.', tags: ['ych', 'summer', 'cute'] },
    { title: 'YCH — Pinup стойка (2 слота)', price: 60, currency: 'USD', category: 'art', slots: 2, inc: 10, ab: 300, seller: seller3, desc: 'Пин-ап позиция с авторской подводкой глаз. SFW.', tags: ['ych', 'pinup', 'pose'] },
    { title: 'YCH — Воин дракона (4 слота)', price: 1500, currency: 'RUB', category: 'art', slots: 4, inc: 200, ab: 6000, seller: seller3, desc: 'Полноростовой боевой арт вашего персонажа с драконьими элементами.', tags: ['ych', 'warrior', 'dragon'] },
    { title: 'YCH — Уютный вечер дома (6 слотов)', price: 20, currency: 'USD', category: 'art', slots: 6, inc: 5, ab: 80, seller: seller1, desc: 'Ваш персонаж читает книгу у камина. Мягкое тёплое освещение.', tags: ['ych', 'cozy', 'indoor'] },
    { title: 'YCH — Снежная битва (3 слота)', price: 35, currency: 'USD', category: 'art', slots: 3, inc: 5, ab: 180, seller: seller3, desc: 'Зимняя сцена: персонаж бросает снежок или уклоняется. Анимированная версия по запросу.', tags: ['ych', 'winter', 'action'] },
    { title: 'YCH — Бариста-фурри (8 слотов)', price: 2200, currency: 'RUB', category: 'art', slots: 8, inc: 200, ab: 8000, seller: seller1, desc: 'Ваш персонаж в образе кофейного бариста. Фартук, чашка, пар.', tags: ['ych', 'barista', 'cute'] },
    { title: 'YCH — Спящий дракон (2 слота)', price: 50, currency: 'USD', category: 'art', slots: 2, inc: 10, ab: 250, seller: seller3, desc: 'Ваш персонаж свернулся клубком спит. Детальная текстура меха/чешуи.', tags: ['ych', 'sleeping', 'dragon'] },
    { title: 'YCH — Аниме-сплэш (5 слотов)', price: 30, currency: 'USD', category: 'art', slots: 5, inc: 8, ab: 150, seller: seller1, desc: 'Аниме стиль с цветными брызгами чернил. Яркая палитра.', tags: ['ych', 'anime', 'splash'] },
    { title: 'YCH — Хэллоуин-фурри (4 слота)', price: 1800, currency: 'RUB', category: 'art', slots: 4, inc: 200, ab: 7000, seller: seller3, desc: 'Хэллоуинский образ: тыква, ведьмовская шляпа, луна. Идеально для аватарки.', tags: ['ych', 'halloween', 'spooky'] },
  ];

  for (let i = 0; i < ychListings.length; i++) {
    const d = ychListings[i];
    const soldsSlots = i < 5 ? Math.floor(Math.random() * Math.max(1, d.slots - 1)) : 0;

    const listing = await prisma.dealerListing.create({
      data: {
        seller_id: d.seller.id,
        title: d.title,
        description: d.desc,
        price: d.price,
        currency: d.currency,
        category: d.category as any,
        type: 'digital' as any,
        listing_kind: 'ych',
        images: [img(i + 2), img(i + 3)],
        quantity: d.slots,
        quantity_sold: soldsSlots,
        is_nsfw: false,
        tags: d.tags,
        status: soldsSlots >= d.slots ? 'sold' : 'active',
        bid_increment: d.inc,
        auto_buy_price: d.ab,
        current_bid: null,
        bid_count: 0,
        auction_ends_at: new Date(Date.now() + (3 + i) * 24 * 3600 * 1000),
      },
    });

    // Add bids for first 6 YCH listings
    if (i < 6 && soldsSlots > 0) {
      const basePrice = typeof d.price === 'number' ? d.price : parseFloat(String(d.price));
      const bidAmounts: number[] = [];
      let cur = basePrice;
      for (let b = 0; b < soldsSlots; b++) {
        bidAmounts.push(cur);
        cur += d.inc;
      }
      // Add one more from each alternating bidder
      bidAmounts.push(cur);

      let lastBid = 0;
      for (let b = 0; b < bidAmounts.length; b++) {
        const bidderId = b % 2 === 0 ? bidder.id : bidder2.id;
        const characterDescs = [
          'Хочу слот! Персонаж — красная лиса с чёрными ногами.',
          'Беру слот! У меня белый волк с синими глазами.',
          'Мой персонаж — фиолетовый дракон с рогами.',
          'Возьму слот для моей тигры-художника!',
          'Оо, беру! Это снежный леопард с шрамом.',
        ];
        await prisma.dealerBid.create({
          data: {
            listing_id: listing.id,
            bidder_id: bidderId,
            amount: bidAmounts[b],
            message: characterDescs[b % characterDescs.length],
            created_at: new Date(nowMs - (bidAmounts.length - b) * 2 * 3600 * 1000),
          },
        });
        lastBid = bidAmounts[b];
      }
      await prisma.dealerListing.update({
        where: { id: listing.id },
        data: { current_bid: lastBid, bid_count: bidAmounts.length },
      });
    }
  }
  console.log('  ✅ 10 YCH listings + slot bids');

  // ════════════════════════════════════════════════════════════
  // RAFFLE — 10 listings with tickets
  // ════════════════════════════════════════════════════════════
  const raffleListings = [
    { title: 'Розыгрыш: Fullbody-арт вашего персонажа', price: 3, currency: 'USD', category: 'art', maxTickets: 50, seller: seller1, desc: 'Розыгрываю полноростовой арт среди всех участников. Победитель выбирается случайно.', tags: ['raffle', 'fullbody', 'giveaway'] },
    { title: 'Розыгрыш: Бейдж + доставка', price: 150, currency: 'RUB', category: 'badge', maxTickets: 30, seller: seller2, desc: 'Авторский бейдж A5 + бесплатная доставка по РФ. Тематика на выбор победителя.', tags: ['raffle', 'badge', 'prize'] },
    { title: 'Розыгрыш: Аниматик 2 сек.', price: 5, currency: 'USD', category: 'art', maxTickets: 40, seller: seller3, desc: 'Короткая 2-секундная зацикленная анимация вашего персонажа.', tags: ['raffle', 'animated', 'loop'] },
    { title: 'Розыгрыш: Музыкальный бандл × 5 треков', price: 2, currency: 'USD', category: 'music', maxTickets: 100, seller: seller3, desc: '5 авторских инструментальных треков. Только одному победителю.', tags: ['raffle', 'music', 'bundle'] },
    { title: 'Розыгрыш: Частичный фурсьют голова (мини)', price: 500, currency: 'RUB', category: 'fursuit', maxTickets: 20, seller: seller2, desc: 'Настольная мини-голова (30 см). Ручная работа, искусственный мех.', tags: ['raffle', 'fursuit', 'mini'] },
    { title: 'Розыгрыш: headshot + 3 иконки', price: 1, currency: 'USD', category: 'art', maxTickets: 200, seller: seller1, desc: 'Портрет + 3 иконки 512×512 для аватаров. Победителю — любой персонаж.', tags: ['raffle', 'headshot', 'icons'] },
    { title: 'Розыгрыш: Комикс-страница (1шт.)', price: 4, currency: 'USD', category: 'art', maxTickets: 60, seller: seller3, desc: 'Одна полноформатная страница комикса с вашим персонажем по вашему сценарию.', tags: ['raffle', 'comic', 'page'] },
    { title: 'Розыгрыш: Набор мерча (худи+стикеры)', price: 300, currency: 'RUB', category: 'merch', maxTickets: 25, seller: seller2, desc: 'Призовой пакет: худи оверсайз + 20 стикеров с авторскими дизайнами.', tags: ['raffle', 'merch', 'bundle'] },
    { title: 'Розыгрыш: Пиксель-анимация idle', price: 2, currency: 'USD', category: 'art', maxTickets: 80, seller: seller3, desc: 'Анимированная idle-анимация вашего персонажа в пиксельном стиле (16 кадров).', tags: ['raffle', 'pixel', 'animated'] },
    { title: 'Розыгрыш БЕСПЛАТНО: Скетч-портрет', price: 0, currency: 'USD', category: 'art', maxTickets: null, seller: seller1, desc: 'Бесплатный розыгрыш! Чёрно-белый скетч-портрет одного победителя.', tags: ['raffle', 'free', 'sketch'] },
  ];

  for (let i = 0; i < raffleListings.length; i++) {
    const d = raffleListings[i];
    const soldTickets = d.maxTickets ? Math.floor(d.maxTickets * (0.2 + Math.random() * 0.5)) : Math.floor(Math.random() * 30) + 5;

    await prisma.dealerListing.create({
      data: {
        seller_id: d.seller.id,
        title: d.title,
        description: d.desc,
        price: d.price,
        currency: d.currency,
        category: d.category as any,
        type: 'digital' as any,
        listing_kind: 'raffle',
        images: [img(i + 8), img(i + 9)],
        quantity: d.maxTickets ?? 9999,
        quantity_sold: soldTickets,
        is_nsfw: false,
        tags: d.tags,
        status: 'active',
        raffle_max_tickets: d.maxTickets,
        raffle_tickets_sold: soldTickets,
        auction_ends_at: new Date(Date.now() + (5 + i * 2) * 24 * 3600 * 1000),
      },
    });
  }
  console.log('  ✅ 10 raffle listings');

  // ── Summary ──────────────────────────────────────────────────────────────
  const total = await prisma.dealerListing.count({ where: { seller_id: { in: sellerIds } } });
  console.log(`\n✨ Done! Created ${total} listings across all 4 types.`);
  console.log('   Sellers: artist_nova, foxcraft_master, pixel_wolf');
  console.log('   Bidders: fluffy_bidder, dragon_collector');
  console.log('   Passwords: password123');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
