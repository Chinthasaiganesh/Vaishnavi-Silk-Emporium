-- Supabase PostgreSQL target schema. Apply after completing the backend
-- PostgreSQL adapter migration described in deployment.md.
create table if not exists users (
  user_id bigint generated always as identity primary key,
  username text unique not null,
  password_hash text not null,
  role text not null check (role in ('ADMIN', 'USER')),
  full_name text not null default '', display_name text not null default '',
  email text unique, avatar_url text, mobile_number text not null default '',
  preferences jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(), last_login timestamptz,
  oauth_provider text, oauth_subject text,
  unique (oauth_provider, oauth_subject)
);

create table if not exists categories (
  category_id bigint generated always as identity primary key,
  category_name text unique not null, description text not null default '',
  is_active boolean not null default true, created_date timestamptz not null default now(), updated_date timestamptz not null default now()
);

create table if not exists products (
  product_id bigint generated always as identity primary key,
  product_name text not null, description text not null, category text not null,
  price numeric(12,2) not null check (price >= 0), image_url text,
  quantity integer not null default 0 check (quantity >= 0),
  is_active boolean not null default false, is_featured boolean not null default false,
  fabric text not null default '', weaving_style text not null default '', colour text not null default '', occasion text not null default '',
  saree_length text not null default '5.5 metres', blouse_piece_included boolean not null default true,
  care_instructions text not null default '', rating numeric(2,1) not null default 4.5 check (rating between 0 and 5),
  created_date timestamptz not null default now(), updated_date timestamptz not null default now()
);

create table if not exists refresh_sessions (session_id uuid primary key, user_id bigint references users(user_id) on delete cascade, expires_at timestamptz not null, created_date timestamptz not null default now());
create table if not exists wishlists (wishlist_id bigint generated always as identity primary key, user_id bigint references users(user_id) on delete cascade, product_id bigint references products(product_id) on delete cascade, created_date timestamptz not null default now(), unique(user_id, product_id));
create table if not exists notification_subscriptions (subscription_id bigint generated always as identity primary key, user_id bigint references users(user_id) on delete cascade, product_id bigint references products(product_id) on delete cascade, notification_type text not null default 'BACK_IN_STOCK', is_active boolean not null default true, is_sent boolean not null default false, created_date timestamptz not null default now(), sent_date timestamptz, unique(user_id, product_id, notification_type));
create table if not exists notifications (notification_id bigint generated always as identity primary key, user_id bigint references users(user_id) on delete cascade, product_id bigint references products(product_id) on delete set null, type text not null, title text not null, message text not null, is_read boolean not null default false, created_date timestamptz not null default now());