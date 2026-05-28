/* ==========================================================================
   BetTracker Pro - App Logic
   Gestione dello Stato, Logica CRUD, Filtri Avanzati, Grafici ed Esportazione Excel
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  
  // ==========================================================================
  // 1. STATO DELL'APPLICAZIONE
  // ==========================================================================
  let tickets = [];
  let agenciesList = [
    { id: 'default-1', name: 'Eurobet', created_at: '2026-05-28T00:00:00Z' },
    { id: 'default-2', name: 'Goldbet', created_at: '2026-05-28T00:00:00Z' },
    { id: 'default-3', name: 'Planetwin365', created_at: '2026-05-28T00:00:00Z' },
    { id: 'default-4', name: 'SNAI', created_at: '2026-05-28T00:00:00Z' },
    { id: 'default-5', name: 'Bet365', created_at: '2026-05-28T00:00:00Z' }
  ];
  let charts = {
    netProfit: null,
    agencyVolume: null
  };
  let ticketToDeleteId = null;
  let chartUpdateTimeout = null;

  // Funzione per aggiornare graficamente lo stato di connessione al database
  function updateDbStatus(status) {
    const dot = document.getElementById('db-status-dot');
    const text = document.getElementById('db-status-text');
    if (!dot || !text) return;

    dot.className = 'db-status-dot';
    if (status === 'online') {
      dot.classList.add('online');
      text.textContent = 'Cloud Sync Attivo';
    } else if (status === 'offline') {
      dot.classList.add('offline');
      text.textContent = 'Modalità Locale (Offline)';
    } else {
      dot.classList.add('connecting');
      text.textContent = 'Verifica connessione...';
    }
  }



  // ==========================================================================
  // 2. FUNZIONI DI PERSISTENZA, CARICAMENTO E BACKUP
  // ==========================================================================
  
  // URL del Backend (su localhost o Render)
  const API_URL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://ticktracker.onrender.com';

  function showLoadingState() {
    const tbody = document.getElementById('tickets-table-body');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-5">
            <div class="spinner-container">
              <div class="spinner"></div>
              <p class="mt-3 text-secondary">Connessione al database cloud in corso...</p>
            </div>
          </td>
        </tr>
      `;
    }
  }

  function hideLoadingState() {
    // Svanisce in automatico al render successivo della tabella
  }

  async function loadData() {
    try {
      showLoadingState();
      updateDbStatus('connecting');
      const response = await fetch(`${API_URL}/api/tickets`);
      if (!response.ok) throw new Error('Impossibile connettersi all\'API backend');
      const data = await response.json();
      tickets = Array.isArray(data) ? data : [];
      updateDbStatus('online');
    } catch (e) {
      console.error('Errore nel recupero dati, uso localStorage come fallback:', e);
      updateDbStatus('offline');
      const savedTickets = localStorage.getItem('bettracker_tickets');
      if (savedTickets) {
        try {
          const parsed = JSON.parse(savedTickets);
          tickets = Array.isArray(parsed) ? parsed : [];
        } catch (err) {
          tickets = [];
        }
      } else {
        tickets = [];
      }
    } finally {
      // Rimosso renderApp() da qui per evitare render concorrenti all'avvio
    }
  }

  function saveDataLocal() {
    localStorage.setItem('bettracker_tickets', JSON.stringify(tickets));
  }

  async function loadAgencies() {
    try {
      updateDbStatus('connecting');
      const response = await fetch(`${API_URL}/api/agencies`);
      if (!response.ok) throw new Error('Impossibile caricare le agenzie dal database cloud');
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        agenciesList = data;
      }
      updateDbStatus('online');
    } catch (e) {
      console.warn('Errore nel recupero agenzie, uso localStorage come fallback:', e);
      updateDbStatus('offline');
      const savedAgencies = localStorage.getItem('bettracker_agencies');
      if (savedAgencies) {
        try {
          const parsed = JSON.parse(savedAgencies);
          if (Array.isArray(parsed) && parsed.length > 0) {
            agenciesList = parsed;
          }
        } catch (err) {
          // Mantieni i default impostati nello stato
        }
      }
    }
  }

  function saveAgenciesLocal() {
    localStorage.setItem('bettracker_agencies', JSON.stringify(agenciesList));
  }

  async function addAgency(name) {
    const payload = { name };
    try {
      updateDbStatus('connecting');
      const response = await fetch(`${API_URL}/api/agencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('Salvataggio agenzia fallito');
      const created = await response.json();
      agenciesList.push(created);
      saveAgenciesLocal();
      updateDbStatus('online');
    } catch (err) {
      console.error('Errore nel salvataggio agenzia sul cloud, fallback locale:', err);
      updateDbStatus('offline');
      const localAgency = {
        id: 'local-' + Date.now(),
        name,
        created_at: new Date().toISOString()
      };
      agenciesList.push(localAgency);
      saveAgenciesLocal();
      alert('Impossibile salvare l\'agenzia sul cloud. Salvata temporaneamente solo in locale.');
    }
  }

  async function deleteAgency(id, name) {
    try {
      if (id && !id.startsWith('local-') && !id.startsWith('default-')) {
        updateDbStatus('connecting');
        const response = await fetch(`${API_URL}/api/agencies/${id}`, {
          method: 'DELETE'
        });
        if (!response.ok) throw new Error('Cancellazione agenzia fallita');
      }
      
      agenciesList = agenciesList.filter(a => a.id !== id);
      saveAgenciesLocal();
      updateDbStatus('online');
    } catch (err) {
      console.error('Errore nella cancellazione dell\'agenzia sul cloud, fallback locale:', err);
      updateDbStatus('offline');
      agenciesList = agenciesList.filter(a => a.id !== id);
      saveAgenciesLocal();
      alert('Impossibile cancellare l\'agenzia sul cloud. Rimossa solo in locale.');
    }
  }

  // Esportazione JSON (Backup Completo)
  document.getElementById('btn-export-json').addEventListener('click', () => {
    if (tickets.length === 0) {
      alert('Nessun dato da esportare.');
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tickets, null, 2));
    const downloadAnchor = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `BetTracker_Backup_${today}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  });

  // Importazione JSON (Ripristino Backup)
  const fileImportInput = document.getElementById('file-import-json');
  document.getElementById('btn-import-trigger').addEventListener('click', () => {
    fileImportInput.click();
  });

  fileImportInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(evt) {
      try {
        const importedData = JSON.parse(evt.target.result);
        if (Array.isArray(importedData)) {
          // Validazione basilare dei dati
          const isValid = importedData.every(item => 
            item.agency && item.event && item.status && item.emissionDate && 
            item.competenceDate && item.odds !== undefined && item.amountPlayed !== undefined
          );
          
          if (isValid) {
            if (confirm(`Sei sicuro di voler importare ${importedData.length} ticket? Il database corrente verrà sovrascritto.`)) {
              try {
                showLoadingState();
                updateDbStatus('connecting');
                // 1. Resetta database cloud
                await fetch(`${API_URL}/api/tickets-all/reset`, { method: 'DELETE' });
                // 2. Inserisci in blocco
                const response = await fetch(`${API_URL}/api/tickets/bulk`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(importedData)
                });
                if (!response.ok) throw new Error('Ripristino bulk fallito');
                tickets = await response.json();
                saveDataLocal();
                updateDbStatus('online');
                alert('Backup ripristinato sul database cloud con successo!');
              } catch (err) {
                console.error('Errore nel ripristino cloud, eseguo fallback locale:', err);
                updateDbStatus('offline');
                tickets = importedData;
                saveDataLocal();
                alert('Errore di connessione al server. I dati sono stati caricati temporaneamente solo in locale.');
              } finally {
                renderApp();
              }
            }
          } else {
            alert('Il file non ha un formato compatibile con BetTracker.');
          }
        } else {
          alert('Il file JSON deve contenere un array di ticket.');
        }
      } catch (err) {
        alert('Errore nella lettura del file JSON: ' + err.message);
      }
      fileImportInput.value = ''; // Resetta l'input
    };
    reader.readAsText(file);
  });

  // ==========================================================================
  // 3. GENERAZIONE DATI DEMO
  // ==========================================================================
  document.getElementById('btn-demo-data').addEventListener('click', () => {
    if (tickets.length > 0) {
      if (!confirm('Generando i dati demo sovrascriverai i ticket correnti nel database. Vuoi procedere?')) {
        return;
      }
    }
    generateDemoData(true);
  });

  async function generateDemoData(notifyUser = false) {
    const agencies = ['Eurobet', 'Goldbet', 'Planetwin365', 'SNAI', 'Bet365'];
    const events = [
      'Milan - Juventus', 'Inter - Roma', 'Napoli - Lazio', 'Real Madrid - Barcelona',
      'Manchester City - Liverpool', 'Bayern Munich - Dortmund', 'PSG - Marseille',
      'Fiorentina - Bologna', 'Atalanta - Torino', 'Chelsea - Arsenal'
    ];
    const outcomes = ['1', 'X', '2', 'Over 2.5', 'GG', '1X', 'X2', '1 + Over 1.5'];
    
    const demoTickets = [];
    const today = new Date();
    
    // Generiamo ticket distribuiti nelle ultime 4 settimane
    for (let i = 0; i < 28; i++) {
      const ticketDate = new Date();
      ticketDate.setDate(today.getDate() - i); // da oggi fino a 27 giorni fa
      
      const agency = agencies[Math.floor(Math.random() * agencies.length)];
      const event = events[Math.floor(Math.random() * events.length)];
      const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
      
      const odds = parseFloat((1.35 + Math.random() * 2.5).toFixed(2));
      const amountPlayed = parseFloat((5 + Math.floor(Math.random() * 10) * 5).toFixed(2)); // 5, 10, 15... 50 euro
      
      const isPast = i > 3; // I ticket molto recenti (ultimi 3 giorni) possono essere aperti
      let status = 'aperto';
      if (isPast) {
        status = Math.random() > 0.45 ? 'vinto' : 'perso';
      }
      
      const emissionDate = formatDate(ticketDate);
      
      // La data di competenza (evento) è solitamente lo stesso giorno o il giorno dopo l'emissione
      const competenceDateObj = new Date(ticketDate);
      if (Math.random() > 0.7) competenceDateObj.setDate(competenceDateObj.getDate() + 1);
      const competenceDate = formatDate(competenceDateObj);
      
      let actualWinnings = 0;
      if (status === 'vinto') {
        // Le vincite effettive possono includere piccoli bonus (es. +5% bonus multipla)
        const potential = odds * amountPlayed;
        actualWinnings = parseFloat((potential * (1 + (Math.random() > 0.7 ? 0.05 : 0))).toFixed(2));
      } else if (status === 'aperto') {
        actualWinnings = 0;
      }
      
      demoTickets.push({
        agency,
        event,
        outcomePlayed: outcome,
        status,
        emissionDate,
        competenceDate,
        odds,
        amountPlayed,
        actualWinnings
      });
    }

    try {
      showLoadingState();
      updateDbStatus('connecting');
      // 1. Resetta il database cloud
      await fetch(`${API_URL}/api/tickets-all/reset`, { method: 'DELETE' });
      // 2. Inserisci in blocco nel database cloud
      const response = await fetch(`${API_URL}/api/tickets/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(demoTickets)
      });
      if (!response.ok) throw new Error('Inserimento bulk fallito');
      const data = await response.json();
      tickets = Array.isArray(data) ? data : demoTickets;
      saveDataLocal();
      updateDbStatus('online');
      if (notifyUser) alert('Dati demo generati e salvati sul database cloud con successo!');
    } catch (err) {
      console.error('Errore durante la generazione dei dati demo cloud:', err);
      updateDbStatus('offline');
      // Fallback locale in caso di errore
      tickets = demoTickets.map((t, idx) => ({ ...t, id: 'local-demo-' + idx }));
      saveDataLocal();
      if (notifyUser) alert('Errore di connessione. Dati demo salvati solo in locale.');
    } finally {
      renderApp();
    }
  }

  // ==========================================================================
  // 4. GESTIONE DATE & SETTIMANE (ITALIAN CALENDAR - LUN-DOM)
  // ==========================================================================
  function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Ritorna le date di inizio (lunedì) e fine (domenica) della settimana di una data specificata
  function getWeekRange(dateString) {
    const date = new Date(dateString);
    const day = date.getDay(); // 0 = Domenica, 1 = Lunedì, ecc.
    // Calcola la distanza dal Lunedì (se è Domenica (0), la distanza all'indietro è 6 giorni, altrimenti day - 1)
    const diffToMonday = day === 0 ? -6 : 1 - day;
    
    const monday = new Date(date);
    monday.setDate(date.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    return {
      start: formatDate(monday),
      end: formatDate(sunday)
    };
  }

  // Ottieni il numero e l'anno della settimana (es. "Settimana 22 - 2026")
  function getWeekLabel(dateString) {
    const d = new Date(dateString);
    d.setHours(0, 0, 0, 0);
    // Giovedì determina l'anno della settimana (standard ISO)
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return `Settimana ${weekNum} (${d.getFullYear()})`;
  }

  // ==========================================================================
  // 5. FILTRI E SELEZIONE PERIODO
  // ==========================================================================
  const selectPeriod = document.getElementById('select-period');
  const customDateRangeDiv = document.getElementById('custom-date-range');
  const customStartDate = document.getElementById('custom-start-date');
  const customEndDate = document.getElementById('custom-end-date');

  const filterSearch = document.getElementById('filter-search');
  const filterStatus = document.getElementById('filter-status');
  const filterAgency = document.getElementById('filter-agency');
  const filterDateType = document.getElementById('filter-date-type');
  const btnResetFilters = document.getElementById('btn-reset-filters');

  // Mostra/Nascondi intervallo personalizzato
  selectPeriod.addEventListener('change', () => {
    if (selectPeriod.value === 'custom') {
      customDateRangeDiv.classList.remove('hidden');
      // Imposta valori di default ragionevoli (ultimo mese)
      const end = new Date();
      const start = new Date();
      start.setDate(end.getDate() - 30);
      customStartDate.value = formatDate(start);
      customEndDate.value = formatDate(end);
    } else {
      customDateRangeDiv.classList.add('hidden');
    }
    renderApp();
  });

  // Eventi per filtri ed intervalli
  [customStartDate, customEndDate, filterSearch, filterStatus, filterAgency, filterDateType].forEach(el => {
    el.addEventListener('change', renderApp);
  });
  filterSearch.addEventListener('input', renderApp);

  // Reset dei filtri
  btnResetFilters.addEventListener('click', () => {
    filterSearch.value = '';
    filterStatus.value = 'all';
    filterAgency.value = 'all';
    filterDateType.value = 'emission';
    selectPeriod.value = 'all-time';
    customDateRangeDiv.classList.add('hidden');
    renderApp();
  });

  // Funzione per filtrare i ticket in base allo stato dei filtri correnti
  function getFilteredTickets() {
    const searchVal = filterSearch.value.toLowerCase().trim();
    const statusVal = filterStatus.value;
    const agencyVal = filterAgency.value;
    const dateTypeVal = filterDateType.value; // 'emission' o 'competence'
    const periodVal = selectPeriod.value;

    // 1. Determina l'intervallo di date in base al periodo selezionato
    let dateStart = null;
    let dateEnd = null;
    const today = new Date();

    if (periodVal === 'current-week') {
      const range = getWeekRange(today);
      dateStart = range.start;
      dateEnd = range.end;
    } else if (periodVal === 'last-week') {
      const lastWeekDate = new Date();
      lastWeekDate.setDate(today.getDate() - 7);
      const range = getWeekRange(lastWeekDate);
      dateStart = range.start;
      dateEnd = range.end;
    } else if (periodVal === 'current-month') {
      const year = today.getFullYear();
      const month = today.getMonth();
      dateStart = formatDate(new Date(year, month, 1));
      dateEnd = formatDate(new Date(year, month + 1, 0));
    } else if (periodVal === 'custom') {
      dateStart = customStartDate.value;
      dateEnd = customEndDate.value;
    }

    // 2. Applica i filtri cumulativi
    return tickets.filter(t => {
      // Filtro ricerca testo (agenzia, evento, esito)
      const matchesSearch = searchVal === '' || 
        t.agency.toLowerCase().includes(searchVal) || 
        t.event.toLowerCase().includes(searchVal) || 
        t.outcomePlayed.toLowerCase().includes(searchVal);
      
      // Filtro stato
      const matchesStatus = statusVal === 'all' || t.status === statusVal;
      
      // Filtro agenzia
      const matchesAgency = agencyVal === 'all' || t.agency === agencyVal;
      
      // Filtro date temporali
      const targetDate = dateTypeVal === 'emission' ? t.emissionDate : t.competenceDate;
      let matchesDate = true;
      if (dateStart && targetDate < dateStart) matchesDate = false;
      if (dateEnd && targetDate > dateEnd) matchesDate = false;
      
      return matchesSearch && matchesStatus && matchesAgency && matchesDate;
    });
  }

  // Popola la select delle agenzie dinamicamente in base alle agenzie gestite
  function updateAgencyFilterOptions() {
    if (!filterAgency) return;
    const currentSelected = filterAgency.value;
    
    // Ottieni i nomi delle agenzie ordinarli alfabeticamente
    const sortedAgencies = [...new Set(agenciesList.map(a => a.name).filter(Boolean))].sort();
    
    // Costruisci le opzioni
    filterAgency.innerHTML = '<option value="all">Tutte le agenzie</option>';
    sortedAgencies.forEach(agency => {
      const option = document.createElement('option');
      option.value = agency;
      option.textContent = agency;
      if (agency === currentSelected) option.selected = true;
      filterAgency.appendChild(option);
    });

    // Aggiorna anche il datalist nel form modale
    const datalist = document.getElementById('datalist-agencies');
    if (datalist) {
      datalist.innerHTML = '';
      sortedAgencies.forEach(agency => {
        const option = document.createElement('option');
        option.value = agency;
        datalist.appendChild(option);
      });
    }
  }

  // ==========================================================================
  // 6. CALCOLO E RENDERING DELLA DASHBOARD
  // ==========================================================================
  function renderApp() {
    const filtered = getFilteredTickets();
    
    // Aggiorna i selettori filtri (solo le agenzie, se necessario, senza resettare la selezione)
    updateAgencyFilterOptions();
    
    // 1. Calcola KPI
    let totalPlayed = 0;
    let totalWon = 0;
    let totalLost = 0;
    let openCount = 0;
    let openPotentialWinnings = 0;
    
    filtered.forEach(t => {
      const amountPlayed = parseFloat(t.amountPlayed) || 0;
      const actualWinnings = parseFloat(t.actualWinnings) || 0;
      const odds = parseFloat(t.odds) || 0;
      
      totalPlayed += amountPlayed;
      if (t.status === 'vinto') {
        totalWon += actualWinnings;
      } else if (t.status === 'perso') {
        totalLost += amountPlayed;
      } else if (t.status === 'aperto') {
        openCount++;
        openPotentialWinnings += (amountPlayed * odds);
      }
    });
    
    const netBalance = totalWon - totalPlayed;
    const roi = totalPlayed > 0 ? ((netBalance / totalPlayed) * 100).toFixed(1) : '0.0';
    
    // 2. Renderizza KPI nel DOM
    document.getElementById('kpi-total-played').textContent = formatEuro(totalPlayed);
    document.getElementById('kpi-played-count').textContent = `${filtered.length} ticket totali`;
    
    document.getElementById('kpi-total-won').textContent = formatEuro(totalWon);
    document.getElementById('kpi-won-count').textContent = `${filtered.filter(t => t.status === 'vinto').length} ticket vinti`;
    
    document.getElementById('kpi-total-lost').textContent = formatEuro(totalLost);
    document.getElementById('kpi-lost-count').textContent = `${filtered.filter(t => t.status === 'perso').length} ticket persi`;
    
    // Bilancio Netto colorato dinamicamente
    const balanceEl = document.getElementById('kpi-net-balance');
    const balanceIconEl = document.getElementById('kpi-balance-icon');
    balanceEl.textContent = formatEuro(netBalance);
    
    if (netBalance > 0) {
      balanceEl.className = 'kpi-value text-green';
      balanceIconEl.className = 'kpi-icon icon-green';
      balanceIconEl.innerHTML = '<i data-lucide="trending-up"></i>';
    } else if (netBalance < 0) {
      balanceEl.className = 'kpi-value text-red';
      balanceIconEl.className = 'kpi-icon icon-red';
      balanceIconEl.innerHTML = '<i data-lucide="trending-down"></i>';
    } else {
      balanceEl.className = 'kpi-value';
      balanceIconEl.className = 'kpi-icon';
      balanceIconEl.innerHTML = '<i data-lucide="dollar-sign"></i>';
    }
    
    document.getElementById('kpi-roi-percentage').textContent = `ROI: ${roi}%`;
    document.getElementById('kpi-open-count').textContent = openCount;
    document.getElementById('kpi-open-potential-winnings').textContent = `Vincita Potenziale: ${formatEuro(openPotentialWinnings)}`;
    
    // 3. Rerenderizza Numero Record Mostrati
    document.getElementById('filtered-tickets-count').textContent = `Mostrati ${filtered.length} ticket`;
    
    // 4. Renderizza Tabella dei Ticket
    renderTable(filtered);
    
    // Ridisegna grafici
    updateCharts(filtered);
    
    // Aggiorna le icone Lucide create dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
 
  function formatEuro(amount) {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);
  }
 
  function renderTable(filteredTickets) {
    const tbody = document.getElementById('tickets-table-body');
    tbody.innerHTML = '';
    
    if (filteredTickets.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="text-center py-5 text-muted">
            Nessun ticket soddisfa i filtri selezionati.
          </td>
        </tr>
      `;
      return;
    }
    
    // Ordina i ticket per data di emissione decrescente (più recenti in alto)
    const sorted = [...filteredTickets].sort((a, b) => (b.emissionDate || '').localeCompare(a.emissionDate || ''));
    
    sorted.forEach(t => {
      const tr = document.createElement('tr');
      
      // Classe badge stato
      let statusClass = 'status-aperto';
      let statusLabel = 'Aperto';
      if (t.status === 'vinto') { statusClass = 'status-vinto'; statusLabel = 'Vinto'; }
      if (t.status === 'perso') { statusClass = 'status-perso'; statusLabel = 'Perso'; }
      
      // Calcola vincita/potenziale da mostrare nella cella
      let winningsDisplay = '-';
      let winningsClass = 'text-muted';
      
      const amountPlayed = parseFloat(t.amountPlayed) || 0;
      const odds = parseFloat(t.odds) || 0;
      const actualWinnings = parseFloat(t.actualWinnings) || 0;
      
      if (t.status === 'vinto') {
        winningsDisplay = formatEuro(actualWinnings);
        winningsClass = 'text-green cell-currency';
      } else if (t.status === 'perso') {
        winningsDisplay = formatEuro(0);
        winningsClass = 'text-red';
      } else {
        winningsDisplay = `Potenziale: ${formatEuro(amountPlayed * odds)}`;
        winningsClass = 'text-amber';
      }
      
      tr.innerHTML = `
        <td><strong>${escapeHtml(t.agency)}</strong></td>
        <td>${escapeHtml(t.event)}</td>
        <td><span class="badge">${escapeHtml(t.outcomePlayed)}</span></td>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        <td>${odds.toFixed(2)}</td>
        <td class="cell-currency">${formatEuro(amountPlayed)}</td>
        <td class="${winningsClass}">${winningsDisplay}</td>
        <td>${formatDateString(t.emissionDate)}</td>
        <td>${formatDateString(t.competenceDate)}</td>
        <td class="text-right">
          <div class="row-actions">
            <button class="btn-icon edit" data-id="${t.id}" title="Modifica ticket">
              <i data-lucide="edit-3"></i>
            </button>
            <button class="btn-icon delete" data-id="${t.id}" title="Elimina ticket">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Aggiungi event listeners per i pulsanti modifica ed elimina
    tbody.querySelectorAll('.btn-icon.edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        openTicketModal(id);
      });
    });

    tbody.querySelectorAll('.btn-icon.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = btn.getAttribute('data-id');
        openDeleteModal(id);
      });
    });
  }

  function formatDateString(str) {
    if (!str) return '';
    const parts = str.split('-');
    if (parts.length !== 3) return str;
    return `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
  }

  function escapeHtml(text) {
    if (text === undefined || text === null) return '';
    const textStr = String(text);
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return textStr.replace(/[&<>"']/g, m => map[m]);
  }

  // ==========================================================================
  // 7. MODALE CRUD TICKET (<dialog>)
  // ==========================================================================
  const ticketModal = document.getElementById('ticket-modal');
  const ticketForm = document.getElementById('ticket-form');
  const btnAddTicket = document.getElementById('btn-add-ticket');
  const btnCloseTicketModal = document.getElementById('btn-close-ticket-modal');
  const btnCancelTicket = document.getElementById('btn-cancel-ticket');
  
  const formTicketId = document.getElementById('form-ticket-id');
  const formAgency = document.getElementById('form-agency');
  const formEvent = document.getElementById('form-event');
  const formOutcome = document.getElementById('form-outcome');
  const formStatus = document.getElementById('form-status');
  const formOdds = document.getElementById('form-odds');
  const formAmount = document.getElementById('form-amount');
  const formEmissionDate = document.getElementById('form-emission-date');
  const formCompetenceDate = document.getElementById('form-competence-date');
  const formWinnings = document.getElementById('form-winnings');
  
  const groupWinnings = document.getElementById('group-winnings');
  const potentialWinningsHint = document.getElementById('potential-winnings-hint');

  // Gestione visibilità campo vincita effettiva in base allo stato
  formStatus.addEventListener('change', () => {
    updateWinningsFieldVisibility();
  });

  // Calcolo dinamico della vincita potenziale durante l'input
  [formOdds, formAmount].forEach(input => {
    input.addEventListener('input', updatePotentialWinningsHint);
  });

  function updateWinningsFieldVisibility() {
    const status = formStatus.value;
    if (status === 'vinto') {
      groupWinnings.classList.remove('hidden');
      // Se vuoto, autocalcola
      if (!formWinnings.value && formOdds.value && formAmount.value) {
        formWinnings.value = (parseFloat(formOdds.value) * parseFloat(formAmount.value)).toFixed(2);
      }
    } else {
      groupWinnings.classList.add('hidden');
      formWinnings.value = '';
    }
  }

  function updatePotentialWinningsHint() {
    const odds = parseFloat(formOdds.value) || 0;
    const amount = parseFloat(formAmount.value) || 0;
    const potential = odds * amount;
    potentialWinningsHint.textContent = `Potenziale: ${formatEuro(potential)}`;
    
    // Se lo stato è "vinto", aggiorna anche il campo di input vincite effettive in tempo reale se vuoto/coincidente
    if (formStatus.value === 'vinto' && (!formWinnings.value || formWinnings.value == (odds * amount).toFixed(2))) {
      formWinnings.value = potential > 0 ? potential.toFixed(2) : '';
    }
  }

  // Apri modale per aggiunta nuovo ticket
  btnAddTicket.addEventListener('click', () => {
    openTicketModal();
  });

  // Chiudi modale
  [btnCloseTicketModal, btnCancelTicket].forEach(btn => {
    btn.addEventListener('click', () => {
      closeDialog(ticketModal);
    });
  });

  function openTicketModal(id = null) {
    ticketForm.reset();
    formTicketId.value = '';
    potentialWinningsHint.textContent = 'Potenziale: € 0.00';
    
    const todayStr = formatDate(new Date());
    formEmissionDate.value = todayStr;
    formCompetenceDate.value = todayStr;

    if (id) {
      // Modalità Modifica
      const t = tickets.find(ticket => ticket.id === id);
      if (!t) return;
      
      document.getElementById('modal-title').textContent = 'Modifica Ticket';
      formTicketId.value = t.id;
      formAgency.value = t.agency;
      formEvent.value = t.event;
      formOutcome.value = t.outcomePlayed;
      formStatus.value = t.status;
      formOdds.value = t.odds;
      formAmount.value = t.amountPlayed;
      formEmissionDate.value = t.emissionDate;
      formCompetenceDate.value = t.competenceDate;
      
      if (t.status === 'vinto') {
        formWinnings.value = t.actualWinnings;
      }
      
      updateWinningsFieldVisibility();
      updatePotentialWinningsHint();
    } else {
      // Modalità Nuovo
      document.getElementById('modal-title').textContent = 'Nuovo Ticket';
      updateWinningsFieldVisibility();
    }
    
    openDialog(ticketModal);
  }

  // Gestione salvataggio form ticket
  ticketForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = formTicketId.value;
    const agency = formAgency.value.trim();
    const event = formEvent.value.trim();
    const outcome = formOutcome.value.trim();
    const status = formStatus.value;
    const odds = parseFloat(formOdds.value);
    const amount = parseFloat(formAmount.value);
    const emission = formEmissionDate.value;
    const competence = formCompetenceDate.value;
    
    let winnings = 0;
    if (status === 'vinto') {
      // Se il campo vincita effettiva è compilato usa quello, altrimenti calcola Quota * Giocato
      winnings = parseFloat(formWinnings.value) || parseFloat((odds * amount).toFixed(2));
    }
    
    const ticketPayload = {
      agency,
      event,
      outcomePlayed: outcome,
      status,
      odds,
      amountPlayed: amount,
      emissionDate: emission,
      competenceDate: competence,
      actualWinnings: winnings
    };

    try {
      showLoadingState();
      updateDbStatus('connecting');
      if (id) {
        // Modalità Modifica
        // Se è un ticket creato solo in locale (offline fallback), lo creiamo come nuovo sul server
        if (id.startsWith('local-')) {
          const response = await fetch(`${API_URL}/api/tickets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ticketPayload)
          });
          if (!response.ok) throw new Error('Salvataggio server fallito');
          const created = await response.json();
          // Sostituiamo il ticket locale con quello del server
          const index = tickets.findIndex(t => t.id === id);
          if (index !== -1) tickets[index] = created;
        } else {
          // Modifica standard
          const response = await fetch(`${API_URL}/api/tickets/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ticketPayload)
          });
          if (!response.ok) throw new Error('Salvataggio server fallito');
          const updated = await response.json();
          const index = tickets.findIndex(t => t.id === id);
          if (index !== -1) tickets[index] = updated;
        }
      } else {
        // Modalità Nuovo
        const response = await fetch(`${API_URL}/api/tickets`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ticketPayload)
        });
        if (!response.ok) throw new Error('Salvataggio server fallito');
        const created = await response.json();
        tickets.push(created);
      }
      
      saveDataLocal();
      updateDbStatus('online');
      closeDialog(ticketModal);
    } catch (err) {
      console.error('Errore durante il salvataggio cloud, eseguo fallback locale:', err);
      updateDbStatus('offline');
      alert('Impossibile salvare sul database cloud. Il ticket è stato salvato temporaneamente in locale.');
      
      if (id) {
        const index = tickets.findIndex(t => t.id === id);
        if (index !== -1) {
          tickets[index] = { ...ticketPayload, id };
        }
      } else {
        tickets.push({ ...ticketPayload, id: 'local-' + Date.now() });
      }
      saveDataLocal();
      closeDialog(ticketModal);
    } finally {
      renderApp();
    }
  });

  // ==========================================================================
  // 8. MODALE CONFERMA ELIMINAZIONE
  // ==========================================================================
  const deleteConfirmModal = document.getElementById('delete-confirm-modal');
  const btnCloseDeleteModal = document.getElementById('btn-close-delete-modal');
  const btnCancelDelete = document.getElementById('btn-cancel-delete');
  const btnConfirmDelete = document.getElementById('btn-confirm-delete');
  const deleteTicketSummary = document.getElementById('delete-ticket-summary');

  function openDeleteModal(id) {
    const t = tickets.find(ticket => ticket.id === id);
    if (!t) return;
    
    ticketToDeleteId = id;
    deleteTicketSummary.innerHTML = `
      <strong>Agenzia:</strong> ${escapeHtml(t.agency)}<br>
      <strong>Evento:</strong> ${escapeHtml(t.event)}<br>
      <strong>Giocato:</strong> ${formatEuro(t.amountPlayed)} (Quota: ${t.odds.toFixed(2)})
    `;
    
    openDialog(deleteConfirmModal);
  }

  [btnCloseDeleteModal, btnCancelDelete].forEach(btn => {
    btn.addEventListener('click', () => {
      closeDialog(deleteConfirmModal);
      ticketToDeleteId = null;
    });
  });

  btnConfirmDelete.addEventListener('click', async () => {
    if (ticketToDeleteId) {
      try {
        showLoadingState();
        updateDbStatus('connecting');
        // Se si tratta di un ticket locale (es. offline) lo rimuoviamo solo localmente
        if (!ticketToDeleteId.startsWith('local-')) {
          const response = await fetch(`${API_URL}/api/tickets/${ticketToDeleteId}`, {
            method: 'DELETE'
          });
          if (!response.ok) throw new Error('Cancellazione fallita');
        }
        tickets = tickets.filter(t => t.id !== ticketToDeleteId);
        saveDataLocal();
        updateDbStatus('online');
      } catch (err) {
        console.error('Errore durante la cancellazione cloud, eseguo fallback locale:', err);
        updateDbStatus('offline');
        alert('Impossibile eliminare dal database cloud. Il ticket è stato rimosso solo localmente.');
        tickets = tickets.filter(t => t.id !== ticketToDeleteId);
        saveDataLocal();
      } finally {
        closeDialog(deleteConfirmModal);
        renderApp();
        ticketToDeleteId = null;
      }
    }
  });

  // Helper per l'apertura e la chiusura dei dialog con supporto all'animazione e al click out (light dismiss)
  function openDialog(dialog) {
    dialog.showModal();
    // Innesca l'animazione CSS
    requestAnimationFrame(() => {
      dialog.style.opacity = '1';
    });
  }

  function closeDialog(dialog) {
    dialog.style.opacity = '0';
    // Aspetta il completamento dell'animazione di chiusura (300ms)
    setTimeout(() => {
      dialog.close();
    }, 200);
  }

  // Fallback per chiudere i dialog cliccando fuori dal contenuto (sul backdrop)
  [ticketModal, deleteConfirmModal].forEach(dialog => {
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        
        const rect = dialog.getBoundingClientRect();
        const isInside = (
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width
        );
        
        if (!isInside) {
          closeDialog(dialog);
          if (dialog === deleteConfirmModal) ticketToDeleteId = null;
        }
      });
    }
  });

  // ==========================================================================
  // 9. FUNZIONALITÀ GRAFICI CON CHART.JS
  // ==========================================================================
  function initCharts() {
    if (typeof Chart === 'undefined') {
      console.warn('Libreria Chart.js non caricata. I grafici saranno disabilitati.');
      return;
    }
    // Configurazione dei font Chart.js per coordinamento estetico
    Chart.defaults.font.family = varCss('--font-main');
    Chart.defaults.color = varCss('--text-secondary');
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';
  }

  function varCss(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }

  function updateCharts(filteredTickets) {
    if (typeof Chart === 'undefined') return;

    if (chartUpdateTimeout) {
      clearTimeout(chartUpdateTimeout);
    }

    chartUpdateTimeout = setTimeout(() => {
      const canvasProfit = document.getElementById('chart-net-profit');
      const canvasAgency = document.getElementById('chart-agency-volume');
      if (!canvasProfit || !canvasAgency) return;

      const ctxProfit = canvasProfit.getContext('2d');
      const ctxAgency = canvasAgency.getContext('2d');
      if (!ctxProfit || !ctxAgency) return;

      // 1. GRAFICO PROFITTO NETTO SETTIMANALE
      // Raggruppa i ticket per settimana basandoci sulla data di emissione
      const weeklyData = {};
      
      // Ordiniamo tutti i ticket storici per data per visualizzare un asse temporale corretto
      const allSortedTickets = [...tickets].sort((a, b) => a.emissionDate.localeCompare(b.emissionDate));
      
      allSortedTickets.forEach(t => {
        // Consideriamo solo i ticket conclusi (Vinto o Perso) per calcolare il profitto effettivo
        if (t.status === 'aperto') return; 
        
        const weekLabel = getWeekLabel(t.emissionDate);
        if (!weeklyData[weekLabel]) {
          weeklyData[weekLabel] = 0;
        }
        
        if (t.status === 'vinto') {
          weeklyData[weekLabel] += (t.actualWinnings - t.amountPlayed);
        } else {
          weeklyData[weekLabel] -= t.amountPlayed;
        }
      });

      const labelsNetProfit = Object.keys(weeklyData);
      const dataNetProfit = Object.values(weeklyData);

      if (charts.netProfit) charts.netProfit.destroy();
      
      charts.netProfit = new Chart(ctxProfit, {
        type: 'line',
        data: {
          labels: labelsNetProfit,
          datasets: [{
            label: 'Profitto (€)',
            data: dataNetProfit,
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            fill: true,
            tension: 0.35,
            borderWidth: 3,
            pointBackgroundColor: '#8b5cf6',
            pointBorderColor: '#fff',
            pointHoverRadius: 7
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  let label = context.dataset.label || '';
                  if (label) label += ': ';
                  if (context.parsed.y !== null) {
                    label += new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(context.parsed.y);
                  }
                  return label;
                }
              }
            }
          },
          scales: {
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: {
                callback: function(value) { return '€' + value; }
              }
            },
            x: { grid: { display: false } }
          }
        }
      });

      // 2. GRAFICO VOLUME GIOCATO PER AGENZIA
      const agencyData = {};
      filteredTickets.forEach(t => {
        if (!agencyData[t.agency]) {
          agencyData[t.agency] = 0;
        }
        agencyData[t.agency] += t.amountPlayed;
      });

      const labelsAgency = Object.keys(agencyData);
      const dataAgency = Object.values(agencyData);

      if (charts.agencyVolume) charts.agencyVolume.destroy();

      // Palette sfumata per le agenzie
      const bgColors = labelsAgency.map((_, i) => {
        const hues = [250, 270, 190, 150, 340];
        const hue = hues[i % hues.length];
        return `hsla(${hue}, 70%, 60%, 0.6)`;
      });
      const borderColors = labelsAgency.map((_, i) => {
        const hues = [250, 270, 190, 150, 340];
        const hue = hues[i % hues.length];
        return `hsla(${hue}, 70%, 60%, 1)`;
      });

      charts.agencyVolume = new Chart(ctxAgency, {
        type: 'bar',
        data: {
          labels: labelsAgency,
          datasets: [{
            label: 'Giocato (€)',
            data: dataAgency,
            backgroundColor: bgColors,
            borderColor: borderColors,
            borderWidth: 1.5,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return ' Giocato: ' + new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(context.parsed.y);
                }
              }
            }
          },
          scales: {
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.05)' },
              ticks: {
                callback: function(value) { return '€' + value; }
              }
            },
            x: { grid: { display: false } }
          }
        }
      });
    }, 100);
  }

  // ==========================================================================
  // 10. ESPORTAZIONE AVANZATA IN EXCEL (.XLSX) CON AUTO-FILTRI E FORMULE
  // ==========================================================================
  document.getElementById('btn-export-excel').addEventListener('click', () => {
    // Esportiamo la lista dei ticket attualmente filtrati per dare massimo controllo all'utente
    const filtered = getFilteredTickets();
    
    if (filtered.length === 0) {
      alert('Nessun ticket da esportare con i filtri correnti.');
      return;
    }

    // Ordiniamo per data di emissione prima dell'esportazione
    const sorted = [...filtered].sort((a, b) => a.emissionDate.localeCompare(b.emissionDate));

    // Intestazioni delle colonne (Struttura professionale)
    const excelHeaders = [
      'Agenzia', 
      'Evento', 
      'Esito Giocato', 
      'Stato', 
      'Quota', 
      'Importo Giocato (€)', 
      'Vincita Effettiva (€)', 
      'Netto (€)', 
      'Data Emissione', 
      'Data Competenza'
    ];

    // Mappatura delle righe dati
    const excelRows = sorted.map(t => {
      const net = t.status === 'vinto' 
        ? parseFloat((t.actualWinnings - t.amountPlayed).toFixed(2))
        : (t.status === 'perso' ? -t.amountPlayed : 0);
      
      const winnings = t.status === 'vinto' ? t.actualWinnings : 0;
      
      let stateLabel = 'Aperto';
      if (t.status === 'vinto') stateLabel = 'Vinto';
      if (t.status === 'perso') stateLabel = 'Perso';

      return [
        t.agency,
        t.event,
        t.outcomePlayed,
        stateLabel,
        t.odds,
        t.amountPlayed,
        winnings,
        net,
        formatDateString(t.emissionDate),
        formatDateString(t.competenceDate)
      ];
    });

    // Riga temporanea per i totali alla fine dei dati per riservare lo spazio ed estendere il range !ref
    const totalsTempRow = ['TOTALE', '', '', '', '', 0, 0, 0, '', ''];
    const allData = [excelHeaders, ...excelRows, totalsTempRow];

    // Creiamo un nuovo foglio di lavoro (il range !ref includerà automaticamente la riga dei totali)
    const ws = XLSX.utils.aoa_to_sheet(allData);

    const dataRowCount = excelRows.length + 1; // Indice dell'ultima riga di dati (es. se c'è 1 ticket, è la riga 2)
    const totalsRowIndex = allData.length;     // Indice della riga dei totali (es. riga 3)
    
    // Inseriamo le formule di somma reali per Giocato (Colonna F), Vinto (Colonna G) e Netto (Colonna H)
    // Gli indici delle righe dati in Excel vanno da 2 (riga 2) a dataRowCount (riga dataRowCount)
    ws[`F${totalsRowIndex}`] = { t: 'n', f: `SUM(F2:F${dataRowCount})` };
    ws[`G${totalsRowIndex}`] = { t: 'n', f: `SUM(G2:G${dataRowCount})` };
    ws[`H${totalsRowIndex}`] = { t: 'n', f: `SUM(H2:H${dataRowCount})` };

    // Impostiamo la formattazione dei numeri per le colonne di valuta e decimali
    // F (Giocato), G (Vinto), H (Netto) e E (Quota)
    const euroFormat = '"€"#,##0.00;[Red]"-€"#,##0.00;"€"0.00';
    const oddsFormat = '0.00';

    for (let r = 2; r <= totalsRowIndex; r++) {
      // Formato Quota (Colonna E) - salta la riga dei totali
      if (r <= dataRowCount && ws[`E${r}`]) {
        ws[`E${r}`].t = 'n';
        ws[`E${r}`].z = oddsFormat;
      }
      
      // Formato Giocato (Colonna F)
      if (ws[`F${r}`]) {
        ws[`F${r}`].t = 'n';
        ws[`F${r}`].z = euroFormat;
      }
      
      // Formato Vinto (Colonna G)
      if (ws[`G${r}`]) {
        ws[`G${r}`].t = 'n';
        ws[`G${r}`].z = euroFormat;
      }
      
      // Formato Netto (Colonna H)
      if (ws[`H${r}`]) {
        ws[`H${r}`].t = 'n';
        ws[`H${r}`].z = euroFormat;
      }
    }

    // ABILITIAMO GLI AUTO-FILTRI SU TUTTE LE COLONNE (Da A1 a J[dataRowCount])
    ws['!autofilter'] = { ref: `A1:J${dataRowCount}` };

    // Impostiamo la larghezza ottimale delle colonne (in caratteri)
    ws['!cols'] = [
      { wch: 15 }, // Agenzia
      { wch: 25 }, // Evento
      { wch: 14 }, // Esito Giocato
      { wch: 10 }, // Stato
      { wch: 8 },  // Quota
      { wch: 18 }, // Importo Giocato (€)
      { wch: 18 }, // Vincita Effettiva (€)
      { wch: 15 }, // Netto (€)
      { wch: 14 }, // Data Emissione
      { wch: 14 }  // Data Competenza
    ];

    // Creiamo la cartella di lavoro (Workbook) ed aggiungiamo il foglio
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ticket Report");

    // Definiamo il nome del file con la data corrente
    const today = new Date().toISOString().slice(0, 10);
    const fileName = `Report_Ticket_${today}.xlsx`;

    // Avvia il download del file Excel
    XLSX.writeFile(wb, fileName);
  });

  // ==========================================================================
  // 10. GESTIONE INTERFACCIA AGENZIE (RENDERING & EVENTI)
  // ==========================================================================
  const agenciesTableBody = document.getElementById('agencies-table-body');
  const agenciesCountBadge = document.getElementById('agencies-count');
  const agencyForm = document.getElementById('agency-form');
  const agencyNameInput = document.getElementById('agency-name-input');

  function renderAgenciesPage() {
    if (!agenciesTableBody) return;
    agenciesTableBody.innerHTML = '';
    
    if (agenciesList.length === 0) {
      agenciesTableBody.innerHTML = `
        <tr>
          <td colspan="3" class="text-center py-5 text-muted">
            Nessuna agenzia salvata. Aggiungine una tramite il form a sinistra.
          </td>
        </tr>
      `;
      if (agenciesCountBadge) agenciesCountBadge.textContent = 'Mostrate 0 agenzie';
      return;
    }

    // Ordina le agenzie in ordine alfabetico
    const sortedAgencies = [...agenciesList].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    sortedAgencies.forEach(agency => {
      const tr = document.createElement('tr');
      const creationDate = agency.created_at ? formatDateString(agency.created_at.slice(0, 10)) : '-';
      
      tr.innerHTML = `
        <td><strong>${escapeHtml(agency.name)}</strong></td>
        <td>${creationDate}</td>
        <td class="text-right">
          <button class="btn-icon delete-agency" data-id="${agency.id}" data-name="${escapeHtml(agency.name)}" title="Elimina agenzia">
            <i data-lucide="trash-2"></i>
          </button>
        </td>
      `;
      agenciesTableBody.appendChild(tr);
    });

    if (agenciesCountBadge) {
      agenciesCountBadge.textContent = `Mostrate ${sortedAgencies.length} agenzie`;
    }

    // Aggiungi event listener per eliminazione agenzia
    agenciesTableBody.querySelectorAll('.btn-icon.delete-agency').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        
        if (confirm(`Sei sicuro di voler eliminare l'agenzia "${name}"? Questa azione non influirà sui ticket esistenti.`)) {
          showLoadingState();
          await deleteAgency(id, name);
          renderAgenciesPage();
          renderApp();
        }
      });
    });

    // Inizializza le icone Lucide create dinamicamente
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  // Gestore del form inserimento agenzia
  if (agencyForm) {
    agencyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = agencyNameInput.value.trim();
      if (!name) return;

      // Verifica duplicati (case-insensitive)
      const exists = agenciesList.some(a => a.name.toLowerCase() === name.toLowerCase());
      if (exists) {
        alert('Questa agenzia esiste già.');
        return;
      }

      showLoadingState();
      await addAgency(name);
      agencyNameInput.value = '';
      renderAgenciesPage();
      renderApp();
    });
  }

  // ==========================================================================
  // 11. GESTIONE NAVIGAZIONE (TAB SWITCHING SPA)
  // ==========================================================================
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  const dashboardGrid = document.querySelector('.dashboard-grid');
  
  const kpiGrid = document.querySelector('.kpi-grid');
  const filtersSection = document.querySelector('.filters-section');
  const sectionAgencies = document.getElementById('section-agencies');

  function handleNavigation() {
    const hash = window.location.hash || '#dashboard';
    
    // Rimuovi la classe attiva da tutti gli elementi di navigazione
    navItems.forEach(item => item.classList.remove('active'));
    
    if (hash === '#agencies') {
      const activeNav = document.getElementById('nav-agencies');
      if (activeNav) activeNav.classList.add('active');
      
      // Nascondi elementi specifici dei ticket
      if (kpiGrid) kpiGrid.classList.add('hidden');
      if (filtersSection) filtersSection.classList.add('hidden');
      if (dashboardGrid) dashboardGrid.classList.add('hidden');
      if (sectionAgencies) sectionAgencies.classList.remove('hidden');
      
      // Renderizza la pagina delle agenzie
      renderAgenciesPage();
    } else {
      // Mostra elementi dei ticket
      if (kpiGrid) kpiGrid.classList.remove('hidden');
      if (filtersSection) filtersSection.classList.remove('hidden');
      if (dashboardGrid) dashboardGrid.classList.remove('hidden');
      if (sectionAgencies) sectionAgencies.classList.add('hidden');
      
      // Rimuovi le classi di visualizzazione esclusiva dalla griglia
      if (dashboardGrid) {
        dashboardGrid.classList.remove('show-only-tickets', 'show-only-analytics');
        
        if (hash === '#tickets') {
          const activeNav = document.getElementById('nav-tickets');
          if (activeNav) activeNav.classList.add('active');
          dashboardGrid.classList.add('show-only-tickets');
        } else if (hash === '#analytics') {
          const activeNav = document.getElementById('nav-analytics');
          if (activeNav) activeNav.classList.add('active');
          dashboardGrid.classList.add('show-only-analytics');
        } else {
          // Default: Dashboard (mostra entrambi)
          const activeNav = document.getElementById('nav-dashboard');
          if (activeNav) activeNav.classList.add('active');
        }
        
        // Rerenderizza l'intera vista dei ticket per assicurare il caricamento corretto di tabella, KPI e grafici
        renderApp();
      }
    }
  }

  window.addEventListener('hashchange', handleNavigation);

  // ==========================================================================
  // 12. INIZIALIZZAZIONE AVVIO (Eseguita in modo sequenziale)
  // ==========================================================================
  async function initApp() {
    // Inizializza la configurazione iniziale dei grafici
    initCharts();
    
    // Rileva hash iniziale e imposta classi/stati di navigazione corretti
    handleNavigation();
    
    // Carica dati dal database cloud o fallback locale
    await loadAgencies();
    await loadData();
    
    // Renderizza l'app con i dati caricati (se vuoto, mostrerà lo stato vuoto)
    renderApp();

    // Inizializza le icone Lucide
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    } else {
      console.warn('Libreria Lucide non caricata. Le icone potrebbero non essere visualizzate.');
    }
  }

  initApp();
});
