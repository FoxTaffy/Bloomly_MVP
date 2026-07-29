export const updateAutomationSchema = {
  body: {
    type: 'object',
    properties: {
      auto_follow_back:    { type: 'boolean' },
      mute_keywords:       { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 30 },
      quiet_hours_enabled: { type: 'boolean' },
      quiet_hours_from:    { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      quiet_hours_to:      { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      notify_new_fan:      { type: 'boolean' },
      notify_comment:      { type: 'boolean' },
      notify_repaw:        { type: 'boolean' },
      filter_spam:         { type: 'boolean' },
    },
    additionalProperties: false,
  },
};
