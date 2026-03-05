export const getUserParamsSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', minLength: 1 },
    },
  },
};

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
      social_links:         { type: 'object', nullable: true },
      interests:            { type: 'array', items: { type: 'string' }, nullable: true },
      relationship_with:    { type: 'string', nullable: true },
      relationship_since:   { type: 'string', nullable: true },
      profile_theme:        { type: 'string', nullable: true },
      profile_bg_url:       { type: 'string', nullable: true },
      profile_frame:        { type: 'string', nullable: true },
      artist_since:         { type: 'string', format: 'date', nullable: true },
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

