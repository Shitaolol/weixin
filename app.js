const state = { moments: [], filtered: [], newestFirst: true, map: null, markers: [] };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function decryptVault(password) {
  const encoder = new TextEncoder();
  const rawKey = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  const salt = Uint8Array.from(atob(VAULT.salt), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(VAULT.iv), c => c.charCodeAt(0));
  const payload = Uint8Array.from(atob(VAULT.data), c => c.charCodeAt(0));
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: VAULT.iterations, hash: 'SHA-256' },
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, payload);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

$('#unlock-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = '正在解锁…';
  $('#unlock-error').textContent = '';
  try {
    const journal = await decryptVault($('#password').value);
    startApp(journal);
  } catch {
    $('#unlock-error').textContent = '密码不正确，请重新输入。';
  } finally {
    button.disabled = false;
    button.textContent = '进入拾光地图';
  }
});

$('#toggle-password').addEventListener('click', () => {
  const input = $('#password');
  input.type = input.type === 'password' ? 'text' : 'password';
});

function startApp(journal) {
  state.moments = journal.moments || [];
  $('#journal-summary').textContent = journal.profile?.summary || '记录去过的地方，也记录彼时的心情。';
  $('#lock-screen').hidden = true;
  $('#app').hidden = false;
  $('#password').value = '';
  document.title = `${journal.profile?.name || '拾光地图'} · 拾光地图`;
  hydrateFilters();
  updateStats();
  filterAndRender();
}

function hydrateFilters() {
  const years = [...new Set(state.moments.map(m => new Date(m.date).getFullYear()))].sort((a, b) => b - a);
  const tags = [...new Set(state.moments.flatMap(m => m.tags || []))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  $('#year-filter').insertAdjacentHTML('beforeend', years.map(y => `<option value="${y}">${y} 年</option>`).join(''));
  $('#tag-filter').insertAdjacentHTML('beforeend', tags.map(t => `<option value="${escapeHtml(t)}"># ${escapeHtml(t)}</option>`).join(''));
}

function updateStats() {
  const places = new Set(state.moments.filter(m => m.location).map(m => `${m.location.lat},${m.location.lng}`));
  const years = new Set(state.moments.map(m => new Date(m.date).getFullYear()));
  $('#stat-moments').textContent = state.moments.length;
  $('#stat-places').textContent = places.size;
  $('#stat-years').textContent = years.size;
}

function filterAndRender() {
  const query = $('#search').value.trim().toLowerCase();
  const year = $('#year-filter').value;
  const tag = $('#tag-filter').value;
  state.filtered = state.moments.filter(moment => {
    const haystack = [moment.title, moment.text, moment.location?.name, ...(moment.tags || [])].join(' ').toLowerCase();
    return (!query || haystack.includes(query)) &&
      (year === 'all' || String(new Date(moment.date).getFullYear()) === year) &&
      (tag === 'all' || (moment.tags || []).includes(tag));
  }).sort((a, b) => (new Date(b.date) - new Date(a.date)) * (state.newestFirst ? 1 : -1));
  renderTimeline();
  if (!$('#map-view').hidden) renderMap();
}

function renderTimeline() {
  $('#timeline').innerHTML = state.filtered.map((moment, index) => {
    const date = new Date(moment.date);
    const photos = (moment.photos || []).map((photo, photoIndex) => `
      <button class="photo-button" data-moment="${index}" data-photo="${photoIndex}" type="button">
        <img src="${escapeAttr(photo.src)}" alt="${escapeAttr(photo.alt || moment.title)}" loading="lazy">
      </button>`).join('');
    return `<article class="moment">
      <time class="moment-date" datetime="${escapeAttr(moment.date)}"><strong>${date.getDate()}</strong><span>${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}</span></time>
      <div class="timeline-dot" aria-hidden="true"></div>
      <div class="moment-content">
        <div class="moment-meta">${moment.location ? `<span class="moment-location">⌖ ${escapeHtml(moment.location.name)}</span>` : ''}<span>${formatWeekday(date)}</span></div>
        <h2>${escapeHtml(moment.title)}</h2>
        <p class="moment-text">${escapeHtml(moment.text)}</p>
        ${(moment.tags || []).length ? `<div class="tags">${moment.tags.map(t => `<span class="tag"># ${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        ${photos ? `<div class="photo-grid ${moment.photos.length === 1 ? 'single' : ''}">${photos}</div>` : ''}
      </div>
    </article>`;
  }).join('');
  $('#empty-state').hidden = state.filtered.length > 0;
  $$('.photo-button').forEach(button => button.addEventListener('click', openPhoto));
}

function openPhoto(event) {
  const moment = state.filtered[Number(event.currentTarget.dataset.moment)];
  const photo = moment.photos[Number(event.currentTarget.dataset.photo)];
  $('#dialog-image').src = photo.src;
  $('#dialog-image').alt = photo.alt || moment.title;
  $('#dialog-date').textContent = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long' }).format(new Date(moment.date));
  $('#dialog-title').textContent = moment.title;
  $('#photo-dialog').showModal();
}

function renderMap() {
  if (!window.L) {
    $('#map').innerHTML = '<p class="empty-state">地图资源加载失败，请检查网络连接。</p>';
    return;
  }
  if (!state.map) {
    state.map = L.map('map', { zoomControl: true }).setView([35.5, 105], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 18
    }).addTo(state.map);
  }
  state.markers.forEach(marker => marker.remove());
  state.markers = [];
  const located = state.filtered.filter(m => m.location?.lat && m.location?.lng);
  located.forEach(moment => {
    const marker = L.circleMarker([moment.location.lat, moment.location.lng], {
      radius: 8, color: '#ffffff', weight: 3, fillColor: '#d86b52', fillOpacity: 1
    }).addTo(state.map).bindPopup(`<div class="map-popup"><small>${formatDate(moment.date)}</small><h3>${escapeHtml(moment.title)}</h3><p>${escapeHtml(moment.location.name)}</p></div>`);
    state.markers.push(marker);
  });
  $('#place-list').innerHTML = located.map((m, i) => `<button class="place-item" data-marker="${i}" type="button"><strong>${escapeHtml(m.location.name)}</strong><span>${formatDate(m.date)} · ${escapeHtml(m.title)}</span></button>`).join('') || '<div class="empty-state"><p>当前筛选下没有地点记录。</p></div>';
  $$('.place-item').forEach(button => button.addEventListener('click', () => {
    const marker = state.markers[Number(button.dataset.marker)];
    state.map.flyTo(marker.getLatLng(), 11, { duration: 1 });
    marker.openPopup();
  }));
  if (state.markers.length) state.map.fitBounds(L.featureGroup(state.markers).getBounds().pad(.2), { maxZoom: 11 });
  setTimeout(() => state.map.invalidateSize(), 0);
}

$$('.tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.tab').forEach(t => t.classList.toggle('active', t === tab));
  const mapMode = tab.dataset.view === 'map';
  $('#timeline-view').hidden = mapMode;
  $('#map-view').hidden = !mapMode;
  if (mapMode) renderMap();
}));

$('#search').addEventListener('input', filterAndRender);
$('#year-filter').addEventListener('change', filterAndRender);
$('#tag-filter').addEventListener('change', filterAndRender);
$('#sort-button').addEventListener('click', () => {
  state.newestFirst = !state.newestFirst;
  $('#sort-button').textContent = state.newestFirst ? '最新在前 ↓' : '最早在前 ↑';
  filterAndRender();
});
$('#lock-button').addEventListener('click', () => location.reload());
$('#theme-button').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = dark ? '' : 'dark';
  localStorage.setItem('theme', dark ? 'light' : 'dark');
});
$('#close-dialog').addEventListener('click', () => $('#photo-dialog').close());
$('#photo-dialog').addEventListener('click', event => { if (event.target === $('#photo-dialog')) $('#photo-dialog').close(); });

function escapeHtml(value = '') { const el = document.createElement('div'); el.textContent = value; return el.innerHTML; }
function escapeAttr(value = '') { return escapeHtml(value).replaceAll('`', '&#96;'); }
function formatDate(value) { return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value)); }
function formatWeekday(date) { return new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(date); }

$('#today-label').textContent = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
if (localStorage.getItem('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
