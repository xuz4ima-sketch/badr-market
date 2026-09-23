(() => {
  "use strict";

  const CFG = window.BADR_CONFIG || {};
  const CONTACTS = CFG.contacts || {};
  const LS_PRICES = "badr:prices:v1";
  const LOCAL_CSV = "data/prices.csv";
  const FETCH_TIMEOUT = 10000;
  const NBSP = " ";
  const SVGNS = "http://www.w3.org/2000/svg";

  const $ = (sel) => document.querySelector(sel);
  const nf = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
  const pr = new Intl.PluralRules("ru");

  const plural = (n, [one, few, many]) => {
    const c = pr.select(n);
    return c === "one" ? one : c === "few" ? few : many;
  };
  const rub = (n) => nf.format(n) + NBSP + "₽";
  const norm = (s) => s.toLowerCase().replace(/ё/g, "е");
  const pretty = (s) => s.replace(/"([^"]*)"/g, "«$1»");

  function lsGet(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function lsSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: private mode or blocked */
    }
  }

  function icon(name) {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "i");
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(SVGNS, "use");
    use.setAttribute("href", "#i-" + name);
    svg.append(use);
    return svg;
  }

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children) if (c) node.append(c);
    return node;
  }

  /* ---------- CSV ---------- */

  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else quoted = false;
        } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c !== "\r") field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  function parsePrice(raw) {
    let t = String(raw || "").replace(/[\s  ]/g, "").replace(/(руб\.?|р\.|₽)$/i, "");
    if (!t) return null;
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
    else t = t.replace(",", ".");
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const TRANSLIT = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
    х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  const slugify = (s) =>
    s.toLowerCase().split("").map((ch) => TRANSLIT[ch] ?? ch).join("")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "series";

  function buildData(text) {
    const rows = parseCSV(text);
    if (!rows.length) throw new Error("Пустой CSV");
    const head = rows[0].map((h) => norm(h.trim()));
    const col = (name) => head.indexOf(name);
    // The series column is always first; tolerate a blank or renamed header in A1.
    const iSeries = col("серия") >= 0 ? col("серия") : 0, iName = col("наименование"), iOpt = col("опт"),
      iRet = col("розница"), iUnit = col("ед."), iStock = col("наличие"), iNew = col("новинка");
    if (iName < 0 || iOpt < 0) throw new Error("Нет колонок «Наименование» и «Опт»");

    const items = [];
    const groups = new Map();
    const keys = new Set();
    const slugs = new Set();
    let date = null;

    for (const r of rows.slice(1)) {
      const get = (i) => (i >= 0 ? (r[i] || "").trim() : "");
      const first = (r[0] || "").trim();
      if (first.startsWith("#")) {
        if (norm(first).startsWith("#обновлено")) date = (r[1] || "").trim() || null;
        continue;
      }
      const name = get(iName);
      if (!name) continue;
      const series = get(iSeries) || "Другое";
      let key = series + "|" + name;
      for (let n = 2; keys.has(key); n++) key = series + "|" + name + "#" + n;
      keys.add(key);

      const stockRaw = norm(get(iStock));
      const item = {
        key,
        series,
        name,
        display: pretty(name),
        search: norm(name),
        opt: parsePrice(get(iOpt)),
        ret: parsePrice(get(iRet)),
        unit: get(iUnit) || "шт",
        stock: stockRaw === "нет" ? "out" : stockRaw.startsWith("под") ? "order" : "in",
        isNew: get(iNew) !== "",
      };
      items.push(item);
      if (!groups.has(series)) {
        let slug = slugify(series);
        for (let n = 2; slugs.has(slug); n++) slug = slugify(series) + "-" + n;
        slugs.add(slug);
        groups.set(series, { series, slug, items: [] });
      }
      groups.get(series).items.push(item);
    }
    if (!items.length) throw new Error("В прайсе нет позиций");
    return { items, groups: [...groups.values()], byKey: new Map(items.map((i) => [i.key, i])), date };
  }

  async function fetchText(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    try {
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } finally {
      clearTimeout(timer);
    }
  }

  /* ---------- Contacts ---------- */

  const digits = (s) => {
    let d = String(s || "").replace(/\D/g, "");
    if (d.length === 11 && d[0] === "8") d = "7" + d.slice(1);
    return d;
  };
  const handle = (s) =>
    String(s || "").trim()
      .replace(/^https?:\/\/(www\.)?(t\.me|telegram\.me|instagram\.com)\//i, "")
      .replace(/^@/, "").replace(/[/?#].*$/, "");

  const contactLinks = {
    phone: CONTACTS.phone && digits(CONTACTS.phone) ? "tel:+" + digits(CONTACTS.phone) : null,
    whatsapp: CONTACTS.whatsapp && digits(CONTACTS.whatsapp) ? "https://wa.me/" + digits(CONTACTS.whatsapp) : null,
    telegram: handle(CONTACTS.telegram) ? "https://t.me/" + handle(CONTACTS.telegram) : null,
    telegramChannel: handle(CONTACTS.telegramChannel) ? "https://t.me/" + handle(CONTACTS.telegramChannel) : null,
    instagram: handle(CONTACTS.instagram) ? "https://instagram.com/" + handle(CONTACTS.instagram) + "/" : null,
  };

  function setupContacts() {
    document.querySelectorAll("[data-contact]").forEach((a) => {
      const href = contactLinks[a.dataset.contact];
      a.hidden = !href;
      if (href) a.href = href;
    });
    const value = document.querySelector("[data-contact-value]");
    if (value && CONTACTS.phone) value.textContent = CONTACTS.phone.trim();

    const main = ["phone", "whatsapp", "telegram"].some((k) => contactLinks[k]);
    const social = ["telegramChannel", "instagram"].some((k) => contactLinks[k]);
    $("#contact-main").hidden = !main;
    $("#contact-social").hidden = !social;
    $("#contacts-empty").hidden = main || social;
  }

  function fillText(sectionSel, targetSel, text) {
    const paras = String(text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    $(sectionSel).hidden = !paras.length;
    $(targetSel).replaceChildren(...paras.map((p) => el("p", { text: p })));
    return paras.length > 0;
  }

  /* ---------- Price list ---------- */

  const state = {
    data: null,
    groupViews: [],
    open: new Set(),
    query: "",
    series: "",
    inStock: false,
    handledHash: false,
  };

  function renderRow(item) {
    const name = el("td", { class: "c-name" }, el("span", { class: "name", text: item.display }));
    if (item.isNew) name.append(el("span", { class: "badge badge-new", text: "Новинка" }));
    if (item.stock === "order") name.append(el("span", { class: "badge", text: "Под заказ" }));
    if (item.stock === "out") name.append(el("span", { class: "badge badge-out", text: "Нет в наличии" }));

    const tr = el("tr", { class: item.stock === "out" ? "is-out" : null, "data-key": item.key },
      name,
      el("td", { class: "c-opt num", "data-label": "Опт", text: item.opt != null ? rub(item.opt) : "—" }),
      el("td", { class: "c-ret num", "data-label": "Розн.", text: item.ret != null ? rub(item.ret) : "—" }),
    );
    return { item, tr };
  }

  function render(data) {
    const frag = document.createDocumentFragment();
    state.groupViews = data.groups.map((g) => {
      const bodyId = "g-" + g.slug + "-body";
      const count = el("span", { class: "g-count" });
      const toggle = el("button", { type: "button", class: "group-toggle", "aria-expanded": "false", "aria-controls": bodyId },
        el("span", { class: "g-name", text: g.series }),
        el("span", { class: "g-dots", "aria-hidden": "true" }),
        count,
        icon("chevron-down"),
      );
      const rows = g.items.map(renderRow);
      const table = el("table", { class: "ptable" },
        el("thead", null, el("tr", null,
          el("th", { scope: "col", text: "Наименование" }),
          el("th", { scope: "col", class: "num", text: "Опт" }),
          el("th", { scope: "col", class: "num", text: "Розница" }),
        )),
        el("tbody", null, ...rows.map((r) => r.tr)),
      );
      const body = el("div", { class: "group-body", id: bodyId, hidden: true }, table);
      const section = el("section", { class: "group", id: g.slug, "data-series": g.series },
        el("h3", { class: "group-title" }, toggle), body);
      frag.append(section);
      return { ...g, section, toggle, body, count, rows };
    });
    const box = $("#groups");
    box.replaceChildren(frag);
    box.removeAttribute("aria-busy");

    const select = $("#series");
    const current = state.series;
    select.replaceChildren(el("option", { value: "", text: "Все серии" }),
      ...data.groups.map((g) => el("option", { value: g.series, text: `${g.series} (${g.items.length})` })));
    state.series = data.groups.some((g) => g.series === current) ? current : "";
    select.value = state.series;

    applyFilter();
  }

  function setExpanded(view, open) {
    view.toggle.setAttribute("aria-expanded", String(open));
    view.body.hidden = !open;
  }

  function applyFilter() {
    if (!state.data) return;
    const q = norm(state.query.trim());
    const filtering = Boolean(q || state.inStock || state.series);
    let shown = 0;

    for (const v of state.groupViews) {
      let inGroup = 0;
      for (const r of v.rows) {
        const ok = (!q || r.item.search.includes(q)) && (!state.inStock || r.item.stock !== "out");
        r.tr.classList.toggle("is-filtered", !ok);
        if (ok) inGroup++;
      }
      const visible = inGroup > 0 && (!state.series || v.series === state.series);
      v.section.classList.toggle("is-filtered", !visible);
      if (visible) shown += inGroup;

      const total = v.rows.length;
      const full = `${total} ${plural(total, ["позиция", "позиции", "позиций"])}`;
      v.count.textContent = q || state.inStock ? `${inGroup} из ${total}` : full;
      v.count.dataset.total = full;

      if (q) setExpanded(v, visible);
      else if (state.series) setExpanded(v, v.series === state.series);
      else setExpanded(v, state.open.has(v.series));
    }

    const total = state.data.items.length;
    const seriesCount = state.data.groups.length;
    $("#status").textContent = filtering
      ? `Найдено: ${shown} из ${total}`
      : `${total} ${plural(total, ["позиция", "позиции", "позиций"])} в ${seriesCount} ${seriesCount % 10 === 1 && seriesCount % 100 !== 11 ? "серии" : "сериях"}. Нажмите на серию, чтобы открыть список.`;

    const empty = shown === 0;
    $("#empty").hidden = !empty;
    if (empty) {
      $("#empty-text").textContent = state.query.trim()
        ? `По запросу «${state.query.trim()}» ничего не найдено.`
        : "По выбранным условиям ничего не найдено.";
    }
  }

  function updateMeta(data) {
    const total = data.items.length;
    const sc = data.groups.length;
    $("#hero-stat").textContent =
      `${total} ${plural(total, ["позиция", "позиции", "позиций"])} в ${sc} ${sc % 10 === 1 && sc % 100 !== 11 ? "серии" : "сериях"} с оптовыми и розничными ценами.`;
    const dateEl = $("#price-date");
    dateEl.hidden = !data.date;
    dateEl.textContent = data.date ? `Цены актуальны на ${data.date}` : "";
  }

  function show(data) {
    state.data = data;
    render(data);
    updateMeta(data);
    if (!state.handledHash) {
      state.handledHash = true;
      openFromHash();
    }
  }

  function openFromHash() {
    const slug = decodeURIComponent(location.hash.slice(1));
    const view = state.groupViews.find((v) => v.slug === slug);
    if (!view) return;
    state.query = "";
    $("#q").value = "";
    $("#q-clear").hidden = true;
    state.series = "";
    $("#series").value = "";
    state.open.add(view.series);
    applyFilter();
    view.section.scrollIntoView();
  }

  function notice(text) {
    $("#notice").hidden = !text;
    $("#notice-text").textContent = text || "";
  }

  const fallbackText = (date) =>
    `Не удалось загрузить свежий прайс — показана сохранённая версия${date ? " от " + date : ""}.`;

  async function loadPrices() {
    const remote = String(CFG.sheetCsvUrl || "").trim();
    let fromCache = false;
    const cached = remote ? lsGet(LS_PRICES) : null;

    if (cached && typeof cached.csv === "string") {
      try {
        show(buildData(cached.csv));
        fromCache = true;
      } catch {
        /* corrupted cache: ignore */
      }
    }

    if (remote) {
      try {
        const text = await fetchText(remote);
        const data = buildData(text);
        if (!fromCache || cached.csv !== text) show(data);
        lsSet(LS_PRICES, { csv: text, savedAt: Date.now() });
        notice("");
        return;
      } catch (err) {
        console.warn("Прайс из Google-таблицы не загрузился:", err);
        if (fromCache) {
          notice(fallbackText(state.data.date));
          return;
        }
      }
    }

    try {
      let text;
      try {
        text = await fetchText(LOCAL_CSV);
      } catch (err) {
        // Opened as file:// — the browser blocks fetch, so use the copy embedded in data/prices.js.
        if (typeof window.BADR_PRICES_CSV !== "string") throw err;
        text = window.BADR_PRICES_CSV;
      }
      const data = buildData(text);
      show(data);
      if (remote) notice(fallbackText(data.date));
    } catch (err) {
      console.error("Прайс не загрузился:", err);
      $("#groups").replaceChildren();
      $("#groups").removeAttribute("aria-busy");
      $("#status").textContent = "";
      notice("Прайс не загрузился. Обновите страницу или напишите нам — пришлём прайс в мессенджер.");
    }
  }

  /* ---------- Contact dock ---------- */

  function setupDock() {
    $("#dock").hidden = !["phone", "whatsapp", "telegram"].some((k) => contactLinks[k]);
    updateDockSpace();
  }

  function updateDockSpace() {
    const dockEl = $("#dock");
    const h = !dockEl.hidden ? dockEl.offsetHeight : 0;
    document.documentElement.style.setProperty("--dock-h", h + "px");
  }

  /* ---------- Events ---------- */

  function bindEvents() {
    const groups = $("#groups");

    groups.addEventListener("click", (e) => {
      const toggle = e.target.closest(".group-toggle");
      if (toggle) {
        const view = state.groupViews.find((v) => v.toggle === toggle);
        const open = toggle.getAttribute("aria-expanded") !== "true";
        if (!state.query.trim() && !state.series) {
          if (open) state.open.add(view.series);
          else state.open.delete(view.series);
          if (open) history.replaceState(null, "", "#" + view.slug);
        }
        setExpanded(view, open);
      }
    });

    const q = $("#q");
    let debounce = 0;
    q.addEventListener("input", () => {
      $("#q-clear").hidden = !q.value;
      clearTimeout(debounce);
      debounce = setTimeout(() => { state.query = q.value; applyFilter(); }, 150);
    });
    q.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && q.value) { e.preventDefault(); clearSearch(); }
    });
    $("#q-clear").addEventListener("click", () => { clearSearch(); q.focus(); });

    $("#series").addEventListener("change", (e) => { state.series = e.target.value; applyFilter(); });
    $("#instock").addEventListener("change", (e) => { state.inStock = e.target.checked; applyFilter(); });

    $("#reset").addEventListener("click", () => {
      state.series = "";
      $("#series").value = "";
      state.inStock = false;
      $("#instock").checked = false;
      clearSearch();
      q.focus();
    });

    const toTop = $("#to-top");
    toTop.addEventListener("click", () => window.scrollTo({ top: 0 }));
    window.addEventListener("scroll", () => { toTop.hidden = window.scrollY < 600; }, { passive: true });

    const topbar = $(".topbar");
    const onScroll = () => topbar.classList.toggle("is-scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    window.addEventListener("hashchange", openFromHash);
    window.addEventListener("resize", updateDockSpace, { passive: true });
  }

  function clearSearch() {
    const q = $("#q");
    q.value = "";
    $("#q-clear").hidden = true;
    state.query = "";
    applyFilter();
  }

  /* ---------- Init ---------- */

  setupContacts();
  $("[data-about-link]").hidden = !fillText("#about", "#about-text", CFG.about);
  fillText("#terms", "#terms-text", CFG.wholesaleTerms);
  $("#year").textContent = String(new Date().getFullYear());
  const sheetId = String(CFG.sheetId || "").trim();
  if (sheetId) {
    const dl = $("#dl");
    dl.href = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=xlsx`;
    dl.hidden = false;
  }
  function setupMotion() {
    const reveal = document.querySelectorAll("[data-reveal]");
    const navLinks = [...document.querySelectorAll(".nav a")];
    if (!("IntersectionObserver" in window)) {
      reveal.forEach((n) => n.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-visible");
        io.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px -10% 0px" });
    reveal.forEach((n) => io.observe(n));

    const spy = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        navLinks.forEach((a) => a.classList.toggle("is-active", a.getAttribute("href") === "#" + e.target.id));
      }
    }, { rootMargin: "-45% 0px -50% 0px" });
    navLinks.forEach((a) => {
      const target = document.querySelector(a.getAttribute("href"));
      if (target) spy.observe(target);
    });
  }

  bindEvents();
  setupMotion();
  setupDock();
  loadPrices();
})();
