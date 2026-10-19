// Схема тела PATCH /groups/:id. Пустая строка в ряде полей — штатное «очистить» от формы настроек,
// поэтому паттерны допускают ''. Лишние поля Fastify отбрасывает сам (removeAdditional).
const nullableStr = (maxLength: number) => ({ type: 'string', maxLength, nullable: true });

export const updateGroupSchema = {
  body: {
    type: 'object',
    properties: {
      name:          { type: 'string', maxLength: 200 },
      slug:          { type: 'string', maxLength: 200 },
      description:   { type: 'string', maxLength: 5000 },
      avatarUrl:     { type: 'string', maxLength: 500 },
      bannerUrl:     { type: 'string', maxLength: 500 },
      accentColor:   { type: 'string', pattern: '^(#[0-9A-Fa-f]{6})?$' },
      socialLinks:   { type: 'object', maxProperties: 20, additionalProperties: { type: 'string', maxLength: 500 } },
      isPublic:      { type: 'boolean' },
      rulesText:     { type: 'string', maxLength: 20000 },
      faq: {
        type: 'array', maxItems: 50,
        items: { type: 'object', properties: { q: { type: 'string', maxLength: 300 }, a: { type: 'string', maxLength: 2000 } } },
      },
      contactPhone:  { type: 'string', maxLength: 30 },
      contactEmail:  { type: 'string', maxLength: 120 },
      aboutText:     { type: 'string', maxLength: 20000 },
      schedule: {
        type: 'array', maxItems: 100,
        items: { type: 'object', properties: { time: { type: 'string', maxLength: 50 }, label: { type: 'string', maxLength: 300 } } },
      },
      whatToBring:   { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 200 } },
      isNsfw:        { type: 'boolean' },
      productionTime: { type: 'string', maxLength: 100 },
      deliveryInfo:  { type: 'string', maxLength: 200 },
      completedWorks: { type: 'integer', minimum: 0, maximum: 1000000 },
      guaranteeText: { type: 'string', maxLength: 300 },
      category:      { type: 'string', maxLength: 50 },
      rubric:        nullableStr(50),
      isVerified:    { type: 'boolean' },
      groupBgUrl:    { type: 'string', maxLength: 500 },
      groupFrame:    { type: 'string', maxLength: 100 },
      groupTheme:    { type: 'string', maxLength: 100 },
      hideAdmins:    { type: 'boolean' },
      hiddenMemberIds: { type: 'array', maxItems: 1000, items: { type: 'string', format: 'uuid' } },
      donationsEnabled: { type: 'boolean' },
      // Клиент отправляет только маску; полный номер карты сервер хранить не должен
      bankCardMasked: { type: 'string', nullable: true, pattern: '^(\\*{4} \\*{4} \\*{4} \\d{4})?$' },
      supportTiers: {
        type: 'array', maxItems: 20,
        items: {
          type: 'object',
          properties: {
            emoji: { type: 'string', maxLength: 16 },
            name:  { type: 'string', maxLength: 60 },
            price: { type: 'string', maxLength: 30 },
            currency: { type: 'string', enum: ['RUB', 'USD', 'EUR', 'CNY', 'INR', 'BRL'] },
            desc:  { type: 'string', maxLength: 300 },
          },
        },
      },
      businessEnabled:    { type: 'boolean' },
      welcomeMsgEnabled:  { type: 'boolean' },
      welcomeMsgText:     { type: 'string', maxLength: 300 },
    },
  },
};
