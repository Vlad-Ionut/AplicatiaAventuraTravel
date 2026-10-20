const bd = require('./baza_de_date');

const PROGRAM_AGENTIE = `
Program agenție Aventura Travel:
Luni–Vineri: 09:00–18:00
Sâmbătă: 10:00–14:00
Duminică: închis
Telefon: 021 123 4567
Email: contact@aventuratravel.ro
Adresă: Str. Călătoriilor nr. 10, București
`.trim();

const AJUTOR = `Pot să te ajut cu:
• program / contact agenție
• recomandări de vacanțe (city break, aventură, relaxare, cultural)
• prețuri și pachete pe buget
• rezervare, anulare, plăți
• wishlist, cont, hartă

Exemple: „Recomandă un city break în Italia”, „Pachete sub 2000 RON”, „Care e programul?”`;

function normalizeaza(mesaj) {
    return String(mesaj || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function formatPachet(p) {
    const pret = Math.round(Number(p.pret) || 0);
    const zile = p.durata_zile || '?';
    const tip = p.tip_turism || 'vacanță';
    return `• ${p.destinatie} — ${pret} RON / ${zile} zile (${tip})`;
}

async function cautaPachete({ tip, textCautare, bugetMax, limita = 5 } = {}) {
    const params = [];
    let where = ' WHERE TRUE';

    if (tip) {
        params.push(tip);
        where += ` AND tip_turism=$${params.length}`;
    }
    if (textCautare) {
        params.push('%' + textCautare + '%');
        where += ` AND (destinatie ILIKE $${params.length} OR COALESCE(descriere,'') ILIKE $${params.length})`;
    }
    if (bugetMax != null && !Number.isNaN(bugetMax)) {
        params.push(bugetMax);
        where += ` AND pret <= $${params.length}`;
    }

    const sql = `SELECT destinatie, pret, durata_zile, tip_turism, descriere
                 FROM pachete_turism
                 ${where}
                 ORDER BY pret ASC
                 LIMIT ${limita}`;
    const rez = await bd.interogheaza(sql, params);
    return rez.rows;
}

function detecteazaTaraSauOras(m) {
    const map = [
        [/italia|rome|roma|florent|vene|milano/, 'Italia'],
        [/franta|paris/, 'Franța'],
        [/spania|barcelona|madrid/, 'Spania'],
        [/grecia|santorini|aten/, 'Grecia'],
        [/romania|brasov|transilvania|bucuresti/, 'România'],
        [/egipt|cairo|luxor/, 'Egipt'],
        [/austria|viena/, 'Austria'],
        [/elv|alpi|interlaken/, 'Elveția'],
        [/kenya|safari|masai/, 'Kenya'],
        [/bali|indonezia/, 'Bali'],
        [/vietnam|thailanda|bangkok/, 'Asia'],
        [/hawaii|honolulu/, 'Hawaii'],
        [/caraibe|bahamas/, 'Caraibe'],
        [/patagonia|argentina/, 'Patagonia'],
        [/norvegia|scandinavia|bergen/, 'Scandinavia'],
    ];
    for (const [re, label] of map) {
        if (re.test(m)) return label;
    }
    return null;
}

function detecteazaTip(m) {
    if (/city.?break|urban|oras|city/.test(m)) return 'urban';
    if (/aventura|munte|safari|trek|alpin/.test(m)) return 'aventura';
    if (/relax|plaj|mare|all.?inclusive|spa/.test(m)) return 'relaxare';
    if (/cultur|muzeu|istor|gastronom/.test(m)) return 'cultural';
    return null;
}

function detecteazaBuget(m) {
    const sub = m.match(/sub\s*(\d+)/);
    if (sub) return parseInt(sub[1], 10);
    const max = m.match(/(?:maxim|max|pana\s*la|pân[aă]\s*la)\s*(\d+)/);
    if (max) return parseInt(max[1], 10);
    if (/ieftin|buget\s*mic|economic/.test(m)) return 1500;
    return null;
}

async function raspunsRecomandari(m) {
    const tip = detecteazaTip(m);
    const loc = detecteazaTaraSauOras(m);
    const buget = detecteazaBuget(m);

    try {
        const pachete = await cautaPachete({
            tip,
            textCautare: loc,
            bugetMax: buget,
            limita: 5,
        });

        if (!pachete.length) {
            const fallback = await cautaPachete({ tip, limita: 5 });
            if (!fallback.length) {
                return 'Momentan nu am găsit pachete potrivite. Încearcă pe pagina Destinații (/produse) sau spune-mi un tip: cultural, aventură, relaxare, urban.';
            }
            return (
                'Nu am găsit exact ce ai cerut, dar iată câteva opțiuni apropiate:\n' +
                fallback.map(formatPachet).join('\n') +
                '\n\nVezi detalii pe /produse.'
            );
        }

        let intro = 'Iată câteva recomandări';
        if (tip) intro += ` (${tip})`;
        if (loc) intro += ` pentru ${loc}`;
        if (buget) intro += ` sub ${buget} RON`;
        intro += ':\n';

        return (
            intro +
            pachete.map(formatPachet).join('\n') +
            '\n\nPoți vedea detalii pe Destinații (/produse) sau rezervi din pagina pachetului.'
        );
    } catch (e) {
        console.error('[CHATBOT recomandari]', e.message);
        return 'Nu pot citi acum pachetele din baza de date. Poți vedea ofertele pe pagina Destinații (/produse) sau pe /cautare.';
    }
}

async function raspunsPreturi(m) {
    const buget = detecteazaBuget(m);
    try {
        const pachete = await cautaPachete({ bugetMax: buget, limita: 8 });
        if (!pachete.length) {
            return buget
                ? `Nu am găsit pachete sub ${buget} RON. Încearcă un buget mai mare sau vezi /cautare.`
                : 'Nu am putut încărca prețurile. Vezi pagina Destinații (/produse).';
        }
        const titlu = buget ? `Pachete sub ${buget} RON:\n` : 'Prețuri orientative (RON/pers):\n';
        return titlu + pachete.map(formatPachet).join('\n') + '\n\nFiltrează și pe /cautare.';
    } catch (e) {
        console.error('[CHATBOT preturi]', e.message);
        return 'Nu pot afișa prețurile acum. Mergi la /produse sau /cautare pentru oferte.';
    }
}

async function raspunsDestinatie(m) {
    const loc = detecteazaTaraSauOras(m);
    const cuvinte = m
        .replace(/[^a-z0-9\s]/gi, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 4);

    const text = loc || cuvinte[0];
    if (!text || text.length < 3) return null;

    try {
        const pachete = await cautaPachete({ textCautare: text, limita: 3 });
        if (!pachete.length) return null;
        return (
            pachete
                .map((p) => {
                    const desc = (p.descriere || '').slice(0, 160);
                    return `${p.destinatie}${desc ? ': ' + desc : ''}\nPreț de la ${Math.round(p.pret)} RON, ${p.durata_zile || '?'} zile, tip ${p.tip_turism || 'vacanță'}.`;
                })
                .join('\n\n') + '\n\nDetalii pe /produse.'
        );
    } catch (e) {
        console.error('[CHATBOT destinatie]', e.message);
        return null;
    }
}

async function raspunsRuleBased(mesaj) {
    const m = normalizeaza(mesaj);

    if (/program|orar|deschis|cand.*deschis|schedule/.test(m)) {
        return PROGRAM_AGENTIE;
    }

    if (/contact|telefon|email|adresa|unde.*gasiti|unde.*sunteti/.test(m)) {
        return (
            'Contact Aventura Travel:\n' +
            'Telefon: 021 123 4567\n' +
            'Email: contact@aventuratravel.ro\n' +
            'Adresă: Str. Călătoriilor nr. 10, București\n\n' +
            PROGRAM_AGENTIE
        );
    }

    if (/^salut|^buna|^hello|^hi\b|^hey|ce faci|buna ziua|buna seara/.test(m)) {
        return 'Bună! Sunt asistentul Aventura Travel. Te pot ajuta cu destinații, prețuri, rezervări sau programul agenției. Cu ce te pot ajuta?';
    }

    if (/multumesc|mersi|thanks/.test(m)) {
        return 'Cu plăcere! Dacă mai ai întrebări despre vacanțe, sunt aici.';
    }

    if (/ajutor|help|ce poti|ce stii|optiuni/.test(m)) {
        return AJUTOR;
    }

    if (/anulare|anulez|cancel|renunt/.test(m)) {
        return 'Poți anula o rezervare din Contul meu → Rezervările mele, dacă statusul este „pending” sau „confirmata”. Vei primi confirmare pe email.';
    }

    if (/cum.*rezerv|rezervare|book|vreau.*rezerv/.test(m)) {
        return 'Pentru rezervare:\n1) Intră pe Destinații (/produse) sau Căutare\n2) Deschide pachetul dorit\n3) Alege perioada și numărul de persoane\n4) Confirmă și finalizează plata pe pagina Plată\n\nAi nevoie de cont (Login / Înregistrare).';
    }

    if (/plata|plata|card|stripe|paypal|netopia|cum.*platesc/.test(m)) {
        return 'Acceptăm plăți simulate: card, PayPal și Netopia. La checkout alegi metoda. Pentru test: card 4242… (succes) sau 4000… (refuz).';
    }

    if (/wishlist|favorit|inimioar|salvate/.test(m)) {
        return 'Poți salva vacanțele favorite pe pagina pachetului. Le găsești apoi în Cont → Wishlist (/wishlist).';
    }

    if (/login|autentific|cont|parola|inregistr|register/.test(m)) {
        return 'Contul se creează la /register. Autentificarea este pe /login. După login poți face rezervări, wishlist și vezi rezervările tale.';
    }

    if (/harta|map|locatie|unde.*hotel/.test(m)) {
        return 'Poți vedea destinațiile pe hartă la pagina Hartă (/harta). Acolo apar pachetele cu coordonate și puncte de interes.';
    }

    if (/recomandari|recomand|inteligent/.test(m) && !/city|italia|pachet|vacan/.test(m)) {
        return 'Recomandările personalizate sunt pe /recomandari (în funcție de rezervările tale). Sau spune-mi ce tip de vacanță vrei: city break, aventură, relaxare, cultural.';
    }

    if (
        /recomand|sugest|ce.*vacan|unde.*merg|destina|pachet|ofert|city.?break|aventura|relax|cultur|ieftin|buget|sub\s*\d+|vacanta|vacan/.test(
            m
        )
    ) {
        if (/pret|preturi|cost|cat costa|lista.*pret/.test(m) && !/recomand|city|italia|vacan/.test(m)) {
            return raspunsPreturi(m);
        }
        if (/sub\s*\d+|ieftin|buget/.test(m) && !/recomand|city|tip|vacan/.test(m)) {
            return raspunsPreturi(m);
        }
        return raspunsRecomandari(m);
    }

    if (/pret|preturi|cost|cat costa|cat cost/.test(m)) {
        return raspunsPreturi(m);
    }

    const dupaDest = await raspunsDestinatie(m);
    if (dupaDest) return dupaDest;

    return AJUTOR;
}

async function raspundeAsistent(mesaj) {
    try {
        if (process.env.OPENAI_API_KEY) {
            try {
                const pachete = await cautaPachete({ limita: 20 });
                const context =
                    'Ești asistentul agenției Aventura Travel (răspunde în română, scurt și util). Date pachete:\n' +
                    JSON.stringify(pachete) +
                    '\n' +
                    PROGRAM_AGENTIE;

                const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer ' + process.env.OPENAI_API_KEY,
                    },
                    body: JSON.stringify({
                        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: context },
                            { role: 'user', content: mesaj },
                        ],
                        max_tokens: 500,
                    }),
                });
                if (resp.ok) {
                    const data = await resp.json();
                    const content = data.choices?.[0]?.message?.content;
                    if (content) return content;
                }
            } catch (e) {
                console.error('Eroare OpenAI:', e.message);
            }
        }

        return await raspunsRuleBased(mesaj);
    } catch (e) {
        console.error('[CHATBOT]', e.message);
        return 'Am întâmpinat o problemă temporară. Încearcă din nou sau vezi ofertele pe /produse.';
    }
}

module.exports = { raspundeAsistent, chat: raspundeAsistent, PROGRAM_AGENTIE };
