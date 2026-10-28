/* calculBA — interface
 * Navigation par adresse (#/…) : le bouton « Précédent » du navigateur
 * fonctionne et chaque vue se recharge depuis le serveur.
 *
 *   #/                      mes jeux de données
 *   #/nouveau               créer un jeu (saisie des colonnes)
 *   #/nouveau/import        importer un fichier
 *   #/jeu/12                données du jeu 12
 *   #/jeu/12/stats          statistiques
 *   #/jeu/12/graphiques     graphiques
 */
"use strict";

(() => {
  // ------------------------------------------------------------ outils
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

  const nfBase = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 });
  // Valeurs inférieures à 0,01 : 4 chiffres significatifs (sinon 1,2e-8 s'afficherait « 0 »).
  const nfSmall = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 4 });
  const nf = { format: (v) => (typeof v === "number" && v !== 0 && Math.abs(v) < 0.01 ? nfSmall : nfBase).format(v) };
  const nf2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
  const int = new Intl.NumberFormat("fr-FR");
  const fmt = (v, f = nf) => (v === null || v === undefined || Number.isNaN(v) ? "—" : f.format(v));
  const plural = (n, one, many) => `${int.format(n)} ${n > 1 ? many : one}`;

  const parseTs = (s) => (s ? new Date(s.replace(" ", "T") + "Z") : null);
  const fmtDate = (s) => {
    const d = parseTs(s);
    return d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—";
  };
  const fmtDateTime = (s) => {
    const d = parseTs(s);
    return d ? d.toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  };

  // ------------------------------------------------------------- état
  const state = {
    user: null,
    meta: { domains: ["Béton", "Sols et géotechnique", "Topographie", "Matériaux", "Structures", "Routes", "Hydraulique", "Autre"], limits: { rows: 50000, columns: 60, upload_mb: 15, password_min: 10 } },
    datasets: [],
    renderToken: 0,       // annule les rendus devenus obsolètes
  };

  const EXAMPLES = {
    "Béton": "Echantillon, Age_jours, Resistance_MPa, Affaissement_mm",
    "Sols et géotechnique": "Sondage, Profondeur_m, Teneur_eau_pct, Densite_seche_t_m3, CBR_pct",
    "Topographie": "Point, Est_m, Nord_m, Altitude_m",
    "Matériaux": "Lot, Tamis_mm, Passant_pct",
    "Structures": "Element, Portee_m, Charge_kN, Fleche_mm",
    "Routes": "PR, Couche, Epaisseur_cm, Deflexion_1_100mm",
    "Hydraulique": "Station, Date, Debit_m3_s, Hauteur_m",
  };

  // -------------------------------------------------------------- API
  class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }

  async function api(path, { method = "GET", body, form } = {}) {
    const headers = { Accept: "application/json" };
    if (method !== "GET") headers["X-Requested-With"] = "calculBA";
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }

    let res;
    try {
      res = await fetch(path, { method, headers, body: payload, credentials: "same-origin" });
    } catch {
      throw new ApiError("Le serveur ne répond pas. Vérifiez que calculBA est lancé.", 0);
    }
    // Le corps n'est lu qu'une fois (texte), puis interprété : pas d'erreur
    // « body already used » quand le serveur renvoie autre chose que du JSON.
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* réponse non JSON */ }
    if (!res.ok) {
      const msg = (data && typeof data.detail === "string" && data.detail) || `Erreur ${res.status}`;
      if (res.status === 401 && !path.startsWith("/api/auth/")) sessionExpired(msg);
      throw new ApiError(msg, res.status);
    }
    return data;
  }

  // ------------------------------------------------- retours visuels
  function toast(message, kind = "info") {
    const el = document.createElement("div");
    el.className = `toast${kind === "error" ? " error" : ""}`;
    el.setAttribute("role", kind === "error" ? "alert" : "status");
    el.textContent = message;
    $("#toasts").append(el);
    setTimeout(() => el.remove(), kind === "error" ? 7000 : 3500);
  }

  async function busy(button, fn) {
    if (!button || button.getAttribute("aria-busy") === "true") return;
    button.setAttribute("aria-busy", "true");
    button.disabled = true;
    try { return await fn(); }
    finally { button.removeAttribute("aria-busy"); button.disabled = false; }
  }

  function confirmDialog({ title, body, confirm, danger = false, extra = "" }) {
    const dlg = $("#dialog");
    dlg.innerHTML = `
      <form method="dialog">
        <h2>${esc(title)}</h2>
        <p class="dialog-body">${esc(body)}</p>
        ${extra}
        <p class="form-error" role="alert"></p>
        <div class="btn-row">
          <button class="btn" value="cancel" type="submit" formnovalidate>Annuler</button>
          <button class="btn ${danger ? "btn-danger-solid" : "btn-primary"}" value="ok" type="submit">${esc(confirm)}</button>
        </div>
      </form>`;
    return dlg;
  }

  function openDialog(dlg, onConfirm) {
    const form = $("form", dlg);
    form.addEventListener("submit", async (e) => {
      const submitter = e.submitter;
      if (!submitter || submitter.value !== "ok") return;           // Annuler ou Échap
      e.preventDefault();
      if (!form.reportValidity()) return;
      $(".form-error", form).textContent = "";
      await busy(submitter, async () => {
        try { await onConfirm(form); dlg.close(); }
        catch (err) { $(".form-error", form).textContent = err.message; }
      });
    });
    dlg.showModal();
    const first = $("input, select, textarea", dlg);
    (first || $('button[value="ok"]', dlg)).focus();
  }

  // ------------------------------------------------------ connexion
  function showAuth(message = "") {
    state.user = null;
    $("#boot").hidden = true;
    $("#shell").hidden = true;
    $("#auth").hidden = false;
    $("#view").innerHTML = "";          // aucune donnée du compte précédent ne reste dans la page
    $("#recent-list").innerHTML = "";
    $("#user-name").textContent = "";
    $("#user-email").textContent = "";
    window.Charts?.destroyAll();
    $$("#auth form").forEach((f) => { f.reset(); $(".form-error", f).textContent = ""; });
    $$(".password input").forEach((i) => (i.type = "password"));
    $$(".reveal").forEach((b) => { b.textContent = "Afficher"; b.setAttribute("aria-pressed", "false"); });
    selectAuthTab("login");
    if (message) $("#login-form .form-error").textContent = message;
    $("#login-email").focus();
  }

  function sessionExpired(message) {
    if (!state.user) return;
    showAuth(message || "Votre session a expiré. Reconnectez-vous.");
  }

  function selectAuthTab(which) {
    const login = which === "login";
    $("#tab-login").setAttribute("aria-selected", String(login));
    $("#tab-register").setAttribute("aria-selected", String(!login));
    $("#login-form").hidden = !login;
    $("#register-form").hidden = login;
  }

  function enterApp(user) {
    state.user = user;
    $("#boot").hidden = true;
    $("#auth").hidden = true;
    $("#shell").hidden = false;
    $("#user-name").textContent = user.full_name;
    $("#user-email").textContent = user.email;
    $$("#auth form").forEach((f) => f.reset());   // le mot de passe ne reste pas dans le DOM
    if (!location.hash || location.hash === "#") location.hash = "#/";
    else route();
  }

  function bindAuth() {
    $("#tab-login").addEventListener("click", () => selectAuthTab("login"));
    $("#tab-register").addEventListener("click", () => selectAuthTab("register"));
    $(".segmented[role=tablist]").addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = $("#tab-login").getAttribute("aria-selected") === "true" ? "register" : "login";
      selectAuthTab(next); $(`#tab-${next}`).focus();
    });
    $$(".reveal").forEach((btn) => btn.addEventListener("click", () => {
      const input = document.getElementById(btn.getAttribute("aria-controls"));
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Masquer" : "Afficher";
      btn.setAttribute("aria-pressed", String(show));
    }));

    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.currentTarget, err = $(".form-error", f);
      err.textContent = "";
      if (!f.reportValidity()) return;
      await busy($("button[type=submit]", f), async () => {
        try {
          const d = await api("/api/auth/login", { method: "POST", body: { email: f.email.value, password: f.password.value } });
          enterApp(d.user);
        } catch (ex) { err.textContent = ex.message; f.password.select(); }
      });
    });

    $("#register-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.currentTarget, err = $(".form-error", f);
      err.textContent = "";
      f.password2.setCustomValidity(f.password.value === f.password2.value ? "" : "Les deux mots de passe ne correspondent pas.");
      if (!f.reportValidity()) return;
      await busy($("button[type=submit]", f), async () => {
        try {
          const d = await api("/api/auth/register", { method: "POST", body: {
            full_name: f.full_name.value, email: f.email.value, password: f.password.value, birth_date: f.birth_date.value || null,
            invite_code: f.invite_code.value.trim() || null } });
          enterApp(d.user);
          toast("Compte créé. Bienvenue !");
        } catch (ex) { err.textContent = ex.message; }
      });
    });
    $("#reg-password2").addEventListener("input", (e) => e.target.setCustomValidity(""));

    $("#logout-button").addEventListener("click", async () => {
      try { await api("/api/auth/logout", { method: "POST" }); } catch { /* on déconnecte l'interface quoi qu'il arrive */ }
      history.replaceState(null, "", location.pathname);
      showAuth();
      toast("Vous êtes déconnecté.");
    });

    $("#account-button").addEventListener("click", () => { closeRail(); openAccount(); });
  }

  function openAccount() {
    const dlg = confirmDialog({
      title: "Mon compte",
      body: "",
      confirm: "Supprimer définitivement",
      danger: true,
      extra: `
        <dl><dt>Nom</dt><dd>${esc(state.user.full_name)}</dd><dt>E-mail</dt><dd>${esc(state.user.email)}</dd>
            <dt>Jeux</dt><dd>${plural(state.datasets.length, "jeu de données", "jeux de données")}</dd></dl>
        <hr>
        <h3>Supprimer le compte</h3>
        <p class="help">Le compte et tous ses jeux de données sont effacés. Exportez d'abord ce que vous voulez garder.</p>
        <div class="field" style="margin-top:12px">
          <label for="del-password">Mot de passe actuel</label>
          <input id="del-password" name="current_password" type="password" autocomplete="current-password" required>
        </div>`,
    });
    $(".dialog-body", dlg).remove();
    $('button[value="cancel"]', dlg).textContent = "Fermer";
    openDialog(dlg, async (form) => {
      await api("/api/auth/delete-account", { method: "POST", body: { current_password: form.current_password.value } });
      history.replaceState(null, "", location.pathname);
      showAuth();
      toast("Compte et données supprimés.");
    });
  }

  // ------------------------------------------------------ rail mobile
  function openRail() { $("#rail").classList.add("open"); $("#backdrop").hidden = false; $("#menu-button").setAttribute("aria-expanded", "true"); $("#rail a")?.focus(); }
  function closeRail() { $("#rail").classList.remove("open"); $("#backdrop").hidden = true; $("#menu-button").setAttribute("aria-expanded", "false"); }
  function bindRail() {
    $("#menu-button").addEventListener("click", () => ($("#rail").classList.contains("open") ? closeRail() : openRail()));
    $("#backdrop").addEventListener("click", closeRail);
    $("#rail").addEventListener("click", (e) => { if (e.target.closest("a")) closeRail(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#rail").classList.contains("open")) { closeRail(); $("#menu-button").focus(); } });
  }

  async function refreshDatasets() {
    state.datasets = await api("/api/datasets");
    renderRecent();
    return state.datasets;
  }

  function renderRecent(activeId = currentDatasetId()) {
    const list = $("#recent-list");
    const items = state.datasets.slice(0, 8);
    list.innerHTML = items.length
      ? items.map((d) => `<li><a href="#/jeu/${d.id}" ${d.id === activeId ? 'aria-current="page"' : ""}>
          <span>${esc(d.name)}</span><small>${esc(d.domain)}, ${plural(d.record_count, "obs.", "obs.")}</small></a></li>`).join("")
      : `<li class="empty-note">Aucun jeu pour l'instant.</li>`;
  }

  function currentDatasetId() {
    const m = location.hash.match(/^#\/jeu\/(\d+)/);
    return m ? Number(m[1]) : null;
  }

  function setNav(key) {
    $$("[data-nav]").forEach((a) => (a.getAttribute("data-nav") === key ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
  }

  // ----------------------------------------------------------- routeur
  async function route() {
    if (!state.user) return;
    const token = ++state.renderToken;
    const view = $("#view");
    window.Charts?.destroyAll();
    const hash = location.hash.replace(/^#/, "") || "/";
    const parts = hash.split("/").filter(Boolean);
    const isCurrent = () => token === state.renderToken;

    try {
      if (parts.length === 0) { setNav("home"); await viewHome(view, isCurrent); }
      else if (parts[0] === "nouveau") { setNav("new"); await viewNew(view, parts[1] === "import" ? "import" : "create"); }
      else if (parts[0] === "jeu" && /^\d+$/.test(parts[1] || "")) {
        setNav(null);
        const row = parts[2] === "donnees" && /^\d+$/.test(parts[3] || "") ? Number(parts[3]) : null;
        await viewDataset(view, Number(parts[1]), parts[2] || "donnees", isCurrent, row);
      } else { setNav(null); viewNotFound(view); }
    } catch (err) {
      if (!isCurrent() || err.status === 401) return;
      view.innerHTML = `<div class="panel empty"><h2>${err.status === 404 ? "Introuvable" : "Chargement impossible"}</h2>
        <p>${esc(err.message)}</p><div class="btn-row"><a class="btn btn-primary" href="#/">Revenir à mes jeux</a></div></div>`;
    }
    if (isCurrent()) {
      renderRecent();
      const h1 = $("h1", view);
      document.title = `${h1 ? h1.textContent.trim() + " — " : ""}calculBA`;
      // Si la vue a déjà placé le focus (ex. ligne ciblée), on ne le reprend pas.
      if (!view.contains(document.activeElement) || document.activeElement === view) {
        view.focus({ preventScroll: true });
        window.scrollTo(0, 0);
      }
    }
  }

  function viewNotFound(view) {
    view.innerHTML = `<div class="panel empty"><h1>Page introuvable</h1><p>Cette adresse ne correspond à aucune page de calculBA.</p>
      <div class="btn-row"><a class="btn btn-primary" href="#/">Revenir à mes jeux</a></div></div>`;
  }

  // ---------------------------------------------------- vue : accueil
  async function viewHome(view, isCurrent) {
    view.innerHTML = `<p class="muted">Chargement…</p>`;
    const list = await refreshDatasets();
    if (!isCurrent()) return;
    const totalObs = list.reduce((s, d) => s + d.record_count, 0);
    const head = `
      <div class="page-head">
        <div><h1>Mes jeux de données</h1>
          <p>${list.length ? `${plural(list.length, "jeu", "jeux")}, ${plural(totalObs, "observation", "observations")} au total.` : "Un jeu de données regroupe les mesures d'une campagne d'essais ou d'un chantier."}</p></div>
        <div class="btn-row"><a class="btn" href="#/nouveau/import">Importer un fichier</a><a class="btn btn-primary" href="#/nouveau">Nouveau jeu</a></div>
      </div>`;
    if (!list.length) {
      view.innerHTML = head + `
        <div class="panel empty">
          <h2>Commencez votre premier jeu</h2>
          <p>Définissez vos colonnes (par exemple Échantillon, Âge en jours, Résistance en MPa) puis saisissez vos mesures, ou importez directement un fichier CSV ou Excel.</p>
          <div class="btn-row"><a class="btn btn-primary" href="#/nouveau">Créer un jeu</a><a class="btn" href="#/nouveau/import">Importer un fichier</a></div>
        </div>`;
      return;
    }
    view.innerHTML = head + `
      <div class="table-wrap">
        <table>
          <caption class="visually-hidden">Jeux de données du compte</caption>
          <thead><tr><th scope="col">Nom</th><th scope="col">Domaine</th><th scope="col" class="num">Observations</th>
            <th scope="col" class="num hide-sm">Colonnes</th><th scope="col" class="hide-sm">Modifié</th></tr></thead>
          <tbody>${list.map((d) => `
            <tr><td class="cell-max"><a class="ds-link" href="#/jeu/${d.id}">${esc(d.name)}</a></td>
              <td>${esc(d.domain)}</td><td class="num">${int.format(d.record_count)}</td>
              <td class="num hide-sm">${d.columns.length}</td><td class="hide-sm">${fmtDate(d.updated_at)}</td></tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p class="notice" style="margin-top:24px">Avant toute interprétation, vérifiez les unités de chaque colonne, la qualité des mesures et les normes d'essai applicables.</p>`;
  }

  // ------------------------------------------------ vue : nouveau jeu
  const domainOptions = (selected) => state.meta.domains.map((d) => `<option ${d === selected ? "selected" : ""}>${esc(d)}</option>`).join("");

  function splitColumns(text) {
    return text.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean);
  }

  async function viewNew(view, mode) {
    const lim = state.meta.limits;
    view.innerHTML = `
      <div class="page-head"><div><h1>Nouveau jeu de données</h1>
        <p>Partez de colonnes vides pour saisir vos mesures, ou importez un tableur existant.</p></div></div>
      <div class="segmented" style="max-width:420px;margin-bottom:24px" role="group" aria-label="Méthode">
        <a class="btn btn-ghost" href="#/nouveau" ${mode === "create" ? 'aria-current="page"' : ""} >Définir les colonnes</a>
        <a class="btn btn-ghost" href="#/nouveau/import" ${mode === "import" ? 'aria-current="page"' : ""} >Importer un fichier</a>
      </div>
      <div class="new-grid">${mode === "create" ? `
        <form class="panel stack" id="create-form" novalidate>
          <div class="field"><label for="ds-name">Nom du jeu</label>
            <input id="ds-name" name="name" maxlength="120" required placeholder="Essais de compression — lot 3"></div>
          <div class="field"><label for="ds-domain">Domaine</label><select id="ds-domain" name="domain">${domainOptions("Béton")}</select></div>
          <div class="field"><label for="ds-columns">Colonnes</label>
            <textarea id="ds-columns" name="columns" required aria-describedby="ds-columns-help" placeholder="Echantillon, Age_jours, Resistance_MPa"></textarea>
            <p class="help" id="ds-columns-help">Une colonne par ligne ou séparées par des virgules. Indiquez l'unité dans le nom (Resistance_MPa). Le type numérique est détecté automatiquement. ${lim.columns} colonnes au maximum.</p></div>
          <div><span class="label" id="preview-label">Aperçu</span><div class="chips" id="col-preview" aria-labelledby="preview-label"><span class="muted small">Aucune colonne pour l'instant.</span></div></div>
          <p class="form-error" role="alert"></p>
          <div class="btn-row"><button class="btn btn-primary" type="submit">Créer le jeu</button><a class="btn" href="#/">Annuler</a></div>
        </form>
        <aside class="panel">
          <div class="panel-head"><h2>Modèles par domaine</h2></div>
          <div class="examples">${Object.entries(EXAMPLES).map(([dom, cols]) => `
            <div class="example"><strong>${esc(dom)}</strong><code>${esc(cols)}</code>
              <button type="button" class="btn btn-sm" data-example="${esc(dom)}">Utiliser</button></div>`).join("")}
          </div>
        </aside>` : `
        <form class="panel stack" id="import-form" novalidate>
          <label class="dropzone" id="dropzone">
            <input type="file" id="file-input" name="file" accept=".csv,.txt,.xlsx,.xlsm" required>
            <strong>Choisir un fichier</strong>
            <span class="muted small">ou le déposer ici, CSV ou Excel .xlsx, ${lim.upload_mb} Mo maximum</span>
            <span class="file-name" id="file-name"></span>
          </label>
          <div class="field"><label for="imp-name">Nom du jeu <span class="muted">(facultatif)</span></label>
            <input id="imp-name" name="name" maxlength="120" placeholder="Nom du fichier par défaut"></div>
          <div class="field"><label for="imp-domain">Domaine</label><select id="imp-domain" name="domain">${domainOptions("Autre")}</select></div>
          <p class="form-error" role="alert"></p>
          <div class="btn-row"><button class="btn btn-primary" type="submit">Importer le fichier</button><a class="btn" href="#/">Annuler</a></div>
        </form>
        <aside class="panel">
          <div class="panel-head"><h2>Format attendu</h2></div>
          <p>La première ligne contient les noms de colonnes, chaque ligne suivante une observation.</p>
          <div class="table-wrap" style="margin:16px 0">
            <table><thead><tr><th>Echantillon</th><th class="num">Age_jours</th><th class="num">Resistance_MPa</th></tr></thead>
              <tbody><tr><td>B01</td><td class="num">7</td><td class="num">22,5</td></tr><tr><td>B02</td><td class="num">28</td><td class="num">31,8</td></tr></tbody></table>
          </div>
          <ul class="small muted" style="padding-left:18px;margin:0">
            <li>Séparateur virgule, point-virgule ou tabulation, détecté automatiquement.</li>
            <li>Décimales avec virgule ou point.</li>
            <li>Encodage UTF-8 ou Windows (export Excel).</li>
            <li>Limites : ${int.format(lim.rows)} lignes, ${lim.columns} colonnes.</li>
            <li>Ancien format .xls : enregistrez-le d'abord en .xlsx.</li>
          </ul>
        </aside>`}
      </div>`;

    if (mode === "create") bindCreate(view); else bindImport(view);
    $("input", view)?.focus();
  }

  function bindCreate(view) {
    const form = $("#create-form", view);
    const preview = () => {
      const cols = splitColumns(form.columns.value);
      const seen = new Map();
      cols.forEach((c) => seen.set(c.toLowerCase(), (seen.get(c.toLowerCase()) || 0) + 1));
      $("#col-preview", view).innerHTML = cols.length
        ? cols.map((c) => `<span class="chip${seen.get(c.toLowerCase()) > 1 ? " dup" : ""}">${esc(c)}</span>`).join("") +
          `<span class="muted small" style="align-self:center">${plural(cols.length, "colonne", "colonnes")}</span>`
        : `<span class="muted small">Aucune colonne pour l'instant.</span>`;
      return { cols, dups: [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k) };
    };
    form.columns.addEventListener("input", preview);
    $$("[data-example]", view).forEach((b) => b.addEventListener("click", () => {
      const dom = b.getAttribute("data-example");
      form.columns.value = EXAMPLES[dom].split(", ").join("\n");
      form.domain.value = dom;
      if (!form.name.value) form.name.focus(); else form.columns.focus();
      preview();
    }));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $(".form-error", form);
      err.textContent = "";
      const { cols, dups } = preview();
      if (!form.reportValidity()) return;
      if (!cols.length) { err.textContent = "Ajoutez au moins une colonne."; return; }
      if (dups.length) { err.textContent = `Colonne en double : ${dups.join(", ")}. Chaque nom doit être unique.`; return; }
      if (cols.length > state.meta.limits.columns) { err.textContent = `Maximum ${state.meta.limits.columns} colonnes.`; return; }
      await busy($("button[type=submit]", form), async () => {
        try {
          const ds = await api("/api/datasets", { method: "POST", body: { name: form.name.value, domain: form.domain.value, columns: cols } });
          toast(`Jeu « ${ds.name} » créé.`);
          location.hash = `#/jeu/${ds.id}`;
        } catch (ex) { err.textContent = ex.message; }
      });
    });
  }

  function bindImport(view) {
    const form = $("#import-form", view);
    const zone = $("#dropzone", view), input = $("#file-input", view);
    const showName = () => {
      const f = input.files[0];
      $("#file-name", view).textContent = f ? `${f.name}, ${(f.size / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} Ko` : "";
    };
    input.addEventListener("change", showName);
    ["dragenter", "dragover"].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((t) => zone.addEventListener(t, () => zone.classList.remove("drag")));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; showName(); }
    });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $(".form-error", form);
      err.textContent = "";
      const file = input.files[0];
      if (!file) { err.textContent = "Choisissez un fichier CSV ou Excel."; return; }
      if (file.size > state.meta.limits.upload_mb * 1024 * 1024) { err.textContent = `Fichier trop volumineux (maximum ${state.meta.limits.upload_mb} Mo).`; return; }
      const fd = new FormData();
      fd.append("file", file); fd.append("name", form.name.value); fd.append("domain", form.domain.value);
      const btn = $("button[type=submit]", form);
      await busy(btn, async () => {
        btn.textContent = "Import en cours…";
        try {
          const d = await api("/api/datasets/import", { method: "POST", form: fd });
          toast(`${plural(d.rows_imported, "ligne importée", "lignes importées")} dans « ${d.dataset.name} ».`);
          location.hash = `#/jeu/${d.dataset.id}/stats`;
        } catch (ex) { err.textContent = ex.message; }
        finally { btn.textContent = "Importer le fichier"; }
      });
    });
  }

  // ------------------------------------------------------ vue : jeu
  async function viewDataset(view, id, tab, isCurrent, row = null) {
    if (!["donnees", "stats", "graphiques", "probabilites"].includes(tab)) return viewNotFound(view);
    view.innerHTML = `<p class="muted">Chargement…</p>`;
    // Les statistiques donnent aussi le type de chaque colonne (pour la saisie).
    const stats = await api(`/api/datasets/${id}/stats`);
    if (!isCurrent()) return;
    const ds = stats.dataset;
    const idx = state.datasets.findIndex((d) => d.id === ds.id);
    if (idx >= 0) state.datasets[idx] = ds; else state.datasets.unshift(ds);

    const nNum = stats.numeric_columns.length;
    view.innerHTML = `
      <dl class="cartouche" aria-label="Fiche du jeu de données">
        <div class="c-title"><dt>Jeu de données</dt><dd><h1>${esc(ds.name)}</h1></dd></div>
        <div><dt>Domaine</dt><dd>${esc(ds.domain)}</dd></div>
        <div><dt>Observations</dt><dd>${int.format(ds.record_count)}</dd></div>
        <div><dt>Colonnes</dt><dd>${ds.columns.length} <span class="muted small">dont ${nNum} num.</span></dd></div>
        <div><dt>Modifié</dt><dd>${fmtDate(ds.updated_at)}</dd></div>
      </dl>
      <div class="cartouche-bar">
        <nav class="tabs" aria-label="Sections du jeu">
          <a href="#/jeu/${id}" ${tab === "donnees" ? 'aria-current="page"' : ""}>Données</a>
          <a href="#/jeu/${id}/stats" ${tab === "stats" ? 'aria-current="page"' : ""}>Statistiques</a>
          <a href="#/jeu/${id}/graphiques" ${tab === "graphiques" ? 'aria-current="page"' : ""}>Graphiques</a>
          <a href="#/jeu/${id}/probabilites" ${tab === "probabilites" ? 'aria-current="page"' : ""}>Probabilités</a>
        </nav>
        <div class="btn-row">
          <div class="menu">
            <button type="button" class="btn btn-sm" id="export-button" aria-haspopup="true" aria-expanded="false" aria-controls="export-menu">Exporter</button>
            <div class="menu-list" id="export-menu" hidden>
              <a href="/api/datasets/${id}/export?format=xlsx" download>Classeur Excel (.xlsx)<small>Recommandé : nombres reconnus partout</small></a>
              <a href="/api/datasets/${id}/export?format=csv-excel" download>CSV pour Excel français/allemand<small>Point-virgule, décimales avec virgule</small></a>
              <a href="/api/datasets/${id}/export?format=csv" download>CSV standard<small>Virgule, décimales avec point</small></a>
            </div>
          </div>
          <button type="button" class="btn btn-sm" id="edit-ds">Nom et domaine</button>
          <button type="button" class="btn btn-sm btn-danger" id="delete-ds">Supprimer</button>
        </div>
      </div>
      <div id="tab-body"></div>`;

    bindDatasetActions(view, ds);
    const body = $("#tab-body", view);
    if (tab === "donnees") await tabData(body, ds, stats, isCurrent, row);
    else if (tab === "stats") tabStats(body, ds, stats);
    else if (tab === "graphiques") tabCharts(body, ds, stats);
    else tabProba(body, ds, stats);
  }

  function bindDatasetActions(view, ds) {
    const btn = $("#export-button", view), menu = $("#export-menu", view);
    const close = () => { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); };
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden; btn.setAttribute("aria-expanded", String(!menu.hidden));
      if (!menu.hidden) $("a", menu).focus();
    });
    menu.addEventListener("click", () => { close(); toast("Export en cours de téléchargement."); });
    menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { close(); btn.focus(); } });

    $("#edit-ds", view).addEventListener("click", () => {
      const dlg = confirmDialog({
        title: "Nom et domaine du jeu", body: "Change le nom et le domaine du jeu entier. Pour corriger une mesure, utilisez le bouton « Modifier » au bout de la ligne concernée, dans l'onglet Données.", confirm: "Enregistrer",
        extra: `<div class="stack"><div class="field"><label for="ed-name">Nom</label><input id="ed-name" name="name" maxlength="120" required value="${esc(ds.name)}"></div>
          <div class="field"><label for="ed-domain">Domaine</label><select id="ed-domain" name="domain">${domainOptions(ds.domain)}</select></div></div>`,
      });
      openDialog(dlg, async (form) => {
        await api(`/api/datasets/${ds.id}`, { method: "PATCH", body: { name: form.name.value, domain: form.domain.value } });
        toast("Modifications enregistrées.");
        await refreshDatasets(); route();
      });
    });

    $("#delete-ds", view).addEventListener("click", () => {
      const dlg = confirmDialog({
        title: `Supprimer « ${ds.name} » ?`,
        body: `Le jeu et ses ${plural(ds.record_count, "observation", "observations")} seront effacés définitivement. Exportez-le d'abord si vous voulez en garder une copie.`,
        confirm: "Supprimer le jeu", danger: true,
      });
      openDialog(dlg, async () => {
        await api(`/api/datasets/${ds.id}`, { method: "DELETE" });
        toast(`Jeu « ${ds.name} » supprimé.`);
        state.datasets = state.datasets.filter((d) => d.id !== ds.id);
        location.hash = "#/";
      });
    });
  }

  // --------------------------------------------------- onglet données
  const PAGE = 50;

  async function tabData(body, ds, stats, isCurrent, targetRow = null) {
    const numeric = new Set(stats.numeric_columns);
    const fields = (values = {}, prefix = "f") => ds.columns.map((c, i) => `
      <div class="field"><label for="${prefix}-${i}">${esc(c)}</label>
        <input id="${prefix}-${i}" data-col="${esc(c)}" maxlength="500" autocomplete="off"
          ${numeric.has(c) ? 'inputmode="decimal"' : ""} value="${esc(values[c] ?? "")}"></div>`).join("");

    body.innerHTML = `
      <details class="entry" ${ds.record_count === 0 ? "open" : ""} id="entry">
        <summary>Ajouter une observation</summary>
        <form id="add-form" novalidate>
          <div class="grid-fields">${fields()}</div>
          <p class="help">Laissez vide une mesure inconnue plutôt que d'inscrire 0. Virgule ou point acceptés pour les décimales.</p>
          <p class="form-error" role="alert"></p>
          <div class="btn-row"><button class="btn btn-primary" type="submit">Ajouter l'observation</button>
            <button class="btn" type="reset">Effacer les champs</button></div>
        </form>
      </details>
      <section aria-labelledby="obs-title">
        <div class="panel-head"><h2 id="obs-title">Observations</h2><p id="obs-count"></p></div>
        <div id="records"></div>
      </section>`;

    // Page 1 par défaut ; si une ligne est demandée (#/jeu/12/donnees/31), sa page.
    const pageOf = (n) => Math.floor((Math.min(Math.max(n, 1), Math.max(ds.record_count, 1)) - 1) / PAGE) * PAGE;
    let offset = targetRow ? pageOf(targetRow) : 0;
    let highlight = targetRow;

    // Contrôle commun à « Ajouter une observation » et « Modifier la ligne » :
    // renvoie un message d'erreur, ou "" si tout est correct, et marque les champs fautifs.
    const check = (form, values) => {
      if (Object.values(values).every((v) => !v.trim())) return "Renseignez au moins une valeur.";
      const bad = ds.columns.filter((c) => numeric.has(c) && values[c].trim() && !looksNumeric(values[c]));
      $$("input[data-col]", form).forEach((i) => i.setAttribute("aria-invalid", String(bad.includes(i.dataset.col))));
      if (bad.length) {
        $(`input[data-col="${CSS.escape(bad[0])}"]`, form)?.focus();
        return `Valeur non numérique pour : ${bad.join(", ")}. Corrigez-la (ex. 30,5) ou laissez le champ vide.`;
      }
      return "";
    };

    const collect = (form) => {
      const values = {};
      $$("input[data-col]", form).forEach((i) => (values[i.dataset.col] = i.value));
      return values;
    };

    const load = async () => {
      const r = await api(`/api/datasets/${ds.id}/records?offset=${offset}&limit=${PAGE}`);
      if (!isCurrent()) return;
      ds.record_count = r.total;
      $(".cartouche div:nth-child(3) dd").textContent = int.format(r.total);
      $("#obs-count").textContent = r.total ? `${int.format(offset + 1)}–${int.format(offset + r.records.length)} sur ${int.format(r.total)}` : "";
      const box = $("#records", body);
      if (!r.total) {
        box.innerHTML = `<div class="panel empty"><h2>Aucune observation</h2><p>Saisissez une première mesure avec le formulaire ci-dessus, ou importez un fichier.</p></div>`;
        return;
      }
      box.innerHTML = `
        <div class="table-wrap"><table>
          <caption class="visually-hidden">Observations du jeu ${esc(ds.name)}</caption>
          <thead><tr><th scope="col">N°</th>${ds.columns.map((c) => `<th scope="col" class="${numeric.has(c) ? "num" : ""}">${esc(c)}</th>`).join("")}<th scope="col" class="num"><span class="visually-hidden">Actions</span></th></tr></thead>
          <tbody>${r.records.map((rec, i) => `
            <tr data-id="${rec.id}"><td class="rownum">${int.format(offset + i + 1)}</td>
              ${ds.columns.map((c) => {
                const v = rec.values[c];
                const empty = v === null || v === undefined || v === "";
                if (empty) return `<td class="${numeric.has(c) ? "num " : ""}missing"><span aria-hidden="true">—</span><span class="visually-hidden">vide</span></td>`;
                if (!numeric.has(c)) return `<td class="cell-max" title="${esc(v)}">${esc(v)}</td>`;
                const n = toNumber(v);
                return n === null
                  ? `<td class="num"><span class="flag" title="Valeur non numérique : ignorée dans les statistiques">${esc(v)}</span></td>`
                  : `<td class="num">${nf.format(n)}</td>`;
              }).join("")}
              <td class="actions"><button type="button" class="btn btn-sm btn-ghost" data-edit="${rec.id}" aria-label="Modifier l'observation ${offset + i + 1}">Modifier</button>
                <button type="button" class="btn btn-sm btn-ghost" data-del="${rec.id}" aria-label="Supprimer l'observation ${offset + i + 1}">Supprimer</button></td></tr>`).join("")}
          </tbody></table></div>
        <div class="pager">
          <form class="goto" id="goto-form" novalidate>
            <label for="goto-row">Aller à la ligne</label>
            <input id="goto-row" class="input" type="number" min="1" max="${r.total}" inputmode="numeric" placeholder="n°">
            <button class="btn btn-sm" type="submit">Afficher</button>
          </form>
          ${r.total > PAGE ? `<div class="btn-row"><span>Page ${Math.floor(offset / PAGE) + 1} sur ${Math.ceil(r.total / PAGE)}</span>
            <button class="btn btn-sm" data-page="first" ${offset === 0 ? "disabled" : ""}>Première</button>
            <button class="btn btn-sm" data-page="prev" ${offset === 0 ? "disabled" : ""}>Précédente</button>
            <button class="btn btn-sm" data-page="next" ${offset + PAGE >= r.total ? "disabled" : ""}>Suivante</button>
            <button class="btn btn-sm" data-page="last" ${offset + PAGE >= r.total ? "disabled" : ""}>Dernière</button></div>` : ""}
        </div>`;

      $("#goto-form", box).addEventListener("submit", (e) => {
        e.preventDefault();
        const n = Number($("#goto-row", box).value);
        if (!Number.isInteger(n) || n < 1 || n > r.total) { toast(`Indiquez un numéro entre 1 et ${int.format(r.total)}.`, "error"); return; }
        offset = pageOf(n); highlight = n;
        load();
      });

      // Ligne demandée : on la montre, on la met en évidence et on place le focus sur « Modifier ».
      if (highlight) {
        const tr = $$("tbody tr", box)[highlight - offset - 1];
        if (tr) {
          tr.classList.add("target");
          tr.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
          $("[data-edit]", tr)?.focus({ preventScroll: true });
        }
        highlight = null;
      }

      $$("[data-page]", box).forEach((b) => b.addEventListener("click", () => {
        const last = Math.floor((r.total - 1) / PAGE) * PAGE;
        offset = { first: 0, prev: Math.max(0, offset - PAGE), next: offset + PAGE, last }[b.dataset.page];
        load();
      }));
      $$("[data-del]", box).forEach((b) => b.addEventListener("click", () => {
        const dlg = confirmDialog({ title: "Supprimer cette observation ?", body: "Elle sera retirée du jeu et des statistiques.", confirm: "Supprimer", danger: true });
        openDialog(dlg, async () => {
          await api(`/api/datasets/${ds.id}/records/${b.dataset.del}`, { method: "DELETE" });
          toast("Observation supprimée.");
          if (r.records.length === 1 && offset > 0) offset -= PAGE;
          await load();
        });
      }));
      $$("[data-edit]", box).forEach((b) => b.addEventListener("click", () => {
        const rec = r.records.find((x) => String(x.id) === b.dataset.edit);
        const rowNo = offset + r.records.indexOf(rec) + 1;
        const dlg = confirmDialog({ title: `Modifier la ligne n° ${int.format(rowNo)}`, body: "", confirm: "Enregistrer",
          extra: `<div class="grid-fields">${fields(rec.values, "e")}</div>` });
        $(".dialog-body", dlg).remove();
        openDialog(dlg, async (form) => {
          const values = collect(form);
          const problem = check(form, values);
          if (problem) throw new Error(problem);
          await api(`/api/datasets/${ds.id}/records/${rec.id}`, { method: "PUT", body: { values } });
          toast(`Ligne n° ${int.format(rowNo)} modifiée.`);
          highlight = rowNo;
          await load();
        });
      }));
    };

    const form = $("#add-form", body);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $(".form-error", form);
      err.textContent = "";
      const values = collect(form);
      const problem = check(form, values);
      if (problem) { err.textContent = problem; return; }
      await busy($("button[type=submit]", form), async () => {
        try {
          await api(`/api/datasets/${ds.id}/records`, { method: "POST", body: { values } });
          form.reset();
          toast("Observation ajoutée.");
          ds.record_count += 1;
          offset = Math.max(0, Math.floor((ds.record_count - 1) / PAGE) * PAGE);
          await load();
          $("input", form).focus();
        } catch (ex) { err.textContent = ex.message; }
      });
    });
    form.addEventListener("reset", () => { $$("input", form).forEach((i) => i.removeAttribute("aria-invalid")); $(".form-error", form).textContent = ""; });

    await load();
  }

  // Même règle de lecture des nombres que le serveur (backend/analysis.py, to_number).
  function toNumber(s) {
    if (typeof s === "number") return Number.isFinite(s) ? s : null;
    let t = String(s ?? "").replace(/[\s  ']/g, "");
    if (!t) return null;
    if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
    else if ((t.match(/,/g) || []).length === 1) t = t.replace(",", ".");
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  const looksNumeric = (s) => toNumber(s) !== null;

  // ---------------------------------------------- onglet statistiques
  function tabStats(body, ds, stats) {
    if (!stats.total_rows) {
      body.innerHTML = `<div class="panel empty"><h2>Pas encore de statistiques</h2><p>Ajoutez des observations pour obtenir moyennes, dispersion et répartition.</p>
        <div class="btn-row"><a class="btn btn-primary" href="#/jeu/${ds.id}">Saisir des observations</a></div></div>`;
      return;
    }
    const C = stats.columns;
    const nums = stats.numeric_columns, texts = stats.text_columns;
    const flagged = nums.filter((c) => C[c].invalid > 0);

    body.innerHTML = `
      ${flagged.length ? `<div class="notice"><p>Des valeurs non numériques sont ignorées dans les calculs. Corrigez-les ou videz-les :</p><ul class="notice-list">${flagged.map((c) => {
          const rows = C[c].invalid_rows || [];
          const links = rows.map((n) => `<a href="#/jeu/${ds.id}/donnees/${n}">ligne ${int.format(n)}</a>`).join(", ");
          const more = C[c].invalid > rows.length ? ` et ${int.format(C[c].invalid - rows.length)} autres` : "";
          return `<li><strong>${esc(c)}</strong> : ${links}${more}</li>`;
        }).join("")}</ul></div>` : ""}
      ${nums.length ? `
      <section class="section" aria-labelledby="num-title">
        <div class="panel-head"><h2 id="num-title">Variables numériques</h2><p>Calculées sur les ${plural(stats.total_rows, "observation", "observations")} du jeu.</p></div>
        <div class="table-wrap"><table>
          <thead><tr><th scope="col">Variable</th><th scope="col" class="num">n</th><th scope="col" class="num">Manquantes</th>
            <th scope="col" class="num">Moyenne</th><th scope="col" class="num">Écart-type</th><th scope="col" class="num">CV</th>
            <th scope="col" class="num">Min</th><th scope="col" class="num">Q1</th><th scope="col" class="num">Médiane</th><th scope="col" class="num">Q3</th><th scope="col" class="num">Max</th></tr></thead>
          <tbody>${nums.map((c) => { const s = C[c]; return `
            <tr><th scope="row">${esc(c)}${s.invalid ? ` <span class="flag">${s.invalid} non num.</span>` : ""}</th>
              <td class="num">${int.format(s.count)}</td><td class="num">${int.format(s.missing)}</td>
              <td class="num">${fmt(s.mean)}</td><td class="num">${fmt(s.std)}</td><td class="num">${s.cv === null ? "—" : nf2.format(s.cv) + " %"}</td>
              <td class="num">${fmt(s.min)}</td><td class="num">${fmt(s.q1)}</td><td class="num">${fmt(s.median)}</td><td class="num">${fmt(s.q3)}</td><td class="num">${fmt(s.max)}</td></tr>`; }).join("")}
          </tbody></table></div>
        <div class="stat-legend"><span>n : valeurs exploitables</span><span>Écart-type : estimateur sans biais (n − 1)</span><span>CV : écart-type / |moyenne|</span><span>Q1, Q3 : 1er et 3e quartiles</span></div>
      </section>` : ""}
      ${texts.length ? `
      <section class="section" aria-labelledby="txt-title" style="margin-top:32px">
        <div class="panel-head"><h2 id="txt-title">Variables texte</h2><p>Identifiants, catégories et toute colonne majoritairement non numérique.</p></div>
        <div class="table-wrap"><table>
          <thead><tr><th scope="col">Variable</th><th scope="col" class="num">Renseignées</th><th scope="col" class="num">Manquantes</th><th scope="col" class="num">Distinctes</th><th scope="col">Valeurs les plus fréquentes</th></tr></thead>
          <tbody>${texts.map((c) => { const s = C[c]; return `
            <tr><th scope="row">${esc(c)}</th><td class="num">${int.format(s.count)}</td><td class="num">${int.format(s.missing)}</td><td class="num">${int.format(s.distinct)}</td>
              <td>${s.distinct > 1 && s.distinct === s.count ? `<span class="muted">Toutes différentes (identifiant)</span>`
                : `<div class="top-values">${s.top.length ? s.top.map((t) => `<span class="tag">${esc(t.value)} : ${int.format(t.count)}</span>`).join("") : "—"}</div>`}</td></tr>`; }).join("")}
          </tbody></table></div>
      </section>` : ""}`;
  }

  // ----------------------------------------------- onglet graphiques
  function tabCharts(body, ds, stats) {
    const nums = stats.numeric_columns;
    if (!stats.total_rows || !nums.length) {
      body.innerHTML = `<div class="panel empty"><h2>Rien à tracer pour l'instant</h2>
        <p>${stats.total_rows ? "Aucune colonne de ce jeu n'est numérique." : "Ajoutez des observations pour afficher les graphiques."}</p>
        <div class="btn-row"><a class="btn btn-primary" href="#/jeu/${ds.id}">Aller aux données</a></div></div>`;
      return;
    }
    const opts = (list, sel) => list.map((c) => `<option ${c === sel ? "selected" : ""}>${esc(c)}</option>`).join("");
    // Regroupement possible par une catégorie (2 à 60 valeurs) ou par une variable numérique.
    const groupable = ds.columns.filter((c) => {
      const s = stats.columns[c];
      return s.type === "text" ? s.distinct >= 2 && s.distinct <= 60 : s.count > 0;
    });
    // Variable mesurée par défaut : la plus « continue » (le plus de valeurs distinctes,
    // ex. Resistance_MPa) ; en X, la plus « discrète » (ex. Age_jours).
    const byDistinct = [...nums].sort((a, b) => stats.columns[b].distinct - stats.columns[a].distinct);
    const y0 = byDistinct[0];
    const x0 = byDistinct.length > 1 ? byDistinct[byDistinct.length - 1] : y0;
    const defaultBy = stats.text_columns.find((c) => stats.columns[c].distinct >= 2 && stats.columns[c].distinct <= 30) || x0;

    body.innerHTML = `
      <div class="chart-grid">
        <section class="panel chart-panel" aria-labelledby="h-hist">
          <h2 id="h-hist">Répartition</h2>
          <div class="controls"><div class="field"><label for="c-hist">Variable</label><select id="c-hist">${opts(nums, y0)}</select></div></div>
          <div class="chart-box"><canvas id="ch-hist" role="img"></canvas></div>
          <p class="chart-caption" id="cap-hist"></p>
          <details class="data-table"><summary>Voir les valeurs</summary><div id="t-hist"></div></details>
        </section>

        <section class="panel chart-panel" aria-labelledby="h-group">
          <h2 id="h-group">Moyenne par groupe</h2>
          <div class="controls">
            <div class="field"><label for="c-gval">Variable</label><select id="c-gval">${opts(nums, y0)}</select></div>
            <div class="field"><label for="c-gby">Regrouper par</label><select id="c-gby">${opts(groupable, defaultBy)}</select></div>
          </div>
          <div class="chart-box"><canvas id="ch-group" role="img"></canvas></div>
          <p class="chart-caption" id="cap-group"></p>
          <details class="data-table"><summary>Voir les valeurs</summary><div id="t-group"></div></details>
        </section>

        <section class="panel chart-panel wide" aria-labelledby="h-scatter">
          <h2 id="h-scatter">Relation entre deux variables</h2>
          <div class="controls">
            <div class="field"><label for="c-sx">Axe horizontal (X)</label><select id="c-sx">${opts(nums, x0)}</select></div>
            <div class="field"><label for="c-sy">Axe vertical (Y)</label><select id="c-sy">${opts(nums, y0)}</select></div>
          </div>
          <div class="chart-box"><canvas id="ch-scatter" role="img"></canvas></div>
          <p class="fit-eq" id="cap-scatter"></p>
        </section>

        <section class="panel chart-panel wide" aria-labelledby="h-series">
          <h2 id="h-series">Valeurs dans l'ordre de saisie</h2>
          <div class="controls"><div class="field"><label for="c-series">Variable</label><select id="c-series">${opts(nums, y0)}</select></div></div>
          <div class="chart-box"><canvas id="ch-series" role="img"></canvas></div>
          <p class="chart-caption" id="cap-series"></p>
        </section>
      </div>`;

    const C = window.Charts;
    const drawHist = () => {
      const col = $("#c-hist").value, s = stats.columns[col];
      C.histogram("ch-hist", col, s.histogram);
      $("#cap-hist").textContent = `${plural(s.count, "valeur", "valeurs")}, moyenne ${fmt(s.mean)}, médiane ${fmt(s.median)}${s.missing ? `, ${plural(s.missing, "valeur manquante exclue", "valeurs manquantes exclues")}` : ""}`;
      const e = s.histogram.edges;
      $("#t-hist").innerHTML = tableHtml(["Classe", "Effectif"], s.histogram.counts.map((n, i) => [`[${nf.format(e[i])} ; ${nf.format(e[i + 1])}${i === s.histogram.counts.length - 1 ? "]" : "["}`, int.format(n)]));
    };
    const drawGroups = withLoading("ch-group", async () => {
      const by = $("#c-gby").value, val = $("#c-gval").value;
      const g = await api(`/api/datasets/${ds.id}/charts/groups?by=${encodeURIComponent(by)}&value=${encodeURIComponent(val)}`);
      C.groups("ch-group", g);
      $("#cap-group").textContent = g.groups.length ? `${plural(g.total_groups, "groupe", "groupes")}${g.total_groups > g.shown ? ` (les ${g.shown} plus fréquents affichés)` : ""}, survolez une barre pour l'effectif et l'étendue` : "";
      $("#t-group").innerHTML = tableHtml([by, "n", "Moyenne", "Écart-type", "Min", "Max"], g.groups.map((x) => [x.group, int.format(x.n), fmt(x.mean), fmt(x.std), fmt(x.min), fmt(x.max)]));
    });
    const drawScatter = withLoading("ch-scatter", async () => {
      const x = $("#c-sx").value, y = $("#c-sy").value;
      const d = await api(`/api/datasets/${ds.id}/charts/scatter?x=${encodeURIComponent(x)}&y=${encodeURIComponent(y)}`);
      C.scatter("ch-scatter", d);
      const cap = $("#cap-scatter");
      if (x === y) cap.textContent = "Choisissez deux variables différentes.";
      else if (d.fit) {
        const sign = d.fit.intercept < 0 ? "−" : "+";
        cap.innerHTML = `Droite des moindres carrés : <strong>${esc(y)} = ${esc(fmt(d.fit.slope))} × ${esc(x)} ${sign} ${esc(fmt(Math.abs(d.fit.intercept)))}</strong>, R² = ${esc(nf.format(d.fit.r2))}, ${plural(d.n, "couple", "couples")}${d.plotted < d.n ? ` (${int.format(d.plotted)} tracés)` : ""}. Une corrélation ne prouve pas une relation de cause à effet.`;
      } else cap.textContent = d.n < 3 ? "Il faut au moins trois observations où X et Y sont renseignés." : "Pas de droite : l'une des variables est constante.";
    });
    const drawSeries = withLoading("ch-series", async () => {
      const col = $("#c-series").value;
      const d = await api(`/api/datasets/${ds.id}/charts/series?column=${encodeURIComponent(col)}`);
      C.series("ch-series", d, stats.columns[col]);
      const missing = d.total_rows - d.available;
      $("#cap-series").textContent = `${plural(d.available, "valeur", "valeurs")}${missing ? `, ${plural(missing, "observation sans valeur laissée", "observations sans valeur laissées")} en blanc` : ""}${d.plotted < d.available ? `, ${int.format(d.plotted)} points tracés par échantillonnage régulier` : ""}, trait pointillé : moyenne.`;
    });

    $("#c-hist").addEventListener("change", drawHist);
    ["#c-gby", "#c-gval"].forEach((s) => $(s).addEventListener("change", drawGroups));
    ["#c-sx", "#c-sy"].forEach((s) => $(s).addEventListener("change", drawScatter));
    $("#c-series").addEventListener("change", drawSeries);

    drawHist(); drawGroups(); drawScatter(); drawSeries();
    C.onThemeChange(() => { drawHist(); drawGroups(); drawScatter(); drawSeries(); });
  }

  // --------------------------------------------- onglet probabilités
  function tabProba(body, ds, stats) {
    // Colonnes utilisables : numériques avec au moins 5 valeurs et des valeurs différentes.
    const usable = stats.numeric_columns.filter((c) => stats.columns[c].count >= 5 && stats.columns[c].std);
    if (!usable.length) {
      body.innerHTML = `<div class="panel empty"><h2>Pas assez de mesures</h2>
        <p>Il faut une colonne numérique avec au moins 5 valeurs différentes pour ajuster une loi de probabilité.</p>
        <div class="btn-row"><a class="btn btn-primary" href="#/jeu/${ds.id}">Aller aux données</a></div></div>`;
      return;
    }
    const byCount = [...usable].sort((a, b) => stats.columns[b].distinct - stats.columns[a].distinct);
    const laws = state.meta.distributions || [{ key: "normal", label: "Normale" }];
    body.innerHTML = `
      <section class="panel chart-panel" aria-labelledby="h-proba">
        <div class="panel-head"><h2 id="h-proba">Ajuster une loi de probabilité</h2>
          <p>Ajustement par maximum de vraisemblance sur toutes les valeurs de la colonne.</p></div>
        <div class="controls">
          <div class="field"><label for="p-col">Variable</label><select id="p-col">${byCount.map((c) => `<option>${esc(c)}</option>`).join("")}</select></div>
          <div class="field"><label for="p-law">Loi</label><select id="p-law">${laws.map((l) => `<option value="${esc(l.key)}">${esc(l.label)}</option>`).join("")}</select></div>
        </div>
        <p class="notice" id="p-notice" hidden></p>
        <div class="proba-grid">
          <div>
            <div class="chart-box"><canvas id="ch-fit" role="img"></canvas></div>
            <p class="chart-caption" id="p-use"></p>
          </div>
          <div class="proba-side">
            <h3>Paramètres</h3><dl class="kv" id="p-params"></dl>
            <h3>Fractiles</h3><div id="p-quant"></div>
            <p class="small muted" id="p-ks"></p>
          </div>
        </div>
      </section>
      <section class="section" aria-labelledby="h-cmp" style="margin-top:32px">
        <div class="panel-head"><h2 id="h-cmp">Quelle loi décrit le mieux ces mesures ?</h2>
          <p>Classement par critère d'information d'Akaike (AIC) : plus il est petit, meilleur est l'ajustement.</p></div>
        <div id="p-cmp"></div>
        <p class="stat-legend">Un écart d'AIC inférieur à 2 avec la meilleure loi signifie que les deux décrivent les données presque aussi bien.
          Le test de Kolmogorov-Smirnov (KS) est indicatif : les paramètres sont estimés sur ces mêmes données.</p>
      </section>`;

    const law = $("#p-law"), col = $("#p-col");
    let firstRun = true;
    const run = withLoading("ch-fit", async () => {
      const r = await api(`/api/datasets/${ds.id}/probability?column=${encodeURIComponent(col.value)}&distribution=${encodeURIComponent(law.value)}`);
      // Premier affichage : on propose directement la loi la mieux classée.
      if (firstRun && r.best && r.best !== law.value) { firstRun = false; law.value = r.best; return run(); }
      firstRun = false;
      window.Charts.fit("ch-fit", col.value, r);
      const sel = r.selected;
      $("#p-use").textContent = `${sel.label} : ${sel.use}`;
      $("#p-params").innerHTML = sel.parameters.map((p) => `<dt>${esc(p.name)}</dt><dd>${esc(fmt(p.value))}</dd>`).join("")
        + `<dt>Effectif</dt><dd>${int.format(r.n)}</dd>`;
      const lbl = { 0.05: "5 %", 0.5: "50 % (médiane)", 0.95: "95 %" };
      $("#p-quant").innerHTML = tableHtml(["Fractile", "Loi ajustée", "Mesures"], r.quantiles.map((q) => [lbl[q.p], fmt(q.model), fmt(q.empirical)]));
      $("#p-ks").textContent = `Test KS indicatif : D = ${fmt(sel.ks_d)}, p = ${fmt(sel.ks_p)}. Rang ${sel.rank} sur ${r.comparison.filter((c) => c.available).length} selon l'AIC.`;
      const notes = [];
      if (r.small_sample) notes.push(`Seulement ${r.n} valeurs : les paramètres et surtout les fractiles extrêmes sont incertains.`);
      notes.push("Le fractile 5 % de la loi ajustée n'est pas directement une valeur caractéristique réglementaire : les normes (ex. EN 1990 annexe D, EN 206) ajoutent un facteur lié à la taille de l'échantillon.");
      $("#p-notice").hidden = false;
      $("#p-notice").textContent = notes.join(" ");
      $("#p-cmp").innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th scope="col">Rang</th><th scope="col">Loi</th><th scope="col" class="num">AIC</th><th scope="col" class="num">Écart</th>
          <th scope="col" class="num">KS : D</th><th scope="col" class="hide-sm">Usage courant</th><th scope="col"><span class="visually-hidden">Action</span></th></tr></thead>
        <tbody>${r.comparison.map((c) => c.available ? `
          <tr class="${c.key === sel.key ? "target" : ""}"><td class="rownum">${c.rank}</td><td><strong>${esc(c.label)}</strong></td>
            <td class="num">${fmt(c.aic)}</td><td class="num">${c.delta_aic === 0 ? "meilleure" : "+" + fmt(c.delta_aic)}</td>
            <td class="num">${fmt(c.ks_d)}</td><td class="hide-sm small muted">${esc(c.use)}</td>
            <td class="actions">${c.key === sel.key ? '<span class="small muted">affichée</span>' : `<button type="button" class="btn btn-sm" data-law="${esc(c.key)}">Afficher</button>`}</td></tr>` : `
          <tr><td class="rownum">—</td><td>${esc(c.label)}</td><td colspan="3" class="muted small">Non applicable : ${esc(c.reason)}</td>
            <td class="hide-sm small muted">${esc(c.use)}</td><td></td></tr>`).join("")}
        </tbody></table></div>`;
      $$("[data-law]", body).forEach((b) => b.addEventListener("click", () => { law.value = b.dataset.law; run(); $("#h-proba").scrollIntoView({ behavior: "smooth" }); }));
    });
    col.addEventListener("change", () => { firstRun = true; run(); });
    law.addEventListener("change", run);
    run();
    window.Charts.onThemeChange(run);
  }

  function withLoading(canvasId, fn) {
    return async () => {
      const box = document.getElementById(canvasId)?.parentElement;
      if (!box) return;
      $(".chart-msg", box)?.remove();
      try { await fn(); }
      catch (err) {
        if (err.status === 401) return;
        window.Charts.destroy(canvasId);
        const m = document.createElement("p"); m.className = "chart-msg"; m.textContent = err.message; box.append(m);
      }
    };
  }

  function tableHtml(headers, rows) {
    return `<div class="table-wrap"><table><thead><tr>${headers.map((h, i) => `<th scope="col" class="${i ? "num" : ""}">${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((v, i) => `<td class="${i ? "num" : ""}">${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  // ---------------------------------------------------------- démarrage
  async function boot() {
    bindAuth();
    bindRail();
    window.addEventListener("hashchange", route);
    // Un clic en dehors d'un menu ouvert le referme.
    document.addEventListener("click", (e) => {
      if (e.target.closest(".menu")) return;
      $$(".menu-list").forEach((m) => { m.hidden = true; });
      $$("[aria-haspopup]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    });
    try { state.meta = await api("/api/meta"); } catch { /* valeurs par défaut */ }
    if (state.meta.invite_required) {  // inscription réservée aux personnes qui ont le code
      $("#invite-field").hidden = false;
      $("#reg-invite").required = true;
    }
    try {
      const d = await api("/api/auth/me");
      state.user = d.user;
      await refreshDatasets().catch(() => {});
      enterApp(d.user);
    } catch (err) {
      showAuth(err.status === 0 ? err.message : "");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
