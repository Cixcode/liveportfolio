/* Storage Keys */
const USERS_DB_KEY = 'portfolio_users_db';
const LOGS_DB_KEY = 'portfolio_audit_logs';
const SESSION_KEY = 'portfolio_active_session';
const PROJECTS_KEY = 'portfolio_projects_data';

const INITIAL_PROJECTS = [
  { id: '1', title: "Aura OS", category: "Spatial Interaction", img: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=700&q=80", pinned: true },
  { id: '2', title: "Hyperlight", category: "Generative Identity", img: "https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=700&q=80", pinned: true },
  { id: '3', title: "Vektor Form", category: "Parametric Architecture", img: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=700&q=80", pinned: false },
  { id: '4', title: "Krypton Grid", category: "Editorial / WebGL", img: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=700&q=80", pinned: false },
  { id: '5', title: "Mono Font", category: "Typography", img: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&w=700&q=80", pinned: false }
];

// Supabase Client Setup
const SUPABASE_URL = 'https://jryrkpkzzrvgawkmljvt.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Replace when ready

let supabase = null;
try {
  if (window.supabase && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR_SUPABASE')) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn("Supabase client not initialized yet; running in offline/demo mode.", e);
}

let currentUser = null;
let projects = [];
let isExpanded = false;

/* 1. Trigger GitHub OAuth */
async function handleGitHubAuth() {
  if (!supabase) {
    alert("Please configure your SUPABASE_ANON_KEY inside script.js first.");
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: window.location.origin
    }
  });

  if (error) {
    alert("GitHub authentication error: " + error.message);
  }
}

/* 2. Check and Sync Active Session */
async function checkAuthSession() {
  if (!supabase) return;

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session || !session.user) return;

  const userMeta = session.user.user_metadata || {};
  const email = session.user.email || `${userMeta.user_name || 'user'}@users.noreply.github.com`;
  const fullName = userMeta.full_name || userMeta.name || userMeta.user_name || 'GitHub User';
  const nameParts = fullName.split(' ');
  const firstName = nameParts[0] || 'GitHub';
  const lastName = nameParts.slice(1).join(' ') || 'User';
  const username = userMeta.user_name || email.split('@')[0];

  // Try to sync with Supabase custom table
  try {
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    let targetUser = existingUser;

    if (!existingUser) {
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert([{
          first_name: firstName,
          last_name: lastName,
          username: username,
          email: email,
          auth_provider: 'github',
          status: 'active'
        }])
        .select()
        .single();

      if (!insertError) targetUser = newUser;
    }

    if (targetUser && targetUser.status === 'suspended') {
      alert("This account is suspended.");
      await supabase.auth.signOut();
      localStorage.removeItem(SESSION_KEY);
      currentUser = null;
      updateNavState();
      return;
    }

    // Record login audit log
    if (targetUser) {
      await supabase.from('login_audit_logs').insert([{
        user_id: targetUser.id,
        full_name: `${targetUser.first_name} ${targetUser.last_name}`,
        username: targetUser.username,
        email: targetUser.email,
        auth_method: 'GitHub OAuth'
      }]);
    }

    const sessionData = {
      id: targetUser ? targetUser.id : session.user.id,
      firstName: targetUser ? targetUser.first_name : firstName,
      lastName: targetUser ? targetUser.last_name : lastName,
      username: targetUser ? targetUser.username : username,
      email: email,
      role: targetUser ? targetUser.role : 'client',
      provider: 'github'
    };

    currentUser = sessionData;
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    updateNavState();
  } catch (err) {
    console.warn("Supabase sync bypassed, falling back to local session:", err);
  }
}

/* 3. Initialize App State */
function initApp() {
  if (!localStorage.getItem(USERS_DB_KEY)) localStorage.setItem(USERS_DB_KEY, JSON.stringify([]));
  if (!localStorage.getItem(LOGS_DB_KEY)) localStorage.setItem(LOGS_DB_KEY, JSON.stringify([]));

  const activeSession = localStorage.getItem(SESSION_KEY);
  if (activeSession) {
    try {
      currentUser = JSON.parse(activeSession);
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }
  updateNavState();

  const localProjects = localStorage.getItem(PROJECTS_KEY);
  projects = localProjects ? JSON.parse(localProjects) : [...INITIAL_PROJECTS];

  const params = new URLSearchParams(window.location.search);
  const shared = params.get('pinned');
  if (shared) {
    const ids = shared.split(',');
    projects = projects.map(p => ({ ...p, pinned: ids.includes(String(p.id)) }));
  }

  renderGrid();
  initCanvas();
}

/* 4. Dynamic Header Navigation */
function updateNavState() {
  const container = document.getElementById('navActions');
  if (!container) return;

  if (currentUser) {
    container.innerHTML = `
      <span class="user-badge">Hello, <strong>${currentUser.firstName || currentUser.username}</strong></span>
      <a href="admin.html" class="btn-secondary" style="text-decoration:none;">Admin</a>
      <button class="btn-secondary" onclick="sharePinnedLink()">Share Curated</button>
      <button class="btn-primary" onclick="toggleModal('uploadModal', true)">+ Add Project</button>
      <button class="btn-secondary" onclick="handleLogout()">Log Out</button>
    `;
  } else {
    container.innerHTML = `
      <button class="btn-secondary" onclick="sharePinnedLink()">Share Curated</button>
      <button class="btn-secondary" onclick="toggleModal('loginModal', true)">Log In</button>
      <button class="btn-primary" onclick="toggleModal('signupModal', true)">Sign Up</button>
    `;
  }
}

/* 5. Standard Form Auth */
function handleSignup(e) {
  e.preventDefault();
  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName = document.getElementById('regLastName').value.trim();
  const username = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;

  const users = JSON.parse(localStorage.getItem(USERS_DB_KEY)) || [];

  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    alert("Username is already taken.");
    return;
  }
  if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    alert("Email address is already registered.");
    return;
  }

  const newUser = {
    id: 'usr_' + Date.now(),
    firstName,
    lastName,
    username,
    email,
    password,
    provider: 'local',
    status: 'active',
    registeredAt: new Date().toISOString(),
    loginCount: 0
  };

  users.push(newUser);
  localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));

  loginUser(newUser, 'Standard Registration');
  toggleModal('signupModal', false);
  document.getElementById('signupForm').reset();
}

function handleLogin(e) {
  e.preventDefault();
  const identifier = document.getElementById('loginIdentifier').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;

  const users = JSON.parse(localStorage.getItem(USERS_DB_KEY)) || [];
  const user = users.find(u => 
    (u.username.toLowerCase() === identifier || u.email.toLowerCase() === identifier) && 
    u.password === password
  );

  if (!user) {
    alert("Invalid username/email or password.");
    return;
  }

  if (user.status === 'suspended') {
    alert("This account is suspended.");
    return;
  }

  loginUser(user, 'Standard Form');
  toggleModal('loginModal', false);
  document.getElementById('loginForm').reset();
}

function loginUser(user, method) {
  const users = JSON.parse(localStorage.getItem(USERS_DB_KEY)) || [];
  const idx = users.findIndex(u => u.id === user.id);
  if (idx !== -1) {
    users[idx].loginCount = (users[idx].loginCount || 0) + 1;
    users[idx].lastLoginAt = new Date().toISOString();
    localStorage.setItem(USERS_DB_KEY, JSON.stringify(users));
  }

  const logs = JSON.parse(localStorage.getItem(LOGS_DB_KEY)) || [];
  logs.unshift({
    id: 'log_' + Date.now(),
    userId: user.id,
    fullName: `${user.firstName} ${user.lastName}`,
    username: user.username,
    email: user.email,
    authMethod: method,
    timestamp: new Date().toISOString()
  });
  localStorage.setItem(LOGS_DB_KEY, JSON.stringify(logs));

  currentUser = user;
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  updateNavState();
}

async function handleLogout() {
  if (supabase) {
    await supabase.auth.signOut();
  }
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  updateNavState();
}

/* 6. Modal Toggles */
function toggleModal(id, show) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('active', show);
}

function switchModals(fromId, toId) {
  toggleModal(fromId, false);
  toggleModal(toId, true);
}

/* 7. Grid & Project Interactions */
function renderGrid() {
  const grid = document.getElementById('portfolioGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const sorted = [...projects].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  const visible = isExpanded ? sorted : sorted.slice(0, 3);

  visible.forEach(p => {
    const card = document.createElement('article');
    card.className = `project-card ${p.pinned ? 'is-pinned' : ''}`;
    card.innerHTML = `
      <div class="media-box" style="background-image: url('${p.img}')">
        ${p.pinned ? '<span class="pin-badge">Pinned</span>' : ''}
      </div>
      <div class="project-meta">
        <div>
          <h3>${p.title}</h3>
          <span>${p.category}</span>
        </div>
        <div class="card-actions">
          <button class="icon-btn ${p.pinned ? 'pinned' : ''}" title="Pin to top" onclick="togglePin('${p.id}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="${p.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>
          </button>
          <button class="icon-btn delete" title="Delete work" onclick="deleteProject('${p.id}')">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  const counter = document.getElementById('counter');
  if (counter) counter.innerText = `Showing ${visible.length} of ${projects.length} projects`;

  const wrap = document.getElementById('seeMoreWrap');
  if (wrap) wrap.style.display = projects.length <= 3 ? 'none' : 'flex';
  const seeMoreText = document.getElementById('seeMoreText');
  if (seeMoreText) seeMoreText.innerText = isExpanded ? 'Show Less' : 'Explore All Works';
}

function togglePin(id) {
  const target = projects.find(p => String(p.id) === String(id));
  if (!target) return;

  const activePins = projects.filter(p => p.pinned);
  if (!target.pinned && activePins.length >= 3) {
    alert("Limit reached: You can pin a maximum of 3 projects.");
    return;
  }

  target.pinned = !target.pinned;
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  renderGrid();
}

function deleteProject(id) {
  if (confirm("Remove this project from showcase?")) {
    projects = projects.filter(p => String(p.id) !== String(id));
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    renderGrid();
  }
}

function handleProjectSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('projTitle').value;
  const category = document.getElementById('projCategory').value;
  const file = document.getElementById('projImage').files[0];

  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    projects.unshift({
      id: Date.now().toString(),
      title,
      category,
      img: event.target.result,
      pinned: false
    });
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    toggleModal('uploadModal', false);
    document.getElementById('projectForm').reset();
    renderGrid();
  };
  reader.readAsDataURL(file);
}

function toggleSeeMore() {
  isExpanded = !isExpanded;
  renderGrid();
}

function sharePinnedLink() {
  const pinnedIds = projects.filter(p => p.pinned).map(p => p.id);
  if (!pinnedIds.length) {
    alert("Pin at least one project using the star icon first!");
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('pinned', pinnedIds.join(','));
  navigator.clipboard.writeText(url.toString()).then(() => {
    alert("Showcase link copied to clipboard!");
  }).catch(() => {
    prompt("Copy this share link:", url.toString());
  });
}

/* 8. Hero Graphics Animation */
function initCanvas() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let width, height, t = 0;

  function resize() {
    width = canvas.width = canvas.offsetWidth;
    height = canvas.height = canvas.offsetHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  function renderMotion() {
    ctx.fillStyle = '#0c0d0e';
    ctx.fillRect(0, 0, width, height);

    const lines = 16;
    for (let i = 0; i < lines; i++) {
      ctx.beginPath();
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.03 + (i / lines) * 0.08})`;

      for (let x = 0; x < width; x += 15) {
        const y = (height / 2) +
          Math.sin(x * 0.003 + t + i * 0.2) * 55 * Math.sin(t * 0.3) +
          Math.cos(x * 0.005 + t * 0.5) * 25;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    t += 0.015;
    requestAnimationFrame(renderMotion);
  }
  renderMotion();
}

// Single Event Listener Entry Point
window.addEventListener('DOMContentLoaded', () => {
  try {
    initApp();
  } catch (err) {
    console.error("Initialization error:", err);
  }
  
  if (supabase) {
    checkAuthSession();
  }
});