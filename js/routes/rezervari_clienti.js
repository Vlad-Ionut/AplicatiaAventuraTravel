const express = require('express');
const bd = require('../services/baza_de_date');
const { necesitaAutentificare } = require('../middleware/autentificare');
const { notificaUtilizator } = require('../services/notificari_email');
const { proceseazaPlata } = require('../services/procesare_plati');

const router = express.Router();

router.get('/api/rezervari/disponibilitate', async (req, res) => {
    try {
        const { pachet_id, perioada_id, persoane } = req.query;
        const nr = parseInt(persoane || '1', 10);
        if (perioada_id) {
            const p = await bd.interogheaza('SELECT * FROM perioade_disponibile WHERE id=$1', [perioada_id]);
            if (!p.rows.length) return res.json({ disponibil: false, motiv: 'Perioadă invalidă' });
            const ok = p.rows[0].locuri >= nr;
            return res.json({
                disponibil: ok,
                locuri: p.rows[0].locuri,
                motiv: ok ? null : 'Locuri insuficiente',
            });
        }
        const pachet = await bd.interogheaza('SELECT locuri_disponibile FROM pachete_turism WHERE id=$1', [pachet_id]);
        if (!pachet.rows.length) return res.json({ disponibil: false });
        const ok = pachet.rows[0].locuri_disponibile >= nr;
        res.json({ disponibil: ok, locuri: pachet.rows[0].locuri_disponibile });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/rezervari', necesitaAutentificare, async (req, res) => {
    const client = await bd.conexiune.connect();
    try {
        const { pachet_id, perioada_id, numar_persoane, note } = req.body;
        const nr = parseInt(numar_persoane || 1, 10);
        if (nr < 1) return res.status(400).json({ error: 'Număr persoane invalid' });

        await client.query('BEGIN');
        const pachet = await client.query('SELECT * FROM pachete_turism WHERE id=$1 AND activ=TRUE FOR UPDATE', [
            pachet_id,
        ]);
        if (!pachet.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Pachet inexistent' });
        }
        const datePachet = pachet.rows[0];
        let perioada = null;
        let pretUnitar = parseFloat(datePachet.pret) * (1 - (parseFloat(datePachet.reducere_procent) || 0) / 100);

        if (perioada_id) {
            const pr = await client.query(
                'SELECT * FROM perioade_disponibile WHERE id=$1 AND pachet_id=$2 FOR UPDATE',
                [perioada_id, pachet_id]
            );
            if (!pr.rows.length || pr.rows[0].locuri < nr) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Perioadă indisponibilă sau locuri insuficiente' });
            }
            perioada = pr.rows[0];
            if (perioada.pret_special) pretUnitar = parseFloat(perioada.pret_special);
        } else if (datePachet.locuri_disponibile < nr) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Locuri insuficiente' });
        }

        const pretTotal = Math.round(pretUnitar * nr * 100) / 100;
        const rez = await client.query(
            `INSERT INTO rezervari
             (utilizator_id, pachet_id, perioada_id, numar_persoane, data_start, data_end, pret_total, status, note)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8) RETURNING *`,
            [
                req.user.id,
                pachet_id,
                perioada_id || null,
                nr,
                perioada?.data_start || null,
                perioada?.data_end || null,
                pretTotal,
                note || null,
            ]
        );

        if (perioada) {
            await client.query('UPDATE perioade_disponibile SET locuri = locuri - $1 WHERE id=$2', [
                nr,
                perioada.id,
            ]);
        }
        await client.query(
            'UPDATE pachete_turism SET locuri_disponibile = GREATEST(0, locuri_disponibile - $1) WHERE id=$2',
            [nr, pachet_id]
        );

        await client.query('COMMIT');
        const rezervare = rez.rows[0];

        await notificaUtilizator(
            req.user.id,
            'rezervare_creata',
            'Rezervare creată — Aventura Travel',
            `Rezervarea #${rezervare.id} pentru ${datePachet.destinatie} a fost creată. Total: ${pretTotal} RON. Finalizează plata pentru confirmare.`
        );

        res.json({ ok: true, rezervare });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

router.get('/api/rezervari/mele', necesitaAutentificare, async (req, res) => {
    const rez = await bd.interogheaza(
        `SELECT r.*, p.destinatie, p.imagine, p.tip_turism,
                (SELECT status FROM plati WHERE rezervare_id=r.id ORDER BY id DESC LIMIT 1) AS status_plata
         FROM rezervari r
         JOIN pachete_turism p ON p.id=r.pachet_id
         WHERE r.utilizator_id=$1
         ORDER BY r.data_creare DESC`,
        [req.user.id]
    );
    res.json(rez.rows);
});

router.post('/api/rezervari/:id/anulare', necesitaAutentificare, async (req, res) => {
    try {
        const rez = await bd.interogheaza('SELECT * FROM rezervari WHERE id=$1', [req.params.id]);
        if (!rez.rows.length) return res.status(404).json({ error: 'Rezervare inexistentă' });
        const r = rez.rows[0];
        if (r.utilizator_id !== req.user.id && !['administrator', 'angajat'].includes(req.user.rol)) {
            return res.status(403).json({ error: 'Acces interzis' });
        }
        if (!['pending', 'confirmata'].includes(r.status)) {
            return res.status(400).json({ error: 'Rezervarea nu poate fi anulată' });
        }

        await bd.interogheaza(
            `UPDATE rezervari SET status='anulata', data_anulare=CURRENT_TIMESTAMP WHERE id=$1`,
            [r.id]
        );
        if (r.perioada_id) {
            await bd.interogheaza('UPDATE perioade_disponibile SET locuri = locuri + $1 WHERE id=$2', [
                r.numar_persoane,
                r.perioada_id,
            ]);
        }
        await bd.interogheaza('UPDATE pachete_turism SET locuri_disponibile = locuri_disponibile + $1 WHERE id=$2', [
            r.numar_persoane,
            r.pachet_id,
        ]);

        const datePachet = await bd.interogheaza('SELECT destinatie FROM pachete_turism WHERE id=$1', [r.pachet_id]);
        await notificaUtilizator(
            r.utilizator_id,
            'rezervare_anulata',
            'Rezervare anulată — Aventura Travel',
            `Rezervarea #${r.id} pentru ${datePachet.rows[0]?.destinatie || 'pachet'} a fost anulată.`
        );

        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/plati', necesitaAutentificare, async (req, res) => {
    try {
        const { rezervare_id, metoda, card } = req.body;
        const rez = await bd.interogheaza('SELECT * FROM rezervari WHERE id=$1', [rezervare_id]);
        if (!rez.rows.length) return res.status(404).json({ error: 'Rezervare inexistentă' });
        const r = rez.rows[0];
        if (r.utilizator_id !== req.user.id) return res.status(403).json({ error: 'Acces interzis' });
        if (r.status === 'anulata') return res.status(400).json({ error: 'Rezervare anulată' });

        const plata = await proceseazaPlata({
            rezervareId: r.id,
            suma: r.pret_total,
            metoda: metoda || 'simulat',
            infoCard: card || {},
        });

        if (plata.status === 'reusita') {
            const datePachet = await bd.interogheaza('SELECT destinatie FROM pachete_turism WHERE id=$1', [r.pachet_id]);
            await notificaUtilizator(
                req.user.id,
                'rezervare_confirmata',
                'Rezervare confirmată — Aventura Travel',
                `Plata pentru rezervarea #${r.id} (${datePachet.rows[0]?.destinatie}) a reușit. Referință: ${plata.referinta}. Mulțumim!`
            );
        }

        res.json({ ok: plata.status === 'reusita', plata });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/rezervarile-mele', necesitaAutentificare, async (req, res) => {
    const rez = await bd.interogheaza(
        `SELECT r.*, p.destinatie, p.imagine, p.tip_turism,
                (SELECT json_build_object('status', status, 'referinta', referinta, 'metoda', metoda)
                 FROM plati WHERE rezervare_id=r.id ORDER BY id DESC LIMIT 1) AS plata
         FROM rezervari r
         JOIN pachete_turism p ON p.id=r.pachet_id
         WHERE r.utilizator_id=$1
         ORDER BY r.data_creare DESC`,
        [req.user.id]
    );
    res.render('pagini/rezervari', { rezervari: rez.rows });
});

router.get('/plata/:rezervareId', necesitaAutentificare, async (req, res) => {
    const rez = await bd.interogheaza(
        `SELECT r.*, p.destinatie FROM rezervari r
         JOIN pachete_turism p ON p.id=r.pachet_id
         WHERE r.id=$1 AND r.utilizator_id=$2`,
        [req.params.rezervareId, req.user.id]
    );
    if (!rez.rows.length) return res.redirect('/rezervarile-mele');
    res.render('pagini/plata', { rezervare: rez.rows[0] });
});

module.exports = router;
