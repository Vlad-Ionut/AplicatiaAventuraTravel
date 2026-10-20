const express = require('express');
const bcrypt = require('bcryptjs');
const bd = require('../services/baza_de_date');
const {
    semneazaToken,
    seteazaCookieAutentificare,
    stergeCookieAutentificare,
    necesitaAutentificare,
} = require('../middleware/autentificare');

const router = express.Router();

router.get('/login', (req, res) => {
    if (req.user) return res.redirect('/');
    res.render('pagini/login', {
        eroare: null,
        redirect: req.query.redirect || '/',
    });
});

router.get('/register', (req, res) => {
    if (req.user) return res.redirect('/');
    res.render('pagini/register', { eroare: null });
});

router.post('/api/auth/register', async (req, res) => {
    try {
        const { nume, email, parola, telefon } = req.body;
        if (!nume || !email || !parola || parola.length < 6) {
            return res.status(400).json({ error: 'Completează toate câmpurile (parolă min. 6 caractere).' });
        }
        const exista = await bd.interogheaza('SELECT id FROM utilizatori WHERE email=$1', [email.toLowerCase()]);
        if (exista.rows.length) {
            return res.status(400).json({ error: 'Email-ul este deja înregistrat.' });
        }
        const hashParola = await bcrypt.hash(parola, 10);
        const rez = await bd.interogheaza(
            `INSERT INTO utilizatori (nume, email, parola_hash, telefon, rol)
             VALUES ($1, $2, $3, $4, 'client') RETURNING id, nume, email, rol`,
            [nume.trim(), email.toLowerCase().trim(), hashParola, telefon || null]
        );
        const utilizator = rez.rows[0];
        const jeton = semneazaToken(utilizator);
        seteazaCookieAutentificare(res, jeton);
        res.json({ ok: true, user: utilizator, token: jeton });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Eroare la înregistrare.' });
    }
});

router.post('/api/auth/login', async (req, res) => {
    try {
        const { email, parola } = req.body;
        const emailNormalizat = (email || '').toLowerCase().trim();
        if (!emailNormalizat || !parola) {
            return res.status(400).json({ error: 'Completează emailul și parola.' });
        }

        let rez;
        try {
            rez = await bd.interogheaza(
                'SELECT * FROM utilizatori WHERE email=$1 AND COALESCE(activ, TRUE)=TRUE',
                [emailNormalizat]
            );
        } catch (_) {
            rez = await bd.interogheaza('SELECT * FROM utilizatori WHERE email=$1', [emailNormalizat]);
        }

        const utilizator = rez.rows[0];
        if (!utilizator) {
            return res.status(401).json({ error: 'Email sau parolă greșită. Rulează seed-ul sau creează un cont nou.' });
        }
        if (utilizator.activ === false) {
            return res.status(401).json({ error: 'Contul este dezactivat.' });
        }
        if (!(await bcrypt.compare(parola || '', utilizator.parola_hash))) {
            return res.status(401).json({ error: 'Email sau parolă greșită.' });
        }

        const jeton = semneazaToken(utilizator);
        seteazaCookieAutentificare(res, jeton);
        res.json({
            ok: true,
            user: { id: utilizator.id, nume: utilizator.nume, email: utilizator.email, rol: utilizator.rol },
            token: jeton,
        });
    } catch (e) {
        console.error('[login]', e);
        res.status(500).json({ error: 'Eroare la autentificare. Verifică dacă tabela utilizatori există în PostgreSQL.' });
    }
});

router.post('/api/auth/logout', (req, res) => {
    stergeCookieAutentificare(res);
    res.json({ ok: true });
});

router.get('/api/auth/me', necesitaAutentificare, (req, res) => {
    res.json({ user: req.user });
});

router.get('/logout', (req, res) => {
    stergeCookieAutentificare(res);
    res.redirect('/');
});

module.exports = router;
