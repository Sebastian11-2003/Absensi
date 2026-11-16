
const express = require('express');
const db = require('../config/database');

const { isAuthenticated } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/role');
const crypto = require('crypto');
const router = express.Router();

// =====================================
// DASHBOARD ADMIN
// =====================================

router.get(
    '/',
    isAuthenticated,
    authorizeRole('admin'),
    async (req, res) => {
        try {
            const [[guru]] = await db.execute(
                'SELECT COUNT(*) AS total FROM guru'
            );

            const [[murid]] = await db.execute(
                'SELECT COUNT(*) AS total FROM murid'
            );

            const [[kelas]] = await db.execute(
                'SELECT COUNT(*) AS total FROM kelas'
            );

            const [[mapel]] = await db.execute(
                'SELECT COUNT(*) AS total FROM mata_pelajaran'
            );

            const [[akun]] = await db.execute(`
                SELECT
                    COUNT(*) AS total,
                    SUM(status = 'aktif') AS aktif,
                    SUM(status = 'nonaktif') AS nonaktif
                FROM users
            `);

            res.render('admin/dashboard', {
                user: req.session.user,
                statistik: {
                    guru: guru.total,
                    murid: murid.total,
                    kelas: kelas.total,
                    mapel: mapel.total,
                    akun: akun.total,
                    aktif: akun.aktif || 0,
                    nonaktif: akun.nonaktif || 0
                }
            });

        } catch (error) {
            console.error('Dashboard Admin:', error);
            res.status(500).send('Gagal memuat dashboard admin.');
        }
    }
);
// =====================================
// MANAJEMEN DATA GURU
// =====================================

const bcrypt = require('bcrypt');

// GENERATE USERNAME GURU
async function generateGuruUsername(nama) {
    const base = nama
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 40) || 'guru';

    let username;

    do {
        const angka = Math.floor(1000 + Math.random() * 9000);
        username = `${base}${angka}`;

        const [rows] = await db.execute(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );

        if (rows.length === 0) break;

    } while (true);

    return username;
}

// GENERATE PASSWORD GURU
function generateGuruPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

    let password = '';

    for (let i = 0; i < 6; i++) {
        password += chars.charAt(
            Math.floor(Math.random() * chars.length)
        );
    }

    return password;
}

// AMBIL DATA GURU
async function getGuruData() {
    const [guru] = await db.execute(`
        SELECT
            g.id,
            g.nama_guru,
            g.jenis_kelamin,
            g.user_id,
            u.username,
            u.status
        FROM guru g
        LEFT JOIN users u ON u.id = g.user_id
        ORDER BY g.nama_guru ASC
    `);

    return guru;
}

// HALAMAN DATA GURU
router.get(
    '/guru',
    isAuthenticated,
    authorizeRole('admin'),
    async (req, res) => {
        try {
            const guru = await getGuruData();

            const createdAccount = req.session.createdGuru || null;
            delete req.session.createdGuru;

            res.render('admin/guru', {
                user: req.session.user,
                guru,
                createdAccount,
                error: null
            });

        } catch (error) {
            console.error(error);
            res.status(500).send('Gagal mengambil data guru.');
        }
    }
);

// TAMBAH GURU + AKUN OTOMATIS
router.post(
    '/guru/tambah',
    isAuthenticated,
    authorizeRole('admin'),
    async (req, res) => {
        const connection = await db.getConnection();

        try {
            const { nama_guru, jenis_kelamin } = req.body;

            if (
                !nama_guru?.trim() ||
                !['L', 'P'].includes(jenis_kelamin)
            ) {
                return res.status(400).send('Data guru tidak valid.');
            }

            await connection.beginTransaction();

            const username = await generateGuruUsername(nama_guru);
            const password = generateGuruPassword();
            const hashedPassword = await bcrypt.hash(password, 12);

            const [userResult] = await connection.execute(
                `INSERT INTO users
                    (username, password, role, status)
                 VALUES (?, ?, 'guru', 'aktif')`,
                [username, hashedPassword]
            );

            await connection.execute(
                `INSERT INTO guru
                    (user_id, nama_guru, jenis_kelamin)
                 VALUES (?, ?, ?)`,
                [
                    userResult.insertId,
                    nama_guru.trim(),
                    jenis_kelamin
                ]
            );

            await connection.commit();

            req.session.createdGuru = {
                nama: nama_guru.trim(),
                username,
                password
            };

            res.redirect('/admin/guru');

        } catch (error) {
            await connection.rollback();
            console.error('Tambah guru:', error);
            res.status(500).send('Gagal menambahkan guru.');

        } finally {
            connection.release();
        }
    }
);

// EDIT DATA GURU
router.post(
    '/guru/edit/:id',
    isAuthenticated,
    authorizeRole('admin'),
    async (req, res) => {
        try {
            const { nama_guru, jenis_kelamin } = req.body;
            const { id } = req.params;

            if (
                !nama_guru?.trim() ||
                !['L', 'P'].includes(jenis_kelamin)
            ) {
                return res.status(400).send('Data guru tidak valid.');
            }

            const [result] = await db.execute(
                `UPDATE guru
                 SET nama_guru = ?, jenis_kelamin = ?
                 WHERE id = ?`,
                [nama_guru.trim(), jenis_kelamin, id]
            );

            if (result.affectedRows === 0) {
                return res.status(404).send('Guru tidak ditemukan.');
            }

            res.redirect('/admin/guru');

        } catch (error) {
            console.error(error);
            res.status(500).send('Gagal mengedit data guru.');
        }
    }
);

// HAPUS GURU DAN AKUNNYA
router.post(
    '/guru/hapus/:id',
    isAuthenticated,
    authorizeRole('admin'),
    async (req, res) => {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [rows] = await connection.execute(
                'SELECT id, user_id FROM guru WHERE id = ?',
                [req.params.id]
            );

            if (rows.length === 0) {
                await connection.rollback();
                return res.status(404).send('Guru tidak ditemukan.');
            }

            const guru = rows[0];

            const [jadwal] = await connection.execute(
                'SELECT COUNT(*) AS total FROM jadwal_pelajaran WHERE guru_id = ?',
                [guru.id]
            );

            if (jadwal[0].total > 0) {
                await connection.rollback();
                return res.status(400).send(
                    'Guru masih memiliki jadwal pelajaran. Hapus atau pindahkan jadwal terlebih dahulu.'
                );
            }

            await connection.execute(
                'DELETE FROM guru WHERE id = ?',
                [guru.id]
            );

            if (guru.user_id) {
                await connection.execute(
                    'DELETE FROM users WHERE id = ? AND role = ?',
                    [guru.user_id, 'guru']
                );
            }

            await connection.commit();

            res.redirect('/admin/guru');

        } catch (error) {
            await connection.rollback();
            console.error(error);
            res.status(500).send('Gagal menghapus guru.');

        } finally {
            connection.release();
        }
    }
);

// AKTIF / NONAKTIF AKUN GURU
router.post(
    '/guru/status/:id',
    isAuthenticated,
    authorizeRole('admin'),
    async (req, res) => {
        try {
            const [rows] = await db.execute(
                'SELECT user_id FROM guru WHERE id = ?',
                [req.params.id]
            );

            if (!rows.length || !rows[0].user_id) {
                return res.status(404).send('Akun guru tidak ditemukan.');
            }

            await db.execute(
                `UPDATE users
                 SET status = IF(status = 'aktif', 'nonaktif', 'aktif')
                 WHERE id = ? AND role = 'guru'`,
                [rows[0].user_id]
            );

            res.redirect('/admin/guru');

        } catch (error) {
            console.error(error);
            res.status(500).send('Gagal mengubah status akun.');
        }
    }
);

// ======================================
// MANAJEMEN DATA MURID
// ======================================

async function generateMuridUsername(nama) {
    const base = nama.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 40) || 'murid';

    while (true) {
        const username = `${base}${crypto.randomInt(1000, 10000)}`;

        const [rows] = await db.execute(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );

        if (rows.length === 0) return username;
    }
}

function generateMuridPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';

    for (let i = 0; i < 6; i++) {
        password += chars[crypto.randomInt(chars.length)];
    }

    return password;
}

async function getMuridData() {
    const [murid] = await db.execute(`
        SELECT
            m.id,
            m.nama_murid,
            m.jenis_kelamin,
            m.kelas_id,
            k.nama_kelas,
            k.tingkat,
            k.jurusan,
            m.user_id,
            u.username,
            u.status
        FROM murid m
        JOIN kelas k ON k.id = m.kelas_id
        LEFT JOIN users u ON u.id = m.user_id
        ORDER BY k.tingkat, k.jurusan, m.nama_murid
    `);

    return murid;
}

router.get('/murid', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const murid = await getMuridData();

        const [kelas] = await db.execute(`
            SELECT id, nama_kelas, tingkat, jurusan
            FROM kelas
            ORDER BY tingkat, jurusan
        `);

        const createdAccount = req.session.createdMurid || null;
        delete req.session.createdMurid;

        res.render('admin/murid', {
            user: req.session.user,
            murid,
            kelas,
            createdAccount,
            error: null
        });
    } catch (error) {
        console.error('Data Murid:', error);
        res.status(500).send('Gagal memuat data murid.');
    }
});

// TAMBAH MURID
router.post('/murid/tambah', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    const connection = await db.getConnection();

    try {
        const { nama_murid, jenis_kelamin, kelas_id } = req.body;

        if (
            !nama_murid?.trim() ||
            !['L', 'P'].includes(jenis_kelamin) ||
            !kelas_id
        ) {
            return res.status(400).send('Data murid tidak valid.');
        }

        const [kelas] = await connection.execute(
            'SELECT id FROM kelas WHERE id = ?',
            [kelas_id]
        );

        if (kelas.length === 0) {
            return res.status(400).send('Kelas tidak ditemukan.');
        }

        await connection.beginTransaction();

        const username = await generateMuridUsername(nama_murid);
        const password = generateMuridPassword();
        const hashedPassword = await bcrypt.hash(password, 12);

        const [userResult] = await connection.execute(`
            INSERT INTO users (username, password, role, status)
            VALUES (?, ?, 'murid', 'aktif')
        `, [username, hashedPassword]);

        await connection.execute(`
            INSERT INTO murid (user_id, kelas_id, nama_murid, jenis_kelamin)
            VALUES (?, ?, ?, ?)
        `, [
            userResult.insertId,
            kelas_id,
            nama_murid.trim(),
            jenis_kelamin
        ]);

        await connection.commit();

        req.session.createdMurid = {
            nama: nama_murid.trim(),
            username,
            password
        };

        res.redirect('/admin/murid');

    } catch (error) {
        await connection.rollback();
        console.error('Tambah Murid:', error);
        res.status(500).send('Gagal menambahkan murid. Periksa kembali data dan struktur database.');
    } finally {
        connection.release();
    }
});

// EDIT MURID
router.post('/murid/edit/:id', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const { nama_murid, jenis_kelamin, kelas_id } = req.body;

        if (
            !nama_murid?.trim() ||
            !['L', 'P'].includes(jenis_kelamin) ||
            !kelas_id
        ) {
            return res.status(400).send('Data murid tidak valid.');
        }

        const [kelas] = await db.execute(
            'SELECT id FROM kelas WHERE id = ?',
            [kelas_id]
        );

        if (kelas.length === 0) {
            return res.status(400).send('Kelas tidak ditemukan.');
        }

        await db.execute(`
            UPDATE murid
            SET nama_murid = ?, jenis_kelamin = ?, kelas_id = ?
            WHERE id = ?
        `, [nama_murid.trim(), jenis_kelamin, kelas_id, req.params.id]);

        res.redirect('/admin/murid');

    } catch (error) {
        console.error('Edit Murid:', error);
        res.status(500).send('Gagal mengubah data murid.');
    }
});

// HAPUS MURID DAN AKUN
router.post('/murid/hapus/:id', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            'SELECT id, user_id FROM murid WHERE id = ?',
            [req.params.id]
        );

        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).send('Data murid tidak ditemukan.');
        }

        const userId = rows[0].user_id;

        await connection.execute(
            'DELETE FROM murid WHERE id = ?',
            [req.params.id]
        );

        if (userId) {
            await connection.execute(
                "DELETE FROM users WHERE id = ? AND role = 'murid'",
                [userId]
            );
        }

        await connection.commit();
        res.redirect('/admin/murid');

    } catch (error) {
        await connection.rollback();
        console.error('Hapus Murid:', error);
        res.status(500).send('Gagal menghapus murid. Data mungkin masih digunakan oleh riwayat absensi.');
    } finally {
        connection.release();
    }
});

// AKTIF / NONAKTIF AKUN MURID
router.post('/murid/status/:id', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT user_id FROM murid WHERE id = ?',
            [req.params.id]
        );

        if (rows.length === 0 || !rows[0].user_id) {
            return res.status(404).send('Akun murid tidak ditemukan.');
        }

        await db.execute(`
            UPDATE users
            SET status = IF(status = 'aktif', 'nonaktif', 'aktif')
            WHERE id = ? AND role = 'murid'
        `, [rows[0].user_id]);

        res.redirect('/admin/murid');

    } catch (error) {
        console.error('Status Murid:', error);
        res.status(500).send('Gagal mengubah status akun murid.');
    }
});

// ======================================
// MANAJEMEN DATA KELAS
// ======================================

async function getKelasData() {
    const [kelas] = await db.execute(`
        SELECT
            k.id,
            k.nama_kelas,
            k.tingkat,
            k.jurusan,
            (SELECT COUNT(*) FROM murid m WHERE m.kelas_id = k.id) AS total_murid,
            (SELECT COUNT(*) FROM jadwal_pelajaran j WHERE j.kelas_id = k.id) AS total_jadwal
        FROM kelas k
        ORDER BY
            FIELD(k.tingkat, 'X', 'XI', 'XII'),
            FIELD(k.jurusan, 'IPA', 'IPS')
    `);

    return kelas;
}

router.get('/kelas', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const kelas = await getKelasData();

        res.render('admin/kelas', {
            user: req.session.user,
            kelas
        });
    } catch (error) {
        console.error('Data Kelas:', error);
        res.status(500).send('Gagal memuat data kelas.');
    }
});

// TAMBAH KELAS
router.post('/kelas/tambah', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const { tingkat, jurusan } = req.body;

        if (!['X', 'XI', 'XII'].includes(tingkat) ||
            !['IPA', 'IPS'].includes(jurusan)) {
            return res.status(400).send('Tingkat atau jurusan tidak valid.');
        }

        const nama_kelas = `${tingkat} ${jurusan}`;

        const [existing] = await db.execute(
            'SELECT id FROM kelas WHERE tingkat = ? AND jurusan = ?',
            [tingkat, jurusan]
        );

        if (existing.length > 0) {
            return res.status(400).send('Kelas tersebut sudah tersedia.');
        }

        await db.execute(`
            INSERT INTO kelas (nama_kelas, tingkat, jurusan)
            VALUES (?, ?, ?)
        `, [nama_kelas, tingkat, jurusan]);

        res.redirect('/admin/kelas');

    } catch (error) {
        console.error('Tambah Kelas:', error);
        res.status(500).send('Gagal menambahkan kelas.');
    }
});

// EDIT KELAS
router.post('/kelas/edit/:id', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const { tingkat, jurusan } = req.body;

        if (!['X', 'XI', 'XII'].includes(tingkat) ||
            !['IPA', 'IPS'].includes(jurusan)) {
            return res.status(400).send('Tingkat atau jurusan tidak valid.');
        }

        const nama_kelas = `${tingkat} ${jurusan}`;

        const [existing] = await db.execute(`
            SELECT id FROM kelas
            WHERE tingkat = ? AND jurusan = ? AND id != ?
        `, [tingkat, jurusan, req.params.id]);

        if (existing.length > 0) {
            return res.status(400).send('Kelas tersebut sudah tersedia.');
        }

        const [result] = await db.execute(`
            UPDATE kelas
            SET nama_kelas = ?, tingkat = ?, jurusan = ?
            WHERE id = ?
        `, [nama_kelas, tingkat, jurusan, req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).send('Kelas tidak ditemukan.');
        }

        res.redirect('/admin/kelas');

    } catch (error) {
        console.error('Edit Kelas:', error);
        res.status(500).send('Gagal mengubah data kelas.');
    }
});

// HAPUS KELAS
router.post('/kelas/hapus/:id', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT id FROM kelas WHERE id = ?',
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).send('Kelas tidak ditemukan.');
        }

        const [[murid]] = await db.execute(
            'SELECT COUNT(*) AS total FROM murid WHERE kelas_id = ?',
            [req.params.id]
        );

        const [[jadwal]] = await db.execute(
            'SELECT COUNT(*) AS total FROM jadwal_pelajaran WHERE kelas_id = ?',
            [req.params.id]
        );

        if (murid.total > 0 || jadwal.total > 0) {
            return res.status(400).send(
                `Kelas tidak dapat dihapus karena masih digunakan oleh ${murid.total} murid dan ${jadwal.total} jadwal pelajaran.`
            );
        }

        await db.execute(
            'DELETE FROM kelas WHERE id = ?',
            [req.params.id]
        );

        res.redirect('/admin/kelas');

    } catch (error) {
        console.error('Hapus Kelas:', error);
        res.status(500).send('Gagal menghapus kelas.');
    }
});
// ======================================
// MANAJEMEN MATA PELAJARAN
// ======================================

async function getMapelData() {
    const [mapel] = await db.execute(`
        SELECT
            m.id,
            m.nama_mapel,
            (SELECT COUNT(*) FROM jadwal_pelajaran j WHERE j.mapel_id = m.id) AS total_jadwal
        FROM mata_pelajaran m
        ORDER BY m.nama_mapel ASC
    `);

    return mapel;
}

router.get('/mapel', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const mapel = await getMapelData();

        res.render('admin/mapel', {
            user: req.session.user,
            mapel
        });
    } catch (error) {
        console.error('Data Mapel:', error);
        res.status(500).send('Gagal memuat data mata pelajaran.');
    }
});

// TAMBAH MAPEL
router.post('/mapel/tambah', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const nama_mapel = (req.body.nama_mapel || '').trim();

        if (!nama_mapel || nama_mapel.length > 100) {
            return res.status(400).send('Nama mata pelajaran wajib diisi (maksimal 100 karakter).');
        }

        const [existing] = await db.execute(
            'SELECT id FROM mata_pelajaran WHERE nama_mapel = ?',
            [nama_mapel]
        );

        if (existing.length > 0) {
            return res.status(400).send('Mata pelajaran tersebut sudah tersedia.');
        }

        await db.execute(
            'INSERT INTO mata_pelajaran (nama_mapel) VALUES (?)',
            [nama_mapel]
        );

        res.redirect('/admin/mapel');

    } catch (error) {
        console.error('Tambah Mapel:', error);
        res.status(500).send('Gagal menambahkan mata pelajaran.');
    }
});

// EDIT MAPEL
router.post('/mapel/edit/:id', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const nama_mapel = (req.body.nama_mapel || '').trim();

        if (!nama_mapel || nama_mapel.length > 100) {
            return res.status(400).send('Nama mata pelajaran wajib diisi (maksimal 100 karakter).');
        }

        const [existing] = await db.execute(
            'SELECT id FROM mata_pelajaran WHERE nama_mapel = ? AND id != ?',
            [nama_mapel, req.params.id]
        );

        if (existing.length > 0) {
            return res.status(400).send('Mata pelajaran tersebut sudah tersedia.');
        }

        const [result] = await db.execute(
            'UPDATE mata_pelajaran SET nama_mapel = ? WHERE id = ?',
            [nama_mapel, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).send('Mata pelajaran tidak ditemukan.');
        }

        res.redirect('/admin/mapel');

    } catch (error) {
        console.error('Edit Mapel:', error);
        res.status(500).send('Gagal mengubah mata pelajaran.');
    }
});

// HAPUS MAPEL
router.post('/mapel/hapus/:id', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const [rows] = await db.execute(
            'SELECT id FROM mata_pelajaran WHERE id = ?',
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).send('Mata pelajaran tidak ditemukan.');
        }

        const [[jadwal]] = await db.execute(
            'SELECT COUNT(*) AS total FROM jadwal_pelajaran WHERE mapel_id = ?',
            [req.params.id]
        );

        if (jadwal.total > 0) {
            return res.status(400).send(
                `Mata pelajaran tidak dapat dihapus karena masih digunakan oleh ${jadwal.total} jadwal pelajaran.`
            );
        }

        await db.execute(
            'DELETE FROM mata_pelajaran WHERE id = ?',
            [req.params.id]
        );

        res.redirect('/admin/mapel');

    } catch (error) {
        console.error('Hapus Mapel:', error);
        res.status(500).send('Gagal menghapus mata pelajaran.');
    }
});

// ======================================
// JADWAL PELAJARAN
// ======================================

// HALAMAN JADWAL
router.get('/jadwal', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const [jadwal] = await db.execute(`
            SELECT
                j.id,
                j.guru_id,
                j.kelas_id,
                j.mapel_id,
                j.hari,
                j.jam_mulai,
                j.jam_selesai,
                g.nama_guru,
                k.nama_kelas,
                m.nama_mapel
            FROM jadwal_pelajaran j
            JOIN guru g ON g.id = j.guru_id
            JOIN kelas k ON k.id = j.kelas_id
            JOIN mata_pelajaran m ON m.id = j.mapel_id
            ORDER BY
                FIELD(j.hari, 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'),
                j.jam_mulai,
                k.nama_kelas
        `);

        const [guru] = await db.execute(`
            SELECT id, nama_guru FROM guru ORDER BY nama_guru ASC
        `);

        const [kelas] = await db.execute(`
            SELECT id, nama_kelas FROM kelas
            ORDER BY FIELD(tingkat, 'X', 'XI', 'XII'), jurusan
        `);

        const [mapel] = await db.execute(`
            SELECT id, nama_mapel FROM mata_pelajaran
            ORDER BY nama_mapel ASC
        `);

        res.render('admin/jadwal', {
            title: 'Jadwal Pelajaran',
            jadwal,
            guru,
            kelas,
            mapel,
            success: req.query.success || '',
            error: req.query.error || ''
        });

    } catch (error) {
        console.error('Gagal mengambil jadwal:', error);
        res.status(500).send('Gagal memuat halaman jadwal pelajaran.');
    }
});


// TAMBAH JADWAL
router.post('/jadwal/tambah', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const { guru_id, kelas_id, mapel_id, hari, jam_mulai, jam_selesai } = req.body;

        const hariValid = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

        if (!guru_id || !kelas_id || !mapel_id || !hari || !jam_mulai || !jam_selesai) {
            return res.redirect('/admin/jadwal?error=' + encodeURIComponent('Semua kolom wajib diisi.'));
        }

        if (!hariValid.includes(hari)) {
            return res.redirect('/admin/jadwal?error=' + encodeURIComponent('Hari tidak valid.'));
        }

        if (jam_mulai >= jam_selesai) {
            return res.redirect('/admin/jadwal?error=' + encodeURIComponent('Jam selesai harus lebih besar dari jam mulai.'));
        }

        // Cek bentrok pada kelas yang sama.
        // Guru boleh mengajar beberapa kelas pada waktu bersamaan.
        const [bentrok] = await db.execute(`
            SELECT id FROM jadwal_pelajaran
            WHERE kelas_id = ?
              AND hari = ?
              AND jam_mulai < ?
              AND jam_selesai > ?
            LIMIT 1
        `, [kelas_id, hari, jam_selesai, jam_mulai]);

        if (bentrok.length > 0) {
            return res.redirect('/admin/jadwal?error=' + encodeURIComponent('Jadwal kelas tersebut bertabrakan dengan jadwal lain.'));
        }

        await db.execute(`
            INSERT INTO jadwal_pelajaran
            (guru_id, kelas_id, mapel_id, hari, jam_mulai, jam_selesai)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [guru_id, kelas_id, mapel_id, hari, jam_mulai, jam_selesai]);

        res.redirect('/admin/jadwal?success=' + encodeURIComponent('Jadwal berhasil ditambahkan.'));

    } catch (error) {
        console.error('Gagal menambahkan jadwal:', error);
        res.redirect('/admin/jadwal?error=' + encodeURIComponent('Terjadi kesalahan saat menambahkan jadwal.'));
    }
});


// EDIT JADWAL
router.post('/jadwal/edit/:id', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const { guru_id, kelas_id, mapel_id, hari, jam_mulai, jam_selesai } = req.body;
        const { id } = req.params;

        const hariValid = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

        if (!guru_id || !kelas_id || !mapel_id || !hari || !jam_mulai || !jam_selesai) {
            return res.redirect('/admin/jadwal?error=' + encodeURIComponent('Semua kolom wajib diisi.'));
        }

        if (!hariValid.includes(hari) || jam_mulai >= jam_selesai) {
            return res.redirect('/admin/jadwal?error=' + encodeURIComponent('Hari atau rentang waktu tidak valid.'));
        }

        const [bentrok] = await db.execute(`
            SELECT id FROM jadwal_pelajaran
            WHERE kelas_id = ?
              AND hari = ?
              AND jam_mulai < ?
              AND jam_selesai > ?
              AND id != ?
            LIMIT 1
        `, [kelas_id, hari, jam_selesai, jam_mulai, id]);

        if (bentrok.length > 0) {
            return res.redirect('/admin/jadwal?error=' + encodeURIComponent('Jadwal kelas tersebut bertabrakan dengan jadwal lain.'));
        }

        await db.execute(`
            UPDATE jadwal_pelajaran
            SET guru_id = ?,
                kelas_id = ?,
                mapel_id = ?,
                hari = ?,
                jam_mulai = ?,
                jam_selesai = ?
            WHERE id = ?
        `, [guru_id, kelas_id, mapel_id, hari, jam_mulai, jam_selesai, id]);

        res.redirect('/admin/jadwal?success=' + encodeURIComponent('Jadwal berhasil diperbarui.'));

    } catch (error) {
        console.error('Gagal mengedit jadwal:', error);
        res.redirect('/admin/jadwal?error=' + encodeURIComponent('Terjadi kesalahan saat mengedit jadwal.'));
    }
});


// HAPUS JADWAL
router.post('/jadwal/hapus/:id', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        await db.execute(
            'DELETE FROM jadwal_pelajaran WHERE id = ?',
            [req.params.id]
        );

        res.redirect('/admin/jadwal?success=' + encodeURIComponent('Jadwal berhasil dihapus.'));

    } catch (error) {
        console.error('Gagal menghapus jadwal:', error);
        res.redirect('/admin/jadwal?error=' + encodeURIComponent('Gagal menghapus jadwal.'));
    }
});

// ======================================
// KELOLA AKUN
// ======================================

// HALAMAN KELOLA AKUN
router.get('/akun', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const [akun] = await db.execute(`
            SELECT
                u.id,
                u.username,
                u.role,
                u.status,
                u.created_at,
                COALESCE(g.nama_guru, m.nama_murid, 'Administrator') AS nama
            FROM users u
            LEFT JOIN guru g ON g.user_id = u.id
            LEFT JOIN murid m ON m.user_id = u.id
            ORDER BY FIELD(u.role, 'admin', 'guru', 'murid'), u.username ASC
        `);

        const [guru] = await db.execute(`
            SELECT id, nama_guru
            FROM guru
            WHERE user_id IS NULL
            ORDER BY nama_guru ASC
        `);

        const [murid] = await db.execute(`
            SELECT id, nama_murid
            FROM murid
            WHERE user_id IS NULL
            ORDER BY nama_murid ASC
        `);

        res.render('admin/akun', {
            title: 'Kelola Akun',
            akun,
            guru,
            murid,
            success: req.query.success || '',
            error: req.query.error || ''
        });

    } catch (error) {
        console.error('Gagal memuat akun:', error);
        res.status(500).send('Gagal memuat halaman kelola akun.');
    }
});


// TAMBAH AKUN GURU / MURID
router.post('/akun/tambah', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    const connection = await db.getConnection();

    try {
        const { role, profil_id, username, password } = req.body;

        if (!['guru', 'murid'].includes(role)) {
            return res.redirect('/admin/akun?error=' + encodeURIComponent('Role akun tidak valid.'));
        }

        if (!profil_id || !username || !password) {
            return res.redirect('/admin/akun?error=' + encodeURIComponent('Semua kolom wajib diisi.'));
        }

        if (!/^[a-zA-Z0-9]+$/.test(password) || password.length !== 6) {
            return res.redirect('/admin/akun?error=' + encodeURIComponent('Password Guru dan Murid harus tepat 6 karakter alfanumerik.'));
        }

        if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.redirect('/admin/akun?error=' + encodeURIComponent('Username hanya boleh berisi huruf, angka, dan garis bawah.'));
        }

        const tabel = role === 'guru' ? 'guru' : 'murid';
        const kolomId = 'id';

        await connection.beginTransaction();

        const [profil] = await connection.execute(
            `SELECT id, user_id FROM ${tabel} WHERE ${kolomId} = ? FOR UPDATE`,
            [profil_id]
        );

        if (profil.length === 0 || profil[0].user_id !== null) {
            await connection.rollback();
            return res.redirect('/admin/akun?error=' + encodeURIComponent('Profil tidak ditemukan atau sudah memiliki akun.'));
        }

        const [existing] = await connection.execute(
            'SELECT id FROM users WHERE username = ?',
            [username]
        );

        if (existing.length > 0) {
            await connection.rollback();
            return res.redirect('/admin/akun?error=' + encodeURIComponent('Username sudah digunakan.'));
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await connection.execute(`
            INSERT INTO users (username, password, role, status)
            VALUES (?, ?, ?, 'aktif')
        `, [username, hashedPassword, role]);

        await connection.execute(
            `UPDATE ${tabel} SET user_id = ? WHERE id = ?`,
            [result.insertId, profil_id]
        );

        await connection.commit();

        res.redirect('/admin/akun?success=' + encodeURIComponent('Akun berhasil dibuat.'));

    } catch (error) {
        await connection.rollback();
        console.error('Gagal membuat akun:', error);

        res.redirect('/admin/akun?error=' + encodeURIComponent('Gagal membuat akun. Periksa kembali data yang dimasukkan.'));

    } finally {
        connection.release();
    }
});


// EDIT AKUN
router.post('/akun/edit/:id', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const { username, password } = req.body;
        const { id } = req.params;

        if (!username || !/^[a-zA-Z0-9_]+$/.test(username)) {
            return res.redirect('/admin/akun?error=' + encodeURIComponent('Username tidak valid.'));
        }

        const [akun] = await db.execute(
            'SELECT id, role FROM users WHERE id = ? AND role IN (?, ?)',
            [id, 'guru', 'murid']
        );

        if (akun.length === 0) {
            return res.redirect('/admin/akun?error=' + encodeURIComponent('Akun tidak ditemukan atau tidak dapat diubah.'));
        }

        const [usernameDipakai] = await db.execute(
            'SELECT id FROM users WHERE username = ? AND id != ?',
            [username, id]
        );

        if (usernameDipakai.length > 0) {
            return res.redirect('/admin/akun?error=' + encodeURIComponent('Username sudah digunakan.'));
        }

        if (password) {
            if (!/^[a-zA-Z0-9]+$/.test(password) || password.length !== 6) {
                return res.redirect('/admin/akun?error=' + encodeURIComponent('Password Guru dan Murid harus tepat 6 karakter alfanumerik.'));
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            await db.execute(
                'UPDATE users SET username = ?, password = ? WHERE id = ?',
                [username, hashedPassword, id]
            );
        } else {
            await db.execute(
                'UPDATE users SET username = ? WHERE id = ?',
                [username, id]
            );
        }

        res.redirect('/admin/akun?success=' + encodeURIComponent('Akun berhasil diperbarui.'));

    } catch (error) {
        console.error('Gagal mengedit akun:', error);
        res.redirect('/admin/akun?error=' + encodeURIComponent('Gagal memperbarui akun.'));
    }
});


// AKTIF / NONAKTIF AKUN
router.post('/akun/status/:id', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const [result] = await db.execute(`
            UPDATE users
            SET status = IF(status = 'aktif', 'nonaktif', 'aktif')
            WHERE id = ? AND role IN ('guru', 'murid')
        `, [req.params.id]);

        if (result.affectedRows === 0) {
            return res.redirect('/admin/akun?error=' + encodeURIComponent('Akun tidak ditemukan atau tidak dapat diubah.'));
        }

        res.redirect('/admin/akun?success=' + encodeURIComponent('Status akun berhasil diperbarui.'));

    } catch (error) {
        console.error('Gagal mengubah status akun:', error);
        res.redirect('/admin/akun?error=' + encodeURIComponent('Gagal mengubah status akun.'));
    }
});


// HAPUS AKUN
router.post('/akun/hapus/:id', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    const connection = await db.getConnection();

    try {
        const { id } = req.params;

        await connection.beginTransaction();

        const [akun] = await connection.execute(`
            SELECT id, role
            FROM users
            WHERE id = ? AND role IN ('guru', 'murid')
            FOR UPDATE
        `, [id]);

        if (akun.length === 0) {
            await connection.rollback();
            return res.redirect('/admin/akun?error=' + encodeURIComponent('Akun tidak ditemukan atau tidak dapat dihapus.'));
        }

        if (akun[0].role === 'guru') {
            await connection.execute(
                'UPDATE guru SET user_id = NULL WHERE user_id = ?',
                [id]
            );
        } else {
            await connection.execute(
                'UPDATE murid SET user_id = NULL WHERE user_id = ?',
                [id]
            );
        }

        await connection.execute(
            'DELETE FROM users WHERE id = ?',
            [id]
        );

        await connection.commit();

        res.redirect('/admin/akun?success=' + encodeURIComponent('Akun berhasil dihapus.'));

    } catch (error) {
        await connection.rollback();
        console.error('Gagal menghapus akun:', error);

        res.redirect('/admin/akun?error=' + encodeURIComponent('Gagal menghapus akun.'));

    } finally {
        connection.release();
    }
});

// ======================================
// DATA ABSENSI
// ======================================

// HALAMAN DATA ABSENSI
router.get('/absensi', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const {
            tanggal = '',
            kelas_id = '',
            status = '',
            guru_id = '',
            page = '1'
        } = req.query;

        const limit = 10;
        const currentPage = Math.max(1, parseInt(page, 10) || 1);
        const offset = (currentPage - 1) * limit;

        const kondisi = [];
        const params = [];

        if (tanggal) {
            kondisi.push('a.tanggal = ?');
            params.push(tanggal);
        }

        if (kelas_id) {
            kondisi.push('k.id = ?');
            params.push(kelas_id);
        }

        if (status && ['Hadir', 'Izin', 'Sakit', 'Alpa'].includes(status)) {
            kondisi.push('a.status = ?');
            params.push(status);
        }

        if (guru_id) {
            kondisi.push('g.id = ?');
            params.push(guru_id);
        }

        const whereSQL = kondisi.length
            ? 'WHERE ' + kondisi.join(' AND ')
            : '';

        const [statistik] = await db.execute(`
            SELECT
                COUNT(*) AS total,
                SUM(a.status = 'Hadir') AS hadir,
                SUM(a.status = 'Izin') AS izin,
                SUM(a.status = 'Sakit') AS sakit,
                SUM(a.status = 'Alpa') AS alpa
            FROM absensi a
            JOIN jadwal_pelajaran j ON j.id = a.jadwal_id
            JOIN guru g ON g.id = j.guru_id
            JOIN kelas k ON k.id = j.kelas_id
            JOIN mata_pelajaran mp ON mp.id = j.mapel_id
            JOIN murid m ON m.id = a.murid_id
            ${whereSQL}
        `, params);

        const [jumlah] = await db.execute(`
            SELECT COUNT(*) AS total
            FROM absensi a
            JOIN jadwal_pelajaran j ON j.id = a.jadwal_id
            JOIN guru g ON g.id = j.guru_id
            JOIN kelas k ON k.id = j.kelas_id
            JOIN mata_pelajaran mp ON mp.id = j.mapel_id
            JOIN murid m ON m.id = a.murid_id
            ${whereSQL}
        `, params);

        const totalData = jumlah[0].total;
        const totalPages = Math.ceil(totalData / limit);

        const [absensi] = await db.execute(`
            SELECT
                a.id,
                a.tanggal,
                a.status,
                a.keterangan,
                a.created_at,
                a.updated_at,
                a.jadwal_id,
                a.murid_id,
                m.nama_murid,
                k.nama_kelas,
                g.nama_guru,
                mp.nama_mapel,
                j.hari,
                j.jam_mulai,
                j.jam_selesai,
                pencatat.username AS nama_pencatat,
                pengubah.username AS nama_pengubah
            FROM absensi a
            JOIN jadwal_pelajaran j ON j.id = a.jadwal_id
            JOIN guru g ON g.id = j.guru_id
            JOIN kelas k ON k.id = j.kelas_id
            JOIN mata_pelajaran mp ON mp.id = j.mapel_id
            JOIN murid m ON m.id = a.murid_id
            JOIN users pencatat ON pencatat.id = a.dicatat_oleh
            LEFT JOIN users pengubah ON pengubah.id = a.diubah_oleh
            ${whereSQL}
            ORDER BY a.tanggal DESC, j.jam_mulai DESC, m.nama_murid ASC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        const [kelas] = await db.execute(`
            SELECT id, nama_kelas
            FROM kelas
            ORDER BY FIELD(tingkat, 'X', 'XI', 'XII'), jurusan
        `);

        const [guru] = await db.execute(`
            SELECT id, nama_guru
            FROM guru
            ORDER BY nama_guru ASC
        `);

        res.render('admin/absensi', {
            user: req.session.user,
            title: 'Data Absensi',
            absensi,
            kelas,
            guru,
            statistik: statistik[0],
            filters: { tanggal, kelas_id, status, guru_id },
            currentPage,
            totalPages,
            totalData,
            success: req.query.success || '',
            error: req.query.error || ''
        });

    } catch (error) {
        console.error('Data Absensi:', error);
        res.status(500).send('Gagal memuat data absensi.');
    }
});


// EDIT ABSENSI
router.post('/absensi/edit/:id', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const { status, keterangan } = req.body;
        const id = Number(req.params.id);

        const statusValid = ['Hadir', 'Izin', 'Sakit', 'Alpa'];

        if (!Number.isInteger(id) || id < 1 ||
            !statusValid.includes(status)) {
            return res.redirect('/admin/absensi?error=' +
                encodeURIComponent('Data absensi atau status tidak valid.'));
        }

        if (keterangan && keterangan.length > 255) {
            return res.redirect('/admin/absensi?error=' +
                encodeURIComponent('Keterangan maksimal 255 karakter.'));
        }

        const [result] = await db.execute(`
            UPDATE absensi
            SET status = ?,
                keterangan = ?,
                diubah_oleh = ?
            WHERE id = ?
        `, [
            status,
            keterangan?.trim() || null,
            req.session.user.id,
            id
        ]);

        if (result.affectedRows === 0) {
            return res.redirect('/admin/absensi?error=' +
                encodeURIComponent('Data absensi tidak ditemukan.'));
        }

        res.redirect('/admin/absensi?success=' +
            encodeURIComponent('Data absensi berhasil diperbarui.'));

    } catch (error) {
        console.error('Edit Absensi:', error);
        res.redirect('/admin/absensi?error=' +
            encodeURIComponent('Gagal memperbarui data absensi.'));
    }
});


// HAPUS ABSENSI
router.post('/absensi/hapus/:id', isAuthenticated, authorizeRole('admin'), async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id < 1) {
            return res.redirect('/admin/absensi?error=' +
                encodeURIComponent('ID absensi tidak valid.'));
        }

        const [result] = await db.execute(
            'DELETE FROM absensi WHERE id = ?',
            [id]
        );

        if (result.affectedRows === 0) {
            return res.redirect('/admin/absensi?error=' +
                encodeURIComponent('Data absensi tidak ditemukan.'));
        }

        res.redirect('/admin/absensi?success=' +
            encodeURIComponent('Data absensi berhasil dihapus.'));

    } catch (error) {
        console.error('Hapus Absensi:', error);
        res.redirect('/admin/absensi?error=' +
            encodeURIComponent('Gagal menghapus data absensi.'));
    }
});

module.exports = router;
