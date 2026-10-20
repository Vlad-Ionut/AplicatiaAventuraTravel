CREATE TABLE IF NOT EXISTS user_gamification (
    utilizator_id INT PRIMARY KEY REFERENCES utilizatori(id) ON DELETE CASCADE,
    xp INT NOT NULL DEFAULT 0,
    nivel INT NOT NULL DEFAULT 1,
    data_actualizare TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rewards (
    id SERIAL PRIMARY KEY,
    nume VARCHAR(120) NOT NULL,
    descriere TEXT,
    tip VARCHAR(40) NOT NULL,
    valoare NUMERIC(10,2) NOT NULL DEFAULT 0,
    probabilitate NUMERIC(6,2) NOT NULL DEFAULT 10 CHECK (probabilitate > 0),
    culoare VARCHAR(20) NOT NULL DEFAULT '#0f68b1',
    iconita VARCHAR(60) NOT NULL DEFAULT 'gift',
    activ BOOLEAN NOT NULL DEFAULT TRUE,
    data_creare TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quiz_questions (
    id SERIAL PRIMARY KEY,
    intrebare TEXT NOT NULL,
    optiune_a VARCHAR(255) NOT NULL,
    optiune_b VARCHAR(255) NOT NULL,
    optiune_c VARCHAR(255) NOT NULL,
    optiune_d VARCHAR(255) NOT NULL,
    raspuns_corect CHAR(1) NOT NULL CHECK (raspuns_corect IN ('A','B','C','D')),
    categorie VARCHAR(50) NOT NULL DEFAULT 'Tourism',
    dificultate VARCHAR(20) NOT NULL DEFAULT 'Easy',
    explicatie TEXT,
    activ BOOLEAN NOT NULL DEFAULT TRUE,
    data_creare TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_spins (
    id SERIAL PRIMARY KEY,
    utilizator_id INT NOT NULL REFERENCES utilizatori(id) ON DELETE CASCADE,
    rezervare_id INT NOT NULL REFERENCES rezervari(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'available'
        CHECK (status IN ('available','in_progress','used','lost')),
    data_creare TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (rezervare_id)
);

CREATE TABLE IF NOT EXISTS spin_plays (
    id SERIAL PRIMARY KEY,
    spin_id INT NOT NULL REFERENCES user_spins(id) ON DELETE CASCADE,
    utilizator_id INT NOT NULL REFERENCES utilizatori(id) ON DELETE CASCADE,
    reward_id INT NOT NULL REFERENCES rewards(id),
    question_id INT NOT NULL REFERENCES quiz_questions(id),
    status VARCHAR(20) NOT NULL DEFAULT 'awaiting_answer'
        CHECK (status IN ('awaiting_answer','won','lost')),
    raspuns_dat CHAR(1),
    corect BOOLEAN,
    data_creare TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_rezolvare TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_rewards (
    id SERIAL PRIMARY KEY,
    utilizator_id INT NOT NULL REFERENCES utilizatori(id) ON DELETE CASCADE,
    reward_id INT NOT NULL REFERENCES rewards(id),
    spin_play_id INT REFERENCES spin_plays(id) ON DELETE SET NULL,
    rezervare_id INT REFERENCES rezervari(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    data_acordare TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_quiz_history (
    id SERIAL PRIMARY KEY,
    utilizator_id INT NOT NULL REFERENCES utilizatori(id) ON DELETE CASCADE,
    question_id INT NOT NULL REFERENCES quiz_questions(id),
    spin_play_id INT REFERENCES spin_plays(id) ON DELETE SET NULL,
    raspuns_dat CHAR(1),
    corect BOOLEAN NOT NULL DEFAULT FALSE,
    data_creare TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservation_reward (
    id SERIAL PRIMARY KEY,
    rezervare_id INT NOT NULL REFERENCES rezervari(id) ON DELETE CASCADE,
    spin_id INT NOT NULL REFERENCES user_spins(id) ON DELETE CASCADE,
    user_reward_id INT REFERENCES user_rewards(id) ON DELETE SET NULL,
    UNIQUE (rezervare_id)
);

CREATE INDEX IF NOT EXISTS idx_user_spins_user_status ON user_spins(utilizator_id, status);
CREATE INDEX IF NOT EXISTS idx_spin_plays_user ON spin_plays(utilizator_id);
CREATE INDEX IF NOT EXISTS idx_user_rewards_user ON user_rewards(utilizator_id);
CREATE INDEX IF NOT EXISTS idx_quiz_hist_user ON user_quiz_history(utilizator_id);
CREATE INDEX IF NOT EXISTS idx_rewards_activ ON rewards(activ);
CREATE INDEX IF NOT EXISTS idx_quiz_activ ON quiz_questions(activ);

INSERT INTO rewards (nume, descriere, tip, valoare, probabilitate, culoare, iconita)
SELECT * FROM (VALUES
    ('5% Discount', 'Reducere 5% la următoarea rezervare', 'discount', 5, 25, '#38bdf8', 'percent'),
    ('10% Discount', 'Reducere 10% la următoarea rezervare', 'discount', 10, 18, '#0f68b1', 'tags'),
    ('15% Discount', 'Reducere 15% la următoarea rezervare', 'discount', 15, 10, '#082f49', 'ticket'),
    ('50 XP', 'Primești 50 puncte experiență', 'xp', 50, 20, '#10b981', 'star'),
    ('100 XP', 'Primești 100 puncte experiență', 'xp', 100, 12, '#059669', 'bolt'),
    ('Free Voucher', 'Voucher cadou Aventura Travel', 'voucher', 1, 8, '#f59e0b', 'gift'),
    ('Double XP', 'XP dublu la următoarea rezervare', 'double_xp', 2, 7, '#a855f7', 'gem')
) AS v(nume, descriere, tip, valoare, probabilitate, culoare, iconita)
WHERE NOT EXISTS (SELECT 1 FROM rewards LIMIT 1);

INSERT INTO quiz_questions (intrebare, optiune_a, optiune_b, optiune_c, optiune_d, raspuns_corect, categorie, dificultate, explicatie)
SELECT * FROM (VALUES
    ('Care este capitala Franței?', 'Lyon', 'Paris', 'Marsilia', 'Nisa', 'B', 'Capitals', 'Easy', 'Paris este capitala Franței.'),
    ('În ce țară se află Colosseumul?', 'Grecia', 'Spania', 'Italia', 'Turcia', 'C', 'Landmarks', 'Easy', 'Colosseumul este în Roma, Italia.'),
    ('Care ocean scaldă coasta de vest a Portugaliei?', 'Atlantic', 'Pacific', 'Indian', 'Arctic', 'A', 'Geography', 'Easy', 'Portugalia are coastă la Oceanul Atlantic.'),
    ('Ce oraș este cunoscut pentru Sagrada Familia?', 'Madrid', 'Valencia', 'Sevilia', 'Barcelona', 'D', 'Landmarks', 'Medium', 'Sagrada Familia este în Barcelona.'),
    ('Care este moneda oficială în Grecia (2026)?', 'Drahma', 'Euro', 'Lira', 'Leu', 'B', 'Europe', 'Easy', 'Grecia folosește euro.'),
    ('Aeroportul principal al Parisului se numește?', 'Orly', 'Charles de Gaulle', 'Beauvais', 'Heathrow', 'B', 'Airlines', 'Medium', 'CDG este aeroportul principal.'),
    ('Machu Picchu se află în?', 'Chile', 'Bolivia', 'Peru', 'Ecuador', 'C', 'World', 'Medium', 'Machu Picchu este în Peru.'),
    ('Care tip de turism presupune vizite la muzee și monumente?', 'Aventură', 'Cultural', 'Relaxare', 'Urban', 'B', 'Tourism', 'Easy', 'Turismul cultural include muzee și monumente.'),
    ('Capitala Austriei este?', 'Salzburg', 'Innsbruck', 'Viena', 'Graz', 'C', 'Capitals', 'Easy', 'Viena este capitala Austriei.'),
    ('Care țară este cunoscută pentru fiorduri spectaculoase?', 'Danemarca', 'Norvegia', 'Belgia', 'Olanda', 'B', 'Geography', 'Medium', 'Norvegia este faimoasă pentru fiorduri.'),
    ('Ce înseamnă all-inclusive într-un pachet turistic?', 'Doar zbor', 'Cazare + mese + băuturi incluse', 'Doar transfer', 'Doar ghid', 'B', 'Tourism', 'Easy', 'All-inclusive include cazare, mese și băuturi.'),
    ('Turnul Eiffel a fost construit pentru Expoziția din anul?', '1789', '1889', '1918', '1945', 'B', 'Culture', 'Hard', 'A fost inaugurat în 1889.'),
    ('Care este cel mai mare continent?', 'Africa', 'America de Nord', 'Asia', 'Europa', 'C', 'World', 'Easy', 'Asia este cel mai mare continent.'),
    ('Santorini face parte din?', 'Insulele Baleare', 'Insulele Canare', 'Insulele Ciclade', 'Insulele Azore', 'C', 'Geography', 'Medium', 'Santorini este în arhipelagul Ciclade, Grecia.'),
    ('Ce companie aeriană este asociată tradițional cu Olanda?', 'Lufthansa', 'KLM', 'Air France', 'Iberia', 'B', 'Airlines', 'Medium', 'KLM este compania națională olandeză.')
) AS v(intrebare, optiune_a, optiune_b, optiune_c, optiune_d, raspuns_corect, categorie, dificultate, explicatie)
WHERE NOT EXISTS (SELECT 1 FROM quiz_questions LIMIT 1);
