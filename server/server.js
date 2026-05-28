/* ==========================================================================
   BetTracker Pro - Backend Express Server
   Connessione a Supabase ed Esposizione API REST
   ========================================================================== */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurazione CORS (consente l'accesso sia in locale che da GitHub Pages)
app.use(cors({
  origin: '*' // Permette richieste da qualsiasi origine per facilità di deploy statico
}));

app.use(express.json());

// Verifica la presenza delle variabili d'ambiente necessarie
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.error("ERRORE: Le variabili d'ambiente SUPABASE_URL e SUPABASE_KEY devono essere impostate.");
  process.exit(1);
}

// Inizializza il client Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ==========================================================================
// FUNZIONI DI MAPPING UTILITY
// Converte i nomi delle colonne da snake_case (PostgreSQL) a camelCase (JS Frontend)
// ==========================================================================
function toFrontend(t) {
  return {
    id: t.id,
    agency: t.agency,
    event: t.event,
    outcomePlayed: t.outcome_played,
    status: t.status,
    odds: parseFloat(t.odds),
    amountPlayed: parseFloat(t.amount_played),
    actualWinnings: parseFloat(t.actual_winnings || 0),
    emissionDate: t.emission_date,
    competenceDate: t.competence_date
  };
}

function toDatabase(t) {
  return {
    agency: t.agency,
    event: t.event,
    outcome_played: t.outcomePlayed,
    status: t.status,
    odds: parseFloat(t.odds),
    amount_played: parseFloat(t.amountPlayed),
    actual_winnings: parseFloat(t.actualWinnings || 0),
    emission_date: t.emissionDate,
    competence_date: t.competenceDate
  };
}

// ==========================================================================
// ROTTE API REST
// ==========================================================================

// 1. GET ALL TICKETS
app.get('/api/tickets', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .order('emission_date', { ascending: false });

    if (error) throw error;

    // Mappa i dati per il frontend
    const mappedTickets = data.map(toFrontend);
    res.json(mappedTickets);
  } catch (error) {
    console.error('Errore nel caricamento dei ticket:', error.message);
    res.status(500).json({ error: 'Errore durante il recupero dei ticket' });
  }
});

// 2. CREATE TICKET
app.post('/api/tickets', async (req, res) => {
  try {
    const ticketData = toDatabase(req.body);
    const { data, error } = await supabase
      .from('tickets')
      .insert([ticketData])
      .select();

    if (error) throw error;

    const newTicket = toFrontend(data[0]);
    res.status(201).json(newTicket);
  } catch (error) {
    console.error('Errore nella creazione del ticket:', error.message);
    res.status(500).json({ error: 'Errore durante la creazione del ticket' });
  }
});

// 2.1 CREATE BULK TICKETS (per inserimento massivo / dati demo / ripristino backup)
app.post('/api/tickets/bulk', async (req, res) => {
  try {
    if (!Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Il body deve essere un array di ticket' });
    }
    const ticketsData = req.body.map(toDatabase);
    const { data, error } = await supabase
      .from('tickets')
      .insert(ticketsData)
      .select();

    if (error) throw error;

    const newTickets = data.map(toFrontend);
    res.status(201).json(newTickets);
  } catch (error) {
    console.error('Errore nel caricamento massivo dei ticket:', error.message);
    res.status(500).json({ error: 'Errore durante l\'inserimento massivo dei ticket' });
  }
});

// 3. UPDATE TICKET
app.put('/api/tickets/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const ticketData = toDatabase(req.body);
    const { data, error } = await supabase
      .from('tickets')
      .update(ticketData)
      .eq('id', id)
      .select();

    if (error) throw error;

    if (data.length === 0) {
      return res.status(404).json({ error: 'Ticket non trovato' });
    }

    const updatedTicket = toFrontend(data[0]);
    res.json(updatedTicket);
  } catch (error) {
    console.error(`Errore nella modifica del ticket ${id}:`, error.message);
    res.status(500).json({ error: 'Errore durante la modifica del ticket' });
  }
});

// 4. DELETE TICKET
app.delete('/api/tickets/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('tickets')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ message: 'Ticket eliminato con successo', id });
  } catch (error) {
    console.error(`Errore nella cancellazione del ticket ${id}:`, error.message);
    res.status(500).json({ error: 'Errore durante l\'eliminazione del ticket' });
  }
});

// 5. DELETE ALL TICKETS (Reset Database)
app.delete('/api/tickets-all/reset', async (req, res) => {
  try {
    const { error } = await supabase
      .from('tickets')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Cancella tutti i record (UUID fittizio)

    if (error) throw error;

    res.json({ message: 'Tutti i ticket sono stati eliminati dal database' });
  } catch (error) {
    console.error('Errore nel reset del database:', error.message);
    res.status(500).json({ error: 'Errore durante lo svuotamento del database' });
  }
});

// ==========================================================================
// ROTTE API PER AGENZIE
// ==========================================================================

// 1. GET ALL AGENCIES
app.get('/api/agencies', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('agencies')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Errore nel caricamento delle agenzie:', error.message);
    res.status(500).json({ error: 'Errore durante il recupero delle agenzie' });
  }
});

// 2. CREATE AGENCY
app.post('/api/agencies', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Il nome dell\'agenzia è richiesto' });
    
    const { data, error } = await supabase
      .from('agencies')
      .insert([{ name }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (error) {
    console.error('Errore nella creazione dell\'agenzia:', error.message);
    res.status(500).json({ error: 'Errore durante la creazione dell\'agenzia' });
  }
});

// 3. DELETE AGENCY
app.delete('/api/agencies/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { error } = await supabase
      .from('agencies')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Agenzia eliminata con successo', id });
  } catch (error) {
    console.error(`Errore nella cancellazione dell'agenzia ${id}:`, error.message);
    res.status(500).json({ error: 'Errore durante l\'eliminazione dell\'agenzia' });
  }
});

// Rotta per il controllo dello stato (Healthcheck)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Avvio del server
app.listen(PORT, () => {
  console.log(`Server avviato correttamente sulla porta ${PORT}`);
});
