const express = require('express');
const bd = require('../services/baza_de_date');
const { necesitaAutentificare, necesitaRol } = require('../middleware/autentificare');
const recompense = require('../services/recompense_calatorie');

const router = express.Router();

router.get('/rewards', necesitaAutentificare, async (req, res) => {
    try {
        await recompense.ensureSchema();
        const profile = await recompense.getProfile(req.user.id);
        const wheel = await recompense.getActiveRewards();
        const history = await recompense.getHistory(req.user.id);
        const stats = await recompense.getUserStatistics(req.user.id);
        res.render('pagini/rewards', {
            profile,
            wheel,
            history,
            stats,
        });
    } catch (e) {
        console.error('[recompense page]', e);
        const hint = /owner|permission denied/i.test(e.message || '')
            ? 'Tabelele Rewards există, dar nu aparțin userului vlad1. Rulează o singură dată ca postgres: sql/fix-rewards-owner-vlad1.sql — apoi folosești doar vlad1.'
            : 'Nu s-a putut încărca Travel Rewards. Rulează sql/gamification.sql (ca vlad1) sau sql/fix-rewards-owner-vlad1.sql (ca postgres, o singură dată).';
        res.status(500).render('pagini/eroare', {
            titlu: 'Eroare',
            text: hint,
            imagine: '/resurse/imagini/erori/interzis.png',
        });
    }
});

router.get('/api/rewards', necesitaAutentificare, async (req, res) => {
    try {
        res.json(await recompense.getActiveRewards());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/rewards/my', necesitaAutentificare, async (req, res) => {
    try {
        const profile = await recompense.getProfile(req.user.id);
        res.json(profile);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/spin/status', necesitaAutentificare, async (req, res) => {
    try {
        res.json(await recompense.getSpinStatus(req.user.id));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/spin', necesitaAutentificare, async (req, res) => {
    try {
        const result = await recompense.spinWheel(req.user.id);
        if (result.error) return res.status(result.code || 400).json({ error: result.error });
        res.json(result);
    } catch (e) {
        console.error('[spin]', e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/quiz/random', necesitaAutentificare, async (req, res) => {
    try {
        await recompense.ensureSchema();
        const q = await recompense.pickQuestion(req.user.id);
        if (!q) return res.status(404).json({ error: 'Nicio întrebare disponibilă' });
        res.json(recompense.publicQuestion(q));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/quiz/answer', necesitaAutentificare, async (req, res) => {
    try {
        const playId = parseInt(req.body.playId || req.body.play_id, 10);
        const answer = req.body.answer || req.body.raspuns;
        if (!playId) return res.status(400).json({ error: 'playId obligatoriu' });
        const result = await recompense.answerQuiz(req.user.id, playId, answer);
        if (result.error) return res.status(result.code || 400).json({ error: result.error });
        res.json(result);
    } catch (e) {
        console.error('[quiz answer]', e);
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/rewards/history', necesitaAutentificare, async (req, res) => {
    try {
        res.json(await recompense.getHistory(req.user.id));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/rewards/statistics', necesitaAutentificare, async (req, res) => {
    try {
        res.json(await recompense.getUserStatistics(req.user.id));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/admin/rewards', necesitaAutentificare, necesitaRol('administrator'), async (req, res) => {
    try {
        await recompense.ensureSchema();
        const rez = await bd.interogheaza('SELECT * FROM rewards ORDER BY id');
        res.json(rez.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/admin/rewards', necesitaAutentificare, necesitaRol('administrator'), async (req, res) => {
    try {
        await recompense.ensureSchema();
        const b = req.body;
        const rez = await bd.interogheaza(
            `INSERT INTO rewards (nume, descriere, tip, valoare, probabilitate, culoare, iconita, activ)
             VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,TRUE)) RETURNING *`,
            [
                b.nume,
                b.descriere || null,
                b.tip,
                b.valoare ?? 0,
                b.probabilitate ?? 10,
                b.culoare || '#0f68b1',
                b.iconita || 'gift',
                typeof b.activ === 'boolean' ? b.activ : true,
            ]
        );
        res.json(rez.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/api/admin/rewards/:id', necesitaAutentificare, necesitaRol('administrator'), async (req, res) => {
    try {
        const b = req.body;
        const rez = await bd.interogheaza(
            `UPDATE rewards SET
               nume=$1, descriere=$2, tip=$3, valoare=$4, probabilitate=$5,
               culoare=$6, iconita=$7, activ=COALESCE($8, activ)
             WHERE id=$9 RETURNING *`,
            [
                b.nume,
                b.descriere || null,
                b.tip,
                b.valoare ?? 0,
                b.probabilitate ?? 10,
                b.culoare || '#0f68b1',
                b.iconita || 'gift',
                typeof b.activ === 'boolean' ? b.activ : null,
                req.params.id,
            ]
        );
        if (!rez.rows.length) return res.status(404).json({ error: 'Recompensă inexistentă' });
        res.json(rez.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/api/admin/rewards/:id', necesitaAutentificare, necesitaRol('administrator'), async (req, res) => {
    try {
        await bd.interogheaza(`UPDATE rewards SET activ=FALSE WHERE id=$1`, [req.params.id]);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/admin/quiz', necesitaAutentificare, necesitaRol('administrator'), async (req, res) => {
    try {
        await recompense.ensureSchema();
        const params = [];
        let where = ' WHERE TRUE';
        if (req.query.categorie) {
            params.push(req.query.categorie);
            where += ` AND categorie=$${params.length}`;
        }
        if (req.query.dificultate) {
            params.push(req.query.dificultate);
            where += ` AND dificultate=$${params.length}`;
        }
        const rez = await bd.interogheaza(`SELECT * FROM quiz_questions ${where} ORDER BY id DESC`, params);
        res.json(rez.rows);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/api/admin/quiz', necesitaAutentificare, necesitaRol('administrator'), async (req, res) => {
    try {
        await recompense.ensureSchema();
        const b = req.body;
        const corect = String(b.raspuns_corect || '').toUpperCase();
        if (!['A', 'B', 'C', 'D'].includes(corect)) {
            return res.status(400).json({ error: 'raspuns_corect trebuie A/B/C/D' });
        }
        const rez = await bd.interogheaza(
            `INSERT INTO quiz_questions
             (intrebare, optiune_a, optiune_b, optiune_c, optiune_d, raspuns_corect, categorie, dificultate, explicatie, activ)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,TRUE)) RETURNING *`,
            [
                b.intrebare,
                b.optiune_a,
                b.optiune_b,
                b.optiune_c,
                b.optiune_d,
                corect,
                b.categorie || 'Tourism',
                b.dificultate || 'Easy',
                b.explicatie || null,
                typeof b.activ === 'boolean' ? b.activ : true,
            ]
        );
        res.json(rez.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/api/admin/quiz/:id', necesitaAutentificare, necesitaRol('administrator'), async (req, res) => {
    try {
        const b = req.body;
        const corect = String(b.raspuns_corect || '').toUpperCase();
        const rez = await bd.interogheaza(
            `UPDATE quiz_questions SET
               intrebare=$1, optiune_a=$2, optiune_b=$3, optiune_c=$4, optiune_d=$5,
               raspuns_corect=$6, categorie=$7, dificultate=$8, explicatie=$9,
               activ=COALESCE($10, activ)
             WHERE id=$11 RETURNING *`,
            [
                b.intrebare,
                b.optiune_a,
                b.optiune_b,
                b.optiune_c,
                b.optiune_d,
                corect,
                b.categorie || 'Tourism',
                b.dificultate || 'Easy',
                b.explicatie || null,
                typeof b.activ === 'boolean' ? b.activ : null,
                req.params.id,
            ]
        );
        if (!rez.rows.length) return res.status(404).json({ error: 'Întrebare inexistentă' });
        res.json(rez.rows[0]);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/api/admin/quiz/:id', necesitaAutentificare, necesitaRol('administrator'), async (req, res) => {
    try {
        await bd.interogheaza(`UPDATE quiz_questions SET activ=FALSE WHERE id=$1`, [req.params.id]);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/api/admin/gamification/stats', necesitaAutentificare, necesitaRol('administrator'), async (req, res) => {
    try {
        res.json(await recompense.getAdminStatistics());
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
