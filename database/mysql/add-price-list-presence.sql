-- À exécuter uniquement après une sauvegarde vérifiée de product_prices.
-- Les références déjà présentes restent cochées. Les prix sont conservés lors des retraits futurs.
alter table product_prices add column listed tinyint(1) not null default 1;
