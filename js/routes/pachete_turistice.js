const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const bd = require('../services/baza_de_date');
const { necesitaAutentificare, necesitaRol } = require('../middleware/autentificare');

const router = express.Router();

const directorIncarcare = path.join(__dirname, '..', '..', 'fisiere_uploadate', 'pachete');
if (!fs.existsSync(directorIncarcare)) fs.mkdirSync(directorIncarcare, { recursive: true });

const stocare = multer.memoryStorage();
const incarcare = multer({
    storage: stocare,
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, fisier, continua) => {
        if (/^image\/(jpeg|png|webp|gif)$/.test(fisier.mimetype)) continua(null, true);
        else continua(new Error('Doar imagini JPEG/PNG/WebP/GIF'));
    },
});

function pretFinal(p) {
    const r = parseFloat(p.reducere_procent) || 0;
    return Math.round(parseFloat(p.pret) * (1 - r / 100) * 100) / 100;
}

router.get('/produse', async (req, res) => {
    try {
        const params = [];
        let tipFiltru = '';
        if (req.query.tip) {
            params.push(req.query.tip);
            tipFiltru = ` AND tip_turism=$${params.length}`;
        }

        let rez;
        try {
            rez = await bd.interogheaza(
                `SELECT * FROM pachete_turism WHERE activ=TRUE${tipFiltru} ORDER BY data_adaugare DESC`,
                params
            );
        } catch (_) {
            rez = await bd.interogheaza(
                `SELECT * FROM pachete_turism WHERE TRUE${tipFiltru} ORDER BY id DESC`,
                params
            );
        }

        let optiuni = [];
        let tipuri = [];
        try {
            optiuni = (await bd.interogheaza('SELECT unnest(enum_range(NULL::categorie_pachet)) AS unnest')).rows;
            tipuri = (await bd.interogheaza('SELECT unnest(enum_range(NULL::tipuri_turism)) AS unnest')).rows;
        } catch (_) {
            optiuni = ['standard', 'lux', 'familie', 'cuplu'].map((v) => ({ unnest: v }));
            tipuri = ['cultural', 'aventura', 'relaxare', 'urban'].map((v) => ({ unnest: v }));
        }

        res.render('pagini/produse', {
            produse: rez.rows.map((p) => ({ ...p, pret_final: pretFinal(p) })),
            optiuni,
            tipuri,
            filtruTip: req.query.tip || '',
        });
    } catch (e) {
        console.error(e);
        res.status(500).render('pagini/eroare', {
            titlu: 'Eroare',
            text: 'Nu s-au putut încărca pachetele.',
            imagine: '/resurse/imagini/erori/interzis.png',
        });
    }
});

router.get('/produs/:id', async (req, res) => {
    try {
        let rez;
        try {
            rez = await bd.interogheaza(
                `SELECT * FROM pachete_turism WHERE id=$1 AND activ=TRUE`,
                [req.params.id]
            );
        } catch (_) {
            rez = await bd.interogheaza(`SELECT * FROM pachete_turism WHERE id=$1`, [req.params.id]);
        }
        if (!rez.rows.length) {
            return res.status(404).render('pagini/eroare', {
                titlu: 'Pachet inexistent',
                text: 'Pachetul căutat nu există.',
                imagine: '/resurse/imagini/erori/interzis.png',
            });
        }

        const row = rez.rows[0];
        const prod = {
            ...row,
            pret_final: pretFinal(row),
            reducere_procent: Number(row.reducere_procent || 0),
            locuri_disponibile: row.locuri_disponibile ?? row.persoane ?? null,
            hotel_nume: row.hotel_nume || null,
            imagine: row.imagine || null,
            facilitati: Array.isArray(row.facilitati) ? row.facilitati : [],
        };

        async function interogareSigura(sql, parametri = [], implicit = []) {
            try {
                const r = await bd.interogheaza(sql, parametri);
                return r.rows;
            } catch (e) {
                console.warn('[produs]', e.message);
                return implicit;
            }
        }

        const imagini = await interogareSigura(
            'SELECT * FROM pachet_imagini WHERE pachet_id=$1 ORDER BY ordine',
            [prod.id]
        );
        const perioade = await interogareSigura(
            `SELECT * FROM perioade_disponibile
             WHERE pachet_id=$1 AND data_start >= CURRENT_DATE AND locuri > 0
             ORDER BY data_start LIMIT 12`,
            [prod.id]
        );
        const recenzii = await interogareSigura(
            `SELECT r.*, u.nume FROM recenzii r
             JOIN utilizatori u ON u.id=r.utilizator_id
             WHERE r.pachet_id=$1 AND r.status='aprobata'
             ORDER BY r.data_creare DESC`,
            [prod.id]
        );
        const ratingRows = await interogareSigura(
            `SELECT COALESCE(AVG(rating),0) AS medie, COUNT(*) AS total
             FROM recenzii WHERE pachet_id=$1 AND status='aprobata'`,
            [prod.id],
            [{ medie: 0, total: 0 }]
        );
        const rating = ratingRows[0] || { medie: 0, total: 0 };

        let inListaDorinte = false;
        if (req.user) {
            const w = await interogareSigura(
                'SELECT id FROM wishlist WHERE utilizator_id=$1 AND pachet_id=$2',
                [req.user.id, prod.id]
            );
            inListaDorinte = w.length > 0;
        }

        const poi = await interogareSigura('SELECT * FROM destinatie_poi WHERE pachet_id=$1', [prod.id]);

        res.render('pagini/produs', {
            prod,
            imagini,
            perioade,
            recenzii,
            rating,
            inWishlist: inListaDorinte,
            inListaDorinte,
            poi,
        });
    } catch (e) {
        console.error('[PRODUS]', e);
        res.status(500).render('pagini/eroare', {
            titlu: 'Eroare',
            text: 'Eroare la încărcarea pachetului.',
            imagine: '/resurse/imagini/erori/interzis.png',
        });
    }
});

router.get('/api/search', async (req, res) => {
    try {
        const { destinatie, buget_min, buget_max, tip, categorie, persoane, data_start, data_end, q } = req.query;
        const params = [];
        let where = ' WHERE COALESCE(p.activ, TRUE) = TRUE';

        if (q) {
            params.push('%' + q + '%');
            where += ` AND (p.destinatie ILIKE $${params.length} OR COALESCE(p.descriere,'') ILIKE $${params.length} OR COALESCE(p.tara,'') ILIKE $${params.length} OR COALESCE(p.oras,'') ILIKE $${params.length})`;
        }
        if (destinatie) {
            params.push('%' + destinatie + '%');
            where += ` AND (p.destinatie ILIKE $${params.length} OR COALESCE(p.tara,'') ILIKE $${params.length} OR COALESCE(p.oras,'') ILIKE $${params.length})`;
        }
        if (tip) {
            params.push(tip);
            where += ` AND p.tip_turism=$${params.length}`;
        }
        if (categorie) {
            params.push(categorie);
            where += ` AND p.categorie=$${params.length}`;
        }
        if (buget_min) {
            params.push(parseFloat(buget_min));
            where += ` AND p.pret * (1 - COALESCE(p.reducere_procent,0)/100) >= $${params.length}`;
        }
        if (buget_max) {
            params.push(parseFloat(buget_max));
            where += ` AND p.pret * (1 - COALESCE(p.reducere_procent,0)/100) <= $${params.length}`;
        }
        if (persoane) {
            params.push(parseInt(persoane, 10));
            where += ` AND COALESCE(p.locuri_disponibile, 999) >= $${params.length}`;
        }

        const periodParams = [...params];
        let periodWhere = where;
        let lateralWhere = 'pd.pachet_id=p.id AND pd.locuri>0 AND pd.data_start >= CURRENT_DATE';
        if (data_start) {
            periodParams.push(data_start);
            lateralWhere += ` AND pd.data_start >= $${periodParams.length}`;
        }
        if (data_end) {
            periodParams.push(data_end);
            lateralWhere += ` AND pd.data_end <= $${periodParams.length}`;
        }
        if (data_start || data_end) {
            periodWhere += ' AND perioada.data_start IS NOT NULL';
        }

        const sqlCuPerioade = `SELECT p.*,
                perioada.data_start AS perioada_start,
                perioada.data_end AS perioada_end
         FROM pachete_turism p
         LEFT JOIN LATERAL (
            SELECT pd.data_start, pd.data_end
            FROM perioade_disponibile pd
            WHERE ${lateralWhere}
            ORDER BY pd.data_start ASC
            LIMIT 1
         ) perioada ON TRUE
         ${periodWhere}
         ORDER BY p.pret ASC
         LIMIT 50`;

        const sqlFaraPerioade = `SELECT p.*,
                NULL::date AS perioada_start,
                NULL::date AS perioada_end
         FROM pachete_turism p
         ${where}
         ORDER BY p.pret ASC
         LIMIT 50`;

        let rez;
        try {
            rez = await bd.interogheaza(sqlCuPerioade, periodParams);
        } catch (e) {
            console.warn('[search] fallback fără perioade:', e.message);
            if (data_start || data_end) {
                return res.json({
                    results: [],
                    count: 0,
                    warning: 'Filtrul de perioadă nu poate fi aplicat momentan. Caută fără date.',
                });
            }
            try {
                rez = await bd.interogheaza(sqlFaraPerioade, params);
            } catch (e2) {
                console.warn('[search] fallback minimal:', e2.message);
                const paramsMin = [];
                let whereMin = ' WHERE TRUE';
                if (destinatie || q) {
                    paramsMin.push('%' + (destinatie || q) + '%');
                    whereMin += ` AND destinatie ILIKE $${paramsMin.length}`;
                }
                if (tip) {
                    paramsMin.push(tip);
                    whereMin += ` AND tip_turism=$${paramsMin.length}`;
                }
                if (categorie) {
                    paramsMin.push(categorie);
                    whereMin += ` AND categorie=$${paramsMin.length}`;
                }
                if (buget_max) {
                    paramsMin.push(parseFloat(buget_max));
                    whereMin += ` AND pret <= $${paramsMin.length}`;
                }
                if (buget_min) {
                    paramsMin.push(parseFloat(buget_min));
                    whereMin += ` AND pret >= $${paramsMin.length}`;
                }
                rez = await bd.interogheaza(
                    `SELECT *, NULL::date AS perioada_start, NULL::date AS perioada_end
                     FROM pachete_turism ${whereMin} ORDER BY pret ASC LIMIT 50`,
                    paramsMin
                );
            }
        }

        res.json({
            results: rez.rows.map((p) => ({
                ...p,
                pret_final: pretFinal(p),
                imagine: p.imagine || null,
                locuri_disponibile: p.locuri_disponibile ?? p.persoane ?? null,
                reducere_procent: Number(p.reducere_procent || 0),
                perioada_start: p.perioada_start || null,
                perioada_end: p.perioada_end || null,
            })),
            count: rez.rows.length,
        });
    } catch (e) {
        console.error('[search]', e);
        res.status(500).json({ error: 'Eroare căutare' });
    }
});

router.get('/cautare', (req, res) => {
    res.render('pagini/cautare', { query: req.query });
});

router.get('/api/pachete', async (req, res) => {
    const rez = await bd.interogheaza('SELECT * FROM pachete_turism ORDER BY id DESC');
    res.json(rez.rows);
});

router.get('/api/pachete/:id', async (req, res) => {
    const rez = await bd.interogheaza('SELECT * FROM pachete_turism WHERE id=$1', [req.params.id]);
    if (!rez.rows.length) return res.status(404).json({ error: 'Pachet inexistent' });
    res.json(rez.rows[0]);
});

router.post('/api/pachete', necesitaAutentificare, necesitaRol('administrator', 'angajat'), async (req, res) => {
    try {
        const b = req.body;
        const rez = await bd.interogheaza(
            `INSERT INTO pachete_turism
             (destinatie, tara, oras, descriere, pret, reducere_procent, durata_zile, tip_turism, categorie,
              facilitati, locuri_disponibile, imagine, latitudine, longitudine, hotel_nume)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
            [
                b.destinatie, b.tara, b.oras, b.descriere, b.pret, b.reducere_procent || 0,
                b.durata_zile, b.tip_turism, b.categorie,
                Array.isArray(b.facilitati) ? b.facilitati : (b.facilitati || '').split(',').map((s) => s.trim()).filter(Boolean),
                b.locuri_disponibile || 20, b.imagine || null,
                b.latitudine || null, b.longitudine || null, b.hotel_nume || null,
            ]
        );
        res.json(rez.rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.put('/api/pachete/:id', necesitaAutentificare, necesitaRol('administrator', 'angajat'), async (req, res) => {
    try {
        const b = req.body;
        const rez = await bd.interogheaza(
            `UPDATE pachete_turism SET
             destinatie=$1, tara=$2, oras=$3, descriere=$4, pret=$5, reducere_procent=$6,
             durata_zile=$7, tip_turism=$8, categorie=$9, facilitati=$10, locuri_disponibile=$11,
             imagine=COALESCE($12, imagine), latitudine=$13, longitudine=$14, hotel_nume=$15,
             activ=COALESCE($16, activ)
             WHERE id=$17 RETURNING *`,
            [
                b.destinatie, b.tara, b.oras, b.descriere, b.pret, b.reducere_procent || 0,
                b.durata_zile, b.tip_turism, b.categorie,
                Array.isArray(b.facilitati) ? b.facilitati : (b.facilitati || '').split(',').map((s) => s.trim()).filter(Boolean),
                b.locuri_disponibile, b.imagine || null,
                b.latitudine || null, b.longitudine || null, b.hotel_nume || null,
                b.activ, req.params.id,
            ]
        );
        res.json(rez.rows[0]);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.delete('/api/pachete/:id', necesitaAutentificare, necesitaRol('administrator'), async (req, res) => {
    await bd.interogheaza('UPDATE pachete_turism SET activ=FALSE WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
});

router.get('/api/pachete/:id/imagini', necesitaAutentificare, necesitaRol('administrator', 'angajat'), async (req, res) => {
    const rez = await bd.interogheaza(
        'SELECT * FROM pachet_imagini WHERE pachet_id=$1 ORDER BY ordine, id',
        [req.params.id]
    );
    res.json(rez.rows);
});

router.post(
    '/api/pachete/:id/imagini',
    necesitaAutentificare,
    necesitaRol('administrator', 'angajat'),
    incarcare.array('imagini', 8),
    async (req, res) => {
        try {
            const saved = [];
            for (let i = 0; i < (req.files || []).length; i++) {
                const fisier = req.files[i];
                const nume = `pachet_${req.params.id}_${Date.now()}_${i}.webp`;
                const cale = path.join(directorIncarcare, nume);
                await sharp(fisier.buffer)
                    .resize(1200, 800, { fit: 'inside', withoutEnlargement: true })
                    .webp({ quality: 80 })
                    .toFile(cale);
                const previzualizare = path.join(directorIncarcare, 'thumb_' + nume);
                await sharp(fisier.buffer).resize(300, 200, { fit: 'cover' }).webp({ quality: 70 }).toFile(previzualizare);
                const rel = '/fisiere_uploadate/pachete/' + nume;
                const ins = await bd.interogheaza(
                    `INSERT INTO pachet_imagini (pachet_id, cale, ordine, alt_text)
                     VALUES ($1,$2,$3,$4) RETURNING *`,
                    [req.params.id, rel, i, req.body.alt_text || fisier.originalname]
                );
                saved.push(ins.rows[0]);
            }
            if (saved[0]) {
                await bd.interogheaza('UPDATE pachete_turism SET imagine=$1 WHERE id=$2 AND (imagine IS NULL OR imagine=\'\')', [
                    saved[0].cale,
                    req.params.id,
                ]);
            }
            res.json({ ok: true, imagini: saved });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: e.message });
        }
    }
);

router.delete('/api/pachete/:id/imagini/:imagineId', necesitaAutentificare, necesitaRol('administrator', 'angajat'), async (req, res) => {
    const rez = await bd.interogheaza(
        'DELETE FROM pachet_imagini WHERE id=$1 AND pachet_id=$2 RETURNING cale',
        [req.params.imagineId, req.params.id]
    );
    if (!rez.rows.length) return res.status(404).json({ error: 'Imagine inexistentă' });

    const fisier = path.join(__dirname, '..', '..', rez.rows[0].cale.replace(/^\//, ''));
    const thumb = path.join(path.dirname(fisier), 'thumb_' + path.basename(fisier));
    for (const caleFisier of [fisier, thumb]) {
        if (fs.existsSync(caleFisier)) fs.unlinkSync(caleFisier);
    }
    res.json({ ok: true });
});

router.get('/api/pachete/:id/perioade', necesitaAutentificare, necesitaRol('administrator', 'angajat'), async (req, res) => {
    const rez = await bd.interogheaza(
        'SELECT * FROM perioade_disponibile WHERE pachet_id=$1 ORDER BY data_start DESC, id DESC',
        [req.params.id]
    );
    res.json(rez.rows);
});

router.post('/api/pachete/:id/perioade', necesitaAutentificare, necesitaRol('administrator', 'angajat'), async (req, res) => {
    const { data_start, data_end, locuri, pret_special } = req.body;
    const rez = await bd.interogheaza(
        `INSERT INTO perioade_disponibile (pachet_id, data_start, data_end, locuri, pret_special)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.params.id, data_start, data_end, locuri || 20, pret_special || null]
    );
    res.json(rez.rows[0]);
});

router.put('/api/pachete/:id/perioade/:perioadaId', necesitaAutentificare, necesitaRol('administrator', 'angajat'), async (req, res) => {
    const { data_start, data_end, locuri, pret_special } = req.body;
    const rez = await bd.interogheaza(
        `UPDATE perioade_disponibile
         SET data_start=$1, data_end=$2, locuri=$3, pret_special=$4
         WHERE id=$5 AND pachet_id=$6 RETURNING *`,
        [data_start, data_end, locuri || 20, pret_special || null, req.params.perioadaId, req.params.id]
    );
    if (!rez.rows.length) return res.status(404).json({ error: 'Perioadă inexistentă' });
    res.json(rez.rows[0]);
});

router.delete('/api/pachete/:id/perioade/:perioadaId', necesitaAutentificare, necesitaRol('administrator', 'angajat'), async (req, res) => {
    const rez = await bd.interogheaza(
        'DELETE FROM perioade_disponibile WHERE id=$1 AND pachet_id=$2 RETURNING id',
        [req.params.perioadaId, req.params.id]
    );
    if (!rez.rows.length) return res.status(404).json({ error: 'Perioadă inexistentă' });
    res.json({ ok: true });
});

module.exports = router;
