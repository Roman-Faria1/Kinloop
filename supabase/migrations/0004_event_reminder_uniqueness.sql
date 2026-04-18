delete from event_reminders left_reminder
using event_reminders right_reminder
where left_reminder.event_id = right_reminder.event_id
  and left_reminder.id > right_reminder.id;

create unique index if not exists event_reminders_event_id_idx
on event_reminders (event_id);
