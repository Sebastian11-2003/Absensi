
document.addEventListener('DOMContentLoaded', () => {

    // TANGGAL HARI INI
    const dateElement = document.getElementById('currentDate');

    if (dateElement) {
        dateElement.textContent = new Date().toLocaleDateString(
            'id-ID',
            {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }
        );
    }

    // SIDEBAR MOBILE
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');

    if (toggle && sidebar) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('show');
        });
    }

    // TUTUP SIDEBAR KETIKA KLIK DI LUAR
    document.addEventListener('click', (event) => {
        if (
            sidebar &&
            toggle &&
            window.innerWidth <= 768 &&
            !sidebar.contains(event.target) &&
            !toggle.contains(event.target)
        ) {
            sidebar.classList.remove('show');
        }
    });

});
