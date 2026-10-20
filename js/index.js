const path = require('path');
const radacinaProiect = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(radacinaProiect, '.env') });
const express = require('express');
const sharp = require('sharp');
const fs = require('fs');
const sass = require('sass');
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');

const { ataseazaUtilizator } = require('./middleware/autentificare');
const bd = require('./services/baza_de_date');
const ruteAutentificare = require('./routes/autentificare_conturi');
const rutePachete = require('./routes/pachete_turistice');
const ruteRezervari = require('./routes/rezervari_clienti');
const ruteAdmin = require('./routes/panou_admin');
const ruteFunctionalitati = require('./routes/pagini_interactive');
const ruteRecompense = require('./routes/recompense_joc');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(radacinaProiect, 'views'));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(methodOverride('_method'));
app.use(ataseazaUtilizator);

const obGlobal = {
    obErori: null,
    obImagini: null,
    folderScss: path.join(radacinaProiect, 'resurse/scss'),
    folderCss: path.join(radacinaProiect, 'resurse/css'),
};

for (const folder of ['temp', 'logs', 'fisiere_uploadate', 'fisiere_uploadate/pachete']) {
    const caleFolder = path.join(radacinaProiect, folder);
    if (!fs.existsSync(caleFolder)) fs.mkdirSync(caleFolder, { recursive: true });
}

const fisiereJsClient = new Set([
    'tema.js', 'administrare.js', 'asistent.js', 'cautare.js',
    'harta.js', 'produse.js', 'recompense.js',
]);
function trimiteJsClient(req, res, next) {
    const nume = path.basename(req.params.fisier || '');
    if (!fisiereJsClient.has(nume)) return next();
    res.type('application/javascript');
    res.sendFile(path.join(__dirname, nume));
}
app.get('/js/:fisier', trimiteJsClient);

app.use('/resurse', express.static(path.join(radacinaProiect, 'resurse')));
app.use('/dist', express.static(path.join(radacinaProiect, 'node_modules/bootstrap/dist')));
app.use('/fisiere_uploadate', express.static(path.join(radacinaProiect, 'fisiere_uploadate')));
app.use('/vendor/chart.js', express.static(path.join(radacinaProiect, 'node_modules/chart.js/dist')));

app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(radacinaProiect, 'resurse/imagini/favicon/favicon.ico'));
});

app.use(ruteAutentificare);
app.use(rutePachete);
app.use(ruteRezervari);
app.use(ruteAdmin);
app.use(ruteFunctionalitati);
app.use(ruteRecompense);

function filtreazaImaginiDupaOra(oraCurenta) {
    if (!obGlobal.obImagini || !Array.isArray(obGlobal.obImagini.imagini)) return [];
    const rezultat = [];
    for (const imag of obGlobal.obImagini.imagini) {
        if (!Array.isArray(imag.intervale_ore)) continue;
        let afiseaza = false;
        for (const interval of imag.intervale_ore) {
            if (!Array.isArray(interval) || interval.length !== 2) continue;
            if (oraCurenta >= interval[0] && oraCurenta <= interval[1]) {
                afiseaza = true;
                break;
            }
        }
        if (afiseaza) rezultat.push(imag);
    }
    return rezultat;
}

app.get(['/', '/index', '/home'], async (req, res) => {
    const oraCurenta = new Date().getHours();
    let pacheteRecomandate = [];
    let destinatiiPopulare = [];
    let puncteHarta = [];

    try {
        const pachete = await bd.interogheaza(
            `SELECT p.*,
                    COALESCE(AVG(r.rating), 0)::float AS rating,
                    COUNT(r.id)::int AS total_recenzii
             FROM pachete_turism p
             LEFT JOIN recenzii r ON r.pachet_id=p.id AND r.status='aprobata'
             WHERE p.activ=TRUE
             GROUP BY p.id
             ORDER BY p.reducere_procent DESC, rating DESC, p.data_adaugare DESC
             LIMIT 6`
        );
        pacheteRecomandate = pachete.rows;

        const destinatii = await bd.interogheaza(
            `SELECT DISTINCT ON (destinatie) id, destinatie, tara, oras, descriere, imagine, tip_turism
             FROM pachete_turism
             WHERE activ=TRUE
             ORDER BY destinatie, reducere_procent DESC, data_adaugare DESC
             LIMIT 4`
        );
        destinatiiPopulare = destinatii.rows;

        const harta = await bd.interogheaza(
            `SELECT id, destinatie, hotel_nume, latitudine, longitudine
             FROM pachete_turism
             WHERE activ=TRUE AND latitudine IS NOT NULL AND longitudine IS NOT NULL
             LIMIT 12`
        );
        puncteHarta = harta.rows;
    } catch (e) {
        console.warn('[HOME]', e.message);
    }

    res.render('pagini/index', {
        ip: req.ip,
        imagini: filtreazaImaginiDupaOra(oraCurenta).slice(0, 6),
        pacheteRecomandate,
        destinatiiPopulare,
        puncteHarta,
    });
});

function verificaProprietatiDuplicateJson(continut) {
    const stiva = [];
    for (let i = 0; i < continut.length; i++) {
        const ch = continut[i];
        if (ch === '{') stiva.push(i);
        else if (ch === '}') {
            const start = stiva.pop();
            if (start !== undefined) {
                const objStr = continut.slice(start, i + 1);
                const reProp = /"([^"\\]+)"\s*:/g;
                const vazute = {};
                let m;
                while ((m = reProp.exec(objStr))) {
                    if (vazute[m[1]]) {
                        console.error("[ERORI] Proprietate duplicată '" + m[1] + "'");
                        break;
                    }
                    vazute[m[1]] = true;
                }
            }
        }
    }
}

function verificaSiIncarcaErori() {
    const caleJson = path.join(radacinaProiect, 'resurse/json/erori.json');
    if (!fs.existsSync(caleJson)) {
        console.error('[ERORI] Lipsește erori.json');
        process.exit(1);
    }
    const continut = fs.readFileSync(caleJson).toString('utf-8');
    verificaProprietatiDuplicateJson(continut);
    return JSON.parse(continut);
}

function initErori() {
    const erori = verificaSiIncarcaErori();
    obGlobal.obErori = erori;
    erori.eroare_default.imagine = path.join(erori.cale_baza, erori.eroare_default.imagine);
    for (const eroare of erori.info_erori) {
        eroare.imagine = path.join(erori.cale_baza, eroare.imagine);
    }
}

initErori();

function afisareEroare(res, identificator, titlu, text, imagine) {
    const eroare = obGlobal.obErori.info_erori.find((elem) => elem.identificator == identificator);
    const errDefault = obGlobal.obErori.eroare_default;
    if (eroare?.status) res.status(eroare.identificator);
    res.render('pagini/eroare', {
        imagine: imagine || eroare?.imagine || errDefault.imagine,
        titlu: titlu || eroare?.titlu || errDefault.titlu,
        text: text || eroare?.text || errDefault.text,
    });
}

app.get('/eroare', (req, res) => afisareEroare(res, 404, 'Titlu!!!'));

function initImagini() {
    const continut = fs.readFileSync(path.join(radacinaProiect, 'resurse/json/galerie.json')).toString('utf-8');
    obGlobal.obImagini = JSON.parse(continut);
    const vImagini = obGlobal.obImagini.imagini;
    const caleGalerie = obGlobal.obImagini.cale_galerie;
    const caleAbs = path.join(radacinaProiect, caleGalerie);
    const caleAbsMediu = path.join(caleAbs, 'mediu');
    const caleAbsMic = path.join(caleAbs, 'mic');
    if (!fs.existsSync(caleAbsMediu)) fs.mkdirSync(caleAbsMediu);
    if (!fs.existsSync(caleAbsMic)) fs.mkdirSync(caleAbsMic);

    for (const imag of vImagini) {
        const [numeFis] = imag.cale_relativa.split('.');
        const caleFisAbs = path.join(caleAbs, imag.cale_relativa);
        const caleFisMicAbs = path.join(caleAbsMic, numeFis + '.webp');
        const caleFisMediuAbs = path.join(caleAbsMediu, numeFis + '.webp');
        if (fs.existsSync(caleFisAbs)) {
            if (!fs.existsSync(caleFisMicAbs)) sharp(caleFisAbs).resize(200).toFile(caleFisMicAbs);
            if (!fs.existsSync(caleFisMediuAbs)) sharp(caleFisAbs).resize(400).toFile(caleFisMediuAbs);
        }
        imag.fisier_mic = path.join('/', caleGalerie, 'mic', numeFis + '.webp');
        imag.fisier_mediu = path.join('/', caleGalerie, 'mediu', numeFis + '.webp');
        imag.fisier = path.join('/', caleGalerie, imag.cale_relativa);
    }
}
try {
    initImagini();
} catch (e) {
    console.warn('[IMAGINI]', e.message);
}

function compileazaScss(caleScss, caleCss) {
    if (!caleCss) caleCss = path.parse(caleScss).name + '.css';
    if (!path.isAbsolute(caleScss)) caleScss = path.join(obGlobal.folderScss, caleScss);
    if (!path.isAbsolute(caleCss)) caleCss = path.join(obGlobal.folderCss, caleCss);
    const rez = sass.compile(caleScss, { sourceMap: false });
    fs.writeFileSync(caleCss, rez.css);
}

if (fs.existsSync(obGlobal.folderScss)) {
    for (const numeFis of fs.readdirSync(obGlobal.folderScss)) {
        if (path.extname(numeFis) === '.scss') {
            try {
                compileazaScss(numeFis);
            } catch (e) {
                console.warn('[SCSS]', e.message);
            }
        }
    }
    fs.watch(obGlobal.folderScss, (eveniment, numeFis) => {
        if ((eveniment === 'change' || eveniment === 'rename') && numeFis) {
            const caleCompleta = path.join(obGlobal.folderScss, numeFis);
            if (fs.existsSync(caleCompleta) && path.extname(numeFis) === '.scss') {
                try {
                    compileazaScss(caleCompleta);
                } catch (e) {
                    console.warn('[SCSS]', e.message);
                }
            }
        }
    });
}

app.get('/*pagina', (req, res) => {
    if (req.url.startsWith('/resurse') && path.extname(req.url) === '') {
        return afisareEroare(res, 403);
    }
    if (path.extname(req.url) === '.ejs') return afisareEroare(res, 400);
    try {
        res.render('pagini' + req.url, (err, rezRandare) => {
            if (err) {
                if (err.message.includes('Failed to lookup view')) afisareEroare(res, 404);
                else afisareEroare(res);
            } else res.send(rezRandare);
        });
    } catch (err) {
        if (err.message.includes('Cannot find module')) afisareEroare(res, 404);
        else afisareEroare(res);
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Aventura Travel rulează pe http://localhost:${PORT}`);
});

module.exports = app;
