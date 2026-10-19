/* ═══════════════════════════════════════════════════════
   login.js — authentication (localStorage JSON)
   ═══════════════════════════════════════════════════════ */

(() => {
    "use strict";

    const CRED_KEY = "paper_trading_users";
    const SESSION_KEY = "paper_trading_session";

    const form = document.getElementById("login-form");
    const errBox = document.getElementById("login-error");
    const errText = document.getElementById("login-error-text");
    
    // IDs fixed to match login.html perfectly
    const btnSignIn = document.getElementById("login-submit");
    const inputUser = document.getElementById("login-username");
    const inputPass = document.getElementById("login-password");
    const chkShow = document.getElementById("show-password");

    // ── Helpers ──
    function getUsers() {
        try {
            return JSON.parse(localStorage.getItem(CRED_KEY)) || [];
        } catch {
            return [];
        }
    }

    function saveUsers(users) {
        localStorage.setItem(CRED_KEY, JSON.stringify(users));
    }

    function showError(msg) {
        errText.textContent = msg;
        errBox.classList.remove("d-none");
    }

    function hideError() {
        errBox.classList.add("d-none");
    }

    function setSession(username) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
            username: username,
            loginAt: new Date().toISOString()
        }));
    }

    function isLoggedIn() {
        try {
            const s = JSON.parse(localStorage.getItem(SESSION_KEY));
            return s && s.username;
        } catch {
            return false;
        }
    }

    // ── Show/hide password ──
    if (chkShow && inputPass) {
        chkShow.addEventListener("change", () => {
            inputPass.type = chkShow.checked ? "text" : "password";
        });
    }

    // ── Auto-fill from session ──
    if (isLoggedIn()) {
        inputUser.value = JSON.parse(localStorage.getItem(SESSION_KEY)).username || "";
        inputUser.readOnly = true;
        btnSignIn.innerHTML = '<i class="fa-solid fa-arrow-right"></i> Go to Dashboard';
        
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            window.location.href = "index.html";
        });
        return;
    }

    // ── Sign-in ──
    form.addEventListener("submit", (e) => {
        // Prevents default form submission (which refreshes the page)
        e.preventDefault(); 
        hideError();
        
        form.classList.add("was-validated");
        if (!form.checkValidity()) return;

        const username = inputUser.value.trim().toLowerCase();
        const password = inputPass.value;

        const users = getUsers();
        const user = users.find(u => u.username.toLowerCase() === username);

        if (!user || user.password !== password) {
            showError("Invalid username or password.");
            return;
        }

        setSession(username);
        // Redirect to Dashboard on success
        window.location.href = "index.html";
    });

    // ── Demo: register a default user if none exist ──
    if (getUsers().length === 0) {
        saveUsers([
            { username: "admin", password: "admin123" }
        ]);
    }
})();