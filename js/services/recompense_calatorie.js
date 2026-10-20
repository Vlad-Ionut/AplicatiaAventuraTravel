const fs = require('fs');
const path = require('path');
const bd = require('./baza_de_date');

let schemaReady = false;

async function asiguraSchema() {
    if (schemaReady) return;
    const sqlPath = path.join(__dirname, '..', '..', 'sql', 'gamification.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    const parts = sql
        .split(/;\s*\n/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('--'));

    for (const part of parts) {
        try {
            await bd.interogheaza(part.endsWith(';') ? part : part + ';');
        } catch (e) {
            console.warn('[rewards schema]', e.message);
        }
    }

    const need = ['rewards', 'quiz_questions', 'user_spins', 'spin_plays', 'user_rewards', 'user_gamification'];
    for (const table of need) {
        await bd.interogheaza(`SELECT 1 FROM ${table} LIMIT 1`);
    }
    schemaReady = true;
}

function nivelDinXp(xp) {
    const x = Math.max(0, Number(xp) || 0);
    return Math.floor(x / 200) + 1;
}

function xpPentruNivel(nivel) {
    return (Math.max(1, nivel) - 1) * 200;
}

function alegePonderat(listaRecompense) {
    const total = listaRecompense.reduce((s, r) => s + Number(r.probabilitate || 0), 0);
    if (!total) return listaRecompense[0];
    let tragere = Math.random() * total;
    for (const r of listaRecompense) {
        tragere -= Number(r.probabilitate || 0);
        if (tragere <= 0) return r;
    }
    return listaRecompense[listaRecompense.length - 1];
}

async function grantSpinForReservation(rezervareId) {
    await asiguraSchema();
    const rez = await bd.interogheaza(
        `SELECT id, utilizator_id, status FROM rezervari WHERE id=$1`,
        [rezervareId]
    );
    if (!rez.rows.length) return null;
    const r = rez.rows[0];
    if (r.status !== 'confirmata') return null;

    const spin = await bd.interogheaza(
        `INSERT INTO user_spins (utilizator_id, rezervare_id, status)
         VALUES ($1, $2, 'available')
         ON CONFLICT (rezervare_id) DO NOTHING
         RETURNING *`,
        [r.utilizator_id, rezervareId]
    );
    if (spin.rows[0]) {
        await bd.interogheaza(
            `INSERT INTO reservation_reward (rezervare_id, spin_id)
             VALUES ($1, $2)
             ON CONFLICT (rezervare_id) DO NOTHING`,
            [rezervareId, spin.rows[0].id]
        );
    }
    return spin.rows[0] || null;
}

async function getOrCreateGamification(userId, client = bd) {
    await client.query(
        `INSERT INTO user_gamification (utilizator_id, xp, nivel)
         VALUES ($1, 0, 1)
         ON CONFLICT (utilizator_id) DO NOTHING`,
        [userId]
    );
    const g = await client.query(
        `SELECT xp, nivel FROM user_gamification WHERE utilizator_id=$1`,
        [userId]
    );
    return g.rows[0] || { xp: 0, nivel: 1 };
}

async function getProfile(userId) {
    await asiguraSchema();
    await syncSpinsFromConfirmed(userId);
    const user = await bd.interogheaza(
        `SELECT id, nume, email FROM utilizatori WHERE id=$1`,
        [userId]
    );
    const u = user.rows[0];
    if (!u) return null;
    const gami = await getOrCreateGamification(userId);
    u.xp = gami.xp;
    u.nivel = gami.nivel;

    const spins = await bd.interogheaza(
        `SELECT COUNT(*)::int AS n FROM user_spins
         WHERE utilizator_id=$1 AND status='available'`,
        [userId]
    );
    const rewards = await bd.interogheaza(
        `SELECT ur.*, rw.nume, rw.tip, rw.valoare, rw.culoare, rw.iconita, rw.descriere
         FROM user_rewards ur
         JOIN rewards rw ON rw.id=ur.reward_id
         WHERE ur.utilizator_id=$1
         ORDER BY ur.data_acordare DESC`,
        [userId]
    );
    const discounts = rewards.rows.filter((x) => x.tip === 'discount' && x.status === 'active');
    const xp = Number(u.xp || 0);
    const nivel = Number(u.nivel || nivelDinXp(xp));
    const xpStart = xpPentruNivel(nivel);
    const xpNext = xpPentruNivel(nivel + 1);

    return {
        utilizator: { id: u.id, nume: u.nume, email: u.email },
        xp,
        nivel,
        xpProgress: {
            current: xp,
            levelStart: xpStart,
            levelEnd: xpNext,
            percent: Math.min(100, Math.round(((xp - xpStart) / Math.max(1, xpNext - xpStart)) * 100)),
        },
        spinsDisponibile: spins.rows[0].n,
        discounturi: discounts,
        rewards: rewards.rows,
        achievements: buildAchievements(xp, nivel, rewards.rows.length, spins.rows[0].n),
    };
}

function buildAchievements(xp, nivel, rewardsCount, spinsLeft) {
    return [
        { id: 'first_spin', nume: 'Primul Spin', unlocked: rewardsCount > 0 || spinsLeft > 0, icon: 'dharmachakra' },
        { id: 'collector', nume: 'Colecționar', unlocked: rewardsCount >= 3, icon: 'trophy' },
        { id: 'explorer', nume: 'Explorer Lv.3', unlocked: nivel >= 3, icon: 'compass' },
        { id: 'xp500', nume: '500 XP', unlocked: xp >= 500, icon: 'bolt' },
    ];
}

async function getActiveRewards() {
    await asiguraSchema();
    const rez = await bd.interogheaza(
        `SELECT * FROM rewards WHERE activ=TRUE ORDER BY probabilitate DESC, id`
    );
    return rez.rows;
}

async function getSpinStatus(userId) {
    await asiguraSchema();
    const available = await bd.interogheaza(
        `SELECT s.*, r.pret_total, p.destinatie
         FROM user_spins s
         JOIN rezervari r ON r.id=s.rezervare_id
         JOIN pachete_turism p ON p.id=r.pachet_id
         WHERE s.utilizator_id=$1 AND s.status='available'
         ORDER BY s.data_creare ASC`,
        [userId]
    );
    const pending = await bd.interogheaza(
        `SELECT sp.*, rw.nume AS reward_nume, rw.culoare, rw.iconita
         FROM spin_plays sp
         JOIN rewards rw ON rw.id=sp.reward_id
         WHERE sp.utilizator_id=$1 AND sp.status='awaiting_answer'
         ORDER BY sp.data_creare DESC LIMIT 1`,
        [userId]
    );
    return {
        spinsDisponibile: available.rows.length,
        spins: available.rows,
        playPending: pending.rows[0] || null,
    };
}

async function pickQuestion(userId) {
    const avoided = await bd.interogheaza(
        `SELECT question_id FROM user_quiz_history
         WHERE utilizator_id=$1
         ORDER BY data_creare DESC LIMIT 8`,
        [userId]
    );
    const ids = avoided.rows.map((r) => r.question_id);
    let rez;
    if (ids.length) {
        rez = await bd.interogheaza(
            `SELECT * FROM quiz_questions
             WHERE activ=TRUE AND id <> ALL($1::int[])
             ORDER BY RANDOM() LIMIT 1`,
            [ids]
        );
    }
    if (!rez || !rez.rows.length) {
        rez = await bd.interogheaza(
            `SELECT * FROM quiz_questions WHERE activ=TRUE ORDER BY RANDOM() LIMIT 1`
        );
    }
    return rez.rows[0] || null;
}

function publicQuestion(q) {
    if (!q) return null;
    return {
        id: q.id,
        intrebare: q.intrebare,
        optiune_a: q.optiune_a,
        optiune_b: q.optiune_b,
        optiune_c: q.optiune_c,
        optiune_d: q.optiune_d,
        categorie: q.categorie,
        dificultate: q.dificultate,
    };
}

async function spinWheel(userId) {
    await asiguraSchema();
    const client = await bd.conexiune.connect();
    try {
        await client.query('BEGIN');

        const existing = await client.query(
            `SELECT id FROM spin_plays
             WHERE utilizator_id=$1 AND status='awaiting_answer'
             LIMIT 1 FOR UPDATE`,
            [userId]
        );
        if (existing.rows.length) {
            await client.query('ROLLBACK');
            return { error: 'Ai deja un spin în așteptarea răspunsului la quiz.', code: 400 };
        }

        const spin = await client.query(
            `SELECT * FROM user_spins
             WHERE utilizator_id=$1 AND status='available'
             ORDER BY data_creare ASC
             LIMIT 1 FOR UPDATE`,
            [userId]
        );
        if (!spin.rows.length) {
            await client.query('ROLLBACK');
            return { error: 'Nu ai spin-uri disponibile. Confirmă o rezervare pentru a debloca unul.', code: 400 };
        }

        const rewards = await client.query(`SELECT * FROM rewards WHERE activ=TRUE`);
        if (!rewards.rows.length) {
            await client.query('ROLLBACK');
            return { error: 'Nu există recompense active.', code: 500 };
        }
        const reward = alegePonderat(rewards.rows);

        const questions = await client.query(`SELECT * FROM quiz_questions WHERE activ=TRUE`);
        if (!questions.rows.length) {
            await client.query('ROLLBACK');
            return { error: 'Nu există întrebări active.', code: 500 };
        }

        const recent = await client.query(
            `SELECT question_id FROM user_quiz_history
             WHERE utilizator_id=$1 ORDER BY data_creare DESC LIMIT 8`,
            [userId]
        );
        const recentIds = new Set(recent.rows.map((r) => r.question_id));
        const pool = questions.rows.filter((q) => !recentIds.has(q.id));
        const question = (pool.length ? pool : questions.rows)[
            Math.floor(Math.random() * (pool.length ? pool.length : questions.rows.length))
        ];

        await client.query(
            `UPDATE user_spins SET status='in_progress' WHERE id=$1`,
            [spin.rows[0].id]
        );

        const play = await client.query(
            `INSERT INTO spin_plays (spin_id, utilizator_id, reward_id, question_id, status)
             VALUES ($1,$2,$3,$4,'awaiting_answer') RETURNING *`,
            [spin.rows[0].id, userId, reward.id, question.id]
        );

        await client.query('COMMIT');
        return {
            playId: play.rows[0].id,
            spinId: spin.rows[0].id,
            reward: {
                id: reward.id,
                nume: reward.nume,
                descriere: reward.descriere,
                tip: reward.tip,
                valoare: reward.valoare,
                culoare: reward.culoare,
                iconita: reward.iconita,
            },
            question: publicQuestion(question),
            wheelRewards: rewards.rows.map((r) => ({
                id: r.id,
                nume: r.nume,
                culoare: r.culoare,
                iconita: r.iconita,
            })),
        };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function syncSpinsFromConfirmed(userId = null) {
    await asiguraSchema();
    const params = [];
    let filter = `WHERE r.status='confirmata'`;
    if (userId) {
        params.push(userId);
        filter += ` AND r.utilizator_id=$${params.length}`;
    }
    await bd.interogheaza(
        `INSERT INTO user_spins (utilizator_id, rezervare_id, status)
         SELECT r.utilizator_id, r.id, 'available'
         FROM rezervari r
         ${filter}
         ON CONFLICT (rezervare_id) DO NOTHING`,
        params
    );
}

async function answerQuiz(userId, playId, answer) {
    await asiguraSchema();
    const ans = String(answer || '').toUpperCase();
    const validAnswer = ['A', 'B', 'C', 'D'].includes(ans);

    const client = await bd.conexiune.connect();
    try {
        await client.query('BEGIN');
        const play = await client.query(
            `SELECT sp.*, q.raspuns_corect, q.explicatie, q.intrebare,
                    rw.tip AS reward_tip, rw.valoare AS reward_valoare, rw.nume AS reward_nume,
                    us.rezervare_id
             FROM spin_plays sp
             JOIN quiz_questions q ON q.id=sp.question_id
             JOIN rewards rw ON rw.id=sp.reward_id
             JOIN user_spins us ON us.id=sp.spin_id
             WHERE sp.id=$1 AND sp.utilizator_id=$2
             FOR UPDATE`,
            [playId, userId]
        );
        if (!play.rows.length) {
            await client.query('ROLLBACK');
            return { error: 'Sesiune invalidă.', code: 404 };
        }
        const p = play.rows[0];
        if (p.status !== 'awaiting_answer') {
            await client.query('ROLLBACK');
            return { error: 'Această rundă a fost deja rezolvată.', code: 400 };
        }

        const corect = validAnswer && p.raspuns_corect === ans;
        await client.query(
            `UPDATE spin_plays
             SET status=$1, raspuns_dat=$2, corect=$3, data_rezolvare=CURRENT_TIMESTAMP
             WHERE id=$4`,
            [corect ? 'won' : 'lost', validAnswer ? ans : null, corect, playId]
        );
        await client.query(
            `UPDATE user_spins SET status=$1 WHERE id=$2`,
            [corect ? 'used' : 'lost', p.spin_id]
        );
        await client.query(
            `INSERT INTO user_quiz_history (utilizator_id, question_id, spin_play_id, raspuns_dat, corect)
             VALUES ($1,$2,$3,$4,$5)`,
            [userId, p.question_id, playId, validAnswer ? ans : null, corect]
        );

        let granted = null;
        if (corect) {
            const ur = await client.query(
                `INSERT INTO user_rewards (utilizator_id, reward_id, spin_play_id, rezervare_id, status)
                 VALUES ($1,$2,$3,$4,'active') RETURNING *`,
                [userId, p.reward_id, playId, p.rezervare_id]
            );
            granted = ur.rows[0];
            await client.query(
                `UPDATE reservation_reward SET user_reward_id=$1 WHERE rezervare_id=$2`,
                [granted.id, p.rezervare_id]
            );

            if (p.reward_tip === 'xp') {
                const xpAdd = Number(p.reward_valoare) || 0;
                await client.query(
                    `INSERT INTO user_gamification (utilizator_id, xp, nivel)
                     VALUES ($1, 0, 1)
                     ON CONFLICT (utilizator_id) DO NOTHING`,
                    [userId]
                );
                const u = await client.query(
                    `UPDATE user_gamification
                     SET xp = xp + $1, data_actualizare = CURRENT_TIMESTAMP
                     WHERE utilizator_id=$2
                     RETURNING xp`,
                    [xpAdd, userId]
                );
                await client.query(
                    `UPDATE user_gamification SET nivel=$1 WHERE utilizator_id=$2`,
                    [nivelDinXp(Number(u.rows[0].xp)), userId]
                );
            }
        }

        await client.query('COMMIT');
        return {
            corect,
            explicatie: p.explicatie,
            rewardNume: p.reward_nume,
            granted: !!granted,
            raspunsCorect: p.raspuns_corect,
        };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function getHistory(userId) {
    await asiguraSchema();
    const rez = await bd.interogheaza(
        `SELECT sp.id, sp.status, sp.corect, sp.raspuns_dat, sp.data_creare, sp.data_rezolvare,
                rw.nume AS reward, rw.tip, rw.valoare, rw.culoare,
                q.intrebare, q.raspuns_corect, q.categorie,
                us.rezervare_id, p.destinatie
         FROM spin_plays sp
         JOIN rewards rw ON rw.id=sp.reward_id
         JOIN quiz_questions q ON q.id=sp.question_id
         JOIN user_spins us ON us.id=sp.spin_id
         LEFT JOIN rezervari r ON r.id=us.rezervare_id
         LEFT JOIN pachete_turism p ON p.id=r.pachet_id
         WHERE sp.utilizator_id=$1
         ORDER BY sp.data_creare DESC
         LIMIT 50`,
        [userId]
    );
    return rez.rows;
}

async function getUserStatistics(userId) {
    await asiguraSchema();
    const totalSpins = await bd.interogheaza(
        `SELECT COUNT(*)::int AS n FROM user_spins WHERE utilizator_id=$1`,
        [userId]
    );
    const totalRewards = await bd.interogheaza(
        `SELECT COUNT(*)::int AS n FROM user_rewards WHERE utilizator_id=$1`,
        [userId]
    );
    const quiz = await bd.interogheaza(
        `SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE corect)::int AS corecte,
            COUNT(*) FILTER (WHERE NOT corect)::int AS gresite
         FROM user_quiz_history WHERE utilizator_id=$1`,
        [userId]
    );
    const popular = await bd.interogheaza(
        `SELECT rw.nume, COUNT(*)::int AS nr
         FROM user_rewards ur JOIN rewards rw ON rw.id=ur.reward_id
         WHERE ur.utilizator_id=$1
         GROUP BY rw.nume ORDER BY nr DESC LIMIT 1`,
        [userId]
    );
    const gami = await getOrCreateGamification(userId);
    const discounts = await bd.interogheaza(
        `SELECT COALESCE(SUM(rw.valoare),0)::float AS total
         FROM user_rewards ur JOIN rewards rw ON rw.id=ur.reward_id
         WHERE ur.utilizator_id=$1 AND rw.tip='discount'`,
        [userId]
    );
    const q = quiz.rows[0];
    const totalQ = q.total || 0;
    return {
        totalSpins: totalSpins.rows[0].n,
        totalRewards: totalRewards.rows[0].n,
        mostPopularReward: popular.rows[0]?.nume || '—',
        correctPercent: totalQ ? Math.round((q.corecte / totalQ) * 100) : 0,
        wrongPercent: totalQ ? Math.round((q.gresite / totalQ) * 100) : 0,
        totalXp: Number(gami.xp) || 0,
        totalDiscounts: discounts.rows[0].total,
    };
}

async function getAdminStatistics() {
    await asiguraSchema();
    const spins = await bd.interogheaza(`SELECT COUNT(*)::int AS n FROM user_spins`);
    const rewards = await bd.interogheaza(`SELECT COUNT(*)::int AS n FROM user_rewards`);
    const quiz = await bd.interogheaza(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE corect)::int AS corecte
         FROM user_quiz_history`
    );
    const popular = await bd.interogheaza(
        `SELECT rw.nume, COUNT(*)::int AS nr
         FROM user_rewards ur JOIN rewards rw ON rw.id=ur.reward_id
         GROUP BY rw.nume ORDER BY nr DESC LIMIT 5`
    );
    const available = await bd.interogheaza(
        `SELECT COUNT(*)::int AS n FROM user_spins WHERE status='available'`
    );
    const q = quiz.rows[0];
    return {
        totalSpins: spins.rows[0].n,
        availableSpins: available.rows[0].n,
        totalRewardsGranted: rewards.rows[0].n,
        quizAttempts: q.total,
        successRate: q.total ? Math.round((q.corecte / q.total) * 100) : 0,
        topRewards: popular.rows,
    };
}

module.exports = {
    asiguraSchema,
    ensureSchema: asiguraSchema,
    sincronizeazaRotiriDinConfirmate: syncSpinsFromConfirmed,
    syncSpinsFromConfirmed,
    acordaRotirePentruRezervare: grantSpinForReservation,
    grantSpinForReservation,
    obtineProfil: getProfile,
    getProfile,
    obtineRecompenseActive: getActiveRewards,
    getActiveRewards,
    obtineStareRotire: getSpinStatus,
    getSpinStatus,
    invarteRoata: spinWheel,
    spinWheel,
    raspundeLaQuiz: answerQuiz,
    answerQuiz,
    obtineIstoric: getHistory,
    getHistory,
    statisticiUtilizator: getUserStatistics,
    getUserStatistics,
    statisticiAdmin: getAdminStatistics,
    getAdminStatistics,
    alegeIntrebare: pickQuestion,
    pickQuestion,
    intrebarePublica: publicQuestion,
    publicQuestion,
};
