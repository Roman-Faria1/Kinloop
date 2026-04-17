create table if not exists auth_rate_limits (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null,
  ip_hash text not null,
  outcome text not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_rate_limits_email_hash_created_at_idx
on auth_rate_limits (email_hash, created_at desc);

create index if not exists auth_rate_limits_ip_hash_created_at_idx
on auth_rate_limits (ip_hash, created_at desc);

alter table auth_rate_limits enable row level security;
