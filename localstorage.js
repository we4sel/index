// Tiny JSON localStorage wrapper with TTL support
(function () {
    const PREFIX = 'sbbt:'; // spoodblort bookie tools

    function k(key) { return PREFIX + key; }

    function setJSON(key, value, ttlMs) {
        const entry = {
            v: value,
            t: Date.now(),
            e: typeof ttlMs === 'number' ? (Date.now() + ttlMs) : null,
        };
        localStorage.setItem(k(key), JSON.stringify(entry));
        return value;
    }

    function getJSON(key) {
        try {
            const raw = localStorage.getItem(k(key));
            if (!raw) return null;
            const entry = JSON.parse(raw);
            if (entry && entry.e && Date.now() > entry.e) {
                localStorage.removeItem(k(key));
                return null;
            }
            return entry?.v ?? null;
        } catch {
            return null;
        }
    }

    function remove(key) {
        localStorage.removeItem(k(key));
    }

    window.store = { setJSON, getJSON, remove };
})();


