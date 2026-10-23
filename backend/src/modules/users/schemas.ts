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
  'Arctic Fox', 'Cow', 'Horse', 'Sheep', 'Goat', 'Pig',
  'Squirrel', 'Weasel', 'Badger', 'Serval', 'Caracal',
  'Cougar', 'Jaguar', 'Husky', 'Werewolf', 'Centaur',
  'Other',
] as const;

export type FursonaSpecies = typeof FURSONA_SPECIES[number];

export const updateUserSchema = {
  body: {
    type: 'object',
    properties: {
      display_name: { type: 'string', maxLength: 50 },
      bio:          { type: 'string', maxLength: 300 },
      avatar_url:   { type: 'string', maxLength: 500 },
      avatar_video_url: { type: 'string', maxLength: 500, nullable: true },
      banner_url:   { type: 'string', maxLength: 500 },
      status:       { type: 'string', maxLength: 100 },
      profile_status: {
        type: 'object',
        nullable: true,
        properties: {
          emoji:     { type: 'string', maxLength: 8 },
          text:      { type: 'string', maxLength: 60 },
          color:     { type: 'string', maxLength: 20 },
          expiresAt: { type: 'number' },
          music: {
            type: 'object',
            nullable: true,
            properties: {
              title:      { type: 'string', maxLength: 200 },
              artist:     { type: 'string', maxLength: 200 },
              artworkUrl: { type: 'string', maxLength: 500 },
              previewUrl: { type: 'string', maxLength: 500 },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
      persona:      { type: 'string', maxLength: 2000 },
      likes:        { type: 'array', maxItems: 100, items: { type: 'string', maxLength: 100 } },
      dislikes:     { type: 'array', maxItems: 100, items: { type: 'string', maxLength: 100 } },
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
      fursona_description:  { type: 'string', maxLength: 2000, nullable: true },
      fursona_photo_url:    { type: 'string', maxLength: 500, nullable: true },
      has_fursuit:          { type: 'boolean' },
      fursuit_photo_url:    { type: 'string', maxLength: 500, nullable: true },
      fursuit_description:  { type: 'string', maxLength: 2000, nullable: true },
      fursuit_maker:        { type: 'string', maxLength: 200, nullable: true },
      birth_date:           { type: 'string', maxLength: 30, nullable: true },
      birth_date_visibility: { type: 'string', enum: ['hidden', 'year', 'month_day', 'full'] },
      social_links:         {
        type: 'object',
        nullable: true,
        maxProperties: 20,
        additionalProperties: { type: 'string', maxLength: 500 },
      },
      interests:            { type: 'array', maxItems: 100, items: { type: 'string', maxLength: 100 }, nullable: true },
      fav_food:             { type: 'string', maxLength: 80, nullable: true },
      fav_animal:           { type: 'string', maxLength: 80, nullable: true },
      fav_music:            { type: 'string', maxLength: 80, nullable: true },
      fav_artist:           { type: 'string', maxLength: 80, nullable: true },
      fav_film:             { type: 'string', maxLength: 80, nullable: true },
      relationship_with:    { type: 'string', maxLength: 100, nullable: true },
      relationship_since:   { type: 'string', maxLength: 30, nullable: true },
      profile_theme:        { type: 'string', enum: ['default', 'violet', 'crimson', 'emerald', 'amber', 'ocean', 'sakura', 'night', null], nullable: true },
      profile_bg_url:       { type: 'string', maxLength: 500, nullable: true },
      profile_frame:        { type: 'string', enum: ['none', 'default_ring', 'gold', 'neon', 'rainbow', 'silver', 'fire', null], nullable: true },
      profile_frame_id:     { type: 'string', maxLength: 100, nullable: true },
      artist_since:         { type: 'string', format: 'date', nullable: true },
      onboarding_done:     { type: 'boolean' },
      donate_url:          { type: 'string', maxLength: 500, nullable: true },
      messages_privacy:         { type: 'string', enum: ['everyone', 'friends', 'nobody'] },
      forward_identity_privacy: { type: 'string', enum: ['everyone', 'friends', 'nobody'] },
      comments_privacy:         { type: 'string', enum: ['everyone', 'friends', 'nobody'] },
      mentions_privacy:         { type: 'string', enum: ['everyone', 'friends', 'nobody'] },
      online_status_visibility: { type: 'string', enum: ['everyone', 'friends', 'nobody'] },
      friends_list_visibility:  { type: 'string', enum: ['everyone', 'friends', 'only_me'] },
      profile_visibility:       { type: 'string', enum: ['everyone', 'friends', 'only_me'] },
      relationship_status_visibility: { type: 'string', enum: ['everyone', 'friends', 'only_me'] },
      groups_visibility:        { type: 'string', enum: ['everyone', 'friends', 'only_me'] },
      groups_pinned_only:       { type: 'boolean' },
      payment_region:           { type: 'string', maxLength: 10, nullable: true },
      commissions_status:       { type: 'string', enum: ['none', 'open', 'waitlist', 'closed'] },
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
      species_other: { type: 'string', maxLength: 50, nullable: true },
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
    },
    additionalProperties: false,
  },
};

// ── Fursona reference gallery schemas ─────────────────────────────────────────
export const upsertReferenceImageSchema = {
  body: {
    type: 'object',
    properties: {
      image_url: { type: 'string' },
      is_nsfw: { type: 'boolean' },
      artist_name: { type: ['string', 'null'], maxLength: 100 },
      artist_url:  { type: ['string', 'null'], maxLength: 500 },
    },
    additionalProperties: false,
  },
};

export const referenceImageIdParamSchema = {
  params: {
    type: 'object',
    required: ['fursonaId', 'refId'],
    properties: {
      fursonaId: { type: 'string', format: 'uuid' },
      refId: { type: 'string', format: 'uuid' },
    },
  },
};

export const fursonaIdParamSchema = {
  params: {
    type: 'object',
    required: ['fursonaId'],
    properties: {
      fursonaId: { type: 'string', format: 'uuid' },
    },
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

