
function openModal(id) {
    document.getElementById(id).classList.add('show');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

function editKelas(kelas) {
    document.getElementById('editTingkat').value = kelas.tingkat;
    document.getElementById('editJurusan').value = kelas.jurusan;

    document.getElementById('formEdit').action =
        `/admin/kelas/edit/${kelas.id}`;

    openModal('modalEdit');
}

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function(event) {
        if (event.target === modal) {
            modal.classList.remove('show');
        }
    });
});
