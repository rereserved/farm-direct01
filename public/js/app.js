// ---------- session ----------
const getToken = () => localStorage.getItem('fd_token');
const getUser = () => JSON.parse(localStorage.getItem('fd_user') || 'null');
const saveSession = d => { localStorage.setItem('fd_token', d.token); localStorage.setItem('fd_user', JSON.stringify(d.user)); };
const logout = async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch {}
  localStorage.clear(); location.href = '/';
};
async function api(url, opts = {}) {
  opts.headers = { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) };
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { if (r.status === 401) { localStorage.clear(); } throw new Error(data.error || 'Request failed'); }
  return data;
}

// ---------- header (renders login state on every page) ----------
function renderHeader() {
  const slot = document.getElementById('authSlot');
  if (!slot) return;
  const u = getUser();
  slot.innerHTML = u
    ? `<span class="hi">👋 ${u.name} <small>(${u.role})</small></span>
       ${u.role === 'buyer' ? '<a href="/buyer.html">My Orders</a>' : ''}
       ${u.role === 'farmer' ? '<a href="/farmer.html">Dashboard</a>' : ''}
       <a href="#" onclick="logout();return false">Logout</a>`
    : `<a href="#" onclick="showAuth();return false">Login / Register</a>`;
}

function showAuth(targetMode) {
  const el = document.getElementById('authModal');
  if (el) {
    if (targetMode && typeof mode !== 'undefined' && mode !== targetMode && typeof toggleMode === 'function') {
      toggleMode();
    }
    el.style.display = 'flex';
  } else {
    location.href = '/?auth=' + (targetMode || 'login');
  }
}

// ---------- cart badge ----------
async function refreshCartBadge() {
  const badge = document.getElementById('cartBadge');
  if (!badge || !getUser() || getUser().role !== 'buyer') return;
  try {
    const c = await api('/api/cart');
    badge.textContent = c.items.length;
    badge.style.display = c.items.length ? 'inline-block' : 'none';
  } catch {}
}

document.addEventListener('DOMContentLoaded', () => { renderHeader(); refreshCartBadge(); });
