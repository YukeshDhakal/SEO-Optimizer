create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stripe_price_id text,
  monthly_post_quota int not null,
  ai_token_soft_cap int,
  seats int not null default 1,
  features jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table subscriptions (
  organization_id uuid primary key references organizations(id) on delete cascade,
  stripe_subscription_id text unique,
  plan_id uuid references plans(id),
  status text not null default 'active' check (status in ('active','past_due','canceled','incomplete')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table usage_counters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  posts_generated int not null default 0,
  ai_tokens_used bigint not null default 0,
  ai_cost_usd numeric(10,4) not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, period_start)
);
create index idx_usage_counters_org_period on usage_counters(organization_id, period_start);

-- Seed 3 tiers. stripe_price_id stays NULL until real Stripe Products exist
-- in the dashboard (no STRIPE_SECRET_KEY available in this environment to
-- create them via the API) - fill these in manually, then update the row.
insert into plans (name, monthly_post_quota, seats, features) values
  ('Starter', 8, 1, '{"sites": 1, "cms_adapters": ["hosted_blog"]}'),
  ('Growth', 30, 3, '{"sites": 5, "cms_adapters": ["hosted_blog", "wordpress", "shopify", "webflow"]}'),
  ('Agency', 120, 10, '{"sites": 25, "cms_adapters": ["hosted_blog", "wordpress", "shopify", "webflow"], "priority_support": true}');

alter table plans enable row level security;
alter table subscriptions enable row level security;
alter table usage_counters enable row level security;

-- Plans are pricing, not tenant data - readable by any authenticated user
-- (needed to render a "choose a plan" screen before an org even has a
-- subscription row yet). No insert/update/delete policy for anyone except
-- the (bypasses-RLS) service role - plans are managed by whoever runs
-- migrations, not through the app.
create policy plans_select_authenticated on plans
  for select to authenticated using (true);

create policy subscriptions_select_member on subscriptions
  for select to authenticated using (is_org_member(organization_id));

create policy usage_counters_select_member on usage_counters
  for select to authenticated using (is_org_member(organization_id));
