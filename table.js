// Minimal sortable table helper
// Usage: makeTableSortable(tableElement)
(function(){
    const NUM_RE = /^-?\d+(?:\.\d+)?$/;

    function coerce(val){
        if (val == null) return '';
        const s = String(val).trim();
        if (s === '') return '';
        if (NUM_RE.test(s)) return Number(s);
        const d = Date.parse(s);
        if (!Number.isNaN(d)) return d;
        return s.toLowerCase();
    }

    function compare(a, b){
        if (a === b) return 0;
        if (a === '' && b !== '') return -1;
        if (a !== '' && b === '') return 1;
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return a < b ? -1 : 1;
    }

    function makeTableSortable(table){
        if (!table) return;
        const thead = table.tHead || table.querySelector('thead');
        const tbody = table.tBodies[0] || table.querySelector('tbody');
        if (!thead || !tbody) return;

        const headers = Array.from(thead.querySelectorAll('th'));
        headers.forEach((th, idx)=>{
            th.classList.add('cursor-pointer','select-none');
            th.dataset.sortDir = 'none';
            th.addEventListener('click', ()=>{
                const current = th.dataset.sortDir === 'asc' ? 'desc' : 'asc';
                headers.forEach(h=>{ if(h!==th){ h.dataset.sortDir='none'; h.classList.remove('text-cyan-300'); h.classList.remove('text-orange-300'); }});
                th.dataset.sortDir = current;
                th.classList.toggle('text-cyan-300', current==='asc');
                th.classList.toggle('text-orange-300', current==='desc');

                const rows = Array.from(tbody.querySelectorAll('tr'));
                const keyed = rows.map(row=>{
                    const cell = row.children[idx];
                    const text = cell ? (cell.textContent || '').trim() : '';
                    return { row, key: coerce(text) };
                });
                keyed.sort((x,y)=> compare(x.key, y.key));
                if (current === 'desc') keyed.reverse();

                const frag = document.createDocumentFragment();
                keyed.forEach(k => frag.appendChild(k.row));
                tbody.appendChild(frag);
            });
        });
    }

    window.tableSort = { makeTableSortable };
})();


