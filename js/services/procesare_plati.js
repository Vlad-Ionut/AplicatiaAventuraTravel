const { v4: uuidv4 } = require('uuid');
const bd = require('./baza_de_date');
const { acordaRotirePentruRezervare } = require('./recompense_calatorie');

async function proceseazaPlata({ rezervareId, suma, metoda = 'simulat', infoCard = {} }) {
    const referinta = 'PAY-' + uuidv4().slice(0, 8).toUpperCase();
    const metodaNormalizata = ['simulat', 'stripe', 'netopia', 'paypal'].includes(metoda)
        ? metoda
        : 'simulat';

    let status = 'reusita';
    let detalii = {
        metoda: metodaNormalizata,
        procesat_la: new Date().toISOString(),
        simulat: true,
    };

    if (metodaNormalizata === 'simulat' || metodaNormalizata === 'stripe') {
        if (infoCard.numar && String(infoCard.numar).replace(/\s/g, '').startsWith('4000')) {
            status = 'esuata';
            detalii.motiv = 'Card refuzat (simulare)';
        } else {
            detalii.ultimele4 = infoCard.numar
                ? String(infoCard.numar).slice(-4)
                : '4242';
        }
    }

    await new Promise((rezolva) => setTimeout(rezolva, 400));

    const rezultat = await bd.interogheaza(
        `INSERT INTO plati (rezervare_id, suma, metoda, status, referinta, detalii)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [rezervareId, suma, metodaNormalizata, status, referinta, JSON.stringify(detalii)]
    );

    if (status === 'reusita') {
        const actualizat = await bd.interogheaza(
            `UPDATE rezervari SET status='confirmata' WHERE id=$1 AND status='pending' RETURNING id`,
            [rezervareId]
        );
        if (actualizat.rows.length) {
            try {
                await acordaRotirePentruRezervare(rezervareId);
            } catch (e) {
                console.warn('[recompense] acordarea rotirii a eșuat:', e.message);
            }
        }
    }

    return rezultat.rows[0];
}

module.exports = { proceseazaPlata };
