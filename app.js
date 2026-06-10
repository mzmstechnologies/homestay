/**
 * Homestay Harmoni Vista — App JS
 * Fetches public iCal feed and renders an availability calendar.
 * No API key required — the Google Calendar is public.
 */

/* ===================== STATE ===================== */
const state = {
  currentYear:  new Date().getFullYear(),
  currentMonth: new Date().getMonth(), // 0-indexed
  bookedRanges: [], // [{ start: Date, end: Date, title: String }]
};

/* ===================== DOM REFS ===================== */
const navbar       = document.getElementById('navbar');
const hamburger    = document.getElementById('hamburger');
const navLinks     = document.querySelector('.nav-links');
const calGrid      = document.getElementById('calendarGrid');
const calLoading   = document.getElementById('calLoading');
const calError     = document.getElementById('calError');
const calMonthYear = document.getElementById('calMonthYear');
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const eventTooltip = document.getElementById('eventTooltip');

/* ===================== NAVBAR ===================== */
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
});
hamburger.addEventListener('click', () => navLinks.classList.toggle('open'));
document.querySelectorAll('.nav-links a').forEach(a =>
  a.addEventListener('click', () => navLinks.classList.remove('open'))
);

/* ===================== SMOOTH SCROLL ===================== */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
});

/* ===================== SCROLL REVEAL ===================== */
const revealObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity   = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.amenity-card, .booking-card, .nearby-item, .stat-item').forEach(el => {
  el.style.opacity    = '0';
  el.style.transform  = 'translateY(24px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  revealObserver.observe(el);
});

/* ===================== ICAL FETCH ===================== */
async function fetchIcal() {
  const url = CONFIG.ICAL_URL;
  let lastError;

  for (const proxyFn of CONFIG.CORS_PROXIES) {
    try {
      const proxyUrl = proxyFn(url);
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Not a valid iCal response');
      return text;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error('All CORS proxies failed');
}

/* ===================== ICAL PARSER ===================== */
/**
 * Minimal iCal parser — handles VEVENT blocks with
 * DATE-only (all-day) and DATE-TIME (timed) events.
 */
function parseIcal(text) {
  const ranges = [];

  // Normalise line folding (RFC 5545 §3.1)
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\r\n/g, '\n');

  const eventBlocks = unfolded.split('BEGIN:VEVENT').slice(1);

  eventBlocks.forEach(block => {
    const get = key => {
      const m = block.match(new RegExp(`^${key}[^:]*:(.+)`, 'm'));
      return m ? m[1].trim() : null;
    };

    const status  = get('STATUS') || 'CONFIRMED';
    if (status === 'CANCELLED') return;

    const summary   = get('SUMMARY') || 'Ditempah';
    const dtStartRaw = get('DTSTART');
    const dtEndRaw   = get('DTEND');

    if (!dtStartRaw || !dtEndRaw) return;

    const isAllDay = s => /^\d{8}$/.test(s);

    const parseDate = raw => {
      if (isAllDay(raw)) {
        // YYYYMMDD — treat as local midnight
        const y = +raw.slice(0,4), m = +raw.slice(4,6)-1, d = +raw.slice(6,8);
        return new Date(y, m, d, 0, 0, 0, 0);
      }
      // DATE-TIME: YYYYMMDDTHHMMSSZ or local
      const s = raw
        .replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/, '$1-$2-$3T$4:$5:$6$7');
      return new Date(s);
    };

    let start = parseDate(dtStartRaw);
    let end   = parseDate(dtEndRaw);

    // All-day end is exclusive (day after last night) — subtract 1 day
    if (isAllDay(dtEndRaw)) {
      end = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    }

    // Normalise to local midnight for comparison
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (isNaN(start) || isNaN(end) || end < start) return;

    ranges.push({ start, end, title: summary });
  });

  return ranges;
}

/* ===================== BOOKED DATE SET ===================== */
function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function buildBookedSet(ranges) {
  const map = new Map(); // dayKey → { title, start, end }
  ranges.forEach(range => {
    const cursor = new Date(range.start); cursor.setHours(0,0,0,0);
    const endDay = new Date(range.end);   endDay.setHours(23,59,59,999);
    while (cursor <= endDay) {
      map.set(dayKey(cursor), { title: range.title, start: range.start, end: range.end });
      cursor.setDate(cursor.getDate() + 1);
    }
  });
  return map;
}

/* ===================== CALENDAR RENDER ===================== */
const MONTHS = ['Januari','Februari','Mac','April','Mei','Jun',
                'Julai','Ogos','September','Oktober','November','Disember'];

function renderCalendar(bookedSet) {
  // Keep day-header cells, remove day cells
  const headers = Array.from(calGrid.querySelectorAll('.cal-day-header'));
  calGrid.innerHTML = '';
  headers.forEach(h => calGrid.appendChild(h));

  const { currentYear: year, currentMonth: month } = state;
  calMonthYear.textContent = `${MONTHS[month]} ${year}`;

  const today       = new Date(); today.setHours(0,0,0,0);
  const firstDayDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Leading blank cells
  for (let i = 0; i < firstDayDow; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-day empty';
    calGrid.appendChild(blank);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const date     = new Date(year, month, d);
    const key      = dayKey(date);
    const isPast   = date < today;
    const isToday  = date.getTime() === today.getTime();
    const bookInfo = bookedSet.get(key);

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = d;

    if (isPast && !isToday) {
      cell.classList.add('past');
    } else if (bookInfo) {
      cell.classList.add('booked');
      if (isToday) cell.classList.add('today');
      cell.addEventListener('mouseenter', e => showTooltip(e, bookInfo));
      cell.addEventListener('mouseleave', hideTooltip);
      cell.addEventListener('touchstart', e => {
        e.preventDefault();
        showTooltip(e.touches[0], bookInfo);
        setTimeout(hideTooltip, 2500);
      });
    } else {
      cell.classList.add('available');
      if (isToday) { cell.classList.remove('available'); cell.classList.add('today'); }
    }

    calGrid.appendChild(cell);
  }
}

/* ===================== TOOLTIP ===================== */
function showTooltip(event, info) {
  const opts = { month: 'short', day: 'numeric', year: 'numeric' };
  const startStr = info.start.toLocaleDateString('ms-MY', opts);
  const endStr   = info.end.toLocaleDateString('ms-MY', opts);

  // Buang nombor telefon dari paparan awam
  const safeTitle = info.title.replace(/\+?\d[\d\s\-]{7,}/g, '').trim() || 'Ditempah';

  eventTooltip.innerHTML = `
    <div class="tooltip-inner">
      <strong><i class="fa-solid fa-circle-xmark" style="color:#ef4444;"></i> ${escHtml(safeTitle)}</strong>
      <span>${startStr} – ${endStr}</span>
    </div>`;
  eventTooltip.style.display = 'block';

  const rect   = event.target ? event.target.getBoundingClientRect() : { top: event.clientY, left: event.clientX, width: 0, height: 0 };
  const scrollY = window.scrollY || window.pageYOffset;
  eventTooltip.style.top       = `${rect.top + scrollY - 8}px`;
  eventTooltip.style.left      = `${rect.left + rect.width / 2}px`;
  eventTooltip.style.transform = 'translate(-50%, -100%)';
}

function hideTooltip() { eventTooltip.style.display = 'none'; }

/* ===================== MONTH NAVIGATION ===================== */
prevMonthBtn.addEventListener('click', () => {
  state.currentMonth--;
  if (state.currentMonth < 0) { state.currentMonth = 11; state.currentYear--; }
  renderCalendar(buildBookedSet(state.bookedRanges));
});

nextMonthBtn.addEventListener('click', () => {
  state.currentMonth++;
  if (state.currentMonth > 11) { state.currentMonth = 0; state.currentYear++; }
  renderCalendar(buildBookedSet(state.bookedRanges));
});

/* ===================== MAIN INIT ===================== */
async function init() {
  calLoading.style.display = 'flex';
  calError.style.display   = 'none';

  try {
    const icalText      = await fetchIcal();
    state.bookedRanges  = parseIcal(icalText);
    calLoading.style.display = 'none';
    renderCalendar(buildBookedSet(state.bookedRanges));
  } catch (err) {
    calLoading.style.display = 'none';
    showCalError(err.message);
    renderCalendar(new Map());
  }
}

function showCalError(msg) {
  calError.style.display = 'flex';
  calError.innerHTML = `
    <i class="fa-solid fa-triangle-exclamation"></i>
    <span>Gagal memuatkan ketersediaan terkini: ${escHtml(msg)}.
    Paparan kalendar sahaja — sila cuba sebentar lagi atau
    <a href="https://wa.me/${CONFIG.WHATSAPP}?text=Assalamualaikum%2C%20saya%20ingin%20bertanya%20mengenai%20ketersediaan%20tarikh" style="color:#991b1b;font-weight:700;" target="_blank" rel="noopener">hubungi kami melalui WhatsApp</a>
    untuk mengesahkan tarikh.</span>`;
}

/* ===================== UTILITIES ===================== */
function escHtml(str) {
  return String(str).replace(/[&<>"']/g, m =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])
  );
}

/* ===================== TOOLTIP STYLE ===================== */
const tooltipStyle = document.createElement('style');
tooltipStyle.textContent = `
  .event-tooltip {
    position: absolute; z-index: 9999;
    background: #111827; color: #fff;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,.3);
    pointer-events: none;
    animation: ttFade .15s ease;
    max-width: 240px;
  }
  @keyframes ttFade {
    from { opacity:0; transform: translate(-50%,-90%); }
    to   { opacity:1; transform: translate(-50%,-100%); }
  }
  .tooltip-inner {
    display: flex; flex-direction: column; gap: 4px;
    padding: 10px 14px; font-size: .8rem;
  }
  .tooltip-inner strong { display:flex; align-items:center; gap:6px; font-size:.85rem; }
  .tooltip-inner span   { color: #9ca3af; font-size:.78rem; }
`;
document.head.appendChild(tooltipStyle);

/* ===================== VIEW TOGGLE ===================== */
function switchView(view) {
  const calWrapper   = document.getElementById('calendarWrapper');
  const embedWrapper = document.getElementById('embedWrapper');
  const tabCustom    = document.getElementById('tabCustom');
  const tabEmbed     = document.getElementById('tabEmbed');

  if (view === 'embed') {
    calWrapper.style.display   = 'none';
    embedWrapper.style.display = 'block';
    tabCustom.classList.remove('active');
    tabEmbed.classList.add('active');
  } else {
    calWrapper.style.display   = 'block';
    embedWrapper.style.display = 'none';
    tabEmbed.classList.remove('active');
    tabCustom.classList.add('active');
  }
}

/* ===================== BOOTSTRAP ===================== */
init();
