const express = require('express');
const bd = require('../services/baza_de_date');
const { necesitaAutentificare, necesitaRol } = require('../middleware/autentificare');
const { notificaUtilizator } = require('../services/notificari_email');
const { acordaRotirePentruRezervare } = require('../services/recompense_calatorie');

const router = express.Router();

router.get('/admin', necesitaAutentificare, necesitaRol('administrator', 'angajat'), async (req, res) => {
    res.render('pagini/admin', { sectiune: req.query.sectiune || 'dashboard' });
});

router.get('/api/admin/stats', necesitaAutentificare, necesitaRol('administrator', 'angajat'), async (req, res) => {
    try {
        const clienti = await bd.interogheaza(`SELECT COUNT(*)::int AS n FROM utilizatori WHERE rol='client'`);
        const pachete = await bd.interogheaza(`SELECT COUNT(*)::int AS n FROM pachete_turism WHERE activ=TRUE`);
        const rezervari = await bd.interogheaza(`SELECT COUNT(*)::int AS n FROM rezervari`);
        const venituri = await bd.interogheaza(
            `SELECT COALESCE(SUM(suma),0)::float AS total FROM plati WHERE status='reusita'`
        );
        const peLuna = await bd.interogheaza(
            `SELECT TO_CHAR(data_creare, 'YYYY-MM') AS luna, COUNT(*)::int AS nr
             FROM rezervari
             WHERE data_creare >= CURRENT_DATE - INTERVAL '12 months'
             GROUP BY 1 ORDER BY 1`
        );
        const venituriLuna = await bd.interogheaza(
            `SELECT TO_CHAR(data_plata, 'YYYY-MM') AS luna, COALESCE(SUM(suma),0)::float AS total
             FROM plati WHERE status='reusita' AND data_plata >= CURRENT_DATE - INTERVAL '12 months'
             GROUP BY 1 ORDER BY 1`
        );
        const populare = await bd.interogheaza(
            `SELECT p.destinatie, COUNT(r.id)::int AS nr
             FROM rezervari r JOIN pachete_turism p ON p.id=r.pachet_id
             WHERE r.status IN ('confirmata','finalizata','pending')
             GROUP BY p.destinatie ORDER BY nr DESC LIMIT 8`
        );
        const peStatus = await bd.interogheaza(
            `SELECT status::text, COUNT(*)::int AS nr FROM rezervari GROUP BY status`
        );

        res.json({
            clienti: clienti.rows[0].n,
            pachete: pachete.rows[0].n,
            rezervari: rezervari.rows[0].n,
            venituri: venituri.rows[0].total,
            rezervariPeLuna: peLuna.rows,
            venituriPeLuna: venituriLuna.rows,
            destinatiiPopulare: populare.rows,
            peStatus: peStatus.rows,
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/admin/utilizatori', necesitaAutentificare, necesitaRol('administrator'), async (req, res) => {
    const rez = await bd.interogheaza(
        `SELECT id, nume, email, rol, telefon, activ, data_creare FROM utilizatori ORDER BY id`
    );
    res.json(rez.rows);
});

router.patch('/api/admin/utilizatori/:id', necesitaAutentificare, necesitaRol('administrator'), async (req, res) => {
    const { rol, activ } = req.body;
    const rez = await bd.interogheaza(
        `UPDATE utilizatori SET
           rol = COALESCE($1::rol_utilizator, rol),
           activ = COALESCE($2, activ)
         WHERE id=$3
         RETURNING id, nume, email, rol, activ`,
        [rol || null, typeof activ === 'boolean' ? activ : null, req.params.id]
    );
    res.json(rez.rows[0]);
});

router.get('/api/admin/rezervari', necesitaAutentificare, necesitaRol('administrator', 'angajat'), async (req, res) => {
    const rez = await bd.interogheaza(
        `SELECT r.*, u.nume AS client, u.email, p.destinatie
         FROM rezervari r
         JOIN utilizatori u ON u.id=r.utilizator_id
         JOIN pachete_turism p ON p.id=r.pachet_id
         ORDER BY r.data_creare DESC
         LIMIT 200`
    );
    res.json(rez.rows);
});

router.patch('/api/admin/rezervari/:id', necesitaAutentificare, necesitaRol('administrator', 'angajat'), async (req, res) => {
    const { status } = req.body;
    const rez = await bd.interogheaza(
        `UPDATE rezervari SET status=$1::status_rezervare WHERE id=$2 RETURNING *`,
        [status, req.params.id]
    );
    if (rez.rows[0]) {
        if (status === 'confirmata') {
            try {
                await acordaRotirePentruRezervare(rez.rows[0].id);
            } catch (e) {
            console.warn('[recompense] acordarea rotirii a eșuat:', e.message);
            }
        }
        await notificaUtilizator(
            rez.rows[0].utilizator_id,
            'status_rezervare',
            'Actualizare rezervare',
            `Rezervarea #${rez.rows[0].id} are acum statusul: ${status}.`
        );
    }
    res.json(rez.rows[0]);
});

router.get('/api/admin/raport', necesitaAutentificare, necesitaRol('administrator'), async (req, res) => {
    const rez = await bd.interogheaza(
        `SELECT p.destinatie, p.tip_turism, p.tara,
                COUNT(r.id)::int AS nr_rezervari,
                COALESCE(SUM(CASE WHEN pl.status='reusita' THEN pl.suma END),0)::float AS venituri,
                COALESCE(AVG(rec.rating),0)::float AS rating
         FROM pachete_turism p
         LEFT JOIN rezervari r ON r.pachet_id=p.id
         LEFT JOIN plati pl ON pl.rezervare_id=r.id
         LEFT JOIN recenzii rec ON rec.pachet_id=p.id AND rec.status='aprobata'
         GROUP BY p.id
         ORDER BY venituri DESC`
    );
    res.json(rez.rows);
});

router.get('/api/admin/recenzii', necesitaAutentificare, necesitaRol('administrator', 'angajat'), async (req, res) => {
    const rez = await bd.interogheaza(
        `SELECT r.*, u.nume, p.destinatie
         FROM recenzii r
         JOIN utilizatori u ON u.id=r.utilizator_id
         JOIN pachete_turism p ON p.id=r.pachet_id
         ORDER BY r.data_creare DESC`
    );
    res.json(rez.rows);
});

router.patch('/api/admin/recenzii/:id', necesitaAutentificare, necesitaRol('administrator', 'angajat'), async (req, res) => {
    const rez = await bd.interogheaza(
        `UPDATE recenzii SET status=$1::status_recenzie WHERE id=$2 RETURNING *`,
        [req.body.status, req.params.id]
    );
    res.json(rez.rows[0]);
});

router.post('/api/admin/promotii', necesitaAutentificare, necesitaRol('administrator'), async (req, res) => {
    try {
        const subiect = (req.body.subiect || '').trim();
        const mesaj = (req.body.mesaj || '').trim();
        if (!subiect || !mesaj) {
            return res.status(400).json({ error: 'Subiectul și mesajul sunt obligatorii.' });
        }

        const clienti = await bd.interogheaza(
            `SELECT id FROM utilizatori WHERE rol='client' AND activ=TRUE ORDER BY id`
        );
        for (const client of clienti.rows) {
            await notificaUtilizator(client.id, 'promotie', subiect, mesaj, true);
        }

        res.json({ ok: true, trimise: clienti.rows.length });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
