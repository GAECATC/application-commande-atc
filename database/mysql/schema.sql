create table if not exists price_lists (
  id varchar(191) primary key,
  name varchar(255) not null
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists partners (
  id varchar(191) primary key,
  name varchar(255) not null,
  code varchar(191) not null,
  email varchar(255) not null default '',
  billing_name varchar(255) not null default '',
  billing_address text not null,
  siret varchar(64) not null default '',
  vat_number varchar(64) not null default '',
  active tinyint(1) not null default 1,
  price_list_id varchar(191) not null,
  constraint partners_price_list_fk foreign key (price_list_id) references price_lists(id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists products (
  id varchar(191) primary key,
  name varchar(255) not null,
  category varchar(191) not null,
  unit varchar(64) not null,
  stock decimal(10, 2) not null default 0,
  active tinyint(1) not null default 1,
  sort_order int not null default 100
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists product_prices (
  price_list_id varchar(191) not null,
  product_id varchar(191) not null,
  price decimal(10, 4) not null default 0,
  primary key (price_list_id, product_id),
  constraint product_prices_price_list_fk foreign key (price_list_id) references price_lists(id) on delete cascade,
  constraint product_prices_product_fk foreign key (product_id) references products(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists product_allocations (
  delivery_date date not null,
  partner_id varchar(191) not null,
  product_id varchar(191) not null,
  quantity decimal(10, 2) not null default 0,
  visible tinyint(1) not null default 1,
  primary key (delivery_date, partner_id, product_id),
  constraint product_allocations_partner_fk foreign key (partner_id) references partners(id) on delete cascade,
  constraint product_allocations_product_fk foreign key (product_id) references products(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists basket_templates (
  id varchar(191) primary key,
  name varchar(255) not null,
  partner_id varchar(191) not null,
  active tinyint(1) not null default 1,
  constraint basket_templates_partner_fk foreign key (partner_id) references partners(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists basket_template_items (
  basket_id varchar(191) not null,
  product_id varchar(191) not null,
  quantity decimal(10, 2) not null,
  sort_order int not null default 0,
  primary key (basket_id, product_id),
  constraint basket_template_items_basket_fk foreign key (basket_id) references basket_templates(id) on delete cascade,
  constraint basket_template_items_product_fk foreign key (product_id) references products(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists orders (
  id char(36) primary key,
  partner_id varchar(191) not null,
  delivery_date date not null,
  harvest_day varchar(32) not null,
  status varchar(32) not null default 'active',
  created_at datetime(3) not null,
  total decimal(10, 2) not null default 0,
  customer_comment text null,
  constraint orders_partner_fk foreign key (partner_id) references partners(id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists order_items (
  id char(36) primary key,
  order_id char(36) not null,
  product_id varchar(191) not null,
  product_name varchar(255) not null,
  category varchar(191) not null,
  unit varchar(64) not null,
  quantity decimal(10, 2) not null,
  unit_price decimal(10, 4) not null,
  constraint order_items_order_fk foreign key (order_id) references orders(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists applied_migrations (
  id varchar(191) primary key,
  applied_at datetime(3) not null default current_timestamp(3)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create index orders_delivery_date_idx on orders(delivery_date);
create index orders_partner_id_idx on orders(partner_id);
create index orders_status_idx on orders(status);
create index order_items_order_id_idx on order_items(order_id);
