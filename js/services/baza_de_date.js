const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');

const conexiune = new Pool({
    database: process.env.DB_NAME || 'aventuratravel',
    user: process.env.DB_USER || 'vlad1',
    password: process.env.DB_PASSWORD || 'vlad1',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
});

conexiune.on('error', (err) => {
    console.error('Eroare neașteptată pe conexiunea inactivă PostgreSQL', err);
});

function interogheaza(textSql, parametri) {
    return conexiune.query(textSql, parametri);
}

module.exports = {
    interogheaza,
    conexiune,
    query: interogheaza,
    pool: conexiune,
};
