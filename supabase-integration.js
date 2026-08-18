/* =============================================
   PERSONAL EXPENSE TRACKER — Supabase Integration
   ============================================= */
'use strict';

window.supabaseSync = (function() {
  let config = {
    url: '',
    key: '',
    autoSync: false,
    lastSynced: ''
  };

  let client = null;
  let syncInProgress = false;

  // Load config from localStorage
  function loadConfig() {
    try {
      const saved = localStorage.getItem('expense_tracker_supabase_sync');
      if (saved) {
        config = { ...config, ...JSON.parse(saved) };
      }
    } catch(e) {
      console.error('Failed to load Supabase config', e);
    }
  }

  // Save config to localStorage
  function saveConfig() {
    try {
      localStorage.setItem('expense_tracker_supabase_sync', JSON.stringify(config));
    } catch(e) {
      console.error('Failed to save Supabase config', e);
    }
  }

  // Initialize client
  function initClient() {
    if (config.url && config.key && window.supabase) {
      try {
        client = window.supabase.createClient(config.url, config.key);
      } catch(e) {
        console.error('Failed to create Supabase client', e);
      }
    } else {
      client = null;
    }
  }

  // Initialize
  function init() {
    loadConfig();
    initClient();
    updateUI();
  }

  // Connect
  async function connect(url, key) {
    if (!url || !key) {
      showToast('Please fill in both Supabase URL and Anon Key', 'warning');
      return;
    }

    // Temporarily create client to test connection
    try {
      const tempClient = window.supabase.createClient(url.trim(), key.trim());
      
      // Test select query on backups table
      const { data, error } = await tempClient
        .from('expense_backups')
        .select('updated_at')
        .limit(1);

      if (error) {
        throw new Error(error.message);
      }

      // If test succeeds, save configs
      config.url = url.trim();
      config.key = key.trim();
      saveConfig();
      initClient();
      updateUI();
      showToast('Connected to Supabase successfully!', 'success');
      
      // Silently pull database upon successful connection
      pullFromSupabase(true);
    } catch(err) {
      console.error('Supabase connection failed', err);
      showToast('Connection failed: ' + err.message, 'error');
    }
  }

  // Disconnect
  function disconnect() {
    config.url = '';
    config.key = '';
    config.lastSynced = '';
    saveConfig();
    initClient();
    updateUI();
    showToast('Disconnected from Supabase');
  }

  // Push state to Supabase JSON backup
  async function pushToSupabase() {
    if (!client) return;
    if (syncInProgress) return;
    syncInProgress = true;
    updateSyncingIndicator(true);
    setElementText('sb-sync-status', 'Saving database to Supabase...');

    try {
      const { error } = await client
        .from('expense_backups')
        .upsert({ id: 'default', state: typeof state !== 'undefined' ? state : {}, updated_at: new Date() });

      if (error) throw new Error(error.message);

      config.lastSynced = new Date().toLocaleString();
      saveConfig();
      setElementText('sb-sync-status', `Successfully synced database! Last sync: ${config.lastSynced}`);
      showToast('Backup saved to Supabase!', 'success');
    } catch(e) {
      console.error('Supabase save failed', e);
      showToast('Save failed: ' + e.message, 'error');
      setElementText('sb-sync-status', 'Save failed. Check table permissions.');
    } finally {
      syncInProgress = false;
      updateSyncingIndicator(false);
    }
  }

  // Pull state from Supabase JSON backup
  async function pullFromSupabase(silent = false) {
    if (!client) return;
    if (!silent && !confirm('⚠️ This will overwrite all local transactions with the backup from Supabase. Continue?')) return;

    updateSyncingIndicator(true);
    if (!silent) setElementText('sb-sync-status', 'Restoring database from Supabase...');

    try {
      const { data, error } = await client
        .from('expense_backups')
        .select('state')
        .eq('id', 'default')
        .maybeSingle();

      if (error) throw new Error(error.message);

      if (data && data.state && Array.isArray(data.state.transactions)) {
        // Update local app state
        state.transactions = data.state.transactions;
        state.categories = data.state.categories || state.categories;
        state.profile = data.state.profile || state.profile;
        state.seeded = data.state.seeded !== undefined ? data.state.seeded : true;
        
        save();
        renderAll();
        
        showToast('Database restored from Supabase!', 'success');
        setElementText('sb-sync-status', `Last sync: ${new Date().toLocaleString()}`);
      } else {
        if (!silent) {
          showToast('No database backup found on Supabase.', 'warning');
          setElementText('sb-sync-status', 'No backup found. Click Push to save your first backup.');
        }
      }
    } catch(e) {
      console.error('Supabase load failed', e);
      if (!silent) {
        showToast('Restore failed: ' + e.message, 'error');
        setElementText('sb-sync-status', 'Restore failed. Check table configuration.');
      }
    } finally {
      updateSyncingIndicator(false);
    }
  }

  // Auto-sync callback
  let autoSyncTimeout = null;
  function autoSync() {
    if (!client || !config.autoSync) return;
    
    if (autoSyncTimeout) clearTimeout(autoSyncTimeout);
    autoSyncTimeout = setTimeout(() => {
      pushToSupabase();
    }, 2000);
  }

  // Toggle auto sync
  function toggleAutoSync(el) {
    config.autoSync = !!el.checked;
    saveConfig();
  }

  // Helpers
  function setElementText(id, text) {
    const e = document.getElementById(id);
    if (e) e.textContent = text;
  }

  function updateSyncingIndicator(syncing) {
    const badge = document.getElementById('sb-syncing-indicator');
    if (badge) {
      if (syncing) {
        badge.classList.add('syncing');
      } else {
        badge.classList.remove('syncing');
      }
    }
  }

  // Update UI Elements
  function updateUI() {
    const urlInp = document.getElementById('sb-url');
    const keyInp = document.getElementById('sb-key');
    const autoInp = document.getElementById('sb-auto-sync');
    
    const credentialsSection = document.getElementById('sb-credentials-section');
    const syncControlsSection = document.getElementById('sb-sync-controls');
    const btnConnect = document.getElementById('sb-btn-connect');

    if (urlInp) urlInp.value = config.url || '';
    if (keyInp) keyInp.value = config.key || '';
    if (autoInp) autoInp.checked = config.autoSync || false;

    if (config.url && config.key) {
      if (credentialsSection) credentialsSection.style.display = 'none';
      if (syncControlsSection) syncControlsSection.style.display = 'block';
      if (btnConnect) {
        btnConnect.textContent = 'Disconnect Supabase';
        btnConnect.style.background = '#fef2f2';
        btnConnect.style.color = '#b91c1c';
        btnConnect.onclick = disconnect;
      }
      setElementText('sb-sync-status', config.lastSynced ? `Last sync: ${config.lastSynced}` : 'Connected. Ready to sync backups.');
    } else {
      if (credentialsSection) credentialsSection.style.display = 'block';
      if (syncControlsSection) syncControlsSection.style.display = 'none';
      if (btnConnect) {
        btnConnect.textContent = 'Connect Supabase Project';
        btnConnect.style.background = 'var(--primary)';
        btnConnect.style.color = '#fff';
        btnConnect.onclick = () => connect(el('sb-url')?.value, el('sb-key')?.value);
      }
      setElementText('sb-sync-status', 'Configure Supabase settings to sync database.');
    }
  }

  return {
    init,
    connect,
    disconnect,
    pushToSupabase,
    pullFromSupabase,
    autoSync,
    toggleAutoSync,
    getConfig: () => config,
    isReady: () => !!client
  };
})();
