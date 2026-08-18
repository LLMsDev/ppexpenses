/* =============================================
   PERSONAL EXPENSE TRACKER — Google Workspace Integration (Apps Script)
   ============================================= */
'use strict';

window.googleSync = (function() {
  // Config state
  let config = {
    webAppUrl: '',
    sheetUrl: '',
    autoSync: false,
    lastSynced: ''
  };

  let syncInProgress = false;

  // Load config from localStorage
  function loadConfig() {
    try {
      const saved = localStorage.getItem('expense_tracker_apps_script_sync');
      if (saved) {
        config = { ...config, ...JSON.parse(saved) };
      }
      
      // Prepopulate with your deployed Web App URL
      if (!config.webAppUrl || config.webAppUrl === 'https://script.google.com/macros/s/AKfycbyRWCG_2uh75nzvfyVo1_6_Ytbo587PGMGujtGApc8AAccRBBHEF90rd-zvdMgDuzNL/exec') {
        config.webAppUrl = 'https://script.google.com/macros/s/AKfycbx2T9XtuBmNx9g4N3X8XUvdZqdQMzYzJTdGOjQdFVgzPLeseBq40p-i6aeLFEKjrKE/exec';
        config.autoSync = true;
        saveConfig();
      }
    } catch(e) {
      console.error('Failed to load Google Sync config', e);
    }
  }

  // Save config to localStorage
  function saveConfig() {
    try {
      localStorage.setItem('expense_tracker_apps_script_sync', JSON.stringify(config));
    } catch(e) {
      console.error('Failed to save Google Sync config', e);
    }
  }

  // Initialize
  function init() {
    loadConfig();
    updateUI();
  }

  function getSpreadsheetId(url) {
    if (!url) return null;
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  // API Request Wrapper using POST text/plain to avoid CORS preflight blocks
  async function request(action, extraData = {}) {
    if (!config.webAppUrl) {
      showToast('Please set your Apps Script URL first', 'warning');
      throw new Error('URL not configured');
    }

    const payload = {
      action: action,
      state: typeof state !== 'undefined' ? state : {},
      spreadsheetId: getSpreadsheetId(config.sheetUrl),
      ...extraData
    };

    const response = await fetch(config.webAppUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || result.message || 'Action failed');
    }
    return result;
  }

  // Connect & Save URL Credentials
  async function connect(url) {
    if (!url || !url.trim().startsWith('https://script.google.com/')) {
      showToast('Please enter a valid Google Script Web App URL', 'error');
      return;
    }

    const trimmedUrl = url.trim();
    config.webAppUrl = trimmedUrl;
    updateSyncingIndicator(true);

    try {
      // Ping the Apps Script to verify URL and access permissions
      const res = await request('ping');
      saveConfig();
      showToast(res.message || 'Connected to Google Workspace!', 'success');
      updateUI();
      
      // Auto push on first successful connect
      await pushToDrive();
    } catch(e) {
      console.error('Connection failed', e);
      config.webAppUrl = ''; // Reset on fail
      saveConfig();
      showToast('Connection failed: ' + e.message, 'error');
      updateUI();
    } finally {
      updateSyncingIndicator(false);
    }
  }

  // Disconnect credentials
  function disconnect() {
    config.webAppUrl = '';
    config.autoSync = false;
    config.lastSynced = '';
    saveConfig();
    showToast('Disconnected from Google Web App', 'warning');
    updateUI();
  }

  // Sync state to Drive and write Sheet database (Push)
  async function pushToDrive() {
    if (!config.webAppUrl) return;
    if (syncInProgress) return;
    syncInProgress = true;
    updateSyncingIndicator(true);
    setElementText('g-sync-status', 'Syncing with Google Drive & Sheets...');

    try {
      await request('sync');
      config.lastSynced = new Date().toLocaleString();
      saveConfig();
      
      setElementText('g-sync-status', `Successfully synced database! Last sync: ${config.lastSynced}`);
      showToast('Google Drive backup & Google Sheet synced!', 'success');
    } catch(e) {
      console.error('Sync failed', e);
      showToast('Sync failed: ' + e.message, 'error');
      setElementText('g-sync-status', 'Sync failed. Check your Web App configuration.');
    } finally {
      syncInProgress = false;
      updateSyncingIndicator(false);
    }
  }

  // Restore state from Google Drive JSON (Pull)
  async function pullFromDrive() {
    if (!config.webAppUrl) return;
    if (!confirm('⚠️ This will overwrite all your local transactions with the database backup from Google Drive. Continue?')) return;
    
    updateSyncingIndicator(true);
    setElementText('g-sync-status', 'Restoring database from Drive...');

    try {
      const res = await request('load');
      
      if (res.state && Array.isArray(res.state.transactions)) {
        // Update local app state
        state.transactions = res.state.transactions;
        state.categories = res.state.categories || state.categories;
        state.profile = res.state.profile || state.profile;
        state.seeded = res.state.seeded !== undefined ? res.state.seeded : true;
        
        // Save locally and refresh
        save();
        renderAll();
        
        showToast('Database restored from Google Drive!', 'success');
        setElementText('g-sync-status', `Restored database from Google Drive. Transactions loaded: ${state.transactions.length}`);
      } else {
        throw new Error('Backup file format is invalid');
      }
    } catch(e) {
      console.error('Restore failed', e);
      showToast('Restore failed: ' + e.message, 'error');
      setElementText('g-sync-status', 'Restore failed. Check your Google Drive backup.');
    } finally {
      updateSyncingIndicator(false);
    }
  }

  // Auto-sync wrapper
  let autoSyncTimeout = null;
  function autoSync() {
    if (!config.webAppUrl || !config.autoSync) return;
    
    if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
    autoSyncTimeout = setTimeout(() => {
      pushToDrive();
    }, 2000);
  }

  // Export to Sheets directly updates the Sheet database
  async function exportToSheets() {
    updateSyncingIndicator(true);
    setElementHTML('sheet-export-status', 'Syncing Sheet database...');
    
    try {
      await request('sync');
      setElementHTML('sheet-export-status', 'Spreadsheet updated! Go to Google Drive folder "PersonalExpenseTracker" to view it.');
      showToast('Google Sheet database updated!', 'success');
    } catch(e) {
      console.error('Sheets export failed', e);
      setElementHTML('sheet-export-status', 'Export failed.');
      showToast('Sheets export failed: ' + e.message, 'error');
    } finally {
      updateSyncingIndicator(false);
    }
  }

  // Export Monthly Doc Report
  async function exportToDocs() {
    updateSyncingIndicator(true);
    setElementHTML('doc-export-status', 'Generating Google Doc report...');

    try {
      const filterMonth = getFilterMonth();
      const monthTxs = state.transactions.filter(t => t.date.substring(0,7) === filterMonth);
      const totals = getTotals(monthTxs);
      
      const [y,m] = filterMonth.split('-');
      const monthLabel = new Date(+y, +m-1, 1).toLocaleString('en-US',{month:'long', year:'numeric'});

      // Prepare breakdown details
      const breakdown = getCatBreakdown(monthTxs);
      const totalExp = breakdown.reduce((s,[,v])=>s+v, 0);
      const docBreakdown = breakdown.map(([catId, val]) => {
        const cat = state.categories.find(c => c.id === catId) || { name: 'Others', icon: '💬' };
        return {
          category: cat.name,
          value: state.profile.currency + val.toFixed(2),
          pct: totalExp > 0 ? ((val / totalExp) * 100).toFixed(0) : 0
        };
      });

      const payload = {
        monthLabel: monthLabel,
        totals: {
          income: state.profile.currency + totals.income.toFixed(2),
          expense: state.profile.currency + totals.expense.toFixed(2),
          balance: state.profile.currency + totals.balance.toFixed(2)
        },
        breakdown: docBreakdown
      };

      const res = await request('exportDoc', payload);
      
      if (res.url) {
        setElementHTML('doc-export-status', `Doc created! <a href="${res.url}" target="_blank" class="g-doc-link">Open Doc 📄</a>`);
        showToast('Created Google Doc report!', 'success');
      } else {
        throw new Error('No Document URL returned');
      }
    } catch(e) {
      console.error('Docs export failed', e);
      setElementHTML('doc-export-status', 'Report generation failed.');
      showToast('Docs export failed: ' + e.message, 'error');
    } finally {
      updateSyncingIndicator(false);
    }
  }

  // Toggle Auto-sync
  function toggleAutoSync(el) {
    config.autoSync = el.checked;
    saveConfig();
    showToast(`Auto-sync turned ${config.autoSync ? 'ON' : 'OFF'}`, 'info');
  }

  // UI Helpers
  function setElementText(id, text) {
    const e = document.getElementById(id);
    if (e) e.textContent = text;
  }

  function setElementHTML(id, html) {
    const e = document.getElementById(id);
    if (e) e.innerHTML = html;
  }

  function updateUI() {
    const urlInp = document.getElementById('g-script-url');
    const autoInp = document.getElementById('g-auto-sync');
    const credentialsSection = document.getElementById('g-credentials-section');
    const syncControlsSection = document.getElementById('g-sync-controls');
    const btnConnect = document.getElementById('g-btn-connect');

    const sheetInp = document.getElementById('g-sheet-url');

    if (urlInp) urlInp.value = config.webAppUrl || '';
    if (autoInp) autoInp.checked = config.autoSync || false;
    if (sheetInp) sheetInp.value = config.sheetUrl || '';

    if (config.webAppUrl) {
      if (credentialsSection) credentialsSection.style.display = 'none';
      if (syncControlsSection) syncControlsSection.style.display = 'block';
      if (btnConnect) {
        btnConnect.textContent = 'Disconnect Web App';
        btnConnect.style.background = '#fef2f2';
        btnConnect.style.color = '#b91c1c';
        btnConnect.onclick = disconnect;
      }
      setElementText('g-sync-status', config.lastSynced ? `Last sync: ${config.lastSynced}` : 'Connected. Backup files to Drive.');
    } else {
      if (credentialsSection) credentialsSection.style.display = 'block';
      if (syncControlsSection) syncControlsSection.style.display = 'none';
      if (btnConnect) {
        btnConnect.textContent = 'Connect Google Web App';
        btnConnect.style.background = 'var(--primary)';
        btnConnect.style.color = '#fff';
        btnConnect.onclick = () => connect(el('g-script-url')?.value);
      }
      setElementText('g-sync-status', 'Setup your Google Apps Script URL to sync database.');
      setElementHTML('sheet-export-status', '');
      setElementHTML('doc-export-status', '');
    }
  }

  function updateSyncingIndicator(syncing) {
    const badge = document.getElementById('g-syncing-indicator');
    if (badge) {
      if (syncing) {
        badge.classList.add('syncing');
      } else {
        badge.classList.remove('syncing');
      }
    }
  }

  function saveSheetUrl(url) {
    config.sheetUrl = url.trim();
    saveConfig();
  }

  return {
    init,
    connect,
    disconnect,
    pushToDrive,
    pullFromDrive,
    autoSync,
    exportToSheets,
    exportToDocs,
    toggleAutoSync,
    saveSheetUrl,
    getConfig: () => config,
    isReady: () => !!config.webAppUrl
  };
})();
