export const getUserParamsSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 },
    },
  },
};

// ── Hardcoded species list (multi-species fursonas supported) ─────────────────
export const FURSONA_SPECIES = [
  'Canine', 'Feline', 'Dragon', 'Protogen', 'Avian', 'Equine',
  'Reptile', 'Rodent', 'Ursine', 'Bovine', 'Cervine', 'Mustelid',
  'Sergal', 'Dutch Angel Dragon', 'Shark', 'Bat', 'Fox', 'Wolf',
  'Rabbit', 'Tiger', 'Hyena', 'Synth', 'Wickerbeast',
  'Lion', 'Leopard', 'Snow Leopard', 'Cheetah', 'Lynx',
  'Raccoon', 'Red Panda', 'Skunk', 'Opossum', 'Coyote',
  'Jackal', 'Panda', 'Dolphin', 'Orca', 'Seal',
  'Gryphon', 'Phoenix', 'Unicorn', 'Naga', 'Frog',
  'Maned Wolf', 'African Wild Dog', 'Kitsune', 'Tanuki', 'Kirin',
  'Wyvern', 'Kangaroo', 'Hedgehog', 'Otter', 'Ferret',
  'Meerkat', 'Axolotl', 'Octopus', 'Salamander', 'Primate',
  'Demon', 'Angel', 'Alien', 'Kobold', 'Sphinx',
  'Other',
] as const;

export type FursonaSpecies = typeof FURSONA_SPECIES[number];

export const updateUserSchema = {
  body: {
    type: 'object',
    properties: {
      display_name: { type: 'string', maxLength: 50 },
      bio:          { type: 'string', maxLength: 300 },
      avatar_url:   { type: 'string' },
      banner_url:   { type: 'string' },
      status:       { type: 'string', maxLength: 100 },
      persona:      { type: 'string' },
      likes:        { type: 'array', items: { type: 'string' } },
      dislikes:     { type: 'array', items: { type: 'string' } },
      accent_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
      website:      { type: 'string', maxLength: 200 },
      location:     { type: 'string', maxLength: 100 },
      pronouns:     { type: 'string', maxLength: 30 },
      job_title:            { type: 'string', maxLength: 80 },
      relationship_status:  { type: 'string', maxLength: 50 },
      country:              { type: 'string', maxLength: 80 },
      fursona_name:         { type: 'string', maxLength: 80, nullable: true },
      fursona_color:        { type: 'string', maxLength: 50, nullable: true },
      fursona_gender:       { type: 'string', maxLength: 50, nullable: true },
      fursona_description:  { type: 'string', nullable: true },
      fursona_photo_url:    { type: 'string', nullable: true },
      has_fursuit:          { type: 'boolean' },
      fursuit_photo_url:    { type: 'string', nullable: true },
      fursuit_description:  { type: 'string', nullable: true },
      fursuit_maker:        { type: 'string', maxLength: 200, nullable: true },
      birth_date:           { type: 'string', nullable: true },
      social_links:         {
        type: 'object',
        nullable: true,
        maxProperties: 20,
        additionalProperties: { type: 'string', maxLength: 500 },
      },
      interests:            { type: 'array', items: { type: 'string' }, nullable: true },
      relationship_with:    { type: 'string', nullable: true },
      relationship_since:   { type: 'string', nullable: true },
      profile_theme:        { type: 'string', nullable: true },
      profile_bg_url:       { type: 'string', nullable: true },
      profile_frame:        { type: 'string', nullable: true },
      artist_since:         { type: 'string', format: 'date', nullable: true },
      onboarding_done:     { type: 'boolean' },
      allow_messages:      { type: 'boolean' },
      donate_url:          { type: 'string', maxLength: 500, nullable: true },
    },
    additionalProperties: false,
  },
};

export const updateUsernameSchema = {
  body: {
    type: 'object',
    required: ['username'],
    properties: {
      username: { type: 'string', minLength: 3, maxLength: 30, pattern: '^[a-z0-9_]+$' },
    },
    additionalProperties: false,
  },
};

export const pinPostSchema = {
  params: {
    type: 'object',
    required: ['postId'],
    properties: {
      postId: { type: 'string', format: 'uuid' },
    },
  },
};

// ── Fursona upsert schema ─────────────────────────────────────────────────────
export const updateFursonaSchema = {
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', maxLength: 80 },
      species: {
        type: 'array',
        items: { type: 'string', enum: [...FURSONA_SPECIES] },
        maxItems: 5,
      },
      colors: {
        type: 'array',
        // Each color must be a valid 6-digit hex
        items: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
        maxItems: 10,
      },
      likes_dislikes_visible: { type: 'boolean' },
      likes: {
        type: 'array',
        items: { type: 'string', maxLength: 100 },
        maxItems: 30,
      },
      dislikes: {
        type: 'array',
        items: { type: 'string', maxLength: 100 },
        maxItems: 30,
      },
      reference_image_url: { type: ['string', 'null'] },
      reference_is_nsfw: { type: 'boolean' },
      reference_artist_name: { type: ['string', 'null'], maxLength: 100 },
      reference_artist_url:  { type: ['string', 'null'], maxLength: 500 },
    },
    additionalProperties: false,
  },
};

// ── Fursuit create/update schema ──────────────────────────────────────────────
export const updateFursuitSchema = {
  body: {
    type: 'object',
    properties: {
      image_url: { type: ['string', 'null'] },
      // Internal Bloomly group/user UUID (the verified maker)
      maker_id: { type: ['string', 'null'], format: 'uuid' },
      // Up to 3 external social/shop links when maker is not on Bloomly
      external_maker_links: {
        type: 'array',
        items: { type: 'string', maxLength: 500 },
        maxItems: 3,
      },
      description: { type: 'string', maxLength: 2000, nullable: true },
      is_nsfw: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};

export const fursuitIdParamSchema = {
  params: {
    type: 'object',
    required: ['fursuitId'],
    properties: {
      fursuitId: { type: 'string', format: 'uuid' },
    },
  },
};

