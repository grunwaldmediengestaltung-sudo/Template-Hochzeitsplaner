/* =========================================================
   Hochzeits-Planer — App Logic
   ========================================================= */

const API_URL = '/.netlify/functions/data';
const SAVE_DEBOUNCE_MS = 200;
const AUTO_REFRESH_MS = 5000;

let lastKnownDataString = null;
let isSaving = false;

// Feste Kontakte, immer sichtbar, nicht löschbar, bleiben beim Projekt-Reset erhalten
const FIXED_CONTACTS = [
  { id: 'fixed-stephan', name: 'Stephan', rolle: 'Grunwald Photography', telefon: '0174 21 78 169', email: '' },
  { id: 'fixed-tina', name: 'Tina', rolle: 'Grunwald Photography', telefon: '0174 21 78 177', email: '' }
];
const FIXED_WEBSITE = { label: 'www.grunwald-photography.de', url: 'https://www.grunwald-photography.de' };

const KONTAKT_KATEGORIEN = {
  braut: 'Braut',
  braeutigam: 'Bräutigam',
  beide: 'Beide',
  dienstleister: 'Dienstleister',
  trauzeuge_braeutigam: 'Trauzeuge Bräutigam',
  trauzeuge_braeutigam2: 'Trauzeuge Bräutigam 2',
  trauzeuge_braut: 'Trauzeuge Braut',
  trauzeuge_braut2: 'Trauzeuge Braut 2'
};

const THEME_FARBEN_LABELS = {
  cream: 'Hintergrund (Creme)',
  espresso: 'Sidebar & Text (Dunkelgrün)',
  terracotta: 'Akzentfarbe',
  champagne: 'Karten / Flächen',
  silver: 'Silber / Sekundär'
};

const DEFAULT_THEME_FARBEN = {
  cream: '#F7F4ED',
  espresso: '#1E3328',
  terracotta: '#7C8C7E',
  champagne: '#E7E2D6',
  silver: '#C7C2B8'
};

function applyTheme(){
  const theme = state.meta.themeFarben || DEFAULT_THEME_FARBEN;
  const root = document.documentElement.style;
  root.setProperty('--cream', theme.cream);
  root.setProperty('--espresso', theme.espresso);
  root.setProperty('--terracotta', theme.terracotta);
  root.setProperty('--champagne', theme.champagne);
  root.setProperty('--silver', theme.silver);
}

let state = {
  meta: {
    namen: 'Lena & Tobias',
    datum: '2026-09-14',
    whatsappLink: '',
    titelbildUrl: '',
    kategorieFarben: {
      braut: '#E7D7DD',
      braeutigam: '#D8E2DC',
      beide: '#E7E2D6',
      dienstleister: '#E3DCEF',
      trauzeuge_braeutigam: '#CFE0E8',
      trauzeuge_braeutigam2: '#BFD6E0',
      trauzeuge_braut: '#F0DCE6',
      trauzeuge_braut2: '#E8C9D9'
    },
    themeFarben: {
      cream: '#F7F4ED',
      espresso: '#1E3328',
      terracotta: '#7C8C7E',
      champagne: '#E7E2D6',
      silver: '#C7C2B8'
    }
  },
  timeline: [],
  shotlist: [],
  shotContainer: [],
  locations: [],
  kontakte: [],
  moodboard: [],
  notizen: [],
  vertrag: { downloadUrl: '', passwort: 'gpvertrag' }
};

let saveTimer = null;

/* ---------------- Utilities ---------------- */

function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}

/**
 * Aktiviert Drag-and-Drop-Sortierung für Karten innerhalb eines Containers.
 * Per Maus: sofortiges Ziehen am Drag-Handle (.drag-handle).
 * Per Touch: Long-Press (300ms) auf die Karte startet das Ziehen.
 * Nach dem Loslassen wird das `items`-Array in der neuen Reihenfolge
 * neu aufgebaut und gespeichert.
 *
 * Optional: options.dropTargetSelector + options.onDropToTarget(itemId, targetEl)
 * erlaubt das Ziehen von Karten auf externe "Drop-Zonen" (z.B. Location-Container).
 * Wird über einer solchen Zone losgelassen, wird onDropToTarget aufgerufen
 * statt die Karte innerhalb der Liste neu einzuordnen.
 */
function enableDragSort(container, itemSelector, items, options){
  options = options || {};
  let dragEl = null;
  let placeholder = null;
  let longPressTimer = null;
  let pointerId = null;
  let currentDropTarget = null;

  const LONG_PRESS_MS = 300;

  function getCards(){
    return Array.from(container.querySelectorAll(itemSelector));
  }

  function getDropTargets(){
    if(!options.dropTargetSelector) return [];
    return Array.from(document.querySelectorAll(options.dropTargetSelector));
  }

  function findDropTargetAt(x, y){
    for(const target of getDropTargets()){
      const rect = target.getBoundingClientRect();
      if(x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom){
        return target;
      }
    }
    return null;
  }

  function onPointerDown(e){
    const card = e.target.closest(itemSelector);
    if(!card) return;

    const isHandle = e.target.closest('.drag-handle');
    pointerId = e.pointerId;

    if(isHandle){
      startDrag(card, e);
    } else if(e.pointerType === 'touch'){
      longPressTimer = setTimeout(() => {
        startDrag(card, e);
      }, LONG_PRESS_MS);

      const clearOnUp = () => {
        clearTimeout(longPressTimer);
        document.removeEventListener('pointerup', clearOnUp);
        document.removeEventListener('pointercancel', clearOnUp);
      };
      document.addEventListener('pointerup', clearOnUp, { once:true });
      document.addEventListener('pointercancel', clearOnUp, { once:true });
    }
  }

  function startDrag(card, e){
    dragEl = card;
    dragEl.setPointerCapture && pointerId !== null && dragEl.setPointerCapture(pointerId);

    // Scrollen/Browser-Gesten während des Ziehens komplett blockieren
    document.body.style.touchAction = 'none';
    document.body.style.overflow = 'hidden';
    document.body.classList.add('dragging-active');

    placeholder = document.createElement('div');
    placeholder.className = 'drag-placeholder';
    placeholder.style.height = `${dragEl.offsetHeight}px`;

    dragEl.classList.add('dragging');
    dragEl.style.width = `${dragEl.offsetWidth}px`;
    dragEl.parentNode.insertBefore(placeholder, dragEl.nextSibling);
    document.body.appendChild(dragEl);
    positionDragEl(e.clientX, e.clientY);

    document.addEventListener('pointermove', onPointerMove, { passive:false });
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }

  function positionDragEl(x, y){
    dragEl.style.position = 'fixed';
    dragEl.style.left = `${x - dragEl.offsetWidth / 2}px`;
    dragEl.style.top = `${y - dragEl.offsetHeight / 2}px`;
    dragEl.style.zIndex = '200';
    dragEl.style.pointerEvents = 'none';
  }

  function onPointerMove(e){
    if(!dragEl) return;
    e.preventDefault();
    positionDragEl(e.clientX, e.clientY);

    const dropTarget = findDropTargetAt(e.clientX, e.clientY);
    if(dropTarget !== currentDropTarget){
      if(currentDropTarget) currentDropTarget.classList.remove('drag-over');
      if(dropTarget) dropTarget.classList.add('drag-over');
      currentDropTarget = dropTarget;
    }

    if(dropTarget){
      // Über einer Drop-Zone: Platzhalter ausblenden, keine Neuanordnung in der Liste
      if(placeholder.parentNode) placeholder.remove();
      return;
    }

    if(!placeholder.parentNode){
      container.appendChild(placeholder);
    }

    const cards = getCards().filter(c => c !== dragEl);
    let closest = null;
    let closestOffset = Number.POSITIVE_INFINITY;

    cards.forEach(card => {
      const rect = card.getBoundingClientRect();
      const offset = e.clientY - (rect.top + rect.height / 2);
      if(Math.abs(offset) < Math.abs(closestOffset)){
        closestOffset = offset;
        closest = card;
      }
    });

    if(closest){
      if(closestOffset < 0){
        closest.parentNode.insertBefore(placeholder, closest);
      } else {
        closest.parentNode.insertBefore(placeholder, closest.nextSibling);
      }
    }
  }

  function onPointerUp(){
    if(!dragEl) return;

    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);

    document.body.style.touchAction = '';
    document.body.style.overflow = '';
    document.body.classList.remove('dragging-active');

    dragEl.classList.remove('dragging');
    dragEl.style.position = '';
    dragEl.style.left = '';
    dragEl.style.top = '';
    dragEl.style.width = '';
    dragEl.style.zIndex = '';
    dragEl.style.pointerEvents = '';

    const dropTarget = currentDropTarget;
    if(dropTarget) dropTarget.classList.remove('drag-over');
    currentDropTarget = null;

    if(dropTarget && options.onDropToTarget){
      const itemId = dragEl.dataset.id;
      if(placeholder.parentNode){
        placeholder.parentNode.insertBefore(dragEl, placeholder);
        placeholder.remove();
      } else {
        dragEl.remove();
      }
      placeholder = null;
      dragEl = null;
      pointerId = null;
      options.onDropToTarget(itemId, dropTarget);
      return;
    }

    if(!placeholder.parentNode){
      container.appendChild(placeholder);
    }
    placeholder.parentNode.insertBefore(dragEl, placeholder);
    placeholder.remove();
    placeholder = null;

    // Neue Reihenfolge anhand der IDs im DOM ermitteln
    const newOrderIds = getCards().map(c => c.dataset.id);
    items.sort((a, b) => newOrderIds.indexOf(a.id) - newOrderIds.indexOf(b.id));

    dragEl = null;
    pointerId = null;

    queueSave();
  }

  container.addEventListener('pointerdown', onPointerDown);
}

function escapeHtml(str){
  if(str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function telLink(phone){
  // Entfernt Leerzeichen, Schrägstriche, Klammern etc. für gültige tel:-Links
  return String(phone).replace(/[^0-9+]/g, '');
}

function openDataUrlAsBlob(dataUrl, filename){
  try{
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if(!matches){
      window.open(dataUrl, '_blank');
      return;
    }
    const mimeType = matches[1];
    const base64 = matches[2];
    const byteString = atob(base64);
    const bytes = new Uint8Array(byteString.length);
    for(let i = 0; i < byteString.length; i++){
      bytes[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.download = filename || '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }catch(e){
    console.error('Konnte Datei nicht öffnen', e);
    alert('Die Datei konnte nicht geöffnet werden.');
  }
}

function formatDateLong(iso){
  if(!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if(isNaN(d)) return iso;
  return d.toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' });
}

/* ---------------- Persistence ---------------- */

async function loadState(){
  setSyncStatus('loading');
  try{
    const res = await fetch(API_URL, { cache: 'no-store' });
    if(res.ok){
      const data = await res.json();
      lastKnownDataString = JSON.stringify(data || {});
      if(data && Object.keys(data).length){
        state = Object.assign({}, state, data);
        state.timeline = data.timeline || [];
        state.shotlist = data.shotlist || [];
        state.shotContainer = data.shotContainer || [];
        state.locations = data.locations || [];
        state.kontakte = data.kontakte || [];
        state.moodboard = data.moodboard || [];
        state.notizen = data.notizen || [];
        state.vertrag = data.vertrag || { downloadUrl:'', passwort:'gpvertrag' };
        if(!state.vertrag.passwort) state.vertrag.passwort = 'gpvertrag';
        state.meta = data.meta || state.meta;
        if(!state.meta.themeFarben){
          state.meta.themeFarben = Object.assign({}, DEFAULT_THEME_FARBEN);
        }
        const defaultKategorieFarben = {
          braut: '#E7D7DD',
          braeutigam: '#D8E2DC',
          beide: '#E7E2D6',
          dienstleister: '#E3DCEF',
          trauzeuge_braeutigam: '#CFE0E8',
          trauzeuge_braeutigam2: '#BFD6E0',
          trauzeuge_braut: '#F0DCE6',
          trauzeuge_braut2: '#E8C9D9'
        };
        if(!state.meta.kategorieFarben){
          state.meta.kategorieFarben = Object.assign({}, defaultKategorieFarben);
        } else {
          Object.keys(defaultKategorieFarben).forEach(key => {
            if(!state.meta.kategorieFarben[key]){
              state.meta.kategorieFarben[key] = defaultKategorieFarben[key];
            }
          });
        }
      }
    }
  }catch(e){
    console.warn('Konnte Daten nicht laden, nutze lokale Defaults / Cache.', e);
    const cached = localStorage.getItem('hochzeit-cache');
    if(cached){
      try{ state = JSON.parse(cached); }catch(_){}
    }
  }
  setSyncStatus('saved');
  applyTheme();
  renderAll();
}

function queueSave(){
  setSyncStatus('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, SAVE_DEBOUNCE_MS);
}

async function saveState(){
  isSaving = true;
  localStorage.setItem('hochzeit-cache', JSON.stringify(state));
  try{
    const res = await fetch(API_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(state)
    });
    if(!res.ok) throw new Error('Speichern fehlgeschlagen');
    lastKnownDataString = JSON.stringify(state);
    setSyncStatus('saved');
  }catch(e){
    console.error(e);
    setSyncStatus('error');
  } finally {
    isSaving = false;
  }
}

function setSyncStatus(status){
  const el = document.getElementById('syncStatus');
  el.classList.remove('saving','error');
  if(status === 'saving'){
    el.textContent = '● speichert …';
    el.classList.add('saving');
  } else if(status === 'error'){
    el.textContent = '● Fehler beim Speichern';
    el.classList.add('error');
  } else if(status === 'loading'){
    el.textContent = '● lädt …';
  } else {
    el.textContent = '● gespeichert';
  }
}

/* ---------------- Auto-Refresh ---------------- */

/**
 * Prüft alle paar Sekunden, ob auf dem Server neuere Daten liegen
 * (z.B. weil Brautpaar/Trauzeugen etwas geändert haben) und lädt die
 * Seite in diesem Fall neu. Pausiert, solange ein Modal offen ist,
 * gerade gezogen wird, oder eine eigene Änderung noch nicht gespeichert wurde,
 * um keine Eingaben zu verlieren.
 */
function startAutoRefresh(){
  setInterval(async () => {
    if(lastKnownDataString === null) return;
    if(saveTimer || isSaving) return; // eigene Änderung wartet noch oder läuft gerade
    if(document.getElementById('modalOverlay').classList.contains('active')) return;
    if(document.body.classList.contains('dragging-active')) return;

    try{
      const res = await fetch(API_URL, { cache: 'no-store' });
      if(!res.ok) return;
      const data = await res.json();
      const newDataString = JSON.stringify(data || {});
      if(newDataString !== lastKnownDataString){
        location.reload();
      }
    }catch(e){
      // Netzwerkfehler beim Polling ignorieren
    }
  }, AUTO_REFRESH_MS);
}

/* ---------------- Navigation ---------------- */

function initNav(){
  document.querySelectorAll('#navList li').forEach(li => {
    li.addEventListener('click', () => switchView(li.dataset.view));
    li.setAttribute('tabindex','0');
    li.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); switchView(li.dataset.view); }
    });
  });

  document.querySelectorAll('.stat-card-link').forEach(card => {
    card.addEventListener('click', () => switchView(card.dataset.view));
    card.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); switchView(card.dataset.view); }
    });
  });
}

function switchView(view){
  document.querySelectorAll('#navList li').forEach(li => li.classList.toggle('active', li.dataset.view === view));
  document.querySelectorAll('.view').forEach(sec => sec.classList.toggle('active', sec.id === 'view-' + view));
}

/* ---------------- Modal ---------------- */

function openModal(html, onMount, onClose){
  const overlay = document.getElementById('modalOverlay');
  const modal = document.getElementById('modal');
  modal.innerHTML = html;
  overlay.classList.add('active');
  if(onMount) onMount(modal);

  document._modalOnClose = onClose || null;

  let mouseDownOnOverlay = false;

  const mouseDownHandler = (e) => {
    mouseDownOnOverlay = (e.target === overlay);
  };

  const mouseUpHandler = (e) => {
    if(mouseDownOnOverlay && e.target === overlay){
      closeModal();
    }
    mouseDownOnOverlay = false;
  };

  const keyHandler = (e) => {
    if(e.key === 'Escape'){
      closeModal();
    }
  };

  overlay.addEventListener('mousedown', mouseDownHandler);
  overlay.addEventListener('mouseup', mouseUpHandler);
  document.addEventListener('keydown', keyHandler);

  document._modalMouseDownHandler = mouseDownHandler;
  document._modalMouseUpHandler = mouseUpHandler;
  document._modalKeyHandler = keyHandler;
}

function closeModal(){
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('active');
  if(document._modalMouseDownHandler){
    overlay.removeEventListener('mousedown', document._modalMouseDownHandler);
  }
  if(document._modalMouseUpHandler){
    overlay.removeEventListener('mouseup', document._modalMouseUpHandler);
  }
  if(document._modalKeyHandler){
    document.removeEventListener('keydown', document._modalKeyHandler);
  }
  if(document._modalOnClose){
    document._modalOnClose();
    document._modalOnClose = null;
  }
}

/* =========================================================
   RENDER ALL
   ========================================================= */

function renderAll(){
  renderMeta();
  renderOverview();
  renderTimeline();
  renderShotlist();
  renderLocations();
  renderContacts();
  renderMoodboard();
  renderContract();
}

function renderMeta(){
  document.getElementById('brandNames').textContent = state.meta.namen || 'Unsere Hochzeit';
  document.getElementById('brandDate').textContent = formatDateLong(state.meta.datum);

  const waBtn = document.getElementById('whatsappBtn');
  const link = state.meta.whatsappLink;
  if(link){
    waBtn.href = link;
    waBtn.style.display = 'flex';
  } else {
    waBtn.style.display = 'none';
  }

  const banner = document.getElementById('heroBanner');
  const bannerImg = document.getElementById('heroBannerImg');
  const bannerNames = document.getElementById('heroBannerNames');
  if(state.meta.titelbildUrl){
    bannerImg.src = state.meta.titelbildUrl;
    bannerNames.textContent = state.meta.namen || 'Unsere Hochzeit';
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

function renderOverview(){
  document.getElementById('statTimeline').textContent = state.timeline.length;
  let totalShots = state.shotlist.length;
  state.shotContainer.forEach(c => totalShots += (c.items || []).length);
  document.getElementById('statShotlist').textContent = totalShots;
  document.getElementById('statLocations').textContent = state.locations.length;
}

/* =========================================================
   TIMELINE
   ========================================================= */

function renderTimeline(){
  const container = document.getElementById('timelineList');
  const items = [...state.timeline].sort((a,b) => (a.zeit||'').localeCompare(b.zeit||''));

  if(items.length === 0){
    container.innerHTML = `<p style="color:#a59c8f;">Noch keine Programmpunkte. Fügt den ersten Punkt eures Tages hinzu.</p>`;
    return;
  }

  container.innerHTML = items.map(item => {
    const comments = state.notizen.filter(n => n.bezugTyp === 'timeline' && n.bezugId === item.id);
    return `
    <div class="timeline-item" data-id="${item.id}">
      <div class="item-actions">
        <button class="btn-icon" data-action="edit-timeline" title="Bearbeiten">✎</button>
        <button class="btn-icon" data-action="delete-timeline" title="Löschen">✕</button>
      </div>
      <span class="timeline-time">${escapeHtml(item.zeit || '--:--')}</span>
      <h3>${escapeHtml(item.titel || 'Ohne Titel')}</h3>
      ${item.ort ? `<div class="timeline-meta">📍 ${escapeHtml(item.ort)}</div>` : ''}
      ${item.notizen ? `<p class="timeline-notes">${escapeHtml(item.notizen)}</p>` : ''}
      <button class="comment-toggle" data-action="open-comments" title="Kommentare">
        💬 ${comments.length > 0 ? comments.length : 'Kommentieren'}
      </button>
    </div>`;
  }).join('');

  container.querySelectorAll('[data-action="edit-timeline"]').forEach(btn => {
    btn.addEventListener('click', e => editTimelineItem(e.target.closest('.timeline-item').dataset.id));
  });
  container.querySelectorAll('[data-action="delete-timeline"]').forEach(btn => {
    btn.addEventListener('click', e => deleteTimelineItem(e.target.closest('.timeline-item').dataset.id));
  });
  container.querySelectorAll('[data-action="open-comments"]').forEach(btn => {
    btn.addEventListener('click', e => openCommentsModal(e.target.closest('.timeline-item').dataset.id, 'timeline'));
  });
}

function timelineFormHtml(item){
  item = item || { zeit:'', titel:'', ort:'', notizen:'' };
  return `
    <h2>${item.id ? 'Programmpunkt bearbeiten' : 'Neuer Programmpunkt'}</h2>
    <form id="timelineForm">
      <label for="tlZeit">Uhrzeit</label>
      <input type="time" id="tlZeit" value="${escapeHtml(item.zeit)}" required>

      <label for="tlTitel">Titel</label>
      <input type="text" id="tlTitel" value="${escapeHtml(item.titel)}" placeholder="z.B. Trauung, Fotoshooting Paar" required>

      <label for="tlOrt">Ort</label>
      <input type="text" id="tlOrt" value="${escapeHtml(item.ort)}" placeholder="z.B. Standesamt Bremen">

      <label for="tlNotizen">Notizen</label>
      <textarea id="tlNotizen" placeholder="Details, Hinweise …">${escapeHtml(item.notizen)}</textarea>

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="cancelBtn">Abbrechen</button>
        <button type="submit" class="btn btn-primary" style="margin:0;">Speichern</button>
      </div>
    </form>
  `;
}

function addTimelineItem(){
  openModal(timelineFormHtml(null), modal => {
    modal.querySelector('#cancelBtn').addEventListener('click', closeModal);
    modal.querySelector('#timelineForm').addEventListener('submit', e => {
      e.preventDefault();
      state.timeline.push({
        id: uid(),
        zeit: modal.querySelector('#tlZeit').value,
        titel: modal.querySelector('#tlTitel').value.trim(),
        ort: modal.querySelector('#tlOrt').value.trim(),
        notizen: modal.querySelector('#tlNotizen').value.trim()
      });
      queueSave();
      renderAll();
      closeModal();
    });
  });
}

function editTimelineItem(id){
  const item = state.timeline.find(t => t.id === id);
  if(!item) return;
  openModal(timelineFormHtml(item), modal => {
    modal.querySelector('#cancelBtn').addEventListener('click', closeModal);
    modal.querySelector('#timelineForm').addEventListener('submit', e => {
      e.preventDefault();
      item.zeit = modal.querySelector('#tlZeit').value;
      item.titel = modal.querySelector('#tlTitel').value.trim();
      item.ort = modal.querySelector('#tlOrt').value.trim();
      item.notizen = modal.querySelector('#tlNotizen').value.trim();
      queueSave();
      renderAll();
      closeModal();
    });
  });
}

function deleteTimelineItem(id){
  if(!confirm('Diesen Programmpunkt wirklich löschen?')) return;
  state.timeline = state.timeline.filter(t => t.id !== id);
  state.notizen = state.notizen.filter(n => !(n.bezugTyp === 'timeline' && n.bezugId === id));
  queueSave();
  renderAll();
}

/* =========================================================
   KOMMENTARE (Modal)
   ========================================================= */

const COMMENT_AUTOREN = ['Brautpaar', 'Trauzeuge/-in', 'Fotograf'];

function openCommentsModal(bezugId, bezugTyp){
  renderCommentsModal(bezugId, bezugTyp);
}

function renderCommentsModal(bezugId, bezugTyp){
  const comments = state.notizen.filter(n => n.bezugTyp === bezugTyp && n.bezugId === bezugId);

  const html = `
    <h2>Kommentare</h2>
    <div class="comments-modal-list">
      ${comments.length === 0 ? `<p style="color:#a59c8f; font-size:0.9rem;">Noch keine Kommentare.</p>` : comments.map(c => `
        <div class="comment-item" data-id="${c.id}">
          <div class="comment-item-body">
            <strong>${escapeHtml(c.autor)}</strong>
            <p>${escapeHtml(c.text)}</p>
          </div>
          <button class="btn-icon" data-action="delete-comment" title="Löschen">✕</button>
        </div>
      `).join('')}
    </div>
    <form id="commentForm" class="comment-modal-form">
      <label for="commentAutor">Von</label>
      <select id="commentAutor">
        ${COMMENT_AUTOREN.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('')}
      </select>
      <label for="commentText">Nachricht</label>
      <textarea id="commentText" placeholder="Eure Nachricht …" required></textarea>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="cancelBtn">Schließen</button>
        <button type="submit" class="btn btn-primary" style="margin:0;">Senden</button>
      </div>
    </form>
  `;

  openModal(html, modal => {
    modal.querySelector('#cancelBtn').addEventListener('click', closeModal);

    modal.querySelectorAll('[data-action="delete-comment"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const commentId = btn.closest('.comment-item').dataset.id;
        if(!confirm('Diesen Kommentar wirklich löschen?')) return;
        state.notizen = state.notizen.filter(n => n.id !== commentId);
        queueSave();
        renderAll();
        renderCommentsModal(bezugId, bezugTyp);
      });
    });

    modal.querySelector('#commentForm').addEventListener('submit', e => {
      e.preventDefault();
      const text = modal.querySelector('#commentText').value.trim();
      if(!text) return;
      state.notizen.push({
        id: uid(),
        bezugId,
        bezugTyp,
        autor: modal.querySelector('#commentAutor').value,
        text,
        datum: new Date().toISOString()
      });
      queueSave();
      renderAll();
      renderCommentsModal(bezugId, bezugTyp);
    });
  });
}

/* =========================================================
   SHOTLIST (Wunschfotos)
   ========================================================= */

// Zeigt an, ob aktuell die Übersicht oder ein Location-Container geöffnet ist.
// Reiner UI-Zustand, wird nicht gespeichert.
let currentShotContainerId = null;

function getCurrentShotItems(){
  if(currentShotContainerId){
    const c = state.shotContainer.find(c => c.id === currentShotContainerId);
    if(c){
      if(!c.items) c.items = [];
      return c.items;
    }
  }
  return state.shotlist;
}

function shotCardHtml(item){
  return `
    <div class="shot-card ${item.erledigt ? 'done':''}" data-id="${item.id}">
      <div class="item-actions">
        <button class="btn-icon drag-handle" title="Ziehen zum Sortieren">⠿</button>
        <button class="btn-icon" data-action="edit-shot" title="Bearbeiten">✎</button>
        <button class="btn-icon" data-action="delete-shot" title="Löschen">✕</button>
      </div>
      <div class="shot-check">
        <input type="checkbox" ${item.erledigt ? 'checked':''} data-action="toggle-shot">
        <div>
          <h3>${escapeHtml(item.beschreibung)}</h3>
        </div>
      </div>
    </div>
  `;
}

function renderShotlist(){
  const container = document.getElementById('shotlistList');
  const containerGrid = document.getElementById('shotContainerGrid');
  const backBtn = document.getElementById('backToShotOverviewBtn');
  const addContainerBtn = document.getElementById('addShotContainerBtn');
  const heading = document.getElementById('shotContainerHeading');

  // Falls der aktuell geöffnete Container nicht mehr existiert, zurück zur Übersicht
  if(currentShotContainerId && !state.shotContainer.find(c => c.id === currentShotContainerId)){
    currentShotContainerId = null;
  }

  const inContainer = !!currentShotContainerId;
  backBtn.style.display = inContainer ? 'inline-block' : 'none';
  addContainerBtn.style.display = inContainer ? 'none' : 'inline-block';
  heading.style.display = inContainer ? 'block' : 'none';
  containerGrid.style.display = inContainer ? 'none' : '';

  if(inContainer){
    const c = state.shotContainer.find(c => c.id === currentShotContainerId);
    heading.textContent = `📍 ${c.name}`;
  }

  // Location-Container-Karten (nur in der Übersicht)
  if(!inContainer){
    if(state.shotContainer.length === 0){
      containerGrid.innerHTML = '';
    } else {
      containerGrid.innerHTML = state.shotContainer.map(c => `
        <div class="shot-container-card" data-container-id="${c.id}">
          <div class="item-actions">
            <button class="btn-icon" data-action="edit-container" title="Umbenennen">✎</button>
            <button class="btn-icon" data-action="delete-container" title="Location löschen">✕</button>
          </div>
          <h3>📍 ${escapeHtml(c.name)}</h3>
          <span class="shot-container-count">${(c.items||[]).length} ${(c.items||[]).length === 1 ? 'Eintrag' : 'Einträge'}</span>
        </div>
      `).join('');

      containerGrid.querySelectorAll('.shot-container-card').forEach(card => {
        card.addEventListener('click', e => {
          if(e.target.closest('[data-action]')) return;
          currentShotContainerId = card.dataset.containerId;
          renderShotlist();
        });
      });
      containerGrid.querySelectorAll('[data-action="edit-container"]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          editShotContainer(e.target.closest('.shot-container-card').dataset.containerId);
        });
      });
      containerGrid.querySelectorAll('[data-action="delete-container"]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          deleteShotContainer(e.target.closest('.shot-container-card').dataset.containerId);
        });
      });
    }
  }

  // Foto-Wunsch-Karten der aktuellen Ansicht
  const items = getCurrentShotItems();

  if(items.length === 0){
    if(inContainer){
      container.innerHTML = `<p style="color:#a59c8f;">Noch keine Foto-Wünsche in dieser Location.</p>`;
    } else if(state.shotContainer.length === 0){
      container.innerHTML = `<p style="color:#a59c8f;">Noch keine Foto-Wünsche eingetragen.</p>`;
    } else {
      container.innerHTML = '';
    }
  } else {
    container.innerHTML = items.map(item => shotCardHtml(item)).join('');
  }

  container.querySelectorAll('[data-action="toggle-shot"]').forEach(cb => {
    cb.addEventListener('change', e => {
      const id = e.target.closest('.shot-card').dataset.id;
      const item = items.find(s => s.id === id);
      item.erledigt = e.target.checked;
      queueSave();
      renderShotlist();
      renderOverview();
    });
  });
  container.querySelectorAll('[data-action="edit-shot"]').forEach(btn => {
    btn.addEventListener('click', e => editShotItem(e.target.closest('.shot-card').dataset.id, items));
  });
  container.querySelectorAll('[data-action="delete-shot"]').forEach(btn => {
    btn.addEventListener('click', e => deleteShotItem(e.target.closest('.shot-card').dataset.id, items));
  });

  // Drag & Drop: innerhalb der Liste sortieren, in der Übersicht zusätzlich
  // auf Location-Container ziehbar
  const dragOptions = (!inContainer && state.shotContainer.length > 0) ? {
    dropTargetSelector: '.shot-container-card',
    onDropToTarget: (itemId, targetEl) => {
      moveShotToContainer(itemId, targetEl.dataset.containerId);
    }
  } : {};

  enableDragSort(container, '.shot-card', items, dragOptions);
}

function shotFormHtml(item){
  item = item || { beschreibung:'' };
  return `
    <h2>${item.id ? 'Foto-Wunsch bearbeiten' : 'Neuer Foto-Wunsch'}</h2>
    <form id="shotForm">
      <label for="shotBeschreibung">Beschreibung</label>
      <textarea id="shotBeschreibung" placeholder="z.B. Foto mit den Großeltern, Sonnenuntergang am See …" required>${escapeHtml(item.beschreibung)}</textarea>

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="cancelBtn">Abbrechen</button>
        <button type="submit" class="btn btn-primary" style="margin:0;">Speichern</button>
      </div>
    </form>
  `;
}

function addShotItem(){
  openModal(shotFormHtml(null), modal => {
    modal.querySelector('#cancelBtn').addEventListener('click', closeModal);
    modal.querySelector('#shotForm').addEventListener('submit', e => {
      e.preventDefault();
      getCurrentShotItems().push({
        id: uid(),
        beschreibung: modal.querySelector('#shotBeschreibung').value.trim(),
        erledigt: false
      });
      queueSave();
      renderShotlist();
      renderOverview();
      closeModal();
    });
  });
}

function editShotItem(id, items){
  items = items || getCurrentShotItems();
  const item = items.find(s => s.id === id);
  if(!item) return;
  openModal(shotFormHtml(item), modal => {
    modal.querySelector('#cancelBtn').addEventListener('click', closeModal);
    modal.querySelector('#shotForm').addEventListener('submit', e => {
      e.preventDefault();
      item.beschreibung = modal.querySelector('#shotBeschreibung').value.trim();
      queueSave();
      renderShotlist();
      closeModal();
    });
  });
}

function deleteShotItem(id, items){
  items = items || getCurrentShotItems();
  if(!confirm('Diesen Foto-Wunsch wirklich löschen?')) return;
  const idx = items.findIndex(s => s.id === id);
  if(idx !== -1) items.splice(idx, 1);
  queueSave();
  renderShotlist();
  renderOverview();
}

function moveShotToContainer(itemId, containerId){
  const idx = state.shotlist.findIndex(s => s.id === itemId);
  if(idx === -1) return;
  const c = state.shotContainer.find(c => c.id === containerId);
  if(!c) return;
  const [item] = state.shotlist.splice(idx, 1);
  if(!c.items) c.items = [];
  c.items.push(item);
  queueSave();
  renderShotlist();
  renderOverview();
}

/* ---- Location-Container (Wunschfotos-Gruppen) ---- */

function shotContainerFormHtml(c){
  c = c || { name:'' };
  return `
    <h2>${c.id ? 'Location umbenennen' : 'Neue Location'}</h2>
    <form id="shotContainerForm">
      <label for="shotContainerName">Name</label>
      <input type="text" id="shotContainerName" value="${escapeHtml(c.name)}" placeholder="z.B. Schlosspark, Strand …" required>

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="cancelBtn">Abbrechen</button>
        <button type="submit" class="btn btn-primary" style="margin:0;">Speichern</button>
      </div>
    </form>
  `;
}

function addShotContainer(){
  openModal(shotContainerFormHtml(null), modal => {
    modal.querySelector('#cancelBtn').addEventListener('click', closeModal);
    modal.querySelector('#shotContainerForm').addEventListener('submit', e => {
      e.preventDefault();
      state.shotContainer.push({
        id: uid(),
        name: modal.querySelector('#shotContainerName').value.trim(),
        items: []
      });
      queueSave();
      renderShotlist();
      closeModal();
    });
  });
}

function editShotContainer(id){
  const c = state.shotContainer.find(c => c.id === id);
  if(!c) return;
  openModal(shotContainerFormHtml(c), modal => {
    modal.querySelector('#cancelBtn').addEventListener('click', closeModal);
    modal.querySelector('#shotContainerForm').addEventListener('submit', e => {
      e.preventDefault();
      c.name = modal.querySelector('#shotContainerName').value.trim();
      queueSave();
      renderShotlist();
      closeModal();
    });
  });
}

function deleteShotContainer(id){
  const c = state.shotContainer.find(c => c.id === id);
  if(!c) return;
  const count = (c.items || []).length;
  const msg = count > 0
    ? `Location "${c.name}" wirklich löschen? Die ${count} enthaltenen Foto-Wünsche werden zurück in die allgemeine Liste verschoben.`
    : `Location "${c.name}" wirklich löschen?`;
  if(!confirm(msg)) return;

  state.shotlist.push(...(c.items || []));
  state.shotContainer = state.shotContainer.filter(g => g.id !== id);
  if(currentShotContainerId === id) currentShotContainerId = null;
  queueSave();
  renderShotlist();
}

/* =========================================================
   LOCATIONS
   ========================================================= */

function renderLocations(){
  const container = document.getElementById('locationsList');

  if(state.locations.length === 0){
    container.innerHTML = `<p style="color:#a59c8f;">Noch keine Locations eingetragen.</p>`;
    return;
  }

  container.innerHTML = state.locations.map(loc => {
    const query = encodeURIComponent(loc.adresse || loc.name);
    const mapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
    const mapsNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
    const embedUrl = `https://maps.google.com/maps?q=${query}&z=15&output=embed`;

    return `
    <div class="location-card" data-id="${loc.id}">
      ${loc.adresse ? `<iframe class="location-map-frame" src="${embedUrl}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Karte: ${escapeHtml(loc.name)}"></iframe>` : ''}
      <div class="location-body">
        <div class="item-actions">
          <button class="btn-icon" data-action="edit-location" title="Bearbeiten">✎</button>
          <button class="btn-icon" data-action="delete-location" title="Löschen">✕</button>
        </div>
        <h3>${escapeHtml(loc.name)}</h3>
        ${loc.adresse ? `<div class="addr">${escapeHtml(loc.adresse)}</div>` : ''}
        ${loc.notizen ? `<p>${escapeHtml(loc.notizen)}</p>` : ''}
        ${loc.adresse ? `
        <div class="location-actions">
          <a class="btn-maps" href="${mapsNavUrl}" target="_blank" rel="noopener">📍 Navigation starten</a>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('[data-action="edit-location"]').forEach(btn => {
    btn.addEventListener('click', e => editLocation(e.target.closest('.location-card').dataset.id));
  });
  container.querySelectorAll('[data-action="delete-location"]').forEach(btn => {
    btn.addEventListener('click', e => deleteLocation(e.target.closest('.location-card').dataset.id));
  });
}

function locationFormHtml(loc){
  loc = loc || { name:'', adresse:'', notizen:'' };
  return `
    <h2>${loc.id ? 'Location bearbeiten' : 'Neue Location'}</h2>
    <form id="locationForm">
      <label for="locName">Name</label>
      <input type="text" id="locName" value="${escapeHtml(loc.name)}" placeholder="z.B. Schloss Bremen" required>

      <label for="locAdresse">Adresse</label>
      <input type="text" id="locAdresse" value="${escapeHtml(loc.adresse)}" placeholder="Straße, PLZ Ort">

      <label for="locNotizen">Notizen</label>
      <textarea id="locNotizen" placeholder="Parken, Ansprechpartner …">${escapeHtml(loc.notizen)}</textarea>

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="cancelBtn">Abbrechen</button>
        <button type="submit" class="btn btn-primary" style="margin:0;">Speichern</button>
      </div>
    </form>
  `;
}

function addLocation(){
  openModal(locationFormHtml(null), modal => {
    modal.querySelector('#cancelBtn').addEventListener('click', closeModal);
    modal.querySelector('#locationForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = modal.querySelector('#locName').value.trim();
      const adresse = modal.querySelector('#locAdresse').value.trim();
      const notizen = modal.querySelector('#locNotizen').value.trim();
      state.locations.push({ id: uid(), name, adresse, notizen });
      queueSave();
      renderLocations();
      renderOverview();
      closeModal();
    });
  });
}

function editLocation(id){
  const loc = state.locations.find(l => l.id === id);
  if(!loc) return;
  openModal(locationFormHtml(loc), modal => {
    modal.querySelector('#cancelBtn').addEventListener('click', closeModal);
    modal.querySelector('#locationForm').addEventListener('submit', e => {
      e.preventDefault();
      loc.name = modal.querySelector('#locName').value.trim();
      loc.adresse = modal.querySelector('#locAdresse').value.trim();
      loc.notizen = modal.querySelector('#locNotizen').value.trim();
      queueSave();
      renderLocations();
      closeModal();
    });
  });
}

function deleteLocation(id){
  if(!confirm('Diese Location wirklich löschen?')) return;
  state.locations = state.locations.filter(l => l.id !== id);
  queueSave();
  renderLocations();
  renderOverview();
}

/* =========================================================
   KONTAKTE
   ========================================================= */

function renderContacts(){
  const container = document.getElementById('contactsList');

  const fixedHtml = FIXED_CONTACTS.map(c => `
    <div class="contact-card contact-fixed" data-id="${c.id}">
      <span class="contact-role">${escapeHtml(c.rolle)}</span>
      <h3>${escapeHtml(c.name)}</h3>
      ${c.telefon ? `<div class="detail">📞 <a href="tel:${escapeHtml(telLink(c.telefon))}">${escapeHtml(c.telefon)}</a></div>` : ''}
      ${c.email ? `<div class="detail">✉ ${escapeHtml(c.email)}</div>` : ''}
    </div>
  `).join('') + `
    <div class="contact-card contact-fixed" data-id="fixed-website">
      <span class="contact-role">Grunwald Photography</span>
      <h3>Webseite</h3>
      <div class="detail">🌐 <a href="${escapeHtml(FIXED_WEBSITE.url)}" target="_blank" rel="noopener">${escapeHtml(FIXED_WEBSITE.label)}</a></div>
    </div>
  `;

  if(state.kontakte.length === 0){
    container.innerHTML = fixedHtml + `<p style="color:#a59c8f; grid-column:1/-1;">Noch keine weiteren Kontakte eingetragen.</p>`;
    return;
  }

  const dynamicHtml = state.kontakte.map(c => {
    const farbe = state.meta.kategorieFarben[c.kategorie] || '#ffffff';
    return `
    <div class="contact-card" data-id="${c.id}" style="background:${escapeHtml(farbe)};">
      <div class="item-actions">
        <button class="btn-icon" data-action="edit-contact" title="Bearbeiten">✎</button>
        <button class="btn-icon" data-action="delete-contact" title="Löschen">✕</button>
      </div>
      <span class="contact-role">${escapeHtml(c.rolle || 'Kontakt')}</span>
      <h3>${escapeHtml(c.name)}</h3>
      ${c.telefon ? `<div class="detail">📞 <a href="tel:${escapeHtml(telLink(c.telefon))}">${escapeHtml(c.telefon)}</a></div>` : ''}
      ${c.email ? `<div class="detail">✉ ${escapeHtml(c.email)}</div>` : ''}
      ${c.kategorie ? `<span class="kategorie-badge">${escapeHtml(KONTAKT_KATEGORIEN[c.kategorie] || '')}</span>` : ''}
    </div>
  `;
  }).join('');

  container.innerHTML = fixedHtml + dynamicHtml;

  container.querySelectorAll('[data-action="edit-contact"]').forEach(btn => {
    btn.addEventListener('click', e => editContact(e.target.closest('.contact-card').dataset.id));
  });
  container.querySelectorAll('[data-action="delete-contact"]').forEach(btn => {
    btn.addEventListener('click', e => deleteContact(e.target.closest('.contact-card').dataset.id));
  });
}

function contactFormHtml(c){
  c = c || { name:'', rolle:'', telefon:'', email:'', kategorie:'beide' };
  return `
    <h2>${c.id ? 'Kontakt bearbeiten' : 'Neuer Kontakt'}</h2>
    <form id="contactForm">
      <label for="cName">Name</label>
      <input type="text" id="cName" value="${escapeHtml(c.name)}" required>

      <label for="cRolle">Rolle</label>
      <input type="text" id="cRolle" value="${escapeHtml(c.rolle)}" placeholder="z.B. Trauzeugin, Catering, DJ">

      <label for="cKategorie">Zugehörigkeit</label>
      <select id="cKategorie">
        ${Object.entries(KONTAKT_KATEGORIEN).map(([key, label]) => `<option value="${key}" ${c.kategorie===key?'selected':''}>${label}</option>`).join('')}
      </select>

      <label for="cTelefon">Telefon</label>
      <input type="tel" id="cTelefon" value="${escapeHtml(c.telefon)}">

      <label for="cEmail">E-Mail</label>
      <input type="email" id="cEmail" value="${escapeHtml(c.email)}">

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="cancelBtn">Abbrechen</button>
        <button type="submit" class="btn btn-primary" style="margin:0;">Speichern</button>
      </div>
    </form>
  `;
}

function addContact(){
  openModal(contactFormHtml(null), modal => {
    modal.querySelector('#cancelBtn').addEventListener('click', closeModal);
    modal.querySelector('#contactForm').addEventListener('submit', e => {
      e.preventDefault();
      state.kontakte.push({
        id: uid(),
        name: modal.querySelector('#cName').value.trim(),
        rolle: modal.querySelector('#cRolle').value.trim(),
        telefon: modal.querySelector('#cTelefon').value.trim(),
        email: modal.querySelector('#cEmail').value.trim(),
        kategorie: modal.querySelector('#cKategorie').value
      });
      queueSave();
      renderContacts();
      closeModal();
    });
  });
}

function editContact(id){
  const c = state.kontakte.find(k => k.id === id);
  if(!c) return;
  openModal(contactFormHtml(c), modal => {
    modal.querySelector('#cancelBtn').addEventListener('click', closeModal);
    modal.querySelector('#contactForm').addEventListener('submit', e => {
      e.preventDefault();
      c.name = modal.querySelector('#cName').value.trim();
      c.rolle = modal.querySelector('#cRolle').value.trim();
      c.telefon = modal.querySelector('#cTelefon').value.trim();
      c.email = modal.querySelector('#cEmail').value.trim();
      c.kategorie = modal.querySelector('#cKategorie').value;
      queueSave();
      renderContacts();
      closeModal();
    });
  });
}

function deleteContact(id){
  if(!confirm('Diesen Kontakt wirklich löschen?')) return;
  state.kontakte = state.kontakte.filter(k => k.id !== id);
  queueSave();
  renderContacts();
}

/* =========================================================
   MOODBOARD
   ========================================================= */

function renderMoodboard(){
  const container = document.getElementById('moodboardList');

  if(state.moodboard.length === 0){
    container.innerHTML = `<p style="color:#a59c8f; grid-column:1/-1;">Noch keine Bilder hochgeladen.</p>`;
    return;
  }

  container.innerHTML = state.moodboard.map(item => `
    <div class="mood-item" data-id="${item.id}">
      <div class="item-actions" style="position:absolute; top:8px; right:8px;">
        <button class="btn-icon" data-action="delete-mood" title="Löschen">✕</button>
      </div>
      <img src="${item.bildUrl}" alt="${escapeHtml(item.beschreibung || 'Inspirationsbild')}" loading="lazy">
      ${item.beschreibung ? `<div class="mood-caption">${escapeHtml(item.beschreibung)}</div>` : ''}
    </div>
  `).join('');

  container.querySelectorAll('[data-action="delete-mood"]').forEach(btn => {
    btn.addEventListener('click', e => deleteMoodItem(e.target.closest('.mood-item').dataset.id));
  });
}

function deleteMoodItem(id){
  if(!confirm('Dieses Bild wirklich entfernen?')) return;
  state.moodboard = state.moodboard.filter(m => m.id !== id);
  queueSave();
  renderMoodboard();
}

async function handleMoodboardFiles(files){
  for(const file of files){
    if(!file.type.startsWith('image/')) continue;
    try{
      const dataUrl = await fileToDataUrl(file);
      const uploadedUrl = await uploadImage(dataUrl, file.name);
      state.moodboard.push({
        id: uid(),
        bildUrl: uploadedUrl || dataUrl,
        beschreibung: ''
      });
    }catch(e){
      console.error('Upload fehlgeschlagen', e);
    }
  }
  queueSave();
  renderMoodboard();
}

function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadImage(dataUrl, filename){
  try{
    const res = await fetch('/.netlify/functions/upload', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ filename, dataUrl })
    });
    if(!res.ok) throw new Error('Upload fehlgeschlagen');
    const data = await res.json();
    return data.url;
  }catch(e){
    console.warn('Bild-Upload-Funktion nicht verfügbar, speichere lokal eingebettet.', e);
    return null;
  }
}

function initMoodboardUpload(){
  const zone = document.getElementById('uploadZone');
  const input = document.getElementById('moodboardInput');

  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    if(input.files.length) handleMoodboardFiles(input.files);
    input.value = '';
  });

  ['dragover','dragenter'].forEach(evt => {
    zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.add('dragover'); });
  });
  ['dragleave','drop'].forEach(evt => {
    zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.remove('dragover'); });
  });
  zone.addEventListener('drop', e => {
    if(e.dataTransfer.files.length) handleMoodboardFiles(e.dataTransfer.files);
  });
}

/* =========================================================
   VERTRAG
   ========================================================= */

function renderContract(){
  const view = document.getElementById('contractView');
  const url = state.vertrag && state.vertrag.downloadUrl;

  const unlocked = sessionStorage.getItem('vertrag-unlocked') === 'true';

  if(!unlocked){
    view.innerHTML = `
      <p>Dieser Bereich ist passwortgeschützt.</p>
      <form id="vertragLoginForm" style="display:flex; gap:8px; margin-top:10px; max-width:320px;">
        <input type="password" id="vertragPwInput" placeholder="Passwort" autocomplete="off" required style="flex:1;">
        <button type="submit" class="btn btn-primary" style="margin:0;">Anzeigen</button>
      </form>
      <p id="vertragPwError" style="color:#c15656; font-size:0.85rem; display:none; margin-top:8px;">Falsches Passwort.</p>
    `;

    document.getElementById('vertragLoginForm').addEventListener('submit', e => {
      e.preventDefault();
      const pw = document.getElementById('vertragPwInput').value;
      const correct = (state.vertrag && state.vertrag.passwort) || 'gpvertrag';
      if(pw === correct){
        sessionStorage.setItem('vertrag-unlocked', 'true');
        renderContract();
      } else {
        document.getElementById('vertragPwError').style.display = 'block';
      }
    });
    return;
  }

  if(url){
    if(url.startsWith('data:')){
      view.innerHTML = `<p>Euer Vertrag steht zum Download bereit:</p><button class="btn btn-primary" id="openContractBtn" style="margin:0;">Vertrag öffnen / herunterladen ↗</button>`;
      document.getElementById('openContractBtn').addEventListener('click', () => {
        openDataUrlAsBlob(url, 'vertrag.pdf');
      });
    } else {
      view.innerHTML = `<p>Euer Vertrag steht zum Download bereit:</p><a href="${escapeHtml(url)}" target="_blank" rel="noopener">Vertrag öffnen / herunterladen ↗</a>`;
    }
  } else {
    view.innerHTML = `<p>Noch kein Vertrag hinterlegt.</p>`;
  }
}

/* =========================================================
   ADMIN
   ========================================================= */

const ADMIN_PASSWORD = '4010';

function openAdmin(){
  openModal(adminLoginHtml(), modal => {
    modal.querySelector('#cancelBtn').addEventListener('click', closeModal);
    modal.querySelector('#adminLoginForm').addEventListener('submit', e => {
      e.preventDefault();
      const pw = modal.querySelector('#adminPw').value;
      const errorEl = modal.querySelector('#adminError');
      if(pw === ADMIN_PASSWORD){
        openAdminPanel();
      } else {
        errorEl.textContent = 'Falsches Passwort.';
        errorEl.style.display = 'block';
      }
    });
  });
}

function adminLoginHtml(){
  return `
    <h2>Admin-Bereich</h2>
    <form id="adminLoginForm">
      <label for="adminPw">Passwort</label>
      <input type="password" id="adminPw" autocomplete="off" required>
      <p id="adminError" style="color:#c15656; font-size:0.85rem; display:none; margin-top:8px;">Falsches Passwort.</p>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="cancelBtn">Abbrechen</button>
        <button type="submit" class="btn btn-primary" style="margin:0;">Anmelden</button>
      </div>
    </form>
  `;
}

function adminPanelHtml(){
  return `
    <h2>Admin-Bereich</h2>
    <form id="adminMetaForm">
      <label for="adminNamen">Namen des Brautpaars</label>
      <input type="text" id="adminNamen" value="${escapeHtml(state.meta.namen)}" required>

      <label for="adminDatum">Datum der Hochzeit</label>
      <input type="date" id="adminDatum" value="${escapeHtml(state.meta.datum)}" required>

      <label for="adminWhatsapp">WhatsApp-Gruppen-Link</label>
      <input type="url" id="adminWhatsapp" value="${escapeHtml(state.meta.whatsappLink || '')}" placeholder="https://chat.whatsapp.com/...">

      <label for="adminTitelbild">Titelbild (Übersicht)</label>
      <div id="adminTitelbildPreview" style="margin-bottom:8px;">
        ${state.meta.titelbildUrl ? `<img src="${escapeHtml(state.meta.titelbildUrl)}" alt="" style="width:100%; border-radius:8px; display:block;">` : `<p style="color:#a59c8f; font-size:0.85rem; margin:0;">Kein Titelbild hinterlegt.</p>`}
      </div>
      <input type="file" id="adminTitelbildInput" accept="image/*">
      ${state.meta.titelbildUrl ? `<button type="button" class="btn btn-ghost" id="removeTitelbildBtn" style="margin-top:8px;">Titelbild entfernen</button>` : ''}

      <label>Farben für Kontakt-Kategorien</label>
      <div class="kategorie-farben-grid">
        ${Object.entries(KONTAKT_KATEGORIEN).map(([key, label]) => `
          <div class="kategorie-farbe-row">
            <input type="color" id="farbe-${key}" value="${escapeHtml(state.meta.kategorieFarben[key] || '#ffffff')}">
            <span>${label}</span>
          </div>
        `).join('')}
      </div>

      <label>Farbschema der Webseite</label>
      <div class="kategorie-farben-grid">
        ${Object.entries(THEME_FARBEN_LABELS).map(([key, label]) => `
          <div class="kategorie-farbe-row">
            <input type="color" id="theme-${key}" value="${escapeHtml((state.meta.themeFarben && state.meta.themeFarben[key]) || DEFAULT_THEME_FARBEN[key])}">
            <span>${label}</span>
          </div>
        `).join('')}
      </div>
      <button type="button" class="btn btn-ghost" id="resetThemeBtn" style="margin-top:8px;">Standardfarben wiederherstellen</button>

      <label for="adminVertragPw">Passwort für Vertrags-Bereich</label>
      <input type="text" id="adminVertragPw" value="${escapeHtml((state.vertrag && state.vertrag.passwort) || 'gpvertrag')}" required>

      <label for="adminVertragFile">Vertrag (PDF) hochladen</label>
      <div id="adminVertragPreview" style="margin-bottom:8px;">
        ${state.vertrag && state.vertrag.downloadUrl ? `<a href="${escapeHtml(state.vertrag.downloadUrl)}" target="_blank" rel="noopener">Aktuellen Vertrag ansehen ↗</a>` : `<p style="color:#a59c8f; font-size:0.85rem; margin:0;">Kein Vertrag hinterlegt.</p>`}
      </div>
      <input type="file" id="adminVertragFile" accept="application/pdf">
      <label for="adminVertragUrl" style="margin-top:10px;">…oder direkter Link zum Vertrag</label>
      <input type="url" id="adminVertragUrl" value="${escapeHtml((state.vertrag && state.vertrag.downloadUrl) || '')}" placeholder="https://...">
      ${state.vertrag && state.vertrag.downloadUrl ? `<button type="button" class="btn btn-ghost" id="removeVertragBtn" style="margin-top:8px;">Vertrag entfernen</button>` : ''}

      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="closeAdminBtn">Schließen</button>
        <button type="submit" class="btn btn-primary" style="margin:0;">Speichern</button>
      </div>
    </form>

    <div class="danger-zone">
      <p><strong>Projekt zurücksetzen</strong><br>Löscht alle Daten (Ablaufplan, Wunschfotos, Location-Gruppen, Locations, Kontakte, Moodboard, Kommentare, Vertrag) und bereitet die App für die nächste Hochzeit vor. Dieser Schritt kann nicht rückgängig gemacht werden.</p>
      <button class="btn btn-danger" id="resetProjectBtn" type="button">Projekt komplett leeren</button>
    </div>
  `;
}

function openAdminPanel(){
  openModal(adminPanelHtml(), modal => {
    modal.querySelector('#closeAdminBtn').addEventListener('click', closeModal);

    let pendingTitelbildUrl = state.meta.titelbildUrl || '';

    const titelbildInput = modal.querySelector('#adminTitelbildInput');
    titelbildInput.addEventListener('change', async () => {
      const file = titelbildInput.files[0];
      if(!file) return;
      const preview = modal.querySelector('#adminTitelbildPreview');
      preview.innerHTML = `<p style="color:#a59c8f; font-size:0.85rem; margin:0;">Lädt hoch …</p>`;
      try{
        const dataUrl = await fileToDataUrl(file);
        const uploadedUrl = await uploadImage(dataUrl, file.name);
        pendingTitelbildUrl = uploadedUrl || dataUrl;
        preview.innerHTML = `<img src="${pendingTitelbildUrl}" alt="" style="width:100%; border-radius:8px; display:block;">`;
      }catch(e){
        preview.innerHTML = `<p style="color:#c15656; font-size:0.85rem; margin:0;">Upload fehlgeschlagen.</p>`;
      }
    });

    const removeBtn = modal.querySelector('#removeTitelbildBtn');
    if(removeBtn){
      removeBtn.addEventListener('click', () => {
        pendingTitelbildUrl = '';
        modal.querySelector('#adminTitelbildPreview').innerHTML = `<p style="color:#a59c8f; font-size:0.85rem; margin:0;">Kein Titelbild hinterlegt.</p>`;
        removeBtn.style.display = 'none';
      });
    }

    let pendingVertragUrl = (state.vertrag && state.vertrag.downloadUrl) || '';

    const vertragFileInput = modal.querySelector('#adminVertragFile');
    vertragFileInput.addEventListener('change', async () => {
      const file = vertragFileInput.files[0];
      if(!file) return;
      const preview = modal.querySelector('#adminVertragPreview');
      preview.innerHTML = `<p style="color:#a59c8f; font-size:0.85rem; margin:0;">Lädt hoch …</p>`;
      try{
        const dataUrl = await fileToDataUrl(file);
        const uploadedUrl = await uploadImage(dataUrl, file.name);
        pendingVertragUrl = uploadedUrl || dataUrl;
        modal.querySelector('#adminVertragUrl').value = pendingVertragUrl;
        preview.innerHTML = `<a href="${pendingVertragUrl}" target="_blank" rel="noopener">Hochgeladenen Vertrag ansehen ↗</a>`;
      }catch(e){
        preview.innerHTML = `<p style="color:#c15656; font-size:0.85rem; margin:0;">Upload fehlgeschlagen.</p>`;
      }
    });

    const vertragUrlInput = modal.querySelector('#adminVertragUrl');
    vertragUrlInput.addEventListener('input', () => {
      pendingVertragUrl = vertragUrlInput.value.trim();
    });

    const removeVertragBtn = modal.querySelector('#removeVertragBtn');
    if(removeVertragBtn){
      removeVertragBtn.addEventListener('click', () => {
        pendingVertragUrl = '';
        vertragUrlInput.value = '';
        modal.querySelector('#adminVertragPreview').innerHTML = `<p style="color:#a59c8f; font-size:0.85rem; margin:0;">Kein Vertrag hinterlegt.</p>`;
        removeVertragBtn.style.display = 'none';
      });
    }

    // Live-Vorschau der Theme-Farben
    Object.keys(THEME_FARBEN_LABELS).forEach(key => {
      modal.querySelector(`#theme-${key}`).addEventListener('input', e => {
        document.documentElement.style.setProperty(`--${key}`, e.target.value);
      });
    });

    modal.querySelector('#resetThemeBtn').addEventListener('click', () => {
      Object.entries(DEFAULT_THEME_FARBEN).forEach(([key, value]) => {
        modal.querySelector(`#theme-${key}`).value = value;
        document.documentElement.style.setProperty(`--${key}`, value);
      });
    });

    modal.querySelector('#adminMetaForm').addEventListener('submit', e => {
      e.preventDefault();
      state.meta.namen = modal.querySelector('#adminNamen').value.trim();
      state.meta.datum = modal.querySelector('#adminDatum').value;
      state.meta.whatsappLink = modal.querySelector('#adminWhatsapp').value.trim();
      state.meta.titelbildUrl = pendingTitelbildUrl;
      Object.keys(KONTAKT_KATEGORIEN).forEach(key => {
        state.meta.kategorieFarben[key] = modal.querySelector(`#farbe-${key}`).value;
      });
      Object.keys(THEME_FARBEN_LABELS).forEach(key => {
        state.meta.themeFarben[key] = modal.querySelector(`#theme-${key}`).value;
      });
      applyTheme();
      if(!state.vertrag) state.vertrag = { downloadUrl:'', passwort:'gpvertrag' };
      const newPw = modal.querySelector('#adminVertragPw').value.trim() || 'gpvertrag';
      if(newPw !== state.vertrag.passwort){
        sessionStorage.removeItem('vertrag-unlocked');
      }
      state.vertrag.passwort = newPw;
      state.vertrag.downloadUrl = pendingVertragUrl;
      queueSave();
      renderMeta();
      renderContacts();
      renderContract();
      closeModal();
    });

    modal.querySelector('#resetProjectBtn').addEventListener('click', () => {
      if(!confirm('Wirklich ALLE Daten löschen? Dies kann nicht rückgängig gemacht werden.')) return;
      if(!confirm('Letzte Bestätigung: Soll das Projekt jetzt vollständig geleert werden?')) return;
      resetProject();
      closeModal();
    });
  }, () => applyTheme());
}

function resetProject(){
  const kategorieFarben = state.meta.kategorieFarben;
  const themeFarben = state.meta.themeFarben;
  const vertragPasswort = (state.vertrag && state.vertrag.passwort) || 'gpvertrag';
  sessionStorage.removeItem('vertrag-unlocked');
  currentShotContainerId = null;
  state = {
    meta: { namen: 'Neues Brautpaar', datum: '', whatsappLink: '', titelbildUrl: '', kategorieFarben, themeFarben },
    timeline: [],
    shotlist: [],
    shotContainer: [],
    locations: [],
    kontakte: [],
    moodboard: [],
    notizen: [],
    vertrag: { downloadUrl: '', passwort: vertragPasswort }
  };
  queueSave();
  renderAll();
  switchView('uebersicht');
}

/* =========================================================
   INIT
   ========================================================= */

document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initMoodboardUpload();

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('Service Worker konnte nicht registriert werden', err);
    });
  }

  document.getElementById('addTimelineBtn').addEventListener('click', addTimelineItem);
  document.getElementById('addShotBtn').addEventListener('click', addShotItem);
  document.getElementById('addShotContainerBtn').addEventListener('click', addShotContainer);
  document.getElementById('backToShotOverviewBtn').addEventListener('click', () => {
    currentShotContainerId = null;
    renderShotlist();
  });
  document.getElementById('addLocationBtn').addEventListener('click', addLocation);
  document.getElementById('addContactBtn').addEventListener('click', addContact);
  document.getElementById('adminBtn').addEventListener('click', openAdmin);

  loadState();
  startAutoRefresh();
});
