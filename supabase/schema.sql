-- ==========================================================================
-- BetTracker Pro - Supabase Database Schema
-- SQL script per l'inizializzazione della tabella tickets e indici
-- ==========================================================================

-- Abilita l'estensione pgcrypto per la generazione degli UUID se non abilitata
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Creazione tabella tickets
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency TEXT NOT NULL,
    event TEXT NOT NULL,
    outcome_played TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('aperto', 'vinto', 'perso')),
    emission_date DATE NOT NULL,
    competence_date DATE NOT NULL,
    odds NUMERIC(10, 2) NOT NULL CHECK (odds >= 1.00),
    amount_played NUMERIC(10, 2) NOT NULL CHECK (amount_played > 0),
    actual_winnings NUMERIC(10, 2) DEFAULT 0 CHECK (actual_winnings >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Abilitiamo Row Level Security (RLS) se necessario, ma per default 
-- lasceremo la tabella accessibile tramite la chiave pubblica di Supabase.
-- Se l'utente vuole stringere le policy, può farlo dal pannello Supabase.
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Creazione policy permissiva per lo sviluppo (consente lettura/scrittura con anon key)
DROP POLICY IF EXISTS "Consenti accesso completo a tutti con anon key" ON public.tickets;
CREATE POLICY "Consenti accesso completo a tutti con anon key" 
ON public.tickets 
FOR ALL 
TO anon 
USING (true) 
WITH CHECK (true);

-- Indici per ottimizzare i filtri e le ricerche
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_emission_date ON public.tickets(emission_date);
CREATE INDEX IF NOT EXISTS idx_tickets_competence_date ON public.tickets(competence_date);
CREATE INDEX IF NOT EXISTS idx_tickets_agency ON public.tickets(agency);

-- Creazione tabella agencies
CREATE TABLE IF NOT EXISTS public.agencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Abilitiamo Row Level Security (RLS) su agencies
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;

-- Creazione policy permissiva per lo sviluppo su agencies
DROP POLICY IF EXISTS "Consenti accesso completo a tutti con anon key su agencies" ON public.agencies;
CREATE POLICY "Consenti accesso completo a tutti con anon key su agencies" 
ON public.agencies 
FOR ALL 
TO anon 
USING (true) 
WITH CHECK (true);

-- Indice per ottimizzare la ricerca per nome
CREATE INDEX IF NOT EXISTS idx_agencies_name ON public.agencies(name);

-- Inseriamo agenzie di default per popolare l'applicazione
INSERT INTO public.agencies (name) VALUES 
('Eurobet'), 
('Goldbet'), 
('Planetwin365'), 
('SNAI'), 
('Bet365')
ON CONFLICT (name) DO NOTHING;
