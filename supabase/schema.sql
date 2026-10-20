-- Consolle Preventivi GETTONIERE-SHOP — schema Supabase (PostgreSQL)
-- Esegui in: Supabase > SQL Editor. Idempotente dove possibile.

create extension if not exists pgcrypto;

-- ───────── CLIENTI ─────────
create table if not exists clienti (
  id          uuid primary key default gen_random_uuid(),
  legacy_id   text unique,                 -- id della rubrica originale (Danea/Excel)
  azienda     text not null default '',
  referente   text not null default '',
  indirizzo   text not null default '',
  citta       text not null default '',    -- "CAP Città (Prov)" come nell'originale
  piva_cf     text not null default '',
  email       text not null default '',
  telefono    text not null default '',
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists clienti_azienda_idx on clienti using gin (to_tsvector('simple', azienda || ' ' || referente || ' ' || citta));

-- ───────── PRODOTTI ─────────
create table if not exists prodotti (
  sku         text primary key,
  nome        text not null,
  descrizione text not null default '',
  prezzo      numeric(10,2) not null default 0,   -- IVA esclusa
  categoria   text not null default '',
  foto_url    text not null default '',
  url_sito    text not null default '',
  attivo      boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- ───────── PREVENTIVI ─────────
create type stato_preventivo as enum ('bozza','inviato','accettato','perso');

create table if not exists preventivi (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null unique,             -- es. PREV-2026-001
  data             date not null default current_date,
  stato            stato_preventivo not null default 'bozza',
  cliente_id       uuid references clienti(id) on delete set null,
  -- snapshot cliente (il preventivo non cambia se cambia la rubrica)
  cli_azienda      text not null default '',
  cli_referente    text not null default '',
  cli_indirizzo    text not null default '',
  cli_citta        text not null default '',
  cli_piva_cf      text not null default '',
  cli_email        text not null default '',
  cli_telefono     text not null default '',
  -- condizioni commerciali
  pagamento        text not null default 'Bonifico vista fattura',
  validita         text not null default '30 giorni',
  consegna         text not null default '',
  resa             text not null default '',
  garanzia         text not null default '',
  note             text not null default '',
  -- trasporto
  trasp_descr      text not null default 'Spedizione corriere',
  trasp_costo      numeric(10,2) not null default 0,  -- IVA esclusa, IVA 22%
  -- totali (calcolati dal client, salvati per KPI/archivio)
  imponibile       numeric(12,2) not null default 0,
  iva              numeric(12,2) not null default 0,
  totale           numeric(12,2) not null default 0,
  inviato_il       timestamptz,
  chiuso_il        timestamptz,
  created_by       text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists preventivi_stato_idx on preventivi(stato);
create index if not exists preventivi_data_idx on preventivi(data desc);

-- ───────── RIGHE ─────────
create table if not exists righe_preventivo (
  id            uuid primary key default gen_random_uuid(),
  preventivo_id uuid not null references preventivi(id) on delete cascade,
  posizione     int  not null,
  sku           text not null default '',
  descrizione   text not null default '',
  quantita      numeric(10,2) not null default 1,
  prezzo_unit   numeric(10,2) not null default 0,   -- IVA esclusa
  sconto_pct    numeric(5,2)  not null default 0,
  iva_pct       numeric(4,1)  not null default 22,
  nota          text not null default '',
  foto_url      text not null default ''
);
create index if not exists righe_prev_idx on righe_preventivo(preventivo_id, posizione);

-- ───────── STORICO MODIFICHE ─────────
create table if not exists storico_preventivo (
  id            bigint generated always as identity primary key,
  preventivo_id uuid not null references preventivi(id) on delete cascade,
  quando        timestamptz not null default now(),
  utente        text not null default '',
  evento        text not null,            -- creato | modificato | stato | email | pdf
  dettaglio     jsonb not null default '{}'::jsonb
);
create index if not exists storico_prev_idx on storico_preventivo(preventivo_id, quando desc);

-- ───────── CONTATORE NUMERO PREVENTIVO ─────────
create table if not exists contatori (anno int primary key, ultimo int not null default 0);
create or replace function prossimo_numero_preventivo() returns text
language plpgsql as $$
declare a int := extract(year from current_date); n int;
begin
  insert into contatori(anno,ultimo) values (a,1)
    on conflict (anno) do update set ultimo = contatori.ultimo + 1
    returning ultimo into n;
  return 'PREV-' || a || '-' || lpad(n::text,3,'0');
end $$;

-- ───────── updated_at automatico ─────────
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['clienti','prodotti','preventivi'] loop
    execute format('drop trigger if exists trg_upd on %I; create trigger trg_upd before update on %I for each row execute function set_updated_at();',t,t);
  end loop; end $$;

-- ───────── VISTA KPI ─────────
create or replace view v_kpi_mese as
select date_trunc('month', data)::date as mese,
       count(*)                                         as n_preventivi,
       coalesce(sum(totale),0)                          as totale_offerto,
       count(*) filter (where stato='accettato')        as n_accettati,
       count(*) filter (where stato in ('accettato','perso')) as n_chiusi,
       coalesce(sum(totale) filter (where stato='accettato'),0) as totale_accettato,
       round(100.0 * count(*) filter (where stato='accettato')
             / nullif(count(*) filter (where stato in ('accettato','perso')),0),1) as tasso_conversione_pct
from preventivi where stato <> 'bozza' or true
group by 1 order by 1 desc;

-- ───────── UTENTI (accesso con email + password) ─────────
create table if not exists utenti (
  email         text primary key,
  nome          text not null default '',
  password_hash text not null,           -- scrypt, mai la password in chiaro
  attivo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists trg_upd on utenti;
create trigger trg_upd before update on utenti for each row execute function set_updated_at();
alter table utenti enable row level security;

-- ───────── SICUREZZA (RLS) ─────────
-- L'accesso avviene SOLO tramite le funzioni serverless di Vercel (/api/*) con la
-- service_role key, dopo la verifica del PIN. Le tabelle sono quindi chiuse al
-- ruolo anon: nessuna policy = nessun accesso diretto dal browser.
alter table clienti            enable row level security;
alter table prodotti           enable row level security;
alter table preventivi         enable row level security;
alter table righe_preventivo   enable row level security;
alter table storico_preventivo enable row level security;
alter table contatori          enable row level security;
