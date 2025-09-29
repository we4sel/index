// Draft simulator: rank free/custom fighters by per-stat matchup power score, then round-robin draft
(function(){
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    function getFighters() {
        const data = window.store?.getJSON('fighters');
        return Array.isArray(data) ? data.slice() : [];
    }

    function classifyFighters(arr) {
        const pool = [];
        const teams = new Map();
        arr.forEach(f => {
            const team = (f.Team || '').trim();
            const lc = team.toLowerCase();
            const isFree = !team || lc === 'free agent' || lc === 'free agents' || lc === 'fa';
            const isCustom = !!f.IsCustom || lc === 'custom fighter' || lc === 'custom fighters' || lc === 'custom';
            if (isFree || isCustom) {
                pool.push(f);
            } else {
                if (!teams.has(team)) teams.set(team, []);
                teams.get(team).push(f);
            }
        });
        return { pool, teams };
    }

    function safeNum(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }

    function statProbBetween(fA, fB){
        const stats = ['Strength','Speed','Endurance','Technique'];
        let sum = 0, cnt = 0;
        for (const k of stats){
            const a = safeNum(fA?.[k]);
            const b = safeNum(fB?.[k]);
            if (a + b > 0){ sum += a / (a + b); cnt++; }
        }
        if (cnt === 0) return 0.5;
        return sum / cnt;
    }

    function smoothedRecordRate(f){
        const w = safeNum(f?.Wins), l = safeNum(f?.Losses), d = safeNum(f?.Draws);
        return (w + 0.5*d + 1) / (w + l + d + 2);
    }

    function totalStats(f){
        return safeNum(f.Strength)+safeNum(f.Speed)+safeNum(f.Endurance)+safeNum(f.Technique);
    }

    function rankByStatPower(pool){
        const n = pool.length;
        if (n <= 1) return pool.slice();
        const power = new Map();
        for (let i=0; i<n; i++){
            let s = 0; let c = 0;
            for (let j=0; j<n; j++) if (i!==j){ s += statProbBetween(pool[i], pool[j]); c++; }
            power.set(pool[i].ID, c>0 ? s/c : 0.5);
        }
        return pool.slice().sort((a,b)=>{
            const pa = power.get(a.ID) || 0, pb = power.get(b.ID) || 0;
            if (pb !== pa) return pb - pa;
            const ra = smoothedRecordRate(a), rb = smoothedRecordRate(b);
            if (rb !== ra) return rb - ra;
            const ta = totalStats(a), tb = totalStats(b);
            if (tb !== ta) return tb - ta;
            return String(a.Name||'').localeCompare(String(b.Name||''));
        });
    }

    function sortTeamsBySize(teams) {
        return Array.from(teams.entries()).sort((a,b)=> a[1].length - b[1].length);
    }

    function runDraft(rounds, desiredParitySteps=0) {
        const all = getFighters();
        const { pool, teams } = classifyFighters(all);
        const ranked = rankByStatPower(pool);
        // Initial order: ascending by current roster size
        const order = sortTeamsBySize(teams).map(([name, members]) => ({ name, members, picks: [] }));
        if (!ranked.length || !order.length) return { ranked, order };

        let idx = 0;
        // Bucketed drafting: repeatedly let ONLY the smallest-size teams pick once
        while (idx < ranked.length) {
            // Determine current minimum size
            const sizes = order.map(t => t.members.length + t.picks.length);
            const minSize = Math.min.apply(null, sizes);
            // Teams at the current minimum, in stable order
            const bucket = order.filter(t => (t.members.length + t.picks.length) === minSize);
            for (let i = 0; i < bucket.length && idx < ranked.length; i++) {
                const team = bucket[i];
                team.picks.push(ranked[idx++]);
            }
        }
        return { ranked, order };
    }

    async function runDraftLive(rounds, onInit, onPick, delayMs=150) {
        const all = getFighters();
        const { pool, teams } = classifyFighters(all);
        const ranked = rankByStatPower(pool);
        const order = sortTeamsBySize(teams).map(([name, members]) => ({ name, members, picks: [] }));
        if (typeof onInit === 'function') onInit({ ranked, order });
        if (!ranked.length || !order.length) return { ranked, order };

        let idx = 0;
        let pickNo = 1;
        while (idx < ranked.length) {
            const sizes = order.map(t => t.members.length + t.picks.length);
            const minSize = Math.min.apply(null, sizes);
            const bucket = order.filter(t => (t.members.length + t.picks.length) === minSize);
            for (let i = 0; i < bucket.length && idx < ranked.length; i++) {
                const team = bucket[i];
                const fighter = ranked[idx++];
                team.picks.push(fighter);
                if (typeof onPick === 'function') onPick({ pickNo, team, fighter, remaining: ranked.length - idx });
                pickNo++;
                if (delayMs > 0) await sleep(delayMs);
            }
        }
        return { ranked, order };
    }

    function renderDraftUI(root){
        const wrap = document.createElement('div');
        wrap.className = 'space-y-4';
        const controls = document.createElement('div');
        controls.className = 'flex flex-col md:flex-row gap-3 items-end';
        const go = document.createElement('button'); go.className = 'px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 font-semibold'; go.textContent = 'GO';
        // timer input (single source of truth)
        const timerWrap = document.createElement('label'); timerWrap.className = 'w-56';
        const ttxt = document.createElement('div'); ttxt.className = 'text-xs text-gray-400 mb-1'; ttxt.textContent = 'ticker per pick (seconds)';
        const tIn = document.createElement('input'); tIn.type = 'number'; tIn.min = '1'; tIn.max = '3600'; tIn.value = '10'; tIn.className = 'w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2';
        timerWrap.appendChild(ttxt); timerWrap.appendChild(tIn);
        // start time input (local time)
        const startWrap = document.createElement('label'); startWrap.className = 'w-64';
        const stxt = document.createElement('div'); stxt.className = 'text-xs text-gray-400 mb-1'; stxt.textContent = 'start time (local)';
        const startIn = document.createElement('input'); startIn.type = 'datetime-local'; startIn.className = 'w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2';
        startWrap.appendChild(stxt); startWrap.appendChild(startIn);

        controls.appendChild(timerWrap); controls.appendChild(startWrap); controls.appendChild(go);

        // Live estimator (duration and finish time)
        const est = document.createElement('div');
        est.className = 'text-xs text-gray-400';

        function humanDuration(totalSeconds){
            const s = Math.max(0, Math.floor(totalSeconds));
            const h = Math.floor(s/3600);
            const m = Math.floor((s%3600)/60);
            const sec = s%60;
            const parts = [];
            if (h) parts.push(`${h}h`);
            if (m || h) parts.push(`${m}m`);
            parts.push(`${sec}s`);
            return parts.join(' ');
        }

        function updateEstimate(){
            const all = getFighters();
            const pool = classifyFighters(all).pool;
            const picks = pool.length;
            const seconds = Math.max(1, Math.min(3600, Number(tIn.value)||10));
            const total = seconds * picks;
            const durationStr = humanDuration(total);
            const baseStart = startIn.value ? new Date(startIn.value).getTime() : Date.now();
            const finish = new Date(baseStart + total*1000);
            const finishStr = finish.toLocaleString();
            est.textContent = `Est. duration for ${picks} picks: ${durationStr} • Est. finish ${startIn.value ? '' : '(if start now) '}${finishStr}`;
        }

        // Fancy countdown banner (placed below controls so controls are off-screen when streaming)
        const timerMount = document.createElement('div');
        wrap.appendChild(controls);
        wrap.appendChild(est);
        wrap.appendChild(timerMount);
        const timer = window.draftTimer.createFancyTimer(timerMount);
        timer.setDurationMs(10 * 1000); // default 10 seconds

        const results = document.createElement('div');
        results.className = 'grid lg:grid-cols-3 gap-6';

        // Estimator live updates without pressing GO
        tIn.addEventListener('input', updateEstimate);
        startIn.addEventListener('input', updateEstimate);
        updateEstimate();

        go.addEventListener('click', async () => {
            results.innerHTML = '';
            const rounds = 0; // unused by stat-based ranking
            const seconds = Math.max(1, Math.min(3600, Number(tIn.value)||10));
            const intervalMs = seconds * 1000;

            // If a future start time is selected, countdown to it first
            let startDelay = 0;
            if (startIn.value) {
                const target = new Date(startIn.value).getTime();
                const now = Date.now();
                if (Number.isFinite(target)) startDelay = Math.max(0, target - now);
            }

            if (startDelay > 0) {
                timer.setDurationMs(startDelay);
                timer.setHeadline('Draft begins', 'counting down');
                timer.reset();
                await sleep(startDelay);
            }

            timer.setDurationMs(intervalMs);
            // initial headline before first pick
            timer.setHeadline('', '');
            timer.reset();

            // Pool column
            const poolCard = document.createElement('div');
            poolCard.className = 'rounded-lg border border-gray-800 bg-gray-900/50 p-3';
            const ph = document.createElement('div'); ph.className = 'font-semibold mb-2'; ph.textContent = `Draft pool ranking`;
            poolCard.appendChild(ph);
            const plist = document.createElement('ol'); plist.className = 'text-sm text-gray-200 space-y-1 list-decimal list-inside';
            poolCard.appendChild(plist);

            // Live log column
            const liveCard = document.createElement('div');
            liveCard.className = 'rounded-lg border border-gray-800 bg-gray-900/50 p-3';
            const lh = document.createElement('div'); lh.className = 'font-semibold mb-2'; lh.textContent = 'Live draft';
            const lbox = document.createElement('div'); lbox.className = 'text-sm text-gray-200 space-y-1';
            liveCard.appendChild(lh); liveCard.appendChild(lbox);

            // Results column (by team)
            const draftCard = document.createElement('div');
            draftCard.className = 'rounded-lg border border-gray-800 bg-gray-900/50 p-3';
            const dh = document.createElement('div'); dh.className = 'font-semibold mb-2'; dh.textContent = 'Round-robin draft results';
            const dwrap = document.createElement('div'); dwrap.className = 'space-y-4';
            draftCard.appendChild(dh); draftCard.appendChild(dwrap);

            results.appendChild(poolCard);
            results.appendChild(liveCard);
            results.appendChild(draftCard);

            const teamUls = new Map();

            function onInit({ ranked, order }){
                // fill pool list
                ranked.forEach(f => { const li = document.createElement('li'); li.textContent = `${f.Name || '#'+f.ID}`; plist.appendChild(li); });
                // prepare team sections
                order.forEach(t => {
                    const sec = document.createElement('div');
                    const th = document.createElement('div'); th.className = 'text-cyan-300 font-semibold'; th.textContent = `${t.name}`;
                    const count = document.createElement('span'); count.className = 'text-gray-400 ml-2'; count.textContent = `(${t.members.length})`;
                    th.appendChild(count);
                    const tl = document.createElement('div'); tl.className = 'text-xs text-gray-400 mb-1'; tl.textContent = `before: ${t.members.length} • picks: 0`;
                    const list = document.createElement('ul'); list.className = 'text-sm text-gray-200 list-disc list-inside';
                    sec.appendChild(th); sec.appendChild(tl); sec.appendChild(list);
                    dwrap.appendChild(sec);
                    teamUls.set(t.name, { ul: list, tl, base: t.members.length, picks: 0, count, sec });
                });
            }

            function onPick({ pickNo, team, fighter, remaining }){
                const row = document.createElement('div');
                row.className = 'px-2 py-1 rounded bg-white/5 border border-gray-700 pick-impact';
                row.textContent = `#${pickNo} ${team.name} select ${fighter.Name || ('#'+fighter.ID)} (${remaining} left)`;
                // prepend newest at top
                if (lbox.firstChild) lbox.insertBefore(row, lbox.firstChild); else lbox.appendChild(row);
                const entry = teamUls.get(team.name);
                if (entry) {
                    // remove previous highlight
                    const prevHi = entry.ul.querySelector('li .pick-highlight');
                    if (prevHi) prevHi.classList.remove('text-lime-300','font-semibold','pick-highlight');
                    // add new pick at top and highlight
                    const li = document.createElement('li');
                    const name = document.createElement('span'); name.textContent = fighter.Name || ('#'+fighter.ID);
                    name.className = 'text-lime-300 font-semibold pick-highlight pick-pop';
                    li.appendChild(name);
                    // prepend newest pick at top of that team's list
                    if (entry.ul.firstChild) entry.ul.insertBefore(li, entry.ul.firstChild); else entry.ul.appendChild(li);
                    entry.picks += 1;
                    entry.tl.textContent = `before: ${entry.base} • picks: ${entry.picks}`;
                    entry.count.textContent = `(${entry.base + entry.picks})`;
                    // move this team section to the top of the results column
                    if (entry.sec && dwrap.firstChild !== entry.sec) {
                        dwrap.insertBefore(entry.sec, dwrap.firstChild);
                    }
                }
                // restart countdown for next pick
                const roundText = `Round ${pickNo}`;
                timer.setHeadline(fighter.Name || ('#'+fighter.ID), `${team.name} ${roundText} pick`);
                timer.reset();
            }

            await runDraftLive(rounds, onInit, onPick, intervalMs);
        });

        // mount order: controls (already at top), timer (already appended), results at the bottom
        wrap.appendChild(results);
        root.appendChild(wrap);
        return root;
    }

    window.draft = { renderDraftUI };
})();


