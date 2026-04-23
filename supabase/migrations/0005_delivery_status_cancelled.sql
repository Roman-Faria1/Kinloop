alter type delivery_status add value if not exists 'cancelled';

create index if not exists notification_deliveries_event_status_idx
on notification_deliveries (event_id, status);
