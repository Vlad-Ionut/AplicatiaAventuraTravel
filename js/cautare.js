async function cauta(params) {
  const qs = new URLSearchParams(params);
  const res = await fetch('/api/search?' + qs.toString());
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Eroare la căutare.');
  }
  return data;
}

function imageSrc(src) {
  if (!src) return '/resurse/imagini/galerie/mare/1.jpg';
  return String(src).startsWith('/') ? src : '/resurse/imagini/pachete/' + src;
}

function formatPerioada(dataStart, dataEnd) {
  if (!dataStart || !dataEnd) return 'Perioadă: la cerere';
  const start = new Date(dataStart);
  const end = new Date(dataEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Perioadă: la cerere';
  }
  return `Perioadă: ${start.toLocaleDateString('ro-RO')} – ${end.toLocaleDateString('ro-RO')}`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function randareRezultate(data) {
  const box = document.getElementById('search-results');
  const count = document.getElementById('numar-cautare');
  count.textContent = (data.count || 0) + ' rezultate găsite';
  if (data.warning) {
    count.textContent += ' · ' + data.warning;
  }
  if (!data.results || !data.results.length) {
    box.innerHTML = '<p>Niciun pachet nu corespunde filtrelor.</p>';
    return;
  }
  box.innerHTML = data.results
    .map((p) => {
      const reducere = Number(p.reducere_procent || 0);
      return `
    <article class="card-pachet">
      <figure>
        <a href="/produs/${p.id}" aria-label="Vezi detalii pentru ${escapeHtml(p.destinatie)}">
          <img src="${imageSrc(p.imagine)}"
               alt="${escapeHtml(p.destinatie)}"
               loading="lazy"
               onerror="this.src='/resurse/imagini/galerie/mare/1.jpg'">
        </a>
      </figure>
      <div class="corp-card-pachet">
        <p class="insigna-tip">${escapeHtml(p.tip_turism || 'vacanță')}</p>
        <h2><a href="/produs/${p.id}">${escapeHtml(p.destinatie)}</a></h2>
        <p class="estompat">${escapeHtml(p.tara || p.oras || p.categorie || '')} · ${p.durata_zile || '?'} zile</p>
        <p class="pret-nou">${p.pret_final} RON
          ${reducere > 0 ? `<span class="insigna-reducere">−${reducere}%</span>` : ''}
        </p>
        <p class="estompat">Locuri: ${p.locuri_disponibile ?? '-'}</p>
        <p class="estompat perioada-cautare">${formatPerioada(p.perioada_start, p.perioada_end)}</p>
        <a class="btn btn-primary" href="/produs/${p.id}">Detalii & rezervare</a>
      </div>
    </article>`;
    })
    .join('');
}

document.getElementById('form-cautare').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const params = {};
  for (const [k, v] of fd.entries()) {
    if (v) params[k] = v;
  }
  try {
    const data = await cauta(params);
    randareRezultate(data);
    history.replaceState(null, '', '/cautare?' + new URLSearchParams(params));
  } catch (error) {
    document.getElementById('numar-cautare').textContent = error.message;
    document.getElementById('search-results').innerHTML = '';
  }
});

(async () => {
  const q = Object.fromEntries(new URLSearchParams(location.search));
  if (Object.keys(q).length) {
    const form = document.getElementById('form-cautare');
    for (const [k, v] of Object.entries(q)) {
      if (form.elements[k]) form.elements[k].value = v;
    }
    try {
      randareRezultate(await cauta(q));
    } catch (error) {
      document.getElementById('numar-cautare').textContent = error.message;
    }
  }
})();
