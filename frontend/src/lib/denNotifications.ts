// Dealers' Den notification types ("den_price_drop", ...) and how they are shown.
// Each type has a translation key "notifDen<PascalCase>" describing the action, e.g.
// den_price_drop -> notifDenPriceDrop.

export function isDenNotification(type: string): boolean {
  return type.startsWith('den_')
}

export function denNotificationKey(type: string): string {
  const pascal = type.slice('den_'.length).split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  return `notifDen${pascal}`
}

export const DEN_NOTIFICATION_ICONS: Record<string, string> = {
  den_price_drop: 'Tag',
  den_slots_available: 'ListOrdered',
  den_commission_booked: 'ListOrdered',
  den_lot_application: 'Send',
  den_application_accepted: 'CheckCircle2',
  den_application_declined: 'XCircle',
  den_order_sketch: 'PenLine',
  den_order_lineart: 'PenTool',
  den_order_coloring: 'Palette',
  den_order_finished: 'PartyPopper',
  den_order_paid: 'CreditCard',
  den_queue_moved: 'ListOrdered',
  den_dispute_auto_resolved: 'AlertTriangle',
  den_dispute_resolved: 'AlertTriangle',
  den_review: 'Star',
  den_top_week: 'Trophy',
  den_raffle_won: 'Gift',
  den_auction_won: 'Hammer',
}
