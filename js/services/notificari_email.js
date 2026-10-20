const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const nodemailer = require('nodemailer');
const bd = require('./baza_de_date');

function emailNotificari() {
    return process.env.NOTIFICARI_EMAIL || 'vlad.test.tweb.node@gmail.com';
}

let transportor = null;
let transportorSmtp = false;

function smtpConfigurat() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function parolaSmtp() {
    return String(process.env.SMTP_PASS || '').replace(/\s+/g, '');
}

function obtineTransportor() {
    const smtpActiv = smtpConfigurat();
    if (transportor && transportorSmtp === smtpActiv) return transportor;

    if (smtpActiv) {
        transportorSmtp = true;
        transportor = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_PORT === '465',
            auth: {
                user: process.env.SMTP_USER,
                pass: parolaSmtp(),
            },
        });
        console.log('[notificari] SMTP Gmail activ →', emailNotificari());
    } else {
        transportorSmtp = false;
        transportor = {
            sendMail: async (optiuni) => {
                console.log('\n========== EMAIL SIMULAT ==========');
                console.log('Către:', optiuni.to);
                console.log('Subiect:', optiuni.subject);
                console.log('Conținut:', optiuni.text || optiuni.html);
                console.log('===================================\n');
                return { messageId: 'sim-' + Date.now() };
            },
        };
        console.warn('[notificari] SMTP neconfigurat — emailurile sunt doar simulate în consolă.');
    }
    return transportor;
}

function destinatieEmail(catre) {
    return emailNotificari() || catre;
}

async function trimiteEmail(catre, subiect, text) {
    const transport = obtineTransportor();
    const rezultat = await transport.sendMail({
        from: process.env.SMTP_FROM || emailNotificari(),
        to: destinatieEmail(catre),
        subject: subiect,
        text,
    });
    console.log('[notificari] email trimis:', subiect, '→', destinatieEmail(catre));
    return rezultat;
}

async function notificaUtilizator(utilizatorId, tip, subiect, mesaj, trimiteMail = true) {
    await bd.interogheaza(
        `INSERT INTO notificari (utilizator_id, tip, subiect, mesaj, email_trimis)
         VALUES ($1, $2, $3, $4, $5)`,
        [utilizatorId, tip, subiect, mesaj, false]
    );

    if (!trimiteMail) return;

    const utilizator = await bd.interogheaza(
        'SELECT email FROM utilizatori WHERE id=$1',
        [utilizatorId]
    );
    if (!utilizator.rows[0]) return;

    try {
        await trimiteEmail(utilizator.rows[0].email, subiect, mesaj);
        await bd.interogheaza(
            `UPDATE notificari SET email_trimis=TRUE
             WHERE utilizator_id=$1 AND tip=$2 AND subiect=$3
             AND id=(SELECT id FROM notificari WHERE utilizator_id=$1 ORDER BY id DESC LIMIT 1)`,
            [utilizatorId, tip, subiect]
        );
    } catch (e) {
        console.error('[notificari] trimiterea emailului a eșuat:', e.message);
    }
}

module.exports = { trimiteEmail, notificaUtilizator };
