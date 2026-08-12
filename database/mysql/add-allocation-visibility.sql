alter table product_allocations
  add column if not exists visible tinyint(1) not null default 1 after quantity;
