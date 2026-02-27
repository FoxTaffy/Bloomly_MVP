export const getUserParamsSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
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

