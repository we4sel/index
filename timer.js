// Fancy countdown timer for the draft page (MM:SS.CS) with gradient progress
(function(){
    function pad2(n){ n = Math.floor(n); return n < 10 ? '0'+n : String(n); }
    function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

    function formatTime(ms){
        const total = Math.max(0, Math.floor(ms));
        const minutes = Math.floor(total / 60000);
        const seconds = Math.floor((total % 60000) / 1000);
        const centi = Math.floor((total % 1000) / 10); // 0-99
        return `${pad2(minutes)}:${pad2(seconds)}.${pad2(centi)}`;
    }

    function createFancyTimer(root){
        const wrap = document.createElement('div');
        wrap.className = 'rounded-xl border border-gray-800 bg-gradient-to-br from-gray-900/90 to-gray-900/60 p-4 mb-4 shadow-lg timer-flash';

        const top = document.createElement('div');
        top.className = 'flex items-end justify-between gap-4';

        // Left stack: dynamic title + subtitle
        const left = document.createElement('div');
        left.className = 'flex-1 min-w-0';
        const title = document.createElement('div');
        title.className = 'timer-title font-extrabold text-gray-100 truncate';
        title.style.fontSize = '40px';
        title.textContent = '';
        const subtitle = document.createElement('div');
        subtitle.className = 'text-xs uppercase tracking-widest text-gray-400';
        subtitle.textContent = '';

        const digits = document.createElement('div');
        digits.className = 'timer-digits font-extrabold text-4xl md:text-6xl tracking-wider text-lime-300 drop-shadow-[0_0_10px_rgba(163,230,53,0.35)]';
        digits.textContent = '00:00.00';

        left.appendChild(title);
        left.appendChild(subtitle);
        top.appendChild(left);
        top.appendChild(digits);

        const barWrap = document.createElement('div');
        barWrap.className = 'mt-3 h-2 w-full bg-gray-800 rounded overflow-hidden border border-gray-700';
        const bar = document.createElement('div');
        bar.className = 'h-full bg-gradient-to-r from-lime-400 via-cyan-400 to-emerald-400 w-0';
        bar.style.transition = 'width 90ms linear';
        barWrap.appendChild(bar);

        wrap.appendChild(top);
        wrap.appendChild(barWrap);
        root.appendChild(wrap);

        let durationMs = 0;
        let endAt = 0;
        let raf = null;
        let running = false;

        function fitTitle(){
            // shrink-to-fit without overlapping digits
            const max = 64; const min = 16;
            title.style.fontSize = max + 'px';
            let size = max;
            // use left container width
            const width = left.clientWidth;
            while (size > min && title.scrollWidth > width){
                size -= 2; title.style.fontSize = size + 'px';
            }
        }

        function update(){
            const now = performance.now();
            const remain = clamp(endAt - now, 0, durationMs);
            digits.textContent = formatTime(remain);
            const pct = durationMs > 0 ? (remain / durationMs) : 0;
            bar.style.width = `${pct * 100}%`;
            // urgency visual under 10 seconds
            if (remain <= 10000) wrap.classList.add('timer-urgent'); else wrap.classList.remove('timer-urgent');
            if (remain <= 0){
                running = false;
                raf = null;
                return;
            }
            raf = requestAnimationFrame(update);
        }

        function start(){
            if (durationMs <= 0) return;
            endAt = performance.now() + durationMs;
            if (!running){ running = true; raf = requestAnimationFrame(update); }
        }

        function reset(newDuration){
            if (typeof newDuration === 'number') durationMs = Math.max(0, newDuration);
            endAt = performance.now() + durationMs;
            wrap.classList.remove('timer-flash');
            void wrap.offsetWidth; // reflow to restart animation
            wrap.classList.add('timer-flash');
            if (!running){ running = true; raf = requestAnimationFrame(update); }
        }

        function stop(){
            if (raf){ cancelAnimationFrame(raf); raf = null; }
            running = false;
        }

        function setDurationMs(ms){ durationMs = Math.max(0, Number(ms)||0); }

        function setHeadline(mainText, subText){
            title.textContent = mainText || '';
            subtitle.textContent = (subText || '').toUpperCase();
            fitTitle();
        }

        window.addEventListener('resize', fitTitle);

        return { setDurationMs, start, reset, stop, setHeadline, _els: { wrap, digits, bar, title, subtitle } };
    }

    window.draftTimer = { createFancyTimer };
})();


