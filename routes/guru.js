
const express = require('express');
const db = require('../config/database');
const { isAuthenticated } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/role');

const router = express.Router();

// Semua halaman hanya dapat diakses akun Guru
router.use(isAuthenticated, authorizeRole('guru'));

// ======================================
// KONSTANTA DAN HELPER
// ======================================

const namaHari = [
    'Minggu',
    'Senin',
    'Selasa',
    'Rabu',
    'Kamis',
    'Jumat',
    'Sabtu'
];

const statusValid = ['Hadir', 'Izin', 'Sakit', 'Alpa'];

// Mengambil tanggal lokal server dalam format YYYY-MM-DD
function tanggalLokal(date = new Date()) {
    const tahun = date.getFullYear();
    const bulan = String(date.getMonth() + 1).padStart(2, '0');
    const tanggal = String(date.getDate()).padStart(2, '0');

    return `${tahun}-${bulan}-${tanggal}`;
}

// Mengambil waktu lokal server dalam format HH:mm:ss
function waktuLokal(date = new Date()) {
    const jam = String(date.getHours()).padStart(2, '0');
    const menit = String(date.getMinutes()).padStart(2, '0');
    const detik = String(date.getSeconds()).padStart(2, '0');

    return `${jam}:${menit}:${detik}`;
}

// Memastikan ID berupa angka positif
function idValid(id) {
    return /^\d+$/.test(String(id)) && Number(id) > 0;
}

// Mengubah nilai TIME MySQL menjadi HH:mm
function formatJam(value) {
    if (value instanceof Date) {
        const jam = String(value.getHours()).padStart(2, '0');
        const menit = String(value.getMinutes()).padStart(2, '0');

        return `${jam}:${menit}`;
    }

    return String(value).slice(0, 5);
}

// Mengambil profil Guru berdasarkan akun yang login
// Mengambil profil Guru berdasarkan akun yang sedang login
async function getGuru(userId) {
    const [rows] = await db.execute(`
        SELECT
            g.id,
            g.nama_guru,
            g.jenis_kelamin,
            u.id AS user_id,
            u.username,
            u.status
        FROM guru g
        INNER JOIN users u ON u.id = g.user_id
        WHERE u.id = ?
        LIMIT 1
    `, [userId]);

    return rows[0] || null;
}

// Memastikan Guru memiliki data profil
async function pastikanGuru(req, res) {
    const guru = await getGuru(req.session.user.id);

    if (!guru) {
        res.status(404).send(
            'Data Guru tidak ditemukan. Hubungi Administrator.'
        );

        return null;
    }

    return guru;
}

// ======================================
// DASHBOARD GURU
// ======================================

router.get('/', async (req, res) => {
    try {
        const guru = await pastikanGuru(req, res);

        if (!guru) return;

        const sekarang = new Date();
        const hariIni = namaHari[sekarang.getDay()];
        const tanggalHariIni = tanggalLokal(sekarang);

        // Jadwal mengajar hari ini
        const [jadwalHariIni] = await db.execute(`
            SELECT
                j.id,
                j.hari,
                j.jam_mulai,
                j.jam_selesai,
                k.nama_kelas,
                k.tingkat,
                k.jurusan,
                mp.nama_mapel
            FROM jadwal_pelajaran j
            INNER JOIN kelas k ON k.id = j.kelas_id
            INNER JOIN mata_pelajaran mp ON mp.id = j.mapel_id
            WHERE j.guru_id = ?
              AND j.hari = ?
            ORDER BY j.jam_mulai ASC
        `, [guru.id, hariIni]);

        // Jumlah seluruh jadwal mengajar
        const [totalJadwal] = await db.execute(`
            SELECT COUNT(*) AS total
            FROM jadwal_pelajaran
            WHERE guru_id = ?
        `, [guru.id]);

        // Jumlah murid dari seluruh kelas yang diajar
        const [totalMurid] = await db.execute(`
            SELECT COUNT(DISTINCT m.id) AS total
            FROM murid m
            INNER JOIN jadwal_pelajaran j
                ON j.kelas_id = m.kelas_id
            WHERE j.guru_id = ?
        `, [guru.id]);

        // Jumlah absensi yang dicatat Guru hari ini
        const [totalAbsensi] = await db.execute(`
            SELECT COUNT(*) AS total
            FROM absensi
            WHERE dicatat_oleh = ?
              AND tanggal = ?
        `, [req.session.user.id, tanggalHariIni]);

        // Ringkasan kehadiran Guru hari ini
        const [ringkasanAbsensi] = await db.execute(`
            SELECT
                COALESCE(SUM(status = 'Hadir'), 0) AS hadir,
                COALESCE(SUM(status = 'Izin'), 0) AS izin,
                COALESCE(SUM(status = 'Sakit'), 0) AS sakit,
                COALESCE(SUM(status = 'Alpa'), 0) AS alpa
            FROM absensi
            WHERE dicatat_oleh = ?
              AND tanggal = ?
        `, [req.session.user.id, tanggalHariIni]);

        res.render('guru/dashboard', {
            user: req.session.user,
            guru,
            hariIni,
            tanggalHariIni,
            jadwalHariIni,
            statistik: {
                jadwal: totalJadwal[0].total,
                murid: totalMurid[0].total,
                absensi: totalAbsensi[0].total
            },
            ringkasan: ringkasanAbsensi[0]
        });

    } catch (error) {
        console.error('Dashboard Guru Error:', error);
        res.status(500).send(
            'Terjadi kesalahan saat memuat Dashboard Guru.'
        );
    }
});

// ======================================
// JADWAL MENGAJAR
// ======================================

router.get('/jadwal', async (req, res) => {
    try {
        const guru = await pastikanGuru(req, res);

        if (!guru) return;

        const [jadwal] = await db.execute(`
            SELECT
                j.id,
                j.hari,
                j.jam_mulai,
                j.jam_selesai,
                k.nama_kelas,
                k.tingkat,
                k.jurusan,
                mp.nama_mapel
            FROM jadwal_pelajaran j
            INNER JOIN kelas k ON k.id = j.kelas_id
            INNER JOIN mata_pelajaran mp ON mp.id = j.mapel_id
            WHERE j.guru_id = ?
            ORDER BY
                FIELD(
                    j.hari,
                    'Senin',
                    'Selasa',
                    'Rabu',
                    'Kamis',
                    'Jumat',
                    'Sabtu'
                ),
                j.jam_mulai ASC
        `, [guru.id]);

        res.render('guru/jadwal', {
            user: req.session.user,
            guru,
            jadwal
        });

    } catch (error) {
        console.error('Jadwal Guru Error:', error);
        res.status(500).send(
            'Terjadi kesalahan saat memuat Jadwal Mengajar.'
        );
    }
});

// ======================================
// ABSENSI MURID - DAFTAR JADWAL HARI INI
// ======================================

router.get('/absensi', async (req, res) => {
    try {
        const guru = await pastikanGuru(req, res);

        if (!guru) return;

        const sekarang = new Date();
        const hariIni = namaHari[sekarang.getDay()];
        const tanggalHariIni = tanggalLokal(sekarang);
        const jamSekarang = waktuLokal(sekarang);

        const [jadwal] = await db.execute(`
            SELECT
                j.id,
                j.hari,
                j.jam_mulai,
                j.jam_selesai,
                k.nama_kelas,
                k.tingkat,
                k.jurusan,
                mp.nama_mapel,

                (
                    SELECT COUNT(*)
                    FROM murid m
                    WHERE m.kelas_id = j.kelas_id
                ) AS total_murid,

                (
                    SELECT COUNT(*)
                    FROM absensi a
                    WHERE a.jadwal_id = j.id
                      AND a.tanggal = ?
                ) AS total_absensi

            FROM jadwal_pelajaran j
            INNER JOIN kelas k ON k.id = j.kelas_id
            INNER JOIN mata_pelajaran mp ON mp.id = j.mapel_id
            WHERE j.guru_id = ?
              AND j.hari = ?
            ORDER BY j.jam_mulai ASC
        `, [tanggalHariIni, guru.id, hariIni]);

        const daftarJadwal = jadwal.map(item => {
            const mulai = String(item.jam_mulai).slice(0, 8);
            const selesai = String(item.jam_selesai).slice(0, 8);

            const sedangBerlangsung =
                jamSekarang >= mulai &&
                jamSekarang <= selesai;

            return {
                ...item,
                sedangBerlangsung,
                sudahDiabsen: Number(item.total_absensi) > 0,
                jamMulai: formatJam(item.jam_mulai),
                jamSelesai: formatJam(item.jam_selesai)
            };
        });

        res.render('guru/absensi', {
            user: req.session.user,
            guru,
            hariIni,
            tanggalHariIni,
            daftarJadwal,
            query: req.query
        });

    } catch (error) {
        console.error('Daftar Absensi Guru Error:', error);
        res.status(500).send(
            'Terjadi kesalahan saat memuat halaman absensi.'
        );
    }
});

// ======================================
// ABSENSI MURID - DETAIL KELAS
// ======================================

router.get('/absensi/:jadwalId', async (req, res) => {
    try {
        if (!idValid(req.params.jadwalId)) {
            return res.status(400).send('ID jadwal tidak valid.');
        }

        const guru = await pastikanGuru(req, res);

        if (!guru) return;

        const sekarang = new Date();
        const hariIni = namaHari[sekarang.getDay()];
        const tanggalHariIni = tanggalLokal(sekarang);
        const jamSekarang = waktuLokal(sekarang);

        // Pastikan jadwal milik Guru dan sedang berlangsung
        const [jadwalRows] = await db.execute(`
            SELECT
                j.id,
                j.hari,
                j.jam_mulai,
                j.jam_selesai,
                j.kelas_id,
                k.nama_kelas,
                k.tingkat,
                k.jurusan,
                mp.nama_mapel
            FROM jadwal_pelajaran j
            INNER JOIN kelas k ON k.id = j.kelas_id
            INNER JOIN mata_pelajaran mp ON mp.id = j.mapel_id
            WHERE j.id = ?
              AND j.guru_id = ?
              AND j.hari = ?
              AND j.jam_mulai <= ?
              AND j.jam_selesai >= ?
            LIMIT 1
        `, [
            req.params.jadwalId,
            guru.id,
            hariIni,
            jamSekarang,
            jamSekarang
        ]);

        if (jadwalRows.length === 0) {
            return res.status(403).send(
                'Absensi tidak dapat dibuka. Jadwal belum dimulai, sudah selesai, atau bukan jadwal mengajar Anda hari ini.'
            );
        }

        const jadwal = jadwalRows[0];

        // Ambil daftar murid dan status absensi jika sudah tersimpan
        const [murid] = await db.execute(`
            SELECT
                m.id,
                m.nama_murid,
                m.jenis_kelamin,
                a.status,
                a.keterangan
            FROM murid m
            LEFT JOIN absensi a
                ON a.murid_id = m.id
                AND a.jadwal_id = ?
                AND a.tanggal = ?
            WHERE m.kelas_id = ?
            ORDER BY m.nama_murid ASC
        `, [
            jadwal.id,
            tanggalHariIni,
            jadwal.kelas_id
        ]);

        // Periksa apakah absensi sudah pernah disimpan
        const sudahDisimpan = murid.some(
            item => item.status !== null
        );

        res.render('guru/absensi-detail', {
            user: req.session.user,
            guru,
            jadwal,
            murid,
            tanggalHariIni,
            sudahDisimpan
        });

    } catch (error) {
        console.error('Detail Absensi Guru Error:', error);
        res.status(500).send(
            'Terjadi kesalahan saat membuka absensi murid.'
        );
    }
});

// ======================================
// SIMPAN ABSENSI MURID
// ======================================

router.post('/absensi/:jadwalId/simpan', async (req, res) => {
    let connection;
    let transactionAktif = false;

    try {
        if (!idValid(req.params.jadwalId)) {
            return res.status(400).send('ID jadwal tidak valid.');
        }

        const guru = await pastikanGuru(req, res);

        if (!guru) return;

        const sekarang = new Date();
        const hariIni = namaHari[sekarang.getDay()];
        const tanggalHariIni = tanggalLokal(sekarang);
        const jamSekarang = waktuLokal(sekarang);

        const statuses = req.body.status || {};
        const keterangans = req.body.keterangan || {};

        // Pastikan data form berbentuk object
        if (
            typeof statuses !== 'object' ||
            Array.isArray(statuses) ||
            typeof keterangans !== 'object' ||
            Array.isArray(keterangans)
        ) {
            return res.status(400).send('Format data absensi tidak valid.');
        }

        connection = await db.getConnection();
        await connection.beginTransaction();
        transactionAktif = true;

        // Kunci jadwal agar dua proses penyimpanan tidak berjalan bersamaan
        const [jadwalRows] = await connection.execute(`
            SELECT
                j.id,
                j.kelas_id
            FROM jadwal_pelajaran j
            WHERE j.id = ?
              AND j.guru_id = ?
              AND j.hari = ?
              AND j.jam_mulai <= ?
              AND j.jam_selesai >= ?
            LIMIT 1
            FOR UPDATE
        `, [
            req.params.jadwalId,
            guru.id,
            hariIni,
            jamSekarang,
            jamSekarang
        ]);

        if (jadwalRows.length === 0) {
            await connection.rollback();
            transactionAktif = false;

            return res.status(403).send(
                'Absensi gagal disimpan karena jadwal tidak sedang berlangsung.'
            );
        }

        const jadwal = jadwalRows[0];

        // Ambil seluruh murid dari kelas tersebut
        const [murid] = await connection.execute(`
            SELECT id
            FROM murid
            WHERE kelas_id = ?
            ORDER BY id ASC
        `, [jadwal.kelas_id]);

        if (murid.length === 0) {
            await connection.rollback();
            transactionAktif = false;

            return res.status(400).send(
                'Tidak ada murid yang terdaftar pada kelas ini.'
            );
        }

        // Pastikan setiap murid memiliki status kehadiran
        for (const item of murid) {
            const status = statuses[item.id];

            if (!status || !statusValid.includes(status)) {
                await connection.rollback();
                transactionAktif = false;

                return res.status(400).send(
                    'Absensi belum lengkap. Pastikan semua murid sudah memiliki status kehadiran.'
                );
            }
        }

        // Cegah manipulasi ID murid dari form
        const idMuridValid = new Set(
            murid.map(item => String(item.id))
        );

        const idStatusDikirim = Object.keys(statuses);

        if (
            idStatusDikirim.some(
                id => !idMuridValid.has(String(id))
            )
        ) {
            await connection.rollback();
            transactionAktif = false;

            return res.status(400).send(
                'Data murid tidak valid.'
            );
        }

        // Pastikan tidak ada absensi yang sudah tersimpan
        const [absensiLama] = await connection.execute(`
            SELECT id
            FROM absensi
            WHERE jadwal_id = ?
              AND tanggal = ?
            LIMIT 1
            FOR UPDATE
        `, [jadwal.id, tanggalHariIni]);

        if (absensiLama.length > 0) {
            await connection.rollback();
            transactionAktif = false;

            return res.status(409).send(
                'Absensi untuk jadwal ini sudah disimpan dan tidak dapat diubah oleh Guru.'
            );
        }

        // Simpan status seluruh murid
        for (const item of murid) {
            const status = statuses[item.id];

            const keterangan = String(
                keterangans[item.id] || ''
            ).trim().slice(0, 255);

            await connection.execute(`
                INSERT INTO absensi (
                    jadwal_id,
                    murid_id,
                    tanggal,
                    status,
                    keterangan,
                    dicatat_oleh
                )
                VALUES (?, ?, ?, ?, ?, ?)
            `, [
                jadwal.id,
                item.id,
                tanggalHariIni,
                status,
                keterangan || null,
                req.session.user.id
            ]);
        }

        await connection.commit();
        transactionAktif = false;

        // Kembali ke daftar absensi dengan notifikasi berhasil
        return res.redirect('/guru/absensi?success=1');

    } catch (error) {
        if (connection && transactionAktif) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('Rollback Absensi Error:', rollbackError);
            }
        }

        console.error('Simpan Absensi Guru Error:', error);

        res.status(500).send(
            'Terjadi kesalahan saat menyimpan absensi.'
        );

    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// ======================================
// RIWAYAT ABSENSI GURU
// ======================================

router.get('/riwayat_absensi', async (req, res) => {
    try {
        const guru = await pastikanGuru(req, res);
        if (!guru) return;

        // Ambil riwayat absensi yang dicatat oleh Guru ini
        const [riwayatRows] = await db.execute(`
            SELECT
                a.jadwal_id,
                DATE_FORMAT(a.tanggal, '%Y-%m-%d') AS tanggalISO,
                j.hari,
                j.jam_mulai,
                j.jam_selesai,
                k.nama_kelas,
                k.tingkat,
                k.jurusan,
                mp.nama_mapel,

                COUNT(a.id) AS total_murid,
                COALESCE(SUM(a.status = 'Hadir'), 0) AS hadir,
                COALESCE(SUM(a.status = 'Izin'), 0) AS izin,
                COALESCE(SUM(a.status = 'Sakit'), 0) AS sakit,
                COALESCE(SUM(a.status = 'Alpa'), 0) AS alpa

            FROM absensi a
            INNER JOIN jadwal_pelajaran j ON j.id = a.jadwal_id
            INNER JOIN kelas k ON k.id = j.kelas_id
            INNER JOIN mata_pelajaran mp ON mp.id = j.mapel_id

            WHERE a.dicatat_oleh = ?

            GROUP BY
                a.jadwal_id,
                a.tanggal,
                j.hari,
                j.jam_mulai,
                j.jam_selesai,
                k.nama_kelas,
                k.tingkat,
                k.jurusan,
                mp.nama_mapel

            ORDER BY
                a.tanggal DESC,
                j.jam_mulai DESC
        `, [req.session.user.id]);

        const riwayat = riwayatRows.map(item => ({
            ...item,
            tanggalTampil: item.tanggalISO.split('-').reverse().join('-'),
            jamMulai: formatJam(item.jam_mulai),
            jamSelesai: formatJam(item.jam_selesai)
        }));

        res.render('guru/riwayat_absensi', {
            user: req.session.user,
            guru,
            riwayat
        });

    } catch (error) {
        console.error('Riwayat Absensi Guru Error:', error);
        res.status(500).send(
            'Terjadi kesalahan saat memuat Riwayat Absensi.'
        );
    }
});

// ======================================
// DETAIL RIWAYAT ABSENSI GURU
// ======================================

router.get('/riwayat-absensi/:jadwalId/:tanggal', async (req, res) => {
    try {
        const { jadwalId, tanggal } = req.params;

        if (!idValid(jadwalId)) {
            return res.status(400).send('ID jadwal tidak valid.');
        }

        // Validasi format dan tanggal kalender
        if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
            return res.status(400).send('Format tanggal tidak valid.');
        }

        const [tahun, bulan, hari] = tanggal.split('-').map(Number);
        const tanggalObj = new Date(Date.UTC(tahun, bulan - 1, hari));

        if (
            tanggalObj.getUTCFullYear() !== tahun ||
            tanggalObj.getUTCMonth() !== bulan - 1 ||
            tanggalObj.getUTCDate() !== hari
        ) {
            return res.status(400).send('Tanggal tidak valid.');
        }

        const guru = await pastikanGuru(req, res);
        if (!guru) return;

        // Pastikan riwayat tersebut memang dicatat oleh Guru yang login
        const [riwayatRows] = await db.execute(`
            SELECT
                a.jadwal_id,
                DATE_FORMAT(a.tanggal, '%Y-%m-%d') AS tanggalISO,
                j.hari,
                j.jam_mulai,
                j.jam_selesai,
                k.nama_kelas,
                k.tingkat,
                k.jurusan,
                mp.nama_mapel,

                COUNT(a.id) AS total_murid,
                COALESCE(SUM(a.status = 'Hadir'), 0) AS hadir,
                COALESCE(SUM(a.status = 'Izin'), 0) AS izin,
                COALESCE(SUM(a.status = 'Sakit'), 0) AS sakit,
                COALESCE(SUM(a.status = 'Alpa'), 0) AS alpa

            FROM absensi a
            INNER JOIN jadwal_pelajaran j ON j.id = a.jadwal_id
            INNER JOIN kelas k ON k.id = j.kelas_id
            INNER JOIN mata_pelajaran mp ON mp.id = j.mapel_id

            WHERE a.jadwal_id = ?
              AND a.tanggal = ?
              AND a.dicatat_oleh = ?

            GROUP BY
                a.jadwal_id,
                a.tanggal,
                j.hari,
                j.jam_mulai,
                j.jam_selesai,
                k.nama_kelas,
                k.tingkat,
                k.jurusan,
                mp.nama_mapel

            LIMIT 1
        `, [jadwalId, tanggal, req.session.user.id]);

        if (riwayatRows.length === 0) {
            return res.status(404).send(
                'Riwayat absensi tidak ditemukan atau bukan milik Anda.'
            );
        }

        const dataRiwayat = riwayatRows[0];

        // Ambil seluruh catatan kehadiran murid
        const [murid] = await db.execute(`
            SELECT
                m.id,
                m.nama_murid,
                m.jenis_kelamin,
                a.status,
                a.keterangan
            FROM absensi a
            INNER JOIN murid m ON m.id = a.murid_id
            WHERE a.jadwal_id = ?
              AND a.tanggal = ?
              AND a.dicatat_oleh = ?
            ORDER BY m.nama_murid ASC
        `, [jadwalId, tanggal, req.session.user.id]);

        const riwayat = {
            ...dataRiwayat,
            tanggalTampil: tanggal.split('-').reverse().join('-'),
            jamMulai: formatJam(dataRiwayat.jam_mulai),
            jamSelesai: formatJam(dataRiwayat.jam_selesai)
        };

        res.render('guru/riwayat-absensi-detail', {
            user: req.session.user,
            guru,
            riwayat,
            murid
        });

    } catch (error) {
        console.error('Detail Riwayat Absensi Guru Error:', error);
        res.status(500).send(
            'Terjadi kesalahan saat memuat detail riwayat absensi.'
        );
    }
});

// ======================================
// REKAP KEHADIRAN GURU - MINGGUAN
// ======================================

router.get('/rekap', async (req, res) => {
    try {
        const guru = await pastikanGuru(req, res);
        if (!guru) return;

        // ======================================
        // MENENTUKAN PERIODE MINGGU
        // ======================================

        const parseTanggal = (value) => {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
                return null;
            }

            const [tahun, bulan, hari] = value.split('-').map(Number);
            const date = new Date(tahun, bulan - 1, hari);

            if (
                date.getFullYear() !== tahun ||
                date.getMonth() !== bulan - 1 ||
                date.getDate() !== hari
            ) {
                return null;
            }

            return date;
        };

        const tanggalDipilih =
            parseTanggal(req.query.week) || new Date();

        // Mengubah tanggal menjadi hari Senin minggu tersebut
        const tanggalAwal = new Date(
            tanggalDipilih.getFullYear(),
            tanggalDipilih.getMonth(),
            tanggalDipilih.getDate()
        );

        const selisihHari = (tanggalAwal.getDay() + 6) % 7;
        tanggalAwal.setDate(tanggalAwal.getDate() - selisihHari);

        // Hari Minggu sebagai akhir periode
        const tanggalAkhir = new Date(tanggalAwal);
        tanggalAkhir.setDate(tanggalAwal.getDate() + 6);

        const awalMinggu = tanggalLokal(tanggalAwal);
        const akhirMinggu = tanggalLokal(tanggalAkhir);

        // Navigasi minggu sebelumnya dan berikutnya
        const mingguSebelumnya = new Date(tanggalAwal);
        mingguSebelumnya.setDate(mingguSebelumnya.getDate() - 7);

        const mingguBerikutnya = new Date(tanggalAwal);
        mingguBerikutnya.setDate(mingguBerikutnya.getDate() + 7);

        const formatTanggal = (tanggal) => {
            return new Date(`${tanggal}T00:00:00`).toLocaleDateString(
                'id-ID',
                {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                }
            );
        };

        // ======================================
        // FILTER KELAS YANG DIAJAR GURU
        // ======================================

        const [daftarKelas] = await db.execute(`
            SELECT DISTINCT
                k.id,
                k.nama_kelas,
                k.tingkat,
                k.jurusan
            FROM jadwal_pelajaran j
            INNER JOIN kelas k ON k.id = j.kelas_id
            WHERE j.guru_id = ?
            ORDER BY
                FIELD(k.tingkat, 'X', 'XI', 'XII'),
                k.jurusan ASC
        `, [guru.id]);

        // Validasi kelas yang dipilih
        let kelasId = '';

        if (req.query.kelas && idValid(req.query.kelas)) {
            const kelasDitemukan = daftarKelas.some(
                item => Number(item.id) === Number(req.query.kelas)
            );

            if (kelasDitemukan) {
                kelasId = String(req.query.kelas);
            }
        }

        // ======================================
        // REKAP KEHADIRAN SETIAP MURID
        // ======================================

        let queryRekap = `
            SELECT
                m.id AS murid_id,
                m.nama_murid,
                m.jenis_kelamin,

                k.id AS kelas_id,
                k.nama_kelas,
                k.tingkat,
                k.jurusan,

                COUNT(a.murid_id) AS total_pertemuan,

                COALESCE(SUM(a.status = 'Hadir'), 0) AS hadir,
                COALESCE(SUM(a.status = 'Izin'), 0) AS izin,
                COALESCE(SUM(a.status = 'Sakit'), 0) AS sakit,
                COALESCE(SUM(a.status = 'Alpa'), 0) AS alpa

            FROM murid m

            INNER JOIN kelas k
                ON k.id = m.kelas_id

            LEFT JOIN (
                SELECT
                    a.murid_id,
                    a.status,
                    j.kelas_id

                FROM absensi a

                INNER JOIN jadwal_pelajaran j
                    ON j.id = a.jadwal_id

                WHERE a.dicatat_oleh = ?
                    AND a.tanggal BETWEEN ? AND ?
                    AND j.guru_id = ?
            ) a
                ON a.murid_id = m.id
                AND a.kelas_id = m.kelas_id

            WHERE EXISTS (
                SELECT 1
                FROM jadwal_pelajaran jg
                WHERE jg.guru_id = ?
                  AND jg.kelas_id = m.kelas_id
            )
        `;

        const params = [
            req.session.user.id,
            awalMinggu,
            akhirMinggu,
            guru.id,
            guru.id
        ];

        // Filter berdasarkan kelas
        if (kelasId) {
            queryRekap += `
                AND m.kelas_id = ?
            `;

            params.push(kelasId);
        }

        queryRekap += `
            GROUP BY
                m.id,
                m.nama_murid,
                m.jenis_kelamin,
                k.id,
                k.nama_kelas,
                k.tingkat,
                k.jurusan

            ORDER BY
                FIELD(k.tingkat, 'X', 'XI', 'XII'),
                k.jurusan ASC,
                m.nama_murid ASC
        `;

        const [rekapRows] = await db.execute(
            queryRekap,
            params
        );

        // ======================================
        // MENGHITUNG PERSENTASE KEHADIRAN
        // ======================================

        const rekap = rekapRows.map(item => {
            const total = Number(item.total_pertemuan);
            const hadir = Number(item.hadir);

            const persentase = total > 0
                ? Math.round((hadir / total) * 100)
                : 0;

            return {
                ...item,
                total_pertemuan: total,
                hadir,
                izin: Number(item.izin),
                sakit: Number(item.sakit),
                alpa: Number(item.alpa),
                persentase
            };
        });

        // ======================================
        // RINGKASAN SELURUH MURID
        // ======================================

        const ringkasan = rekap.reduce((hasil, item) => {
            hasil.hadir += item.hadir;
            hasil.izin += item.izin;
            hasil.sakit += item.sakit;
            hasil.alpa += item.alpa;
            hasil.totalPertemuan += item.total_pertemuan;

            return hasil;
        }, {
            hadir: 0,
            izin: 0,
            sakit: 0,
            alpa: 0,
            totalPertemuan: 0
        });

        ringkasan.totalMurid = rekap.length;

        ringkasan.persentase = ringkasan.totalPertemuan > 0
            ? Math.round(
                (ringkasan.hadir / ringkasan.totalPertemuan) * 100
            )
            : 0;

        // ======================================
        // TAMPILKAN HALAMAN REKAP
        // ======================================

        res.render('guru/rekap', {
            user: req.session.user,
            guru,

            rekap,
            ringkasan,
            daftarKelas,

            kelasId,

            awalMinggu,
            akhirMinggu,

            awalMingguTampil: formatTanggal(awalMinggu),
            akhirMingguTampil: formatTanggal(akhirMinggu),

            mingguSebelumnya: tanggalLokal(mingguSebelumnya),
            mingguBerikutnya: tanggalLokal(mingguBerikutnya)
        });

    } catch (error) {
        console.error('Rekap Kehadiran Guru Error:', error);

        res.status(500).send(
            'Terjadi kesalahan saat memuat Rekap Kehadiran.'
        );
    }
});
// ======================================
// PROFIL SAYA
// ======================================

router.get('/profil', async (req, res) => {
    try {
        const guru = await getGuru(req.session.user.id);

        if (!guru) {
            return res.status(404).send(
                'Data Guru tidak ditemukan. Hubungi Administrator.'
            );
        }

        res.render('guru/profil', {
            user: req.session.user,
            guru
        });

    } catch (error) {
        console.error('Profil Guru Error:', error);
        res.status(500).send(
            'Terjadi kesalahan saat memuat Profil Saya.'
        );
    }
});

// ======================================
// EXPORT ROUTER
// ======================================

module.exports = router;
