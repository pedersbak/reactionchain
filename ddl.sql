-- ============================================
-- USERS
-- ============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,       -- hashed password (bcrypt, Argon2, etc.)
    salt TEXT NOT NULL,                -- unique salt per user
    hash_algorithm VARCHAR(50) DEFAULT 'bcrypt', -- allows future migration
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- CHAINS
-- ============================================
CREATE TABLE chains (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- CHAIN USERS (membership + order + admin flag)
-- ============================================
CREATE TABLE chain_users (
    id SERIAL PRIMARY KEY,
    chain_id INT NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_order INT,                    -- order in which user receives tasks
    is_admin BOOLEAN DEFAULT FALSE,    -- marks admin(s) for this chain
    UNIQUE (chain_id, user_id),
    UNIQUE (chain_id, user_order)
);

-- ============================================
-- TASKS
-- ============================================
CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    chain_id INT NOT NULL REFERENCES chains(id) ON DELETE CASCADE,
    created_by INT NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',  -- pending | accepted | completed | declined | expired
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    accepted_by INT REFERENCES users(id),
    accepted_at TIMESTAMP
);

-- ============================================
-- TASK OFFERS (each user offer event)
-- ============================================
CREATE TABLE task_offers (
    id SERIAL PRIMARY KEY,
    task_id INT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offered_at TIMESTAMP DEFAULT NOW(),
    responded_at TIMESTAMP,
    status VARCHAR(50) DEFAULT 'pending',  -- pending | accepted | declined | timeout
    UNIQUE (task_id, user_id)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_chain_users_chain ON chain_users(chain_id);
CREATE INDEX idx_chain_users_user ON chain_users(user_id);
CREATE INDEX idx_tasks_chain ON tasks(chain_id);
CREATE INDEX idx_task_offers_task ON task_offers(task_id);
CREATE INDEX idx_task_offers_user ON task_offers(user_id);
