
document.addEventListener('DOMContentLoaded', () => {
    fetch("http://localhost:8000/")
        .then(r => {
            const el = document.getElementById("status");
            if (r.ok) {
                el.textContent = "● Brain Online";
                el.className = "status online";
            } else {
                el.textContent = "● Brain Error";
            }
        })
        .catch(() => {
            document.getElementById("status").textContent = "● Brain Offline";
        });
});
