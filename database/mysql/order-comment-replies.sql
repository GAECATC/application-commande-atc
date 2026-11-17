create table if not exists order_comment_replies (
  id char(36) primary key,
  order_id char(36) not null,
  message text not null,
  customer_comment text not null,
  recipient varchar(255) not null,
  created_at varchar(32) not null,
  email_status varchar(16) not null,
  index order_comment_replies_order_idx (order_id),
  constraint order_comment_replies_order_fk foreign key (order_id) references orders(id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
