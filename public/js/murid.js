
function openModal(id) {
    document.getElementById(id).classList.add('show');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('show');
}

function editMurid(murid) {
    document.getElementById('editNama').value = murid.nama;
    document.getElementById('editJk').value = murid.jk;
    document.getElementById('editKelas').value = murid.kelas;

    document.getElementById('formEdit').action =
        `/admin/murid/edit/${murid.id}`;

    openModal('modalEdit');
}

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', function (event) {
        if (event.target === modal) {
            modal.classList.remove('show');
        }
    });
});
