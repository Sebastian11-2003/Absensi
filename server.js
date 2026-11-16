
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');

const { isAuthenticated } = require('./middleware/auth');
const adminRoutes = require('./routes/admin');
const guruRoutes = require('./routes/guru');
const muridRoutes = require('./routes/murid');
const app = express();

// =====================================
// CONFIGURATION
// =====================================

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// =====================================
// MIDDLEWARE
// =====================================

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(
    path.join(__dirname, 'public')
));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 8,
        sameSite: 'lax'
    }
}));

// =====================================
// ROUTES
// =====================================

app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/guru', guruRoutes);
app.use('/murid', muridRoutes);
// HALAMAN UTAMA
app.get('/', (req, res) => {
    res.redirect('/login');
});

// DASHBOARD REDIRECT
app.get('/dashboard', isAuthenticated, (req, res) => {
    const role = req.session.user.role;

    if (role === 'admin') {
        return res.redirect('/admin');
    }

    if (role === 'guru') {
        return res.redirect('/guru');
    }

    if (role === 'murid') {
        return res.redirect('/murid');
    }

    res.redirect('/login');
});

// =====================================
// 404
// =====================================

app.use((req, res) => {
    res.status(404).send('Halaman tidak ditemukan.');
});



// =====================================
// START SERVER
// =====================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`SMASVP berjalan di http://localhost:${PORT}`);
});
