create table if not exists price_lists (
  id text primary key,
  name text not null
);

create table if not exists partners (
  id text primary key,
  name text not null,
  code text not null,
  email text not null default '',
  billing_name text not null default '',
  billing_address text not null default '',
  siret text not null default '',
  vat_number text not null default '',
  active boolean not null default true,
  price_list_id text not null references price_lists(id)
);

alter table partners add column if not exists email text not null default '';
alter table partners add column if not exists billing_name text not null default '';
alter table partners add column if not exists billing_address text not null default '';
alter table partners add column if not exists siret text not null default '';
alter table partners add column if not exists vat_number text not null default '';

create table if not exists products (
  id text primary key,
  name text not null,
  category text not null check (category in ('Légumes', 'Bières')),
  unit text not null check (unit in ('kg', 'piece', 'unite', 'carton')),
  stock numeric(10, 2) not null default 0,
  active boolean not null default true,
  sort_order integer not null default 100
);

create table if not exists product_prices (
  price_list_id text not null references price_lists(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  price numeric(10, 4) not null default 0,
  primary key (price_list_id, product_id)
);

create table if not exists product_allocations (
  delivery_date date not null,
  partner_id text not null references partners(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  quantity numeric(10, 2) not null default 0,
  visible boolean not null default true,
  primary key (delivery_date, partner_id, product_id)
);

create table if not exists basket_templates (
  id text primary key,
  name text not null,
  partner_id text not null references partners(id) on delete cascade,
  active boolean not null default true
);

create table if not exists basket_template_items (
  basket_id text not null references basket_templates(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  quantity numeric(10, 2) not null,
  sort_order integer not null default 0,
  primary key (basket_id, product_id)
);

create table if not exists orders (
  id uuid primary key,
  partner_id text not null references partners(id),
  delivery_date date not null,
  harvest_day text not null check (harvest_day in ('lundi', 'jeudi')),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  total numeric(10, 2) not null default 0,
  comment text not null default ''
);

create table if not exists order_items (
  id uuid primary key,
  order_id uuid not null references orders(id) on delete cascade,
  product_id text not null references products(id),
  product_name text not null,
  category text not null,
  unit text not null,
  quantity numeric(10, 2) not null,
  unit_price numeric(10, 4) not null
);

create index if not exists orders_delivery_date_idx on orders(delivery_date);
create index if not exists order_items_order_id_idx on order_items(order_id);

insert into price_lists (id, name) values
  ('tarif-epicerie', 'Tarif épicerie'),
  ('tarif-mercuriale-2026', 'Mercuriale 2026 La Ravoire')
on conflict (id) do update set name = excluded.name;

insert into partners (id, name, code, email, active, price_list_id) values
  ('epicerie-du-coin', 'Épicerie du Coin', 'EPICERIE', 'contact@epicerie-du-coing.fr', true, 'tarif-epicerie'),
  ('la-fourmiliene', 'La Fourmiliène', 'FOURMILIENE', 'fourmilienne@gmail.com', true, 'tarif-epicerie'),
  ('auberge-savoyarde', 'L''Auberge Savoyarde', 'AUBERGE', 'sarl-gtt@orange.fr', true, 'tarif-epicerie'),
  ('biocoop-macher', 'Biocoop Mâcher', 'BIOMACHER', 'magasin@biocoop-chambery.com', true, 'tarif-epicerie'),
  ('halles-de-chartreuse', 'Les Halles de Chartreuse', 'HALLESCHARTREUSE', '', true, 'tarif-epicerie'),
  ('co-clipcho', 'Coclich''haut', 'COCLIPCHO', 'appro@coclic-haut.fr', true, 'tarif-epicerie'),
  ('satoriz-la-ravoire', 'Satoriz La Ravoire', 'SATORIZRAVOIRE', 'laravoire@satoriz.fr', true, 'tarif-mercuriale-2026'),
  ('satoriz-chambery', 'Satoriz Chambéry', 'SATORIZCHAMBERY', 'chambery@satoriz.fr', true, 'tarif-mercuriale-2026'),
  ('biocoop-pont-beauvoisin', 'Biocoop Pont-de-Beauvoisin', 'BIOPONTBEAUVOISIN', 'magasin@biocoopbeauvoisin.fr', true, 'tarif-mercuriale-2026'),
  ('client-test', 'Client test', 'TESTCLIENT', 'atraverschamps73@gmail.com', true, 'tarif-epicerie')
on conflict (id) do update set
  name = excluded.name,
  code = excluded.code,
  email = excluded.email,
  active = excluded.active,
  price_list_id = excluded.price_list_id;

-- Ensuite, executer supabase/seed-data.sql pour importer tous les produits et tous les prix.
