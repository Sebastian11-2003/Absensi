
const express = require('express');
const db = require('../config/database');
const { isAuthenticated } = require('../middleware/auth');
const { authorizeRole } = require('../middleware/role');

const router = express.Router();

// ======================================
// MIDDLEWARE AKSES MURID
// ======================================

router.use(isAuthenticated, authorizeRole('murid'));

// ======================================
// HELPER DATA MURID
// ======================================

async function getMurid(userId) {
    const [rows] = await db.execute(`
        SELECT
            m.id,
            m.user_id,
            m.kelas_id,
            m.nama_murid,
            m.jenis_kelamin,
            u.username,
            u.status,
            k.nama_kelas,
            k.tingkat,
            k.jurusan
        FROM murid m
        INNER JOIN users u ON u.id = m.user_id
        INNER JOIN kelas k ON k.id = m.kelas_id
        WHERE u.id = ?
        LIMIT 1
    `, [userId]);

    return rows[0] || null;
}

// ======================================
// HELPER TANGGAL DAN HARI
// ======================================

function tanggalLokal() {
    const sekarang = new Date();

    const tahun = sekarang.getFullYear();
    const bulan = String(sekarang.getMonth() + 1).padStart(2, '0');
    const tanggal = String(sekarang.getDate()).padStart(2, '0');

    return `${tahun}-${bulan}-${tanggal}`;
}

function namaHari() {
    const hari = [
        'Minggu',
        'Senin',
        'Selasa',
        'Rabu',
        'Kamis',
        'Jumat',
        'Sabtu'
    ];

    return hari[new Date().getDay()];
}

function rentangMinggu() {
    const sekarang = new Date();
    const hari = sekarang.getDay();

    const selisihSenin = hari === 0 ? -6 : 1 - hari;

    const senin = new Date(sekarang);
    senin.setDate(sekarang.getDate() + selisihSenin);

    const minggu = new Date(senin);
    minggu.setDate(senin.getDate() + 6);

    const format = (tanggal) => {
        const tahun = tanggal.getFullYear();
        const bulan = String(tanggal.getMonth() + 1).padStart(2, '0');
        const tanggalHari = String(tanggal.getDate()).padStart(2, '0');

        return `${tahun}-${bulan}-${tanggalHari}`;
    };

    return {
        mulai: format(senin),
        selesai: format(minggu)
    };
}

// ======================================
// DASHBOARD MURID
// ======================================

router.get('/', async (req, res) => {
    try {
        const murid = await getMurid(req.session.user.id);

        if (!murid) {
            return res.status(404).send(
                'Data Murid tidak ditemukan. Hubungi Administrator.'
            );
        }

        const hariIni = namaHari();
        const tanggalHariIni = tanggalLokal();
        const minggu = rentangMinggu();

        // Jadwal pelajaran hari ini
        const [jadwalHariIni] = await db.execute(`
            SELECT
                j.id,
                j.hari,
                j.jam_mulai,
                j.jam_selesai,
                mp.nama_mapel,
                g.nama_guru
            FROM jadwal_pelajaran j
            INNER JOIN mata_pelajaran mp ON mp.id = j.mapel_id
            INNER JOIN guru g ON g.id = j.guru_id
            WHERE j.kelas_id = ?
              AND j.hari = ?
            ORDER BY j.jam_mulai ASC
        `, [murid.kelas_id, hariIni]);

        // Ringkasan absensi minggu ini
        const [hasilRekap] = await db.execute(`
            SELECT
                COUNT(a.id) AS total_absensi,
                SUM(a.status = 'Hadir') AS hadir,
                SUM(a.status = 'Izin') AS izin,
                SUM(a.status = 'Sakit') AS sakit,
                SUM(a.status = 'Alpa') AS alpa
            FROM absensi a
            WHERE a.murid_id = ?
              AND a.tanggal BETWEEN ? AND ?
        `, [murid.id, minggu.mulai, minggu.selesai]);

        const rekap = hasilRekap[0] || {};

        const totalAbsensi = Number(rekap.total_absensi || 0);
        const totalHadir = Number(rekap.hadir || 0);
        const persentaseHadir = totalAbsensi > 0
            ? ((totalHadir / totalAbsensi) * 100).toFixed(1)
            : '0.0';

        res.render('murid/dashboard', {
            user: req.session.user,
            murid,
            hariIni,
            tanggalHariIni,
            jadwalHariIni,
            rekap: {
                total: totalAbsensi,
                hadir: totalHadir,
                izin: Number(rekap.izin || 0),
                sakit: Number(rekap.sakit || 0),
                alpa: Number(rekap.alpa || 0),
                persentase: persentaseHadir
            }
        });

    } catch (error) {
        console.error('Dashboard Murid Error:', error);
        res.status(500).send(
            'Terjadi kesalahan saat memuat Dashboard Murid.'
        );
    }
});
// ======================================
// HELPER TAMBAHAN (HALAMAN MURID)
// ======================================

const HARI_URUT = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function formatJam(value) {
    if (value instanceof Date) {
        const jam = String(value.getHours()).padStart(2, '0');
        const menit = String(value.getMinutes()).padStart(2, '0');
        return `${jam}:${menit}`;
    }

    return String(value).slice(0, 5);
}

function formatTanggalLokal(date) {
    const tahun = date.getFullYear();
    const bulan = String(date.getMonth() + 1).padStart(2, '0');
    const hari = String(date.getDate()).padStart(2, '0');

    return `${tahun}-${bulan}-${hari}`;
}

function tampilTanggal(tanggal) {
    return new Date(`${tanggal}T00:00:00`).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

function parseTanggal(value) {
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
}

async function pastikanMurid(req, res) {
    const murid = await getMurid(req.session.user.id);

    if (!murid) {
        res.status(404).send(
            'Data Murid tidak ditemukan. Hubungi Administrator.'
        );

        return null;
    }

    return murid;
}

// ======================================
// JADWAL PELAJARAN
// ======================================

router.get('/jadwal', async (req, res) => {
    try {
        const murid = await pastikanMurid(req, res);
        if (!murid) return;

        const [rows] = await db.execute(`
            SELECT
                j.id,
                j.hari,
                j.jam_mulai,
                j.jam_selesai,
                mp.nama_mapel,
                g.nama_guru
            FROM jadwal_pelajaran j
            INNER JOIN mata_pelajaran mp ON mp.id = j.mapel_id
            INNER JOIN guru g ON g.id = j.guru_id
            WHERE j.kelas_id = ?
            ORDER BY
                FIELD(j.hari, 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'),
                j.jam_mulai ASC
        `, [murid.kelas_id]);

        const jadwal = rows.map(item => ({
            ...item,
            jamMulai: formatJam(item.jam_mulai),
            jamSelesai: formatJam(item.jam_selesai)
        }));

        res.render('murid/jadwal', {
            user: req.session.user,
            murid,
            jadwal,
            hariIni: namaHari(),
            hariUrut: HARI_URUT
        });

    } catch (error) {
        console.error('Jadwal Murid Error:', error);
        res.status(500).send('Terjadi kesalahan saat memuat Jadwal Pelajaran.');
    }
});

// ======================================
// RIWAYAT ABSENSI
// ======================================

router.get('/riwayat', async (req, res) => {
    try {
        const murid = await pastikanMurid(req, res);
        if (!murid) return;

        const statusValid = ['Hadir', 'Izin', 'Sakit', 'Alpa'];

        const bulan = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(req.query.bulan || ''))
            ? String(req.query.bulan)
            : '';

        const status = statusValid.includes(req.query.status)
            ? req.query.status
            : '';

        let query = `
            SELECT
                a.id,
                DATE_FORMAT(a.tanggal, '%Y-%m-%d') AS tanggal,
                a.status,
                a.keterangan,
                j.hari,
                j.jam_mulai,
                j.jam_selesai,
                mp.nama_mapel,
                g.nama_guru
            FROM absensi a
            INNER JOIN jadwal_pelajaran j ON j.id = a.jadwal_id
            INNER JOIN mata_pelajaran mp ON mp.id = j.mapel_id
            INNER JOIN guru g ON g.id = j.guru_id
            WHERE a.murid_id = ?
        `;

        const params = [murid.id];

        if (bulan) {
            query += ` AND DATE_FORMAT(a.tanggal, '%Y-%m') = ? `;
            params.push(bulan);
        }

        if (status) {
            query += ` AND a.status = ? `;
            params.push(status);
        }

        query += `
            ORDER BY a.tanggal DESC, j.jam_mulai DESC
            LIMIT 300
        `;

        const [rows] = await db.execute(query, params);

        const riwayat = rows.map(item => ({
            ...item,
            tanggalTampil: tampilTanggal(item.tanggal),
            jamMulai: formatJam(item.jam_mulai),
            jamSelesai: formatJam(item.jam_selesai)
        }));

        res.render('murid/riwayat', {
            user: req.session.user,
            murid,
            riwayat,
            bulan,
            status,
            statusValid
        });

    } catch (error) {
        console.error('Riwayat Absensi Murid Error:', error);
        res.status(500).send('Terjadi kesalahan saat memuat Riwayat Absensi.');
    }
});

// ======================================
// REKAP KEHADIRAN MINGGUAN
// ======================================

router.get('/rekap', async (req, res) => {
    try {
        const murid = await pastikanMurid(req, res);
        if (!murid) return;

        const tanggalDipilih = parseTanggal(req.query.week) || new Date();

        const tanggalAwal = new Date(
            tanggalDipilih.getFullYear(),
            tanggalDipilih.getMonth(),
            tanggalDipilih.getDate()
        );

        tanggalAwal.setDate(
            tanggalAwal.getDate() - ((tanggalAwal.getDay() + 6) % 7)
        );

        const tanggalAkhir = new Date(tanggalAwal);
        tanggalAkhir.setDate(tanggalAwal.getDate() + 6);

        const mingguSebelumnya = new Date(tanggalAwal);
        mingguSebelumnya.setDate(tanggalAwal.getDate() - 7);

        const mingguBerikutnya = new Date(tanggalAwal);
        mingguBerikutnya.setDate(tanggalAwal.getDate() + 7);

        const awalMinggu = formatTanggalLokal(tanggalAwal);
        const akhirMinggu = formatTanggalLokal(tanggalAkhir);

        // Rekap per mata pelajaran
        const [rows] = await db.execute(`
            SELECT
                mp.id AS mapel_id,
                mp.nama_mapel,
                COUNT(a.id) AS total,
                COALESCE(SUM(a.status = 'Hadir'), 0) AS hadir,
                COALESCE(SUM(a.status = 'Izin'), 0) AS izin,
                COALESCE(SUM(a.status = 'Sakit'), 0) AS sakit,
                COALESCE(SUM(a.status = 'Alpa'), 0) AS alpa
            FROM absensi a
            INNER JOIN jadwal_pelajaran j ON j.id = a.jadwal_id
            INNER JOIN mata_pelajaran mp ON mp.id = j.mapel_id
            WHERE a.murid_id = ?
              AND a.tanggal BETWEEN ? AND ?
            GROUP BY mp.id, mp.nama_mapel
            ORDER BY mp.nama_mapel ASC
        `, [murid.id, awalMinggu, akhirMinggu]);

        const rekap = rows.map(item => {
            const total = Number(item.total);
            const hadir = Number(item.hadir);

            return {
                ...item,
                total,
                hadir,
                izin: Number(item.izin),
                sakit: Number(item.sakit),
                alpa: Number(item.alpa),
                persentase: total > 0 ? Math.round((hadir / total) * 100) : 0
            };
        });

        const ringkasan = rekap.reduce((hasil, item) => {
            hasil.hadir += item.hadir;
            hasil.izin += item.izin;
            hasil.sakit += item.sakit;
            hasil.alpa += item.alpa;
            hasil.total += item.total;

            return hasil;
        }, { hadir: 0, izin: 0, sakit: 0, alpa: 0, total: 0 });

        ringkasan.persentase = ringkasan.total > 0
            ? Math.round((ringkasan.hadir / ringkasan.total) * 100)
            : 0;

        res.render('murid/rekap', {
            user: req.session.user,
            murid,
            rekap,
            ringkasan,
            awalMinggu,
            akhirMinggu,
            awalMingguTampil: tampilTanggal(awalMinggu),
            akhirMingguTampil: tampilTanggal(akhirMinggu),
            mingguSebelumnya: formatTanggalLokal(mingguSebelumnya),
            mingguBerikutnya: formatTanggalLokal(mingguBerikutnya)
        });

    } catch (error) {
        console.error('Rekap Kehadiran Murid Error:', error);
        res.status(500).send('Terjadi kesalahan saat memuat Rekap Kehadiran.');
    }
});

// ======================================
// PROFIL SAYA
// ======================================

router.get('/profil', async (req, res) => {
    try {
        const murid = await pastikanMurid(req, res);
        if (!murid) return;

        res.render('murid/profil', {
            user: req.session.user,
            murid
        });

    } catch (error) {
        console.error('Profil Murid Error:', error);
        res.status(500).send('Terjadi kesalahan saat memuat Profil Saya.');
    }
});

module.exports = router;
