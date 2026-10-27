(function () {
    const DB = window.CatalogoDB;
    const SESSION_KEY = "catalogo_emprendedores_sesion";
    const PBKDF2_ITERATIONS = 120000;

    function encodeBase64(bytes) {
        return btoa(String.fromCharCode.apply(null, new Uint8Array(bytes)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
    }

    function decodeBase64(value) {
        const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
        return Uint8Array.from(atob(padded), function (character) {
            return character.charCodeAt(0);
        });
    }

    async function derivePassword(password, salt) {
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error("Para proteger la contraseña, abre este sitio en HTTPS o desde localhost.");
        }
        const key = await window.crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(password),
            "PBKDF2",
            false,
            ["deriveBits"]
        );
        return window.crypto.subtle.deriveBits({
            name: "PBKDF2",
            salt: salt,
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256"
        }, key, 256);
    }

    async function hashPassword(password) {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const hash = await derivePassword(password, salt);
        return "pbkdf2$" + PBKDF2_ITERATIONS + "$" + encodeBase64(salt) + "$" + encodeBase64(hash);
    }

    async function verifyPassword(password, storedHash) {
        const parts = storedHash.split("$");
        if (parts.length !== 4 || parts[0] !== "pbkdf2" ||
            Number(parts[1]) !== PBKDF2_ITERATIONS) {
            return false;
        }
        const hash = await derivePassword(password, decodeBase64(parts[2]));
        const expected = decodeBase64(parts[3]);
        const actual = new Uint8Array(hash);
        return actual.length === expected.length &&
            actual.every(function (byte, index) { return byte === expected[index]; });
    }

    function showMessage(form, message, isError) {
        const output = form.querySelector("[data-form-message]");
        if (!output) return;
        output.textContent = message;
        output.className = isError
            ? "mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
            : "mb-4 rounded-md border border-teal-500/40 bg-teal-500/10 px-3 py-2 text-sm text-teal-200";
    }

    function saveSession(user, remember) {
        const session = JSON.stringify({
            usuario_id: user.id,
            nombre: user.nombre,
            correo_electronico: user.correo_electronico
        });
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY);
        (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, session);
    }

    function handleRegister(form) {
        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            const data = new FormData(form);
            const password = String(data.get("contrasena") || "");
            const confirmation = String(data.get("contrasena_confirmation") || "");

            if (password.length < 8) {
                showMessage(form, "La contraseña debe tener al menos 8 caracteres.", true);
                return;
            }
            if (password !== confirmation) {
                showMessage(form, "Las contraseñas no coinciden.", true);
                return;
            }

            const submit = form.querySelector('button[type="submit"]');
            submit.disabled = true;
            try {
                const passwordHash = await hashPassword(password);
                DB.insert("usuarios", {
                    nombre: data.get("nombre"),
                    correo_electronico: data.get("correo_electronico"),
                    contrasena: passwordHash
                });
                showMessage(form, "Cuenta creada. Ahora puedes iniciar sesión.", false);
                form.reset();
            } catch (error) {
                showMessage(form, error.message || "No se pudo crear la cuenta.", true);
            } finally {
                submit.disabled = false;
            }
        });
    }

    function handleLogin(form) {
        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            const data = new FormData(form);
            const email = String(data.get("correo_electronico") || "").trim().toLowerCase();
            const password = String(data.get("contrasena") || "");
            const submit = form.querySelector('button[type="submit"]');
            submit.disabled = true;

            try {
                const user = DB.getAll("usuarios").find(function (item) {
                    return item.correo_electronico === email && item.esta_eliminado === 0;
                });
                if (!user || !await verifyPassword(password, user.contrasena)) {
                    showMessage(form, "Correo electrónico o contraseña incorrectos.", true);
                    return;
                }
                saveSession(user, data.has("recordarme"));
                window.location.href = "../../index.html";
            } catch (error) {
                showMessage(form, error.message || "No se pudo iniciar sesión.", true);
            } finally {
                submit.disabled = false;
            }
        });
    }

    document.querySelectorAll("form[data-auth]").forEach(function (form) {
        if (!DB) {
            showMessage(form, "No se pudo cargar la base de datos local.", true);
            return;
        }
        if (form.dataset.auth === "register") handleRegister(form);
        if (form.dataset.auth === "login") handleLogin(form);
    });
})();
