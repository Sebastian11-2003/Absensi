
document.addEventListener('DOMContentLoaded', () => {

    const modal = document.getElementById('modalEditAbsensi');
    const form = document.getElementById('formEditAbsensi');

    const nama = document.getElementById('namaEditAbsensi');
    const status = document.getElementById('editStatusAbsensi');
    const keterangan = document.getElementById('editKeteranganAbsensi');

    window.editAbsensi = function (button) {
        const id = button.dataset.id;

        nama.textContent = button.dataset.nama;
        status.value = button.dataset.status;
        keterangan.value = button.dataset.keterangan || '';

        form.action = `/admin/absensi/edit/${id}`;

        modal.classList.add('show');
    };

    window.tutupEditAbsensi = function () {
        modal.classList.remove('show');
    };

    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            window.tutupEditAbsensi();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            window.tutupEditAbsensi();
        }
    });

});
