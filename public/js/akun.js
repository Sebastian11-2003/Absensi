
document.addEventListener('DOMContentLoaded', () => {
    const modalTambah = document.getElementById('modalTambahAkun');
    const modalEdit = document.getElementById('modalEditAkun');

    const roleAkun = document.getElementById('roleAkun');
    const pilihGuru = document.getElementById('pilihGuru');
    const pilihMurid = document.getElementById('pilihMurid');

    const guruProfil = document.getElementById('guruProfil');
    const muridProfil = document.getElementById('muridProfil');

    // TAMPILKAN PILIHAN GURU / MURID
    roleAkun.addEventListener('change', () => {
        pilihGuru.style.display = roleAkun.value === 'guru' ? 'block' : 'none';
        pilihMurid.style.display = roleAkun.value === 'murid' ? 'block' : 'none';

        guruProfil.disabled = roleAkun.value !== 'guru';
        muridProfil.disabled = roleAkun.value !== 'murid';

        guruProfil.required = roleAkun.value === 'guru';
        muridProfil.required = roleAkun.value === 'murid';

        guruProfil.value = '';
        muridProfil.value = '';
    });

    // MODAL TAMBAH
    window.bukaModalTambah = function () {
        modalTambah.querySelector('form').reset();

        pilihGuru.style.display = 'none';
        pilihMurid.style.display = 'none';

        guruProfil.disabled = true;
        muridProfil.disabled = true;

        guruProfil.required = false;
        muridProfil.required = false;

        modalTambah.classList.add('active');
    };

    window.tutupModalTambah = function () {
        modalTambah.classList.remove('active');
    };

    // MODAL EDIT
    window.editAkun = function (button) {
        document.getElementById('formEditAkun').action =
            `/admin/akun/edit/${button.dataset.id}`;

        document.getElementById('editUsername').value =
            button.dataset.username;

        modalEdit.querySelector('input[name="password"]').value = '';

        modalEdit.classList.add('active');
    };

    window.tutupModalEdit = function () {
        modalEdit.classList.remove('active');
    };

    // TUTUP MODAL JIKA KLIK DI LUAR
    [modalTambah, modalEdit].forEach(modal => {
        modal.addEventListener('click', event => {
            if (event.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
});
