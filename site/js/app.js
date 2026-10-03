(() => {
  "use strict";

  const CFG = window.BADR_CONFIG || {};
  const CONTACTS = CFG.contacts || {};
  const LOCAL_CSV = "data/prices.csv";
  const FETCH_TIMEOUT = 10000;
  const SVGNS = "http://www.w3.org/2000/svg";

  const $ = (sel) => document.querySelector(sel);
  const pr = new Intl.PluralRules("ru");

  const plural = (n, [one, few, many]) => {
    const c = pr.select(n);
    return c === "one" ? one : c === "few" ? few : many;
  };
  const norm = (s) => s.toLowerCase().replace(/ё/g, "е");

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

  function buildData(text) {
    const rows = parseCSV(text);
    if (!rows.length) throw new Error("Пустой CSV");
    const head = rows[0].map((h) => norm(h.trim()));
    // The series column is always first; tolerate a blank or renamed header in A1.
    const iSeries = head.indexOf("серия") >= 0 ? head.indexOf("серия") : 0;
    const iName = head.indexOf("наименование");
    if (iName < 0) throw new Error("Нет колонки «Наименование»");

    const series = new Set();
    let count = 0;
    let date = null;
    for (const r of rows.slice(1)) {
      const first = (r[0] || "").trim();
      if (first.startsWith("#")) {
        if (norm(first).startsWith("#обновлено")) date = (r[1] || "").trim() || null;
        continue;
      }
      if (!(r[iName] || "").trim()) continue;
      count++;
      series.add((r[iSeries] || "").trim() || "Другое");
    }
    if (!count) throw new Error("В прайсе нет позиций");
    return { count, seriesCount: series.size, date };
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

  function fillText(targetSel, text) {
    const paras = String(text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    $(targetSel).replaceChildren(...paras.map((p) => el("p", { text: p })));
    $(targetSel).hidden = !paras.length;
    return paras.length > 0;
  }

  /* ---------- Where to buy ---------- */

  const MARKETS = [
    { key: "wildberries", name: "Wildberries", color: "#cb11ab" },
    { key: "ozon", name: "Ozon", color: "#005bff" },
    { key: "avito", name: "Авито", color: "#00aaff" },
  ];

  function webUrl(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;
    const url = /^https?:\/\//i.test(s) ? s : "https://" + s;
    try {
      return new URL(url).href;
    } catch {
      return null;
    }
  }

  function setupBuy() {
    const stores = (Array.isArray(CFG.stores) ? CFG.stores : [])
      .filter((st) => st && String(st.city || "").trim());
    $("#cities").replaceChildren(...stores.map((st) => {
      const address = String(st.address || "").trim();
      const map = webUrl(st.map);
      const body = [
        icon("map-pin"),
        el("span", { class: "city-text" },
          el("span", { class: "city", text: String(st.city).trim() }),
          address ? el("span", { class: "city-addr", text: address }) : null),
      ];
      return el("li", null, map
        ? el("a", { class: "city-card", href: map, target: "_blank", rel: "noopener" }, ...body)
        : el("div", { class: "city-card" }, ...body));
    }));
    $("#stores-block").hidden = !stores.length;
    $("#stat-cities").textContent = String(stores.length);
    $("#stat-cities").parentElement.hidden = !stores.length;

    const links = CFG.marketplaces || {};
    $("#markets").replaceChildren(...MARKETS.map((m) => {
      const url = webUrl(links[m.key]);
      const body = [
        el("span", { class: "market-dot", style: `--brand: ${m.color}` }),
        el("span", { class: "market-text" },
          el("span", { class: "market-name", text: m.name }),
          el("span", { class: "market-note", text: url ? "Перейти в магазин" : "Ссылка скоро появится" })),
        url ? icon("arrow-up-right") : null,
      ];
      return el("li", null, url
        ? el("a", { class: "market", href: url, target: "_blank", rel: "noopener" }, ...body)
        : el("div", { class: "market is-soon" }, ...body));
    }));
  }

  /* ---------- Books: gallery and full-size viewer ---------- */

  const viewer = { list: [], index: 0, opener: null };

  function showViewerItem() {
    const item = viewer.list[viewer.index];
    const img = $("#viewer-img");
    img.src = item.src;
    img.alt = item.alt;
    const n = viewer.list.length;
    $("#viewer-cap").textContent = n > 1 ? `${item.alt} · ${viewer.index + 1} из ${n}` : item.alt;
    $("#viewer-prev").hidden = n < 2;
    $("#viewer-next").hidden = n < 2;
  }

  function stepViewer(delta) {
    const n = viewer.list.length;
    viewer.index = (viewer.index + delta + n) % n;
    showViewerItem();
  }

  function openViewer(list, index, opener) {
    const dialog = $("#viewer");
    if (typeof dialog.showModal !== "function") {
      window.open(list[index].src, "_blank", "noopener");
      return;
    }
    viewer.list = list;
    viewer.index = index;
    viewer.opener = opener;
    showViewerItem();
    dialog.showModal();
  }

  function setupViewer() {
    const dialog = $("#viewer");
    $("#viewer-close").addEventListener("click", () => dialog.close());
    $("#viewer-prev").addEventListener("click", () => stepViewer(-1));
    $("#viewer-next").addEventListener("click", () => stepViewer(1));
    // A click on the dimmed area around the picture closes the viewer.
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog || e.target.classList.contains("viewer-fig")) dialog.close();
    });
    dialog.addEventListener("keydown", (e) => {
      if (viewer.list.length < 2) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); stepViewer(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); stepViewer(1); }
    });
    let startX = null;
    dialog.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
    dialog.addEventListener("touchend", (e) => {
      if (startX == null || viewer.list.length < 2) return;
      const dx = e.changedTouches[0].clientX - startX;
      startX = null;
      if (Math.abs(dx) > 50) stepViewer(dx < 0 ? 1 : -1);
    });
    dialog.addEventListener("close", () => {
      if (viewer.opener) viewer.opener.focus({ preventScroll: true });
    });
  }

  function setupBooks() {
    const track = $("#books-track");
    const items = [...track.querySelectorAll(".book")].map((button) => {
      const img = button.querySelector("img");
      return { button, src: img.getAttribute("src"), alt: img.alt, series: button.dataset.series || "" };
    });
    items.forEach((item, i) => item.button.addEventListener("click", () => openViewer(items, i, item.button)));

    const prev = $("#books-prev");
    const next = $("#books-next");
    const step = () => Math.max(track.clientWidth * 0.8, 160);
    prev.addEventListener("click", () => track.scrollBy({ left: -step() }));
    next.addEventListener("click", () => track.scrollBy({ left: step() }));
    const syncArrows = () => {
      prev.disabled = track.scrollLeft < 8;
      next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
    };
    track.addEventListener("scroll", syncArrows, { passive: true });
    window.addEventListener("resize", syncArrows, { passive: true });
    syncArrows();

    document.querySelectorAll("[data-open-series]").forEach((btn) => {
      const list = items.filter((item) => item.series === btn.dataset.openSeries);
      btn.hidden = !list.length;
      if (!list.length) return;
      btn.querySelector("span").textContent =
        `Смотреть ${list.length} ${plural(list.length, ["книгу", "книги", "книг"])}`;
      btn.addEventListener("click", () => openViewer(list, 0, btn));
    });
  }

  /* ---------- Price list: numbers and date for the download block ---------- */

  function updateMeta(data) {
    const n = data.count;
    const sc = data.seriesCount;
    const items = `${n} ${plural(n, ["позиция", "позиции", "позиций"])}`;
    $("#hero-stat").textContent =
      `${items} в ${sc} ${sc % 10 === 1 && sc % 100 !== 11 ? "серии" : "сериях"} с оптовыми и розничными ценами.`;
    $("#stat-books").textContent = String(n);
    $("#price-count").textContent = " · " + items;
    const dateEl = $("#price-date");
    dateEl.hidden = !data.date;
    dateEl.textContent = data.date ? `Цены актуальны на ${data.date}` : "";
  }

  async function loadPrices() {
    const sources = [String(CFG.sheetCsvUrl || "").trim(), LOCAL_CSV].filter(Boolean);
    for (const url of sources) {
      try {
        updateMeta(buildData(await fetchText(url)));
        return;
      } catch (err) {
        console.warn("Прайс не загрузился:", url, err);
      }
    }
    // Opened as file:// — the browser blocks fetch, so use the copy embedded in data/prices.js.
    try {
      if (typeof window.BADR_PRICES_CSV === "string") updateMeta(buildData(window.BADR_PRICES_CSV));
    } catch (err) {
      console.warn("Прайс не загрузился:", err);
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
    const toTop = $("#to-top");
    toTop.addEventListener("click", () => window.scrollTo({ top: 0 }));
    window.addEventListener("scroll", () => { toTop.hidden = window.scrollY < 600; }, { passive: true });

    const topbar = $(".topbar");
    const onScroll = () => topbar.classList.toggle("is-scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    window.addEventListener("resize", updateDockSpace, { passive: true });
  }

  /* ---------- Init ---------- */

  setupContacts();
  setupBuy();
  setupBooks();
  setupViewer();
  fillText("#about-text", CFG.about);
  $("#terms").hidden = !fillText("#terms-text", CFG.wholesaleTerms);
  $("#year").textContent = String(new Date().getFullYear());
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
