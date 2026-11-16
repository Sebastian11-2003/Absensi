
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('modalJadwal');
    const form = document.getElementById('formJadwal');

    const filterKelas = document.getElementById('filterKelas');
    const filterHari = document.getElementById('filterHari');
    const rows = document.querySelectorAll('#jadwalBody tr[data-kelas]');
    const filterKosong = document.getElementById('filterKosong');

    window.bukaModalTambah = function () {
        form.action = '/admin/jadwal/tambah';
        form.reset();

        document.getElementById('judulModal').textContent = 'Tambah Jadwal';
        modal.classList.add('active');
    };

    window.editJadwal = function (button) {
        form.action = `/admin/jadwal/edit/${button.dataset.id}`;

        document.getElementById('judulModal').textContent = 'Edit Jadwal';
        document.getElementById('guru_id').value = button.dataset.guru;
        document.getElementById('kelas_id').value = button.dataset.kelas;
        document.getElementById('mapel_id').value = button.dataset.mapel;
        document.getElementById('hari').value = button.dataset.hari;
        document.getElementById('jam_mulai').value = button.dataset.mulai;
        document.getElementById('jam_selesai').value = button.dataset.selesai;

        modal.classList.add('active');
    };

    window.tutupModal = function () {
        modal.classList.remove('active');
    };

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            tutupModal();
        }
    });

    function filterJadwal() {
        let jumlahTampil = 0;

        rows.forEach(row => {
            const cocokKelas = !filterKelas.value ||
                row.dataset.kelas === filterKelas.value;

            const cocokHari = !filterHari.value ||
                row.dataset.hari === filterHari.value;

            const tampil = cocokKelas && cocokHari;

            row.style.display = tampil ? '' : 'none';

            if (tampil) jumlahTampil++;
        });

        filterKosong.style.display =
            rows.length > 0 && jumlahTampil === 0 ? 'block' : 'none';
    }

    filterKelas.addEventListener('change', filterJadwal);
    filterHari.addEventListener('change', filterJadwal);
});
