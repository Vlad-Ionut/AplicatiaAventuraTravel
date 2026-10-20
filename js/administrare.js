let charts = {};

document.querySelectorAll('.file-admin button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.file-admin button').forEach((b) => b.classList.remove('activ'));
    document.querySelectorAll('.fila-admin').forEach((t) => t.classList.remove('activ'));
    btn.classList.add('activ');
    document.getElementById('fila-' + btn.dataset.tab).classList.add('activ');
    if (btn.dataset.tab === 'panou') loadDashboard();
    if (btn.dataset.tab === 'pachete') loadPachete();
    if (btn.dataset.tab === 'rezervari') loadRezervari();
    if (btn.dataset.tab === 'utilizatori') loadUseri();
    if (btn.dataset.tab === 'recenzii') loadRecenzii();
    if (btn.dataset.tab === 'rapoarte') loadRaport();
    if (btn.dataset.tab === 'joc') loadGamification();
  });
});

async function loadDashboard() {
  const s = await fetch('/api/admin/stats').then((r) => r.json());
  document.getElementById('carduri-statistici').innerHTML = `
    <div class="card-statistica"><div>Clienți</div><div class="valoare">${s.clienti}</div></div>
    <div class="card-statistica"><div>Pachete active</div><div class="valoare">${s.pachete}</div></div>
    <div class="card-statistica"><div>Rezervări</div><div class="valoare">${s.rezervari}</div></div>
    <div class="card-statistica"><div>Venituri (RON)</div><div class="valoare">${Math.round(s.venituri)}</div></div>
  `;

  const mk = (id, type, labels, data, label) => {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {
      type,
      data: {
        labels,
        datasets: [
          {
            label,
            data,
            backgroundColor: ['#05386b', '#379683', '#5cdb95', '#8ee4af', '#edf5e1', '#e07a3d', '#f2c14e', '#6c8cbf'],
            borderColor: '#05386b',
            tension: 0.3,
          },
        ],
      },
      options: { responsive: true, plugins: { legend: { display: type === 'doughnut' } } },
    });
  };

  mk(
    'chart-rezervari',
    'bar',
    s.rezervariPeLuna.map((x) => x.luna),
    s.rezervariPeLuna.map((x) => x.nr),
    'Rezervări'
  );
  mk(
    'chart-venituri',
    'line',
    s.venituriPeLuna.map((x) => x.luna),
    s.venituriPeLuna.map((x) => x.total),
    'Venituri'
  );
  mk(
    'chart-dest',
    'doughnut',
    s.destinatiiPopulare.map((x) => x.destinatie),
    s.destinatiiPopulare.map((x) => x.nr),
    'Populare'
  );
}

async function loadPachete() {
  const list = await fetch('/api/pachete').then((r) => r.json());
  document.getElementById('lista-pachete-admin').innerHTML = `
    <table class="tabel-admin">
      <thead><tr><th>ID</th><th>Destinație</th><th>Tip</th><th>Preț</th><th>Red%</th><th>Locuri</th><th>Activ</th><th>Acțiuni</th></tr></thead>
      <tbody>
        ${list
          .map(
            (p) => `<tr>
          <td>${p.id}</td><td>${esc(p.destinatie)}</td><td>${esc(p.tip_turism || '')}</td><td>${p.pret}</td><td>${p.reducere_procent}</td>
          <td>${p.locuri_disponibile}</td><td>${p.activ ? 'da' : 'nu'}</td>
          <td>
            <button type="button" class="btn btn-contur btn-sm" onclick="openEdit(${p.id})">Editează</button>
            <button type="button" class="btn btn-contur btn-sm" onclick="openPerioade(${p.id})">Perioade</button>
            <button type="button" class="btn btn-contur btn-sm" onclick="openUpload(${p.id})">Imagini</button>
            <button type="button" class="btn btn-contur btn-sm" onclick="stergePachet(${p.id})">Dezactivează</button>
          </td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

window.openUpload = async (id) => {
  document.getElementById('zona-incarcare').hidden = false;
  document.getElementById('id-incarcare').textContent = id;
  await loadImaginiPachet(id);
};

async function loadImaginiPachet(id) {
  const el = document.getElementById('lista-imagini-admin');
  if (!el) return;
  const list = await fetch('/api/pachete/' + id + '/imagini').then((r) => r.json());
  el.innerHTML = list.length
    ? `<table class="tabel-admin">
        <thead><tr><th>Preview</th><th>Alt text</th><th>Ordine</th><th></th></tr></thead>
        <tbody>${list
          .map(
            (img) => `<tr>
              <td><img src="${esc(img.cale)}" alt="${esc(img.alt_text || '')}" style="max-width:90px;border-radius:8px"></td>
              <td>${esc(img.alt_text || '')}</td>
              <td>${img.ordine}</td>
              <td><button type="button" class="btn btn-contur btn-sm" onclick="stergeImagine(${id}, ${img.id})">Șterge</button></td>
            </tr>`
          )
          .join('')}</tbody>
      </table>`
    : '<p>Nu există imagini suplimentare pentru acest pachet.</p>';
}

window.stergeImagine = async (pachetId, imagineId) => {
  if (!confirm('Ștergi imaginea?')) return;
  const res = await fetch(`/api/pachete/${pachetId}/imagini/${imagineId}`, { method: 'DELETE' });
  if (!res.ok) return alert((await res.json()).error || 'Eroare la ștergere');
  loadImaginiPachet(pachetId);
};

document.getElementById('fisiere-incarcare')?.addEventListener('change', (e) => {
  const preview = document.getElementById('previzualizare-incarcare');
  preview.innerHTML = '';
  [...e.target.files].forEach((f) => {
    const url = URL.createObjectURL(f);
    const img = document.createElement('img');
    img.src = url;
    preview.appendChild(img);
  });
});

document.getElementById('buton-incarcare')?.addEventListener('click', async () => {
  const id = document.getElementById('id-incarcare').textContent;
  const files = document.getElementById('fisiere-incarcare').files;
  if (!files.length) return alert('Selectează imagini');
  const fd = new FormData();
  [...files].forEach((f) => fd.append('imagini', f));
  const res = await fetch('/api/pachete/' + id + '/imagini', { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok) alert(data.error || 'Eroare');
  else {
    alert('Încărcat & comprimat: ' + data.imagini.length + ' imagini');
    document.getElementById('fisiere-incarcare').value = '';
    document.getElementById('previzualizare-incarcare').innerHTML = '';
    loadImaginiPachet(id);
  }
});

window.stergePachet = async (id) => {
  if (!confirm('Dezactivezi pachetul?')) return;
  await fetch('/api/pachete/' + id, { method: 'DELETE' });
  loadPachete();
};

function serializePachetForm(form) {
  const body = Object.fromEntries(new FormData(form));
  body.pret = +body.pret;
  body.durata_zile = +body.durata_zile;
  body.reducere_procent = +body.reducere_procent || 0;
  body.locuri_disponibile = +body.locuri_disponibile || 20;
  if (body.latitudine) body.latitudine = +body.latitudine;
  if (body.longitudine) body.longitudine = +body.longitudine;
  if (body.activ !== undefined) body.activ = body.activ === 'true';
  return body;
}

window.openEdit = async (id) => {
  const p = await fetch('/api/pachete/' + id).then((r) => r.json());
  if (p.error) return alert(p.error);
  const wrap = document.getElementById('editor-pachet');
  const form = document.getElementById('form-edit-pachet');
  wrap.hidden = false;
  document.getElementById('edit-pid').textContent = p.id;
  form.elements.id.value = p.id;
  form.destinatie.value = p.destinatie || '';
  form.tara.value = p.tara || '';
  form.oras.value = p.oras || '';
  form.pret.value = p.pret || '';
  form.reducere_procent.value = p.reducere_procent || 0;
  form.durata_zile.value = p.durata_zile || '';
  form.tip_turism.value = p.tip_turism || 'cultural';
  form.categorie.value = p.categorie || 'standard';
  form.locuri_disponibile.value = p.locuri_disponibile || 20;
  form.hotel_nume.value = p.hotel_nume || '';
  form.latitudine.value = p.latitudine || '';
  form.longitudine.value = p.longitudine || '';
  form.imagine.value = p.imagine || '';
  form.descriere.value = p.descriere || '';
  form.facilitati.value = Array.isArray(p.facilitati) ? p.facilitati.join(', ') : '';
  form.activ.value = p.activ ? 'true' : 'false';
  wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

document.getElementById('btn-inchide-edit')?.addEventListener('click', () => {
  document.getElementById('editor-pachet').hidden = true;
});

document.getElementById('form-edit-pachet')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = e.target.elements.id.value;
  const body = serializePachetForm(e.target);
  delete body.id;
  const res = await fetch('/api/pachete/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) alert((await res.json()).error);
  else {
    document.getElementById('editor-pachet').hidden = true;
    loadPachete();
    alert('Pachet actualizat');
  }
});

document.getElementById('form-pachet')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = serializePachetForm(e.target);
  const res = await fetch('/api/pachete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) alert((await res.json()).error);
  else {
    e.target.reset();
    loadPachete();
    alert('Pachet adăugat');
  }
});

window.openPerioade = async (id) => {
  const zone = document.getElementById('perioade-zone');
  zone.hidden = false;
  document.getElementById('perioade-pid').textContent = id;
  const form = document.getElementById('form-perioada');
  form.elements.pachet_id.value = id;
  resetPerioadaForm();
  await loadPerioade(id);
  zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function resetPerioadaForm() {
  const form = document.getElementById('form-perioada');
  form.elements.id.value = '';
  form.elements.data_start.value = '';
  form.elements.data_end.value = '';
  form.elements.locuri.value = 20;
  form.elements.pret_special.value = '';
}

document.getElementById('btn-reset-perioada')?.addEventListener('click', resetPerioadaForm);

function dataScurta(value) {
  return value ? String(value).slice(0, 10) : '';
}

async function loadPerioade(pachetId) {
  const list = await fetch('/api/pachete/' + pachetId + '/perioade').then((r) => r.json());
  document.getElementById('lista-perioade-admin').innerHTML = list.length
    ? `<table class="tabel-admin">
        <thead><tr><th>Start</th><th>End</th><th>Locuri</th><th>Preț special</th><th></th></tr></thead>
        <tbody>${list
          .map(
            (p) => `<tr>
              <td>${dataScurta(p.data_start)}</td>
              <td>${dataScurta(p.data_end)}</td>
              <td>${p.locuri}</td>
              <td>${p.pret_special || '-'}</td>
              <td>
                <button type="button" class="btn btn-contur btn-sm" onclick="editPerioada(${pachetId}, ${p.id}, '${dataScurta(p.data_start)}', '${dataScurta(p.data_end)}', ${p.locuri}, '${p.pret_special || ''}')">Editează</button>
                <button type="button" class="btn btn-contur btn-sm" onclick="stergePerioada(${pachetId}, ${p.id})">Șterge</button>
              </td>
            </tr>`
          )
          .join('')}</tbody>
      </table>`
    : '<p>Nu există perioade disponibile pentru acest pachet.</p>';
}

window.editPerioada = (pachetId, id, dataStart, dataEnd, locuri, pretSpecial) => {
  const form = document.getElementById('form-perioada');
  form.elements.pachet_id.value = pachetId;
  form.elements.id.value = id;
  form.elements.data_start.value = dataStart;
  form.elements.data_end.value = dataEnd;
  form.elements.locuri.value = locuri;
  form.elements.pret_special.value = pretSpecial || '';
};

window.stergePerioada = async (pachetId, id) => {
  if (!confirm('Ștergi perioada?')) return;
  const res = await fetch(`/api/pachete/${pachetId}/perioade/${id}`, { method: 'DELETE' });
  if (!res.ok) return alert((await res.json()).error || 'Eroare la ștergere');
  loadPerioade(pachetId);
};

document.getElementById('form-perioada')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const pachetId = form.elements.pachet_id.value;
  const id = form.elements.id.value;
  const body = {
    data_start: form.elements.data_start.value,
    data_end: form.elements.data_end.value,
    locuri: +form.elements.locuri.value || 20,
    pret_special: form.elements.pret_special.value ? +form.elements.pret_special.value : null,
  };
  const res = await fetch(`/api/pachete/${pachetId}/perioade${id ? '/' + id : ''}`, {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) alert((await res.json()).error);
  else {
    resetPerioadaForm();
    loadPerioade(pachetId);
    alert('Perioadă salvată');
  }
});

async function loadRezervari() {
  const list = await fetch('/api/admin/rezervari').then((r) => r.json());
  document.getElementById('lista-rez-admin').innerHTML = `
    <table class="tabel-admin">
      <thead><tr><th>ID</th><th>Client</th><th>Pachet</th><th>Pers</th><th>Total</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${list
          .map(
            (r) => `<tr>
          <td>${r.id}</td><td>${esc(r.client)}<br><small>${esc(r.email)}</small></td>
          <td>${esc(r.destinatie)}</td><td>${r.numar_persoane}</td><td>${r.pret_total}</td>
          <td>
            <select onchange="setRezStatus(${r.id}, this.value)">
              ${['pending', 'confirmata', 'anulata', 'finalizata']
                .map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`)
                .join('')}
            </select>
          </td>
          <td></td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

window.setRezStatus = async (id, status) => {
  await fetch('/api/admin/rezervari/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
};

async function loadUseri() {
  const el = document.getElementById('lista-utilizatori');
  if (!el) return;
  const list = await fetch('/api/admin/utilizatori').then((r) => r.json());
  el.innerHTML = `
    <table class="tabel-admin">
      <thead><tr><th>ID</th><th>Nume</th><th>Email</th><th>Rol</th><th>Activ</th></tr></thead>
      <tbody>
        ${list
          .map(
            (u) => `<tr>
          <td>${u.id}</td><td>${esc(u.nume)}</td><td>${esc(u.email)}</td>
          <td>
            <select onchange="setUser(${u.id}, {rol: this.value})">
              ${['client', 'angajat', 'administrator']
                .map((r) => `<option ${r === u.rol ? 'selected' : ''}>${r}</option>`)
                .join('')}
            </select>
          </td>
          <td><input type="checkbox" ${u.activ ? 'checked' : ''} onchange="setUser(${u.id}, {activ: this.checked})"></td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

window.setUser = async (id, patch) => {
  await fetch('/api/admin/utilizatori/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
};

async function loadRecenzii() {
  const list = await fetch('/api/admin/recenzii').then((r) => r.json());
  document.getElementById('lista-recenzii-admin').innerHTML = `
    <table class="tabel-admin">
      <thead><tr><th>ID</th><th>User</th><th>Pachet</th><th>★</th><th>Comentariu</th><th>Status</th></tr></thead>
      <tbody>
        ${list
          .map(
            (r) => `<tr>
          <td>${r.id}</td><td>${esc(r.nume)}</td><td>${esc(r.destinatie)}</td><td>${r.rating}</td>
          <td>${esc(r.comentariu || '')}</td>
          <td>
            <select onchange="setRec(${r.id}, this.value)">
              ${['pending', 'aprobata', 'respinsa']
                .map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`)
                .join('')}
            </select>
          </td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

window.setRec = async (id, status) => {
  await fetch('/api/admin/recenzii/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
};

async function loadRaport() {
  const list = await fetch('/api/admin/raport').then((r) => r.json());
  document.getElementById('lista-raport').innerHTML = `
    <table class="tabel-admin">
      <thead><tr><th>Destinație</th><th>Tip</th><th>Țară</th><th>Rezervări</th><th>Venituri</th><th>Rating</th></tr></thead>
      <tbody>
        ${list
          .map(
            (r) => `<tr>
          <td>${esc(r.destinatie)}</td><td>${r.tip_turism || ''}</td><td>${esc(r.tara || '')}</td>
          <td>${r.nr_rezervari}</td><td>${Math.round(r.venituri)}</td><td>${Number(r.rating).toFixed(1)}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>`;
}

document.getElementById('form-promotie')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const status = document.getElementById('promotie-status');
  const body = Object.fromEntries(new FormData(e.target));
  status.textContent = 'Se trimit notificările...';
  const res = await fetch('/api/admin/promotii', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    status.textContent = data.error || 'Eroare la trimitere.';
    return;
  }
  e.target.reset();
  status.textContent = `Promoția a fost trimisă către ${data.trimise} clienți.`;
});

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function loadGamification() {
  const stats = await fetch('/api/admin/gamification/stats').then((r) => r.json());
  document.getElementById('statistici-joc').innerHTML = `
    <div class="card-statistica"><div>Spin-uri totale</div><div class="valoare">${stats.totalSpins}</div></div>
    <div class="card-statistica"><div>Spin-uri disponibile</div><div class="valoare">${stats.availableSpins}</div></div>
    <div class="card-statistica"><div>Recompense acordate</div><div class="valoare">${stats.totalRewardsGranted}</div></div>
    <div class="card-statistica"><div>Success rate quiz</div><div class="valoare">${stats.successRate}%</div></div>
  `;
  await loadAdminRewards();
  await loadAdminQuiz();
}

async function loadAdminRewards() {
  const list = await fetch('/api/admin/rewards').then((r) => r.json());
  document.getElementById('lista-recompense-admin').innerHTML = `
    <table class="tabel-admin">
      <thead><tr><th>ID</th><th>Nume</th><th>Tip</th><th>Val</th><th>Prob%</th><th>Activ</th><th></th></tr></thead>
      <tbody>
        ${list
          .map(
            (r) => `<tr>
          <td>${r.id}</td><td>${esc(r.nume)}</td><td>${esc(r.tip)}</td><td>${r.valoare}</td>
          <td>${r.probabilitate}</td><td>${r.activ ? 'da' : 'nu'}</td>
          <td>
            <button type="button" class="btn btn-contur buton-editare-recompensa" data-json='${JSON.stringify(r).replace(/'/g, '&#39;')}'>Edit</button>
            <button type="button" class="btn btn-contur buton-stergere-recompensa" data-id="${r.id}">Dezactivează</button>
          </td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>`;

  document.querySelectorAll('.buton-editare-recompensa').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = JSON.parse(btn.dataset.json);
      const form = document.getElementById('formular-recompensa');
      form.id.value = r.id;
      form.nume.value = r.nume;
      form.tip.value = r.tip;
      form.valoare.value = r.valoare;
      form.probabilitate.value = r.probabilitate;
      form.culoare.value = r.culoare || '#0f68b1';
      form.iconita.value = r.iconita || 'gift';
      form.descriere.value = r.descriere || '';
      form.activ.value = r.activ ? 'true' : 'false';
    });
  });
  document.querySelectorAll('.buton-stergere-recompensa').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch('/api/admin/rewards/' + btn.dataset.id, { method: 'DELETE' });
      loadAdminRewards();
    });
  });
}

async function loadAdminQuiz() {
  const cat = document.getElementById('filtru-quiz-categorie')?.value || '';
  const diff = document.getElementById('filtru-quiz-dificultate')?.value || '';
  const qs = new URLSearchParams();
  if (cat) qs.set('categorie', cat);
  if (diff) qs.set('dificultate', diff);
  const list = await fetch('/api/admin/quiz?' + qs.toString()).then((r) => r.json());
  document.getElementById('lista-quiz-admin').innerHTML = `
    <table class="tabel-admin">
      <thead><tr><th>ID</th><th>Întrebare</th><th>Cat</th><th>Diff</th><th>OK</th><th>Activ</th><th></th></tr></thead>
      <tbody>
        ${list
          .map(
            (q) => `<tr>
          <td>${q.id}</td><td>${esc((q.intrebare || '').slice(0, 60))}</td>
          <td>${esc(q.categorie)}</td><td>${esc(q.dificultate)}</td>
          <td>${q.raspuns_corect}</td><td>${q.activ ? 'da' : 'nu'}</td>
          <td>
            <button type="button" class="btn btn-contur buton-editare-quiz" data-json='${JSON.stringify(q).replace(/'/g, '&#39;')}'>Edit</button>
            <button type="button" class="btn btn-contur buton-stergere-quiz" data-id="${q.id}">Dezactivează</button>
          </td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>`;

  document.querySelectorAll('.buton-editare-quiz').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = JSON.parse(btn.dataset.json);
      const form = document.getElementById('formular-quiz');
      form.id.value = q.id;
      form.intrebare.value = q.intrebare;
      form.optiune_a.value = q.optiune_a;
      form.optiune_b.value = q.optiune_b;
      form.optiune_c.value = q.optiune_c;
      form.optiune_d.value = q.optiune_d;
      form.raspuns_corect.value = q.raspuns_corect;
      form.categorie.value = q.categorie;
      form.dificultate.value = q.dificultate;
      form.explicatie.value = q.explicatie || '';
    });
  });
  document.querySelectorAll('.buton-stergere-quiz').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch('/api/admin/quiz/' + btn.dataset.id, { method: 'DELETE' });
      loadAdminQuiz();
    });
  });
}

document.getElementById('buton-filtru-quiz')?.addEventListener('click', loadAdminQuiz);

document.getElementById('formular-recompensa')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = Object.fromEntries(new FormData(form));
  body.valoare = parseFloat(body.valoare);
  body.probabilitate = parseFloat(body.probabilitate);
  body.activ = body.activ === 'true';
  const id = body.id;
  delete body.id;
  const res = await fetch(id ? '/api/admin/rewards/' + id : '/api/admin/rewards', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    alert((await res.json()).error || 'Eroare');
    return;
  }
  form.reset();
  form.id.value = '';
  loadAdminRewards();
});

document.getElementById('formular-quiz')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const body = Object.fromEntries(new FormData(form));
  const id = body.id;
  delete body.id;
  const res = await fetch(id ? '/api/admin/quiz/' + id : '/api/admin/quiz', {
    method: id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    alert((await res.json()).error || 'Eroare');
    return;
  }
  form.reset();
  form.id.value = '';
  loadAdminQuiz();
});

loadDashboard();
