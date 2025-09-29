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

    async function runDraftLive(rounds, onInit, onPick, delayMs=150, getTopFighterId) {
        const all = getFighters();
        const { pool, teams } = classifyFighters(all);
        let ranked = rankByStatPower(pool);
        const byId = new Map(all.map(f => [f.ID, f]));
        const order = sortTeamsBySize(teams).map(([name, members]) => ({ name, members, picks: [] }));
        if (typeof onInit === 'function') onInit({ ranked, order, teams });
        if (!ranked.length || !order.length) return { ranked, order };

        let idx = 0;
        let pickNo = 1;
        while (idx < ranked.length) {
            const sizes = order.map(t => t.members.length + t.picks.length);
            const minSize = Math.min.apply(null, sizes);
            const bucket = order.filter(t => (t.members.length + t.picks.length) === minSize);
            for (let i = 0; i < bucket.length && idx < ranked.length; i++) {
                const team = bucket[i];
                let fighter;
                if (typeof getTopFighterId === 'function') {
                    const topId = getTopFighterId();
                    fighter = byId.get(topId) || ranked[0];
                    // remove chosen from ranked to prevent duplicates later
                    ranked = ranked.filter(f => f.ID !== fighter.ID);
                } else {
                    fighter = ranked[idx];
                    // keep ranked as-is; natural idx progress
                }
                idx++;
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
        results.className = 'grid gap-6 lg:grid-cols-[260px_1fr_260px]';

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
            poolCard.className = 'rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-sm';
            const ph = document.createElement('div'); ph.className = 'font-semibold mb-2'; ph.textContent = `Live draft pool standings`;
            poolCard.appendChild(ph);
            const eventLine = document.createElement('div'); eventLine.className = 'text-xs text-cyan-300 mb-2'; eventLine.textContent = '';
            poolCard.appendChild(eventLine);
            const plist = document.createElement('ol'); plist.className = 'relative text-sm text-gray-200 space-y-1 list-decimal list-inside';
            poolCard.appendChild(plist);

            // Live log column
            const liveCard = document.createElement('div');
            liveCard.className = 'rounded-lg border border-gray-800 bg-gray-900/50 p-4';
            const lh = document.createElement('div'); lh.className = 'font-semibold mb-3 text-lg md:text-xl'; lh.textContent = 'Live draft';
            const lbox = document.createElement('div'); lbox.className = 'text-base md:text-lg text-gray-200 space-y-2';
            liveCard.appendChild(lh); liveCard.appendChild(lbox);

            // Results column (by team)
            const draftCard = document.createElement('div');
            draftCard.className = 'rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-sm';
            const dh = document.createElement('div'); dh.className = 'font-semibold mb-2'; dh.textContent = 'Round-robin draft results';
            const dwrap = document.createElement('div'); dwrap.className = 'space-y-4';
            draftCard.appendChild(dh); draftCard.appendChild(dwrap);

            results.appendChild(poolCard);
            results.appendChild(liveCard);
            results.appendChild(draftCard);

            const teamUls = new Map();
            // Draft results summary for export
            const draftSummary = {
                startedAt: new Date().toISOString(),
                tickerSeconds: seconds,
                startTimeLocal: startIn.value || null,
                teams: []
            };
            const teamSummaryByName = new Map();
            // Volatility engine state
            let poolIds = [];
            const idToFighter = new Map(getFighters().map(f=>[f.ID,f]));
            let volTimer = null;

            function onInit({ ranked, order, teams }){
                // fill pool list
                ranked.forEach(f => {
                    const li = document.createElement('li');
                    li.dataset.id = String(f.ID);
                    li.className = 'flex items-center justify-between';
                    const name = document.createElement('span');
                    name.className = 'mr-2 name-label';
                    name.textContent = `${f.Name || '#'+f.ID}`;
                    const right = document.createElement('span'); right.className = 'flex items-center gap-2';
                    const fit = document.createElement('span'); fit.className = 'fit text-[10px] px-1.5 py-0.5 rounded bg-cyan-700/30 text-cyan-300'; fit.textContent = ''; fit.style.display = 'none';
                    const delta = document.createElement('span'); delta.className = 'delta text-xs text-gray-500 opacity-60'; delta.textContent = ''; delta.style.display = 'none';
                    right.appendChild(fit);
                    right.appendChild(delta);
                    li.appendChild(name);
                    li.appendChild(right);
                    plist.appendChild(li);
                    poolIds.push(f.ID);
                });
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
                    const entry = { name: t.name, before: t.members.length, picks: [] };
                    draftSummary.teams.push(entry);
                    teamSummaryByName.set(t.name, entry);
                });
            }

            function onPick({ pickNo, team, fighter, remaining }){
                const row = document.createElement('div');
                row.className = 'px-2 py-1 rounded bg-white/5 border border-gray-700 pick-impact';
                row.innerHTML = `<span class="text-cyan-300 font-semibold">#${pickNo} <span class="text-lime-300 font-semibold">${team.name}</span><span class="text-gray-300 font-semibold"> selects</span>&nbsp;<span class="text-lime-300 font-semibold">${fighter.Name || ('#'+fighter.ID)}</span>&nbsp;<small class="text-gray-400"><em>(${remaining} left)</em></small>`;
                // prepend newest at top
                if (lbox.firstChild) lbox.insertBefore(row, lbox.firstChild); else lbox.appendChild(row);
                // (confetti moved below; only fire when glowing best-fit is picked)
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
                // record pick for export
                const ts = teamSummaryByName.get(team.name);
                if (ts) ts.picks.push({ order: pickNo, id: fighter.ID, name: fighter.Name || ('#'+fighter.ID) });
                // confetti only if this was the glowing best-fit
                let shouldConfetti = false;
                const el = plist.querySelector(`li[data-id="${fighter.ID}"]`);
                if (el){
                    const nameEl = el.querySelector('.name-label');
                    if (nameEl && nameEl.classList.contains('fit-glow')) shouldConfetti = true;
                }
                if (shouldConfetti){
                    const overlay = document.createElement('div');
                    overlay.className = 'confetti-overlay';
                    const colors = ['#22c55e','#06b6d4','#eab308','#f97316','#a78bfa','#f43f5e'];
                    const pieces = 100;
                    for (let i=0;i<pieces;i++){
                        const p = document.createElement('span');
                        p.className = 'confetti-piece';
                        p.style.left = `${Math.random()*100}%`;
                        p.style.top = '-10vh';
                        p.style.background = colors[i%colors.length];
                        const dur = 800 + Math.random()*900;
                        p.style.animation = `confetti-fall ${dur}ms ease-out forwards`;
                        overlay.appendChild(p);
                    }
                    document.body.appendChild(overlay);
                    setTimeout(()=> overlay.remove(), 2000);
                }
                // remove picked from volatility state and list
                poolIds = poolIds.filter(id => id !== fighter.ID);
                if (el) el.remove();
            }

            // Volatility tick: event carousel with FLIP animations
            const EVENTS = [
                { key: 'RPS', score: (a,b) => Math.sign(Math.random()-0.5) },
                { key: 'Sprint', score: (a,b)=> Math.sign(safeNum(a.Speed)-safeNum(b.Speed)) },
                { key: 'Heavy Bag', score: (a,b)=> Math.sign(safeNum(a.Strength)-safeNum(b.Strength)) },
                { key: 'Marathon', score: (a,b)=> Math.sign(safeNum(a.Endurance)-safeNum(b.Endurance)) },
                { key: 'Sparring', score: (a,b)=> Math.sign(safeNum(a.Technique)-safeNum(b.Technique)) },
            ];
            function pickEvent(){ return EVENTS[Math.floor(Math.random()*EVENTS.length)]; }

            function flipReorder(newOrder){
                const items = Array.from(plist.children);
                const first = new Map(items.map(el=>[el.dataset.id, el.getBoundingClientRect()]));
                const prevIndex = new Map(items.map((el, idx) => [el.dataset.id, idx]));
                // reorder DOM
                newOrder.forEach(id => {
                    const el = plist.querySelector(`li[data-id="${id}"]`);
                    if (el) plist.appendChild(el);
                });
                const afterItems = Array.from(plist.children);
                afterItems.forEach(el => {
                    const a = first.get(el.dataset.id);
                    const b = el.getBoundingClientRect();
                    if (!a) return;
                    const dx = a.left - b.left;
                    const dy = a.top - b.top;
                    if (dx || dy){
                        el.style.transform = `translate(${dx}px,${dy}px)`;
                        el.style.transition = 'transform 0s';
                        requestAnimationFrame(()=>{
                            el.style.transform = '';
                            el.style.transition = 'transform 450ms cubic-bezier(0.2, 0.8, 0.2, 1)';
                        });
                    }
                });
                // update delta badges
                newOrder.forEach((id, newIdx) => {
                    const el = plist.querySelector(`li[data-id="${id}"]`);
                    if (!el) return;
                    const dSpan = el.querySelector('.delta');
                    const oldIdx = prevIndex.has(String(id)) ? prevIndex.get(String(id)) : newIdx;
                    const diff = (oldIdx - newIdx);
                    if (!dSpan) return;
                    if (diff > 0){
                        dSpan.textContent = `▲ +${diff}`;
                        dSpan.className = 'delta text-xs text-lime-300';
                        dSpan.style.display = 'inline';
                    } else if (diff < 0){
                        dSpan.textContent = `▼ ${Math.abs(diff)}`;
                        dSpan.className = 'delta text-xs text-red-400';
                        dSpan.style.display = 'inline';
                    } else {
                        dSpan.textContent = '';
                        dSpan.className = 'delta text-xs text-gray-500 opacity-60';
                        dSpan.style.display = 'none';
                    }
                });
            }

            let ratingById = new Map();

            function volatilityTick(){
                if (poolIds.length <= 1) return;
                const ev = pickEvent();
                eventLine.textContent = `current event: ${ev.key}`;
                // initialize ratings lazily to baseline if empty
                if (ratingById.size === 0) {
                    const els = Array.from(plist.children);
                    els.forEach((el, idx) => ratingById.set(Number(el.dataset.id), els.length - idx));
                }
                // gentle decay to compress gaps so swaps can happen
                poolIds.forEach(id => {
                    const r = (ratingById.get(id) || 0);
                    ratingById.set(id, r * 0.985);
                });
                // compute small rating bumps and reorder using persistent ratings
                const n = poolIds.length;
                // Jostle just a couple of fighters for a more organic feel
                const pairs = 2 + Math.floor(Math.random()*2); // 2-3 pairs
                for (let p=0;p<pairs;p++){
                    const i = Math.floor(Math.random()*n);
                    let j = Math.floor(Math.random()*n); if (j===i) j=(j+1)%n;
                    const A = idToFighter.get(poolIds[i]);
                    const B = idToFighter.get(poolIds[j]);
                    const out = ev.score(A,B);
                    const step = 2;
                    if (out>0){
                        ratingById.set(A.ID, (ratingById.get(A.ID)||0)+step);
                        ratingById.set(B.ID, (ratingById.get(B.ID)||0)-step);
                    } else if (out<0){
                        ratingById.set(A.ID, (ratingById.get(A.ID)||0)-step);
                        ratingById.set(B.ID, (ratingById.get(B.ID)||0)+step);
                    }
                }
                const order = poolIds.slice().sort((a,b)=> {
                    const rb = (ratingById.get(b)||0) + (Math.random()-0.5)*0.25;
                    const ra = (ratingById.get(a)||0) + (Math.random()-0.5)*0.25;
                    return rb - ra;
                });
                flipReorder(order);
                poolIds = order;
                // update best-fit highlight: clear all badges, glow only best among top 5
                Array.from(plist.children).forEach(el => {
                    const fitSpan = el.querySelector('.fit'); if (fitSpan) fitSpan.textContent = '';
                    const nameEl = el.querySelector('.name-label'); if (nameEl) nameEl.classList.remove('fit-glow');
                });
                const currentTeamName = Array.from(teamUls.keys())[0];
                const currentTeam = teamUls.get(currentTeamName);
                if (currentTeam){
                    let sum = {Strength:0, Speed:0, Endurance:0, Technique:0};
                    let count = 0;
                    const teamEntry = draftSummary.teams.find(t=>t.name===currentTeamName);
                    if (teamEntry){
                        teamEntry.picks.forEach(p => {
                            const f = idToFighter.get(p.id);
                            if (f){ sum.Strength+=safeNum(f.Strength); sum.Speed+=safeNum(f.Speed); sum.Endurance+=safeNum(f.Endurance); sum.Technique+=safeNum(f.Technique); count++; }
                        });
                    }
                    const C = {
                        Strength: count? sum.Strength/count : 0,
                        Speed: count? sum.Speed/count : 0,
                        Endurance: count? sum.Endurance/count : 0,
                        Technique: count? sum.Technique/count : 0,
                    };
                    const N = {
                        Strength: Math.max(0, 100 - C.Strength),
                        Speed: Math.max(0, 100 - C.Speed),
                        Endurance: Math.max(0, 100 - C.Endurance),
                        Technique: Math.max(0, 100 - C.Technique),
                    };
                    const weightSum = N.Strength+N.Speed+N.Endurance+N.Technique || 1;
                    const topEls = Array.from(plist.children).slice(0,5);
                    let best = null; let bestScore = -1;
                    topEls.forEach(el => {
                        const id = Number(el.dataset.id);
                        const f = idToFighter.get(id);
                        if (!f) return;
                        const score = (
                            N.Strength*(safeNum(f.Strength)/100) +
                            N.Speed*(safeNum(f.Speed)/100) +
                            N.Endurance*(safeNum(f.Endurance)/100) +
                            N.Technique*(safeNum(f.Technique)/100)
                        )/weightSum;
                        if (score > bestScore){ bestScore = score; best = el; }
                    });
                    if (best){ const nameEl = best.querySelector('.name-label'); if (nameEl) nameEl.classList.add('fit-glow'); }
                }
            }

            // Randomized cadence between 1000–3000ms so changes aren't synchronized
            function scheduleVol(){
                const ms = 500 + Math.floor(Math.random()*2500);
                volTimer = setTimeout(() => { volatilityTick(); scheduleVol(); }, ms);
            }
            scheduleVol();

            function getTopFromDom(){
                const first = plist.querySelector('li');
                return first ? Number(first.dataset.id) : (poolIds[0] || null);
            }

            await runDraftLive(rounds, onInit, onPick, intervalMs, getTopFromDom);
            // export results JSON
            draftSummary.completedAt = new Date().toISOString();
            function downloadJSON(filename, data){
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
            }
            const fname = `draft_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
            downloadJSON(fname, draftSummary);
            if (volTimer) clearTimeout(volTimer);
        });

        // mount order: controls (already at top), timer (already appended), results at the bottom
        wrap.appendChild(results);
        root.appendChild(wrap);
        return root;
    }

    window.draft = { renderDraftUI };
})();


