const jwt = require('jsonwebtoken');
const bd = require('../services/baza_de_date');

const SECRET_JWT = process.env.JWT_SECRET || 'aventura-travel-secret-dev-2026';
const NUME_COOKIE = 'aventura_token';

function semneazaToken(utilizator) {
    return jwt.sign(
        { id: utilizator.id, email: utilizator.email, rol: utilizator.rol, nume: utilizator.nume },
        SECRET_JWT,
        { expiresIn: '7d' }
    );
}

function seteazaCookieAutentificare(res, jeton) {
    res.cookie(NUME_COOKIE, jeton, {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'lax',
    });
}

function stergeCookieAutentificare(res) {
    res.clearCookie(NUME_COOKIE);
}

async function ataseazaUtilizator(req, res, next) {
    req.user = null;
    res.locals.user = null;
    try {
        const jeton = req.cookies?.[NUME_COOKIE] || extrageBearer(req);
        if (jeton) {
            const dateJeton = jwt.verify(jeton, SECRET_JWT);
            let rezultat;
            try {
                rezultat = await bd.interogheaza(
                    'SELECT id, nume, email, rol, telefon, activ FROM utilizatori WHERE id=$1',
                    [dateJeton.id]
                );
            } catch (_) {
                rezultat = await bd.interogheaza(
                    'SELECT id, nume, email, rol, telefon FROM utilizatori WHERE id=$1',
                    [dateJeton.id]
                );
            }
            const utilizator = rezultat.rows[0];
            if (utilizator && utilizator.activ !== false) {
                req.user = utilizator;
                res.locals.user = req.user;
            }
        }
    } catch (e) {
    }
    next();
}

function extrageBearer(req) {
    const antet = req.headers.authorization;
    if (antet && antet.startsWith('Bearer ')) return antet.slice(7);
    return null;
}

function necesitaAutentificare(req, res, next) {
    if (!req.user) {
        if (req.xhr || req.headers.accept?.includes('application/json')) {
            return res.status(401).json({ error: 'Autentificare necesară' });
        }
        return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
    }
    next();
}

function necesitaRol(...roluri) {
    return (req, res, next) => {
        if (!req.user) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(401).json({ error: 'Autentificare necesară' });
            }
            return res.redirect('/login');
        }
        if (!roluri.includes(req.user.rol)) {
            if (req.xhr || req.headers.accept?.includes('application/json')) {
                return res.status(403).json({ error: 'Acces interzis' });
            }
            return res.status(403).render('pagini/eroare', {
                titlu: 'Acces interzis',
                text: 'Nu ai dreptul să accesezi această pagină.',
                imagine: '/resurse/imagini/erori/interzis.png',
            });
        }
        next();
    };
}

module.exports = {
    SECRET_JWT,
    JWT_SECRET: SECRET_JWT,
    NUME_COOKIE,
    COOKIE_NAME: NUME_COOKIE,
    semneazaToken,
    seteazaCookieAutentificare,
    stergeCookieAutentificare,
    ataseazaUtilizator,
    necesitaAutentificare,
    necesitaRol,
    signToken: semneazaToken,
    setAuthCookie: seteazaCookieAutentificare,
    clearAuthCookie: stergeCookieAutentificare,
    attachUser: ataseazaUtilizator,
    requireAuth: necesitaAutentificare,
    requireRole: necesitaRol,
};
