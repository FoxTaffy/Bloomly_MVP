import { useLangStore } from '@/stores/lang'

// Подписи вкладок «Bloomly Shop» и «Dealers' Den». Админка — рабочий инструмент команды, поэтому ru + en;
// остальные языки интерфейса показывают английский.
const S = {
  loadFailed: { ru: 'Не удалось загрузить данные', en: 'Could not load data' }, retry: { ru: 'Повторить', en: 'Retry' },
  actionFailed: { ru: 'Не удалось выполнить действие', en: 'Action failed' },
  search: { ru: 'Поиск…', en: 'Search…' }, all: { ru: 'Все', en: 'All' }, empty: { ru: 'Ничего не найдено', en: 'Nothing found' },
  prev: { ru: 'Назад', en: 'Back' }, next: { ru: 'Вперёд', en: 'Next' }, open: { ru: 'Открыть', en: 'Open' },
  cancel: { ru: 'Отмена', en: 'Cancel' }, save: { ru: 'Сохранить', en: 'Save' }, create: { ru: 'Создать', en: 'Create' },
  edit: { ru: 'Изменить', en: 'Edit' }, del: { ru: 'Удалить', en: 'Delete' }, thisWeek: { ru: 'за неделю', en: 'this week' },
  free: { ru: 'Бесплатно', en: 'Free' }, by: { ru: 'автор', en: 'by' }, seller: { ru: 'Продавец', en: 'Seller' },

  // ── Shop ──
  shopOverview: { ru: 'Обзор', en: 'Overview' }, shopItems: { ru: 'Товары', en: 'Items' }, shopPacks: { ru: 'Стикер-паки', en: 'Sticker packs' },
  shopRequests: { ru: 'Заявки на доступ', en: 'Access requests' },
  kItems: { ru: 'Товаров', en: 'Items' }, kDownloads: { ru: 'Скачиваний', en: 'Downloads' }, kPurchases: { ru: 'Покупок', en: 'Purchases' },
  kTurnover: { ru: 'Оборот', en: 'Turnover' }, kPacks: { ru: 'Паков в каталоге', en: 'Published packs' }, kPendingAccess: { ru: 'Заявок на доступ', en: 'Access requests' },
  paidFree: { ru: 'платных', en: 'paid' }, freeN: { ru: 'бесплатных', en: 'free' }, paidPacks: { ru: 'платных', en: 'paid' },
  byType: { ru: 'По типам', en: 'By type' }, topItems: { ru: 'Самые популярные', en: 'Most popular' }, recentPurchases: { ru: 'Последние покупки', en: 'Recent purchases' },
  t_sticker_pack: { ru: 'Стикер-пак', en: 'Sticker pack' }, t_theme: { ru: 'Тема', en: 'Theme' }, t_background: { ru: 'Фон', en: 'Background' }, t_frame: { ru: 'Рамка', en: 'Frame' },
  s_published: { ru: 'Опубликован', en: 'Published' }, s_hidden: { ru: 'Скрыт', en: 'Hidden' }, s_draft: { ru: 'Черновик', en: 'Draft' },
  newItem: { ru: 'Новый товар', en: 'New item' }, editItem: { ru: 'Изменить товар', en: 'Edit item' },
  fType: { ru: 'Тип', en: 'Type' }, fName: { ru: 'Название', en: 'Name' }, fDesc: { ru: 'Описание', en: 'Description' }, fPreview: { ru: 'Ссылка на превью', en: 'Preview URL' },
  fPrice: { ru: 'Цена, ₽', en: 'Price, ₽' }, fTags: { ru: 'Теги через запятую', en: 'Tags, comma separated' }, fStatus: { ru: 'Статус', en: 'Status' },
  fFree: { ru: 'Бесплатный', en: 'Free' }, fOfficial: { ru: 'Официальный', en: 'Official' }, fNsfw: { ru: 'NSFW', en: 'NSFW' },
  official: { ru: 'Bloomly', en: 'Bloomly' }, owners: { ru: 'владельцев', en: 'owners' }, downloads: { ru: 'скачиваний', en: 'downloads' },
  hide: { ru: 'Скрыть', en: 'Hide' }, publish: { ru: 'Опубликовать', en: 'Publish' },
  confirmDeleteItem: { ru: 'Удалить товар? Он пропадёт из магазина, купившие сохранят доступ.', en: 'Delete this item? It leaves the shop; owners keep access.' },
  stickers: { ru: 'стикеров', en: 'stickers' }, collections: { ru: 'в коллекциях', en: 'in collections' }, uses: { ru: 'использований', en: 'uses' },
  vis: { ru: 'Доступ', en: 'Access' }, hidePack: { ru: 'Снять с публикации', en: 'Unpublish' }, publishPack: { ru: 'Вернуть в каталог', en: 'Republish' },
  confirmHidePack: { ru: 'Снять пак с публикации? Автор сможет опубликовать его снова.', en: 'Unpublish this pack? The author can publish it again.' },
  noRequests: { ru: 'Новых заявок нет', en: 'No pending requests' }, requestsHint: { ru: 'Решение по заявке принимает автор пака — здесь только просмотр.', en: 'The pack author decides on a request — view only here.' },
  wants: { ru: 'просит доступ к паку', en: 'requests access to' },

  // ── Den ──
  denOverview: { ru: 'Обзор', en: 'Overview' }, denListings: { ru: 'Лоты', en: 'Listings' }, denDisputes: { ru: 'Споры', en: 'Disputes' },
  denFairs: { ru: 'Ярмарки', en: 'Fairs' }, denFrames: { ru: 'Заявки на рамки', en: 'Frame requests' }, denGroups: { ru: 'Группы-продавцы', en: 'Seller groups' },
  kListings: { ru: 'Лотов', en: 'Listings' }, kActive: { ru: 'Активных', en: 'Active' }, kSold: { ru: 'Продано шт.', en: 'Units sold' },
  kViews: { ru: 'Просмотров', en: 'Views' }, kBids: { ru: 'Ставок', en: 'Bids' }, kDisputes: { ru: 'Открытых споров', en: 'Open disputes' },
  kApplications: { ru: 'Заявок на ярмарки', en: 'Fair applications' }, kFramesPending: { ru: 'Рамок на проверке', en: 'Frames pending' },
  kSellerGroups: { ru: 'Групп-продавцов', en: 'Seller groups' }, kReviews: { ru: 'Отзывов', en: 'Reviews' },
  newN: { ru: 'новых', en: 'new' }, draftsN: { ru: 'черновиков', en: 'drafts' }, archivedN: { ru: 'в архиве', en: 'archived' }, soldN: { ru: 'проданных', en: 'sold' },
  byKind: { ru: 'Активные по типу продажи', en: 'Active by sale type' }, byCategory: { ru: 'Активные по категориям', en: 'Active by category' },
  topSellers: { ru: 'Лучшие продавцы', en: 'Top sellers' }, tiers: { ru: 'Уровни доверия', en: 'Trust tiers' },
  deals: { ru: 'сделок', en: 'deals' }, lost: { ru: 'споров проиграно', en: 'disputes lost' }, score: { ru: 'доверие', en: 'trust' },
  k_fixed: { ru: 'Фикс. цена', en: 'Fixed price' }, k_auction: { ru: 'Аукцион', en: 'Auction' }, k_ych: { ru: 'YCH', en: 'YCH' }, k_raffle: { ru: 'Розыгрыш', en: 'Raffle' }, k_commission_queue: { ru: 'Очередь заказов', en: 'Commission queue' },
  ls_active: { ru: 'Активен', en: 'Active' }, ls_sold: { ru: 'Продан', en: 'Sold' }, ls_draft: { ru: 'Черновик', en: 'Draft' }, ls_archived: { ru: 'В архиве', en: 'Archived' },
  views: { ru: 'просм.', en: 'views' }, bids: { ru: 'ставок', en: 'bids' }, tickets: { ru: 'билетов', en: 'tickets' }, disputesN: { ru: 'споров', en: 'disputes' },
  reviewsN: { ru: 'отзывов', en: 'reviews' }, inStock: { ru: 'в наличии', en: 'in stock' }, soldUnits: { ru: 'продано', en: 'sold' },
  archive: { ru: 'В архив', en: 'Archive' }, restore: { ru: 'Вернуть', en: 'Restore' },
  confirmDeleteListing: { ru: 'Удалить лот? Он исчезнет из каталога.', en: 'Delete this listing? It leaves the catalogue.' },
  confirmArchiveListing: { ru: 'Убрать лот в архив?', en: 'Archive this listing?' },
  dOpen: { ru: 'Открытые', en: 'Open' }, dResolved: { ru: 'Решённые', en: 'Resolved' },
  buyer: { ru: 'Покупатель', en: 'Buyer' }, reason: { ru: 'Причина', en: 'Reason' }, sellerReply: { ru: 'Ответ продавца', en: 'Seller reply' }, noReply: { ru: 'Продавец ещё не ответил', en: 'No reply yet' },
  resolution: { ru: 'Решение', en: 'Resolution' }, winBuyer: { ru: 'Правда за покупателем', en: 'Buyer wins' }, winSeller: { ru: 'Правда за продавцом', en: 'Seller wins' },
  resolvedBuyer: { ru: 'В пользу покупателя', en: 'Buyer won' }, resolvedSeller: { ru: 'В пользу продавца', en: 'Seller won' },
  resolutionPrompt: { ru: 'Комментарий к решению (виден сторонам):', en: 'Resolution note (visible to both sides):' },
  noDisputes: { ru: 'Споров нет', en: 'No disputes' },
  newFair: { ru: 'Новая ярмарка', en: 'New fair' }, fTitle: { ru: 'Название', en: 'Title' }, fTheme: { ru: 'Тема', en: 'Theme' }, fBanner: { ru: 'Ссылка на баннер', en: 'Banner URL' },
  fStarts: { ru: 'Начало', en: 'Starts' }, fEnds: { ru: 'Окончание', en: 'Ends' },
  fs_upcoming: { ru: 'Скоро', en: 'Upcoming' }, fs_open: { ru: 'Идёт', en: 'Open' }, fs_closed: { ru: 'Закрыта', en: 'Closed' },
  applications: { ru: 'Заявки участников', en: 'Applications' }, approve: { ru: 'Одобрить', en: 'Approve' }, reject: { ru: 'Отклонить', en: 'Reject' },
  ps_pending: { ru: 'Ждёт', en: 'Pending' }, ps_approved: { ru: 'Одобрен', en: 'Approved' }, ps_rejected: { ru: 'Отклонён', en: 'Rejected' },
  noFairs: { ru: 'Ярмарок пока нет', en: 'No fairs yet' }, noParticipants: { ru: 'Заявок нет', en: 'No applications' }, participants: { ru: 'участников', en: 'participants' },
  fr_pending: { ru: 'На проверке', en: 'Pending' }, fr_approved: { ru: 'Одобрены', en: 'Approved' }, fr_rejected: { ru: 'Отклонены', en: 'Rejected' },
  noFrames: { ru: 'Заявок на рамки нет', en: 'No frame requests' }, rejectReason: { ru: 'Причина отказа (необязательно):', en: 'Rejection reason (optional):' },
  framePrice: { ru: 'Цена', en: 'Price' }, rejectedWhy: { ru: 'Причина', en: 'Reason' },
  agreed: { ru: 'подключена', en: 'connected' }, members: { ru: 'участников', en: 'members' }, activeListings: { ru: 'активных лотов', en: 'active listings' },
  disconnect: { ru: 'Отключить от Den', en: 'Disconnect' }, noGroups: { ru: 'Ни одна группа не подключена', en: 'No groups connected' },
  confirmDisconnect: { ru: 'Отключить группу от Dealers Den? Её лоты останутся, но создавать новые будет нельзя.', en: 'Disconnect this group from Dealers Den? Existing listings stay; new ones cannot be created.' },
  owner: { ru: 'Владелец', en: 'Owner' },
} as const

export type MarketKey = keyof typeof S

export function useMarketT() {
  const lang = useLangStore()
  return (key: MarketKey | (string & {})): string => {
    const row = (S as Record<string, { ru: string; en: string }>)[key]
    if (!row) return key
    return lang.currentLang === 'RU' ? row.ru : row.en
  }
}
