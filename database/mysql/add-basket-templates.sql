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
