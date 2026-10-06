-- Run this script in Supabase -> SQL Editor -> New query -> Run

-- ============ TABLES ============

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  native_language text default 'Română',
  onboarding_done boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.languages (
  code text primary key,
  name text not null,
  native_name text not null,
  flag text not null
);

create table if not exists public.domains (
  slug text primary key,
  name text not null,
  -- Kept for backwards compatibility; the interface derives a monogram from
  -- the name instead of showing an icon, so new rows may leave this empty.
  icon text not null default '',
  description text,
  topics text[] not null default '{}'
);

create table if not exists public.user_languages (
  user_id uuid references public.profiles(id) on delete cascade,
  language_code text references public.languages(code) on delete cascade,
  level text not null default 'A1' check (level in ('A1','A2','B1','B2','C1','C2')),
  created_at timestamptz default now(),
  primary key (user_id, language_code)
);

create table if not exists public.user_domains (
  user_id uuid references public.profiles(id) on delete cascade,
  language_code text references public.languages(code) on delete cascade,
  domain_slug text references public.domains(slug) on delete cascade,
  topics text[] not null default '{}',
  created_at timestamptz default now(),
  primary key (user_id, language_code, domain_slug)
);

-- AI-generated lessons are cached so the API is not called on every visit.
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  language_code text references public.languages(code) on delete cascade,
  domain_slug text references public.domains(slug) on delete cascade,
  topic text not null,
  level text not null,
  content jsonb not null,
  model text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  unique (language_code, domain_slug, topic, level)
);

create table if not exists public.user_progress (
  user_id uuid references public.profiles(id) on delete cascade,
  lesson_id uuid references public.lessons(id) on delete cascade,
  completed boolean default false,
  score int,
  total int,
  completed_at timestamptz,
  primary key (user_id, lesson_id)
);

-- ============ TRIGGER: auto-create profile on sign-up ============

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============ ROW LEVEL SECURITY ============

alter table public.profiles enable row level security;
alter table public.languages enable row level security;
alter table public.domains enable row level security;
alter table public.user_languages enable row level security;
alter table public.user_domains enable row level security;
alter table public.lessons enable row level security;
alter table public.user_progress enable row level security;

create policy "profiles: own" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "languages: read" on public.languages for select using (true);
create policy "domains: read" on public.domains for select using (true);
create policy "user_languages: own" on public.user_languages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_domains: own" on public.user_domains for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "lessons: read" on public.lessons for select using (auth.role() = 'authenticated');
create policy "lessons: insert" on public.lessons for insert with check (auth.uid() = created_by);
create policy "user_progress: own" on public.user_progress for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============ SEED: LANGUAGES ============

insert into public.languages (code, name, native_name, flag) values
  ('en', 'Engleză', 'English', '🇬🇧'),
  ('de', 'Germană', 'Deutsch', '🇩🇪'),
  ('fr', 'Franceză', 'Français', '🇫🇷'),
  ('es', 'Spaniolă', 'Español', '🇪🇸'),
  ('it', 'Italiană', 'Italiano', '🇮🇹'),
  ('pt', 'Portugheză', 'Português', '🇵🇹'),
  ('nl', 'Olandeză', 'Nederlands', '🇳🇱'),
  ('sv', 'Suedeză', 'Svenska', '🇸🇪'),
  ('no', 'Norvegiană', 'Norsk', '🇳🇴'),
  ('da', 'Daneză', 'Dansk', '🇩🇰'),
  ('fi', 'Finlandeză', 'Suomi', '🇫🇮'),
  ('pl', 'Poloneză', 'Polski', '🇵🇱'),
  ('cs', 'Cehă', 'Čeština', '🇨🇿'),
  ('hu', 'Maghiară', 'Magyar', '🇭🇺'),
  ('el', 'Greacă', 'Ελληνικά', '🇬🇷'),
  ('tr', 'Turcă', 'Türkçe', '🇹🇷'),
  ('ru', 'Rusă', 'Русский', '🇷🇺'),
  ('uk', 'Ucraineană', 'Українська', '🇺🇦'),
  ('ar', 'Arabă', 'العربية', '🇸🇦'),
  ('he', 'Ebraică', 'עברית', '🇮🇱'),
  ('hi', 'Hindi', 'हिन्दी', '🇮🇳'),
  ('zh', 'Chineză', '中文', '🇨🇳'),
  ('ja', 'Japoneză', '日本語', '🇯🇵'),
  ('ko', 'Coreeană', '한국어', '🇰🇷'),
  ('ro', 'Română', 'Română', '🇷🇴')
on conflict (code) do nothing;

-- ============ SEED: DOMAINS + TOPICS ============

insert into public.domains (slug, name, icon, description, topics) values
  ('it', 'IT & Software', '', 'Programare, DevOps, suport tehnic, management de produs',
    array['Interviu tehnic','Stand-up zilnic și Agile','Code review','Raportarea bug-urilor','Documentație tehnică','Suport clienți IT','Securitate cibernetică','Cloud și infrastructură','Prezentarea unui produs','E-mailuri profesionale']),
  ('medical', 'Medical', '', 'Medici, asistenți, farmaciști, personal spitalicesc',
    array['Anamneza pacientului','Simptome și diagnostic','Medicamente și dozaj','Urgențe','Anatomia corpului','Consultația la medicul de familie','Spital: internare și externare','Farmacie','Stomatologie','Sănătate mintală']),
  ('business', 'Business & Management', '', 'Întâlniri, negocieri, prezentări, leadership',
    array['Întâlniri de afaceri','Negocieri','Prezentări','E-mailuri formale','Leadership și echipe','Strategie și planificare','Networking','Resurse umane','Interviu de angajare','Small talk profesional']),
  ('finance', 'Finanțe & Contabilitate', '', 'Bănci, contabilitate, investiții, audit',
    array['Contabilitate de bază','Rapoarte financiare','Bănci și credite','Investiții și bursă','Taxe și impozite','Audit','Bugetare','Asigurări','Fintech și plăți','Analiză financiară']),
  ('legal', 'Juridic', '', 'Avocați, notari, contracte, drept internațional',
    array['Contracte','Terminologie juridică de bază','Drept comercial','Drept penal','Drept civil','Proceduri în instanță','Proprietate intelectuală','GDPR și confidențialitate','Imigrare și vize','Notariat']),
  ('marketing', 'Marketing & Vânzări', '', 'Publicitate, social media, branding, vânzări',
    array['Pitch de vânzare','Social media','Branding','Campanii publicitare','Analiza pieței','Relația cu clienții','E-commerce','Copywriting','SEO și conținut','Evenimente și PR']),
  ('tourism', 'Turism & Călătorii', '', 'Aeroport, hotel, ghid turistic, agenții',
    array['Aeroport și zbor','Check-in la hotel','Ghid turistic','Rezervări','Transport public','Direcții și orientare','Închirieri auto','Reclamații și probleme','Muzee și atracții','Agenție de turism']),
  ('horeca', 'HoReCa & Gastronomie', '', 'Restaurante, bucătărie, ospitalitate, baruri',
    array['Comanda la restaurant','Meniul și ingredientele','Bucătărie profesională','Servire și ospitalitate','Bar și băuturi','Alergii și restricții','Rezervări','Recenzii și feedback','Catering și evenimente','Igienă alimentară']),
  ('engineering', 'Inginerie & Construcții', '', 'Șantier, proiectare, mecanică, electrică',
    array['Șantier și siguranță','Materiale de construcție','Planuri și proiectare','Inginerie mecanică','Inginerie electrică','Utilaje și echipamente','Instalații sanitare','Arhitectură','Managementul proiectelor','Inspecții și autorizații']),
  ('automotive', 'Auto & Transport', '', 'Service auto, logistică, șoferi, transport',
    array['Service și reparații','Piese auto','Logistică și livrări','Șoferi profesioniști','Vânzări auto','Asigurare auto','Trafic și reguli','Vehicule electrice','Transport internațional','Închirieri']),
  ('education', 'Educație', '', 'Profesori, studenți, universitate, cercetare',
    array['Sala de clasă','Universitate și admitere','Cercetare academică','Prezentări și examene','Burse și Erasmus','Evaluare și note','Pedagogie','Predare online','Scriere academică','Consiliere educațională']),
  ('science', 'Științe', '', 'Biologie, chimie, fizică, laborator',
    array['Laborator','Biologie','Chimie','Fizică','Metoda științifică','Publicații și articole','Conferințe','Mediu și ecologie','Statistică','Astronomie']),
  ('agriculture', 'Agricultură', '', 'Fermă, culturi, zootehnie, echipamente',
    array['Ferma și culturi','Zootehnie','Echipamente agricole','Sezoane și recoltă','Piața agricolă','Agricultură ecologică','Irigații','Fonduri și subvenții','Viticultură','Horticultură']),
  ('retail', 'Retail & Comerț', '', 'Magazine, cumpărături, clienți, casă',
    array['La magazin','Casa de marcat','Retururi și garanții','Haine și mărimi','Electronice','Supermarket','Reduceri și promoții','Relația cu clienții','Inventar și stocuri','Comerț online']),
  ('realestate', 'Imobiliare', '', 'Chirii, vânzări, agenți, proprietăți',
    array['Închirierea unui apartament','Cumpărarea unei case','Vizionare','Contract de închiriere','Agent imobiliar','Credit ipotecar','Cartiere și localizare','Renovări','Utilități și facturi','Vecini și administrație']),
  ('sports', 'Sport & Fitness', '', 'Antrenament, sală, competiții, nutriție',
    array['La sala de fitness','Fotbal','Antrenament personal','Nutriție sportivă','Competiții','Accidentări și recuperare','Sporturi de iarnă','Înot','Yoga și wellness','Comentariu sportiv']),
  ('gaming', 'Gaming & eSports', '', 'Jocuri video, streaming, comunități',
    array['Vocabular de gaming','Streaming pe Twitch/YouTube','Comunicare în echipă','eSports și turnee','Game design','Hardware și PC','Jocuri mobile','Comunități online','Recenzii de jocuri','Speedrunning']),
  ('arts', 'Artă & Cultură', '', 'Muzică, film, pictură, teatru, literatură',
    array['Muzee și galerii','Muzică','Film și cinema','Teatru','Literatură','Fotografie','Design grafic','Dans','Istoria artei','Critică și recenzii']),
  ('media', 'Media & Jurnalism', '', 'Știri, interviuri, podcast, presă',
    array['Știri și titluri','Interviu','Podcast','Editorial și opinie','Fact-checking','Presă scrisă','Televiziune','Jurnalism digital','Fotojurnalism','Comunicare de criză']),
  ('psychology', 'Psihologie & Social', '', 'Terapie, asistență socială, consiliere',
    array['Consiliere','Emoții și sentimente','Terapie','Asistență socială','Psihologia copilului','Relații interpersonale','Stres și burnout','Dependențe','Psihologie organizațională','Voluntariat']),
  ('beauty', 'Beauty & Wellness', '', 'Salon, cosmetică, spa, îngrijire',
    array['La salon','Coafură','Cosmetică și machiaj','Manichiură','Spa și masaj','Îngrijirea pielii','Produse și ingrediente','Programări','Tendințe','Consultanță beauty']),
  ('aviation', 'Aviație & Maritim', '', 'Piloți, echipaj, porturi, navigație',
    array['Comunicare pilot-turn','Echipaj de cabină','Siguranța zborului','Meteo','Port și navigație','Echipaj maritim','Logistică portuară','Proceduri de urgență','Documente și vamă','Mentenanță aeronave']),
  ('military', 'Securitate & Apărare', '', 'Poliție, armată, pază, situații de urgență',
    array['Poliție','Pompieri','Pază și protecție','Situații de urgență','Grade și ierarhie','Rapoarte','Prim ajutor','Controlul frontierei','Investigații','Cooperare internațională']),
  ('everyday', 'Viața de zi cu zi', '', 'Conversații uzuale, familie, oraș, cumpărături',
    array['Salutări și prezentări','Familia','La cumpărături','Direcții în oraș','La medic','Timpul liber','Vremea','Locuința','Numere, ore și date','Telefon și mesaje']),
  ('religion', 'Religie & Filozofie', '', 'Tradiții, sărbători, etică, texte',
    array['Sărbători și tradiții','Locuri de cult','Etică','Filozofie antică','Texte sacre','Ritualuri','Dialog interreligios','Istoria religiilor','Meditație','Valori și morală'])
on conflict (slug) do nothing;

-- ============ LEVEL PROGRESSION ============
-- See migrations/002_level_progression.sql (kept separate so it can be re-run independently).
