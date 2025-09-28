// Simple CORS proxy helper used by index.html
// Defines three well-known public CORS proxies and utilities to try them in order

(function () {
    const proxies = [
        {
            name: 'allorigins',
            build: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        },
        {
            name: 'isomorphic-git',
            build: (url) => `https://cors.isomorphic-git.org/${url}`,
        },
        {
            name: 'corsproxy.io',
            build: (url) => `https://corsproxy.io/?${url}`,
        },
    ];

    async function fetchWithProxies(url, init, onAttempt) {
        let lastError = null;
        for (let i = 0; i < proxies.length; i++) {
            const p = proxies[i];
            try {
                if (typeof onAttempt === 'function') onAttempt(i + 1, proxies.length, p);
                const response = await fetch(p.build(url), init);
                if (response.ok) {
                    return { response, proxy: p };
                }
                lastError = new Error(`http ${response.status}`);
            } catch (e) {
                lastError = e;
            }
        }
        throw lastError || new Error('all proxies failed');
    }

    async function fetchJson(url, init, onAttempt) {
        const { response, proxy } = await fetchWithProxies(url, init, onAttempt);
        // Attempt JSON parse, fall back to text->JSON in case of incorrect content-type
        try {
            const data = await response.json();
            return { data, response, proxy };
        } catch (_) {
            const text = await response.text();
            const data = JSON.parse(text);
            return { data, response, proxy };
        }
    }

    window.cors = {
        proxies,
        fetchWithProxies,
        fetchJson,
    };
})();


