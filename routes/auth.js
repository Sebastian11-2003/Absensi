
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../config/database');

const router = express.Router();

// HALAMAN LOGIN
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }

    res.render('auth/login', {
        error: null
    });
});

// PROSES LOGIN
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.render('auth/login', {
                error: 'Username dan password wajib diisi.'
            });
        }

        const [users] = await db.execute(
            `SELECT id, username, password, role, status
             FROM users
             WHERE username = ?
             LIMIT 1`,
            [username.trim()]
        );

        if (users.length === 0) {
            return res.render('auth/login', {
                error: 'Username atau password salah.'
            });
        }

        const user = users[0];

        if (user.status !== 'aktif') {
            return res.render('auth/login', {
                error: 'Akun kamu sedang dinonaktifkan.'
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            user.password
        );

        if (!validPassword) {
            return res.render('auth/login', {
                error: 'Username atau password salah.'
            });
        }

        req.session.regenerate((err) => {
            if (err) {
                return res.status(500).send('Gagal membuat sesi login.');
            }

            req.session.user = {
                id: user.id,
                username: user.username,
                role: user.role
            };

            req.session.save((err) => {
                if (err) {
                    return res.status(500).send('Gagal menyimpan sesi.');
                }

                res.redirect('/dashboard');
            });
        });

    } catch (error) {
        console.error('Login error:', error);

        res.status(500).render('auth/login', {
            error: 'Terjadi kesalahan pada server.'
        });
    }
});

// LOGOUT
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Gagal logout.');
        }

        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

module.exports = router;
