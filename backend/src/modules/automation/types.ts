export interface UpdateAutomationInput {
  auto_follow_back?:    boolean;
  mute_keywords?:       string[];
  quiet_hours_enabled?: boolean;
  quiet_hours_from?:    string;
  quiet_hours_to?:      string;
  notify_new_fan?:      boolean;
  notify_comment?:      boolean;
  notify_repaw?:        boolean;
  filter_spam?:         boolean;
}
