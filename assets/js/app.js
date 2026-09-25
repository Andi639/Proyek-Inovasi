// ============================================================
// SIGAP RT — app.js
// Semua logic dipindahkan dari index.html (inline script)
// PENTING: window.storage API dipertahankan persis seperti aslinya
// ============================================================

// ---------------- STATE ----------------
let currentUser = null;
let incidents = [];
let accounts = [];
let mapInstance = null;
let mapMarkersLayer = null;
const DEFAULT_LOC = { lat: -1.2379, lng: 116.8529 }; // fallback: Balikpapan

// ---------------- STORAGE HELPERS ----------------
async function loadAccounts(){
  try{
    const r = await window.storage.get('rt-warga-accounts', true);
    accounts = r ? JSON.parse(r.value) : [];
  }catch(e){ accounts = []; }
}
async function saveAccounts(){
  try{ await window.storage.set('rt-warga-accounts', JSON.stringify(accounts), true); }
  catch(e){ console.error('Gagal menyimpan akun', e); }
}
async function loadIncidents(){
  try{
    const r = await window.storage.get('rt-incident-log', true);
    incidents = r ? JSON.parse(r.value) : [];
  }catch(e){ incidents = []; }
}
async function saveIncidents(){
  try{ await window.storage.set('rt-incident-log', JSON.stringify(incidents), true); }
  catch(e){ console.error('Gagal menyimpan laporan', e); }
}
async function loadSession(){
  try{
    const r = await window.storage.get('session-user', false);
    return r ? r.value : null;
  }catch(e){ return null; }
}
async function saveSession(username){
  try{ await window.storage.set('session-user', username, false); }catch(e){}
}
async function clearSession(){
  try{ await window.storage.delete('session-user', false); }catch(e){}
}

// ---------------- AUTH ----------------
function switchAuthTab(tab){
  document.getElementById('tab-masuk').classList.toggle('active', tab === 'login');
  document.getElementById('tab-daftar').classList.toggle('active', tab === 'register');
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
}

async function doRegister(){
  const nama     = document.getElementById('reg-nama').value.trim();
  const rt       = document.getElementById('reg-rt').value.trim();
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const msg      = document.getElementById('reg-msg');

  if(!nama || !rt || !username || !password){
    msg.textContent = 'Semua kolom wajib diisi.'; return;
  }
  if(password.length < 4){
    msg.textContent = 'Kata sandi minimal 4 karakter.'; return;
  }
  if(accounts.some(a => a.username.toLowerCase() === username.toLowerCase())){
    msg.textContent = 'Username sudah dipakai, coba yang lain.'; return;
  }
  accounts.push({ nama, rt, username, password });
  await saveAccounts();
  msg.style.color = '#16a34a';
  msg.textContent = 'Berhasil mendaftar! Silakan masuk.';
  setTimeout(() => {
    msg.style.color = '';
    msg.textContent = '';
    switchAuthTab('login');
    document.getElementById('login-username').value = username;
  }, 800);
}

async function doLogin(){
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const msg      = document.getElementById('login-msg');
  const acc = accounts.find(
    a => a.username.toLowerCase() === username.toLowerCase() && a.password === password
  );
  if(!acc){ msg.textContent = 'Username atau kata sandi salah.'; return; }
  currentUser = acc;
  await saveSession(acc.username);
  enterApp();
}

async function doLogout(){
  currentUser = null;
  await clearSession();
  document.getElementById('app-shell').classList.remove('active');
  document.getElementById('auth-screen').style.display = 'flex';
}

function enterApp(){
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-shell').classList.add('active');
  document.getElementById('whoami-name').textContent = currentUser.nama;
  document.getElementById('whoami-rt').textContent   = currentUser.rt;
  renderAll();
}

// ---------------- NAVIGATION ----------------
function goto(viewName){
  document.querySelectorAll('.page-view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + viewName).classList.remove('hidden');
  document.querySelectorAll('.nav-link').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewName);
  });
  if(viewName === 'peta') setTimeout(initOrRefreshMap, 50);
}

// ---------------- PANIC BUTTON ----------------
function openPanicConfirm(){
  document.getElementById('panic-modal').classList.remove('hidden');
}
function closePanicConfirm(){
  document.getElementById('panic-modal').classList.add('hidden');
}

async function confirmPanic(){
  closePanicConfirm();
  let loc = DEFAULT_LOC;
  try{
    loc = await new Promise((resolve) => {
      if(!navigator.geolocation){ resolve(DEFAULT_LOC); return; }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        ()  => resolve(DEFAULT_LOC),
        { timeout: 4000 }
      );
    });
  }catch(e){ loc = DEFAULT_LOC; }

  const record = {
    id:       'INC-' + Date.now(),
    waktu:    new Date().toISOString(),
    pelapor:  currentUser.nama,
    username: currentUser.username,
    rt:       currentUser.rt,
    lat:      loc.lat,
    lng:      loc.lng,
    status:   'Menunggu Respon'
  };
  incidents.unshift(record);
  await saveIncidents();
  renderAll();
  showToast('Sinyal Terkirim', 'Notifikasi Telegram grup RT telah dikirim. Tim ronda akan segera merespon.');
}

function showToast(title, body){
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<div class="toast-title">' + title + '</div>' + body;
  document.getElementById('toast-holder').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

// ---------------- STATUS CHANGE ----------------
async function changeStatus(id, newStatus){
  const rec = incidents.find(i => i.id === id);
  if(rec){ rec.status = newStatus; await saveIncidents(); renderAll(); }
}

// ---------------- RENDER ----------------
function statusBadge(status){
  if(status === 'Menunggu Respon') return '<span class="badge badge-menunggu">Menunggu Respon</span>';
  if(status === 'Ditangani')       return '<span class="badge badge-ditangani">Ditangani</span>';
  return '<span class="badge badge-selesai">Selesai</span>';
}

function fmtTime(iso){
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' })
       + ' · '
       + d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit' });
}

function renderAll(){
  renderRiwayat();
  renderTelegramLog();
  renderPressCount();
  if(!document.getElementById('view-peta').classList.contains('hidden')) initOrRefreshMap();
}

function renderRiwayat(){
  const now = new Date();
  const total      = incidents.length;
  const monthCount = incidents.filter(i => {
    const d = new Date(i.waktu);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const pending = incidents.filter(i => i.status === 'Menunggu Respon').length;
  const done    = incidents.filter(i => i.status === 'Selesai').length;

  document.getElementById('stat-total').textContent   = total;
  document.getElementById('stat-month').textContent   = monthCount;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-done').textContent    = done;

  const tbody = document.getElementById('riwayat-table');
  const empty = document.getElementById('riwayat-empty');

  if(incidents.length === 0){
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  tbody.innerHTML = incidents.map((i, idx) => {
    const opts = ['Menunggu Respon','Ditangani','Selesai']
      .map(s => '<option value="' + s + '"' + (s === i.status ? ' selected' : '') + '>' + s + '</option>')
      .join('');
    return '<tr>'
      + '<td class="cell-mono">'  + (incidents.length - idx) + '</td>'
      + '<td class="cell-mono">'  + fmtTime(i.waktu) + '</td>'
      + '<td>'                    + i.pelapor + '</td>'
      + '<td>'                    + i.rt + '</td>'
      + '<td class="cell-mono">'  + i.lat.toFixed(4) + ', ' + i.lng.toFixed(4) + '</td>'
      + '<td><select class="status-select" onchange="changeStatus(\'' + i.id + '\', this.value)">' + opts + '</select></td>'
      + '</tr>';
  }).join('');
}

function renderTelegramLog(){
  const log   = document.getElementById('tg-log');
  const empty = document.getElementById('tg-empty');
  if(incidents.length === 0){ log.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  log.innerHTML = incidents.slice(0, 20).map(i => {
    const msg = '🚨 SINYAL DARURAT — ' + i.rt
              + '\nPelapor: ' + i.pelapor
              + '\nStatus: '  + i.status
              + '\nLokasi: '  + i.lat.toFixed(4) + ', ' + i.lng.toFixed(4);
    return '<div class="tg-message">' + msg + '<span class="tg-meta">Bot SIGAP-RT · ' + fmtTime(i.waktu) + '</span></div>';
  }).join('');
}

function renderPressCount(){
  if(!currentUser) return;
  const now  = new Date();
  const mine = incidents.filter(i =>
    i.username === currentUser.username &&
    new Date(i.waktu).getMonth()    === now.getMonth() &&
    new Date(i.waktu).getFullYear() === now.getFullYear()
  );
  document.getElementById('my-press-count').textContent =
    'Kamu sudah menekan ' + mine.length + ' kali bulan ini';
}

// ---------------- MAP ----------------
function initOrRefreshMap(){
  const center = incidents.length
    ? [incidents[0].lat, incidents[0].lng]
    : [DEFAULT_LOC.lat, DEFAULT_LOC.lng];

  if(!mapInstance){
    mapInstance = L.map('map', { scrollWheelZoom: false }).setView(center, 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapInstance);
    mapMarkersLayer = L.layerGroup().addTo(mapInstance);
  }

  mapMarkersLayer.clearLayers();
  const redIcon = L.divIcon({
    className: '',
    html: '<div style="width:14px;height:14px;background:#dc2626;border:2px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(220,38,38,0.6);"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
  incidents.forEach(i => {
    L.marker([i.lat, i.lng], { icon: redIcon })
      .bindPopup('<b>' + i.pelapor + '</b><br>' + i.rt + '<br>' + fmtTime(i.waktu) + '<br>Status: ' + i.status)
      .addTo(mapMarkersLayer);
  });
  if(incidents.length) mapInstance.setView(center, 15);
  setTimeout(() => mapInstance.invalidateSize(), 60);
}

// ---------------- CLOCK ----------------
function tickClock(){
  document.getElementById('clock').textContent = new Date().toLocaleTimeString('id-ID');
}
setInterval(tickClock, 1000);
tickClock();

// ---------------- BOOT ----------------
async function boot(){
  await loadAccounts();
  await loadIncidents();
  const sessionUser = await loadSession();
  if(sessionUser){
    const acc = accounts.find(a => a.username === sessionUser);
    if(acc){ currentUser = acc; enterApp(); return; }
  }
}
boot();
