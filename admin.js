// Supabase Configuration
const SUPABASE_URL = 'https://jryrkpkzzrvgawkmljvt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyeXJrcGt6enJ2Z2F3a21sanZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyNDg2NjUsImV4cCI6MjEwNDgyNDY2NX0.Xed8gIPkFlPjxbxg0wXWRxgvR0mwWApKwbW6vG4dxLU'; // Replace with your anon key

let supabaseClient = null;
try {
  if (window.supabase && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('PASTE_YOUR')) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn("Supabase running in local fallback mode.", e);
}

const USERS_DB_KEY = 'portfolio_users_db';
const LOGS_DB_KEY = 'portfolio_audit_logs';

let allUsers = [];

// 1. Initialize Dashboard
async function initAdminDashboard() {
  await fetchAndRenderUsers();
  await fetchAndRenderLogs();
}

// 2. Fetch and Render Users Table
async function fetchAndRenderUsers(filteredList = null) {
  const tbody = document.getElementById('userTableBody') || document.querySelector('tbody');
  const countBadge = document.getElementById('userCount');

  if (!filteredList) {
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('users')
          .select('*')
          .order('registered_at', { ascending: false });
        if (!error && data) allUsers = data;
      } catch (err) {
        console.warn("Supabase user fetch failed, checking localStorage:", err);
      }
    }

    if (!allUsers.length) {
      allUsers = JSON.parse(localStorage.getItem(USERS_DB_KEY)) || [];
    }
  }

  const list = filteredList || allUsers;

  if (countBadge) {
    countBadge.innerText = `${allUsers.length} Users Registered`;
  }

  if (!tbody) return;

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 2.5rem; color: #888;">No users found.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(u => {
    const fName = u.first_name || u.firstName || '';
    const lName = u.last_name || u.lastName || '';
    const username = u.username || 'unknown';
    const email = u.email || 'N/A';
    const provider = (u.auth_provider || u.provider || 'local').toLowerCase();
    const id = u.id || 'N/A';
    const initials = `${fName[0] || ''}${lName[0] || ''}` || username[0] || 'U';
    const status = (u.status || 'active').toLowerCase();
    const loginCount = u.login_count || u.loginCount || 1;
    const regDate = u.registered_at || u.registeredAt ? new Date(u.registered_at || u.registeredAt).toLocaleDateString() : 'N/A';
    const lastLogin = u.last_login_at || u.lastLoginAt ? new Date(u.last_login_at || u.lastLoginAt).toLocaleString() : 'Just now';

    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <div style="width:32px; height:32px; border-radius:50%; background:#2a2e33; color:#fff; display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:600;">
              ${initials.toUpperCase()}
            </div>
            <div>
              <strong>${fName} ${lName}</strong>
              <div style="font-size:0.7rem; color:#888; font-family:monospace;">${String(id).slice(0, 8)}...</div>
            </div>
          </div>
        </td>
        <td><code>@${username}</code></td>
        <td>${email}</td>
        <td><span class="badge" style="padding:0.2rem 0.5rem; border-radius:4px; font-size:0.75rem; background:#1e293b; color:#93c5fd;">${provider.toUpperCase()}</span></td>
        <td style="font-size:0.8rem; color:#888;">${regDate}</td>
        <td><strong>${loginCount}</strong></td>
        <td style="font-size:0.8rem;">${lastLogin}</td>
        <td>
          <span style="display:inline-block; padding:0.2rem 0.5rem; border-radius:4px; font-size:0.75rem; ${status === 'active' ? 'background:rgba(34,197,94,0.15); color:#4ade80;' : 'background:rgba(239,68,68,0.15); color:#f87171;'}">
            ${status.toUpperCase()}
          </span>
        </td>
        <td>
          <button class="action" onclick="toggleUserStatus('${id}', '${status}')" style="cursor:pointer; padding:0.3rem 0.6rem; font-size:0.75rem;">
            ${status === 'active' ? 'Suspend' : 'Activate'}
          </button>
          <button class="action delete" onclick="deleteUserRecord('${id}')" style="cursor:pointer; padding:0.3rem 0.6rem; font-size:0.75rem; color:#ef4444;">
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// 3. Fetch and Render Login Audit Trail
async function fetchAndRenderLogs() {
  const tbody = document.getElementById('logTableBody') || document.querySelectorAll('tbody')[1];
  const countBadge = document.getElementById('logCount');
  let logs = [];

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('login_audit_logs')
        .select('*')
        .order('login_timestamp', { ascending: false });
      if (!error && data) logs = data;
    } catch (err) {
      console.warn("Supabase log fetch error:", err);
    }
  }

  if (!logs.length) {
    logs = JSON.parse(localStorage.getItem(LOGS_DB_KEY)) || [];
  }

  if (countBadge) {
    countBadge.innerText = `${logs.length} Total Sessions`;
  }

  if (!tbody) return;

  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2.5rem; color: #888;">No session records captured.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(l => {
    const time = l.login_timestamp || l.timestamp || Date.now();
    return `
      <tr>
        <td><code>${String(l.id || '').slice(0, 8)}</code></td>
        <td><strong>${l.full_name || l.fullName || 'Authenticated User'}</strong> <span style="color:#888; font-size:0.75rem;">(@${l.username || ''})</span></td>
        <td>${l.email || 'N/A'}</td>
        <td><span style="font-size:0.75rem; background:#1e293b; padding:0.2rem 0.5rem; border-radius:4px; color:#93c5fd;">${l.auth_method || l.authMethod || 'OAuth'}</span></td>
        <td style="color:#60a5fa; font-size:0.8rem;">${new Date(time).toLocaleString()}</td>
        <td style="color:#888; font-size:0.75rem;">${formatRelative(time)}</td>
      </tr>
    `;
  }).join('');
}

// 4. Live Search Filter
function filterUsers() {
  const input = document.getElementById('userSearchInput') || document.querySelector('input[type="search"]');
  if (!input) return;
  const query = input.value.toLowerCase().trim();

  if (!query) {
    fetchAndRenderUsers();
    return;
  }

  const filtered = allUsers.filter(u => {
    const name = `${u.first_name || u.firstName || ''} ${u.last_name || u.lastName || ''}`.toLowerCase();
    const email = (u.email || '').toLowerCase();
    const username = (u.username || '').toLowerCase();
    return name.includes(query) || email.includes(query) || username.includes(query);
  });

  fetchAndRenderUsers(filtered);
}

// 5. Account Actions (Supabase + Local fallback)
async function toggleUserStatus(userId, currentStatus) {
  const newStatus = currentStatus === 'active' ? 'suspended' : 'active';

  if (supabaseClient) {
    await supabaseClient
      .from('users')
      .update({ status: newStatus })
      .eq('id', userId);
  }

  allUsers = allUsers.map(u => u.id === userId ? { ...u, status: newStatus } : u);
  localStorage.setItem(USERS_DB_KEY, JSON.stringify(allUsers));
  fetchAndRenderUsers();
}

async function deleteUserRecord(userId) {
  if (!confirm("Are you sure you want to permanently delete this user account?")) return;

  if (supabaseClient) {
    await supabaseClient
      .from('users')
      .delete()
      .eq('id', userId);
  }

  allUsers = allUsers.filter(u => u.id !== userId);
  localStorage.setItem(USERS_DB_KEY, JSON.stringify(allUsers));
  fetchAndRenderUsers();
}

async function clearLogs() {
  if (!confirm("Flush all login audit trail history?")) return;

  if (supabaseClient) {
    await supabaseClient.from('login_audit_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  localStorage.setItem(LOGS_DB_KEY, JSON.stringify([]));
  fetchAndRenderLogs();
}

function formatRelative(isoStr) {
  const diff = Math.floor((new Date() - new Date(isoStr)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Attach Search Listeners & Init
window.addEventListener('DOMContentLoaded', () => {
  initAdminDashboard();
  const searchInput = document.getElementById('userSearchInput') || document.querySelector('input[type="search"]');
  if (searchInput) {
    searchInput.addEventListener('input', filterUsers);
  }
  const clearBtn = document.querySelector('button:has-text("Clear Login Trail")') || document.querySelector('.btn-clear-logs');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearLogs);
  }
});