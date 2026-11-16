
document.addEventListener('DOMContentLoaded', () => {

    const addModal = document.getElementById('addModal');
    const editModal = document.getElementById('editModal');

    window.openAddModal = function () {
        addModal.classList.add('show');
    };

    window.openEditModal = function (guru) {
        document.getElementById('editNama').value = guru.nama_guru;
        document.getElementById('editGender').value = guru.jenis_kelamin;

        document.getElementById('editForm').action =
            `/admin/guru/edit/${guru.id}`;

        editModal.classList.add('show');
    };

    window.closeModals = function () {
        addModal.classList.remove('show');
        editModal.classList.remove('show');
    };

    [addModal, editModal].forEach(modal => {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                closeModals();
            }
        });
    });

});

document.addEventListener('DOMContentLoaded', () => {

    // Tanggal hari ini
    const dateElement = document.getElementById('currentDate');

    if (dateElement) {
        dateElement.textContent = new Date().toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    // Sidebar mobile
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('show');
        });
    }


    // Konfirmasi sebelum menyimpan absensi
    const attendanceForm = document.getElementById('attendanceForm');

    if (attendanceForm) {
        attendanceForm.addEventListener('submit', (event) => {
            const confirmed = confirm(
                'Apakah seluruh status kehadiran murid sudah benar? Absensi yang disimpan tidak dapat diubah oleh Guru.'
            );

            if (!confirmed) {
                event.preventDefault();
            }
        });
    }


});
