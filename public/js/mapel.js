
document.addEventListener('DOMContentLoaded', () => {

    // ======================================
    // MODAL
    // ======================================

    window.openModal = function(id) {
        document.getElementById(id).classList.add('show');
    };

    window.closeModal = function(id) {
        document.getElementById(id).classList.remove('show');
    };

    // ======================================
    // EDIT MAPEL
    // ======================================

    window.editMapel = function(button) {
        document.getElementById('editNama').value = button.dataset.nama;

        document.getElementById('formEdit').action =
            '/admin/mapel/edit/' + button.dataset.id;

        openModal('modalEdit');
    };

    // ======================================
    // TUTUP MODAL KLIK DI LUAR
    // ======================================

    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', event => {
            if (event.target === modal) {
                modal.classList.remove('show');
            }
        });
    });

    // ======================================
    // KONFIRMASI HAPUS MAPEL
    // ======================================

    document.querySelectorAll('.form-hapus-mapel').forEach(form => {
        form.addEventListener('submit', event => {
            const nama = form.dataset.nama;

            if (!confirm('Yakin ingin menghapus mapel ' + nama + '?')) {
                event.preventDefault();
            }
        });
    });

});
