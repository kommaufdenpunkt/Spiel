'use strict';
// Tab-Icon hart erzwingen: manche Browser (v.a. Safari) halten ein altes
// Favicon extrem zäh. Wir entfernen alle Icon-Links und setzen frische mit
// neuer Version – so wird das aktuelle Emblem verlässlich geladen.
(function forceFavicon() {
  try {
    const v = '?v=3631';
    document.querySelectorAll('link[rel~="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]').forEach((l) => l.remove());
    const add = (rel, href, type, sizes) => { const l = document.createElement('link'); l.rel = rel; l.href = href; if (type) l.type = type; if (sizes) l.sizes = sizes; document.head.appendChild(l); };
    add('shortcut icon', '/favicon.ico' + v);
    add('icon', '/favicon.ico' + v, 'image/x-icon', 'any');
    add('icon', '/favicon.svg' + v, 'image/svg+xml');
    add('apple-touch-icon', '/apple-touch-icon.png' + v);
  } catch {}
})();
// ====================== Fahrschulportal – Frontend ======================
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
// Wochentags-/Monatsnamen werden je Sprache aufgebaut (siehe applyDateNames()).
let WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
let WD_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
let MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
let MON_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
let LOCALE = 'de-DE';

const state = { user: null, settings: null, date: todayStr(), instrTab: 'heute' };

// ====================== Sprachen (i18n) ======================
// Deutsch ist die Grundsprache; Englisch, Türkisch und Arabisch (RTL) sind wählbar.
// Fehlt eine Übersetzung, wird automatisch der deutsche Text genommen.
const LANGS = {
  de: { label: 'Deutsch', flag: '🇩🇪', dir: 'ltr' },
  en: { label: 'English', flag: '🇬🇧', dir: 'ltr' },
  tr: { label: 'Türkçe', flag: '🇹🇷', dir: 'ltr' },
  ar: { label: 'العربية', flag: '🇸🇦', dir: 'rtl' },
};
let LANG = 'de';
try {
  const saved = localStorage.getItem('fsp-lang');
  if (saved && LANGS[saved]) LANG = saved;
  else { const n = (navigator.language || '').slice(0, 2).toLowerCase(); if (LANGS[n]) LANG = n; }
} catch {}
const I18N = {
  de: {
    tagline_student: 'Fahrstunden einfach online buchen', tagline_admin: 'Fahrlehrer-Bereich',
    feat_book: '📅 Selbst buchen', feat_swap: '🎁 Tauschen', feat_pickup: '📍 Live-Abholung',
    feat_day: '📅 Tagesplan', feat_students: '🧑‍🎓 Fahrschüler', feat_reviews: '⭐ Bewertungen', feat_push: '🔔 Push',
    tab_login: 'Anmelden', tab_register: 'Neu (mit Code)', tab_instr: 'Fahrlehrer',
    appearance: '🎨 Aussehen', lang_section: '🌍 Sprache', terms: 'Nutzungsbedingungen', privacy: 'Datenschutz', imprint: 'Impressum', or: 'oder',
    login_id: 'Login-Name oder E-Mail', login_pw: 'Passwort', login_go: 'Anmelden',
    login_forgot_q: 'Passwort vergessen?', login_forgot_link: 'Neues anfordern', login_forgot_tail: '– dein Fahrlehrer setzt dir dann eins.',
    reg_intro: 'Du hast von deinem Fahrlehrer einen Zugangscode bekommen? Damit legst du hier einmalig dein Konto an. Deinen Login-Namen bekommst du danach angezeigt.',
    reg_code: 'Zugangscode', reg_name: 'Name', reg_name_ph: 'Vor- und Nachname', reg_year: 'Jahrgang',
    reg_email: 'E-Mail (optional)', reg_phone: 'Telefon (optional)', reg_pw: 'Passwort',
    reg_pw_hint: 'Mind. 8 Zeichen, mit Buchstabe, Zahl und Sonderzeichen (z. B. ! ? # @).', reg_go: 'Konto erstellen',
    instr_intro: 'Zugang nur für den Fahrlehrer.', instr_pin: 'PIN oder Passwort', instr_code: 'Authenticator-Code',
    instr_code_ph: '6-stelliger Code', instr_remember: 'Angemeldet bleiben', instr_go: 'Anmelden',
    instr_passkey: '🔓 Mit Face ID / Passkey anmelden', instr_forgot: 'Passwort vergessen?',
    gate_title: '👋 Willkommen bei ginoco',
    gate_text: 'Bevor du loslegst: Bitte lies kurz unsere <strong>Nutzungsbedingungen</strong> und den <strong>Datenschutz</strong>. Mit „Verstanden &amp; akzeptieren" bestätigst du, dass du sie zur Kenntnis genommen hast.',
    gate_terms: '📄 Nutzungsbedingungen', gate_privacy: '🔒 Datenschutz',
    gate_fallback: 'Lädt nicht? Direkt öffnen:', gate_later: 'Später', gate_ok: 'Verstanden & akzeptieren',
    book_title: 'Termin buchen', today: 'Heute', find_free: '🔎 Nächsten freien Termin',
    horizon_note: '(bis {d} Tage im Voraus)', horizon_note_rank: '(bis {d} Tage im Voraus · Rang {r})',
    min: 'Min', oclock: ' Uhr', at_time: 'um ',
    slots_none_title: '{day}: keine Fahrstunden',
    slots_none_text: 'An diesem Tag bietet dein Fahrlehrer keine Termine an. Lass mich den nächsten freien Tag für dich suchen.',
    find_free_long: '🔎 Nächsten freien Termin finden',
    slot_dur: '{start}–{end} · {dur} Min',
    slot_free_from_multi: 'frei ab {start} Uhr · {durs} Min wählbar',
    slot_free_from: 'frei ab {start} Uhr · {dur} Min',
    slot_mine: 'Dein Termin', slot_locked: '🔒 gebucht',
    free: 'frei', book: 'Buchen', taken: 'belegt', offered_out: 'wird abgegeben',
    past: 'vorbei', toofar: 'noch nicht buchbar', closed: 'geschlossen',
    slots_none_free: 'An diesem Tag ist gerade nichts frei.',
    cancel: 'Stornieren', abort: 'Abbrechen', close: 'Schließen',
    choose_duration: 'Dauer wählen', minutes_opt: '{d} Minuten',
    book_nofit: 'An diesem Start passt keine deiner Fahrstunden-Längen mehr in den Tag{cap}. Bitte wähle einen früheren Start.',
    book_nofit_cap: ' (nur noch {n} Min bis Feierabend)',
    book_confirm_title: 'Termin verbindlich buchen?',
    book_confirm_text: 'Bist du wirklich sicher, dass du diesen Termin nehmen willst?',
    book_rule1: 'Kostenfrei stornieren nur bis {h} Std. vorher.',
    book_rule2: 'Ab {h} Std. vorher steht der Termin fest – dann keine Absage mehr.',
    book_rule3: 'Im Zeitfenster dazwischen kannst du die Stunde anderen zur Übernahme anbieten.',
    book_go: 'Ja, verbindlich buchen',
    toast_booked: 'Termin gebucht ✓', celebrate_booked: 'Termin gebucht',
    cancel_confirm: 'Diesen Termin wirklich stornieren?', toast_cancelled: 'Storniert',
    toast_accepted: 'Termin angenommen ✓', toast_taken: 'Fahrstunde übernommen ✓',
    celebrate_taken: 'Übernommen', toast_declined: 'Abgelehnt',
    ds_rush: 'Berufsverkehr', ds_jam: 'Stau', ds_snow: 'Schnee', ds_ice: 'Glatteis', ds_weather: 'Witterung', ds_other: 'Sonstiges',
    ds_reason_label: 'Grund: ',
    ds_delay_title: 'Heute etwas später — ca. {min} Min',
    ds_delay_text: 'Deine Uhrzeit bleibt – bitte trotzdem pünktlich da sein.',
    ds_ok_title: 'Heute läuft alles planmäßig', ds_ok_text: 'Dein Fahrlehrer ist im Plan. Bis später!',
    away_vacation: '🌴 <strong>Fahrlehrer im Urlaub:</strong> {dates} – an diesen Tagen keine Fahrstunden.',
    notif_title: '🔔 Mitteilungen', notif_new: '{n} neu', notif_sign_btn: '✍️ Jetzt unterschreiben',
    notif_mark_read: 'Alle als gelesen markieren', notif_none: 'Keine Mitteilungen.', lesson_not_found: 'Fahrstunde nicht gefunden',
    offers_title: '🎁 Angebote', offers_sub: 'Fahrstunden, die andere abgeben',
    offers_limit: 'Du hast diese Woche schon dein Limit erreicht – Übernahme aus dieser Woche ist gesperrt.',
    offers_from: '🙋 von {name}', offers_anon: '🕶️ anonym', offers_take_q: '· möchtest du übernehmen?',
    take: 'Übernehmen', no_time: 'Keine Zeit',
    offer_give_title: '🎁 Ins Angebot geben',
    offer_give_text: 'Deine Stunde kommt in die <strong>Angebote</strong> – andere Fahrschüler können sie übernehmen. Übernimmt niemand, bleibt sie ganz normal bei dir.',
    offer_recognizable_q: 'Möchtest du dabei erkennbar sein?',
    offer_anon_btn: '🕶️ Anonym abgeben', offer_anon_sub: 'Niemand sieht, dass die Stunde von dir ist',
    offer_named_btn: '🙋 Mit „{name}" abgeben', offer_named_sub: 'Andere sehen nur deinen Vornamen',
    toast_offered: 'Ins Angebot gestellt ✓',
    role_student: 'Fahrschüler', role_instructor: 'Fahrlehrer', logout: 'Abmelden',
    tip_tour: 'Kurze Einführung', tip_profile: 'Mein Profil', tip_appearance: 'Aussehen & Farben',
    tip_live_stop: 'Standort-Teilen beenden', live_stop: '🛰️ Live · Stopp',
    nav_grp_overview: 'Übersicht', nav_grp_more: 'Mehr',
    nav_week: 'Meine Woche', nav_book: 'Termin buchen', nav_lessons: 'Meine Fahrstunden',
    nav_messages: 'Nachrichten', nav_notif: 'Mitteilungen', nav_offers: 'Angebote', nav_review: 'Bewertung',
    menu: 'Menü', actions: 'Aktionen', menu_open: 'Menü öffnen', menu_close: 'Menü schließen',
    ml_title: '📖 Meine Fahrstunden',
    ml_hint: 'Alle deine gefahrenen Stunden – mit Datum &amp; Uhrzeit, Dauer, Art und Vermerk. Bei jeder Stunde kannst du die Ausbildungskarte öffnen: <em>was</em> ihr geübt habt und wie es sitzt.',
    ml_overview_btn: '📋 Ausbildungs-Übersicht', ml_print_btn: '📄 Nachweis drucken',
    ml_th_when: 'Datum &amp; Uhrzeit', ml_th_end: 'Ende', ml_th_dur: 'Dauer', ml_th_type: 'Art', ml_th_late: 'Verspät.', ml_th_note: 'Vermerk / Ausbildungskarte',
    ml_dl_when: 'Wann', ml_dl_late: 'Verspätung', ml_dl_note: 'Vermerk',
    ml_driven_on: 'gefahren am', ml_entered_on: 'vom Fahrlehrer eingetragen am {date}',
    ml_on_invoice: '🧾 Auf der Rechnung zu sehen am {date}', ml_on_invoice_time: '🧾 Auf der Rechnung zu sehen am {date} um {time} Uhr',
    ml_sign_btn: '✍️ Unterschreiben', ml_signed: '✓ unterschrieben',
    ml_until: 'bis {end}', ml_absent: '🚫 nicht da', ml_late: '⏱️ {late} Min zu spät',
    ml_adk_card: '📋 Ausbildungskarte ({n})',
    ml_banner_one: '{n} Fahrstunde wartet auf deine Unterschrift.', ml_banner_many: '{n} Fahrstunden warten auf deine Unterschrift.',
    ml_banner_sub: 'Dein Fahrlehrer hat sie nachgetragen – bitte kurz bestätigen.', ml_banner_btn: 'Jetzt unterschreiben',
    sign_title: '✍️ Fahrstunde bestätigen',
    sign_hint: 'Schau kurz drüber und bestätige mit deiner Unterschrift – sie kommt auf deinen Fahrstunden-Nachweis.',
    sign_practiced: '📋 Das habt ihr geübt', sign_fl_signed: '✓ Dein Fahrlehrer hat unterschrieben',
    sign_your: 'Deine Unterschrift', sign_draw: '(mit dem Finger malen)', clear: 'Löschen',
    sign_confirm_ck: 'Ich bestätige, dass ich diese Fahrstunde gefahren bin.', sign_go: 'Bestätigen ✍️',
    saving: 'Wird gespeichert …', toast_signed: 'Unterschrieben – danke! ✓',
    greet_welcome: 'Schön, dass du da bist', greet_morning: 'Guten Morgen', greet_day: 'Guten Tag', greet_evening: 'Guten Abend',
    cd_now: 'jetzt', cd_in_days: 'in {d} Tagen', cd_in_hours: 'in {h} Std', cd_in_min: 'in {m} Min',
    wk_next_label: 'Deine nächste Fahrstunde',
    wk_title: 'Meine Fahrstunden', wk_sub: 'diese Woche ({from}–{to})',
    wk_reserve_one: '🔶 <strong>{n} Termin</strong> von deinem Fahrlehrer vorgeschlagen – bitte unten <strong>✅ Annehmen</strong> oder <strong>✕ Ablehnen</strong>.',
    wk_reserve_many: '🔶 <strong>{n} Termine</strong> von deinem Fahrlehrer vorgeschlagen – bitte unten <strong>✅ Annehmen</strong> oder <strong>✕ Ablehnen</strong>.',
    wk_pill: '{count} von {max} gebucht · noch {remaining} frei',
    wk_ical: '📅 Zum Kalender hinzufügen',
    wk_empty_title: 'Noch keine Fahrstunde gebucht',
    wk_empty_text: 'Bereit für die nächste Stunde? Ich springe dir direkt zum nächsten freien Termin – dann nur noch Uhrzeit antippen und buchen.',
    bk_gear_manual: 'Schalter', bk_gear_auto: 'Automatik',
    bk_done: 'gefahren', bk_offered: '🎁 im Angebot', bk_withdraw: 'Zurücknehmen',
    bk_reserved: '🔶 reserviert', bk_accept: '✅ Annehmen', bk_reject: '✕ Ablehnen',
    bk_due: '⏳ Bitte bis <strong>{when}</strong> antworten – sonst wird der Termin wieder frei.',
    bk_confirmed: '✅ bestätigt', bk_locked: '🔒 fest gebucht', bk_offer_btn: '🎁 Ins Angebot geben',
    bk_offer_title: 'Kostenfreies Storno nur bis {h} h vorher – gib die Stunde stattdessen ins Angebot',
    bk_in_h: '· in {h} h',
    pc_rank: '🏅 Rang {r}', pc_drives: '<strong>{n}</strong> Fahrstunden gefahren',
    pc_to_rank2: 'Weg zu Rang 2', pc_to_rank2_hint: 'Noch <strong>{n}</strong> Fahrstunden – dann siehst du <strong>{d} Tage</strong> im Voraus.',
    pc_rank2_ok: '✅ Rang 2 – du siehst {d} Tage im Voraus',
    pc_sonder: 'Sonderfahrten', pc_sonder_r2: 'ab Rang 2 buchbar',
    pc_sonder_help: 'Pflichtfahrten für die Führerscheinprüfung: Überlandfahrten, Autobahn und Nachtfahrt. Die Zahlen zeigen, wie viele du schon hast.',
    pc_book_min: '+ {dur} Min buchen',
    pc_sonder_hint: 'Sonderfahrten kannst du ab <strong>Rang 2</strong> ({n} Fahrstunden) selbst buchen.',
    pc_adk: '📋 Ausbildungskarte', pc_exam: '🎓 Prüfungsreife',
    msg_you: 'Du', msg_title: '✉️ Nachrichten', msg_to: 'an {who}', msg_placeholder: 'Nachricht schreiben …', send: 'Senden',
    msg_none: 'Noch keine Nachrichten. Schreib deinem Fahrlehrer – z. B. eine Frage oder Bescheid, wenn du dich verspätest.',
    rev_title: '⭐ Bewertung',
    rev_passed_t: 'Herzlichen Glückwunsch – bestanden!', rev_passed_s: 'Deine Akte bleibt erhalten. Magst du anderen erzählen, wie deine Ausbildung war?',
    rev_invite: 'Wenn du magst, hinterlass eine Bewertung – sie erscheint als Empfehlung auf der Startseite von Ginoco.',
    rev_mode_full: 'mit vollem Namen', rev_mode_initials: 'mit abgekürztem Namen', rev_mode_anon: 'anonym',
    rev_shown: 'Angezeigt {mode}', rev_with_photo: ' · mit Foto', rev_pending: ' · wird gerade geprüft',
    rev_edit: 'Bewertung bearbeiten', rev_new: '⭐ Bewertung schreiben',
    es_offers: 'Gerade gibt niemand eine Fahrstunde ab. Schau später wieder rein – hier erscheinen freie Stunden, die du übernehmen kannst.',
    es_notif: 'Keine neuen Mitteilungen. Hier landen z.B. neue Termine, Verschiebungen oder Angebote.',
    es_lesson_t: '🚗 Deine Fahrstunde', es_lesson: 'Rund um deine nächste Fahrstunde erscheint hier der Start-Knopf und der Fahrzeit-Timer.',
    es_live_t: '📍 Treffpunkt', es_live: 'Kurz vor deiner Fahrstunde siehst du hier den Treffpunkt und wo dein Fahrlehrer gerade ist.',
    es_lessons: 'Sobald du deine erste Fahrstunde gefahren bist, erscheint sie hier – mit Datum, Uhrzeit, Dauer und Vermerk. Daraus kannst du dir jederzeit einen Nachweis drucken.',
    es_messages: 'Schreib deinem Fahrlehrer – z. B. eine Frage oder kurz Bescheid, wenn du dich verspätest. Der Chat lädt gleich.',
    lt_today: 'Heute um <strong>{time} Uhr</strong> · {d} Min Fahrzeit.',
    lt_press_start: 'Drück auf Start, sobald deine Fahrstunde beginnt – dann läuft deine Fahrzeit.',
    lt_start: '▶️ Fahrstunde starten', lt_running: '🚗 Fahrstunde läuft',
    lt_time_up: '✅ Zeit um', lt_done_text: 'Deine {d}-Minuten-Fahrstunde ist abgelaufen. Super gemacht!',
    lt_remain: 'Fahrzeit übrig', lt_started: 'Start {time} · {d} Min', reset: 'Zurücksetzen',
    lt_toast_started: 'Fahrstunde gestartet – gute Fahrt! 🚗',
    lt_reset_confirm: 'Timer zurücksetzen? Die Fahrzeit beginnt dann neu.', lt_toast_reset: 'Zurückgesetzt',
    live_map_loading: 'Karte lädt …',
    live_hint: '🛰️ Die Karte aktualisiert sich automatisch – du siehst live, wo dein Fahrlehrer ist und wann du rausgehen musst.',
    ap_intro: 'Gestalte ginoco, wie es dir gefällt – alles wird auf diesem Gerät gespeichert.',
    ap_theme: 'Thema', ap_accent: 'Akzentfarbe', ap_accent_sub: '(Buttons & Reiter)',
    ap_font: 'Schriftart', ap_ink: 'Textfarbe', ap_edge: 'Menü-Farbe', ap_edge_sub: '(die zwei Menüseiten)',
    ap_standard: 'Standard', ap_size: 'Schriftgröße', ap_tone: 'Benachrichtigungston',
    ap_tone_chime: '🔔 Glocke (Standard)', ap_tone_lock: '🚗🔒 Auto-Verriegeln', ap_tone_off: '🔇 Aus',
    ap_tone_hint: 'Klingt bei neuen Mitteilungen (z. B. „Etwas liegt im Postfach"), solange die App offen ist.',
    reset_btn: 'Zurücksetzen', done: 'Fertig', ap_reset_toast: 'Auf Standard zurückgesetzt', ap_own_color: 'Eigene Farbe', probe: 'Probe',
    pf_open: 'Bearbeiten ▾', pf_close: 'Zuklappen ▲', pf_my_profile: 'Mein Profil',
    pf_summary_empty: 'Tippe zum Vervollständigen', pf_years: '{a} Jahre',
    pf_change_photo: 'Foto ändern', pf_remove_photo: 'Foto entfernen',
    pf_privacy: '🔒 Nur dein Fahrlehrer sieht dein Profil – kein anderer Fahrschüler.',
    pf_personal: '👤 Persönliches', pf_name: 'Name', pf_bdate: 'Geburtsdatum', pf_age: 'Alter',
    pf_address: '🏠 Adresse', pf_geo: '📍 Aktuellen Standort übernehmen',
    pf_geo_hint: 'Faul zuhause? Ein Tipp füllt Straße, PLZ und Ort automatisch – du ergänzt nur die Hausnummer.',
    pf_street: 'Straße', pf_houseno: 'Hausnr.', pf_zip: 'PLZ', pf_city: 'Ort',
    pf_contact: '📞 Kontakt', pf_phone: 'Handynummer', pf_email: 'E-Mail (optional)',
    pf_access: '🔑 Zugang', pf_login_fixed: 'Login-Name (fest, ändert sich nicht)', pf_reach_school: 'Fahrschule erreichen',
    pf_save: 'Speichern', pf_account: '⚠️ Konto', pf_del_account: '🗑️ Mein Konto löschen',
    pf_account_text: 'Du kannst dein Konto jederzeit selbst löschen. Dein Login und deine persönlichen Daten werden dann entfernt. Deine bereits gefahrenen Fahrstunden bleiben – anonymisiert – im gesetzlichen Ausbildungsnachweis deiner Fahrschule erhalten.',
    pf_ph_street: 'z.B. Bahnhofstraße', pf_ph_houseno: '12a', pf_ph_zip: '89073', pf_ph_city: 'z.B. Ulm', pf_ph_phone: 'z.B. 0151 23456789', pf_ph_email: 'name@mail.de',
    tour_skip: 'Überspringen', tour_prev: 'Zurück', tour_next: 'Weiter ›', tour_start: 'Los geht’s 🚗',
    da_title: '🗑️ Konto wirklich löschen?', da_text: 'Das kann nicht rückgängig gemacht werden. Dein Login und deine persönlichen Daten werden entfernt. Bereits gefahrene Fahrstunden bleiben anonym im Ausbildungsnachweis deiner Fahrschule.',
    da_pass_label: 'Zur Bestätigung: dein aktuelles Passwort', da_pass_ph: 'Passwort', da_word: 'LÖSCHEN', da_word_label: 'Tippe <strong>{w}</strong> zum Bestätigen',
    da_go: 'Konto endgültig löschen', da_deleting: 'Wird gelöscht…', da_done_alert: 'Dein Konto wurde gelöscht. Du wirst jetzt abgemeldet.',
    pf_photo_removed: 'Foto entfernt', pf_geo_searching: '📍 Suche deinen Standort …', pf_addr_notfound: 'Adresse nicht gefunden – bitte manuell eintragen.',
    pf_geo_ok: 'Standort übernommen ✓', pf_geo_ok_house: 'Standort übernommen ✓ – bitte Hausnummer ergänzen.', pf_geo_unavail: 'Standort nicht verfügbar: {e}', pf_saved: 'Profil gespeichert ✓',
    fg_title: 'Passwort vergessen', fg_text: 'Gib deinen Login-Namen oder deine E-Mail ein. Dein Fahrlehrer bekommt Bescheid und setzt dir ein neues Passwort – er teilt es dir persönlich mit.', fg_request: 'Anfordern', fg_need: 'Bitte Login-Name oder E-Mail eingeben.', fg_done: 'Angefragt ✓ – dein Fahrlehrer meldet sich mit einem neuen Passwort.',
    sf_book_title: '{label} buchen', sf_intro: 'Sonderfahrt mit fester Länge: <strong>{dur} Min</strong>. Wähle einen Tag – ich zeige dir die freien Startzeiten, an denen die {label} noch komplett in den Tag passt.', sf_day: 'Tag', sf_choose_day: 'Wähle einen Tag …', loading_short: 'Lädt…', sf_nofit: 'An diesem Tag passt die {label} ({dur} Min) nicht mehr in den Tagesplan. Wähle einen anderen, freieren Tag – am besten früh am Tag, damit der lange Block Platz hat.', sf_ends: '– endet {end}', sf_confirm_title: '{label} verbindlich buchen?', sf_confirm_dur: '{dur} Min · endet {end}', sf_confirm_note: 'Sonderfahrten sind Pflichtfahrten für die Prüfung. Die Buchung ist verbindlich.', sf_booked: '{label} gebucht',
    gps_unavail: 'GPS nicht verfügbar', loc_error: 'Standort-Fehler: {e}', loc_sharing: 'Dein Standort wird geteilt 📍',
    pk_title: '📍 Wo sollen wir dich abholen?', pk_text: 'Sag deinem Fahrlehrer, von wo du abgeholt werden möchtest. Du kannst auch deinen aktuellen Standort übernehmen.', pk_label: 'Abholort', pk_ph: 'z.B. vor der Schule, am Bahnhof …', pk_taken: '✓ Standort übernommen ({lat}, {lng})', pk_saved: 'Abholort gespeichert ✓',
    rc_geduld_label:'Geduld & Ruhe', rc_geduld_q:'Wie geduldig war dein Fahrlehrer?', rc_geduld_hint:'Ruhe bewahrt, auch wenn’s mal hakt?',
    rc_erklaerung_label:'Erklärungen', rc_erklaerung_q:'Wie verständlich waren die Erklärungen?', rc_erklaerung_hint:'Alles gut erklärt, sodass es Klick gemacht hat?',
    rc_puenktlich_label:'Zuverlässigkeit', rc_puenktlich_q:'Wie zuverlässig & pünktlich war er?', rc_puenktlich_hint:'Termine gehalten, pünktlich da?',
    rc_freundlich_label:'Freundlichkeit', rc_freundlich_q:'Wie freundlich war der Umgang?', rc_freundlich_hint:'Nett, motivierend, auf Augenhöhe?',
    rc_sicher_label:'Sicheres Gefühl', rc_sicher_q:'Wie sicher hast du dich beim Fahren gefühlt?', rc_sicher_hint:'Gut aufgehoben und sicher unterwegs?',
    rw_1:'geht so', rw_2:'okay', rw_3:'gut', rw_4:'sehr gut', rw_5:'top!',
    rw_intro_new:'Erzähl, wie deine Ausbildung war', rw_intro_p:'In ein paar kurzen Fragen bewertest du deinen Fahrlehrer – Stern antippen, fertig. Dauert unter einer Minute.',
    rw_intro_l1:'🧩 Schritt für Schritt – eine Frage nach der anderen', rw_intro_l2:'📸 Wenn du magst, direkt ein Foto dazu', rw_intro_l3:'🙈 Du bestimmst, ob dein Name erscheint (auch anonym)',
    rw_intro_why:'Deine echte Rückmeldung hilft anderen Fahrschülern – und deinem Fahrlehrer, noch besser zu werden.', rw_start:'Los geht’s →',
    rw_qn:'Frage {i} von {n}', rw_tap_star:'Tippe einen Stern an', rw_back:'← Zurück', rw_next:'Weiter →',
    rw_words_t:'💬 Deine Worte', rw_words_p:'Was möchtest du anderen mitgeben? Ein, zwei ehrliche Sätze reichen völlig.', rw_words_ph:'z. B. Super Fahrlehrer, sehr geduldig, erklärt alles ruhig – klare Empfehlung!',
    rw_photo_t:'📸 Foto dazu? (freiwillig)', rw_photo_p:'Mit Foto wirkt deine Empfehlung persönlicher. Ganz wie du magst.', rw_photo_other:'Anderes Foto', rw_photo_pick:'📷 Foto auswählen', rw_photo_none:'Kein Foto', rw_photo_show:'Foto bei meiner Bewertung anzeigen',
    rw_name_t:'🙋 Wie soll dein Name erscheinen?', rw_name_p:'Öffentlich sichtbar auf der Startseite. Du entscheidest.', rw_name_full:'Voller Name', rw_name_init:'Abgekürzt', rw_name_anon:'Anonym', rw_anon_student:'Ein Fahrschüler', rw_name_anon_nophoto:'Bei „Anonym" wird kein Foto angezeigt.',
    rw_sum_t:'✅ Passt das so?', rw_sum_nochips:'Keine Einzelnoten – kein Problem.', rw_submit:'Bewertung abschicken', rw_need_text:'Bitte schreib kurz ein, zwei Sätze.', rw_sending:'Wird gesendet …', rw_thanks:'Danke für deine Bewertung ⭐', actual_time:'Tatsächliche Zeit', sign_confirm_time:'Ich bestätige die Fahrstunde und die angezeigte Zeit.', both_confirmed:'✓ Zeit von Fahrlehrer &amp; Fahrschüler bestätigt', ml_actual:'🕒 Tatsächlich gefahren: {begin}–{end}', ml_actual_open:'🕒 Gestartet: {begin}',
    tour_t0: 'Willkommen bei ginoco', tour_x0: 'Hier buchst du deine Fahrstunden selbst – schnell und von überall. In ein paar kurzen Schritten zeige ich dir, wie es geht. Du kannst jederzeit auf „Überspringen“ tippen.',
    tour_t1: '1. Fahrstunde buchen', tour_x1: 'Am schnellsten geht’s mit <strong>🔎 Nächster freier Termin</strong> – ein Tipp und du landest beim nächsten freien Tag. Freie Zeiten sind <strong>grün</strong>. Tippe auf <strong>Buchen</strong>, wähle die Dauer und bestätige. Fertig! ✅',
    tour_t2: '2. Deine Termine', tour_x2: 'Oben unter <strong>„Meine Termine“</strong> siehst du alle gebuchten Stunden mit Datum, Uhrzeit und Treffpunkt. Über <strong>„Zum Kalender hinzufügen“</strong> landen sie in deinem Handy-Kalender.',
    tour_t3: '3. Doch keine Zeit?', tour_x3: 'Kannst du an dem Tag nicht: Tippe auf <strong>„🎁 Ins Angebot geben“</strong> – ein anderer Fahrschüler kann sie übernehmen (auf Wunsch anonym). Übernimmt niemand, bleibt sie bei dir. Früh genug geht auch <strong>„Stornieren“</strong>.',
    tour_t4: '4. Dein Profil', tour_x4: 'Tippe oben auf <strong>👤</strong> und vervollständige deine Daten. Die sieht <strong>nur dein Fahrlehrer</strong> – kein anderer Fahrschüler.',
    tour_t5: 'Los geht’s!', tour_x5: 'Das war’s schon. Viel Erfolg beim Üben! 🚗 Diese Einführung findest du jederzeit über das <strong>❓</strong> oben rechts.',
  },
  en: {
    tagline_student: 'Book driving lessons easily online', tagline_admin: 'Instructor area',
    feat_book: '📅 Book yourself', feat_swap: '🎁 Swap', feat_pickup: '📍 Live pick-up',
    feat_day: '📅 Day plan', feat_students: '🧑‍🎓 Students', feat_reviews: '⭐ Reviews', feat_push: '🔔 Push',
    tab_login: 'Sign in', tab_register: 'New (with code)', tab_instr: 'Instructor',
    appearance: '🎨 Appearance', lang_section: '🌍 Language', terms: 'Terms of Use', privacy: 'Privacy', imprint: 'Legal notice', or: 'or',
    login_id: 'Login name or e-mail', login_pw: 'Password', login_go: 'Sign in',
    login_forgot_q: 'Forgot your password?', login_forgot_link: 'Request a new one', login_forgot_tail: '– your instructor will set one for you.',
    reg_intro: 'Got an access code from your instructor? Use it to create your account once here. Your login name will be shown afterwards.',
    reg_code: 'Access code', reg_name: 'Name', reg_name_ph: 'First and last name', reg_year: 'Birth year',
    reg_email: 'E-mail (optional)', reg_phone: 'Phone (optional)', reg_pw: 'Password',
    reg_pw_hint: 'At least 8 characters, with a letter, a number and a special character (e.g. ! ? # @).', reg_go: 'Create account',
    instr_intro: 'For the instructor only.', instr_pin: 'PIN or password', instr_code: 'Authenticator code',
    instr_code_ph: '6-digit code', instr_remember: 'Stay signed in', instr_go: 'Sign in',
    instr_passkey: '🔓 Sign in with Face ID / passkey', instr_forgot: 'Forgot your password?',
    gate_title: '👋 Welcome to ginoco',
    gate_text: 'Before you start: please take a moment to read our <strong>Terms of Use</strong> and <strong>Privacy Policy</strong>. By tapping “Understood &amp; accept” you confirm you have read them.',
    gate_terms: '📄 Terms of Use', gate_privacy: '🔒 Privacy',
    gate_fallback: 'Not loading? Open directly:', gate_later: 'Later', gate_ok: 'Understood & accept',
    book_title: 'Book a lesson', today: 'Today', find_free: '🔎 Next free slot',
    horizon_note: '(up to {d} days ahead)', horizon_note_rank: '(up to {d} days ahead · rank {r})',
    min: 'min', oclock: '', at_time: 'at ',
    slots_none_title: 'No lessons on {day}',
    slots_none_text: 'Your instructor offers no slots on this day. Let me find the next free day for you.',
    find_free_long: '🔎 Find the next free slot',
    slot_dur: '{start}–{end} · {dur} min',
    slot_free_from_multi: 'free from {start} · {durs} min available',
    slot_free_from: 'free from {start} · {dur} min',
    slot_mine: 'Your lesson', slot_locked: '🔒 booked',
    free: 'free', book: 'Book', taken: 'taken', offered_out: 'being offered',
    past: 'past', toofar: 'not yet bookable', closed: 'closed',
    slots_none_free: 'Nothing free on this day right now.',
    cancel: 'Cancel', abort: 'Cancel', close: 'Close',
    choose_duration: 'Choose duration', minutes_opt: '{d} minutes',
    book_nofit: 'None of your lesson lengths fit into the day at this start{cap}. Please pick an earlier start.',
    book_nofit_cap: ' (only {n} min left until closing)',
    book_confirm_title: 'Book this lesson?',
    book_confirm_text: 'Are you sure you want to take this slot?',
    book_rule1: 'Free cancellation only up to {h} h before.',
    book_rule2: 'From {h} h before it is fixed – no more cancellation.',
    book_rule3: 'In between you can offer the lesson to others.',
    book_go: 'Yes, book it',
    toast_booked: 'Lesson booked ✓', celebrate_booked: 'Lesson booked',
    cancel_confirm: 'Really cancel this lesson?', toast_cancelled: 'Cancelled',
    toast_accepted: 'Lesson accepted ✓', toast_taken: 'Lesson taken over ✓',
    celebrate_taken: 'Taken over', toast_declined: 'Declined',
    ds_rush: 'Rush hour', ds_jam: 'Traffic jam', ds_snow: 'Snow', ds_ice: 'Black ice', ds_weather: 'Weather', ds_other: 'Other',
    ds_reason_label: 'Reason: ',
    ds_delay_title: 'A bit later today — approx. {min} min',
    ds_delay_text: 'Your time stays the same – please still be there on time.',
    ds_ok_title: 'Everything on schedule today', ds_ok_text: 'Your instructor is on track. See you later!',
    away_vacation: '🌴 <strong>Instructor on holiday:</strong> {dates} – no lessons on these days.',
    notif_title: '🔔 Messages', notif_new: '{n} new', notif_sign_btn: '✍️ Sign now',
    notif_mark_read: 'Mark all as read', notif_none: 'No messages.', lesson_not_found: 'Lesson not found',
    offers_title: '🎁 Offers', offers_sub: 'Lessons others are giving up',
    offers_limit: 'You’ve already reached your limit this week – taking over from this week is locked.',
    offers_from: '🙋 from {name}', offers_anon: '🕶️ anonymous', offers_take_q: '· want to take it?',
    take: 'Take over', no_time: 'No time',
    offer_give_title: '🎁 Offer this lesson',
    offer_give_text: 'Your lesson goes into the <strong>offers</strong> – other students can take it. If nobody does, it simply stays yours.',
    offer_recognizable_q: 'Do you want to be recognizable?',
    offer_anon_btn: '🕶️ Give up anonymously', offer_anon_sub: 'Nobody sees the lesson is yours',
    offer_named_btn: '🙋 Give up as “{name}”', offer_named_sub: 'Others only see your first name',
    toast_offered: 'Added to offers ✓',
    role_student: 'Student', role_instructor: 'Instructor', logout: 'Sign out',
    tip_tour: 'Quick intro', tip_profile: 'My profile', tip_appearance: 'Appearance & colours',
    tip_live_stop: 'Stop sharing location', live_stop: '🛰️ Live · Stop',
    nav_grp_overview: 'Overview', nav_grp_more: 'More',
    nav_week: 'My week', nav_book: 'Book a lesson', nav_lessons: 'My lessons',
    nav_messages: 'Messages', nav_notif: 'Notifications', nav_offers: 'Offers', nav_review: 'Review',
    menu: 'Menu', actions: 'Actions', menu_open: 'Open menu', menu_close: 'Close menu',
    ml_title: '📖 My lessons',
    ml_hint: 'All your driven lessons – with date &amp; time, duration, type and note. For each lesson you can open the training card: <em>what</em> you practised and how well it fits.',
    ml_overview_btn: '📋 Training overview', ml_print_btn: '📄 Print record',
    ml_th_when: 'Date &amp; time', ml_th_end: 'End', ml_th_dur: 'Duration', ml_th_type: 'Type', ml_th_late: 'Late', ml_th_note: 'Note / training card',
    ml_dl_when: 'When', ml_dl_late: 'Late', ml_dl_note: 'Note',
    ml_driven_on: 'driven on', ml_entered_on: 'entered by your instructor on {date}',
    ml_on_invoice: '🧾 Appears on the invoice on {date}', ml_on_invoice_time: '🧾 Appears on the invoice on {date} at {time}',
    ml_sign_btn: '✍️ Sign', ml_signed: '✓ signed',
    ml_until: 'until {end}', ml_absent: '🚫 not there', ml_late: '⏱️ {late} min late',
    ml_adk_card: '📋 Training card ({n})',
    ml_banner_one: '{n} lesson is waiting for your signature.', ml_banner_many: '{n} lessons are waiting for your signature.',
    ml_banner_sub: 'Your instructor added them – please confirm briefly.', ml_banner_btn: 'Sign now',
    sign_title: '✍️ Confirm lesson',
    sign_hint: 'Take a quick look and confirm with your signature – it goes onto your lesson record.',
    sign_practiced: '📋 What you practised', sign_fl_signed: '✓ Your instructor has signed',
    sign_your: 'Your signature', sign_draw: '(draw with your finger)', clear: 'Clear',
    sign_confirm_ck: 'I confirm that I drove this lesson.', sign_go: 'Confirm ✍️',
    saving: 'Saving …', toast_signed: 'Signed – thank you! ✓',
    greet_welcome: 'Great to see you', greet_morning: 'Good morning', greet_day: 'Hello', greet_evening: 'Good evening',
    cd_now: 'now', cd_in_days: 'in {d} days', cd_in_hours: 'in {h} h', cd_in_min: 'in {m} min',
    wk_next_label: 'Your next lesson',
    wk_title: 'My lessons', wk_sub: 'this week ({from}–{to})',
    wk_reserve_one: '🔶 <strong>{n} slot</strong> proposed by your instructor – please <strong>✅ Accept</strong> or <strong>✕ Decline</strong> below.',
    wk_reserve_many: '🔶 <strong>{n} slots</strong> proposed by your instructor – please <strong>✅ Accept</strong> or <strong>✕ Decline</strong> below.',
    wk_pill: '{count} of {max} booked · {remaining} left',
    wk_ical: '📅 Add to calendar',
    wk_empty_title: 'No lesson booked yet',
    wk_empty_text: 'Ready for your next lesson? I’ll jump you straight to the next free slot – just tap a time and book.',
    bk_gear_manual: 'Manual', bk_gear_auto: 'Automatic',
    bk_done: 'driven', bk_offered: '🎁 offered', bk_withdraw: 'Withdraw',
    bk_reserved: '🔶 reserved', bk_accept: '✅ Accept', bk_reject: '✕ Decline',
    bk_due: '⏳ Please reply by <strong>{when}</strong> – otherwise the slot is released again.',
    bk_confirmed: '✅ confirmed', bk_locked: '🔒 fixed', bk_offer_btn: '🎁 Offer this lesson',
    bk_offer_title: 'Free cancellation only up to {h} h before – offer the lesson instead',
    bk_in_h: '· in {h} h',
    pc_rank: '🏅 Rank {r}', pc_drives: '<strong>{n}</strong> lessons driven',
    pc_to_rank2: 'On the way to rank 2', pc_to_rank2_hint: '<strong>{n}</strong> more lessons – then you can see <strong>{d} days</strong> ahead.',
    pc_rank2_ok: '✅ Rank 2 – you can see {d} days ahead',
    pc_sonder: 'Special drives', pc_sonder_r2: 'bookable from rank 2',
    pc_sonder_help: 'Mandatory drives for the driving test: cross-country, motorway and night drive. The numbers show how many you already have.',
    pc_book_min: '+ book {dur} min',
    pc_sonder_hint: 'You can book special drives yourself from <strong>rank 2</strong> ({n} lessons).',
    pc_adk: '📋 Training card', pc_exam: '🎓 Test readiness',
    msg_you: 'You', msg_title: '✉️ Messages', msg_to: 'to {who}', msg_placeholder: 'Write a message …', send: 'Send',
    msg_none: 'No messages yet. Write to your instructor – e.g. a question or to let them know if you’re running late.',
    rev_title: '⭐ Review',
    rev_passed_t: 'Congratulations – you passed!', rev_passed_s: 'Your file stays intact. Would you like to tell others how your training was?',
    rev_invite: 'If you like, leave a review – it appears as a recommendation on the Ginoco home page.',
    rev_mode_full: 'with full name', rev_mode_initials: 'with abbreviated name', rev_mode_anon: 'anonymous',
    rev_shown: 'Shown {mode}', rev_with_photo: ' · with photo', rev_pending: ' · under review',
    rev_edit: 'Edit review', rev_new: '⭐ Write a review',
    es_offers: 'No one is giving up a lesson right now. Check back later – free lessons you can take over appear here.',
    es_notif: 'No new messages. New slots, reschedules or offers land here.',
    es_lesson_t: '🚗 Your lesson', es_lesson: 'Around your next lesson, the start button and the driving timer appear here.',
    es_live_t: '📍 Meeting point', es_live: 'Shortly before your lesson you’ll see the meeting point and where your instructor currently is.',
    es_lessons: 'Once you’ve driven your first lesson, it appears here – with date, time, duration and note. You can print a record from it any time.',
    es_messages: 'Write to your instructor – e.g. a question or a quick heads-up if you’re running late. The chat loads in a moment.',
    lt_today: 'Today at <strong>{time}</strong> · {d} min driving time.',
    lt_press_start: 'Tap start when your lesson begins – then your driving time runs.',
    lt_start: '▶️ Start lesson', lt_running: '🚗 Lesson in progress',
    lt_time_up: '✅ Time’s up', lt_done_text: 'Your {d}-minute lesson is over. Well done!',
    lt_remain: 'driving time left', lt_started: 'Start {time} · {d} min', reset: 'Reset',
    lt_toast_started: 'Lesson started – drive safely! 🚗',
    lt_reset_confirm: 'Reset the timer? The driving time starts over.', lt_toast_reset: 'Reset',
    live_map_loading: 'Map loading …',
    live_hint: '🛰️ The map updates automatically – you see live where your instructor is and when to head out.',
    ap_intro: 'Make ginoco your own – everything is saved on this device.',
    ap_theme: 'Theme', ap_accent: 'Accent colour', ap_accent_sub: '(buttons & tabs)',
    ap_font: 'Font', ap_ink: 'Text colour', ap_edge: 'Menu colour', ap_edge_sub: '(the two menu sides)',
    ap_standard: 'Default', ap_size: 'Font size', ap_tone: 'Notification sound',
    ap_tone_chime: '🔔 Bell (default)', ap_tone_lock: '🚗🔒 Car lock', ap_tone_off: '🔇 Off',
    ap_tone_hint: 'Sounds for new messages (e.g. “Something is in your mailbox”) while the app is open.',
    reset_btn: 'Reset', done: 'Done', ap_reset_toast: 'Reset to default', ap_own_color: 'Custom colour', probe: 'Test',
    pf_open: 'Edit ▾', pf_close: 'Collapse ▲', pf_my_profile: 'My profile',
    pf_summary_empty: 'Tap to complete', pf_years: '{a} years',
    pf_change_photo: 'Change photo', pf_remove_photo: 'Remove photo',
    pf_privacy: '🔒 Only your instructor sees your profile – no other student.',
    pf_personal: '👤 Personal', pf_name: 'Name', pf_bdate: 'Date of birth', pf_age: 'Age',
    pf_address: '🏠 Address', pf_geo: '📍 Use current location',
    pf_geo_hint: 'Feeling lazy at home? One tap fills in street, postcode and city – you only add the house number.',
    pf_street: 'Street', pf_houseno: 'No.', pf_zip: 'Postcode', pf_city: 'City',
    pf_contact: '📞 Contact', pf_phone: 'Mobile number', pf_email: 'E-mail (optional)',
    pf_access: '🔑 Access', pf_login_fixed: 'Login name (fixed, does not change)', pf_reach_school: 'Contact the school',
    pf_save: 'Save', pf_account: '⚠️ Account', pf_del_account: '🗑️ Delete my account',
    pf_account_text: 'You can delete your account yourself at any time. Your login and personal data are then removed. Your already driven lessons remain – anonymised – in your driving school\u2019s legally required training record.',
    pf_ph_street: 'e.g. Bahnhofstraße', pf_ph_houseno: '12a', pf_ph_zip: '89073', pf_ph_city: 'e.g. Ulm', pf_ph_phone: 'e.g. 0151 23456789', pf_ph_email: 'name@mail.com',
    tour_skip: 'Skip', tour_prev: 'Back', tour_next: 'Next ›', tour_start: 'Let’s go 🚗',
    da_title: '🗑️ Really delete account?', da_text: 'This cannot be undone. Your login and personal data are removed. Already driven lessons remain anonymously in your driving school’s training record.',
    da_pass_label: 'To confirm: your current password', da_pass_ph: 'Password', da_word: 'DELETE', da_word_label: 'Type <strong>{w}</strong> to confirm',
    da_go: 'Delete account permanently', da_deleting: 'Deleting…', da_done_alert: 'Your account has been deleted. You will now be signed out.',
    pf_photo_removed: 'Photo removed', pf_geo_searching: '📍 Finding your location …', pf_addr_notfound: 'Address not found – please enter manually.',
    pf_geo_ok: 'Location applied ✓', pf_geo_ok_house: 'Location applied ✓ – please add the house number.', pf_geo_unavail: 'Location unavailable: {e}', pf_saved: 'Profile saved ✓',
    fg_title: 'Forgot password', fg_text: 'Enter your login name or e-mail. Your instructor is notified and sets you a new password – they’ll tell you in person.', fg_request: 'Request', fg_need: 'Please enter your login name or e-mail.', fg_done: 'Requested ✓ – your instructor will get back to you with a new password.',
    sf_book_title: 'Book {label}', sf_intro: 'Special drive with a fixed length: <strong>{dur} min</strong>. Pick a day – I’ll show the free start times where the {label} still fits fully into the day.', sf_day: 'Day', sf_choose_day: 'Pick a day …', loading_short: 'Loading…', sf_nofit: 'The {label} ({dur} min) no longer fits into this day’s schedule. Pick another, freer day – ideally early in the day so the long block has room.', sf_ends: '– ends {end}', sf_confirm_title: 'Book {label}?', sf_confirm_dur: '{dur} min · ends {end}', sf_confirm_note: 'Special drives are mandatory for the test. The booking is binding.', sf_booked: '{label} booked',
    gps_unavail: 'GPS not available', loc_error: 'Location error: {e}', loc_sharing: 'Your location is being shared 📍',
    pk_title: '📍 Where should we pick you up?', pk_text: 'Tell your instructor where you’d like to be picked up. You can also use your current location.', pk_label: 'Pick-up spot', pk_ph: 'e.g. in front of school, at the station …', pk_taken: '✓ Location taken ({lat}, {lng})', pk_saved: 'Pick-up spot saved ✓',
    rc_geduld_label:'Patience & calm', rc_geduld_q:'How patient was your instructor?', rc_geduld_hint:'Stayed calm even when things got tricky?',
    rc_erklaerung_label:'Explanations', rc_erklaerung_q:'How clear were the explanations?', rc_erklaerung_hint:'Explained so it clicked?',
    rc_puenktlich_label:'Reliability', rc_puenktlich_q:'How reliable & punctual were they?', rc_puenktlich_hint:'Kept appointments, on time?',
    rc_freundlich_label:'Friendliness', rc_freundlich_q:'How friendly was the interaction?', rc_freundlich_hint:'Kind, motivating, at eye level?',
    rc_sicher_label:'Feeling safe', rc_sicher_q:'How safe did you feel while driving?', rc_sicher_hint:'In good hands and safe on the road?',
    rw_1:'so-so', rw_2:'okay', rw_3:'good', rw_4:'very good', rw_5:'top!',
    rw_intro_new:'Tell us how your training was', rw_intro_p:'In a few short questions you rate your instructor – tap a star, done. Takes under a minute.',
    rw_intro_l1:'🧩 Step by step – one question at a time', rw_intro_l2:'📸 Add a photo if you like', rw_intro_l3:'🙈 You decide whether your name appears (anonymous too)',
    rw_intro_why:'Your honest feedback helps other students – and your instructor to get even better.', rw_start:'Let’s go →',
    rw_qn:'Question {i} of {n}', rw_tap_star:'Tap a star', rw_back:'← Back', rw_next:'Next →',
    rw_words_t:'💬 Your words', rw_words_p:'What would you like to tell others? One or two honest sentences are plenty.', rw_words_ph:'e.g. Great instructor, very patient, explains everything calmly – highly recommended!',
    rw_photo_t:'📸 Add a photo? (optional)', rw_photo_p:'A photo makes your recommendation more personal. Entirely up to you.', rw_photo_other:'Another photo', rw_photo_pick:'📷 Choose photo', rw_photo_none:'No photo', rw_photo_show:'Show photo with my review',
    rw_name_t:'🙋 How should your name appear?', rw_name_p:'Publicly visible on the home page. You decide.', rw_name_full:'Full name', rw_name_init:'Abbreviated', rw_name_anon:'Anonymous', rw_anon_student:'A student', rw_name_anon_nophoto:'With “Anonymous”, no photo is shown.',
    rw_sum_t:'✅ Does this look right?', rw_sum_nochips:'No individual ratings – no problem.', rw_submit:'Submit review', rw_need_text:'Please write a sentence or two.', rw_sending:'Sending …', rw_thanks:'Thanks for your review ⭐', actual_time:'Actual time', sign_confirm_time:'I confirm the lesson and the time shown.', both_confirmed:'✓ Time confirmed by instructor &amp; student', ml_actual:'🕒 Actually driven: {begin}–{end}', ml_actual_open:'🕒 Started: {begin}',
    tour_t0: 'Welcome to ginoco', tour_x0: 'Here you book your driving lessons yourself – quickly and from anywhere. In a few short steps I’ll show you how. You can tap “Skip” any time.',
    tour_t1: '1. Book a lesson', tour_x1: 'Quickest via <strong>🔎 Next free slot</strong> – one tap takes you to the next free day. Free times are <strong>green</strong>. Tap <strong>Book</strong>, choose the duration and confirm. Done! ✅',
    tour_t2: '2. Your appointments', tour_x2: 'At the top under <strong>“My appointments”</strong> you see all booked lessons with date, time and meeting point. <strong>“Add to calendar”</strong> puts them in your phone calendar.',
    tour_t3: '3. No time after all?', tour_x3: 'Can’t make it that day: tap <strong>“🎁 Offer this lesson”</strong> – another student can take it over (anonymously if you like). If nobody does, it stays yours. Early enough, you can also <strong>“Cancel”</strong>.',
    tour_t4: '4. Your profile', tour_x4: 'Tap <strong>👤</strong> at the top and complete your details. Only <strong>your instructor</strong> sees them – no other student.',
    tour_t5: 'Let’s go!', tour_x5: 'That’s it. Good luck practising! 🚗 You can reopen this intro any time via the <strong>❓</strong> at the top right.',
  },
  tr: {
    tagline_student: 'Direksiyon derslerini kolayca online al', tagline_admin: 'Eğitmen alanı',
    feat_book: '📅 Kendin rezerve et', feat_swap: '🎁 Takas', feat_pickup: '📍 Canlı buluşma',
    feat_day: '📅 Günlük plan', feat_students: '🧑‍🎓 Öğrenciler', feat_reviews: '⭐ Değerlendirmeler', feat_push: '🔔 Bildirim',
    tab_login: 'Giriş yap', tab_register: 'Yeni (kodla)', tab_instr: 'Eğitmen',
    appearance: '🎨 Görünüm', lang_section: '🌍 Dil', terms: 'Kullanım Koşulları', privacy: 'Gizlilik', imprint: 'Künye', or: 'veya',
    login_id: 'Kullanıcı adı veya e-posta', login_pw: 'Şifre', login_go: 'Giriş yap',
    login_forgot_q: 'Şifreni mi unuttun?', login_forgot_link: 'Yeni iste', login_forgot_tail: '– eğitmenin sana yeni bir şifre belirler.',
    reg_intro: 'Eğitmeninden bir erişim kodu mu aldın? Onunla hesabını bir kez burada oluştur. Kullanıcı adın sonra gösterilir.',
    reg_code: 'Erişim kodu', reg_name: 'Ad', reg_name_ph: 'Ad ve soyad', reg_year: 'Doğum yılı',
    reg_email: 'E-posta (isteğe bağlı)', reg_phone: 'Telefon (isteğe bağlı)', reg_pw: 'Şifre',
    reg_pw_hint: 'En az 8 karakter; bir harf, bir rakam ve bir özel karakter (örn. ! ? # @).', reg_go: 'Hesap oluştur',
    instr_intro: 'Yalnızca eğitmen için.', instr_pin: 'PIN veya şifre', instr_code: 'Authenticator kodu',
    instr_code_ph: '6 haneli kod', instr_remember: 'Oturumu açık tut', instr_go: 'Giriş yap',
    instr_passkey: '🔓 Face ID / passkey ile giriş', instr_forgot: 'Şifreni mi unuttun?',
    gate_title: '👋 ginoco’ya hoş geldin',
    gate_text: 'Başlamadan önce: lütfen kısaca <strong>Kullanım Koşulları</strong> ve <strong>Gizlilik</strong> metnimizi oku. “Anladım ve kabul ediyorum”a dokunarak bunları okuduğunu onaylarsın.',
    gate_terms: '📄 Kullanım Koşulları', gate_privacy: '🔒 Gizlilik',
    gate_fallback: 'Yüklenmiyor mu? Doğrudan aç:', gate_later: 'Sonra', gate_ok: 'Anladım ve kabul ediyorum',
    book_title: 'Randevu al', today: 'Bugün', find_free: '🔎 En yakın boş randevu',
    horizon_note: '({d} güne kadar önceden)', horizon_note_rank: '({d} güne kadar önceden · Sınıf {r})',
    min: 'dk', oclock: '', at_time: 'saat ',
    slots_none_title: '{day}: ders yok',
    slots_none_text: 'Eğitmenin bu gün randevu sunmuyor. Senin için bir sonraki boş günü bulayım.',
    find_free_long: '🔎 Bir sonraki boş randevuyu bul',
    slot_dur: '{start}–{end} · {dur} dk',
    slot_free_from_multi: '{start}’ten itibaren boş · {durs} dk seçilebilir',
    slot_free_from: '{start}’ten itibaren boş · {dur} dk',
    slot_mine: 'Randevun', slot_locked: '🔒 rezerve',
    free: 'boş', book: 'Rezerve et', taken: 'dolu', offered_out: 'devrediliyor',
    past: 'geçti', toofar: 'henüz açılmadı', closed: 'kapalı',
    slots_none_free: 'Bu gün şu an boş yer yok.',
    cancel: 'İptal et', abort: 'Vazgeç', close: 'Kapat',
    choose_duration: 'Süre seç', minutes_opt: '{d} dakika',
    book_nofit: 'Bu başlangıçta ders sürelerinden hiçbiri güne sığmıyor{cap}. Lütfen daha erken bir başlangıç seç.',
    book_nofit_cap: ' (gün sonuna yalnızca {n} dk)',
    book_confirm_title: 'Randevuyu kesin al?',
    book_confirm_text: 'Bu randevuyu almak istediğine emin misin?',
    book_rule1: 'Ücretsiz iptal yalnızca {h} saat öncesine kadar.',
    book_rule2: '{h} saat kala randevu kesinleşir – artık iptal yok.',
    book_rule3: 'Aradaki sürede dersi başkalarına devredebilirsin.',
    book_go: 'Evet, kesin al',
    toast_booked: 'Randevu alındı ✓', celebrate_booked: 'Randevu alındı',
    cancel_confirm: 'Bu randevu gerçekten iptal edilsin mi?', toast_cancelled: 'İptal edildi',
    toast_accepted: 'Randevu kabul edildi ✓', toast_taken: 'Ders devralındı ✓',
    celebrate_taken: 'Devralındı', toast_declined: 'Reddedildi',
    ds_rush: 'Yoğun trafik', ds_jam: 'Trafik sıkışıklığı', ds_snow: 'Kar', ds_ice: 'Buzlanma', ds_weather: 'Hava koşulları', ds_other: 'Diğer',
    ds_reason_label: 'Sebep: ',
    ds_delay_title: 'Bugün biraz daha geç — yaklaşık {min} dk',
    ds_delay_text: 'Saatin değişmiyor – yine de lütfen zamanında orada ol.',
    ds_ok_title: 'Bugün her şey planlandığı gibi', ds_ok_text: 'Eğitmenin programında. Sonra görüşürüz!',
    away_vacation: '🌴 <strong>Eğitmen tatilde:</strong> {dates} – bu günlerde ders yok.',
    notif_title: '🔔 Bildirimler', notif_new: '{n} yeni', notif_sign_btn: '✍️ Şimdi imzala',
    notif_mark_read: 'Tümünü okundu işaretle', notif_none: 'Bildirim yok.', lesson_not_found: 'Ders bulunamadı',
    offers_title: '🎁 Teklifler', offers_sub: 'Başkalarının bıraktığı dersler',
    offers_limit: 'Bu hafta limitine ulaştın – bu haftadan devralma kapalı.',
    offers_from: '🙋 {name}’den', offers_anon: '🕶️ anonim', offers_take_q: '· devralmak ister misin?',
    take: 'Devral', no_time: 'Zamanım yok',
    offer_give_title: '🎁 Teklife koy',
    offer_give_text: 'Dersin <strong>tekliflere</strong> düşer – diğer öğrenciler devralabilir. Kimse almazsa ders sende kalır.',
    offer_recognizable_q: 'Görünür olmak ister misin?',
    offer_anon_btn: '🕶️ Anonim bırak', offer_anon_sub: 'Dersin sana ait olduğunu kimse görmez',
    offer_named_btn: '🙋 „{name}" olarak bırak', offer_named_sub: 'Diğerleri yalnızca adını görür',
    toast_offered: 'Teklife eklendi ✓',
    role_student: 'Öğrenci', role_instructor: 'Eğitmen', logout: 'Çıkış',
    tip_tour: 'Kısa tanıtım', tip_profile: 'Profilim', tip_appearance: 'Görünüm ve renkler',
    tip_live_stop: 'Konum paylaşımını durdur', live_stop: '🛰️ Canlı · Durdur',
    nav_grp_overview: 'Genel bakış', nav_grp_more: 'Daha fazla',
    nav_week: 'Haftam', nav_book: 'Randevu al', nav_lessons: 'Derslerim',
    nav_messages: 'Mesajlar', nav_notif: 'Bildirimler', nav_offers: 'Teklifler', nav_review: 'Değerlendirme',
    menu: 'Menü', actions: 'İşlemler', menu_open: 'Menüyü aç', menu_close: 'Menüyü kapat',
    ml_title: '📖 Derslerim',
    ml_hint: 'Sürdüğün tüm dersler – tarih &amp; saat, süre, tür ve not ile. Her ders için eğitim kartını açabilirsin: <em>ne</em> çalıştığınız ve ne kadar oturduğu.',
    ml_overview_btn: '📋 Eğitim özeti', ml_print_btn: '📄 Belgeyi yazdır',
    ml_th_when: 'Tarih &amp; saat', ml_th_end: 'Bitiş', ml_th_dur: 'Süre', ml_th_type: 'Tür', ml_th_late: 'Gecikme', ml_th_note: 'Not / eğitim kartı',
    ml_dl_when: 'Ne zaman', ml_dl_late: 'Gecikme', ml_dl_note: 'Not',
    ml_driven_on: 'sürüldüğü gün', ml_entered_on: 'eğitmen tarafından {date} tarihinde girildi',
    ml_on_invoice: '🧾 Faturada {date} tarihinde görünür', ml_on_invoice_time: '🧾 Faturada {date} saat {time} olarak görünür',
    ml_sign_btn: '✍️ İmzala', ml_signed: '✓ imzalandı',
    ml_until: '{end}’e kadar', ml_absent: '🚫 gelmedi', ml_late: '⏱️ {late} dk geç',
    ml_adk_card: '📋 Eğitim kartı ({n})',
    ml_banner_one: '{n} ders imzanı bekliyor.', ml_banner_many: '{n} ders imzanı bekliyor.',
    ml_banner_sub: 'Eğitmenin bunları girdi – lütfen kısaca onayla.', ml_banner_btn: 'Şimdi imzala',
    sign_title: '✍️ Dersi onayla',
    sign_hint: 'Kısaca göz at ve imzanla onayla – ders belgene işlenir.',
    sign_practiced: '📋 Neler çalıştınız', sign_fl_signed: '✓ Eğitmenin imzaladı',
    sign_your: 'İmzan', sign_draw: '(parmağınla çiz)', clear: 'Sil',
    sign_confirm_ck: 'Bu dersi sürdüğümü onaylıyorum.', sign_go: 'Onayla ✍️',
    saving: 'Kaydediliyor …', toast_signed: 'İmzalandı – teşekkürler! ✓',
    greet_welcome: 'Geldiğine sevindim', greet_morning: 'Günaydın', greet_day: 'Merhaba', greet_evening: 'İyi akşamlar',
    cd_now: 'şimdi', cd_in_days: '{d} gün sonra', cd_in_hours: '{h} saat sonra', cd_in_min: '{m} dk sonra',
    wk_next_label: 'Bir sonraki dersin',
    wk_title: 'Derslerim', wk_sub: 'bu hafta ({from}–{to})',
    wk_reserve_one: '🔶 <strong>{n} randevu</strong> eğitmenin tarafından önerildi – lütfen aşağıda <strong>✅ Kabul et</strong> ya da <strong>✕ Reddet</strong>.',
    wk_reserve_many: '🔶 <strong>{n} randevu</strong> eğitmenin tarafından önerildi – lütfen aşağıda <strong>✅ Kabul et</strong> ya da <strong>✕ Reddet</strong>.',
    wk_pill: '{max} içinden {count} alındı · {remaining} boş',
    wk_ical: '📅 Takvime ekle',
    wk_empty_title: 'Henüz ders alınmadı',
    wk_empty_text: 'Sıradaki derse hazır mısın? Seni doğrudan bir sonraki boş randevuya götürürüm – sadece saati seç ve al.',
    bk_gear_manual: 'Düz vites', bk_gear_auto: 'Otomatik',
    bk_done: 'sürüldü', bk_offered: '🎁 teklifte', bk_withdraw: 'Geri al',
    bk_reserved: '🔶 ayrıldı', bk_accept: '✅ Kabul et', bk_reject: '✕ Reddet',
    bk_due: '⏳ Lütfen <strong>{when}</strong> kadar yanıtla – yoksa randevu tekrar boşa çıkar.',
    bk_confirmed: '✅ onaylandı', bk_locked: '🔒 kesin', bk_offer_btn: '🎁 Teklife koy',
    bk_offer_title: 'Ücretsiz iptal yalnızca {h} saat öncesine kadar – bunun yerine dersi teklife koy',
    bk_in_h: '· {h} saat içinde',
    pc_rank: '🏅 Sınıf {r}', pc_drives: '<strong>{n}</strong> ders sürüldü',
    pc_to_rank2: 'Sınıf 2 yolunda', pc_to_rank2_hint: '<strong>{n}</strong> ders daha – sonra <strong>{d} gün</strong> öncesini görürsün.',
    pc_rank2_ok: '✅ Sınıf 2 – {d} gün öncesini görüyorsun',
    pc_sonder: 'Özel sürüşler', pc_sonder_r2: 'Sınıf 2’den itibaren alınabilir',
    pc_sonder_help: 'Sürücü sınavı için zorunlu sürüşler: şehirlerarası, otoyol ve gece sürüşü. Sayılar kaç tane olduğunu gösterir.',
    pc_book_min: '+ {dur} dk al',
    pc_sonder_hint: 'Özel sürüşleri <strong>Sınıf 2</strong>’den ({n} ders) itibaren kendin alabilirsin.',
    pc_adk: '📋 Eğitim kartı', pc_exam: '🎓 Sınav hazırlığı',
    msg_you: 'Sen', msg_title: '✉️ Mesajlar', msg_to: '{who} kişisine', msg_placeholder: 'Mesaj yaz …', send: 'Gönder',
    msg_none: 'Henüz mesaj yok. Eğitmenine yaz – örn. bir soru ya da geç kalacaksan haber ver.',
    rev_title: '⭐ Değerlendirme',
    rev_passed_t: 'Tebrikler – geçtin!', rev_passed_s: 'Dosyan saklı kalır. Eğitimin nasıldı, başkalarına anlatmak ister misin?',
    rev_invite: 'İstersen bir değerlendirme bırak – Ginoco ana sayfasında öneri olarak görünür.',
    rev_mode_full: 'tam adla', rev_mode_initials: 'kısaltılmış adla', rev_mode_anon: 'anonim',
    rev_shown: '{mode} gösteriliyor', rev_with_photo: ' · fotoğraflı', rev_pending: ' · inceleniyor',
    rev_edit: 'Değerlendirmeyi düzenle', rev_new: '⭐ Değerlendirme yaz',
    es_offers: 'Şu an kimse ders bırakmıyor. Sonra tekrar bak – devralabileceğin boş dersler burada görünür.',
    es_notif: 'Yeni mesaj yok. Yeni randevular, ertelemeler veya teklifler burada belirir.',
    es_lesson_t: '🚗 Dersin', es_lesson: 'Bir sonraki dersinin çevresinde başlat düğmesi ve sürüş sayacı burada görünür.',
    es_live_t: '📍 Buluşma noktası', es_live: 'Dersinden kısa süre önce buluşma noktasını ve eğitmeninin nerede olduğunu burada görürsün.',
    es_lessons: 'İlk dersini sürdüğünde burada görünür – tarih, saat, süre ve not ile. İstediğin zaman bundan bir belge yazdırabilirsin.',
    es_messages: 'Eğitmenine yaz – örn. bir soru ya da geç kalacaksan kısa bir haber. Sohbet birazdan yükleniyor.',
    lt_today: 'Bugün <strong>{time}</strong> · {d} dk sürüş süresi.',
    lt_press_start: 'Dersin başlayınca başlat’a bas – sürüş süren böyle işler.',
    lt_start: '▶️ Dersi başlat', lt_running: '🚗 Ders devam ediyor',
    lt_time_up: '✅ Süre doldu', lt_done_text: '{d} dakikalık dersin bitti. Aferin!',
    lt_remain: 'kalan sürüş süresi', lt_started: 'Başlangıç {time} · {d} dk', reset: 'Sıfırla',
    lt_toast_started: 'Ders başladı – iyi sürüşler! 🚗',
    lt_reset_confirm: 'Sayaç sıfırlansın mı? Sürüş süresi yeniden başlar.', lt_toast_reset: 'Sıfırlandı',
    live_map_loading: 'Harita yükleniyor …',
    live_hint: '🛰️ Harita otomatik güncellenir – eğitmeninin nerede olduğunu ve ne zaman çıkman gerektiğini canlı görürsün.',
    ap_intro: 'ginoco’yu kendine göre yap – her şey bu cihazda saklanır.',
    ap_theme: 'Tema', ap_accent: 'Vurgu rengi', ap_accent_sub: '(düğmeler & sekmeler)',
    ap_font: 'Yazı tipi', ap_ink: 'Metin rengi', ap_edge: 'Menü rengi', ap_edge_sub: '(iki menü tarafı)',
    ap_standard: 'Varsayılan', ap_size: 'Yazı boyutu', ap_tone: 'Bildirim sesi',
    ap_tone_chime: '🔔 Zil (varsayılan)', ap_tone_lock: '🚗🔒 Araç kilidi', ap_tone_off: '🔇 Kapalı',
    ap_tone_hint: 'Uygulama açıkken yeni mesajlarda çalar (örn. „Postanda bir şey var").',
    reset_btn: 'Sıfırla', done: 'Tamam', ap_reset_toast: 'Varsayılana sıfırlandı', ap_own_color: 'Özel renk', probe: 'Dinle',
    pf_open: 'Düzenle ▾', pf_close: 'Daralt ▲', pf_my_profile: 'Profilim',
    pf_summary_empty: 'Tamamlamak için dokun', pf_years: '{a} yaşında',
    pf_change_photo: 'Fotoğrafı değiştir', pf_remove_photo: 'Fotoğrafı kaldır',
    pf_privacy: '🔒 Profilini yalnızca eğitmenin görür – başka öğrenci görmez.',
    pf_personal: '👤 Kişisel', pf_name: 'Ad', pf_bdate: 'Doğum tarihi', pf_age: 'Yaş',
    pf_address: '🏠 Adres', pf_geo: '📍 Mevcut konumu kullan',
    pf_geo_hint: 'Evde üşengeç mi? Bir dokunuş sokak, posta kodu ve şehri otomatik doldurur – sadece kapı numarasını eklersin.',
    pf_street: 'Sokak', pf_houseno: 'No.', pf_zip: 'Posta kodu', pf_city: 'Şehir',
    pf_contact: '📞 İletişim', pf_phone: 'Cep numarası', pf_email: 'E-posta (isteğe bağlı)',
    pf_access: '🔑 Erişim', pf_login_fixed: 'Kullanıcı adı (sabit, değişmez)', pf_reach_school: 'Okula ulaş',
    pf_save: 'Kaydet', pf_account: '⚠️ Hesap', pf_del_account: '🗑️ Hesabımı sil',
    pf_account_text: 'Hesabını istediğin zaman kendin silebilirsin. Girişin ve kişisel verilerin kaldırılır. Sürdüğün dersler – anonim olarak – sürücü okulunun yasal eğitim kaydında kalır.',
    pf_ph_street: 'örn. Bahnhofstraße', pf_ph_houseno: '12a', pf_ph_zip: '89073', pf_ph_city: 'örn. Ulm', pf_ph_phone: 'örn. 0151 23456789', pf_ph_email: 'ad@mail.com',
    tour_skip: 'Atla', tour_prev: 'Geri', tour_next: 'İleri ›', tour_start: 'Başlayalım 🚗',
    da_title: '🗑️ Hesap gerçekten silinsin mi?', da_text: 'Bu geri alınamaz. Girişin ve kişisel verilerin kaldırılır. Sürdüğün dersler sürücü okulunun eğitim kaydında anonim olarak kalır.',
    da_pass_label: 'Onay için: mevcut şifren', da_pass_ph: 'Şifre', da_word: 'SİL', da_word_label: 'Onaylamak için <strong>{w}</strong> yaz',
    da_go: 'Hesabı kalıcı olarak sil', da_deleting: 'Siliniyor…', da_done_alert: 'Hesabın silindi. Şimdi çıkış yapılıyor.',
    pf_photo_removed: 'Fotoğraf kaldırıldı', pf_geo_searching: '📍 Konumun aranıyor …', pf_addr_notfound: 'Adres bulunamadı – lütfen elle gir.',
    pf_geo_ok: 'Konum alındı ✓', pf_geo_ok_house: 'Konum alındı ✓ – lütfen kapı numarasını ekle.', pf_geo_unavail: 'Konum kullanılamıyor: {e}', pf_saved: 'Profil kaydedildi ✓',
    fg_title: 'Şifremi unuttum', fg_text: 'Kullanıcı adını veya e-postanı gir. Eğitmenin haberdar edilir ve sana yeni bir şifre belirler – bunu sana bizzat söyler.', fg_request: 'İste', fg_need: 'Lütfen kullanıcı adını veya e-postanı gir.', fg_done: 'İstendi ✓ – eğitmenin yeni bir şifreyle sana dönecek.',
    sf_book_title: '{label} al', sf_intro: 'Sabit uzunlukta özel sürüş: <strong>{dur} dk</strong>. Bir gün seç – {label} güne tam sığdığı boş başlangıç saatlerini göstereyim.', sf_day: 'Gün', sf_choose_day: 'Bir gün seç …', loading_short: 'Yükleniyor…', sf_nofit: '{label} ({dur} dk) bu günün planına artık sığmıyor. Daha boş başka bir gün seç – uzun blok için yer olsun diye tercihen günün erken saatinde.', sf_ends: '– bitiş {end}', sf_confirm_title: '{label} kesin alınsın mı?', sf_confirm_dur: '{dur} dk · bitiş {end}', sf_confirm_note: 'Özel sürüşler sınav için zorunludur. Rezervasyon bağlayıcıdır.', sf_booked: '{label} alındı',
    gps_unavail: 'GPS kullanılamıyor', loc_error: 'Konum hatası: {e}', loc_sharing: 'Konumun paylaşılıyor 📍',
    pk_title: '📍 Seni nereden alalım?', pk_text: 'Nereden alınmak istediğini eğitmenine söyle. Mevcut konumunu da kullanabilirsin.', pk_label: 'Buluşma yeri', pk_ph: 'örn. okulun önü, istasyonda …', pk_taken: '✓ Konum alındı ({lat}, {lng})', pk_saved: 'Buluşma yeri kaydedildi ✓',
    rc_geduld_label:'Sabır & sükûnet', rc_geduld_q:'Eğitmenin ne kadar sabırlıydı?', rc_geduld_hint:'Zorlansa bile sakin kaldı mı?',
    rc_erklaerung_label:'Anlatım', rc_erklaerung_q:'Anlatımlar ne kadar anlaşılırdı?', rc_erklaerung_hint:'Her şeyi iyi anlattı mı?',
    rc_puenktlich_label:'Güvenilirlik', rc_puenktlich_q:'Ne kadar güvenilir & dakikti?', rc_puenktlich_hint:'Randevulara uydu, zamanında mıydı?',
    rc_freundlich_label:'Cana yakınlık', rc_freundlich_q:'İletişim ne kadar cana yakındı?', rc_freundlich_hint:'Kibar, motive edici, eşit seviyede mi?',
    rc_sicher_label:'Güven hissi', rc_sicher_q:'Sürerken kendini ne kadar güvende hissettin?', rc_sicher_hint:'İyi ellerde ve güvende miydin?',
    rw_1:'idare eder', rw_2:'fena değil', rw_3:'iyi', rw_4:'çok iyi', rw_5:'harika!',
    rw_intro_new:'Eğitimin nasıldı anlat', rw_intro_p:'Birkaç kısa soruyla eğitmenini değerlendir – yıldıza dokun, bitti. Bir dakikadan az sürer.',
    rw_intro_l1:'🧩 Adım adım – soru soru', rw_intro_l2:'📸 İstersen bir de fotoğraf ekle', rw_intro_l3:'🙈 Adının görünüp görünmeyeceğine sen karar ver (anonim de olur)',
    rw_intro_why:'Dürüst geri bildirimin diğer öğrencilere – ve eğitmeninin daha da iyi olmasına yardım eder.', rw_start:'Başla →',
    rw_qn:'Soru {i} / {n}', rw_tap_star:'Bir yıldıza dokun', rw_back:'← Geri', rw_next:'İleri →',
    rw_words_t:'💬 Senin sözlerin', rw_words_p:'Başkalarına ne söylemek istersin? Bir iki dürüst cümle yeter.', rw_words_ph:'örn. Harika eğitmen, çok sabırlı, her şeyi sakince anlatıyor – kesinlikle tavsiye ederim!',
    rw_photo_t:'📸 Fotoğraf eklensin mi? (isteğe bağlı)', rw_photo_p:'Fotoğrafla önerin daha kişisel görünür. Tamamen sana kalmış.', rw_photo_other:'Başka fotoğraf', rw_photo_pick:'📷 Fotoğraf seç', rw_photo_none:'Fotoğraf yok', rw_photo_show:'Değerlendirmemde fotoğrafı göster',
    rw_name_t:'🙋 Adın nasıl görünsün?', rw_name_p:'Ana sayfada herkese açık görünür. Sen karar ver.', rw_name_full:'Tam ad', rw_name_init:'Kısaltılmış', rw_name_anon:'Anonim', rw_anon_student:'Bir öğrenci', rw_name_anon_nophoto:'„Anonim“ seçilince fotoğraf gösterilmez.',
    rw_sum_t:'✅ Böyle uygun mu?', rw_sum_nochips:'Tekil puan yok – sorun değil.', rw_submit:'Değerlendirmeyi gönder', rw_need_text:'Lütfen bir iki cümle yaz.', rw_sending:'Gönderiliyor …', rw_thanks:'Değerlendirmen için teşekkürler ⭐', actual_time:'Gerçek süre', sign_confirm_time:'Dersi ve gösterilen zamanı onaylıyorum.', both_confirmed:'✓ Zaman eğitmen ve öğrenci tarafından onaylandı', ml_actual:'🕒 Gerçekte sürülen: {begin}–{end}', ml_actual_open:'🕒 Başladı: {begin}',
    tour_t0: 'ginoco’ya hoş geldin', tour_x0: 'Burada direksiyon derslerini kendin alırsın – hızlı ve her yerden. Birkaç kısa adımda nasıl olduğunu göstereyim. İstediğin an „Atla“ya dokunabilirsin.',
    tour_t1: '1. Ders al', tour_x1: 'En hızlısı <strong>🔎 En yakın boş randevu</strong> – bir dokunuşla en yakın boş güne gidersin. Boş saatler <strong>yeşil</strong>. <strong>Rezerve et</strong>’e dokun, süreyi seç ve onayla. Bitti! ✅',
    tour_t2: '2. Randevuların', tour_x2: 'Üstte <strong>„Randevularım“</strong> altında tüm dersleri tarih, saat ve buluşma noktasıyla görürsün. <strong>„Takvime ekle“</strong> ile telefonundaki takvime eklenir.',
    tour_t3: '3. Vaktin mi yok?', tour_x3: 'O gün gelemiyorsan: <strong>„🎁 Teklife koy“</strong>ya dokun – başka bir öğrenci devralabilir (istersen anonim). Kimse almazsa sende kalır. Erkense <strong>„İptal“</strong> de edebilirsin.',
    tour_t4: '4. Profilin', tour_x4: 'Üstte <strong>👤</strong>’a dokun ve bilgilerini tamamla. Onları yalnızca <strong>eğitmenin</strong> görür – başka öğrenci görmez.',
    tour_t5: 'Başlayalım!', tour_x5: 'Hepsi bu. Bol şans! 🚗 Bu tanıtımı istediğin an sağ üstteki <strong>❓</strong> ile tekrar açabilirsin.',
  },
  ar: {
    tagline_student: 'احجز دروس القيادة بسهولة عبر الإنترنت', tagline_admin: 'منطقة المدرّب',
    feat_book: '📅 احجز بنفسك', feat_swap: '🎁 تبادل', feat_pickup: '📍 لقاء مباشر',
    feat_day: '📅 خطة اليوم', feat_students: '🧑‍🎓 الطلاب', feat_reviews: '⭐ التقييمات', feat_push: '🔔 إشعارات',
    tab_login: 'تسجيل الدخول', tab_register: 'جديد (برمز)', tab_instr: 'المدرّب',
    appearance: '🎨 المظهر', lang_section: '🌍 اللغة', terms: 'شروط الاستخدام', privacy: 'الخصوصية', imprint: 'بيانات النشر', or: 'أو',
    login_id: 'اسم الدخول أو البريد الإلكتروني', login_pw: 'كلمة المرور', login_go: 'تسجيل الدخول',
    login_forgot_q: 'هل نسيت كلمة المرور؟', login_forgot_link: 'اطلب واحدة جديدة', login_forgot_tail: '– سيقوم مدرّبك بتعيين كلمة مرور لك.',
    reg_intro: 'هل حصلت على رمز وصول من مدرّبك؟ استخدمه لإنشاء حسابك مرة واحدة هنا. سيظهر اسم الدخول الخاص بك بعد ذلك.',
    reg_code: 'رمز الوصول', reg_name: 'الاسم', reg_name_ph: 'الاسم الأول والأخير', reg_year: 'سنة الميلاد',
    reg_email: 'البريد الإلكتروني (اختياري)', reg_phone: 'الهاتف (اختياري)', reg_pw: 'كلمة المرور',
    reg_pw_hint: '‏8 أحرف على الأقل، مع حرف ورقم ورمز خاص (مثل ! ? # @).', reg_go: 'إنشاء حساب',
    instr_intro: 'للمدرّب فقط.', instr_pin: 'رمز PIN أو كلمة المرور', instr_code: 'رمز المصادقة',
    instr_code_ph: 'رمز من 6 أرقام', instr_remember: 'ابقَ مسجّلاً', instr_go: 'تسجيل الدخول',
    instr_passkey: '🔓 الدخول عبر Face ID / مفتاح المرور', instr_forgot: 'هل نسيت كلمة المرور؟',
    gate_title: '👋 مرحباً بك في ginoco',
    gate_text: 'قبل أن تبدأ: يُرجى قراءة <strong>شروط الاستخدام</strong> و<strong>سياسة الخصوصية</strong> باختصار. بالنقر على «فهمت وأوافق» تؤكد أنك اطّلعت عليها.',
    gate_terms: '📄 شروط الاستخدام', gate_privacy: '🔒 الخصوصية',
    gate_fallback: 'لا يتم التحميل؟ افتح مباشرة:', gate_later: 'لاحقاً', gate_ok: 'فهمت وأوافق',
    book_title: 'حجز موعد', today: 'اليوم', find_free: '🔎 أقرب موعد متاح',
    horizon_note: '(حتى {d} يوماً مسبقاً)', horizon_note_rank: '(حتى {d} يوماً مسبقاً · المستوى {r})',
    min: 'دقيقة', oclock: '', at_time: 'الساعة ',
    slots_none_title: 'لا دروس يوم {day}',
    slots_none_text: 'مدرّبك لا يقدّم مواعيد في هذا اليوم. دعني أبحث لك عن أقرب يوم متاح.',
    find_free_long: '🔎 ابحث عن أقرب موعد متاح',
    slot_dur: '{start}–{end} · {dur} دقيقة',
    slot_free_from_multi: 'متاح من {start} · {durs} دقيقة',
    slot_free_from: 'متاح من {start} · {dur} دقيقة',
    slot_mine: 'موعدك', slot_locked: '🔒 محجوز',
    free: 'متاح', book: 'احجز', taken: 'محجوز', offered_out: 'يُعرض للتنازل',
    past: 'انتهى', toofar: 'غير متاح بعد', closed: 'مغلق',
    slots_none_free: 'لا يوجد وقت متاح في هذا اليوم حالياً.',
    cancel: 'إلغاء', abort: 'إلغاء', close: 'إغلاق',
    choose_duration: 'اختر المدة', minutes_opt: '{d} دقيقة',
    book_nofit: 'لا تتّسع أيّ من مدد دروسك في اليوم عند هذا الوقت{cap}. يرجى اختيار وقت أبكر.',
    book_nofit_cap: ' (بقي {n} دقيقة حتى نهاية اليوم)',
    book_confirm_title: 'تأكيد حجز الموعد؟',
    book_confirm_text: 'هل أنت متأكد أنك تريد هذا الموعد؟',
    book_rule1: 'الإلغاء المجاني حتى {h} ساعة قبل الموعد فقط.',
    book_rule2: 'قبل {h} ساعة يصبح الموعد نهائياً – لا إلغاء بعدها.',
    book_rule3: 'في الفترة بينهما يمكنك عرض الدرس على الآخرين.',
    book_go: 'نعم، احجز',
    toast_booked: 'تم الحجز ✓', celebrate_booked: 'تم الحجز',
    cancel_confirm: 'هل تريد إلغاء هذا الموعد فعلاً؟', toast_cancelled: 'تم الإلغاء',
    toast_accepted: 'تم قبول الموعد ✓', toast_taken: 'تم استلام الدرس ✓',
    celebrate_taken: 'تم الاستلام', toast_declined: 'تم الرفض',
    ds_rush: 'ازدحام ساعة الذروة', ds_jam: 'ازدحام مروري', ds_snow: 'ثلوج', ds_ice: 'جليد', ds_weather: 'الأحوال الجوية', ds_other: 'أخرى',
    ds_reason_label: 'السبب: ',
    ds_delay_title: 'أبطأ قليلاً اليوم — حوالي {min} دقيقة',
    ds_delay_text: 'موعدك يبقى كما هو – يرجى الحضور في الوقت المحدد.',
    ds_ok_title: 'كل شيء يسير حسب الخطة اليوم', ds_ok_text: 'مدرّبك ملتزم بالخطة. إلى اللقاء لاحقاً!',
    away_vacation: '🌴 <strong>المدرّب في إجازة:</strong> {dates} – لا دروس في هذه الأيام.',
    notif_title: '🔔 الإشعارات', notif_new: '{n} جديد', notif_sign_btn: '✍️ وقّع الآن',
    notif_mark_read: 'وضع الكل كمقروء', notif_none: 'لا إشعارات.', lesson_not_found: 'الدرس غير موجود',
    offers_title: '🎁 العروض', offers_sub: 'دروس يتنازل عنها آخرون',
    offers_limit: 'لقد بلغت حدّك هذا الأسبوع – الاستلام من هذا الأسبوع مُقفل.',
    offers_from: '🙋 من {name}', offers_anon: '🕶️ مجهول', offers_take_q: '· هل تريد استلامه؟',
    take: 'استلام', no_time: 'لا وقت لدي',
    offer_give_title: '🎁 اعرض هذا الدرس',
    offer_give_text: 'يذهب درسك إلى <strong>العروض</strong> – يمكن لطلاب آخرين استلامه. إن لم يستلمه أحد يبقى لك كالمعتاد.',
    offer_recognizable_q: 'هل تريد أن تكون معروفاً؟',
    offer_anon_btn: '🕶️ التنازل بشكل مجهول', offer_anon_sub: 'لا أحد يرى أن الدرس منك',
    offer_named_btn: '🙋 التنازل باسم «{name}»', offer_named_sub: 'يرى الآخرون اسمك الأول فقط',
    toast_offered: 'أُضيف إلى العروض ✓',
    role_student: 'طالب', role_instructor: 'المدرّب', logout: 'تسجيل الخروج',
    tip_tour: 'مقدمة سريعة', tip_profile: 'ملفي', tip_appearance: 'المظهر والألوان',
    tip_live_stop: 'إيقاف مشاركة الموقع', live_stop: '🛰️ مباشر · إيقاف',
    nav_grp_overview: 'نظرة عامة', nav_grp_more: 'المزيد',
    nav_week: 'أسبوعي', nav_book: 'حجز موعد', nav_lessons: 'دروسي',
    nav_messages: 'الرسائل', nav_notif: 'الإشعارات', nav_offers: 'العروض', nav_review: 'التقييم',
    menu: 'القائمة', actions: 'الإجراءات', menu_open: 'فتح القائمة', menu_close: 'إغلاق القائمة',
    ml_title: '📖 دروسي',
    ml_hint: 'كل دروسك التي قدتها – مع التاريخ والوقت والمدة والنوع والملاحظة. لكل درس يمكنك فتح بطاقة التدريب: <em>ماذا</em> تدربتم وكيف رسخ.',
    ml_overview_btn: '📋 ملخص التدريب', ml_print_btn: '📄 طباعة السجل',
    ml_th_when: 'التاريخ والوقت', ml_th_end: 'الانتهاء', ml_th_dur: 'المدة', ml_th_type: 'النوع', ml_th_late: 'التأخير', ml_th_note: 'ملاحظة / بطاقة التدريب',
    ml_dl_when: 'متى', ml_dl_late: 'التأخير', ml_dl_note: 'ملاحظة',
    ml_driven_on: 'قُدت في', ml_entered_on: 'أدخله مدرّبك في {date}',
    ml_on_invoice: '🧾 يظهر على الفاتورة في {date}', ml_on_invoice_time: '🧾 يظهر على الفاتورة في {date} الساعة {time}',
    ml_sign_btn: '✍️ توقيع', ml_signed: '✓ موقّع',
    ml_until: 'حتى {end}', ml_absent: '🚫 لم يحضر', ml_late: '⏱️ متأخر {late} دقيقة',
    ml_adk_card: '📋 بطاقة التدريب ({n})',
    ml_banner_one: '{n} درس بانتظار توقيعك.', ml_banner_many: '{n} دروس بانتظار توقيعك.',
    ml_banner_sub: 'أدخلها مدرّبك – يرجى التأكيد باختصار.', ml_banner_btn: 'وقّع الآن',
    sign_title: '✍️ تأكيد الدرس',
    sign_hint: 'ألقِ نظرة سريعة وأكّد بتوقيعك – سيُدرج في سجل دروسك.',
    sign_practiced: '📋 ماذا تدربتم', sign_fl_signed: '✓ وقّع مدرّبك',
    sign_your: 'توقيعك', sign_draw: '(ارسم بإصبعك)', clear: 'مسح',
    sign_confirm_ck: 'أؤكّد أنني قدت هذا الدرس.', sign_go: 'تأكيد ✍️',
    saving: 'يتم الحفظ …', toast_signed: 'تم التوقيع – شكراً! ✓',
    greet_welcome: 'سعيد بوجودك', greet_morning: 'صباح الخير', greet_day: 'مرحباً', greet_evening: 'مساء الخير',
    cd_now: 'الآن', cd_in_days: 'خلال {d} أيام', cd_in_hours: 'خلال {h} ساعة', cd_in_min: 'خلال {m} دقيقة',
    wk_next_label: 'درسك التالي',
    wk_title: 'دروسي', wk_sub: 'هذا الأسبوع ({from}–{to})',
    wk_reserve_one: '🔶 <strong>{n} موعد</strong> اقترحه مدرّبك – يرجى <strong>✅ القبول</strong> أو <strong>✕ الرفض</strong> أدناه.',
    wk_reserve_many: '🔶 <strong>{n} مواعيد</strong> اقترحها مدرّبك – يرجى <strong>✅ القبول</strong> أو <strong>✕ الرفض</strong> أدناه.',
    wk_pill: '{count} من {max} محجوز · {remaining} متبقٍ',
    wk_ical: '📅 أضف إلى التقويم',
    wk_empty_title: 'لا يوجد درس محجوز بعد',
    wk_empty_text: 'مستعد لدرسك التالي؟ سأنقلك مباشرة إلى أقرب موعد متاح – فقط انقر على الوقت واحجز.',
    bk_gear_manual: 'يدوي', bk_gear_auto: 'أوتوماتيك',
    bk_done: 'تمّ', bk_offered: '🎁 معروض', bk_withdraw: 'سحب',
    bk_reserved: '🔶 محجوز مبدئياً', bk_accept: '✅ قبول', bk_reject: '✕ رفض',
    bk_due: '⏳ يرجى الرد قبل <strong>{when}</strong> – وإلا يعود الموعد متاحاً.',
    bk_confirmed: '✅ مؤكّد', bk_locked: '🔒 مثبّت', bk_offer_btn: '🎁 اعرض هذا الدرس',
    bk_offer_title: 'الإلغاء المجاني حتى {h} ساعة قبل الموعد فقط – اعرض الدرس بدلاً من ذلك',
    bk_in_h: '· خلال {h} ساعة',
    pc_rank: '🏅 المستوى {r}', pc_drives: '<strong>{n}</strong> درساً مُنجَزاً',
    pc_to_rank2: 'الطريق إلى المستوى 2', pc_to_rank2_hint: '<strong>{n}</strong> درساً إضافياً – ثم ترى <strong>{d} يوماً</strong> مسبقاً.',
    pc_rank2_ok: '✅ المستوى 2 – ترى {d} يوماً مسبقاً',
    pc_sonder: 'رحلات خاصة', pc_sonder_r2: 'قابلة للحجز من المستوى 2',
    pc_sonder_help: 'رحلات إلزامية لاختبار القيادة: خارج المدينة، الطريق السريع، والقيادة الليلية. الأرقام تُظهر كم أنجزت.',
    pc_book_min: '+ احجز {dur} دقيقة',
    pc_sonder_hint: 'يمكنك حجز الرحلات الخاصة بنفسك من <strong>المستوى 2</strong> ({n} درساً).',
    pc_adk: '📋 بطاقة التدريب', pc_exam: '🎓 جاهزية الاختبار',
    msg_you: 'أنت', msg_title: '✉️ الرسائل', msg_to: 'إلى {who}', msg_placeholder: 'اكتب رسالة …', send: 'إرسال',
    msg_none: 'لا رسائل بعد. راسِل مدرّبك – مثلاً سؤال أو أخبره إن كنت ستتأخر.',
    rev_title: '⭐ التقييم',
    rev_passed_t: 'مبروك – نجحت!', rev_passed_s: 'يبقى ملفك محفوظاً. هل تودّ أن تخبر الآخرين كيف كان تدريبك؟',
    rev_invite: 'إن أردت، اترك تقييماً – يظهر كتوصية على صفحة Ginoco الرئيسية.',
    rev_mode_full: 'بالاسم الكامل', rev_mode_initials: 'بالاسم المختصر', rev_mode_anon: 'مجهول',
    rev_shown: 'يظهر {mode}', rev_with_photo: ' · بصورة', rev_pending: ' · قيد المراجعة',
    rev_edit: 'تعديل التقييم', rev_new: '⭐ اكتب تقييماً',
    es_offers: 'لا أحد يتنازل عن درس الآن. عد لاحقاً – الدروس المتاحة التي يمكنك استلامها تظهر هنا.',
    es_notif: 'لا رسائل جديدة. المواعيد الجديدة أو التأجيلات أو العروض تظهر هنا.',
    es_lesson_t: '🚗 درسك', es_lesson: 'حول درسك التالي يظهر هنا زر البدء ومؤقّت القيادة.',
    es_live_t: '📍 نقطة اللقاء', es_live: 'قبل درسك بقليل ترى هنا نقطة اللقاء وأين يوجد مدرّبك حالياً.',
    es_lessons: 'بمجرد أن تقود درسك الأول يظهر هنا – مع التاريخ والوقت والمدة والملاحظة. يمكنك طباعة سجل منه في أي وقت.',
    es_messages: 'راسِل مدرّبك – مثلاً سؤال أو تنبيه سريع إن كنت ستتأخر. تُحمّل المحادثة بعد لحظات.',
    lt_today: 'اليوم <strong>{time}</strong> · {d} دقيقة قيادة.',
    lt_press_start: 'اضغط بدء عندما يبدأ درسك – عندها يعمل وقت قيادتك.',
    lt_start: '▶️ ابدأ الدرس', lt_running: '🚗 الدرس جارٍ',
    lt_time_up: '✅ انتهى الوقت', lt_done_text: 'انتهى درسك ({d} دقيقة). أحسنت!',
    lt_remain: 'وقت القيادة المتبقي', lt_started: 'البدء {time} · {d} دقيقة', reset: 'إعادة تعيين',
    lt_toast_started: 'بدأ الدرس – قيادة آمنة! 🚗',
    lt_reset_confirm: 'إعادة تعيين المؤقّت؟ سيبدأ وقت القيادة من جديد.', lt_toast_reset: 'أُعيد التعيين',
    live_map_loading: 'يتم تحميل الخريطة …',
    live_hint: '🛰️ تُحدَّث الخريطة تلقائياً – ترى مباشرةً أين مدرّبك ومتى عليك الخروج.',
    ap_intro: 'اجعل ginoco على ذوقك – كل شيء يُحفظ على هذا الجهاز.',
    ap_theme: 'السمة', ap_accent: 'لون التمييز', ap_accent_sub: '(الأزرار والتبويبات)',
    ap_font: 'الخط', ap_ink: 'لون النص', ap_edge: 'لون القائمة', ap_edge_sub: '(جانبا القائمة)',
    ap_standard: 'افتراضي', ap_size: 'حجم الخط', ap_tone: 'صوت الإشعار',
    ap_tone_chime: '🔔 جرس (افتراضي)', ap_tone_lock: '🚗🔒 قفل السيارة', ap_tone_off: '🔇 إيقاف',
    ap_tone_hint: 'يُصدر صوتاً عند وصول رسائل جديدة (مثل «شيء ما في صندوقك») أثناء فتح التطبيق.',
    reset_btn: 'إعادة تعيين', done: 'تم', ap_reset_toast: 'أُعيد إلى الافتراضي', ap_own_color: 'لون مخصّص', probe: 'تجربة',
    pf_open: 'تعديل ▾', pf_close: 'طي ▲', pf_my_profile: 'ملفي',
    pf_summary_empty: 'انقر لإكماله', pf_years: '{a} سنة',
    pf_change_photo: 'تغيير الصورة', pf_remove_photo: 'إزالة الصورة',
    pf_privacy: '🔒 مدرّبك وحده يرى ملفك – لا طالب آخر.',
    pf_personal: '👤 المعلومات الشخصية', pf_name: 'الاسم', pf_bdate: 'تاريخ الميلاد', pf_age: 'العمر',
    pf_address: '🏠 العنوان', pf_geo: '📍 استخدام الموقع الحالي',
    pf_geo_hint: 'كسول في البيت؟ نقرة واحدة تملأ الشارع والرمز البريدي والمدينة – تضيف رقم المنزل فقط.',
    pf_street: 'الشارع', pf_houseno: 'رقم', pf_zip: 'الرمز البريدي', pf_city: 'المدينة',
    pf_contact: '📞 التواصل', pf_phone: 'رقم الجوال', pf_email: 'البريد الإلكتروني (اختياري)',
    pf_access: '🔑 الدخول', pf_login_fixed: 'اسم الدخول (ثابت، لا يتغيّر)', pf_reach_school: 'التواصل مع المدرسة',
    pf_save: 'حفظ', pf_account: '⚠️ الحساب', pf_del_account: '🗑️ حذف حسابي',
    pf_account_text: 'يمكنك حذف حسابك بنفسك في أي وقت. عندها يُزال دخولك وبياناتك الشخصية. تبقى دروسك التي قدتها – مجهّلة الهوية – في سجل التدريب القانوني لمدرسة القيادة.',
    pf_ph_street: 'مثل Bahnhofstraße', pf_ph_houseno: '12a', pf_ph_zip: '89073', pf_ph_city: 'مثل Ulm', pf_ph_phone: 'مثل 0151 23456789', pf_ph_email: 'name@mail.com',
    tour_skip: 'تخطٍّ', tour_prev: 'رجوع', tour_next: 'التالي ›', tour_start: 'لنبدأ 🚗',
    da_title: '🗑️ حذف الحساب فعلاً؟', da_text: 'لا يمكن التراجع عن ذلك. يُزال دخولك وبياناتك الشخصية. تبقى الدروس التي قدتها بشكل مجهول في سجل التدريب لمدرسة القيادة.',
    da_pass_label: 'للتأكيد: كلمة مرورك الحالية', da_pass_ph: 'كلمة المرور', da_word: 'حذف', da_word_label: 'اكتب <strong>{w}</strong> للتأكيد',
    da_go: 'حذف الحساب نهائياً', da_deleting: 'يتم الحذف…', da_done_alert: 'تم حذف حسابك. سيتم تسجيل خروجك الآن.',
    pf_photo_removed: 'أُزيلت الصورة', pf_geo_searching: '📍 يتم تحديد موقعك …', pf_addr_notfound: 'العنوان غير موجود – يرجى الإدخال يدوياً.',
    pf_geo_ok: 'تم أخذ الموقع ✓', pf_geo_ok_house: 'تم أخذ الموقع ✓ – يرجى إضافة رقم المنزل.', pf_geo_unavail: 'الموقع غير متاح: {e}', pf_saved: 'تم حفظ الملف ✓',
    fg_title: 'نسيت كلمة المرور', fg_text: 'أدخل اسم الدخول أو بريدك الإلكتروني. سيُبلَّغ مدرّبك ويعيّن لك كلمة مرور جديدة – سيخبرك بها شخصياً.', fg_request: 'طلب', fg_need: 'يرجى إدخال اسم الدخول أو البريد الإلكتروني.', fg_done: 'تم الطلب ✓ – سيعود إليك مدرّبك بكلمة مرور جديدة.',
    sf_book_title: 'حجز {label}', sf_intro: 'رحلة خاصة بمدة ثابتة: <strong>{dur} دقيقة</strong>. اختر يوماً – سأعرض أوقات البدء المتاحة التي تتّسع فيها {label} في اليوم بالكامل.', sf_day: 'اليوم', sf_choose_day: 'اختر يوماً …', loading_short: 'يتم التحميل…', sf_nofit: 'لم تعد {label} ({dur} دقيقة) تتّسع في جدول هذا اليوم. اختر يوماً آخر أكثر فراغاً – ويُفضّل في وقت مبكر ليتوفّر مكان للكتلة الطويلة.', sf_ends: '– ينتهي {end}', sf_confirm_title: 'تأكيد حجز {label}؟', sf_confirm_dur: '{dur} دقيقة · ينتهي {end}', sf_confirm_note: 'الرحلات الخاصة إلزامية للاختبار. الحجز مُلزِم.', sf_booked: 'تم حجز {label}',
    gps_unavail: 'GPS غير متاح', loc_error: 'خطأ في الموقع: {e}', loc_sharing: 'تتم مشاركة موقعك 📍',
    pk_title: '📍 من أين نأخذك؟', pk_text: 'أخبر مدرّبك من أين تريد أن يأخذك. يمكنك أيضاً استخدام موقعك الحالي.', pk_label: 'مكان الالتقاء', pk_ph: 'مثل أمام المدرسة، عند المحطة …', pk_taken: '✓ تم أخذ الموقع ({lat}, {lng})', pk_saved: 'تم حفظ مكان الالتقاء ✓',
    rc_geduld_label:'الصبر والهدوء', rc_geduld_q:'كم كان مدرّبك صبوراً؟', rc_geduld_hint:'هل بقي هادئاً حتى عند التعثّر؟',
    rc_erklaerung_label:'الشرح', rc_erklaerung_q:'كم كانت الشروحات واضحة؟', rc_erklaerung_hint:'هل شرح كل شيء حتى فهمت؟',
    rc_puenktlich_label:'الاعتمادية', rc_puenktlich_q:'كم كان موثوقاً ودقيقاً في المواعيد؟', rc_puenktlich_hint:'هل التزم بالمواعيد وحضر في الوقت؟',
    rc_freundlich_label:'اللطف', rc_freundlich_q:'كم كان التعامل ودّياً؟', rc_freundlich_hint:'لطيف ومحفّز وعلى قدم المساواة؟',
    rc_sicher_label:'الشعور بالأمان', rc_sicher_q:'كم شعرت بالأمان أثناء القيادة؟', rc_sicher_hint:'في أيدٍ أمينة وآمن على الطريق؟',
    rw_1:'مقبول', rw_2:'لا بأس', rw_3:'جيد', rw_4:'جيد جداً', rw_5:'ممتاز!',
    rw_intro_new:'أخبِرنا كيف كان تدريبك', rw_intro_p:'بأسئلة قصيرة تقيّم مدرّبك – انقر نجمة، تم. يستغرق أقل من دقيقة.',
    rw_intro_l1:'🧩 خطوة بخطوة – سؤال تلو الآخر', rw_intro_l2:'📸 أضِف صورة إن أردت', rw_intro_l3:'🙈 أنت تقرّر إن كان اسمك سيظهر (يمكن مجهولاً)',
    rw_intro_why:'ملاحظتك الصادقة تساعد طلاباً آخرين – وتساعد مدرّبك على التحسّن أكثر.', rw_start:'لنبدأ →',
    rw_qn:'سؤال {i} من {n}', rw_tap_star:'انقر نجمة', rw_back:'← رجوع', rw_next:'التالي →',
    rw_words_t:'💬 كلماتك', rw_words_p:'ماذا تودّ أن تقول للآخرين؟ جملة أو جملتان صادقتان تكفيان.', rw_words_ph:'مثل: مدرّب رائع، صبور جداً، يشرح كل شيء بهدوء – أنصح به بشدة!',
    rw_photo_t:'📸 إضافة صورة؟ (اختياري)', rw_photo_p:'الصورة تجعل توصيتك أكثر شخصية. كما تحبّ تماماً.', rw_photo_other:'صورة أخرى', rw_photo_pick:'📷 اختر صورة', rw_photo_none:'بدون صورة', rw_photo_show:'إظهار الصورة مع تقييمي',
    rw_name_t:'🙋 كيف يظهر اسمك؟', rw_name_p:'ظاهر للعموم على الصفحة الرئيسية. أنت تقرّر.', rw_name_full:'الاسم الكامل', rw_name_init:'مختصر', rw_name_anon:'مجهول', rw_anon_student:'أحد الطلاب', rw_name_anon_nophoto:'مع «مجهول» لا تُعرض أي صورة.',
    rw_sum_t:'✅ هل هذا صحيح؟', rw_sum_nochips:'لا تقييمات فردية – لا مشكلة.', rw_submit:'إرسال التقييم', rw_need_text:'يرجى كتابة جملة أو جملتين.', rw_sending:'يتم الإرسال …', rw_thanks:'شكراً لتقييمك ⭐', actual_time:'الوقت الفعلي', sign_confirm_time:'أؤكّد الدرس والوقت المعروض.', both_confirmed:'✓ أكّد الوقت المدرّب والطالب', ml_actual:'🕒 القيادة الفعلية: {begin}–{end}', ml_actual_open:'🕒 بدأ: {begin}',
    tour_t0: 'مرحباً بك في ginoco', tour_x0: 'هنا تحجز دروس القيادة بنفسك – بسرعة ومن أي مكان. في خطوات قصيرة سأريك كيف. يمكنك النقر على «تخطٍّ» في أي وقت.',
    tour_t1: '1. احجز درساً', tour_x1: 'الأسرع عبر <strong>🔎 أقرب موعد متاح</strong> – نقرة واحدة تأخذك لأقرب يوم متاح. الأوقات المتاحة <strong>خضراء</strong>. انقر <strong>احجز</strong>، اختر المدة وأكّد. تم! ✅',
    tour_t2: '2. مواعيدك', tour_x2: 'في الأعلى ضمن <strong>«مواعيدي»</strong> ترى كل الدروس بالتاريخ والوقت ونقطة اللقاء. عبر <strong>«أضف إلى التقويم»</strong> تُضاف إلى تقويم هاتفك.',
    tour_t3: '3. لا وقت لديك؟', tour_x3: 'إن تعذّر عليك ذلك اليوم: انقر <strong>«🎁 اعرض هذا الدرس»</strong> – يمكن لطالب آخر استلامه (بشكل مجهول إن أردت). إن لم يستلمه أحد يبقى لك. وإن كان الوقت مبكراً يمكنك أيضاً <strong>«الإلغاء»</strong>.',
    tour_t4: '4. ملفك', tour_x4: 'انقر <strong>👤</strong> في الأعلى وأكمِل بياناتك. يراها <strong>مدرّبك</strong> وحده – لا طالب آخر.',
    tour_t5: 'لنبدأ!', tour_x5: 'هذا كل شيء. بالتوفيق في التدريب! 🚗 يمكنك فتح هذه المقدمة في أي وقت عبر <strong>❓</strong> أعلى اليمين.',
  },
};
function t(key, vars) {
  let s = (I18N[LANG] && I18N[LANG][key] != null) ? I18N[LANG][key] : (I18N.de[key] != null ? I18N.de[key] : key);
  if (vars) for (const k in vars) s = String(s).split('{' + k + '}').join(vars[k]);
  return s;
}
function applyLangDir() {
  const d = (LANGS[LANG] || LANGS.de).dir;
  try { document.documentElement.lang = LANG; document.documentElement.dir = d; } catch {}
}
function setLang(l) {
  LANG = LANGS[l] ? l : 'de';
  try { localStorage.setItem('fsp-lang', LANG); } catch {}
  applyLangDir();
  applyDateNames();
  render(); // Oberfläche in der neuen Sprache neu aufbauen
}
// Wochentags-/Monatsnamen + Datums-Locale je Sprache aufbauen (über Intl).
function applyDateNames() {
  const loc = LANG === 'de' ? 'de-DE' : LANG === 'tr' ? 'tr-TR' : LANG === 'ar' ? 'ar' : 'en-GB';
  LOCALE = loc;
  try {
    const sh = new Intl.DateTimeFormat(loc, { weekday: 'short' });
    const lo = new Intl.DateTimeFormat(loc, { weekday: 'long' });
    const ms = new Intl.DateTimeFormat(loc, { month: 'short' });
    const ml = new Intl.DateTimeFormat(loc, { month: 'long' });
    const wd = [], wdl = [];
    for (let i = 0; i < 7; i++) { const d = new Date(Date.UTC(2024, 0, 1 + i)); wd.push(sh.format(d)); wdl.push(lo.format(d)); } // 2024-01-01 = Montag
    const mo = [], mol = [];
    for (let i = 0; i < 12; i++) { const d = new Date(Date.UTC(2024, i, 15)); mo.push(ms.format(d)); mol.push(ml.format(d)); }
    WD = wd; WD_LONG = wdl; MON = mo; MON_LONG = mol;
  } catch { /* Fallback: deutsche Standardnamen bleiben */ }
}
applyDateNames();
// Sprachauswahl (Fenster). Tippt man eine Sprache an, wird sofort umgeschaltet.
function openLangPicker() {
  modal(`<h3 style="margin:.1rem 0 .7rem">${t('lang_section')}</h3>
    <div class="lang-list">
      ${Object.entries(LANGS).map(([k, v]) => `<button class="lang-opt${k === LANG ? ' active' : ''}" data-l="${k}">
        <span class="lang-flag">${v.flag}</span><span class="lang-name">${esc(v.label)}</span>${k === LANG ? '<span class="lang-chk">✓</span>' : ''}</button>`).join('')}
    </div>`);
  document.querySelectorAll('.lang-opt').forEach((b) => b.onclick = () => { closeModal(); setLang(b.dataset.l); });
}
window.__openLangPicker = openLangPicker;

// ---------- Farb-Themes (dunkel, augenschonend) ----------
// Kein reines Schwarz (weniger Halo/Blendung), Text kontrastreich (>= WCAG AA).
const THEMES = {
  unternbuchen: { label: 'Untern Buchen', dot: 'linear-gradient(135deg,#f5c518,#ef7d1a)', vars: {
    '--bg': '#0a0a0c', '--bg2': '#060608', '--bg-glow': '#2a1e07', '--card': '#141317', '--card2': '#1c1a1f',
    '--line': '#2d2a31', '--brand': '#f2a01a', '--brand-dark': '#d8850f', '--ink': '#f4eee1', '--muted': '#a89e8a' } },
  nachtblau: { label: 'Nachtblau', dot: '#4d8dff', vars: {
    '--bg': '#0e131a', '--bg2': '#0a0e14', '--bg-glow': '#182233', '--card': '#161d27', '--card2': '#1c2531',
    '--line': '#28323f', '--brand': '#4d8dff', '--brand-dark': '#3a6fd4', '--ink': '#e7edf5', '--muted': '#93a1b3' } },
  aubergine: { label: 'Aubergine (Lila)', dot: '#a877f0', vars: {
    '--bg': '#14101c', '--bg2': '#0f0b16', '--bg-glow': '#2c2042', '--card': '#1e1830', '--card2': '#251d3a',
    '--line': '#352a4a', '--brand': '#a877f0', '--brand-dark': '#8f5fe0', '--ink': '#ece7f5', '--muted': '#a79bbb' } },
  beere: { label: 'Beere (Pink)', dot: '#ec6ba6', vars: {
    '--bg': '#190f15', '--bg2': '#130a10', '--bg-glow': '#3d1e30', '--card': '#271722', '--card2': '#301c29',
    '--line': '#472c3c', '--brand': '#ec6ba6', '--brand-dark': '#d64f8d', '--ink': '#f3e7ee', '--muted': '#bd9aaa' } },
  waldgruen: { label: 'Waldgrün', dot: '#35c07d', vars: {
    '--bg': '#0b1512', '--bg2': '#08100d', '--bg-glow': '#153025', '--card': '#13201b', '--card2': '#182821',
    '--line': '#26382f', '--brand': '#35c07d', '--brand-dark': '#2aa568', '--ink': '#e6f0ea', '--muted': '#8fa99b' } },
  graphit: { label: 'Graphit', dot: '#8a93a6', vars: {
    '--bg': '#121316', '--bg2': '#0d0e11', '--bg-glow': '#24262c', '--card': '#1b1d22', '--card2': '#22242a',
    '--line': '#32353d', '--brand': '#7c8cf0', '--brand-dark': '#6172e0', '--ink': '#e8eaef', '--muted': '#9a9fab' } },
  mitternacht: { label: 'Mitternacht', dot: '#5aa0ff', vars: {
    '--bg': '#08090c', '--bg2': '#050609', '--bg-glow': '#141821', '--card': '#111319', '--card2': '#161922',
    '--line': '#262a34', '--brand': '#5aa0ff', '--brand-dark': '#3f7fd6', '--ink': '#e9edf3', '--muted': '#8b93a2' } },
};
// Schriftarten (nur systemeigene Stacks – nichts wird nachgeladen, funktioniert offline)
const FONTS = {
  system:   { label: 'Standard',   stack: 'system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif' },
  rounded:  { label: 'Abgerundet', stack: 'ui-rounded,"SF Pro Rounded","Segoe UI",system-ui,sans-serif' },
  modern:   { label: 'Modern',     stack: '"Segoe UI",Roboto,"Helvetica Neue",system-ui,sans-serif' },
  klassisch:{ label: 'Klassisch',  stack: 'Georgia,"Times New Roman",Times,serif' },
  technisch:{ label: 'Technisch',  stack: 'ui-monospace,"SF Mono",Menlo,Consolas,monospace' },
};
// Freie Akzentfarben (Buttons, Reiter, Hervorhebungen)
const ACCENTS = ['#4d8dff', '#35c07d', '#a877f0', '#ec6ba6', '#e6934d', '#3fb6c4', '#e5605f', '#c9a13b'];
// Menü-Hintergründe (die beiden aufklappenden Menüseiten) – dunkle, ruhige Töne
const EDGES = ['#111319', '#141a24', '#161421', '#101a17', '#1c1620', '#1a1712', '#0f1720', '#201a1a'];
// Textfarben – bewusst nur helle, gut lesbare Töne (alle Themes sind dunkel)
const INKS = {
  standard: { label: 'Standard', dot: '#e7edf5', val: '' },
  weiss:    { label: 'Kräftig',  dot: '#ffffff', val: '#ffffff' },
  warm:     { label: 'Warm',     dot: '#f2e7d6', val: '#f2e7d6' },
  kuehl:    { label: 'Kühl',     dot: '#d8e6fb', val: '#d8e6fb' },
  mint:     { label: 'Mint',     dot: '#d6f2e4', val: '#d6f2e4' },
  rose:     { label: 'Rosé',     dot: '#f7dcea', val: '#f7dcea' },
  // Metallic-Töne (Farbpunkt schimmert, Schrift bleibt auf dem dunklen Design gut lesbar)
  gold:     { label: 'Gold',     dot: 'linear-gradient(135deg,#9a7b1e,#f0d675,#b58f28)', val: '#e7c860' },
  bronze:   { label: 'Bronze',   dot: 'linear-gradient(135deg,#7a4a22,#d99a5c,#8a5a2a)', val: '#daa066' },
  carbon:   { label: 'Carbon',   dot: 'linear-gradient(135deg,#3a4048,#aeb6c2,#2c313a)', val: '#c3cad6' },
  schwarz:  { label: 'Metallic Schwarz', dot: 'linear-gradient(135deg,#14171c,#565c66,#0c0e12)', val: '#b3b9c2' },
};
const SIZES = { klein: '93%', normal: '100%', gross: '112%', xl: '125%' };
const SIZE_LABEL = { klein: 'Klein', normal: 'Normal', gross: 'Groß', xl: 'Sehr groß' };

function shade(hex, pct) { // pct<0 dunkelt ab
  const n = parseInt(String(hex).replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.max(0, Math.min(255, Math.round(c * (1 + pct / 100)))));
  return '#' + ch.map((x) => x.toString(16).padStart(2, '0')).join('');
}
function applyThemeVars(key) {
  const t = THEMES[key] || THEMES.unternbuchen;
  for (const [k, v] of Object.entries(t.vars)) document.documentElement.style.setProperty(k, v);
}
function applyAppearance() {
  const root = document.documentElement;
  // Übergänge kurz aus, damit die neue Farbe SOFORT sitzt (kein „Kriechen")
  root.classList.add('anim-off');
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('anim-off')));
  applyThemeVars(state.theme || 'unternbuchen');
  const p = state.prefs || {};
  if (p.accent) { root.style.setProperty('--brand', p.accent); root.style.setProperty('--brand-dark', shade(p.accent, -16)); }
  if (p.ink) root.style.setProperty('--ink', p.ink);
  // Menü-Farbe: färbt die Menü-Panels + Kacheln (frei wählbar)
  if (p.edge) {
    root.style.setProperty('--edge-bg', p.edge);
    root.style.setProperty('--edge-tile', shade(p.edge, 16));
    root.style.setProperty('--edge-line', shade(p.edge, 40));
  } else {
    root.style.removeProperty('--edge-bg'); root.style.removeProperty('--edge-tile'); root.style.removeProperty('--edge-line');
  }
  root.style.setProperty('--font', (FONTS[p.font] || FONTS.system).stack);
  root.style.fontSize = SIZES[p.size] || '100%';
}
function loadAppearance() {
  const p = {};
  try {
    state.theme = localStorage.getItem('fsp-theme') || 'unternbuchen';
    p.accent = localStorage.getItem('fsp-accent') || '';
    p.font = localStorage.getItem('fsp-font') || 'system';
    p.ink = localStorage.getItem('fsp-ink') || '';
    p.edge = localStorage.getItem('fsp-edge') || '';
    p.size = localStorage.getItem('fsp-size') || 'normal';
  } catch {}
  state.prefs = p;
  applyAppearance();
}
loadAppearance();

// ---------- Benachrichtigungston (kurzer Zwei-Ton-Klang, ohne externe Datei) ----------
let _audioCtx = null;
let _soundOn = true;
// Ton-Art: 'chime' (Glocke), 'carlock' (Auto-Verriegeln), 'off'. Mit Rückwärtskompat
// zum alten An/Aus-Schalter ('fsp-sound').
let NOTIFY_TONE = 'chime';
try {
  const t = localStorage.getItem('fsp-tone');
  if (t) NOTIFY_TONE = t;
  else if (localStorage.getItem('fsp-sound') === '0') NOTIFY_TONE = 'off';
} catch {}
_soundOn = NOTIFY_TONE !== 'off';
function setNotifyTone(tone) {
  NOTIFY_TONE = ['chime', 'carlock', 'off'].includes(tone) ? tone : 'chime';
  _soundOn = NOTIFY_TONE !== 'off';
  try { localStorage.setItem('fsp-tone', NOTIFY_TONE); localStorage.setItem('fsp-sound', _soundOn ? '1' : '0'); } catch {}
  if (_soundOn) { unlockAudio(); playChime(); } // gleich einmal zur Probe
}
function setSoundOn(on) { setNotifyTone(on ? (NOTIFY_TONE === 'off' ? 'chime' : NOTIFY_TONE) : 'off'); }
function unlockAudio() {
  try {
    if (!_audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) _audioCtx = new AC(); }
    if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
  } catch {}
}
// Audio erst nach der ersten Nutzer-Interaktion freischalten (Browser-Vorgabe).
window.addEventListener('pointerdown', unlockAudio, { passive: true });
window.addEventListener('keydown', unlockAudio, { passive: true });
// Sanfte Zwei-Ton-Glocke (Standard).
function playBell() {
  unlockAudio();
  if (!_audioCtx) return;
  try {
    const t = _audioCtx.currentTime;
    [880, 1174.66].forEach((f, i) => {
      const o = _audioCtx.createOscillator(), g = _audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); g.connect(_audioCtx.destination);
      const s = t + i * 0.13;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.2, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.34);
      o.start(s); o.stop(s + 0.36);
    });
  } catch {}
}
// „Auto-Verriegeln": bevorzugt die echte Klangdatei (public/klingelton-car-lock.mp3),
// sonst ein synthetischer Zentralverriegelungs-Chirp (funktioniert auch ohne Datei).
let _lockAudio = null;
function ensureLockAudio() {
  if (_lockAudio !== null) return;
  try { _lockAudio = new Audio('/klingelton-car-lock.mp3'); _lockAudio.preload = 'auto'; }
  catch { _lockAudio = false; }
}
function playLockChirp() {
  unlockAudio();
  if (!_audioCtx) return;
  try {
    const t = _audioCtx.currentTime;
    [0, 0.12].forEach((off) => {
      const o = _audioCtx.createOscillator(), g = _audioCtx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(2100, t + off);
      o.frequency.exponentialRampToValueAtTime(1650, t + off + 0.07);
      o.connect(g); g.connect(_audioCtx.destination);
      g.gain.setValueAtTime(0.0001, t + off);
      g.gain.exponentialRampToValueAtTime(0.16, t + off + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.09);
      o.start(t + off); o.stop(t + off + 0.1);
    });
  } catch {}
}
function playLock() {
  ensureLockAudio();
  if (_lockAudio) {
    try { _lockAudio.currentTime = 0; const p = _lockAudio.play(); if (p && p.catch) p.catch(() => playLockChirp()); return; }
    catch { /* fällt unten auf den Chirp zurück */ }
  }
  playLockChirp();
}
// Verteiler: spielt den gewählten Benachrichtigungston.
function playChime() {
  if (NOTIFY_TONE === 'off') return;
  if (NOTIFY_TONE === 'carlock') return playLock();
  playBell();
}
// Merkt sich die letzten Zähler, um „neu eingegangen" zu erkennen.
let _lastNotifUnread = null, _lastMsgUnread = null;
function chimeOnIncrease(kind, value) {
  const prev = kind === 'notif' ? _lastNotifUnread : _lastMsgUnread;
  if (prev != null && value > prev) playChime();
  if (kind === 'notif') _lastNotifUnread = value; else _lastMsgUnread = value;
}

function setTheme(key) { state.theme = THEMES[key] ? key : 'unternbuchen'; try { localStorage.setItem('fsp-theme', state.theme); } catch {} applyAppearance(); }
function savePref(k, v) {
  state.prefs = state.prefs || {};
  state.prefs[k] = v;
  try { if (v) localStorage.setItem('fsp-' + k, v); else localStorage.removeItem('fsp-' + k); } catch {}
  applyAppearance();
}
function resetAppearance() {
  state.theme = 'unternbuchen'; state.prefs = { font: 'system', size: 'normal', accent: '', ink: '', edge: '' };
  try { ['fsp-theme', 'fsp-accent', 'fsp-font', 'fsp-ink', 'fsp-edge', 'fsp-size'].forEach((k) => localStorage.removeItem(k)); } catch {}
  applyAppearance();
}

function openThemePicker() {
  const cur = state.theme || 'unternbuchen';
  const p = state.prefs || {};
  const accent = p.accent || (THEMES[cur] || THEMES.unternbuchen).dot;
  const swatch = (bg, on, extra = '') => `width:30px;height:30px;border-radius:50%;background:${bg};display:inline-block;border:2px solid ${on ? 'var(--ink)' : 'transparent'};${extra}`;
  modal(`<h3>${t('appearance')}</h3>
    <p class="hint">${t('ap_intro')}</p>

    <div class="ap-sec"><div class="ap-label">🌍 Sprache / Language / Dil / اللغة</div>
      <button class="sec" style="width:100%;justify-content:center" onclick="window.__openLangPicker()">${(LANGS[LANG] || LANGS.de).flag} ${esc((LANGS[LANG] || LANGS.de).label)}</button>
    </div>

    <div class="ap-sec"><div class="ap-label">${t('ap_theme')}</div>
      <div class="ap-grid2">
        ${Object.entries(THEMES).map(([k, th]) => `<button class="sec" data-theme="${k}" style="justify-content:flex-start;display:flex;align-items:center;gap:.5rem;${k === cur ? 'outline:2px solid ' + th.dot : ''}">
          <span style="width:16px;height:16px;border-radius:50%;background:${th.dot}"></span>${th.label}${k === cur ? ' ✓' : ''}</button>`).join('')}
      </div>
    </div>

    <div class="ap-sec"><div class="ap-label">${t('ap_accent')} <span class="muted">${t('ap_accent_sub')}</span></div>
      <div class="ap-swatches">
        ${ACCENTS.map((c) => `<button data-accent="${c}" title="${c}" style="${swatch(c, (p.accent || '').toLowerCase() === c.toLowerCase())}"></button>`).join('')}
        <label class="ap-free" title="${t('ap_own_color')}">🎨<input type="color" id="ap-accent-free" value="${accent}"></label>
      </div>
    </div>

    <div class="ap-sec"><div class="ap-label">${t('ap_font')}</div>
      <div class="ap-fonts">
        ${Object.entries(FONTS).map(([k, f]) => `<button class="sec" data-font="${k}" style="font-family:${f.stack};${(p.font || 'system') === k ? 'outline:2px solid var(--brand)' : ''}">${f.label}${(p.font || 'system') === k ? ' ✓' : ''}</button>`).join('')}
      </div>
    </div>

    <div class="ap-sec"><div class="ap-label">${t('ap_ink')}</div>
      <div class="ap-swatches">
        ${Object.entries(INKS).map(([k, i]) => `<button data-ink="${i.val}" title="${i.label}" style="${swatch(i.dot, (p.ink || '') === i.val)}"></button>`).join('')}
      </div>
    </div>

    <div class="ap-sec"><div class="ap-label">${t('ap_edge')} <span class="muted">${t('ap_edge_sub')}</span></div>
      <div class="ap-swatches">
        ${EDGES.map((c) => `<button data-edge="${c}" title="${c}" style="${swatch(c, (p.edge || '').toLowerCase() === c.toLowerCase())}"></button>`).join('')}
        <label class="ap-free" title="${t('ap_own_color')}">🎨<input type="color" id="ap-edge-free" value="${p.edge || '#111319'}"></label>
        <button class="ghost sm" data-edge="" style="margin-left:.4rem">${t('ap_standard')}</button>
      </div>
    </div>

    <div class="ap-sec"><div class="ap-label">${t('ap_size')}</div>
      <div class="ap-grid2">
        ${Object.keys(SIZES).map((k) => `<button class="sec" data-size="${k}" style="${(p.size || 'normal') === k ? 'outline:2px solid var(--brand)' : ''}">${SIZE_LABEL[k]}${(p.size || 'normal') === k ? ' ✓' : ''}</button>`).join('')}
      </div>
    </div>

    <div class="ap-sec"><div class="ap-label">${t('ap_tone')}</div>
      <div class="tone-row">
        <select id="ap-tone" class="tone-sel">
          <option value="chime">${t('ap_tone_chime')}</option>
          <option value="carlock">${t('ap_tone_lock')}</option>
          <option value="off">${t('ap_tone_off')}</option>
        </select>
        <button class="ghost sm" id="ap-tone-test" type="button">▶︎ ${t('probe')}</button>
      </div>
      <div class="ap-hint">${t('ap_tone_hint')}</div>
    </div>

    <div class="actions" style="justify-content:space-between">
      <button class="ghost sm" id="ap-reset">${t('reset_btn')}</button>
      <button class="sec" onclick="window.__closeModal()">${t('done')}</button>
    </div>`, 'wide');

  // Auswahl NUR in-place markieren (kein Neuaufbau des Fensters -> kein „Hängen"/Flackern)
  const pf = () => state.prefs || {};
  const mkTheme = () => document.querySelectorAll('[data-theme]').forEach((x) => {
    const t = THEMES[x.dataset.theme] || THEMES.unternbuchen; const on = x.dataset.theme === (state.theme || 'unternbuchen');
    x.style.outline = on ? '2px solid ' + t.dot : ''; x.innerHTML = `<span style="width:16px;height:16px;border-radius:50%;background:${t.dot}"></span>${t.label}${on ? ' ✓' : ''}`;
  });
  const mkAccent = () => document.querySelectorAll('[data-accent]').forEach((x) => { x.style.borderColor = (pf().accent || '').toLowerCase() === x.dataset.accent.toLowerCase() ? 'var(--ink)' : 'transparent'; });
  const mkFont = () => document.querySelectorAll('[data-font]').forEach((x) => { const on = (pf().font || 'system') === x.dataset.font; x.style.outline = on ? '2px solid var(--brand)' : ''; x.innerHTML = `${(FONTS[x.dataset.font] || FONTS.system).label}${on ? ' ✓' : ''}`; });
  const mkInk = () => document.querySelectorAll('[data-ink]').forEach((x) => { x.style.borderColor = (pf().ink || '') === x.dataset.ink ? 'var(--ink)' : 'transparent'; });
  const mkEdge = () => document.querySelectorAll('[data-edge]').forEach((x) => { if (x.dataset.edge === '') return; x.style.borderColor = (pf().edge || '').toLowerCase() === x.dataset.edge.toLowerCase() ? 'var(--ink)' : 'transparent'; });
  const mkSize = () => document.querySelectorAll('[data-size]').forEach((x) => { const on = (pf().size || 'normal') === x.dataset.size; x.style.outline = on ? '2px solid var(--brand)' : ''; x.innerHTML = `${SIZE_LABEL[x.dataset.size]}${on ? ' ✓' : ''}`; });
  document.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => { setTheme(b.dataset.theme); mkTheme(); });
  document.querySelectorAll('[data-accent]').forEach((b) => b.onclick = () => { savePref('accent', b.dataset.accent); mkAccent(); });
  document.querySelectorAll('[data-font]').forEach((b) => b.onclick = () => { savePref('font', b.dataset.font); mkFont(); });
  document.querySelectorAll('[data-ink]').forEach((b) => b.onclick = () => { savePref('ink', b.dataset.ink); mkInk(); });
  document.querySelectorAll('[data-edge]').forEach((b) => b.onclick = () => { savePref('edge', b.dataset.edge); mkEdge(); });
  document.querySelectorAll('[data-size]').forEach((b) => b.onclick = () => { savePref('size', b.dataset.size); mkSize(); });
  const free = $('#ap-accent-free');
  if (free) {
    free.oninput = () => { state.prefs.accent = free.value; applyAppearance(); };           // live-Vorschau
    free.onchange = () => { savePref('accent', free.value); mkAccent(); };                   // festhalten
  }
  const efree = $('#ap-edge-free');
  if (efree) {
    efree.oninput = () => { state.prefs.edge = efree.value; applyAppearance(); };            // live-Vorschau
    efree.onchange = () => { savePref('edge', efree.value); mkEdge(); };                      // festhalten
  }
  const toneSel = $('#ap-tone');
  if (toneSel) { toneSel.value = NOTIFY_TONE; toneSel.onchange = () => setNotifyTone(toneSel.value); }
  const toneTest = $('#ap-tone-test');
  if (toneTest) toneTest.onclick = () => { unlockAudio(); const prev = NOTIFY_TONE; NOTIFY_TONE = (toneSel && toneSel.value) || NOTIFY_TONE; playChime(); NOTIFY_TONE = prev; };
  const rst = $('#ap-reset');
  if (rst) rst.onclick = () => { resetAppearance(); toast(t('ap_reset_toast'), 'ok'); mkTheme(); mkAccent(); mkFont(); mkInk(); mkEdge(); mkSize(); };
}
window.__openThemePicker = openThemePicker;

function initials(name) {
  return String(name || '').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '🙂';
}
// Durchsuchbare Fahrschüler-Auswahl (tippen -> Vorschläge / Auto-Fill) statt langer Dropdowns.
function studentPicker(id, students, { placeholder = 'Name tippen …', style = '' } = {}) {
  const listId = id + '-dl';
  return `<input id="${id}" list="${listId}" placeholder="${esc(placeholder)}" autocomplete="off" style="${style}">
    <datalist id="${listId}">${students.map((s) => `<option value="${esc(s.name)}"></option>`).join('')}</datalist>`;
}
function resolveStudentId(el, students) {
  const v = String((el && el.value) || '').trim().toLowerCase();
  if (!v) return '';
  let hit = students.find((s) => String(s.name || '').toLowerCase() === v)
    || students.find((s) => String(s.username || '').toLowerCase() === v);
  if (!hit) { const m = students.filter((s) => String(s.name || '').toLowerCase().includes(v)); if (m.length === 1) hit = m[0]; }
  return hit ? String(hit.id) : '';
}
// Bild vor dem Hochladen im Browser verkleinern (spart Speicher & Datenvolumen)
function fileToResizedDataUrl(file, maxPx = 400, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Bitte ein Bild auswählen'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      const scale = Math.min(1, maxPx / Math.max(w, h));
      w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild konnte nicht geladen werden')); };
    img.src = url;
  });
}
function ageFromDate(bd) {
  if (!bd || !/^\d{4}-\d{2}-\d{2}$/.test(bd)) return null;
  const [y, m, d] = bd.split('-').map(Number);
  const now = new Date();
  let a = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) a--;
  return (a >= 0 && a < 120) ? a : null;
}
// Profil als eigener Bereich ganz oben (kein Popup) – ein-/ausklappbar.
async function renderProfileCard() {
  const card = $('#profile-card');
  if (!card) return;
  const ip = state.settings?.instructor_phone;
  let pr = { name: state.user?.name || '', email: '', phone: state.user?.phone || '', birth_year: '', birth_date: '', street: '', house_no: '', zip: '', city: '', username: state.user?.username || '', has_photo: false };
  try { const r = await api('/api/my/profile'); if (r.profile) pr = { ...pr, ...r.profile }; } catch {}
  const open = !!state.profileOpen;
  const age = ageFromDate(pr.birth_date);
  const ageBadge = (bd) => { const a = ageFromDate(bd); return a == null ? '' : t('pf_years', { a }); };
  const avatarInner = pr.has_photo
    ? `<img src="/api/my/photo?t=${Date.now()}" alt="Profilfoto">`
    : `<span>${esc(initials(pr.name))}</span>`;
  const summary = [pr.username, age != null ? t('pf_years', { a: age }) : null, pr.city].filter(Boolean).join(' · ') || t('pf_summary_empty');
  card.classList.remove('hidden');
  card.innerHTML = `
    <div class="pfc-head" id="pfc-head">
      <span class="pfc-av">${avatarInner}</span>
      <div class="pfc-meta">
        <div class="pfc-name">${esc(pr.name || t('pf_my_profile'))}</div>
        <div class="pfc-sub">${esc(summary)}</div>
      </div>
      <button class="sec sm" id="pfc-toggle">${open ? t('pf_close') : t('pf_open')}</button>
    </div>
    <div class="pfc-body ${open ? '' : 'hidden'}" id="pfc-body">
      <div class="pf-hero" style="margin-top:.6rem">
        <div class="pf-avatar-lg">
          <span class="pf-av-inner" id="pf-av-inner">${avatarInner}</span>
          <label class="pf-cam" title="${t('pf_change_photo')}">📷<input type="file" id="pf-file" accept="image/*" hidden></label>
        </div>
        <button class="ghost sm ${pr.has_photo ? '' : 'hidden'}" id="pf-photo-del" style="margin-top:.4rem">${t('pf_remove_photo')}</button>
      </div>
      <div class="pf-privacy">${t('pf_privacy')}</div>
      <div class="err hidden" id="pf-err"></div>
      <div class="pf-sec">
        <div class="pf-sec-h">${t('pf_personal')}</div>
        <div class="field"><label>${t('pf_name')}</label><input id="pf-name" value="${esc(pr.name || '')}" placeholder="${t('reg_name_ph')}"></div>
        <div class="row">
          <div class="field"><label>${t('pf_bdate')}</label><input id="pf-bdate" type="date" value="${esc(pr.birth_date || '')}" max="2015-12-31"></div>
          <div class="field" style="max-width:110px"><label>${t('pf_age')}</label><input id="pf-age" value="${ageBadge(pr.birth_date)}" placeholder="—" readonly></div>
        </div>
      </div>
      <div class="pf-sec">
        <div class="pf-sec-h">${t('pf_address')}</div>
        <button class="geo-btn" id="pf-geo" type="button">${t('pf_geo')}</button>
        <div class="hint" style="margin:.35rem 0 .7rem">${t('pf_geo_hint')}</div>
        <div class="row">
          <div class="field" style="flex:2"><label>${t('pf_street')}</label><input id="pf-street" value="${esc(pr.street || '')}" placeholder="${t('pf_ph_street')}"></div>
          <div class="field" style="max-width:110px"><label>${t('pf_houseno')}</label><input id="pf-houseno" value="${esc(pr.house_no || '')}" placeholder="${t('pf_ph_houseno')}"></div>
        </div>
        <div class="row">
          <div class="field" style="max-width:130px"><label>${t('pf_zip')}</label><input id="pf-zip" inputmode="numeric" value="${esc(pr.zip || '')}" placeholder="${t('pf_ph_zip')}"></div>
          <div class="field" style="flex:2"><label>${t('pf_city')}</label><input id="pf-city" value="${esc(pr.city || '')}" placeholder="${t('pf_ph_city')}"></div>
        </div>
      </div>
      <div class="pf-sec">
        <div class="pf-sec-h">${t('pf_contact')}</div>
        <div class="field"><label>${t('pf_phone')}</label><input id="pf-phone" inputmode="tel" value="${esc(pr.phone || '')}" placeholder="${t('pf_ph_phone')}"></div>
        <div class="field"><label>${t('pf_email')}</label><input id="pf-email" type="email" value="${esc(pr.email || '')}" placeholder="${t('pf_ph_email')}"></div>
      </div>
      <div class="pf-sec">
        <div class="pf-sec-h">${t('pf_access')}</div>
        <div class="field"><label>${t('pf_login_fixed')}</label><input value="${esc(pr.username || '')}" readonly></div>
        ${ip ? `<div class="field"><label>${t('pf_reach_school')}</label><div class="inline">${contactButtons(ip)}</div></div>` : ''}
      </div>
      <div class="actions"><button id="pf-save">${t('pf_save')}</button></div>
      <div class="pf-danger">
        <div class="pf-sec-h">${t('pf_account')}</div>
        <p class="hint" style="margin:.1rem 0 .5rem">${t('pf_account_text')}</p>
        <button class="danger sm" id="pf-del-account">${t('pf_del_account')}</button>
      </div>
    </div>`;
  const setOpen = (o) => {
    state.profileOpen = o;
    $('#pfc-body').classList.toggle('hidden', !o);
    $('#pfc-toggle').textContent = o ? t('pf_close') : t('pf_open');
  };
  $('#pfc-head').onclick = () => setOpen(!state.profileOpen);
  const avEl = $('#pf-av-inner'), delBtn = $('#pf-photo-del');
  $('#pf-bdate').oninput = () => { const a = ageFromDate($('#pf-bdate').value); $('#pf-age').value = a == null ? '' : t('pf_years', { a }); };
  $('#pf-file').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      await api('/api/my/profile', { method: 'PATCH', body: { photo: dataUrl } });
      pr.has_photo = true;
      avEl.innerHTML = `<img src="${dataUrl}" alt="Profilfoto">`;
      const hav = card.querySelector('.pfc-av'); if (hav) hav.innerHTML = `<img src="${dataUrl}" alt="">`;
      delBtn.classList.remove('hidden');
      toast('Foto gespeichert ✓', 'ok');
    } catch (err) { toast(err.message, 'err'); }
    e.target.value = '';
  };
  delBtn.onclick = async () => {
    try {
      await api('/api/my/profile', { method: 'PATCH', body: { photo: null } });
      pr.has_photo = false;
      avEl.innerHTML = `<span>${esc(initials($('#pf-name').value || pr.name))}</span>`;
      const hav = card.querySelector('.pfc-av'); if (hav) hav.innerHTML = `<span>${esc(initials($('#pf-name').value || pr.name))}</span>`;
      delBtn.classList.add('hidden');
      toast(t('pf_photo_removed'), 'ok');
    } catch (err) { toast(err.message, 'err'); }
  };
  const geoBtn = $('#pf-geo');
  if (geoBtn) geoBtn.onclick = async () => {
    const orig = geoBtn.textContent;
    geoBtn.disabled = true; geoBtn.textContent = t('pf_geo_searching');
    try {
      const c = await getPosOnce();
      const parts = await geocodeAddressParts(c.latitude, c.longitude);
      if (!parts || (!parts.street && !parts.city)) { toast(t('pf_addr_notfound'), 'err'); return; }
      if (parts.street) $('#pf-street').value = parts.street;
      if (parts.house_no) $('#pf-houseno').value = parts.house_no;
      if (parts.zip) $('#pf-zip').value = parts.zip;
      if (parts.city) $('#pf-city').value = parts.city;
      toast(parts.house_no ? t('pf_geo_ok') : t('pf_geo_ok_house'), 'ok');
    } catch (e) { toast(t('pf_geo_unavail', { e: e.message }), 'err'); }
    finally { geoBtn.disabled = false; geoBtn.textContent = orig; }
  };
  $('#pf-save').onclick = async () => {
    try {
      await api('/api/my/profile', { method: 'PATCH', body: {
        name: $('#pf-name').value, phone: $('#pf-phone').value,
        email: $('#pf-email').value || null,
        birth_date: $('#pf-bdate').value || null,
        street: $('#pf-street').value || null, house_no: $('#pf-houseno').value || null,
        zip: $('#pf-zip').value || null, city: $('#pf-city').value || null } });
      state.user.name = $('#pf-name').value.trim(); state.user.phone = $('#pf-phone').value.trim();
      toast(t('pf_saved'), 'ok');
      renderProfileCard();   // Kopf-Zusammenfassung auffrischen, aufgeklappt lassen
    } catch (e) { const el = $('#pf-err'); if (el) { el.textContent = e.message; el.classList.remove('hidden'); } else toast(e.message, 'err'); }
  };
  const delBtnA = $('#pf-del-account');
  if (delBtnA) delBtnA.onclick = () => openDeleteAccountModal();
}
// Konto-Löschung: doppelte Sicherung – Passwort bestätigen + „LÖSCHEN" tippen.
function openDeleteAccountModal() {
  const word = t('da_word');
  modal(`<h3>${t('da_title')}</h3>
    <p class="hint">${t('da_text')}</p>
    <div class="field"><label>${t('da_pass_label')}</label><input id="da-pass" type="password" autocomplete="current-password" placeholder="${t('da_pass_ph')}"></div>
    <div class="field"><label>${t('da_word_label', { w: word })}</label><input id="da-word" autocapitalize="characters" placeholder="${word}"></div>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">${t('abort')}</button><button class="danger" id="da-go" disabled>${t('da_go')}</button></div>`);
  const chk = () => { $('#da-go').disabled = !($('#da-pass').value && $('#da-word').value.trim().toUpperCase() === word.toUpperCase()); };
  $('#da-pass').oninput = chk; $('#da-word').oninput = chk;
  $('#da-go').onclick = async () => {
    const go = $('#da-go'); go.disabled = true; go.textContent = t('da_deleting');
    try {
      await api('/api/my/account/delete', { method: 'POST', body: { password: $('#da-pass').value } });
      closeModal();
      alert(t('da_done_alert'));
      try { localStorage.removeItem('fsp_token'); } catch {}
      location.href = '/';
    } catch (e) { go.disabled = false; go.textContent = t('da_go'); toast(e.message, 'err'); }
  };
}
// „Mein Profil“ öffnen: Karte oben aufklappen + hinscrollen (statt Popup)
window.__openProfile = () => {
  state.profileOpen = true;
  const c = $('#profile-card');
  if (c) { renderProfileCard().then(() => c.scrollIntoView({ behavior: 'smooth', block: 'start' })); }
};
window.__openPhone = window.__openProfile;   // Alias (alte Aufrufe)

// ---------- Geführter Einstieg (Tutorial) für Fahrschüler ----------
function getTourSteps() {
  return [
    { icon: '👋', title: t('tour_t0'), text: t('tour_x0') },
    { icon: '📅', title: t('tour_t1'), text: t('tour_x1') },
    { icon: '📋', title: t('tour_t2'), text: t('tour_x2') },
    { icon: '🎁', title: t('tour_t3'), text: t('tour_x3') },
    { icon: '👤', title: t('tour_t4'), text: t('tour_x4') },
    { icon: '🎉', title: t('tour_t5'), text: t('tour_x5') },
  ];
}
function openTour() {
  const TOUR = getTourSteps();
  let i = 0;
  const finish = () => { try { localStorage.setItem('ginoco-tour-done', '1'); } catch {} closeModal(); };
  const draw = () => {
    const s = TOUR[i];
    modal(`<div style="text-align:center">
        <div style="font-size:2.8rem;line-height:1;margin:.2rem 0 .3rem">${s.icon}</div>
        <h3 style="margin:.1rem 0 .6rem">${esc(s.title)}</h3>
        <p style="font-size:.96rem;line-height:1.65;color:var(--ink);margin:0 .2rem">${s.text}</p>
        <div class="tour-dots">${TOUR.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
      </div>
      <div class="actions" style="justify-content:space-between;align-items:center">
        <button class="ghost sm" id="tour-skip">${t('tour_skip')}</button>
        <div class="inline" style="gap:.4rem">
          ${i > 0 ? `<button class="sec sm" id="tour-prev">${t('tour_prev')}</button>` : ''}
          <button class="sm" id="tour-next">${i < TOUR.length - 1 ? t('tour_next') : t('tour_start')}</button>
        </div>
      </div>`);
    $('#tour-skip').onclick = finish;
    const prev = $('#tour-prev'); if (prev) prev.onclick = () => { i--; draw(); };
    $('#tour-next').onclick = () => { if (i < TOUR.length - 1) { i++; draw(); } else finish(); };
  };
  draw();
}
window.__openTour = openTour;

// ---------- Was ist neu? (Changelog) ----------
const CHANGELOG_VER = '3.93';
const CHANGELOG = [
  { v: '3.93', d: '02.09.2026', title: '📍 Abholung: deine Wahl – mit Bewegungsfreiheit', items: [
    '📍 <strong>Beim ersten Login:</strong> Du legst einmal fest, wie du abgeholt werden möchtest – <strong>fester Abholort</strong> (immer am selben Ort, einfach & verlässlich) oder <strong>flexibel</strong> (du bist viel unterwegs und fixierst deinen Live-Standort je Fahrstunde).',
    '🕒 <strong>Bis 20 Min vorher änderbar:</strong> Spontan woanders? Kein Problem – fixiere deinen Abholort bis 20 Minuten vor Beginn. Danach steht er fest, damit dein Fahrlehrer sicher planen kann.',
    '🔔 <strong>Freundliche Erinnerung:</strong> Rund 25 Minuten vorher stupsen wir dich per Push an – „Bist du woanders? Jetzt Abholort fixieren." Machst du nichts, holen wir dich einfach wie immer ab.'] },
  { v: '3.92', d: '02.09.2026', title: '🚗 Fahrlehrer live verfolgen', items: [
    '📍 <strong>„Dein Fahrlehrer teilt Live-Standort":</strong> Sobald dein Fahrlehrer sich auf den Weg macht, bekommst du eine Push – und kannst ihn auf der Karte <strong>live kommen sehen</strong>, mit Fahrzeit.',
    '🚦 <strong>Kurze Ansagen:</strong> Dein Fahrlehrer kann dir unterwegs schnell Bescheid geben („gleich da", „etwas Stau", „Berufsverkehr") – ganz ohne Anrufen.'] },
  { v: '3.91', d: '01.09.2026', title: '🗺️ Karte lädt zuverlässiger', items: [
    '🗺️ <strong>Live-Karte:</strong> Die Straßenkarte (Treffpunkt/Abholung) lädt jetzt stabiler – lädt ein Kartenanbieter mal nicht, wird automatisch auf einen Ersatz umgeschaltet, und die Karte bleibt nicht mehr grau.',
    '🚀 Außerdem: alles lädt spürbar schneller (die App wird jetzt komprimiert ausgeliefert – rund 70 % weniger Datenmenge).'] },
  { v: '3.90', d: '01.09.2026', title: '🕒 Genaue Fahrzeit – von beiden bestätigt', items: [
    '🕒 <strong>Haargenaue Zeit:</strong> Wenn die Fahrstunde beginnt, wird der exakte Startzeitpunkt festgehalten (Start-Knopf – von Fahrschüler oder Fahrlehrer), beim Abschließen die echte Endzeit.',
    '✍️ <strong>Beide bestätigen:</strong> Du siehst die tatsächliche Zeit direkt beim Unterschreiben – mit deiner Unterschrift bestätigst du sie. Dein Fahrlehrer bestätigt sie mit seiner. Im Nachweis steht sie schwarz auf weiß, von beiden bestätigt.'] },
  { v: '3.89', d: '31.08.2026', title: '🌍 Mehrsprachig: Deutsch, English, Türkçe, العربية', items: [
    '🌍 <strong>Sprache wählbar:</strong> ginoco spricht jetzt <strong>Deutsch, Englisch, Türkisch und Arabisch</strong> – Arabisch mit korrekter Rechts-nach-links-Darstellung. Umschalten unten im Anmelde-Bildschirm oder unter „🎨 Aussehen → Sprache".',
    '🚀 Der Anmelde-Bereich, die Rechtstexte-Begrüßung und die Formulare sind bereits übersetzt; die weiteren Bereiche folgen Schritt für Schritt.'] },
  { v: '3.88', d: '31.08.2026', title: '📄 Rechtstexte gleich beim Start', items: [
    '📄 <strong>Nutzungsbedingungen &amp; Datenschutz beim ersten Öffnen:</strong> Ganz am Anfang zeigen wir dir beide Texte einmal direkt in der App – kurz drüberschauen, „Verstanden &amp; akzeptieren", fertig. Danach erscheint das nicht mehr; die Links bleiben unten im Anmelde-Bildschirm.'] },
  { v: '3.87', d: '31.08.2026', title: '🚗 Das große Update – alles Neue auf einen Blick', items: [
    '<strong>Ein rundum edleres, smarteres ginoco.</strong> Hier die lange Liste mit allem, was in den letzten Tagen dazugekommen ist:',
    '✅ <strong>Fahrstunde abschließen &amp; abhaken:</strong> Nach jeder Stunde führt dich ein gläserner, animierter Ablauf in Schritten durch – 1. Stattgefunden? · 2. Was habt ihr gemacht? · 3. Was übt ihr als Nächstes? · 4. Unterschriften. Die Ausbildungskarte (Klasse B) ist gleich aufgeklappt, jeder Punkt wird abgehakt (🔴 muss noch · 🟡 geübt · 🟢 sitzt).',
    '✍️ <strong>Beide unterschreiben – richtig dokumentiert:</strong> Dein Fahrlehrer unterschreibt auf dem Tablet (einmal gemerkt, immer gleich), du auf deinem Handy. Beide Unterschriften stehen im gedruckten Nachweis.',
    '📋 <strong>Erst schauen, dann unterschreiben:</strong> Öffnest du die Unterschrift, siehst du vorher die ganze Fahrstunde, <strong>was ihr geübt habt</strong> und dass dein Fahrlehrer schon unterschrieben hat.',
    '📬 <strong>„Etwas liegt in deinem Postfach":</strong> Fordert dein Fahrlehrer die Unterschrift an, kommt sofort eine Handy-Benachrichtigung – auch wenn die App zu ist. Ein Tipp darauf öffnet die App direkt am Postfach und legt dir die Stunde zum Unterschreiben hin.',
    '🔔 <strong>Ton aussuchen:</strong> Unter „🎨 Aussehen → Benachrichtigungston" wählst du 🔔 Glocke, 🚗🔒 Auto-Verriegeln oder 🔇 Aus – mit „Probe"-Knopf.',
    '🧾 <strong>Rechnungsdatum &amp; Klartext:</strong> Zwei klare Zeilen (gefahren / Rechnung) mit Schnell-Chips (+1/+2/+3 Tage), genauem Tag + Uhrzeit und „leeren". Und im Nachweis steht jetzt verständlich „vom Fahrlehrer eingetragen am …", „Auf der Rechnung zu sehen am …" und „… Min zu spät".',
    '🧠 <strong>KI-Planer &amp; Tagesstatus (für deinen Fahrlehrer):</strong> Passende Termine aus der Verfügbarkeit, ein Tages-Status „läuft planmäßig / wird später" mit Grund (Berufsverkehr, Stau, Schnee, Glatteis) – du siehst es oben und bekommst eine Push.',
    '🌦️ <strong>Wetter &amp; Live-Verkehr:</strong> ginoco warnt bei Glatteis/Schnee automatisch und kann – mit optionalem Verkehrs-Schlüssel – bei echtem Stau auf den Wegen eine Verzögerung vorschlagen.',
    '✅ <strong>Vorschläge annehmen/ablehnen:</strong> Trägt dein Fahrlehrer einen Termin für dich ein, kannst du klar <strong>annehmen</strong> oder <strong>ablehnen</strong>; ohne Antwort verfällt der Vorschlag nach 2 Stunden und der Slot wird wieder frei.',
    '🎬 <strong>Neuer Start &amp; smarter Look:</strong> Beim Öffnen baut sich erst das „G" auf, beim Laden dreht es sich, beim Buchen wird der grüne Haken mit Konfetti daraus. Alles Tippbare senkt sich beim Drücken, Ansichten blenden sanft ein, keine sichtbaren Scrollbalken, edlere Menü-Griffe – auch die Farb-Auswahl reagiert jetzt flüssig.',
    '📜 <strong>Nutzungsbedingungen</strong> sind jetzt klar einsehbar (unten im Anmelde-Bildschirm), und du kannst dein <strong>Konto selbst löschen</strong> (unter „Mein Profil") – gefahrene Stunden bleiben anonym im Ausbildungsnachweis der Fahrschule.'] },
  { v: '3.86', d: '30.08.2026', title: '🔔 Ton aussuchen', items: [
    '🚗🔒 <strong>Auto-Verriegeln als Ton:</strong> Unter „🎨 Aussehen → Benachrichtigungston" kannst du jetzt zwischen 🔔 Glocke, 🚗🔒 Auto-Verriegeln und 🔇 Aus wählen – mit „Probe"-Knopf zum Reinhören.'] },
  { v: '3.85', d: '30.08.2026', title: '📬 „Etwas liegt in deinem Postfach"', items: [
    '📬 <strong>Push, wenn eine Unterschrift wartet:</strong> Fordert dein Fahrlehrer die Unterschrift an, kommt jetzt sofort eine Handy-Benachrichtigung „✍️ Etwas liegt in deinem Postfach" – auch wenn die App zu ist.',
    '👉 <strong>Ein Tipp genügt:</strong> Tippst du auf die Nachricht, öffnet sich die App direkt am Postfach, leuchtet kurz auf und legt dir die Fahrstunde zum Durchsehen & Unterschreiben hin.'] },
  { v: '3.84', d: '30.08.2026', title: '📋 Schüler sieht alles vor der Unterschrift', items: [
    '📋 <strong>Überblick vor dem Unterschreiben:</strong> Öffnest du die Unterschrift aus dem Postfach, siehst du jetzt die Fahrstunde, <strong>was ihr geübt habt</strong> und dass dein Fahrlehrer schon unterschrieben hat – erst drüberschauen, dann unterschreiben.',
    '🧾 <strong>Rechnungsdatum edler:</strong> zwei klare Zeilen (gefahren / Rechnung), Schnell-Chips (+1/+2/+3 Tage), genauer Tag + Uhrzeit, „leeren" – alles speichert sofort.'] },
  { v: '3.83', d: '30.08.2026', title: '✍️ Abschließen in Stufen – mit beiden Unterschriften', items: [
    '✨ <strong>Edler Ablauf:</strong> Das Abschließen läuft jetzt in gläsernen, animierten Schritten – 1. Stattgefunden? · 2. Was gemacht? · 3. Was übt ihr als Nächstes? · 4. Unterschriften.',
    '✍️ <strong>Beide unterschreiben:</strong> Du unterschreibst auf dem Tablet (einmal merken – wird wiederverwendet), der Fahrschüler auf seinem Handy. Beide Unterschriften stehen im gedruckten Nachweis.'] },
  { v: '3.82', d: '30.08.2026', title: '✅ Fahrstunde abschließen & abhaken', items: [
    '✅ <strong>Ein Tipp nach der Fahrstunde:</strong> Bei jeder Stunde jetzt der Knopf „Abschließen &amp; abhaken" – die Ausbildungskarte (Klasse B) ist gleich aufgeklappt, du hakst jeden Punkt ab (🔴/🟡/🟢), gibst Rückmeldung und forderst die Unterschrift an.',
    '📋 So ist schwarz auf weiß dokumentiert, dass du dich an die Ausbildungsdiagrammkarte hältst – im gedruckten Nachweis mit Datum je Übung.'] },
  { v: '3.80', d: '30.08.2026', title: '🎡 Das „G" beim Laden', items: [
    '🎡 <strong>Ladeanzeige mit Herz:</strong> Wenn etwas lädt, dreht sich jetzt das ginoco-„G" (das Lenkrad) – und wenn du buchst, wird daraus der grüne Haken mit Konfetti. 🎉'] },
  { v: '3.79', d: '30.08.2026', title: '✨ Smarter Feinschliff', items: [
    '✨ <strong>Fühlt sich „gekonnt" an:</strong> Alles Tippbare senkt sich beim Drücken ganz leicht, Ansichten blenden sanft ein, sanftes Scrollen – und das hässliche Tap-Flackern ist weg.',
    '🎚️ <strong>Edlere Menü-Griffe</strong> links & rechts (schlanke Milchglas-Kapsel, feine Gold-Griffleiste) – in ginoco.de und mcp.ginoco.de.'] },
  { v: '3.78', d: '30.08.2026', title: '🎬 Neuer Startbildschirm', items: [
    '🎬 Beim Öffnen zeichnet sich erst das ginoco-Logo (das „G"), dann baut sich die App auf – ein kleiner, edler Moment beim Start.'] },
  { v: '3.77', d: '30.08.2026', title: '🧾 Klarere Fahrstunden & Nachweis', items: [
    '🧾 <strong>„Auf der Rechnung zu sehen am …":</strong> Weicht eine Stunde vom Fahrdatum ab, steht jetzt klar, wann sie auf der Rechnung erscheint (statt „fsmanager").',
    '🕒 <strong>Verständlicher:</strong> „vom Fahrlehrer eingetragen am …" statt des verwirrenden „nachgetragen".',
    '⏱️ <strong>Verspätung im Nachweis</strong> sauber formuliert: „Fahrschüler … Min zu spät" – damit auf dem gedruckten Nachweis klar ist, was gemeint ist.'] },
  { v: '3.76', d: '30.08.2026', title: '🗑️ Konto selbst löschen', items: [
    '🗑️ <strong>Konto löschen:</strong> Fahrschüler können ihr Konto jetzt selbst in „Mein Profil“ löschen – Login &amp; persönliche Daten werden entfernt. Gefahrene Fahrstunden bleiben anonym im Ausbildungsnachweis der Fahrschule erhalten.'] },
  { v: '3.75', d: '29.08.2026', title: '📊 Deine Woche im Blick – frei & ausgelastet', items: [
    '📊 <strong>Auslastung & freie Zeiten (Fahrlehrer):</strong> Im KI-Planer siehst du oben, wie voll dein Kalender ist und wo noch Platz für Stunden ist – ein Tipp auf den Tag und du trägst direkt selbst ein.',
    '🧑‍🏫 <strong>Du bleibst der Chef:</strong> Die KI meldet sich nie von selbst – Vorschläge kommen nur, wenn du sie öffnest. Selbst planen geht jederzeit.',
    '📄 <strong>Vertrag & Monat:</strong> Auf „Heute“ siehst du deine Monatsstunden gegen dein Minimum und die immer ausgezahlte Grenze – auf einen Blick, mobil-sauber.',
    '🚧 <strong>Live-Verkehr (optional):</strong> Mit einem kostenlosen TomTom-Schlüssel (Einstellungen → Wetter &amp; Verkehr) warnt ginoco bei echtem Stau auf deinen Wegen und schlägt die Verzögerung zum Melden vor. Ohne Schlüssel bleibt es einfach aus.'] },
  { v: '3.74', d: '29.08.2026', title: '🧠 KI-Planer, Vorschläge & Tagesstatus', items: [
    '🧠 <strong>KI-Planer (Fahrlehrer):</strong> schlägt aus der Verfügbarkeit deiner Fahrschüler passende Termine vor – lückenlos in deine freien Slots, höchstens einer pro Tag & Schüler. Auswählen, „übernehmen“, fertig.',
    '🚦 <strong>Tagesstatus:</strong> Der Fahrlehrer sagt mit einem Tipp, ob heute alles <strong>planmäßig</strong> läuft oder es <strong>später</strong> wird – mit Grund (Berufsverkehr, Stau, Schnee, Glatteis, Witterung). Du siehst es sofort oben und bekommst eine Push.',
    '🌦️ <strong>Wetter-Warnung (für Fahrlehrer):</strong> ginoco schaut in die DWD-Wetterdaten und schlägt bei Glatteis, Schnee oder Starkregen von selbst vor, eine Verzögerung zu melden – ein Tipp genügt.',
    '⚡ <strong>Automatisch für die Fahrschüler:</strong> Auf Wunsch warnt ginoco die heutigen Fahrschüler bei Glatteis/Schnee ganz von selbst vor (Einstellungen → Wetter &amp; Verkehr). Und der Grund („🧊 Glatteis“, „🚧 Stau“) erscheint jetzt automatisch in der Live-Ansicht der Fahrstunde.',
    '✅ <strong>Vorschläge annehmen/ablehnen:</strong> Trägt dein Fahrlehrer einen Termin für dich ein, kannst du ihn jetzt klar <strong>annehmen</strong> oder <strong>ablehnen</strong> – er wird über deine Antwort benachrichtigt.',
    '⏳ <strong>Antwortfrist:</strong> Ein Vorschlag verfällt nach 2 Stunden ohne Antwort (einstellbar) – der Slot wird dann automatisch wieder frei.',
    '📜 Ruhiger Look ohne sichtbare Scrollbalken – wie eine echte App.'] },
  { v: '3.73', d: '29.08.2026', title: '✨ Edler, lebendiger – und fairer', items: [
    '🎉 <strong>Buch-Erfolg:</strong> Nach jeder Buchung gibt’s einen kleinen Moment mit Haken & Konfetti.',
    '💎 Feinerer Look: weichere Schatten, ruhigere Typografie, ein Hauch Glanz auf freien Zeiten und im Logo.',
    '🕒 <strong>Nachgetragene Stunden:</strong> klar getrennt in „gefahren am …“ und „eingetragen am …“ (mit Uhrzeit).',
    '📅 <strong>Fair für alle:</strong> Pro Tag kannst du dir <strong>eine</strong> Fahrstunde selbst buchen – dein Fahrlehrer kann weiterhin mehr eintragen.',
    '🗂️ Für Fahrlehrer: „Rechnung“ heißt jetzt <strong>fsmanager</strong> – mit 495-Min-Warnung je fsmanager-Tag.'] },
  { v: '3.72', d: '26.08.2026', title: '🔓 Face ID / Passkey für den Fahrlehrer', items: [
    '🔓 <strong>Passkey-Login:</strong> Der Fahrlehrer meldet sich jetzt per <strong>Face ID / Touch ID</strong> an – ohne Passwort, phishing-sicher. Einrichten unter 🔐 Zugang.',
    '🔐 Zur Erinnerung: Es gibt außerdem echtes Passwort, Authenticator (2-Faktor) und „Passwort vergessen".'] },
  { v: '3.71', d: '25.08.2026', title: '✨ Feiner Feinschliff', items: [
    '🔁 <strong>Wiederholungs-Vorschlag:</strong> Beim Abschließen einer Fahrstunde schlägt Ginoco dem Fahrlehrer vor, was sich zu üben lohnt – zuletzt 🔴 oder lange her.',
    '🎛️ <strong>Edleres Menü:</strong> Das seitliche Menü glänzt jetzt eleganter – schlankere Griffe, sanfter Schimmer, feinere Kacheln.'] },
  { v: '3.70', d: '25.08.2026', title: '🎓 Prüfungsreife, Übersicht & mehr Nachweis', items: [
    '🎓 <strong>Prüfungsreife-Check:</strong> „Bin ich bald so weit?" – zeigt dir auf einen Blick, was noch fehlt: offene Sonderfahrten, rote ADK-Punkte und Ausbildungsabschnitte.',
    '🌄 <strong>Sonderfahrten korrekt gezählt:</strong> Eine Überlandfahrt (225 Min) zählt jetzt als 5 von 5 Einheiten – nicht mehr als „1".',
    '📄 <strong>Nachweis mit Ausbildungsstand:</strong> Der gedruckte Fahrstunden-Nachweis enthält jetzt eine Zusammenfassung – welche Aufgabe wie oft geübt wurde und wie sie sitzt.',
    '🧑‍🏫 <strong>Für den Fahrlehrer:</strong> Gesamtübersicht aller Fahrschüler – wer hat rote Punkte, wer ist fast prüfungsreif.'] },
  { v: '3.69', d: '25.08.2026', title: '🌄 Sonderfahrten selbst buchen (ab Rang 2)', items: [
    '🌄 Ab <strong>Rang 2</strong> (15 Fahrstunden) buchst du deine Pflicht-Sonderfahrten selbst: Überland (225 Min), Autobahn (180 Min) und Nachtfahrt (135 Min).',
    '🗓️ Eigener Bereich in „Meine Woche": Tag wählen – Ginoco zeigt dir nur die Startzeiten, an denen die lange Fahrt noch komplett in den Tag passt.',
    '🚦 Rang 1 sieht 10 Tage im Voraus; ab Rang 2 mehr – und eben die Sonderfahrten.'] },
  { v: '3.68', d: '25.08.2026', title: '📊 Fortschritt im Detail & freie Wunschzeit', items: [
    '🕒 <strong>Freie Wunschzeit:</strong> An freien Tagen wählst du deine Startzeit selbst (z. B. 15:00). Sobald jemand bucht, öffnen sich die Slots davor & danach lückenlos – wer zuerst bucht, gibt den Takt vor.',
    '🚦 <strong>Stand je Aufgabe:</strong> Dein Fahrlehrer bewertet beim Abschließen jede Übung – 🔴 muss noch geübt · 🟡 geübt · 🟢 sitzt ganz gut.',
    '📋 <strong>Ausbildungskarte je Fahrstunde:</strong> Bei jeder Stunde siehst (und lädst) du, was ihr gemacht habt – als sauberes PDF.',
    '📈 <strong>Zusammenfassung:</strong> Wie oft hast du z. B. eingeparkt – je Tag und insgesamt? Alles in „Ausbildungs-Übersicht", inkl. „das üben wir noch".',
    '🔢 <strong>Statistik:</strong> Fahrstunden gesamt (à 80 Min zählt 1, 120 Min = 1,5), davon Schaltstunden, und deine gefahrene Zeit.'] },
  { v: '3.67', d: '24.08.2026', title: '📋 „Was habt ihr heute gemacht?"', items: [
    '📋 Beim Abschließen einer Fahrstunde hakt der Fahrlehrer direkt ab, welche Themen der Ausbildungskarte (Klasse B) heute dran waren – mit Suche.',
    '🗓️ Das wird pro Tag protokolliert: In deiner Ausbildungskarte steht bei jedem Punkt das Datum, an dem ihr es gemacht habt.',
    '✍️ Danach Unterschrift anfordern → du bestätigst per Touch → alles gespeichert.'] },
  { v: '3.66', d: '24.08.2026', title: '📄 Nachweis & Unterschrift beim Abschließen', items: [
    '📄 Fahrstunden-Nachweis neu: Querformat, Ginoco-Logo & Fahrschul-Kopf, aufgeräumte Tabelle.',
    '✍️ Beim Abschließen einer Fahrstunde kann der Fahrlehrer direkt deine Unterschrift anfordern – du bekommst sie ins Postfach und unterschreibst per Touch.',
    '🧑‍🎓 Fahrschüler-Karten aufgeräumt: Login klar als 🔑-Zeile, lange Namen brechen sauber um.'] },
  { v: '3.65', d: '23.08.2026', title: '🔐 Sicherer Fahrlehrer-Zugang', items: [
    '🔑 Login mit PIN oder richtigem Passwort und „Angemeldet bleiben".',
    '📷 Authenticator (2-Faktor) per QR-Code einrichten – einfach mit der Authenticator-App abscannen (oder Schlüssel manuell). Optional bei jeder Anmeldung ein 6-stelliger Code.',
    '🆘 „Passwort vergessen": mit dem Authenticator-Code setzt du dir selbst ein neues Passwort – ganz ohne E-Mail.',
    '🎡 Tab-Icon (Lenkrad-Emblem) wird verlässlich geladen – auch wenn der Browser das alte Symbol gecacht hatte.'] },
  { v: '3.63', d: '23.08.2026', title: '🗂️ fsmanager-Datum im Protokoll', items: [
    '🗂️ Im Protokoll siehst du jetzt bei jeder Stunde, unter welchem Datum sie im fsmanager geführt wird – gefahren am … · im fsmanager geführt am …',
    '📄 Steht auch auf dem ausgedruckten Fahrstunden-Nachweis, damit alles zusammenpasst.'] },
  { v: '3.62', d: '23.08.2026', title: '✍️ Unterschreiben & Töne', items: [
    '✍️ Nachgetragene Fahrstunden bestätigst du jetzt selbst: Dein Fahrlehrer trägt eine Stunde nach, du bekommst eine Benachrichtigung und unterschreibst mit dem Finger direkt in der App.',
    '📄 Deine Unterschrift erscheint auf dem Fahrstunden-Nachweis („✓ vom Fahrschüler bestätigt").',
    '🔊 Neuer Benachrichtigungston bei neuen Mitteilungen – an/aus unter 🎨 Aussehen.',
    '✨ Fahrlehrer-Bereich aufgeräumt: übersichtlichere Fahrschüler-Karten mit klaren Symbol-Schaltflächen.'] },
  { v: '3.61', d: '21.08.2026', title: '⭐ Bewertung – jetzt richtig gut', items: [
    '🧩 Neuer geführter Ablauf: Du bewertest Schritt für Schritt – Geduld, Erklärungen, Pünktlichkeit, Freundlichkeit und dein Fahrgefühl. Einfach Stern antippen, es geht von allein weiter.',
    '📸 Foto direkt beim Bewerten hochladen – kein Umweg mehr übers Profil. Mit Vorschau, natürlich freiwillig.',
    '🙋 Du bestimmst, wie dein Name erscheint (voll, abgekürzt oder anonym) – mit Live-Vorschau.',
    '✅ Am Ende siehst du deine Bewertung im Überblick, bevor du sie abschickst.'] },
  { v: '3.60', d: '20.08.2026', title: '🎉 Was gibt es Neues? – Das große Ginoco-Update', items: [
    '✉️ <strong>Schreiben in der App:</strong> Du kannst deinem Fahrlehrer jetzt direkt in Ginoco schreiben – Fragen, kurz Bescheid geben, alles an einem Ort. Wie ein Chat.',
    '🔔 <strong>Handy-Benachrichtigungen:</strong> Erinnerungen, Verschiebungen, Absagen und Angebote kommen als Push aufs Handy – auch wenn die App zu ist. Einmal erlauben unter „🔔 Mitteilungen".',
    '📅 <strong>Lückenloses Buchen:</strong> Der Tag fließt – die nächste Fahrstunde schließt automatisch an die vorige an (inkl. Pause und Abholzeit). Fällt eine Stunde aus, rücken die folgenden nach.',
    '📍 <strong>Live-Abholung:</strong> Kurz vor der Fahrstunde siehst du, wo dein Fahrlehrer gerade ist und wann er da ist – „Wo sollen wir dich einsammeln?" inklusive.',
    '⭐ <strong>Bewertungen:</strong> Nach bestandener Prüfung darfst du Ginoco & die Fahrschule bewerten – mit Sternen, Text und wahlweise vollem Namen, abgekürzt oder anonym.',
    '🔑 <strong>Passwort vergessen:</strong> Neues Passwort anfordern – die Anfrage landet direkt bei deinem Fahrlehrer, der es sicher neu setzt.',
    '📲 <strong>App installieren:</strong> Ginoco lässt sich wie eine echte App aufs Handy legen – neues Logo, sauberer „ginoco"-Schriftzug und schnellerer Start.'] },
  { v: '3.59', d: '20.08.2026', title: 'Nachrichten in der App', items: [
    '✉️ Schreib direkt in der App mit deinem Fahrlehrer – Fragen, Bescheid geben, alles an einem Ort (wie ein Chat).',
    '🔔 Neue Nachrichten kommen per Push aufs Handy; gelesen/ungelesen wird angezeigt.',
    '🧑‍🏫 Der Fahrlehrer hat einen eigenen „Nachrichten"-Bereich mit allen Gesprächen und ungelesen-Zähler.'] },
  { v: '3.58', d: '20.08.2026', title: 'Passwort-Anfragen, Recht & App-Reif', items: [
    '🔑 „Passwort vergessen"-Anfragen erscheinen jetzt oben im Fahrlehrer-Dashboard – mit Ein-Tipp-Zurücksetzen und fertigen Zugangsdaten zum Weitergeben.',
    '📄 Datenschutzerklärung & Impressum (Vorlagen) hinzugefügt – verlinkt auf der Startseite, nötig für den App-Store.',
    '📲 App-Reif: Digital-Asset-Links vorbereitet – Ginoco lässt sich als echte Play-Store-/App-Store-App verpacken.'] },
  { v: '3.57', d: '20.08.2026', title: 'Neues Ginoco-Logo & Schriftzug', items: [
    '🎨 Beim Öffnen begrüßt dich jetzt das Ginoco-Lenkrad-Emblem in Orange-Gelb und ein klarer „ginoco"-Schriftzug.',
    '✨ Auch oben in der Kopfzeile: Emblem + Schriftzug im Marken-Look.'] },
  { v: '3.56', d: '20.08.2026', title: 'Handy-Benachrichtigungen (Push)', items: [
    '🔔 Echte Push-Nachrichten aufs Handy – auch wenn die App zu ist: Erinnerungen, Verschiebungen, Absagen, Angebote.',
    '👉 Einschalten unter „🔔 Mitteilungen" → „Benachrichtigungen einschalten" (einmal erlauben). Mit Test-Knopf.',
    '🔒 Datenschutzfreundlich & ohne fremde Dienste – die Schlüssel erzeugt Ginoco selbst.'] },
  { v: '3.55', d: '20.08.2026', title: 'Untern-Buchen-Look & Bewertungen ausgebaut', items: [
    '🎨 Neues Standard-Design im Look der Fahrschule Untern Buchen (Schwarz + warmes Orange). Jederzeit umstellbar unter 🎨 Aussehen.',
    '⭐ Bewertungen-Bereich stark erweitert: Durchschnitt & Sterne-Verteilung, Filter (Alle/Sichtbar/Verborgen/Top), „⭐ Top" anheften, selbst eintragen, bearbeiten, kopieren.',
    '✅ „Echter Fahrschüler"-Haken bei Portal-Bewertungen; nach bestandener Prüfung wird automatisch um eine Bewertung gebeten.'] },
  { v: '3.53', d: '20.08.2026', title: 'Passwort vergessen', items: [
    '🔑 Fahrschüler können ein neues Passwort anfordern – die Anfrage landet direkt beim Fahrlehrer (im Protokoll), der es neu setzt und mitteilt.',
    '🔒 Sicher & ohne Konto-Verrat: die Antwort ist immer gleich, egal ob es den Login gibt.'] },
  { v: '3.52', d: '20.08.2026', title: 'Zwei Standorte (Eberswalde + Finow)', items: [
    '📍 Zweiter Standort Finow: die Abholzeit wird automatisch vom näheren Standort gerechnet.',
    '🎛️ Pro Fahrschüler wählbar, ab welchem Standort geschätzt wird (automatisch/Eberswalde/Finow) – plus feste Abholzeit in Minuten.',
    '🧪 Über 4.000 Zufalls-Prüfungen bestanden: nie Doppelbuchen, nie eine offene Lücke.'] },
  { v: '3.51', d: '20.08.2026', title: 'Bewertungen & Empfehlungen', items: [
    '⭐ Fahrschüler können eine Bewertung abgeben – mit Sternen, freiem Text und wahlweise vollem Namen, abgekürzt (Lena M.) oder anonym, optional mit Profilfoto.',
    '🎉 Nach bestandener Prüfung wird man freundlich um eine Bewertung gebeten – die Akte bleibt erhalten, nichts wird gelöscht.',
    '↔️ Auf der Startseite laufen die Empfehlungen als Laufschrift durch – echte Stimmen zur Fahrschule Untern Buchen (Eberswalde).',
    '🛠️ Der Fahrlehrer moderiert alles (sichtbar/verbergen, antworten, löschen) im neuen Bereich „Bewertungen".'] },
  { v: '3.50', d: '20.08.2026', title: 'Fließender Tagesplan – lückenlos', items: [
    '🔄 Der Tag fließt: die Startzeit der nächsten Fahrstunde wächst automatisch mit der Dauer der vorigen (40/80/120 Min) – plus 15 Min Pause und deiner Abholzeit. So bleibt alles lückenlos.',
    '🚗 Abholzeit je Fahrschüler: trag beim Schüler ein, wie lange die Fahrt dorthin dauert (z. B. Groß Schönebeck = 30 Min) – sie wird vor jeder Stunde eingerechnet.',
    '🧩 Fällt eine Stunde aus, rücken die folgenden automatisch nach vorne – die betroffenen Schüler werden benachrichtigt.',
    '⏰ Neue Tage öffnen jetzt früh um 06:00 Uhr; Monats-Skala bis 130 Std.',
    '🧹 Nachts hält sich der Server selbst sauber – ganz ohne neu anzumelden. Und die App lädt immer frisch (kein Hard-Refresh mehr nötig).'] },
  { v: '3.49', d: '19.08.2026', title: 'Meine Fahrstunden & Nachtragen', items: [
    '📖 Fahrschüler sehen jetzt „Meine Fahrstunden“ – tabellarisch mit Datum & Uhrzeit, Dauer, Art, Verspätung und Vermerk.',
    '➕ Fahrlehrer kann Fahrstunden nachtragen (echtes Fahrdatum, z. B. 18.08. 20:00) – das Eintragedatum wird zusätzlich vermerkt.',
    '📄 Fahrstunden-Nachweis zum Ausdrucken (Tabelle mit Unterschriftsfeldern).'] },
  { v: '3.48', d: '26.07.2026', title: 'Karte aufgewertet & runder Look', items: [
    '🗺️ Live-Karte zeigt jetzt die echte Fahrzeit über die Straße (statt grober Schätzung).',
    '🎯 „Zentrieren“-Knopf – schaust du auf der Karte herum, bleibt die Ansicht stehen, bis du zurücktippst.',
    '🎉 Klarer Hinweis „Dein Fahrlehrer ist da!“, wenn er ganz nah ist.',
    '🛞 Drehender Reifen als Lade-Symbol, wenn der Server kurz braucht – plus runderer, weicherer Look.'] },
  { v: '3.47', d: '26.07.2026', title: 'Privatmodus', items: [
    '🔒 Ginoco läuft jetzt im Privatmodus: neue Anmeldungen sind geschlossen – nur du (und bestehende Zugänge) nutzen die App.',
    '⚙️ Jederzeit umschaltbar unter Einstellungen → „Privatmodus & Registrierung“, falls du später Fahrschüler einladen willst.'] },
  { v: '3.46', d: '26.07.2026', title: 'Neue Live-Karte direkt in der App', items: [
    '🗺️ Echte Live-Karte in Ginoco: der Fahrlehrer-Punkt bewegt sich live, die Route wird eingezeichnet – kein Wechsel zu Google Maps mehr nötig.',
    '📍 Entfernung & Ankunftszeit direkt dabei; die Karte aktualisiert sich automatisch.',
    '🔒 Datenschutzfreundlich über OpenStreetMap, ohne fremde Tracker.'] },
  { v: '3.45', d: '26.07.2026', title: 'Läuft alles? – Live-Status vor der Fahrstunde', items: [
    '✅ Schon ~1 Std vorher siehst du: „Alles läuft planmäßig" – oder „wir starten etwas später".',
    '🍦 Freundliche Frage vorab: „Wo sollen wir dich einsammeln?" – noch beim Eisessen? Kein Problem, kurz Bescheid geben.',
    '⏱️ Fahrlehrer kann mit einem Tipp „+10/+15/+30 Min später" ansagen – die Fahrschüler werden automatisch informiert.'] },
  { v: '3.44', d: '26.07.2026', title: 'Menü beidseitig & frei einfärbbar', items: [
    '↔️ Das Menü öffnet links und rechts gleichzeitig – mit dem ✕ in der Mitte schließt du beide zusammen.',
    '🎨 Menü-Farbe frei wählbar: färbe die beiden Menüseiten, wie es dir gefällt (Aussehen → Menü-Farbe).',
    '🔲 Auch bei geöffnetem Menü immer zwei Kacheln nebeneinander.'] },
  { v: '3.42', d: '26.07.2026', title: 'Schönere Anmeldung & Tages-Überblick', items: [
    '🎨 Aufgehübschte Login-/Registrierungsseite (buntes Logo, Feature-Chips).',
    '📱 Fahrlehrer-„Heute": Begrüßung + Kurzüberblick (Stunden heute, nächste Stunde).'] },
  { v: '3.41', d: '26.07.2026', title: 'Suche in der Ausbildungskarte', items: [
    '🔍 Suchleiste in der Ausbildungskarte – tippe z.B. „Kreisverkehr“ und hake direkt ab, ohne Scrollen.'] },
  { v: '3.40', d: '26.07.2026', title: 'Theorie sammeln eintragen', items: [
    '📋 Mehrere Theorie-Termine auf einmal eintragen (Datum, Von, Bis, Titel – mit Vorschau).'] },
  { v: '3.39', d: '26.07.2026', title: 'Ausbildungskarte im Vollbild', items: [
    '📋 Ausbildungskarte öffnet jetzt als große Vollbild-Seite (statt engem Fenster).',
    '🚗 Direkt aus der Fahrstunde abhakbar: Knopf „Ausbildungskarte abhaken“.'] },
  { v: '3.38', d: '25.07.2026', title: 'Feinschliff rundum', items: [
    '🏠 Einladendere Startseite: große Begrüßung + prominente „nächste Fahrstunde“.',
    '🔔 Mitteilungen schöner dargestellt (Karten mit Icon).',
    '📊 Protokoll mit Statistik-Überblick; 🗓️ Kalender hübscher.'] },
  { v: '3.37', d: '25.07.2026', title: 'Ausbildungskarte griffbereit', items: [
    '📋 Deine Ausbildungskarte jetzt direkt auf der Startseite (Knopf in der Fortschritts-Karte).',
    '🆕 Oben siehst du, was dein Fahrlehrer zuletzt abgehakt hat.'] },
  { v: '3.35', d: '25.07.2026', title: 'Ausbildungskarte: PDF & Einsicht', items: [
    '📄 Fahrlehrer kann die Ausbildungskarte als PDF drucken/speichern (mit Unterschriftsfeldern).',
    '👀 Fahrschüler sehen ihre eigene Ausbildungskarte jetzt selbst (nur lesen) – im Menü „Ausbildungskarte“.'] },
  { v: '3.34', d: '25.07.2026', title: 'Einheitlicher Look & Hilfe', items: [
    '💬 Kleine „?“-Erklärungen direkt an kniffligen Feldern (z. B. Sperrfrist, Rang 2, Sonderfahrten).',
    '🎴 Einheitliches Karten-Design: überall gleiche Rundungen und ruhige Abstände.'] },
  { v: '3.33', d: '25.07.2026', title: 'Neuer, edlerer Look', items: [
    '✨ Feiner Schliff überall: weiche Übergänge, sanftes Ein-/Ausklappen.',
    '👆 Knöpfe und Kacheln geben jetzt spürbares Tipp-Feedback.',
    '🪟 Fenster blenden elegant ein statt hart aufzupoppen.'] },
  { v: '3.32', d: '25.07.2026', title: 'Standort & Neuigkeiten', items: [
    '📍 Adresse per aktuellem Standort automatisch ausfüllen – du ergänzt nur die Hausnummer.',
    '✨ Dieses „Was ist neu?“-Fenster – hier siehst du künftig alle Verbesserungen.'] },
  { v: '3.31', d: '25.07.2026', title: 'Schneller & sauberer', items: [
    '⚡ ginoco startet schneller (App lädt aus dem Cache).',
    '🪟 Fenster schließen jetzt sauber ab – kein Überlappen mehr.',
    '🛰️ Live-Karte mit Straßennamen und „Dein Fahrlehrer ist auf dem Weg zu dir“.'] },
  { v: '3.30', d: '25.07.2026', title: 'Angebote & Bedienung', items: [
    '🎁 Fahrstunden einfacher „Ins Angebot geben“ (früher „Feed“).',
    '🧑‍🎓 Fahrschüler-Liste und Einstellungen komplett aufgeräumt.',
    '🎨 Neue Metallic-Schriftfarben: Gold, Bronze, Carbon, Metallic Schwarz.'] },
];
function markWhatsNewSeen() { try { localStorage.setItem('ginoco-cl-seen', CHANGELOG_VER); } catch {} }
function hasUnseenNews() { try { return localStorage.getItem('ginoco-cl-seen') !== CHANGELOG_VER; } catch { return false; } }
function openWhatsNew() {
  markWhatsNewSeen();
  document.querySelectorAll('.edge-handle.right').forEach((h) => h.classList.remove('hasnew'));
  modal(`<h3>✨ Was ist neu?</h3>
    <p class="hint">Die letzten Verbesserungen in ginoco:</p>
    ${CHANGELOG.map((c) => `<div class="wn-block">
      <div class="wn-h"><span class="wn-v">v${c.v}</span> <strong>${esc(c.title)}</strong> <span class="muted">· ${c.d}</span></div>
      <ul class="wn-list">${c.items.map((i) => `<li>${i}</li>`).join('')}</ul>
    </div>`).join('')}
    <div class="actions"><button onclick="window.__closeModal()">Alles klar 🚗</button></div>`, 'wide');
}
window.__openWhatsNew = openWhatsNew;

// ---------- API ----------
// Reifen-Ladeanzeige: erscheint nur, wenn der Server kurz braucht (> 400 ms).
let _apiInflight = 0, _apiTimer = null;
function _ensureLoader() {
  let el = document.getElementById('app-loader');
  if (!el) {
    el = document.createElement('div'); el.id = 'app-loader';
    el.innerHTML = '<span class="tire" aria-hidden="true">🛞</span><span class="al-tx">Einen Moment …</span>';
    el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Lädt');
    document.body.appendChild(el);
  }
  return el;
}
function _apiLoading(on) {
  if (on) {
    _apiInflight++;
    if (_apiInflight === 1 && !_apiTimer) _apiTimer = setTimeout(() => { _ensureLoader().classList.add('show'); }, 400);
  } else {
    _apiInflight = Math.max(0, _apiInflight - 1);
    if (_apiInflight === 0) { clearTimeout(_apiTimer); _apiTimer = null; document.getElementById('app-loader')?.classList.remove('show'); }
  }
}
async function api(path, opts = {}) {
  _apiLoading(true);
  try {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.error || 'Fehler');
    return data;
  } finally { _apiLoading(false); }
}

// ---------- Datum (durchgehend LOKALE Zeit, nie toISOString -> sonst TZ-Versatz) ----------
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function todayStr() { return ymd(new Date()); }
function parseD(s) { return new Date(s + 'T00:00:00'); }
function isoDow(s) { const d = parseD(s).getDay(); return d === 0 ? 7 : d; }
function addDays(s, n) { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); }
function addMonths(s, n) { const d = parseD(s); d.setMonth(d.getMonth() + n); return ymd(d); }
function firstOfMonth(s) { const d = parseD(s); return ymd(new Date(d.getFullYear(), d.getMonth(), 1)); }
function mondayOf(s) { return addDays(s, -(isoDow(s) - 1)); }
function fmtDay(s) { const d = parseD(s); return `${WD_LONG[isoDow(s) - 1]}, ${d.getDate()}. ${MON[d.getMonth()]} ${d.getFullYear()}`; }
function fmtShort(s) { const d = parseD(s); return `${d.getDate()}.${d.getMonth() + 1}.`; }
function hoursUntil(date, start) { return (new Date(`${date}T${start}:00`).getTime() - Date.now()) / 36e5; }
function daysAhead(date) { return Math.round((parseD(date).getTime() - parseD(todayStr()).getTime()) / 864e5); }
function minToH(m) { return (m / 60); }
function hLabel(m) { const h = Math.floor(m / 60), mm = m % 60; return mm ? `${h}:${String(mm).padStart(2, '0')} h` : `${h} h`; }

// ---------- Kontakt / Geo ----------
function telLink(p) { return 'tel:' + String(p || '').replace(/[^+\d]/g, ''); }
function waNumber(p) { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '49' + d.slice(1); return d; }
function waLink(p) { return 'https://wa.me/' + waNumber(p); }
function contactButtons(phone, waText) {
  if (!phone) return '';
  const t = waText ? '?text=' + encodeURIComponent(waText) : '';
  return `<a class="pill" href="${telLink(phone)}" style="text-decoration:none">📞 Anrufen</a>
    <a class="pill" href="${waLink(phone)}${t}" target="_blank" rel="noopener" style="text-decoration:none">💬 WhatsApp</a>`;
}
function getPosOnce() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Kein GPS verfügbar'));
    navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), (e) => reject(new Error(e.message)), { enableHighAccuracy: true, timeout: 12000 });
  });
}
// Adresse aus Koordinaten (OpenStreetMap/Nominatim). Fehler werden still verschluckt.
async function reverseGeocode(lat, lng) {
  try {
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const r = await fetch(u, { headers: { 'Accept-Language': 'de' } });
    if (!r.ok) return null;
    const a = (await r.json()).address || {};
    const street = [a.road, a.house_number].filter(Boolean).join(' ');
    const city = a.city || a.town || a.village || a.suburb || '';
    const out = [street, [a.postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return out || null;
  } catch { return null; }
}
// Adresse aus Koordinaten in Einzelfeldern (für das Profil-Auto-Ausfüllen).
async function geocodeAddressParts(lat, lng) {
  try {
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const r = await fetch(u, { headers: { 'Accept-Language': 'de' } });
    if (!r.ok) return null;
    const a = (await r.json()).address || {};
    return {
      street: a.road || a.pedestrian || a.footway || a.residential || '',
      house_no: a.house_number || '',
      zip: a.postcode || '',
      city: a.city || a.town || a.village || a.suburb || a.municipality || '',
    };
  } catch { return null; }
}
// Live-Standort teilen (Fahrlehrer)
let liveWatchId = null;
function startLiveShare() {
  if (!navigator.geolocation) { toast(t('gps_unavail'), 'err'); return; }
  liveWatchId = navigator.geolocation.watchPosition(async (p) => {
    try { await api('/api/instructor/location', { method: 'POST', body: { lat: p.coords.latitude, lng: p.coords.longitude } }); } catch {}
    if (state.instrTab === 'heute') { const el = $('#live-instr'); if (el) el.dataset.ts = new Date().toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }); }
  }, (e) => { toast(t('loc_error', { e: e.message }), 'err'); stopLiveShare(); },
    { enableHighAccuracy: true, maximumAge: 8000, timeout: 20000 });
  state.liveSharing = true;
  if (state.user?.role === 'instructor') renderInstructor();
  toast('Standort wird geteilt 🛰️', 'ok');
}
function stopLiveShare() {
  if (liveWatchId != null) navigator.geolocation.clearWatch(liveWatchId);
  liveWatchId = null; state.liveSharing = false;
  api('/api/instructor/location/stop', { method: 'POST' }).catch(() => {});
  if (state.user?.role === 'instructor') renderInstructor();
}
window.__startLive = startLiveShare;
window.__stopLive = stopLiveShare;

// ---------- UI-Helfer ----------
let toastTimer;
function toast(msg, kind = '', ms = 3200) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast ' + kind; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
// Kurzer, edler Erfolgs-Moment nach einer Buchung: gezeichneter Haken + zarte
// Konfetti + ein Auto, das einmal durchfährt. Respektiert „Bewegung reduzieren“.
let celebrateBusy = false;
function celebrate(label) {
  if (celebrateBusy) return; celebrateBusy = true;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const colors = ['var(--brand)', 'var(--good)', 'var(--warn)', '#ffffff'];
  const conf = reduce ? '' : Array.from({ length: 16 }, (_, i) => {
    const l = Math.round(6 + Math.random() * 88);
    const d = (Math.random() * 0.35).toFixed(2);
    const r = Math.round(Math.random() * 360);
    return `<i style="left:${l}%;--d:${d}s;--r:${r}deg;background:${colors[i % colors.length]}"></i>`;
  }).join('');
  const ov = document.createElement('div');
  ov.className = 'celebrate';
  ov.innerHTML = `
    <div class="cel-conf">${conf}</div>
    <div class="cel-card">
      <svg class="cel-check" viewBox="0 0 52 52" aria-hidden="true">
        <circle class="cel-ring" cx="26" cy="26" r="24"/>
        <path class="cel-tick" d="M15 27 l7 7 l15 -16"/>
      </svg>
      <div class="cel-label">${esc(label || 'Gebucht')}</div>
    </div>
    ${reduce ? '' : '<div class="cel-car">🚗</div>'}`;
  document.body.appendChild(ov);
  setTimeout(() => ov.classList.add('out'), reduce ? 700 : 1500);
  setTimeout(() => { ov.remove(); celebrateBusy = false; }, reduce ? 1000 : 1980);
}
// ---------- Kontext-Hilfe: kleiner „?“ neben Feldern -> Erklär-Blase ----------
function helpDot(text) { return `<button type="button" class="help-dot" data-help="${esc(text)}" aria-label="Erklärung">?</button>`; }
let helpTimer = null;
function showHelp(text) {
  document.getElementById('help-pop')?.remove();
  const el = document.createElement('div');
  el.id = 'help-pop'; el.className = 'help-pop';
  el.innerHTML = `<span>${esc(text)}</span><button class="help-x" aria-label="schließen">✕</button>`;
  document.body.appendChild(el);
  const close = () => { el.remove(); document.removeEventListener('click', onDoc, true); };
  el.querySelector('.help-x').onclick = close;
  const onDoc = (e) => { if (!el.contains(e.target) && !e.target.closest('.help-dot')) close(); };
  setTimeout(() => document.addEventListener('click', onDoc, true), 60);
  clearTimeout(helpTimer); helpTimer = setTimeout(close, 10000);
}
document.addEventListener('click', (e) => {
  const d = e.target.closest('.help-dot');
  if (d) { e.preventDefault(); e.stopPropagation(); showHelp(d.dataset.help); }
});
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function modal(html, extra) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  const m = document.createElement('div');
  m.className = 'modal' + (extra === 'wide' ? ' wide' : '');
  m.innerHTML = html;
  // Inhalt in einen eigenen Scroll-Bereich packen; die Aktionsleiste (falls vorhanden)
  // bleibt als fester Footer außen – so überlappt nichts und nichts scheint durch.
  const actions = m.querySelector(':scope > .actions');
  const body = document.createElement('div');
  body.className = 'modal-body';
  while (m.firstChild && m.firstChild !== actions) body.appendChild(m.firstChild);
  m.insertBefore(body, m.firstChild);
  bg.appendChild(m);
  // 'locked' = Pflicht-Dialog: kein Schließen per Klick auf den Hintergrund.
  if (extra !== 'locked') bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); });
  document.body.appendChild(bg);
  const pwa = document.getElementById('pwa-install'); if (pwa) pwa.style.display = 'none';  // überlappt sonst das Fenster
  return bg;
}
function closeModal() {
  const m = $('.modal-bg'); if (m) m.remove();
  if (!$('.modal-bg')) { const pwa = document.getElementById('pwa-install'); if (pwa) pwa.style.display = ''; }
}

// ====================== Boot ======================
(async function boot() {
  try {
    const [me, s] = await Promise.all([api('/api/auth/me'), api('/api/settings')]);
    state.user = me.user; state.settings = s.settings;
  } catch (e) { /* settings evtl. ohne login */ }
  applyLangDir();
  render();
})();

function render() {
  if (!state.user) return renderAuth();
  if (state.user.role === 'instructor') return renderInstructor();
  return renderStudent();
}

// Das drehende „G" als Ladeanzeige (taucht zwischendurch beim Laden auf).
function gSvg(cls) {
  return `<svg class="g-spin ${cls || ''}" viewBox="-8 -8 116 116" width="36" height="36" fill="none" aria-hidden="true">
    <defs><linearGradient id="glg" x1="6" y1="96" x2="92" y2="8" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#e9530a"/><stop offset=".32" stop-color="#f6890d"/><stop offset=".62" stop-color="#ffc21a"/><stop offset="1" stop-color="#f7c40f"/></linearGradient></defs>
    <path d="M87.6 36.3 A40 40 0 1 1 64.98 12.9" stroke="url(#glg)" stroke-width="14" stroke-linecap="round"/>
    <circle cx="50" cy="50" r="10" stroke="url(#glg)" stroke-width="10"/>
    <g stroke="url(#glg)" stroke-width="13" stroke-linecap="round"><line x1="35" y1="50" x2="17" y2="50"/><line x1="65" y1="50" x2="83" y2="50"/><line x1="50" y1="65" x2="50" y2="83"/></g></svg>`;
}
function gLoad(text) { return `<div class="g-load">${gSvg()}${text ? `<span>${esc(text)}</span>` : ''}</div>`; }

function header() {
  const u = state.user;
  return `<header>
    <div class="brand"><img class="logo" src="/logo.svg?v=3630" alt="" width="24" height="24" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'logo',textContent:'🚗'}))"> <span class="brandname">ginoco</span></div>
    <div class="who">
      <span class="role">${u.role === 'instructor' ? t('role_instructor') : t('role_student')}</span>
      ${u.role === 'instructor' ? '' : `<strong>${esc(u.name || '')}</strong>`}${u.username ? `<span class="pill">${esc(u.username)}</span>` : ''}
      ${state.liveSharing ? `<button class="ghost sm" onclick="window.__stopLive()" title="${t('tip_live_stop')}" style="color:var(--good)">${t('live_stop')}</button>` : ''}
      ${u.role === 'student' ? `<button class="ghost sm" onclick="window.__openTour()" title="${t('tip_tour')}">❓</button>` : ''}
      ${u.role === 'student' ? `<button class="ghost sm" onclick="window.__openProfile()" title="${t('tip_profile')}">👤</button>` : ''}
      <button class="ghost sm" onclick="window.__openThemePicker()" title="${t('tip_appearance')}">🎨</button>
      <button class="ghost sm" id="logout">${t('logout')}</button>
    </div>
  </header>`;
}
function wireLogout() {
  const b = $('#logout');
  if (b) b.onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); state.user = null; render(); };
}

// ---------- Edge-Menüs (links: Navigation, rechts: Aktionen) ----------
// Kachel-Menüs am Bildschirmrand: kleiner Griff antippen -> Leiste fährt herein.
// Jeder Eintrag ist eine Kachel (Icon oben, Text drunter), logisch gruppiert.
// Einträge [key, icon, label]; ['__group', Titel] ist eine Gruppen-Überschrift.
const INSTR_NAV = [
  ['__group', 'Übersicht'],
  ['heute', '📊', 'Heute & Ziele'], ['kalender', '📅', 'Kalender'], ['navigation', '🧭', 'Navigation'],
  ['__group', 'Fahrschüler'],
  ['schueler', '🧑‍🎓', 'Fahrschüler'], ['nachrichten', '✉️', 'Nachrichten'], ['codes', '🔑', 'Zugangscodes'],
  ['__group', 'Planung'],
  ['planer', '🧠', 'KI-Planer'],
  ['arbeitszeiten', '🕒', 'Arbeitszeiten'], ['theorie', '📚', 'Theorie'],
  ['__group', 'System'],
  ['bewertungen', '⭐', 'Bewertungen'],
  ['protokoll', '📋', 'Protokoll'], ['einstellungen', '⚙️', 'Einstellungen'],
];
const STUDENT_NAV = [
  ['__group', 'nav_grp_overview'],
  ['week-card', '📅', 'nav_week'], ['slots', '🚗', 'nav_book'],
  ['lessons-card', '📖', 'nav_lessons'],
  ['__group', 'nav_grp_more'],
  ['messages-card', '✉️', 'nav_messages'],
  ['notif-card', '🔔', 'nav_notif'], ['offers-card', '🎁', 'nav_offers'],
  ['review-card', '⭐', 'nav_review'],
];
// Flache Liste (mit '__group'-Markern) -> gruppierte Kacheln
function edgeTilesHTML(items, attr) {
  let html = '', open = false;
  for (const it of items) {
    if (it[0] === '__group') {
      if (open) html += '</div></div>';
      html += `<div class="edge-groupwrap"><div class="edge-group">${esc(t(it[1]))}</div><div class="edge-tiles">`;
      open = true;
    } else {
      const [key, icon, label] = it;
      const badge = key === 'protokoll' ? '<span id="ev-badge" class="et-badge"></span>' : '';
      html += `<button class="edge-tile" ${attr}="${key}"><span class="et-ic">${icon}</span><span class="et-lb">${esc(t(label))}</span>${badge}</button>`;
    }
  }
  if (open) html += '</div></div>';
  return html;
}
function mountEdgeMenus(role) {
  document.querySelectorAll('.edge-root').forEach((n) => n.remove());
  const leftItems = role === 'instructor'
    ? edgeTilesHTML(INSTR_NAV, 'data-nav')
    : edgeTilesHTML(STUDENT_NAV, 'data-scroll');
  const live = state.liveSharing ? [['live', '🛰️', 'Live beenden']] : [];
  const rightGroups = role === 'student'
    ? [['__group', 'Anpassen'], ['theme', '🎨', 'Aussehen'], ['phone', '👤', 'Mein Profil'], ['training', '📋', 'Ausbildungskarte'], ['tour', '❓', 'Einführung'], ['whatsnew', '✨', 'Was ist neu?'],
       ['__group', 'Konto'], ...live, ['reload', '🔄', 'Aktualisieren'], ['logout', '🚪', 'Abmelden']]
    : [['__group', 'Anpassen'], ['theme', '🎨', 'Aussehen'], ['whatsnew', '✨', 'Was ist neu?'],
       ['__group', 'Konto'], ...live, ['reload', '🔄', 'Aktualisieren'], ['logout', '🚪', 'Abmelden']];
  const rightItems = edgeTilesHTML(rightGroups, 'data-act');
  const root = document.createElement('div');
  root.className = 'edge-root';
  root.innerHTML = `
    <button class="edge-handle left" aria-label="${t('menu_open')}">☰</button>
    <button class="edge-handle right" aria-label="${t('menu_open')}">⋯</button>
    <div class="edge-overlay"></div>
    <button class="edge-x" aria-label="${t('menu_close')}">✕</button>
    <aside class="edge-panel left"><div class="edge-title">${t('menu')}</div>${leftItems}</aside>
    <aside class="edge-panel right"><div class="edge-title">${t('actions')}</div>${rightItems}</aside>`;
  document.body.appendChild(root);
  // Beide Seiten öffnen sich zeitgleich; das ✕ in der Mitte schließt beide.
  const open = () => root.classList.add('open-both');
  const close = () => root.classList.remove('open-both', 'open-left', 'open-right');
  root.querySelector('.edge-handle.left').onclick = open;
  root.querySelector('.edge-handle.right').onclick = open;
  root.querySelector('.edge-overlay').onclick = close;
  root.querySelector('.edge-x').onclick = close;
  // aktive Kachel markieren (Fahrlehrer)
  if (role === 'instructor') root.querySelectorAll('[data-nav]').forEach((b) =>
    b.classList.toggle('active', b.dataset.nav === state.instrTab));
  root.querySelectorAll('[data-nav]').forEach((b) => b.onclick = () => {
    state.instrTab = b.dataset.nav; close(); drawInstrTab();
    root.querySelectorAll('[data-nav]').forEach((x) => x.classList.toggle('active', x === b));
  });
  // Leere Bereiche (Feed/Mitteilungen) nicht mit Fehler abweisen, sondern
  // freundlich mit Leer-Zustand zeigen. Beim nächsten Sync werden sie – falls
  // weiterhin leer – wieder ausgeblendet.
  const EMPTY_SECTION = {
    'offers-card': `<h2>${t('offers_title')}</h2><p class="muted">${t('es_offers')}</p>`,
    'notif-card': `<h2>${t('notif_title')}</h2><p class="muted">${t('es_notif')}</p>`,
    'lesson-card': `<h2>${t('es_lesson_t')}</h2><p class="muted">${t('es_lesson')}</p>`,
    'live-card': `<h2>${t('es_live_t')}</h2><p class="muted">${t('es_live')}</p>`,
    'lessons-card': `<h2>${t('ml_title')}</h2><p class="muted">${t('es_lessons')}</p>`,
    'messages-card': `<h2>${t('msg_title')}</h2><p class="muted">${t('es_messages')}</p>`,
    'review-card': '<h2>⭐ Bewertung</h2><p class="muted">Hier kannst du Ginoco und deine Fahrschule bewerten. Nach bestandener Prüfung wirst du freundlich um eine Empfehlung gebeten.</p>',
  };
  root.querySelectorAll('[data-scroll]').forEach((b) => b.onclick = () => {
    close(); const id = b.dataset.scroll; const el = document.getElementById(id);
    if (!el) { toast('Dieser Bereich ist gerade nicht verfügbar', 'err'); return; }
    // Verstecktes/leeres Ziel: freundlichen Leer-Zustand zeigen, damit ein
    // Menüpunkt nie ins Nichts scrollt. Beim nächsten Sync füllt/versteckt
    // sich die Kachel wieder von selbst.
    if (el.classList.contains('hidden')) {
      if (EMPTY_SECTION[id]) el.innerHTML = EMPTY_SECTION[id];
      el.classList.remove('hidden');
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  root.querySelectorAll('[data-act]').forEach((b) => b.onclick = async () => {
    close(); const a = b.dataset.act;
    if (a === 'theme') window.__openThemePicker?.();
    else if (a === 'phone') window.__openPhone?.();
    else if (a === 'training') window.__openMyTraining?.();
    else if (a === 'tour') window.__openTour?.();
    else if (a === 'whatsnew') window.__openWhatsNew?.();
    else if (a === 'live') window.__stopLive?.();
    else if (a === 'reload') location.reload();
    else if (a === 'logout') { await api('/api/auth/logout', { method: 'POST' }); state.user = null; render(); }
  });
  // Kleiner „Neu“-Punkt am ⋯-Griff, solange es ungesehene Updates gibt
  if (hasUnseenNews()) root.querySelector('.edge-handle.right')?.classList.add('hasnew');
}

// ====================== LOGIN ======================
// Portal-Modus je nach Adresse:
//  mcp.ginoco.de      -> nur Fahrlehrer-Zugang
//  ginoco.de / www    -> nur Fahrschüler (Anmelden + Registrieren)
//  sonst (localhost, neu., IP) -> alles (zum Testen)
function portalMode() {
  const h = location.hostname;
  if (h === 'mcp.ginoco.de' || h.startsWith('mcp.')) return 'admin';
  if (h === 'ginoco.de' || h === 'www.ginoco.de') return 'student';
  return 'all';
}
function renderAuth() {
  const mode = portalMode();
  const regOpen = state.settings?.registration_open === '1'; // privat, wenn geschlossen
  const reg = regOpen ? [['register', 'tab_register']] : [];
  const TABS = mode === 'admin'
    ? [['instr', 'tab_instr']]
    : mode === 'student'
      ? [['login', 'tab_login'], ...reg]
      : [['login', 'tab_login'], ...reg, ['instr', 'tab_instr']];
  let tab = TABS[0][0];
  const tagline = mode === 'admin' ? t('tagline_admin') : t('tagline_student');
  const lg = LANGS[LANG] || LANGS.de;
  const draw = () => {
    app.innerHTML = `<div class="auth-wrap"><div class="auth">
      <div class="auth-hero">
        <div class="auth-logo"><img src="/logo.svg?v=3630" alt="Ginoco" width="70" height="70" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'🚗'}))"></div>
        <h1 class="auth-name">ginoco</h1>
        <div class="tag">${tagline}</div>
      </div>
      ${mode === 'admin' ? `<div class="auth-feats">
        <span>${t('feat_day')}</span><span>${t('feat_students')}</span><span>${t('feat_reviews')}</span><span>${t('feat_push')}</span>
      </div>` : `<div class="auth-feats">
        <span>${t('feat_book')}</span><span>${t('feat_swap')}</span><span>${t('feat_pickup')}</span>
      </div>`}
      <div class="card">
        ${TABS.length > 1 ? `<div class="tabs">
          ${TABS.map(([tk, lk]) => `<button data-t="${tk}" class="${tab === tk ? 'active' : ''}">${t(lk)}</button>`).join('')}
        </div>` : ''}
        <div id="authbody"></div>
      </div>
      <div class="center auth-tools">
        <button class="ghost sm" onclick="window.__openThemePicker()">${t('appearance')}</button>
        <button class="ghost sm" onclick="window.__openLangPicker()">${lg.flag} ${esc(lg.label)}</button>
      </div>
      <div class="center legal-links"><a href="/nutzungsbedingungen.html">${t('terms')}</a> · <a href="/datenschutz.html">${t('privacy')}</a> · <a href="/impressum.html">${t('imprint')}</a></div>
      ${mode !== 'admin' ? '<div class="rev-marquee" id="rev-marquee" hidden></div>' : ''}
    </div></div>`;
    app.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => { tab = b.dataset.t; draw(); });
    const body = $('#authbody');
    if (tab === 'login') body.innerHTML = loginForm();
    else if (tab === 'register') body.innerHTML = registerForm();
    else body.innerHTML = instrForm();
    wireAuth(tab);
    if (mode !== 'admin') loadReviewMarquee();
  };
  draw();
  maybeShowLegalGate(); // beim ersten Start Rechtstexte einmal zeigen
}

// Beim allerersten Öffnen Nutzungsbedingungen & Datenschutz einmal einblenden –
// für neue Nutzer (einmalig, danach nie wieder) und damit die App-Prüfung sie
// direkt lesen kann. Inline über same-origin-iframe (X-Frame-Options: SAMEORIGIN).
let _legalShown = false;
function maybeShowLegalGate() {
  if (_legalShown) return;
  let ack = false;
  try { ack = localStorage.getItem('ginoco-legal-ack') === '1'; } catch {}
  if (ack) return;
  _legalShown = true;
  modal(`<h3 style="margin:.1rem 0 .5rem">${t('gate_title')}</h3>
    <p class="hint" style="margin:0 0 .7rem">${t('gate_text')}</p>
    <div class="legal-tabs">
      <button data-lg="nb" class="active">${t('gate_terms')}</button>
      <button data-lg="ds">${t('gate_privacy')}</button>
    </div>
    <iframe id="legal-frame" class="legal-frame" src="/nutzungsbedingungen.html" title="Rechtstext"></iframe>
    <div class="legal-fallback">${t('gate_fallback')}
      <a href="/nutzungsbedingungen.html">${t('terms')}</a> · <a href="/datenschutz.html">${t('privacy')}</a></div>
    <div class="actions">
      <button class="sec" id="legal-later">${t('gate_later')}</button>
      <button id="legal-ok">${t('gate_ok')}</button>
    </div>`, 'wide');
  const frame = document.getElementById('legal-frame');
  document.querySelectorAll('.legal-tabs button').forEach((b) => b.onclick = () => {
    document.querySelectorAll('.legal-tabs button').forEach((x) => x.classList.toggle('active', x === b));
    if (frame) frame.src = b.dataset.lg === 'ds' ? '/datenschutz.html' : '/nutzungsbedingungen.html';
  });
  const done = () => { try { localStorage.setItem('ginoco-legal-ack', '1'); } catch {} closeModal(); };
  const ok = document.getElementById('legal-ok'); if (ok) ok.onclick = done;
  const later = document.getElementById('legal-later'); if (later) later.onclick = done;
}

// Bewertungen als Laufschrift (rechts -> links) auf der Startseite.
async function loadReviewMarquee() {
  const el = $('#rev-marquee');
  if (!el) return;
  let reviews = [];
  try { reviews = (await api('/api/reviews')).reviews || []; } catch { return; }
  if (!reviews.length) return;
  const stars = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
  const card = (r) => `<div class="rev-card${r.featured ? ' feat' : ''}">
    <div class="rev-stars">${stars(r.rating)}${r.featured ? ' <span class="rev-toptag">★ Top</span>' : ''}</div>
    <div class="rev-text">„${esc(r.text)}"</div>
    <div class="rev-who">${r.photo ? `<img class="rev-pic" src="${esc(r.photo)}" alt="">` : '<span class="rev-pic ph">🙂</span>'}<span>${esc(r.author)}</span>${r.verified ? '<span class="rev-verif" title="Echter Fahrschüler">✓</span>' : ''}</div>
  </div>`;
  // Inhalt doppelt fuer nahtlose Endlosschleife
  const items = reviews.map(card).join('');
  el.innerHTML = `<div class="rev-title">Das sagen Fahrschüler über Ginoco &amp; die Fahrschule Untern Buchen (Eberswalde)</div>
    <div class="rev-track" style="--rev-n:${reviews.length}">${items}${items}</div>`;
  el.hidden = false;
}

const errBox = () => `<div class="err hidden" id="autherr"></div>`;
function showErr(msg) { const e = $('#autherr'); if (e) { e.textContent = msg; e.classList.remove('hidden'); } }

function loginForm() {
  return `${errBox()}
    <div class="field"><label>${t('login_id')}</label><input id="l-email" autocomplete="username" placeholder="z.B. MM1997"></div>
    <div class="field"><label>${t('login_pw')}</label><input id="l-pw" type="password" autocomplete="current-password"></div>
    <div class="form-actions"><button id="l-go">${t('login_go')}</button></div>
    <p class="hint" style="margin-top:.6rem">${t('login_forgot_q')} <a href="#" id="l-forgot" class="linklike">${t('login_forgot_link')}</a> ${t('login_forgot_tail')}</p>`;
}
function openForgotModal() {
  modal(`<h3>${t('fg_title')}</h3>
    <p class="hint">${t('fg_text')}</p>
    ${errBox()}
    <div class="field"><label>${t('login_id')}</label><input id="fg-login" autocomplete="username" placeholder="z.B. MM1997"></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">${t('abort')}</button>
      <button id="fg-go">${t('fg_request')}</button>
    </div>`);
  $('#fg-go').onclick = async () => {
    const login = $('#fg-login').value.trim();
    if (!login) { showErr(t('fg_need')); return; }
    try {
      await api('/api/auth/reset-request', { method: 'POST', body: { login } });
      closeModal();
      toast(t('fg_done'), 'ok');
    } catch (e) { showErr(e.message); }
  };
}
function registerForm() {
  return `${errBox()}
    <p class="hint">${t('reg_intro')}</p>
    <div class="field"><label>${t('reg_code')}</label><input id="r-code" placeholder="XXXX-XXXX" style="text-transform:uppercase"></div>
    <div class="row">
      <div class="field"><label>${t('reg_name')}</label><input id="r-name" autocomplete="name" placeholder="${t('reg_name_ph')}"></div>
      <div class="field" style="max-width:130px"><label>${t('reg_year')}</label><input id="r-year" type="number" placeholder="1997" min="1930" max="2015"></div>
    </div>
    <div class="row">
      <div class="field"><label>${t('reg_email')}</label><input id="r-email" type="email"></div>
      <div class="field"><label>${t('reg_phone')}</label><input id="r-phone"></div>
    </div>
    <div class="field"><label>${t('reg_pw')}</label><input id="r-pw" type="password"><div class="hint" style="margin:.3rem 0 0">${t('reg_pw_hint')}</div></div>
    <div class="form-actions"><button id="r-go">${t('reg_go')}</button></div>`;
}
function instrForm() {
  return `${errBox()}
    <p class="hint">${t('instr_intro')}</p>
    <div class="field"><label>${t('instr_pin')}</label><input id="i-pin" type="password" autocomplete="current-password"></div>
    <div class="field hidden" id="i-2fa-wrap"><label>${t('instr_code')}</label><input id="i-code" inputmode="numeric" autocomplete="one-time-code" placeholder="${t('instr_code_ph')}"></div>
    <label class="ck-line" style="justify-content:flex-start;margin:.1rem 0 .3rem"><input type="checkbox" id="i-remember" checked> ${t('instr_remember')}</label>
    <div class="form-actions"><button id="i-go">${t('instr_go')}</button></div>
    ${state.settings?.passkey_enabled ? `<div class="or-sep">${t('or')}</div><button id="i-passkey" class="sec" type="button" style="width:100%">${t('instr_passkey')}</button>` : ''}
    <p class="hint" style="margin-top:.6rem"><a href="#" id="i-recover" class="linklike">${t('instr_forgot')}</a></p>`;
}
// Authenticator-Bereich in den Einstellungen (Status + Aktionen).
function renderAuthSection() {
  const box = $('#e-auth-body'); if (!box) return;
  const enabled = !!state.settings?.totp_enabled;
  const twofa = !!state.settings?.two_factor;
  if (!enabled) {
    box.innerHTML = `<p class="hint">Richte einen Authenticator ein (z.&nbsp;B. Google/Microsoft Authenticator). Damit kannst du dein Passwort selbst zurücksetzen („Passwort vergessen") und optional bei jeder Anmeldung einen Code verlangen.</p>
      <button class="sm" id="au-setup">🔐 Authenticator einrichten</button>`;
    $('#au-setup').onclick = openTotpSetup;
  } else {
    box.innerHTML = `<p class="hint" style="color:var(--good)">✓ Authenticator ist eingerichtet – „Passwort vergessen" läuft darüber.</p>
      <label class="ck-line" style="justify-content:flex-start"><input type="checkbox" id="au-2fa" ${twofa ? 'checked' : ''}> Bei jeder Anmeldung einen Code verlangen (2-Faktor)</label>
      <button class="ghost sm" id="au-disable" style="margin-top:.5rem;color:var(--bad)">Authenticator entfernen</button>`;
    $('#au-2fa').onchange = async () => {
      const cb = $('#au-2fa');
      try { const r = await api('/api/instructor/totp/2fa', { method: 'POST', body: { on: cb.checked } }); state.settings.two_factor = r.two_factor; toast('Gespeichert ✓', 'ok'); }
      catch (e) { toast(e.message, 'err'); cb.checked = !cb.checked; }
    };
    $('#au-disable').onclick = openTotpDisable;
  }
  box.insertAdjacentHTML('beforeend', '<div id="e-passkey" style="border-top:1px solid var(--line);margin-top:.8rem;padding-top:.2rem"></div>');
  renderPasskeySection();
}
// QR-Code (dunkel auf weiß) als scharfes SVG in ein Element zeichnen.
function renderQR(el, text) {
  if (!el) return;
  if (!window.qrEncode) { el.innerHTML = '<span class="hint">QR-Code nicht verfügbar – bitte Schlüssel manuell eingeben.</span>'; return; }
  let m; try { m = window.qrEncode(text); } catch { el.innerHTML = '<span class="hint">QR-Code konnte nicht erzeugt werden.</span>'; return; }
  const q = 4, size = m.size + q * 2; let rects = '';
  for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.get(x, y)) rects += `<rect x="${x + q}" y="${y + q}" width="1" height="1"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${size} ${size}" width="230" height="230" shape-rendering="crispEdges" role="img" aria-label="QR-Code für Authenticator"><rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
async function openTotpSetup() {
  let d; try { d = await api('/api/instructor/totp/setup', { method: 'POST' }); } catch (e) { toast(e.message, 'err'); return; }
  const keyPretty = d.secret.replace(/(.{4})/g, '$1 ').trim();
  modal(`<h3>🔐 Authenticator einrichten</h3>
    <p class="hint">Scanne den QR-Code mit deiner Authenticator-App (z.&nbsp;B. Google/Microsoft Authenticator) – „Konto hinzufügen" → „QR-Code scannen".</p>
    <div class="au-qr" id="au-qr"></div>
    <p class="hint center" style="margin:.4rem 0">Am Handy stattdessen: <a class="linklike" href="${esc(d.otpauth)}">📲 direkt in die App übernehmen</a></p>
    <details class="au-manual"><summary>QR geht nicht? Schlüssel manuell eingeben</summary>
      <div class="au-key"><span class="hint">Typ: zeitbasiert / TOTP:</span><code id="au-secret">${keyPretty}</code>
        <button class="ghost sm" id="au-copy">📋 Kopieren</button></div>
    </details>
    ${errBox()}
    <div class="field" style="margin-top:.5rem"><label>Zur Bestätigung: 6-stelliger Code aus der App</label><input id="au-code" inputmode="numeric" autocomplete="one-time-code" placeholder="6-stelliger Code"></div>
    <label class="ck-line" style="justify-content:flex-start"><input type="checkbox" id="au-req"> Bei jeder Anmeldung einen Code verlangen (2-Faktor)</label>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="au-go">Aktivieren</button></div>`);
  renderQR($('#au-qr'), d.otpauth);
  $('#au-copy').onclick = () => navigator.clipboard.writeText(d.secret).then(() => toast('Schlüssel kopiert ✓', 'ok')).catch(() => toast('Kopieren nicht möglich', 'err'));
  $('#au-go').onclick = async () => {
    try {
      const r = await api('/api/instructor/totp/confirm', { method: 'POST', body: { code: $('#au-code').value.trim(), require_login: $('#au-req').checked } });
      state.settings.totp_enabled = true; state.settings.two_factor = r.two_factor;
      closeModal(); toast('Authenticator aktiviert ✓', 'ok'); renderAuthSection();
    } catch (e) { showErr(e.message); }
  };
}
function openTotpDisable() {
  modal(`<h3>Authenticator entfernen</h3>
    <p class="hint">Zur Sicherheit brauche ich dein <strong>Passwort</strong> oder einen <strong>aktuellen Code</strong>.</p>${errBox()}
    <div class="field"><label>Passwort oder aktueller Code</label><input id="ad-pw" type="password" autocomplete="off"></div>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="ad-go" class="danger">Entfernen</button></div>`);
  $('#ad-go').onclick = async () => {
    const v = $('#ad-pw').value;
    try { await api('/api/instructor/totp/disable', { method: 'POST', body: { password: v, code: v } }); state.settings.totp_enabled = false; state.settings.two_factor = false; closeModal(); toast('Authenticator entfernt', 'ok'); renderAuthSection(); }
    catch (e) { showErr(e.message); }
  };
}
// Passwort vergessen (Fahrlehrer): mit dem Authenticator-Code ein neues Passwort setzen.
function openInstrForgotModal() {
  modal(`<h3>🔑 Passwort vergessen</h3>
    <p class="hint">Gib den aktuellen <strong>6-stelligen Code</strong> aus deiner Authenticator-App ein und wähle ein neues Passwort. (Funktioniert nur, wenn du vorher einen Authenticator eingerichtet hast.)</p>
    ${errBox()}
    <div class="field"><label>Authenticator-Code</label><input id="fp-code" inputmode="numeric" autocomplete="one-time-code" placeholder="6-stelliger Code"></div>
    <div class="field"><label>Neues Passwort</label><input id="fp-pw" type="password" autocomplete="new-password"><div class="hint" style="margin:.3rem 0 0">Mind. 8 Zeichen, mit Buchstabe, Zahl und Sonderzeichen.</div></div>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="fp-go">Neu setzen & anmelden</button></div>`);
  $('#fp-go').onclick = async () => {
    const code = $('#fp-code').value.trim(), np = $('#fp-pw').value;
    const prob = pwProblem(np);
    if (prob) { showErr('Neues Passwort braucht ' + prob + '.'); return; }
    try {
      await api('/api/auth/instructor/forgot', { method: 'POST', body: { code, new_password: np } });
      await api('/api/auth/instructor', { method: 'POST', body: { pin: np, remember: true, code } });
      closeModal();
      const [me, s] = await Promise.all([api('/api/auth/me'), api('/api/settings')]);
      state.user = me.user; state.settings = s.settings; render();
      toast('Passwort neu gesetzt ✓', 'ok');
    } catch (e) { showErr(e.message); }
  };
}

// ---------- Passkeys / Face ID / Touch ID (WebAuthn) ----------
const waSupported = () => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
function b64urlToBuf(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b.buffer;
}
function bufToB64url(buf) {
  const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function passkeyRegister() {
  if (!waSupported()) { toast('Dieses Gerät/dieser Browser unterstützt keine Passkeys.', 'err'); return; }
  try {
    const o = await api('/api/instructor/passkey/register/options', { method: 'POST' });
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: b64urlToBuf(o.challenge), rp: o.rp,
      user: { id: b64urlToBuf(o.user.id), name: o.user.name, displayName: o.user.displayName },
      pubKeyCredParams: o.pubKeyCredParams, authenticatorSelection: o.authenticatorSelection,
      timeout: o.timeout, attestation: o.attestation,
      excludeCredentials: (o.excludeCredentials || []).map((c) => ({ id: b64urlToBuf(c.id), type: c.type })),
    } });
    if (!cred) { toast('Abgebrochen', 'err'); return; }
    const r = await api('/api/instructor/passkey/register/verify', { method: 'POST', body: {
      clientDataJSON: bufToB64url(cred.response.clientDataJSON), attestationObject: bufToB64url(cred.response.attestationObject),
    } });
    toast(r.already ? 'Passkey war schon gespeichert' : 'Passkey/Face ID gespeichert ✓', 'ok');
    try { const s = await api('/api/settings'); state.settings = s.settings; } catch {}
    renderAuthSection();
  } catch (e) { toast(e && e.name === 'NotAllowedError' ? 'Abgebrochen oder Zeitüberschreitung.' : (e.message || 'Einrichtung fehlgeschlagen'), 'err'); }
}
async function passkeyLogin() {
  if (!waSupported()) { showErr('Dieses Gerät/dieser Browser unterstützt keine Passkeys.'); return; }
  try {
    const o = await api('/api/instructor/passkey/auth/options', { method: 'POST' });
    if (!o.allowCredentials || !o.allowCredentials.length) { showErr('Auf diesem Server ist noch kein Passkey hinterlegt. Erst mit PIN/Passwort anmelden und Face ID einrichten.'); return; }
    const assertion = await navigator.credentials.get({ publicKey: {
      challenge: b64urlToBuf(o.challenge), rpId: o.rpId, timeout: o.timeout, userVerification: o.userVerification,
      allowCredentials: o.allowCredentials.map((c) => ({ id: b64urlToBuf(c.id), type: c.type })),
    } });
    if (!assertion) { showErr('Abgebrochen'); return; }
    await api('/api/instructor/passkey/auth/verify', { method: 'POST', body: {
      id: assertion.id, clientDataJSON: bufToB64url(assertion.response.clientDataJSON),
      authenticatorData: bufToB64url(assertion.response.authenticatorData), signature: bufToB64url(assertion.response.signature),
    } });
    const [me, s] = await Promise.all([api('/api/auth/me'), api('/api/settings')]);
    state.user = me.user; state.settings = s.settings; render();
    toast('Angemeldet mit Face ID ✓', 'ok');
  } catch (e) { showErr(e && e.name === 'NotAllowedError' ? 'Abgebrochen oder Zeitüberschreitung.' : (e.message || 'Passkey-Anmeldung fehlgeschlagen')); }
}
async function renderPasskeySection() {
  const box = document.getElementById('e-passkey'); if (!box) return;
  let list = [];
  try { const r = await api('/api/instructor/passkeys'); list = r.passkeys || []; } catch {}
  const rows = list.map((k) => `<div class="pk-row"><span>🔑 ${esc(k.label)}</span><button class="ghost sm" data-pkdel="${esc(k.id)}" style="color:var(--bad)">Entfernen</button></div>`).join('');
  box.innerHTML = `<h4 style="margin:1rem 0 .3rem">🔓 Passkey / Face ID</h4>
    <p class="hint">Anmeldung per Gesicht oder Fingerabdruck – ohne Passwort, phishing-sicher. Am schnellsten &amp; sichersten.</p>
    ${rows || '<p class="hint">Noch kein Passkey hinterlegt.</p>'}
    <button class="sm" id="pk-add" ${waSupported() ? '' : 'disabled'} style="margin-top:.5rem">➕ Face ID / Passkey einrichten</button>
    ${waSupported() ? '' : '<div class="hint" style="margin-top:.3rem">Dieses Gerät/dieser Browser unterstützt keine Passkeys.</div>'}`;
  const add = document.getElementById('pk-add'); if (add) add.onclick = passkeyRegister;
  box.querySelectorAll('[data-pkdel]').forEach((b) => b.onclick = async () => {
    if (!confirm('Diesen Passkey entfernen?')) return;
    try { await api('/api/instructor/passkey/delete', { method: 'POST', body: { id: b.dataset.pkdel } }); try { const s = await api('/api/settings'); state.settings = s.settings; } catch {} renderAuthSection(); }
    catch (e) { toast(e.message, 'err'); }
  });
}
window.__passkeyLogin = passkeyLogin; window.__passkeyRegister = passkeyRegister;

function wireAuth(tab) {
  const done = async () => {
    const [me, s] = await Promise.all([api('/api/auth/me'), api('/api/settings')]);
    state.user = me.user; state.settings = s.settings; render();
  };
  if (tab === 'login') {
    $('#l-go').onclick = async () => {
      try {
        await api('/api/auth/login', { method: 'POST', body: { login: $('#l-email').value, password: $('#l-pw').value } });
        done();
      } catch (e) { showErr(e.message); }
    };
    const fg = $('#l-forgot'); if (fg) fg.onclick = (ev) => { ev.preventDefault(); openForgotModal(); };
  } else if (tab === 'register') {
    $('#r-go').onclick = async () => {
      const prob = pwProblem($('#r-pw').value);
      if (prob) { showErr('Passwort braucht ' + prob + '.'); return; }
      try {
        const r = await api('/api/auth/register', { method: 'POST', body: {
          code: $('#r-code').value, name: $('#r-name').value, email: $('#r-email').value,
          phone: $('#r-phone').value, password: $('#r-pw').value, birth_year: $('#r-year').value } });
        if (r.username) toast('Konto erstellt · Dein Login-Name: ' + r.username, 'ok');
        done();
      } catch (e) { showErr(e.message); }
    };
  } else {
    $('#i-go').onclick = async () => {
      try {
        const body = { pin: $('#i-pin').value, remember: $('#i-remember')?.checked !== false };
        const code = $('#i-code'); if (code && code.value.trim()) body.code = code.value.trim();
        const r = await api('/api/auth/instructor', { method: 'POST', body });
        if (r && r.need2fa) {                       // Authenticator-Code nachfordern
          $('#i-2fa-wrap')?.classList.remove('hidden');
          const c = $('#i-code'); if (c) c.focus();
          showErr('Bitte gib den 6-stelligen Code aus deiner Authenticator-App ein.');
          return;
        }
        done();
      } catch (e) { showErr(e.message); }
    };
    const rc = $('#i-recover'); if (rc) rc.onclick = (ev) => { ev.preventDefault(); openInstrForgotModal(); };
    const pk = $('#i-passkey'); if (pk) pk.onclick = passkeyLogin;
  }
  app.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const b = app.querySelector('.form-actions button'); if (b) b.click(); }
  }));
}

// ====================== FAHRSCHÜLER ======================
async function renderStudent() {
  app.innerHTML = header() + `<main>
    <div class="card hidden" id="lesson-card"></div>
    <div class="card hidden" id="live-card"></div>
    <div class="card hidden" id="notif-card"></div>
    <div class="card hidden" id="profile-card"></div>
    <div id="daystatus-banner"></div>
    <div class="card" id="week-card"></div>
    <div class="card hidden" id="lessons-card"></div>
    <div class="card" id="messages-card"></div>
    <div class="card hidden" id="review-card"></div>
    <div class="card hidden" id="offers-card"></div>
    <div class="card">
      <h2>${t('book_title')} <span class="sub" id="horizon-note"></span></h2>
      <div class="hint hidden" id="away-note"></div>
      <div class="dateline">
        <button class="sec sm" id="prev">‹</button>
        <span class="day" id="dlabel"></span>
        <button class="sec sm" id="next">›</button>
        <input type="date" id="dpick" style="max-width:170px">
      </div>
      <div class="inline" style="margin:.1rem 0 .7rem">
        <button class="sec sm" id="find-free">${t('find_free')}</button>
        <button class="ghost sm" id="go-today">${t('today')}</button>
      </div>
      <div id="book-cal"></div>
      <div class="slots" id="slots"></div>
    </div>
  </main>`;
  state.calMonth = firstOfMonth(state.date);
  const horizon = state.settings?.booking_horizon_days || 14;
  $('#horizon-note').textContent = t('horizon_note', { d: horizon });
  wireLogout();
  $('#dpick').value = state.date;
  $('#prev').onclick = () => { state.date = addDays(state.date, -1); syncStudent(); };
  $('#next').onclick = () => { state.date = addDays(state.date, 1); syncStudent(); };
  $('#dpick').onchange = (e) => { state.date = e.target.value; syncStudent(); };
  $('#find-free').onclick = () => jumpToNextFree();
  $('#go-today').onclick = () => { state.date = todayStr(); syncStudent(); };
  mountEdgeMenus('student');
  renderProfileCard();
  syncStudent();
  // Erst-Login: zuerst die Abholung einrichten (Pflicht) – danach erst die Einführung.
  if (!state.user.pickup_onboarded && !state._pickupOnbShown) {
    state._pickupOnbShown = true; setTimeout(openPickupOnboarding, 500);
    return;
  }
  // Beim ersten Mal automatisch die kurze Einführung zeigen
  let tourDone = false;
  try { tourDone = localStorage.getItem('ginoco-tour-done') === '1'; } catch {}
  if (!tourDone && !state._tourShown) { state._tourShown = true; setTimeout(openTour, 500); }
}

let myBookingsCache = [];
let myStats = null, myAdk = null, myProgress = null;
async function syncStudent() {
  $('#dlabel').textContent = fmtDay(state.date);
  $('#dpick').value = state.date;
  try {
    const [mine, day, off, notif, away, dstat] = await Promise.all([
      api('/api/my/bookings'), api('/api/slots?date=' + state.date),
      api('/api/offers'), api('/api/my/notifications'), api('/api/away'),
      api('/api/day-status').catch(() => ({ status: null }))]);
    myBookingsCache = mine.bookings;
    myStats = mine.stats || null; myAdk = mine.adk || null; myProgress = mine.progress || null;
    renderAway(away.away);
    renderDayStatusBanner(dstat.status, mine.bookings);
    renderNotifications(notif.notifications, notif.unread);
    renderLessonTimer(mine.bookings);
    refreshStudentLive();
    renderWeekCard(mine.weekInfo, mine.bookings, mine.progress);
    renderMyLessons(mine.bookings);
    renderReviewCard(mine.progress);
    renderStudentMessages();
    { const hn = $('#horizon-note'); if (hn && mine.progress) hn.textContent = t('horizon_note_rank', { d: mine.progress.horizon, r: mine.progress.rank }); }
    renderOffers(off.offers, mine.weekInfo);
    state.lastSlotStart = day.slots.length ? day.slots[day.slots.length - 1].start : null;
    renderSlots(day.slots, mine.bookings);
    // Kalender folgt dem gewählten Tag: beim Blättern in einen neuen Monat springt er mit.
    state.calMonth = firstOfMonth(state.date);
    renderBookingCalendar();
    maybeOpenPostfach(mine.bookings); // Push „Etwas liegt im Postfach" → direkt hin
    maybeScrollLive(); // Push „Fahrlehrer unterwegs/teilt Standort" (/?live=1) → zur Live-Karte
  } catch (e) { toast(e.message, 'err'); }
}

// Nach Tippen auf die „Fahrlehrer unterwegs/teilt Standort"-Push (/?live=1) zur Live-Karte scrollen.
function maybeScrollLive() {
  try {
    const u = new URL(location.href);
    if (u.searchParams.get('live') !== '1') return;
    u.searchParams.delete('live');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  } catch { return; }
  if (maybeScrollLive._done) return;
  maybeScrollLive._done = true;
  const c = $('#live-card');
  if (c && !c.classList.contains('hidden')) setTimeout(() => c.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
}

// Nach Tippen auf die Push-Nachricht (/?postfach=1) direkt ins Postfach führen:
// hinscrollen, kurz hervorheben – und wenn genau eine Unterschrift offen ist,
// gleich den Überblick zum Unterschreiben öffnen. Läuft nur einmal.
function maybeOpenPostfach(bookings) {
  let flag = false;
  try {
    const u = new URL(location.href);
    if (u.searchParams.get('postfach') === '1') {
      flag = true;
      u.searchParams.delete('postfach');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    }
  } catch { /* ignore */ }
  if (!flag || maybeOpenPostfach._done) return;
  maybeOpenPostfach._done = true;
  const card = $('#notif-card');
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  card.classList.add('flash-in');
  setTimeout(() => card.classList.remove('flash-in'), 1600);
  const pending = (bookings || []).filter((b) => b.needs_sign && !b.signed_at);
  if (pending.length === 1) setTimeout(() => openSignModal(pending[0]), 650);
}

// ---------- „Meine Fahrstunden" (Schüler-Historie, tabellarisch) ----------
function addMinHHMM(hhmm, min) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const t = h * 60 + m + (Number(min) || 0);
  return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(((t % 60) + 60) % 60).padStart(2, '0');
}
function lessonTypeLabel(t) { return { ueberland: '🌄 Überland', autobahn: '🛣️ Autobahn', nacht: '🌙 Nachtfahrt' }[t] || 'Normal'; }
// Tatsächlich gefahrene Zeit aus den Zeitstempeln (Start/Ende), lokal formatiert.
function actualTime(l) {
  if (!l || !l.started_at) return null;
  const s = new Date(l.started_at); if (isNaN(s)) return null;
  const e = l.ended_at ? new Date(l.ended_at) : null;
  const hm = (d) => d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  const mins = (e && !isNaN(e)) ? Math.max(0, Math.round((e - s) / 60000)) : null;
  return { begin: hm(s), end: (e && !isNaN(e)) ? hm(e) : null, mins };
}
function fmtDT(date, time) {
  const d = parseD(date);
  return d.toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' }) + (time ? ', ' + time + ' Uhr' : '');
}
// Eintrag-Zeitpunkt (created_at, ISO) als lokales „TT.MM.JJJJ, HH:MM Uhr“.
function fmtEntry(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return fmtDT(String(ts).slice(0, 10));
  return d.toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
}
function renderMyLessons(bookings) {
  const card = $('#lessons-card'); if (!card) return;
  const done = (bookings || []).filter((b) => b.status === 'done')
    .sort((a, z) => (z.date + z.start_time).localeCompare(a.date + a.start_time));
  if (!done.length) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const driven = done.filter((b) => b.attended !== 0);
  const totalMin = driven.reduce((s, b) => s + (b.duration_min || 0), 0);
  const toSign = done.filter((b) => b.needs_sign);
  const rows = done.map((b) => {
    const noshow = b.attended === 0;
    const late = b.late_minutes || 0;
    const entryDate = b.created_at ? String(b.created_at).slice(0, 10) : null;
    const nachgetragen = entryDate && entryDate !== b.date;
    const adkN = lessonAdkParse(b.curriculum).length;
    const sign = b.needs_sign
      ? `<button class="sm ml-sign" data-sign="${b.id}">${t('ml_sign_btn')}</button>`
      : (b.signed_at ? `<span class="pill" style="background:var(--good-bg);color:var(--good)">${t('ml_signed')}</span>` : '');
    return `<tr class="${noshow ? 'ml-noshow' : ''} ${b.needs_sign ? 'ml-tosign' : ''}">
      <td class="ml-when" data-label="${t('ml_dl_when')}">${nachgetragen ? `<span class="ml-drovelbl">${t('ml_driven_on')}</span>` : ''}<strong>${fmtDT(b.date, b.start_time)}</strong>${nachgetragen ? `<span class="ml-entry">${t('ml_entered_on', { date: fmtEntry(b.created_at) })}</span>` : ''}${b.invoice_date ? `<span class="ml-entry ml-inv">${b.invoice_time ? t('ml_on_invoice_time', { date: fmtDT(b.invoice_date), time: b.invoice_time }) : t('ml_on_invoice', { date: fmtDT(b.invoice_date) })}</span>` : ''}${(() => { const a = actualTime(b); return a ? `<span class="ml-entry ml-time">${a.end ? t('ml_actual', { begin: a.begin, end: a.end }) : t('ml_actual_open', { begin: a.begin })}${a.mins != null ? ` · ${a.mins} ${t('min')}` : ''}</span>` : ''; })()}${(b.instr_signature && b.signed_at) ? `<span class="ml-entry ml-both">${t('both_confirmed')}</span>` : ''}${sign ? `<div class="ml-signcell">${sign}</div>` : ''}</td>
      <td data-label="${t('ml_th_end')}">${noshow ? '—' : t('ml_until', { end: addMinHHMM(b.start_time, b.duration_min) })}</td>
      <td data-label="${t('ml_th_dur')}">${noshow ? t('ml_absent') : (b.duration_min + ' ' + t('min'))}</td>
      <td data-label="${t('ml_th_type')}">${noshow ? '' : lessonTypeLabel(b.lesson_type)}</td>
      <td data-label="${t('ml_dl_late')}">${late ? t('ml_late', { late }) : ''}</td>
      <td class="ml-note" data-label="${t('ml_dl_note')}">${b.feedback ? esc(b.feedback) : ''}${adkN ? `<button class="linkbtn ml-adk" data-adk="${b.id}">${t('ml_adk_card', { n: adkN })}</button>` : ''}</td>
    </tr>`;
  }).join('');
  const banner = toSign.length
    ? `<div class="sign-banner">✍️ <div><strong>${t(toSign.length === 1 ? 'ml_banner_one' : 'ml_banner_many', { n: toSign.length })}</strong><br><span>${t('ml_banner_sub')}</span></div><button class="sm" id="ml-sign-first">${t('ml_banner_btn')}</button></div>`
    : '';
  card.innerHTML = `<h2>${t('ml_title')}</h2>
    <p class="hint">${t('ml_hint')}</p>
    ${banner}
    ${statStripHtml(myStats)}
    ${adkNeedWorkHtml(myAdk)}
    <div class="inline" style="margin:.4rem 0 .6rem;flex-wrap:wrap">
      <button class="sec sm" id="ml-adk-all">${t('ml_overview_btn')}</button>
      <button class="sec sm" id="ml-print" style="margin-left:auto">${t('ml_print_btn')}</button>
    </div>
    <div class="ml-wrap"><table class="ml-table">
      <thead><tr><th>${t('ml_th_when')}</th><th>${t('ml_th_end')}</th><th>${t('ml_th_dur')}</th><th>${t('ml_th_type')}</th><th>${t('ml_th_late')}</th><th>${t('ml_th_note')}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  const pb = $('#ml-print'); if (pb) pb.onclick = () => printLessonProof(state.user?.name || 'Fahrschüler', done, myAdk, myStats);
  const ab = $('#ml-adk-all'); if (ab) ab.onclick = () => openMyTraining();
  card.querySelectorAll('[data-sign]').forEach((btn) => btn.onclick = () => {
    const bk = done.find((x) => x.id === Number(btn.dataset.sign)); if (bk) openSignModal(bk);
  });
  card.querySelectorAll('[data-adk]').forEach((btn) => btn.onclick = () => {
    const bk = done.find((x) => x.id === Number(btn.dataset.adk)); if (bk) openLessonAdk(bk, state.user?.name || 'Fahrschüler');
  });
  const sf = $('#ml-sign-first'); if (sf) sf.onclick = () => openSignModal(toSign[0]);
}

// Unterschrift-Fenster: der Fahrschüler bestätigt & unterschreibt eine nachgetragene Fahrstunde.
// Wiederverwendbares Unterschriften-Feld (Finger/Stift malen) auf einem <canvas>.
function attachSignPad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawn = false, drawing = false, last = null;
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, r.width, r.height);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  };
  setTimeout(fit, 30);
  const pos = (e) => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  const start = (e) => { e.preventDefault(); drawing = true; last = pos(e); };
  const move = (e) => { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; drawn = true; };
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerdown', start); canvas.addEventListener('pointermove', move); window.addEventListener('pointerup', end);
  return { drawn: () => drawn, url: () => { try { return canvas.toDataURL('image/png'); } catch { return ''; } }, clear: () => { fit(); drawn = false; } };
}

function openSignModal(l) {
  if (!l) return;
  const art = (l.lesson_type && l.lesson_type !== 'normal') ? ' · ' + lessonTypeLabel(l.lesson_type) : '';
  const adk = lessonAdkParse(l.curriculum);
  const at = actualTime(l);
  modal(`<h3>${t('sign_title')}</h3>
    <p class="hint">${t('sign_hint')}</p>
    <div class="sign-lesson">📅 <strong>${fmtDT(l.date, l.start_time)}</strong> · ${l.duration_min} ${t('min')}${art}${l.late_minutes ? ` · ${t('ml_late', { late: l.late_minutes })}` : ''}${l.feedback ? `<div class="sign-note">„${esc(l.feedback)}"</div>` : ''}</div>
    ${at ? `<div class="sign-time">🕒 <strong>${t('actual_time')}:</strong> ${at.begin}${at.end ? '–' + at.end : ''}${t('oclock')}${at.mins != null ? ` · ${at.mins} ${t('min')}` : ''}</div>` : ''}
    ${adk.length ? `<div class="sign-adk"><div class="sign-adk-h">${t('sign_practiced')}</div>${adk.map((a) => `<div class="sign-adk-i">${currStatusMeta(a.s).dot} ${esc(a.label)}</div>`).join('')}</div>` : ''}
    ${l.instr_signature ? `<div class="sign-fl">${t('sign_fl_signed')} <img src="${l.instr_signature}" class="sign-fl-img" alt="Unterschrift Fahrlehrer"></div>` : ''}
    <label class="sign-lb">${t('sign_your')} <span class="muted">${t('sign_draw')}</span></label>
    <div class="sign-pad-wrap">
      <canvas id="sign-pad" class="sign-pad"></canvas>
      <button type="button" class="ghost sm sign-clear" id="sign-clear">${t('clear')}</button>
    </div>
    <label class="ck-line" style="justify-content:flex-start"><input type="checkbox" id="sign-ok"> ${at ? t('sign_confirm_time') : t('sign_confirm_ck')}</label>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">${t('gate_later')}</button><button id="sign-go" disabled>${t('sign_go')}</button></div>`);
  const canvas = $('#sign-pad');
  const ctx = canvas.getContext('2d');
  let drawn = false, drawing = false, last = null;
  // Auflösung an Anzeige anpassen (scharfe Linie)
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, r.width, r.height);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  };
  setTimeout(fit, 30);
  const pos = (e) => { const r = canvas.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  const start = (e) => { e.preventDefault(); drawing = true; last = pos(e); };
  const move = (e) => { if (!drawing) return; e.preventDefault(); const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; drawn = true; };
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerdown', start); canvas.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  $('#sign-clear').onclick = () => { fit(); drawn = false; };
  const ok = $('#sign-ok'), go = $('#sign-go');
  ok.onchange = () => { go.disabled = !ok.checked; };
  go.onclick = async () => {
    go.disabled = true; go.textContent = t('saving');
    const body = {};
    if (drawn) { try { body.signature = canvas.toDataURL('image/png'); } catch {} }
    try {
      await api('/api/my/bookings/' + l.id + '/sign', { method: 'POST', body });
      closeModal(); toast(t('toast_signed'), 'ok'); syncStudent();
    } catch (e) { go.disabled = false; go.textContent = t('sign_go'); toast(e.message, 'err'); }
  };
}

// ---------- Nachrichten an den Fahrlehrer (Schüler) ----------
function msgTime(iso) {
  try { return new Date(iso).toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}
async function renderStudentMessages() {
  const card = $('#messages-card'); if (!card) return;
  let data = {};
  try { data = await api('/api/my/messages'); } catch { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const msgs = data.messages || [];
  const who = data.instructorName || t('role_instructor');
  const bubbles = msgs.length
    ? msgs.map((m) => `<div class="msg ${m.sender === 'student' ? 'me' : 'them'}">
        <div class="msg-b">${esc(m.body)}</div><div class="msg-t">${m.sender === 'student' ? t('msg_you') : esc(who)} · ${msgTime(m.created_at)}</div>
      </div>`).join('')
    : `<p class="hint">${t('msg_none')}</p>`;
  card.innerHTML = `<h2>${t('msg_title')} <span class="sub">${t('msg_to', { who: esc(who) })}</span></h2>
    <div class="msg-list" id="msg-list">${bubbles}</div>
    <div class="msg-compose">
      <textarea id="msg-in" rows="2" maxlength="2000" placeholder="${t('msg_placeholder')}"></textarea>
      <button class="sm" id="msg-send">${t('send')}</button>
    </div>`;
  const list = $('#msg-list'); if (list) list.scrollTop = list.scrollHeight;
  const send = async () => {
    const body = $('#msg-in').value.trim(); if (!body) return;
    $('#msg-send').disabled = true;
    try { await api('/api/my/messages', { method: 'POST', body: { body } }); $('#msg-in').value = ''; await renderStudentMessages(); }
    catch (e) { toast(e.message, 'err'); }
    finally { const b = $('#msg-send'); if (b) b.disabled = false; }
  };
  $('#msg-send').onclick = send;
  $('#msg-in').onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };
}

// ---------- Bewertung abgeben (Schüler) ----------
const REV_STARS = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
// Kategorien fürs geführte „Durchbewerten" (Reihenfolge = Ablauf). Schlüssel
// müssen mit REVIEW_CATS in server.js übereinstimmen.
const REVIEW_CATS = [
  { k: 'geduld',     icon: '🧘', q: 'Wie geduldig war dein Fahrlehrer?',            label: 'Geduld & Ruhe',        hint: 'Ruhe bewahrt, auch wenn’s mal hakt?' },
  { k: 'erklaerung', icon: '💡', q: 'Wie verständlich waren die Erklärungen?',      label: 'Erklärungen',          hint: 'Alles gut erklärt, sodass es Klick gemacht hat?' },
  { k: 'puenktlich', icon: '⏰', q: 'Wie zuverlässig & pünktlich war er?',          label: 'Zuverlässigkeit',      hint: 'Termine gehalten, pünktlich da?' },
  { k: 'freundlich', icon: '😊', q: 'Wie freundlich war der Umgang?',               label: 'Freundlichkeit',       hint: 'Nett, motivierend, auf Augenhöhe?' },
  { k: 'sicher',     icon: '🚗', q: 'Wie sicher hast du dich beim Fahren gefühlt?', label: 'Sicheres Gefühl',      hint: 'Gut aufgehoben und sicher unterwegs?' },
];
const revCatLabel = (k) => t('rc_' + k + '_label');
const revCatIcon = (k) => (REVIEW_CATS.find((c) => c.k === k) || {}).icon || '⭐';
function revNamePreview(mode) {
  const nm = (state.user?.name || '').trim();
  if (mode === 'anon' || !nm) return mode === 'anon' ? t('rw_name_anon') : t('rw_anon_student');
  if (mode === 'full') return nm;
  const parts = nm.split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
}
async function renderReviewCard(progress) {
  const card = $('#review-card'); if (!card) return;
  let data = {};
  try { data = await api('/api/my/review'); } catch { card.classList.add('hidden'); return; }
  const r = data.review;
  const passed = data.passed;
  card.classList.remove('hidden');
  const modeLabel = { full: t('rev_mode_full'), initials: t('rev_mode_initials'), anon: t('rev_mode_anon') };
  const head = passed
    ? `<div class="rev-pass">🎉 <div><strong>${t('rev_passed_t')}</strong><br><span>${t('rev_passed_s')}</span></div></div>`
    : `<p class="hint">${t('rev_invite')}</p>`;
  const chips = r && r.ratings
    ? `<div class="rev-mine-chips">${REVIEW_CATS.filter((c) => r.ratings[c.k]).map((c) => `<span class="rev-chip">${c.icon} ${esc(t('rc_' + c.k + '_label'))} <b>${r.ratings[c.k]}★</b></span>`).join('')}</div>`
    : '';
  const body = r
    ? `<div class="rev-mine">
        <div class="rev-stars">${REV_STARS(r.rating)}</div>
        ${chips}
        <div class="rev-text">„${esc(r.text)}"</div>
        <div class="hint" style="margin-top:.4rem">${t('rev_shown', { mode: modeLabel[r.author_mode] || '' })}${r.show_photo ? t('rev_with_photo') : ''}${r.published ? '' : t('rev_pending')}</div>
        ${r.reply ? `<div class="rev-reply">↩︎ <em>${esc(r.reply)}</em></div>` : ''}
        <button class="sec sm" id="rev-edit" style="margin-top:.6rem">${t('rev_edit')}</button>
      </div>`
    : `<button id="rev-new">${t('rev_new')}</button>`;
  card.innerHTML = `<h2>${t('rev_title')}</h2>${head}${body}`;
  const open = () => openReviewModal(r, !!data.hasPhoto);
  const n = $('#rev-new'); if (n) n.onclick = open;
  const e = $('#rev-edit'); if (e) e.onclick = open;
}
// Geführter Bewertungs-Assistent ("Durchbewerten"): kurzer Erklärungs-Rundgang,
// dann je eine freundliche Frage pro Kategorie mit großen Sternen, danach Worte,
// Foto (direkt hochladbar) und Anzeige-Name – zum Schluss eine Übersicht.
// Selbsterklärend, Schritt für Schritt, mit Fortschritt und Zurück/Weiter.
function openReviewModal(existing, hasPhoto) {
  const S = {
    step: 0,
    ratings: Object.assign({}, existing && existing.ratings ? existing.ratings : {}),
    text: (existing && existing.text) || '',
    mode: (existing && existing.author_mode) || 'initials',
    showPhoto: !!(existing && existing.show_photo),
    hasPhoto: !!hasPhoto,     // Profilfoto bereits vorhanden?
    photoData: null,          // neu ausgewähltes Foto (data-URL)
  };
  const steps = ['intro', ...REVIEW_CATS.map((c) => 'cat:' + c.k), 'text', 'photo', 'name', 'summary'];
  const catCount = REVIEW_CATS.length;
  const go = (d) => { S.step = Math.max(0, Math.min(steps.length - 1, S.step + d)); draw(); };
  const answered = () => REVIEW_CATS.filter((c) => S.ratings[c.k]).length;
  const overall = () => { const v = REVIEW_CATS.map((c) => S.ratings[c.k]).filter(Boolean); return v.length ? Math.round(v.reduce((s, x) => s + x, 0) / v.length) : 0; };

  function bigStars(current, onPick) {
    const wrap = document.createElement('div');
    wrap.className = 'rev-bigstars';
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rev-bigstar' + (i <= current ? ' on' : '');
      b.textContent = '★'; b.dataset.v = i;
      b.onclick = () => { onPick(i); b.blur(); };
      wrap.appendChild(b);
    }
    return wrap;
  }

  async function submit() {
    if ((S.text || '').trim().length < 5) { S.step = steps.indexOf('text'); draw(); toast(t('rw_need_text'), 'err'); return; }
    const btn = $('#rev-go'); if (btn) { btn.disabled = true; btn.textContent = t('rw_sending'); }
    const body = {
      rating: overall() || undefined,
      ratings: S.ratings,
      text: S.text.trim(),
      author_mode: S.mode,
      show_photo: S.mode !== 'anon' ? S.showPhoto : false,
    };
    if (S.photoData) body.photo = S.photoData;
    try { await api('/api/my/review', { method: 'POST', body }); closeModal(); toast(t('rw_thanks'), 'ok'); syncStudent(); }
    catch (e) { if (btn) { btn.disabled = false; btn.textContent = t('rw_submit'); } toast(e.message, 'err'); }
  }

  function draw() {
    const kind = steps[S.step];
    let html = '';
    // Fortschritt (nur während der Kategorie-Fragen)
    if (kind.startsWith('cat:')) {
      const idx = REVIEW_CATS.findIndex((c) => 'cat:' + c.k === kind);
      html += `<div class="rev-prog"><div class="rev-prog-bar" style="width:${Math.round(((idx + 1) / catCount) * 100)}%"></div></div>
        <div class="rev-prog-tx">${t('rw_qn', { i: idx + 1, n: catCount })}</div>`;
    }

    if (kind === 'intro') {
      html += `<div class="rev-intro">
        <div class="rev-intro-emoji">⭐</div>
        <h3>${existing ? t('rev_edit') : t('rw_intro_new')}</h3>
        <p>${t('rw_intro_p')}</p>
        <ul class="rev-intro-list">
          <li>${t('rw_intro_l1')}</li>
          <li>${t('rw_intro_l2')}</li>
          <li>${t('rw_intro_l3')}</li>
        </ul>
        <p class="rev-intro-why">${t('rw_intro_why')}</p>
      </div>
      <div class="actions">
        <button class="sec" onclick="window.__closeModal()">${t('gate_later')}</button>
        <button id="rev-go">${t('rw_start')}</button>
      </div>`;
    } else if (kind.startsWith('cat:')) {
      const c = REVIEW_CATS.find((x) => 'cat:' + x.k === kind);
      const cur = S.ratings[c.k] || 0;
      html += `<div class="rev-catq">
        <div class="rev-cat-ic">${c.icon}</div>
        <h3>${esc(t('rc_' + c.k + '_q'))}</h3>
        <p class="rev-cat-hint">${esc(t('rc_' + c.k + '_hint'))}</p>
        <div id="rev-stars-mount"></div>
        <div class="rev-cat-val" id="rev-cat-val">${cur ? '★'.repeat(cur) + ' – ' + revRatingWord(cur) : t('rw_tap_star')}</div>
      </div>
      <div class="actions">
        <button class="sec" id="rev-back">${t('rw_back')}</button>
        ${cur ? `<button id="rev-go">${t('rw_next')}</button>` : `<button class="ghost" id="rev-skip">${t('tour_skip')}</button>`}
      </div>`;
    } else if (kind === 'text') {
      html += `<div class="rev-step">
        <h3>${t('rw_words_t')}</h3>
        <p class="hint">${t('rw_words_p')}</p>
        <textarea id="rev-text" rows="5" maxlength="800" placeholder="${t('rw_words_ph')}" style="resize:vertical">${esc(S.text)}</textarea>
        <div class="rev-count"><span id="rev-count">${(S.text || '').length}</span>/800</div>
      </div>
      <div class="actions">
        <button class="sec" id="rev-back">← Zurück</button>
        <button id="rev-go">Weiter →</button>
      </div>`;
    } else if (kind === 'photo') {
      const prev = S.photoData
        ? `<img src="${S.photoData}" alt="Vorschau">`
        : (S.hasPhoto ? `<img src="/api/my/photo?t=${Date.now()}" alt="Dein Foto">` : `<span class="rev-photo-ph">🙂</span>`);
      const have = S.photoData || S.hasPhoto;
      html += `<div class="rev-step rev-photo-step">
        <h3>${t('rw_photo_t')}</h3>
        <p class="hint">${t('rw_photo_p')}</p>
        <div class="rev-photo-prev" id="rev-photo-prev">${prev}</div>
        <input type="file" id="rev-file" accept="image/*" hidden>
        <div class="rev-photo-btns">
          <button class="sec sm" id="rev-pick">${have ? t('rw_photo_other') : t('rw_photo_pick')}</button>
          ${have ? `<button class="ghost sm" id="rev-photo-clear">${t('rw_photo_none')}</button>` : ''}
        </div>
        ${have ? `<label class="ck-line" id="rev-show-line"><input type="checkbox" id="rev-show" ${S.showPhoto ? 'checked' : ''}> ${t('rw_photo_show')}</label>` : ''}
      </div>
      <div class="actions">
        <button class="sec" id="rev-back">← Zurück</button>
        <button id="rev-go">Weiter →</button>
      </div>`;
    } else if (kind === 'name') {
      const card = (v, title, sub) => `<button type="button" class="rev-namecard ${S.mode === v ? 'on' : ''}" data-mode="${v}">
        <div class="rev-nc-t">${title}</div><div class="rev-nc-s">${sub}</div></button>`;
      html += `<div class="rev-step">
        <h3>${t('rw_name_t')}</h3>
        <p class="hint">${t('rw_name_p')}</p>
        <div class="rev-namecards">
          ${card('full', t('rw_name_full'), esc(revNamePreview('full')))}
          ${card('initials', t('rw_name_init'), esc(revNamePreview('initials')))}
          ${card('anon', t('rw_name_anon'), t('rw_anon_student'))}
        </div>
        ${S.mode === 'anon' && (S.photoData || S.hasPhoto) ? `<p class="hint">${t('rw_name_anon_nophoto')}</p>` : ''}
      </div>
      <div class="actions">
        <button class="sec" id="rev-back">← Zurück</button>
        <button id="rev-go">Weiter →</button>
      </div>`;
    } else if (kind === 'summary') {
      const ov = overall();
      const chips = REVIEW_CATS.filter((c) => S.ratings[c.k]).map((c) =>
        `<span class="rev-chip">${c.icon} ${esc(t('rc_' + c.k + '_label'))} <b>${S.ratings[c.k]}★</b></span>`).join('') || `<span class="hint">${t('rw_sum_nochips')}</span>`;
      const showPic = S.mode !== 'anon' && S.showPhoto && (S.photoData || S.hasPhoto);
      const pic = showPic ? (S.photoData ? `<img src="${S.photoData}" alt="">` : `<img src="/api/my/photo?t=${Date.now()}" alt="">`) : `<span class="rev-photo-ph sm">🙂</span>`;
      html += `<div class="rev-step rev-summary">
        <h3>${t('rw_sum_t')}</h3>
        <div class="rev-sum-head">
          <div class="rev-sum-stars">${ov ? '★'.repeat(ov) + '☆'.repeat(5 - ov) : '—'}</div>
          <div class="rev-sum-name">${pic}<span>${esc(revNamePreview(S.mode))}</span></div>
        </div>
        <div class="rev-sum-chips">${chips}</div>
        <div class="rev-sum-text">„${esc(S.text.trim() || '…')}"</div>
      </div>
      <div class="actions">
        <button class="sec" id="rev-back">${t('rw_back')}</button>
        <button id="rev-go">${t('rw_submit')}</button>
      </div>`;
    }

    modal(`<div class="rev-wiz">${html}</div>`);

    // Kategorie-Sterne montieren
    if (kind.startsWith('cat:')) {
      const c = REVIEW_CATS.find((x) => 'cat:' + x.k === kind);
      const mount = $('#rev-stars-mount');
      if (mount) mount.appendChild(bigStars(S.ratings[c.k] || 0, (v) => {
        S.ratings[c.k] = v;
        // alle Sterne bis v aufleuchten lassen
        mount.querySelectorAll('.rev-bigstar').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) <= v));
        const lbl = $('#rev-cat-val'); if (lbl) lbl.textContent = '★'.repeat(v) + ' – ' + revRatingWord(v);
        // sanft automatisch weiter (Frage-Antwort-Gefühl)
        setTimeout(() => { if (S.step < steps.indexOf('summary')) go(1); }, 340);
      }));
      const sk = $('#rev-skip'); if (sk) sk.onclick = () => go(1);
    }
    // Text
    const ta = $('#rev-text');
    if (ta) { ta.oninput = () => { S.text = ta.value; const c = $('#rev-count'); if (c) c.textContent = ta.value.length; }; ta.focus(); }
    // Foto
    const pick = $('#rev-pick'), file = $('#rev-file');
    if (pick && file) {
      pick.onclick = () => file.click();
      file.onchange = async () => {
        const f = file.files && file.files[0]; if (!f) return;
        try { S.photoData = await fileToResizedDataUrl(f, 400, 0.82); S.showPhoto = true; draw(); }
        catch (e) { toast(e.message, 'err'); }
      };
    }
    const clr = $('#rev-photo-clear'); if (clr) clr.onclick = () => { S.photoData = null; S.hasPhoto = false; S.showPhoto = false; draw(); };
    const show = $('#rev-show'); if (show) show.onchange = () => { S.showPhoto = show.checked; };
    // Anzeige-Name
    document.querySelectorAll('.rev-namecard').forEach((b) => b.onclick = () => { S.mode = b.dataset.mode; draw(); });
    // Navigation
    const back = $('#rev-back'); if (back) back.onclick = () => go(-1);
    const goBtn = $('#rev-go');
    if (goBtn) goBtn.onclick = () => { if (steps[S.step] === 'summary') submit(); else go(1); };
  }

  draw();
}
function revRatingWord(n) { return n >= 1 && n <= 5 ? t('rw_' + n) : ''; }
// Druckbarer Fahrstunden-Nachweis (Tabelle + Unterschriften) + optional ADK-Zusammenfassung
function printLessonProof(name, done, adk, stats) {
  const school = esc(state.settings?.instructor_name || 'Fahrschule');
  const today = new Date().toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const list = (done || []).slice().sort((a, z) => (a.date + a.start_time).localeCompare(z.date + z.start_time));
  const driven = list.filter((b) => b.attended !== 0);
  const totalMin = driven.reduce((s, b) => s + (b.duration_min || 0), 0);
  const rows = list.map((b, i) => {
    const noshow = b.attended === 0;
    const late = b.late_minutes || 0;
    const entryDate = b.created_at ? String(b.created_at).slice(0, 10) : null;
    const nachgetragen = entryDate && entryDate !== b.date;
    const artL = { ueberland: 'Überland', autobahn: 'Autobahn', nacht: 'Nachtfahrt' }[b.lesson_type] || 'Normal';
    return `<tr>
      <td class="c">${i + 1}</td>
      <td>${nachgetragen ? '<span class="entry-lbl">gefahren am</span> ' : ''}${fmtDT(b.date, b.start_time)}${(() => { const a = actualTime(b); return a ? `<br><span class="entry">tatsächlich ${a.begin}${a.end ? '–' + a.end : ''} Uhr${a.mins != null ? ' · ' + a.mins + ' Min' : ''}</span>` : ''; })()}${nachgetragen ? `<br><span class="entry">vom Fahrlehrer eingetragen am ${fmtEntry(b.created_at)}</span>` : ''}</td>
      <td class="c inv-col">${b.invoice_date ? `<strong>${fmtDT(b.invoice_date)}</strong>${b.invoice_time ? '<br>' + b.invoice_time + ' Uhr' : ''}` : '<span class="wg">wie gefahren</span>'}</td>
      <td class="c">${noshow ? '—' : addMinHHMM(b.start_time, b.duration_min)}</td>
      <td class="c">${noshow ? 'nicht erschienen' : b.duration_min + ' Min'}</td>
      <td class="c">${noshow ? '' : artL}</td>
      <td>${late ? `Fahrschüler ${late} Min zu spät` : ''}</td>
      <td>${esc(b.feedback || '')}</td>
      <td class="c sig-col">
        ${b.instr_signature ? `<div class="sig2"><span class="sig2-l">FL</span><img class="sig-img" src="${b.instr_signature}" alt="Unterschrift Fahrlehrer"></div>` : ''}
        ${b.signature ? `<div class="sig2"><span class="sig2-l">FS</span><img class="sig-img" src="${b.signature}" alt="Unterschrift Fahrschüler"></div>` : (b.signed_at ? `<div class="sig2"><span class="sig2-l">FS</span><span class="sig-ok">✔</span></div>` : '')}
      </td>
    </tr>`;
  }).join('');
  const addr = esc(state.settings?.school_label || '');
  // Optionale zweite Seite: Ausbildungsstand (Häufigkeit je Aufgabe + letzter Stand)
  const statLine = stats ? `${fmtUnits(stats.units)} Fahrstunden (à ${stats.unit || 80} Min) · ${fmtUnits(stats.schalt.units)} Schalt · ${fmtUnits(stats.automatik.units)} Automatik · ${fmtUnits(stats.hours)} h gefahren` : '';
  const adkSection = (adk && adk.distinct) ? `
    <div class="adk-page">
      <h2 class="adk-h">Ausbildungsstand – was wurde geübt (${adk.distinct} Aufgaben)</h2>
      ${statLine ? `<div class="sum2">${statLine}</div>` : ''}
      <table class="adk-t"><thead><tr><th>Aufgabe</th><th class="c">Termine</th><th class="c">Stand</th></tr></thead><tbody>
      ${CURRICULUM.map((sec) => {
        const its = sec.items.map((it, i) => {
          const k = currKey(sec.key, i); const agg = adk.items[k]; if (!agg) return '';
          const m = agg.lastStatus ? currStatusMeta(agg.lastStatus) : null;
          const days = Object.entries(agg.days || {}).sort((a, z) => a[0].localeCompare(z[0])).map(([d, n]) => `${fmtDMY2(d)}${n > 1 ? ` (${n}×)` : ''}`).join(', ');
          return `<tr><td>${esc(it)}${days ? `<div class="adk-days">${days}</div>` : ''}</td><td class="c">${agg.count}×</td><td class="c">${m ? m.tiny : ''}</td></tr>`;
        }).filter(Boolean).join('');
        return its ? `<tr class="adk-sec"><td colspan="3">${esc(sec.title)}</td></tr>${its}` : '';
      }).filter(Boolean).join('')}
      </tbody></table>
      ${adk.needWork && adk.needWork.length ? `<div class="adk-red"><strong>Das üben wir noch:</strong> ${adk.needWork.map(currLabel).filter(Boolean).map(esc).join(' · ')}</div>` : ''}
    </div>` : '';
  const LOGO = `<svg width="48" height="48" viewBox="-8 -8 116 116" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gc" x1="6" y1="96" x2="92" y2="8" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e9530a"/><stop offset=".32" stop-color="#f6890d"/><stop offset=".62" stop-color="#ffc21a"/><stop offset=".85" stop-color="#ffe27a"/><stop offset="1" stop-color="#f7c40f"/></linearGradient></defs><path d="M87.6 36.3 A40 40 0 1 1 64.98 12.9" stroke="url(#gc)" stroke-width="14" stroke-linecap="round"/><circle cx="50" cy="50" r="10" stroke="url(#gc)" stroke-width="10"/><g stroke="url(#gc)" stroke-width="13" stroke-linecap="round"><line x1="35" y1="50" x2="17" y2="50"/><line x1="65" y1="50" x2="83" y2="50"/><line x1="50" y1="65" x2="50" y2="83"/></g><polygon points="62.1,44.2 78.9,13 52.7,36.8" fill="url(#gc)"/><g stroke="url(#gc)" stroke-width="6" stroke-linecap="round"><line x1="73.9" y1="11.8" x2="78.1" y2="5.1"/><line x1="82.4" y1="18.7" x2="88.1" y2="13.2"/><line x1="89" y1="27.5" x2="95.9" y2="23.5"/></g></svg>`;
  const doc = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Fahrstunden-Nachweis – ${esc(name)}</title>
    <style>
      @page{size:A4 landscape;margin:12mm 14mm}
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;margin:0;padding:20px 24px}
      .head{display:flex;align-items:center;gap:16px;border-bottom:3px solid #f2a01a;padding-bottom:12px;margin-bottom:14px}
      .brand{display:flex;align-items:center;gap:12px;flex:1}
      .brand .school{font-size:18px;font-weight:800;line-height:1.15}
      .brand .addr{font-size:11px;color:#666;margin-top:2px}
      .titleblock{text-align:right}
      .titleblock h1{font-size:21px;margin:0;color:#111;letter-spacing:.01em}
      .titleblock .stud{font-size:14px;margin-top:3px;font-weight:600}
      .titleblock .meta{font-size:11px;color:#666;margin-top:2px}
      .sum{font-size:13px;margin:2px 0 12px;color:#333}.sum b{color:#111}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}
      th{background:#faf3e2;color:#7a5300;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em}
      tbody tr:nth-child(even){background:#fbfaf7}
      td.c{text-align:center;white-space:nowrap} .entry{font-size:10px;color:#777}
      .entry-lbl{font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:#999;font-weight:700}
      td.inv-col{color:#b26a00;font-weight:600} td.inv-col .wg{color:#aaa;font-weight:400;font-style:italic}
      td.sig-col{text-align:center;vertical-align:middle}
      .sig-img{height:30px;max-width:130px;object-fit:contain;display:block;margin:0 auto}
      .sig-ok{color:#0a7d3b;font-weight:700;font-size:14px}
      .sig2{display:flex;align-items:center;gap:4px;justify-content:center;margin:1px 0}
      .sig2-l{font-size:8px;font-weight:700;color:#999;width:16px;text-align:right}
      tr{break-inside:avoid}
      .sign{margin-top:32px;display:flex;gap:64px}
      .sign div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:11px;color:#444}
      .foot{margin-top:14px;font-size:10px;color:#777;border-top:1px solid #ddd;padding-top:8px;line-height:1.55}
      .adk-page{page-break-before:always;padding-top:4px}
      .adk-h{font-size:16px;margin:0 0 6px;color:#111;border-bottom:2px solid #f2a01a;padding-bottom:6px}
      .sum2{font-size:12px;color:#333;margin:6px 0 10px;font-weight:600}
      .adk-t{width:100%;border-collapse:collapse;font-size:11.5px}
      .adk-t th,.adk-t td{border:1px solid #ccc;padding:4px 8px;text-align:left;vertical-align:top}
      .adk-t th{background:#faf3e2;color:#7a5300;font-size:10px;text-transform:uppercase}
      .adk-t td.c{text-align:center;white-space:nowrap}
      .adk-t tr.adk-sec td{background:#f3f3f0;font-weight:700;color:#333}
      .adk-days{font-size:9.5px;color:#888;margin-top:2px}
      .adk-red{margin-top:12px;font-size:11.5px;padding:8px 10px;border:1px solid #e0a;border-left:4px solid #d0306a;border-radius:6px;background:#fdf0f5;color:#8a1c46}
    </style></head><body>
    <div class="head">
      <div class="brand">${LOGO}<div><div class="school">${school}</div>${addr ? `<div class="addr">${addr}</div>` : ''}</div></div>
      <div class="titleblock"><h1>Fahrstunden-Nachweis</h1><div class="stud">${esc(name)}</div><div class="meta">Stand: ${today}</div></div>
    </div>
    <div class="sum"><b>${driven.length} gefahrene Fahrstunden · ${hLabel(totalMin)} gesamt</b></div>
    <table><thead><tr><th>#</th><th>Datum &amp; Uhrzeit (gefahren)</th><th>Auf der Rechnung</th><th>Ende</th><th>Dauer</th><th>Art</th><th>Verspätung</th><th>Vermerk</th><th>Unterschrift</th></tr></thead>
      <tbody>${rows}</tbody></table>
    <div class="sign"><div>Unterschrift Fahrlehrer</div><div>Unterschrift Fahrschüler</div></div>
    ${adkSection}
    <div class="foot">Erstellt mit ginoco · ${today}. Maßgeblich ist stets das <b>Fahrdatum</b> (Datum &amp; Uhrzeit, gefahren). „Vom Fahrlehrer eingetragen am …" nennt nur, wann die Stunde ins System eingetragen wurde – am Fahrdatum ändert das nichts. „Auf der Rechnung" = Datum/Uhrzeit, unter dem die Stunde abgerechnet wird (kann vom Fahrdatum abweichen, z. B. wegen der 495-Minuten-Tagesgrenze); „wie gefahren" = identisch zum Fahrdatum. „Fahrschüler … Min zu spät" = der Fahrschüler ist verspätet zur Fahrstunde erschienen. Mit ✔ markierte Stunden hat der Fahrschüler in der App bestätigt.</div>
    <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Bitte Pop-ups erlauben, um den Nachweis zu drucken.', 'err'); return; }
  w.document.open(); w.document.write(doc); w.document.close();
}

// Monatskalender mit Ampel-Tagen: grün = frei, rot = ausgebucht, grau = zu/vorbei.
async function renderBookingCalendar() {
  const el = $('#book-cal'); if (!el) return;
  if (!state.calMonth) state.calMonth = firstOfMonth(state.date);
  const first = parseD(state.calMonth);
  const y = first.getFullYear(), mo = first.getMonth();
  const fromD = ymd(new Date(y, mo, 1)), toD = ymd(new Date(y, mo + 1, 0));
  let days = [];
  try { days = (await api(`/api/availability?from=${fromD}&to=${toD}`)).days; } catch { return; }
  const map = {}; days.forEach((d) => map[d.date] = d);
  const startDow = isoDow(fromD), inMonth = new Date(y, mo + 1, 0).getDate(), today = todayStr();
  let cells = '';
  for (let i = 1; i < startDow; i++) cells += '<span class="bcal-empty"></span>';
  for (let dd = 1; dd <= inMonth; dd++) {
    const ds = ymd(new Date(y, mo, dd));
    const info = map[ds] || { state: 'closed', free: 0 };
    const clickable = ['free', 'full', 'toofar'].includes(info.state);
    const cls = ['bcal-day', info.state, ds === state.date ? 'sel' : '', ds === today ? 'today' : ''].filter(Boolean).join(' ');
    cells += `<button class="${cls}" data-day="${ds}" ${clickable ? '' : 'disabled'}>
      <span class="bc-num">${dd}</span>${info.state === 'free' ? `<span class="bc-free">${info.free} frei</span>` : ''}</button>`;
  }
  el.innerHTML = `<div class="bcal">
    <div class="bcal-head">
      <button class="sec sm" data-cmo="-1">‹</button><strong>${MON_LONG[mo]} ${y}</strong><button class="sec sm" data-cmo="1">›</button>
    </div>
    <div class="bcal-grid bcal-wd">${WD.map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="bcal-grid">${cells}</div>
    <div class="bcal-legend"><span><i class="lg free"></i> frei</span><span><i class="lg full"></i> ausgebucht</span><span><i class="lg off"></i> zu / vorbei</span></div>
  </div>`;
  el.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => { state.date = b.dataset.day; syncStudent(); const s = $('#slots'); if (s) s.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  el.querySelectorAll('[data-cmo]').forEach((b) => b.onclick = () => { state.calMonth = addMonths(state.calMonth, Number(b.dataset.cmo)); renderBookingCalendar(); });
}

function greetWord() {
  const h = new Date().getHours();
  if (h < 5) return t('greet_welcome');
  if (h < 11) return t('greet_morning');
  if (h < 18) return t('greet_day');
  return t('greet_evening');
}
function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

// Naechsten freien Termin vom Server holen und dorthin springen.
async function jumpToNextFree(fromDate) {
  toast('Suche nächsten freien Termin …');
  let next = null;
  try { next = (await api('/api/next-free' + (fromDate ? '?from=' + fromDate : ''))).next; } catch (e) { toast(e.message, 'err'); return; }
  if (!next) { toast('In den nächsten Tagen ist leider kein Termin frei. Schau später nochmal.', 'err'); return; }
  state.date = next.date;
  syncStudent();
  const el = document.getElementById('slots');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast(`Freier Termin: ${WD_LONG[isoDow(next.date) - 1]}, ${fmtShort(next.date)} ✓`, 'ok');
}
window.__jumpNextFree = jumpToNextFree;

function renderWeekCard(wi, bookings, progress) {
  const allUpcoming = bookings.filter((b) => b.date >= todayStr() && b.status !== 'done')
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const upcoming = bookings.filter((b) => b.date >= todayStr()).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const remainColor = wi.remaining > 0 ? 'good' : 'bad';
  const next = allUpcoming.find((b) => b.status === 'booked');
  const gname = firstName(state.user?.name);
  const reservedCount = upcoming.filter((b) => b.status === 'booked' && b.confirmed === 0).length;
  $('#week-card').innerHTML = `
    <div class="greet-big">${greetWord()}${gname ? ', <strong>' + esc(gname) + '</strong>' : ''} 👋</div>
    ${next ? `<div class="next-hero">
      <div class="nh-ic">🚗</div>
      <div class="nh-body">
        <div class="nh-label">${t('wk_next_label')}</div>
        <div class="nh-when">${WD_LONG[isoDow(next.date) - 1]}, ${fmtShort(next.date)}</div>
        <div class="nh-time">🕐 ${next.start_time}${t('oclock')} · ${next.duration_min} ${t('min')}${next.meet_label ? ` · 📍 ${esc(next.meet_label)}` : ''}</div>
      </div>
      <div class="nh-count">${countdownLabel(next.date, next.start_time)}</div>
    </div>` : ''}
    <h2>${t('wk_title')} <span class="sub">${t('wk_sub', { from: fmtShort(wi.from), to: fmtShort(wi.to) })}</span></h2>
    ${reservedCount ? `<div class="reserve-note">${t(reservedCount === 1 ? 'wk_reserve_one' : 'wk_reserve_many', { n: reservedCount })}</div>` : ''}
    <div class="inline" style="margin-bottom:1rem">
      <span class="pill" style="background:${wi.remaining > 0 ? 'var(--good-bg)' : 'var(--bad-bg)'};color:var(--${remainColor})">
        ${t('wk_pill', { count: wi.count, max: wi.max, remaining: wi.remaining })}
      </span>
      ${upcoming.length ? `<button class="ghost sm" id="ical-btn">${t('wk_ical')}</button>` : ''}
    </div>
    ${progress ? studentProgress(progress) : ''}
    ${upcoming.length ? `<div class="blist">${upcoming.map(studentBookingItem).join('')}</div>`
      : `<div class="empty-book">
          <div class="eb-icon">🚗</div>
          <div class="eb-title">${t('wk_empty_title')}</div>
          <p class="eb-text">${t('wk_empty_text')}</p>
          <button id="eb-find">${t('find_free_long')}</button>
        </div>`}`;
  const c = $('#week-card');
  c.querySelectorAll('[data-confirm]').forEach((b) => b.onclick = () => confirmBooking(b.dataset.confirm));
  c.querySelectorAll('[data-reject]').forEach((b) => b.onclick = () => rejectBooking(b.dataset.reject));
  c.querySelectorAll('[data-cancel]').forEach((b) => b.onclick = () => cancelBooking(b.dataset.cancel));
  c.querySelectorAll('[data-offer]').forEach((b) => b.onclick = () => offerBooking(b.dataset.offer));
  c.querySelectorAll('[data-withdraw]').forEach((b) => b.onclick = () => withdrawOffer(b.dataset.withdraw));
  const ic = $('#ical-btn');
  if (ic) ic.onclick = () => exportICS(upcoming);
  const ef = $('#eb-find');
  if (ef) ef.onclick = () => jumpToNextFree();
}

function pbar(have, need, color) {
  const pct = need > 0 ? Math.min(100, Math.round((have / need) * 100)) : 100;
  return `<div class="pbar"><div style="width:${pct}%;background:${color}"></div></div>`;
}
function studentProgress(p) {
  const toRank2 = Math.max(0, p.rank2Min - p.doneCount);
  const sonder = [['ueberland', p.sonder?.ueberland || 0, p.req.ueberland],
    ['autobahn', p.sonder?.autobahn || 0, p.req.autobahn], ['nacht', p.sonder?.nacht || 0, p.req.nacht]];
  return `<div class="progress-card">
    <div class="pc-head">
      <span class="rank-badge ${p.rank >= 2 ? 'r2' : ''}">${t('pc_rank', { r: p.rank })}</span>
      <span class="pc-drives">${t('pc_drives', { n: p.doneCount })}</span>
    </div>
    ${p.rank < 2
      ? `<div class="pc-block">
          <div class="pc-line"><span>${t('pc_to_rank2')}</span><span class="muted">${p.doneCount}/${p.rank2Min}</span></div>
          ${pbar(p.doneCount, p.rank2Min, 'var(--brand)')}
          <div class="hint" style="margin:.3rem 0 0">${t('pc_to_rank2_hint', { n: toRank2, d: state.settings?.booking_horizon_days_rank2 || 21 })}</div>
        </div>`
      : `<div class="pc-block"><span class="pill" style="background:var(--good-bg);color:var(--good)">${t('pc_rank2_ok', { d: p.horizon })}</span></div>`}
    <div class="pc-sonder">
      <div class="pc-sonder-title">${t('pc_sonder')} ${helpDot(t('pc_sonder_help'))}
        ${p.rank >= 2 ? `<span class="pill" style="background:var(--good-bg);color:var(--good);margin-left:.3rem">${t('pc_sonder_r2')}</span>` : ''}</div>
      <div class="pc-tiles">
      ${sonder.map(([k, have, need]) => {
        const done = have >= need;
        const dur = Number(state.settings?.['sonder_min_' + k]) || { ueberland: 225, autobahn: 180, nacht: 135 }[k];
        return `<div class="pc-tile ${done ? 'done' : ''}" style="--tc:${TYPE_COLORS[k]}">
          <span class="pc-tile-ic">${TYPE_ICON[k]}</span>
          <span class="pc-tile-lb">${TYPE_LABEL[k]}</span>
          <span class="pc-tile-count">${done ? '✓ ' : ''}${have}/${need}</span>
          ${pbar(have, need, done ? 'var(--good)' : TYPE_COLORS[k])}
          ${p.rank >= 2 && !done ? `<button class="sf-book" onclick="window.__openSonderBooking('${k}')">${t('pc_book_min', { dur })}</button>` : ''}
        </div>`;
      }).join('')}
      </div>
      ${p.rank < 2 ? `<div class="hint" style="margin:.3rem 0 0">${t('pc_sonder_hint', { n: p.rank2Min })}</div>` : ''}
    </div>
    <div class="pc-actions">
      <button class="pc-adk" onclick="window.__openMyTraining()">${t('pc_adk')}</button>
      <button class="pc-adk" onclick="window.__openExamReadiness()">${t('pc_exam')}</button>
    </div>
  </div>`;
}

// Sonderfahrt buchen (nur Rang 2): feste, lange Dauer – Tag wählen, passenden Start nehmen.
function openSonderBooking(type) {
  const dur = Number(state.settings?.['sonder_min_' + type]) || { ueberland: 225, autobahn: 180, nacht: 135 }[type];
  const label = TYPE_LABEL[type], icon = TYPE_ICON[type];
  modal(`<h3>${icon} ${t('sf_book_title', { label })}</h3>
    <p class="hint">${t('sf_intro', { dur, label })}</p>
    <div class="field"><label>${t('sf_day')}</label><input type="date" id="sf-date" value="${state.date}" min="${todayStr()}"></div>
    <div id="sf-slots" class="sf-slots"><span class="hint">${t('sf_choose_day')}</span></div>
    <div class="actions"><button onclick="window.__closeModal()">${t('close')}</button></div>`);
  const load = async () => {
    const d = $('#sf-date').value; const box = $('#sf-slots');
    if (!d) return;
    box.innerHTML = `<span class="hint">${t('loading_short')}</span>`;
    try {
      const r = await api('/api/slots?date=' + d);
      const fits = (r.slots || []).filter((s) => s.state === 'free' && Number(s.maxDur || s.duration) >= dur);
      if (!fits.length) {
        box.innerHTML = `<div class="warnbox">${t('sf_nofit', { label: esc(label), dur })}</div>`;
        return;
      }
      box.innerHTML = `<div class="sf-list">${fits.map((s) => `<button class="sec sf-pick" data-start="${s.start}">🕒 ${s.start}${t('oclock')} <span class="muted">${t('sf_ends', { end: addMinHHMM(s.start, dur) })}</span></button>`).join('')}</div>`;
      box.querySelectorAll('[data-start]').forEach((b) => b.onclick = () => confirmSonder(type, dur, d, b.dataset.start));
    } catch (e) { box.innerHTML = `<div class="warnbox">${esc(e.message)}</div>`; }
  };
  $('#sf-date').onchange = load; load();
}
function confirmSonder(type, dur, date, start) {
  const label = TYPE_LABEL[type];
  modal(`<h3>${TYPE_ICON[type]} ${t('sf_confirm_title', { label })}</h3>
    <p style="margin:.5rem 0"><strong>${WD_LONG[isoDow(date) - 1]}, ${fmtShort(date)} ${t('at_time')}${start}${t('oclock')}</strong><br>${t('sf_confirm_dur', { dur, end: addMinHHMM(start, dur) })}</p>
    <div class="warnbox">${t('sf_confirm_note')}</div>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">${t('abort')}</button><button id="sf-go">${t('book_go')}</button></div>`);
  $('#sf-go').onclick = async () => {
    try {
      await api('/api/bookings', { method: 'POST', body: { date, start_time: start, sonder: type } });
      closeModal(); celebrate(t('sf_booked', { label })); toast(t('sf_booked', { label }) + ' ✓', 'ok'); syncStudent();
    } catch (e) { toast(e.message, 'err'); }
  };
}
window.__openSonderBooking = openSonderBooking;

function countdownLabel(date, start) {
  const h = hoursUntil(date, start);
  if (h <= 0) return t('cd_now');
  const days = Math.floor(h / 24);
  if (days >= 1) return t('cd_in_days', { d: days });
  if (h >= 1) return t('cd_in_hours', { h: Math.round(h) });
  return t('cd_in_min', { m: Math.max(1, Math.round(h * 60)) });
}

// ---------- Datei-Download / iCal ----------
function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function icsDate(date, hhmm) { return date.replace(/-/g, '') + 'T' + hhmm.replace(':', '') + '00'; }
function exportICS(bookings) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); // YYYYMMDDTHHMMSSZ
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ginoco//DE', 'CALSCALE:GREGORIAN'];
  for (const b of bookings) {
    const end = addMin(b.start_time, b.duration_min);
    lines.push('BEGIN:VEVENT', `UID:fsp-${b.id}@ginoco`, `DTSTAMP:${stamp}`,
      `DTSTART:${icsDate(b.date, b.start_time)}`, `DTEND:${icsDate(b.date, end)}`,
      'SUMMARY:Fahrstunde 🚗', `DESCRIPTION:Fahrstunde (${b.duration_min} Min)`, 'BEGIN:VALARM',
      'TRIGGER:-PT3H', 'ACTION:DISPLAY', 'DESCRIPTION:Fahrstunde in 3 Stunden', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  downloadFile('fahrstunden.ics', lines.join('\r\n'), 'text/calendar');
  toast('Kalenderdatei heruntergeladen ✓', 'ok');
}

function studentBookingItem(b) {
  const gear = b.gearbox ? `<span class="badge ${b.gearbox}">${b.gearbox === 'schalt' ? t('bk_gear_manual') : t('bk_gear_auto')}</span>` : '';
  const cancelH = state.settings?.cancel_hours || 24;
  const h = hoursUntil(b.date, b.start_time);
  const soon = h < cancelH;
  let st, actions = '', reserveHint = '';
  if (b.status === 'done') {
    st = `<span class="badge done">${t('bk_done')}</span>`;
  } else if (b.status === 'offered') {
    st = `<span class="badge offer">${t('bk_offered')}</span>`;
    actions = `<button class="ghost sm" data-withdraw="${b.id}">${t('bk_withdraw')}</button>`;
  } else if (b.confirmed === 0) {
    // Vom Fahrlehrer reservierter Termin – der Schüler bestätigt ihn zuerst.
    st = `<span class="badge reserved">${t('bk_reserved')}</span>`;
    actions = `<button class="sm" data-confirm="${b.id}">${t('bk_accept')}</button>`
      + ` <button class="ghost sm" data-reject="${b.id}">${t('bk_reject')}</button>`;
    // Frist zum Antworten (created_at + reserve_expire_min), gedeckelt durch den Termin.
    const rm = Number(state.settings?.reserve_expire_min) || 0;
    if (rm > 0 && b.created_at) {
      const lessonAt = new Date(b.date + 'T' + (b.start_time.length === 4 ? '0' + b.start_time : b.start_time));
      let due = new Date(new Date(b.created_at).getTime() + rm * 60000);
      if (lessonAt < due) due = lessonAt;
      if (due.getTime() > Date.now()) {
        const dueTime = due.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
        const sameDay = due.toDateString() === new Date().toDateString();
        const when = `${sameDay ? '' : fmtShort(due.toISOString().slice(0, 10)) + ' · '}${dueTime}${t('oclock')}`;
        reserveHint = `<div class="resv-due">${t('bk_due', { when })}</div>`;
      }
    }
  } else {
    st = `<span class="badge booked">${t('bk_confirmed')}</span>`;
    const lockH = state.settings?.lock_hours || 36;
    if (h < lockH) {
      // gesperrt: Termin steht fest
      actions = `<span class="pill">${t('bk_locked')}</span>`;
    } else if (soon) {
      // zwischen Sperr- und Storno-Frist: nur noch ins Angebot geben
      actions = `<button class="sm" data-offer="${b.id}" title="${t('bk_offer_title', { h: cancelH })}">${t('bk_offer_btn')}</button>`;
    } else {
      actions = `<button class="sm" data-offer="${b.id}">${t('bk_offer_btn')}</button>
        <button class="ghost sm" data-cancel="${b.id}">${t('cancel')}</button>`;
    }
  }
  const fb = (b.status === 'done' && b.feedback) ? `<div class="lesson-fb">📝 ${esc(b.feedback)}</div>` : '';
  return `<div class="bitem">
    <div>
      <div class="when">${WD[isoDow(b.date) - 1]} ${fmtShort(b.date)} · ${b.start_time} <span class="muted" style="font-weight:400">(${b.duration_min} ${t('min')})</span></div>
      <div class="meta">${st} ${typeBadge(b.lesson_type)} ${gear} ${b.plate ? '· ' + esc(b.plate) : ''}
        ${b.status === 'booked' && soon ? `<span class="muted">${t('bk_in_h', { h: h < 1 ? '<1' : Math.round(h) })}</span>` : ''}</div>
      ${reserveHint}${fb}
    </div>
    <div class="inline">${actions}</div>
  </div>`;
}

// ---------- Abholung: Schüler teilt Standort / setzt Abholort ----------
let myWatchId = null;
function startMyShare() {
  if (!navigator.geolocation) { toast(t('gps_unavail'), 'err'); return; }
  myWatchId = navigator.geolocation.watchPosition(async (pos) => {
    try { await api('/api/my/location', { method: 'POST', body: { lat: pos.coords.latitude, lng: pos.coords.longitude } }); } catch {}
  }, (e) => { toast(t('loc_error', { e: e.message }), 'err'); stopMyShare(); },
    { enableHighAccuracy: true, maximumAge: 8000, timeout: 20000 });
  state.myShareActive = true;
  toast(t('loc_sharing'), 'ok');
  refreshStudentLive();
}
function stopMyShare() {
  if (myWatchId != null) navigator.geolocation.clearWatch(myWatchId);
  myWatchId = null; state.myShareActive = false;
  api('/api/my/location/stop', { method: 'POST' }).catch(() => {});
  refreshStudentLive();
}
window.__startMyShare = startMyShare;
window.__stopMyShare = stopMyShare;
async function openPickupModal(cur) {
  modal(`<h3>${t('pk_title')}</h3>
    <p class="hint">${t('pk_text')}</p>
    <div class="field"><label>${t('pk_label')}</label><input id="pk-label" value="${esc(cur || '')}" placeholder="${t('pk_ph')}"></div>
    <button class="sec sm" id="pk-here" type="button">${t('pf_geo')}</button>
    <div class="hint" id="pk-info" style="margin:.4rem 0 0"></div>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">${t('abort')}</button><button id="pk-save">${t('pf_save')}</button></div>`);
  let lat = null, lng = null;
  $('#pk-here').onclick = async () => {
    try {
      const c = await getPosOnce(); lat = c.latitude; lng = c.longitude;
      const addr = await reverseGeocode(lat, lng);
      if (addr && !$('#pk-label').value.trim()) $('#pk-label').value = addr;
      $('#pk-info').innerHTML = t('pk_taken', { lat: lat.toFixed(4), lng: lng.toFixed(4) });
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#pk-save').onclick = async () => {
    try {
      await api('/api/my/pickup', { method: 'POST', body: { label: $('#pk-label').value, lat, lng } });
      closeModal(); toast(t('pk_saved'), 'ok'); refreshStudentLive();
    } catch (e) { toast(e.message, 'err'); }
  };
}
window.__openPickup = openPickupModal;

// ---------- Erst-Login: Abholung einrichten (Pflicht) ----------
// Der Schüler wählt EINMAL, wie er abgeholt werden möchte:
//  • Fester Abholort  – Standard: immer am hinterlegten Ort (z.B. zu Hause).
//  • Flexibel/Live    – er bewegt sich frei und fixiert seinen Live-Standort je
//    Fahrstunde bis 20 Min vorher; sonst gilt der feste Ort bzw. die Fahrschule.
function openPickupOnboarding() {
  const lead = state.settings?.live_lead_min || 20;
  const u = state.user || {};
  const curLabel = u.home_label || '';
  const curMode = u.pickup_mode || 'fixed';
  modal(`<h3>📍 Wo sollen wir dich abholen?</h3>
    <p class="hint">Damit dein Fahrlehrer dich sicher findet, richte einmal deine Abholung ein. Du kannst das später jederzeit ändern.</p>
    <div class="pk-modes">
      <label class="pk-mode ${curMode === 'fixed' ? 'sel' : ''}">
        <input type="radio" name="pkmode" value="fixed" ${curMode === 'fixed' ? 'checked' : ''}>
        <div><strong>🏠 Fester Abholort</strong><div class="hint">Du wirst immer am selben Ort abgeholt (z.&nbsp;B. zu Hause). Einfach & verlässlich.</div></div>
      </label>
      <label class="pk-mode ${curMode === 'flex' ? 'sel' : ''}">
        <input type="radio" name="pkmode" value="flex" ${curMode === 'flex' ? 'checked' : ''}>
        <div><strong>📡 Flexibel – ich fixiere je Fahrstunde</strong><div class="hint">Du bist viel unterwegs? Fixiere deinen Live-Standort bis <strong>${lead} Min</strong> vor Beginn. Machst du nichts, gilt dein fester Ort bzw. die Fahrschule.</div></div>
      </label>
    </div>
    <div class="field" style="margin-top:.6rem"><label>Fester Abholort (Adresse/Ort)</label>
      <input id="pko-label" value="${esc(curLabel)}" placeholder="z. B. Eberswalde, Musterstr. 1"></div>
    <button class="sec sm" id="pko-here" type="button">📍 Aktuellen Standort übernehmen</button>
    <div class="hint" id="pko-info" style="margin:.4rem 0 0"></div>
    <div class="hint" id="pko-flexnote" style="margin:.4rem 0 0;${curMode === 'flex' ? '' : 'display:none'}">Beim flexiblen Modus ist die Adresse optional – sie dient nur als Rückfall.</div>
    <div class="actions"><button id="pko-save">Speichern & los 🚗</button></div>`, 'locked');
  let lat = (u.home_lat != null ? Number(u.home_lat) : null);
  let lng = (u.home_lng != null ? Number(u.home_lng) : null);
  const modeEls = Array.from(document.querySelectorAll('input[name="pkmode"]'));
  const syncMode = () => {
    const mode = (modeEls.find((e) => e.checked) || {}).value || 'fixed';
    document.querySelectorAll('.pk-mode').forEach((el) => el.classList.toggle('sel', el.querySelector('input').checked));
    const fn = $('#pko-flexnote'); if (fn) fn.style.display = mode === 'flex' ? '' : 'none';
  };
  modeEls.forEach((e) => e.addEventListener('change', syncMode));
  $('#pko-here').onclick = async () => {
    try {
      const c = await getPosOnce(); lat = c.latitude; lng = c.longitude;
      const addr = await reverseGeocode(lat, lng);
      if (addr && !$('#pko-label').value.trim()) $('#pko-label').value = addr;
      $('#pko-info').innerHTML = `✅ Standort übernommen (${lat.toFixed(4)}, ${lng.toFixed(4)}).`;
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#pko-save').onclick = async () => {
    const mode = (modeEls.find((e) => e.checked) || {}).value || 'fixed';
    const label = $('#pko-label').value.trim();
    if (mode === 'fixed' && !label) { toast('Bitte gib deinen festen Abholort an (oder wähle „Flexibel").', 'err'); return; }
    try {
      const r = await api('/api/my/pickup-setup', { method: 'POST', body: { mode, label, lat, lng } });
      state.user.pickup_onboarded = true; state.user.pickup_mode = r.mode;
      state.user.home_label = r.label; state.user.home_lat = r.lat; state.user.home_lng = r.lng;
      closeModal(); toast('Abholung eingerichtet ✓', 'ok'); refreshStudentLive();
    } catch (e) { toast(e.message, 'err'); }
  };
}
window.__openPickupOnboarding = openPickupOnboarding;

// ---------- Live-Verfolgung (Schüler) ----------
let studentLivePoll = null;
// ---------- Live-Karte (Leaflet + OpenStreetMap, lokal gehostet) ----------
let _leafletPromise = null;
function ensureLeaflet() {
  if (window.L) return Promise.resolve();
  if (_leafletPromise) return _leafletPromise;
  _leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = '/vendor/leaflet/leaflet.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = '/vendor/leaflet/leaflet.js';
    s.onload = () => resolve();
    s.onerror = () => { _leafletPromise = null; reject(new Error('Karte konnte nicht geladen werden')); };
    document.head.appendChild(s);
  });
  return _leafletPromise;
}
const _liveMaps = {}; // id -> Karten-Objekt (map, marker, route, zustand)
function _carIcon() { return L.divIcon({ className: 'lm-car', html: '🚗', iconSize: [36, 36], iconAnchor: [18, 18] }); }
function _meetIcon() { return L.divIcon({ className: 'lm-pin', html: '📍', iconSize: [30, 34], iconAnchor: [15, 30] }); }
function _youIcon() { return L.divIcon({ className: 'lm-you', html: '🧍', iconSize: [30, 34], iconAnchor: [15, 30] }); }
// Ansicht so einstellen, dass beide Punkte sichtbar sind (programmatisch, ohne „userMoved" zu setzen)
function _fitLive(m) {
  if (!m || !m.pts) return;
  m._prog = true;
  if (m.pts.length > 1) m.map.fitBounds(m.pts, { padding: [42, 42], maxZoom: 16, animate: m.fitted });
  else m.map.setView(m.pts[0], 15);
  m.map.once('moveend', () => { m._prog = false; });
}
// Karten-Kacheln: zuerst OpenStreetMap (ohne {s}-Subdomains – zuverlässiger),
// bei Fehlern automatisch Ersatz-Anbieter (CARTO). Beide brauchen keinen Schlüssel.
const TILE_SOURCES = [
  { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', opt: { maxZoom: 19, attribution: '© OpenStreetMap' } },
  { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', opt: { maxZoom: 20, subdomains: 'abcd', attribution: '© OpenStreetMap, © CARTO' } },
];
async function initLiveMap(id) {
  await ensureLeaflet();
  const el = document.getElementById(id);
  if (!el || !window.L) return null;
  destroyLiveMap(id);
  const map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
  const m = { map, tl: null, car: null, meet: null, route: null, routeKey: '', fitted: false,
    userMoved: false, _prog: false, pts: null, routeInfo: null, onRoute: null };
  _liveMaps[id] = m;
  const dropLoader = () => { const l = el.querySelector('.lm-loading'); if (l) l.remove(); };
  // Kacheln laden – lädt der erste Anbieter nicht, automatisch auf den nächsten wechseln.
  let srcIdx = 0;
  const addTiles = () => {
    const src = TILE_SOURCES[srcIdx];
    const tl = L.tileLayer(src.url, src.opt).addTo(map);
    let okT = 0, errT = 0;
    tl.on('tileload', () => { okT++; dropLoader(); });
    tl.on('tileerror', () => {
      errT++;
      if (okT === 0 && errT >= 3 && srcIdx < TILE_SOURCES.length - 1) {
        srcIdx++; try { map.removeLayer(tl); } catch {}
        m.tl = addTiles(); // auf Ersatz-Anbieter umschalten
      } else if (okT === 0 && errT >= 4 && !m._hinted) {
        m._hinted = true; dropLoader();
        const h = L.DomUtil.create('div', 'lm-hint', el);
        h.textContent = '🛰️ Karte lädt gerade nicht – Internetverbindung?';
      }
    });
    return tl;
  };
  m.tl = addTiles();
  // Schaut der Nutzer selbst herum, wird die Ansicht nicht mehr automatisch verschoben.
  map.on('dragstart', () => { m.userMoved = true; });
  map.on('zoomstart', () => { if (!m._prog) m.userMoved = true; });
  // „Zentrieren"-Knopf – holt die Ansicht auf beide Punkte zurück.
  const Rc = L.Control.extend({ options: { position: 'topright' }, onAdd() {
    const b = L.DomUtil.create('button', 'lm-recenter');
    b.type = 'button'; b.title = 'Ansicht zentrieren'; b.setAttribute('aria-label', 'Ansicht zentrieren'); b.textContent = '◎';
    L.DomEvent.disableClickPropagation(b);
    L.DomEvent.on(b, 'click', () => { m.userMoved = false; _fitLive(m); });
    return b;
  } });
  map.addControl(new Rc());
  setTimeout(dropLoader, 5000); // Notausstieg, damit der Reifen nicht ewig dreht
  // Größe mehrfach neu vermessen – falls der Container beim Aufbau noch nicht
  // (voll) sichtbar war, bleibt die Karte sonst grau.
  [60, 300, 800, 1600].forEach((ms) => setTimeout(() => { try { map.invalidateSize(); if (m.pts && !m.userMoved) _fitLive(m); } catch {} }, ms));
  return m;
}
function destroyLiveMap(id) {
  const m = _liveMaps[id];
  if (m) { try { m.map.remove(); } catch {} delete _liveMaps[id]; }
}
// aPos/bPos = [lat,lng]. aIcon = Icon für den beweglichen Punkt (Auto oder Schüler).
// onRoute(info|null) wird aufgerufen, sobald die echte Straßen-Route (Entfernung+Fahrzeit) da ist.
async function updateLiveMap(id, aPos, aIcon, bPos, bLabel, bIcon, onRoute) {
  const m = _liveMaps[id];
  if (!m || !window.L) return;
  m.onRoute = onRoute || null;
  if (!m.car) m.car = L.marker(aPos, { icon: aIcon }).addTo(m.map);
  else m.car.setLatLng(aPos);
  const pts = [aPos];
  if (bPos) {
    if (!m.meet) { m.meet = L.marker(bPos, { icon: bIcon || _meetIcon() }).addTo(m.map); if (bLabel) m.meet.bindPopup(bLabel); }
    else m.meet.setLatLng(bPos);
    pts.push(bPos);
    const key = aPos.map((x) => x.toFixed(3)).join(',') + '|' + bPos.map((x) => x.toFixed(4)).join(',');
    if (key !== m.routeKey) { m.routeKey = key; _drawRoute(id, aPos, bPos); }
  }
  m.pts = pts;
  if (!m.userMoved) _fitLive(m); // nur solange der Nutzer nicht selbst herumschiebt
  m.fitted = true;
}
async function _drawRoute(id, a, b) {
  const m = _liveMaps[id]; if (!m) return;
  const straight = () => {
    if (!_liveMaps[id]) return;
    if (m.route) m.map.removeLayer(m.route);
    m.route = L.polyline([a, b], { color: '#4d8dff', weight: 4, dashArray: '6,8', opacity: .7 }).addTo(m.map);
    m.routeInfo = null; if (m.onRoute) m.onRoute(null);
  };
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`;
    const r = await fetch(url); const j = await r.json();
    const rt = j.routes && j.routes[0];
    const co = rt && rt.geometry && rt.geometry.coordinates;
    if (co && _liveMaps[id]) {
      const ll = co.map((c) => [c[1], c[0]]);
      if (m.route) m.map.removeLayer(m.route);
      m.route = L.polyline(ll, { color: '#4d8dff', weight: 5, opacity: .85 }).addTo(m.map);
      // Echte Straßen-Werte: Entfernung (km) + Fahrzeit (Min)
      m.routeInfo = { km: rt.distance / 1000, min: Math.max(1, Math.round(rt.duration / 60)) };
      if (m.onRoute) m.onRoute(m.routeInfo);
    } else straight();
  } catch { straight(); }
}

// Karte für den Fahrlehrer-Standort: stellt sicher, dass Leaflet + Karte bereit sind,
// bevor Icons (die L brauchen) erzeugt werden – dann Position aktualisieren.
async function renderCarMap(id, carPos, meetPos, label, onRoute) {
  try {
    await ensureLeaflet();
    if (!_liveMaps[id]) { if (!(await initLiveMap(id))) return; }
    await updateLiveMap(id, carPos, _carIcon(), meetPos, label, _meetIcon(), onRoute);
  } catch {}
}

// Fahrlehrer-Navigation: Karte „du -> Fahrschüler" mit Route, Entfernung & Fahrzeit,
// Knopf für echte Turn-by-turn-Navigation (Google/Apple Maps) und Standort-Teilen.
async function openInstrRoute(b) {
  const dest = (b.meet_lat != null && b.meet_lng != null) ? [Number(b.meet_lat), Number(b.meet_lng)] : null;
  const who = b.student_name || 'Fahrschüler';
  modal(`<h3>🧭 Zum Fahrschüler</h3>
    <div class="hint" style="margin:0 0 .6rem"><strong>${esc(who)}</strong> · ${b.start_time} Uhr${b.meet_label ? ' · 📍 ' + esc(b.meet_label) : ''}</div>
    ${dest ? `<div id="instr-route-map" class="live-map"><div class="lm-loading"><span class="tire">🛞</span><span>Karte lädt …</span></div></div>
    <div class="hint" id="ir-eta" style="margin:.6rem 0 0">📍 Route wird berechnet …</div>
    <div class="inline" style="margin-top:.7rem;flex-wrap:wrap;gap:.5rem">
      <a class="btnlink" id="ir-nav" href="https://www.google.com/maps/dir/?api=1&destination=${dest[0]},${dest[1]}&travelmode=driving" target="_blank" rel="noopener">🧭 Navigation starten</a>
      <button class="sec sm" id="ir-share"></button>
      <button class="ghost sm" onclick="window.__closeModal()">Schließen</button>
    </div>`
    : `<div class="warnbox">Für diese Fahrstunde ist noch kein Treffpunkt mit Koordinaten hinterlegt. Trag ihn beim Bearbeiten/Abschließen unter „Treffpunkt" ein (📍 aktuellen Standort übernehmen) – dann gibt's hier Karte, Route und Fahrzeit.</div>
    <div class="actions"><button onclick="window.__closeModal()">Schließen</button></div>`}`);
  if (!dest) return;
  const setShareBtn = () => { const s = $('#ir-share'); if (s) s.textContent = state.liveSharing ? '📍 Standort-Teilen beenden' : '📍 Standort teilen'; };
  setShareBtn();
  $('#ir-share').onclick = () => { if (state.liveSharing) stopLiveShare(); else startLiveShare(); setTimeout(setShareBtn, 120); };
  try {
    const c = await getPosOnce();
    await renderCarMap('instr-route-map', [c.latitude, c.longitude], dest, esc(who), (info) => {
      const el = $('#ir-eta'); if (!el) return;
      el.innerHTML = info ? `🚗 <strong>${info.km.toFixed(1)} km</strong> · ca. <strong>${info.min} Min</strong> Fahrt` : '📍 Luftlinie (Route lädt gerade nicht)';
    });
  } catch (e) { const el = $('#ir-eta'); if (el) el.textContent = 'Standort nicht verfügbar: ' + e.message; }
}
window.__openInstrRoute = openInstrRoute;

// ---- Cockpit-Seite: Navigation (Karte du -> Fahrschüler, Route, Live, Push) ----
const navState = { bookings: [], selId: null, myPos: null, def: null, lastMin: 0 };
let navWatchId = null;
function stopNavWatch() { if (navWatchId != null) { try { navigator.geolocation.clearWatch(navWatchId); } catch {} navWatchId = null; } }
// Ziel für eine Fahrstunde: 1. fixierter Treffpunkt der Stunde  2. fester Abholort
// des Schülers  3. die Fahrschule (Standard). Deckt sich mit der Schüler-Ansicht.
function navDest(b) {
  if (b && b.meet_lat != null && b.meet_lng != null) return { pos: [Number(b.meet_lat), Number(b.meet_lng)], label: b.meet_label || 'Treffpunkt' };
  if (b && b.student_home_lat != null && b.student_home_lng != null) return { pos: [Number(b.student_home_lat), Number(b.student_home_lng)], label: b.student_home_label || 'Fester Abholort', isHome: true };
  if (navState.def) return { pos: [navState.def.lat, navState.def.lng], label: navState.def.label, isDefault: true };
  return null;
}
// Abhol-Status eines Schülers für die Fahrlehrer-Liste: fest / flexibel / schon fixiert.
function pickupInfo(b) {
  const hasMeet = b.meet_label != null || (b.meet_lat != null && b.meet_lng != null);
  const liveOn = b.student_live_active && b.student_live_at &&
    (Date.now() - new Date(b.student_live_at).getTime() < 3 * 60 * 1000);
  const mode = b.pickup_mode || (b.student_home_label ? 'fixed' : null);
  if (hasMeet) return { cls: 'pu-fix', txt: '🔒 Fixiert: ' + esc(b.meet_label || 'Live-Punkt') };
  if (liveOn) return { cls: 'pu-live', txt: '📡 Teilt gerade Live-Standort' };
  if (mode === 'flex') {
    const fb = b.student_home_label ? esc(b.student_home_label) : (navState.def ? esc((navState.def.label || '').replace(/^🏫\s*/, '')) : 'Fahrschule');
    return { cls: 'pu-flex', txt: '📡 Flexibel · noch nicht fixiert', sub: 'sonst: ' + fb };
  }
  if (mode === 'fixed' && b.student_home_label) return { cls: 'pu-home', txt: '🏠 Fest: ' + esc(b.student_home_label) };
  return { cls: 'pu-def', txt: '🏫 Fahrschule (Standard)' };
}
async function tabNavigation() {
  const box = $('#itab');
  box.innerHTML = `<div class="card">
    <h2>🧭 Navigation</h2>
    <p class="hint">Wo dein nächster Fahrschüler steht und wie du hinfährst – mit Fahrzeit. Teile deinen Standort, dann sieht der Fahrschüler dich live kommen.</p>
    <div class="inline" style="gap:.5rem;flex-wrap:wrap;margin-bottom:.7rem">
      <button class="sm" id="nav-share"></button>
      <button class="sec sm" id="nav-locate">🔄 Standort aktualisieren</button>
    </div>
    <div id="nav-map" class="live-map"><div class="lm-loading"><span class="tire">🛞</span><span>Karte lädt …</span></div></div>
    <div class="hint" id="nav-eta" style="margin:.7rem 0 .5rem"></div>
    <a class="btnlink hidden" id="nav-go" target="_blank" rel="noopener">🧭 Navigation starten</a>
    <div class="nav-say hidden" id="nav-say" style="margin-top:.7rem">
      <div class="hint" style="margin:0 0 .35rem">Kurze Ansage an den Fahrschüler <span class="muted">(optional – deine Position sieht er per GPS ohnehin live):</span></div>
      <div class="inline" style="gap:.4rem;flex-wrap:wrap">
        <button class="sec sm" data-say="eta">🔔 Unterwegs</button>
        <button class="sec sm" data-say="🚗 Dein Fahrlehrer ist gleich da!">🚗 Gleich da</button>
        <button class="sec sm" data-say="🚧 Hier staut es sich gerade ein bisschen – ich bin unterwegs.">🚧 Etwas Stau</button>
        <button class="sec sm" data-say="🕗 Berufsverkehr – kann ein paar Minuten später werden.">🕗 Berufsverkehr</button>
      </div>
    </div>
    <h3 style="margin-top:1.2rem">Heutige Fahrstunden</h3>
    <div id="nav-list"></div>
  </div>`;
  const setShareBtn = () => { const s = $('#nav-share'); if (s) { s.textContent = state.liveSharing ? '📍 Standort-Teilen beenden' : '📍 Standort teilen'; s.className = 'sm' + (state.liveSharing ? ' danger' : ''); } };
  setShareBtn();
  $('#nav-share').onclick = () => { if (state.liveSharing) stopLiveShare(); else startLiveShare(); setTimeout(setShareBtn, 150); };
  $('#nav-locate').onclick = () => navLocateAndRoute();
  box.querySelectorAll('[data-say]').forEach((btn) => btn.onclick = () => navSay(btn.dataset.say));
  // Standard-Treffpunkt (Fahrschule) als Ziel, falls für die Stunde keiner hinterlegt ist.
  // Für den Fahrlehrer liefert /api/settings (in state.settings) bereits die vollen Werte.
  let s = state.settings || {};
  if (s.meet_default_lat == null) { try { s = (await api('/api/settings')).settings || s; state.settings = s; } catch {} }
  navState.def = (s.meet_default_lat != null && s.meet_default_lat !== '' && s.meet_default_lng != null && s.meet_default_lng !== '')
    ? { lat: Number(s.meet_default_lat), lng: Number(s.meet_default_lng), label: '🏫 ' + (s.meet_default_label || s.school_label || 'Fahrschule') }
    : null;
  try {
    const ov = await api('/api/instructor/overview?from=' + todayStr() + '&to=' + todayStr());
    navState.bookings = (ov.bookings || []).filter((b) => b.student_id && b.status !== 'done').sort((a, z) => a.start_time.localeCompare(z.start_time));
  } catch { navState.bookings = []; }
  const first = navState.bookings[0];
  navState.selId = first ? String(first.id) : null;
  renderNavList();
  navLocateAndRoute();
}
function renderNavList() {
  const el = $('#nav-list'); if (!el) return;
  if (!navState.bookings.length) { el.innerHTML = '<p class="hint">Heute keine anstehenden Fahrstunden.</p>'; return; }
  el.innerHTML = `<div class="blist">${navState.bookings.map((b) => {
    const on = String(b.id) === String(navState.selId);
    const dst = navDest(b);
    const where = dst
      ? (dst.isDefault ? '🏫 ' + esc((dst.label || '').replace(/^🏫\s*/, '')) : (dst.isHome ? '🏠 ' : '📍 ') + esc(dst.label))
      : '<span class="muted">kein Ziel hinterlegt</span>';
    const pu = pickupInfo(b);
    const puLine = `<div class="pu-badge ${pu.cls}">${pu.txt}${pu.sub ? ` <span class="muted">(${pu.sub})</span>` : ''}</div>`;
    return `<div class="bitem${on ? ' warm' : ''}">
      <div><div class="when">${b.start_time} · <strong>${esc(b.student_name || 'Fahrschüler')}</strong></div>
        <div class="meta">🎯 ${where}</div>${puLine}</div>
      <button class="sec sm" data-navpick="${b.id}">${on ? '✓ gewählt' : '🧭 Route'}</button>
    </div>`;
  }).join('')}</div>`;
  el.querySelectorAll('[data-navpick]').forEach((btn) => btn.onclick = () => { navState.selId = String(btn.dataset.navpick); renderNavList(); navRenderMap(); });
}
async function navLocateAndRoute() {
  try { const c = await getPosOnce(); navState.myPos = [c.latitude, c.longitude]; }
  catch (e) { const el = $('#nav-eta'); if (el) el.textContent = 'Standort nicht verfügbar: ' + e.message; }
  await navRenderMap();
  // Live verfolgen: Karte bewegt sich mit, während du fährst.
  stopNavWatch();
  if (navigator.geolocation) navWatchId = navigator.geolocation.watchPosition(
    (pos) => { navState.myPos = [pos.coords.latitude, pos.coords.longitude]; navRenderMap(); },
    () => {}, { enableHighAccuracy: true, maximumAge: 8000, timeout: 20000 });
}
async function navRenderMap() {
  const b = navState.bookings.find((x) => String(x.id) === String(navState.selId));
  const dst = navDest(b);
  const go = $('#nav-go'), nb = $('#nav-say'), etaEl = $('#nav-eta');
  if (go) { if (dst) { go.href = `https://www.google.com/maps/dir/?api=1&destination=${dst.pos[0]},${dst.pos[1]}&travelmode=driving`; go.classList.remove('hidden'); } else go.classList.add('hidden'); }
  if (nb) nb.classList.toggle('hidden', !b);
  if (navState.myPos && dst) {
    await renderCarMap('nav-map', navState.myPos, dst.pos, esc(dst.label), (info) => {
      navState.lastMin = info ? info.min : 0;
      if (etaEl) etaEl.innerHTML = info
        ? `🚗 Zu <strong>${esc(b ? (b.student_name || 'Fahrschüler') : dst.label)}</strong> (${esc(dst.label)}): <strong>${info.km.toFixed(1)} km</strong> · ca. <strong>${info.min} Min</strong> Fahrt`
        : '📍 Luftlinie (Route lädt gerade nicht)';
    });
  } else if (dst) {
    await renderCarMap('nav-map', dst.pos, null, esc(dst.label), null);
    if (etaEl) etaEl.textContent = 'Ziel angezeigt – dein Standort ist noch nicht verfügbar.';
  } else if (navState.myPos) {
    await renderCarMap('nav-map', navState.myPos, null, '', null);
    if (etaEl) etaEl.textContent = b ? 'Für diese Fahrstunde ist kein Ziel hinterlegt.' : 'Dein Standort.';
  }
}
// Kurze Ansage an den gewählten Fahrschüler. 'eta' = „unterwegs, ~X Min" (aus der Route).
async function navSay(kind) {
  const b = navState.bookings.find((x) => String(x.id) === String(navState.selId));
  if (!b) return;
  const useEta = kind === 'eta';
  const mins = useEta ? (navState.lastMin || 0) : 0;
  const msg = useEta
    ? (mins ? `🚗 Dein Fahrlehrer ist unterwegs zu dir – ca. ${mins} Min.` : '🚗 Dein Fahrlehrer ist unterwegs zu dir.')
    : kind;
  try {
    const r = await api('/api/instructor/on-way', { method: 'POST', body: { booking_id: b.id, text: msg, minutes: mins } });
    toast(`${(r.name || 'Fahrschüler')} benachrichtigt ✓`, 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

async function refreshStudentLive() {
  const card = $('#live-card'); if (!card) return;
  let d;
  try { d = await api('/api/my/live'); } catch { return; }
  if (!d.window) {
    card.classList.add('hidden');
    card.dataset.mode = '';
    destroyLiveMap('live-map');
    if (studentLivePoll) { clearInterval(studentLivePoll); studentLivePoll = null; }
    return;
  }
  card.classList.remove('hidden');
  const phone = state.settings?.instructor_phone;
  const contact = phone ? `<div class="inline" style="margin-top:.6rem">${contactButtons(phone, 'Hallo, ich warte am Treffpunkt auf dich.')}</div>` : '';
  // "Ich bin in X Min da" – vom Fahrlehrer gesagt (hat Vorrang, ist verlässlicher als die GPS-Schätzung)
  const announce = d.announce
    ? `<div class="announce">🚗 Dein Fahrlehrer ist ${d.announce.remaining > 0 ? `in <strong>~${d.announce.remaining} Min</strong> da` : '<strong>gleich da</strong>'}</div>`
    : '';
  // Abholung: Abholort setzen + eigenen Standort teilen (damit dich der Fahrlehrer genau findet)
  const sharing = state.myShareActive;
  // 20-Min-Regel: bis „lead" Min vor Beginn darf der Abholort geändert werden, danach fest.
  const lockMin = d.lead || 20;
  const locked = d.booking.minutesToStart <= lockMin;
  const untilLock = d.booking.minutesToStart - lockMin; // Min bis zur Sperre
  const lockLine = locked
    ? `<div class="hint pk-locked" style="margin:.4rem 0 0">🔒 Der Abholort steht jetzt fest (ab ${lockMin} Min vor Beginn). Kurzfristig woanders? Sag deinem Fahrlehrer kurz Bescheid.</div>`
    : (untilLock <= 15 ? `<div class="hint" style="margin:.4rem 0 0">⏳ Noch ~${untilLock} Min, dann steht der Abholort fest.</div>` : '');
  const pickupControls = `<div class="pickup-box">
    <div class="pb-line"><span class="muted">Dein Abholort:</span> <strong>${d.meet?.label ? esc(d.meet.label) : 'noch nicht gesetzt'}</strong></div>
    <div class="inline" style="margin-top:.5rem;gap:.5rem">
      ${locked ? '' : `<button class="sec sm" id="pk-edit">📍 Abholort ${d.meet?.label ? 'ändern' : 'wählen'}</button>`}
      ${sharing
        ? '<button class="danger sm" id="my-share-stop">📍 Standort-Teilen beenden</button>'
        : (locked ? '' : '<button class="sm" id="my-share">📍 Meinen Standort teilen</button>')}
    </div>
    <div class="hint" style="margin:.4rem 0 0">${sharing ? '📍 Dein Standort wird geteilt – dein Fahrlehrer sieht jetzt genau, wo du bist.' : 'Teile deinen Standort, damit dich dein Fahrlehrer genau findet. Läuft nur jetzt und stoppt nach Beginn.'}</div>
    ${lockLine}
  </div>`;
  // Beruhigender Status ganz oben (planmäßig / etwas später) – gilt in jeder Phase.
  // Verschobene Startzeit (delayMin) hat Vorrang; sonst der gemeldete Tagesstatus
  // (inkl. automatischer Wetter-Vorwarnung: Grund wird direkt mit angezeigt).
  const delayMin = d.booking.delayMin || 0;
  const ds = d.dayStatus;
  let statusBanner;
  if (delayMin > 0) {
    const why = ds && ds.state === 'delay' && ds.reason ? ` (${esc(dsReason(ds.reason))})` : '';
    statusBanner = `<div class="run-status late">⏱️ <div><strong>Wir starten heute etwas später.</strong><br><span>Deine Fahrstunde verschiebt sich um ~${delayMin} Min auf <strong>${d.booking.start_time} Uhr</strong>${why}. Kein Stress – nimm dir die Zeit.</span></div></div>`;
  } else if (ds && ds.state === 'delay') {
    const why = ds.reason ? esc(dsReason(ds.reason)) : '';
    statusBanner = `<div class="run-status late">⏱️ <div><strong>Heute wird’s ca. ${ds.minutes} Min später.</strong><br><span>${why ? 'Grund: ' + why + '. ' : ''}${ds.note ? esc(ds.note) + ' ' : ''}Deine Uhrzeit bleibt (<strong>${d.booking.start_time} Uhr</strong>) – bitte trotzdem pünktlich da sein.</span></div></div>`;
  } else {
    statusBanner = `<div class="run-status ok">✅ <div><strong>Alles läuft planmäßig.</strong><br><span>Beginn um <strong>${d.booking.start_time} Uhr</strong> (in ${d.booking.minutesToStart} Min).</span></div></div>`;
  }
  if (d.phase === 'soon') {
    // ~1 Stunde vorher: freundlich nach dem Abholort fragen (in Gino's Ton)
    card.dataset.mode = 'soon'; destroyLiveMap('live-map');
    card.innerHTML = `<h2>🚗 Deine nächste Fahrstunde</h2>
      ${statusBanner}
      ${announce}
      <div class="pickup-ask">
        <div class="pa-q">Wo sollen wir dich einsammeln?</div>
        <p class="hint" style="margin:.3rem 0 0">Noch beim Eisessen oder mit Kumpels unterwegs? Kein Problem – sag einfach kurz Bescheid, wo genau du bist, dann findet dich dein Fahrlehrer sofort.</p>
      </div>
      ${pickupControls}
      <p class="hint">Sobald dein Fahrlehrer losfährt (ca. ${d.lead} Min vorher), siehst du hier live auf der Karte, wo er ist und wann du rausgehen musst.</p>${contact}`;
  } else if (!d.active) {
    card.dataset.mode = 'pickup'; destroyLiveMap('live-map');
    const note = d.busy
      ? 'Dein Fahrlehrer ist gerade noch in einer Fahrstunde. Sein Standort wird geteilt, sobald er unterwegs zu dir ist.'
      : `Sobald dein Fahrlehrer seinen Standort teilt (ca. ${d.lead} Min vorher), kannst du hier live sehen, wo er ist und wann er da ist.`;
    card.innerHTML = `<h2>📍 Treffpunkt</h2>
      ${statusBanner}
      ${announce}
      <p>Deine Fahrstunde beginnt in <strong>${d.booking.minutesToStart} Min</strong> (${d.booking.start_time} Uhr).</p>
      ${pickupControls}
      <p class="hint">${note}</p>${contact}`;
  } else {
    const loc = d.location;
    const upd = new Date(loc.updated_at).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    const meetPill = d.meet?.label ? `<div class="inline" style="margin-top:.5rem"><span class="pill">📍 Treffpunkt: ${esc(d.meet.label)}</span></div>` : '';
    const setEl = (id, html) => { const e = document.getElementById(id); if (e) e.innerHTML = html; };
    // Hero + Kacheln aus den besten verfügbaren Werten bauen.
    // Priorität: Fahrlehrer-Ansage > echte Straßen-Fahrzeit (Route) > grobe Luftlinien-Schätzung.
    const applyEta = (info) => {
      const etaMin = d.announce ? d.announce.remaining : (info ? info.min : d.etaMin);
      const km = info ? info.km : d.distanceKm;
      const arrived = (km != null && km < 0.12) || (etaMin != null && etaMin <= 0);
      const goNow = !arrived && etaMin != null && etaMin <= 2;
      const hero = arrived
        ? `<div class="live-hero go"><span class="lh-ic">🎉</span><div><div class="lh-big">Dein Fahrlehrer ist da!</div><div class="lh-sub">Geh zum Treffpunkt – er wartet auf dich.</div></div></div>`
        : goNow
          ? `<div class="live-hero go"><span class="lh-ic">🚶</span><div><div class="lh-big">Jetzt rausgehen!</div><div class="lh-sub">Dein Fahrlehrer ist gleich da.</div></div></div>`
          : `<div class="live-hero"><span class="lh-ic">🚗</span><div><div class="lh-big">${etaMin != null ? `Fahrlehrer in ~${etaMin} Min da` : 'Fahrlehrer unterwegs'}</div><div class="lh-sub">${info ? 'Echte Fahrzeit über die Straße.' : 'Er ist auf dem Weg zu dir – wir sagen Bescheid, wann du raus musst.'}</div></div></div>`;
      const distStr = km != null ? (km < 1 ? Math.round(km * 1000) + ' m' : km.toFixed(1) + ' km') : null;
      const distPill = distStr ? `<span class="pill">🚗 ${distStr}${info ? ' Fahrweg' : ' Luftlinie'}</span>` : '';
      setEl('live-hero', hero);
      setEl('live-pills', `${distPill}<span class="pill">aktualisiert ${upd}</span>`);
    };
    // Karte NUR EINMAL aufbauen und danach live aktualisieren (sonst würde der Punkt „springen")
    if (card.dataset.mode !== 'live' || !$('#live-map')) {
      card.dataset.mode = 'live';
      card.innerHTML = `<h2>🛰️ Dein Fahrlehrer ist unterwegs</h2>
        <div id="live-hero"></div>
        <div class="inline" id="live-pills" style="margin-bottom:.6rem"></div>
        <div id="live-map" class="live-map"><div class="lm-loading"><span class="tire">🛞</span><span>${t('live_map_loading')}</span></div></div>
        <div id="live-meet"></div>
        <div id="live-pickup"></div>
        <p class="hint" style="margin-top:.4rem">${t('live_hint')}</p>
        <div id="live-contact"></div>`;
    }
    applyEta(null);                 // sofort mit der Schätzung anzeigen
    setEl('live-meet', meetPill);
    setEl('live-pickup', pickupControls);
    setEl('live-contact', contact);
    const carPos = [loc.lat, loc.lng];
    const meetPos = d.meet?.lat != null ? [d.meet.lat, d.meet.lng] : null;
    renderCarMap('live-map', carPos, meetPos, d.meet?.label ? esc(d.meet.label) : null, applyEta); // echte Werte, sobald die Route da ist
  }
  const pe = $('#pk-edit'); if (pe) pe.onclick = () => openPickupModal(d.meet?.label);
  const ms = $('#my-share'); if (ms) ms.onclick = () => startMyShare();
  const mss = $('#my-share-stop'); if (mss) mss.onclick = () => stopMyShare();
  if (!studentLivePoll) studentLivePoll = setInterval(refreshStudentLive, 15000);
}

// ---------- Fahrstunden-Timer (Schüler drückt „Start", Fahrzeit läuft) ----------
let lessonTick = null;
// Welche Fahrstunde ist gerade „dran"? Heute, kurz vor Beginn bis kurz nach Ende.
function currentLessonInfo(bookings) {
  const today = todayStr(), now = Date.now();
  const cands = bookings.filter((b) => b.date === today && (b.status === 'booked' || b.status === 'done'))
    .sort((a, z) => a.start_time.localeCompare(z.start_time));
  for (const b of cands) {
    if (b.started_at) {
      const elapsedMin = (now - new Date(b.started_at).getTime()) / 60000;
      if (elapsedMin < b.duration_min + 15) return { b, started: true };
      continue; // schon lange vorbei
    }
    const minsToStart = (new Date(`${b.date}T${b.start_time}:00`).getTime() - now) / 60000;
    if (minsToStart <= 10 && minsToStart >= -30) return { b, started: false };
  }
  return null;
}
function renderLessonTimer(bookings) {
  const card = $('#lesson-card'); if (!card) return;
  if (lessonTick) { clearInterval(lessonTick); lessonTick = null; }
  const info = currentLessonInfo(bookings);
  if (!info) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const b = info.b;
  const draw = () => {
    if (!info.started) {
      card.innerHTML = `<h2>${t('es_lesson_t')}</h2>
        <p>${t('lt_today', { time: b.start_time, d: b.duration_min })}</p>
        <p class="hint">${t('lt_press_start')}</p>
        <button class="lesson-start" id="lt-start">${t('lt_start')}</button>`;
      $('#lt-start').onclick = () => startLesson(b.id);
      return;
    }
    const elapsedSec = Math.floor((Date.now() - new Date(b.started_at).getTime()) / 1000);
    const totalSec = b.duration_min * 60;
    const remain = Math.max(0, totalSec - elapsedSec);
    const mm = Math.floor(remain / 60), ss = remain % 60;
    const pct = Math.min(100, Math.round(elapsedSec / totalSec * 100));
    const startedLbl = new Date(b.started_at).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    card.innerHTML = `<h2>${t('lt_running')}</h2>
      ${remain <= 0
        ? `<div class="lesson-timer done"><span class="lt-clock">${t('lt_time_up')}</span></div>
           <p class="hint">${t('lt_done_text', { d: b.duration_min })}</p>`
        : `<div class="lesson-timer"><span class="lt-clock">${mm}:${String(ss).padStart(2, '0')}</span><span class="lt-sub">${t('lt_remain')}</span></div>
           <div class="lt-bar"><div style="width:${pct}%"></div></div>`}
      <div class="inline" style="margin-top:.7rem;justify-content:space-between">
        <span class="muted" style="font-size:.82rem">${t('lt_started', { time: startedLbl, d: b.duration_min })}</span>
        <button class="ghost sm" id="lt-reset">${t('reset')}</button>
      </div>`;
    $('#lt-reset').onclick = () => resetLesson(b.id);
  };
  draw();
  if (info.started) lessonTick = setInterval(draw, 1000);
}
async function startLesson(id) {
  try {
    const r = await api('/api/bookings/' + id + '/start', { method: 'POST' });
    const bk = myBookingsCache.find((x) => x.id == id); if (bk) bk.started_at = r.started_at;
    renderLessonTimer(myBookingsCache); toast(t('lt_toast_started'), 'ok');
  } catch (e) { toast(e.message, 'err'); }
}
async function resetLesson(id) {
  if (!confirm(t('lt_reset_confirm'))) return;
  try {
    await api('/api/bookings/' + id + '/start', { method: 'POST', body: { reset: true } });
    const bk = myBookingsCache.find((x) => x.id == id); if (bk) bk.started_at = null;
    renderLessonTimer(myBookingsCache); toast(t('lt_toast_reset'), 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

function renderAway(away) {
  const el = $('#away-note');
  if (!el) return;
  const vac = (away || []).filter((a) => a.type === 'vacation');
  if (!vac.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const dates = vac.map((a) => `${WD[isoDow(a.date) - 1]} ${fmtShort(a.date)}`).join(', ');
  el.innerHTML = t('away_vacation', { dates });
}

// Tagesstatus (läuft planmäßig / Verzögerung) – Gründe zentral.
const DS_REASONS = [['rush', '🚗', 'Berufsverkehr'], ['jam', '🚧', 'Stau'], ['snow', '❄️', 'Schnee'], ['ice', '🧊', 'Glatteis'], ['weather', '🌧️', 'Witterung'], ['other', '⏳', 'Sonstiges']];
function dsReason(key) { const r = DS_REASONS.find((x) => x[0] === key); return r ? r[1] + ' ' + t('ds_' + key) : ''; }
// Schüler-Banner: nur zeigen, wenn heute ein Status gesetzt ist (und der Schüler heute eine Stunde hat).
function renderDayStatusBanner(status, bookings) {
  const el = $('#daystatus-banner'); if (!el) return;
  const today = todayStr();
  const hasToday = (bookings || []).some((b) => b.date === today && b.status !== 'cancelled' && b.confirmed !== 0);
  if (!status || status.date !== today || !hasToday) { el.innerHTML = ''; return; }
  if (status.state === 'delay') {
    const r = status.reason ? dsReason(status.reason) : '';
    el.innerHTML = `<div class="ds-banner ds-delay">
      <div class="ds-ic">⏳</div>
      <div><div class="ds-t">${t('ds_delay_title', { min: status.minutes })}</div>
        <div class="ds-s">${r ? t('ds_reason_label') + esc(r) + '. ' : ''}${status.note ? esc(status.note) + ' ' : ''}${t('ds_delay_text')}</div></div>
    </div>`;
  } else {
    el.innerHTML = `<div class="ds-banner ds-ok">
      <div class="ds-ic">✅</div>
      <div><div class="ds-t">${t('ds_ok_title')}</div>
        <div class="ds-s">${t('ds_ok_text')}</div></div>
    </div>`;
  }
}

// ---- Handy-Benachrichtigungen (Web Push) ----
function urlB64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
async function pushState() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
    const reg = await navigator.serviceWorker.ready;
    return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
  } catch { return 'unsupported'; }
}
async function enablePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { toast('Dein Gerät unterstützt keine Push-Nachrichten', 'err'); return; }
    if (Notification.permission === 'denied') { toast('Benachrichtigungen sind blockiert – bitte in den Browser-Einstellungen für ginoco.de wieder erlauben.', 'err'); refreshPushCtl(); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Ohne Erlaubnis keine Benachrichtigungen. Tippe im Browser-Fenster auf „Erlauben".', 'err'); refreshPushCtl(); return; }
    const reg = await navigator.serviceWorker.ready;
    const { key } = await api('/api/push/key');
    if (!key) { toast('Push ist gerade nicht bereit', 'err'); return; }
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(key) });
    const j = sub.toJSON();
    await api('/api/push/subscribe', { method: 'POST', body: { endpoint: j.endpoint, keys: j.keys } });
    toast('Benachrichtigungen an 🔔', 'ok'); refreshPushCtl();
  } catch (e) { toast('Push fehlgeschlagen: ' + e.message, 'err'); }
}
async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) { await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {}); await sub.unsubscribe(); }
    toast('Benachrichtigungen aus', 'ok'); refreshPushCtl();
  } catch (e) { toast(e.message, 'err'); }
}
async function refreshPushCtl() {
  const el = $('#push-ctl'); if (!el) return;
  const st = await pushState();
  const blocked = ('Notification' in window) && Notification.permission === 'denied';
  if (st === 'unsupported') {
    el.innerHTML = '<span class="hint">🔔 <strong>Handy-Benachrichtigungen</strong> gehen auf diesem Gerät leider nicht. Tipp fürs iPhone: die Seite über das Teilen-Symbol „Zum Home-Bildschirm" hinzufügen und die App von dort öffnen.</span>';
    return;
  }
  if (blocked && st !== 'on') {
    el.innerHTML = `<div class="hint">🔕 <strong>Benachrichtigungen sind blockiert.</strong> So erlaubst du sie wieder:
      <br>• <strong>Handy:</strong> im Browser oben auf das Schloss-/„aA"-Symbol neben der Adresse tippen → „Benachrichtigungen" → „Erlauben".
      <br>• <strong>PC:</strong> auf das Schloss-Symbol links neben der Adresse klicken → „Benachrichtigungen: Zulassen".
      Danach diese Seite neu laden.</div>`;
    return;
  }
  if (st === 'on') {
    el.innerHTML = `<span class="pill" style="background:var(--good-bg);color:var(--good)">🔔 Benachrichtigungen sind an</span>
      <button class="ghost sm" id="push-test">Test senden</button><button class="ghost sm" id="push-off">Ausschalten</button>`;
  } else {
    el.innerHTML = `<div class="hint" style="margin-bottom:.5rem">🔔 <strong>Handy-Benachrichtigungen einschalten:</strong> Erinnerungen, Verschiebungen, Absagen und Angebote direkt aufs Handy – auch wenn die App geschlossen ist. Beim nächsten Schritt fragt dein Browser einmal um Erlaubnis – bitte auf „Erlauben" tippen.</div>
      <button class="sm" id="push-on">🔔 Jetzt einschalten</button>`;
  }
  const on = $('#push-on'); if (on) on.onclick = enablePush;
  const off = $('#push-off'); if (off) off.onclick = disablePush;
  const test = $('#push-test'); if (test) test.onclick = async () => { try { await api('/api/push/test', { method: 'POST' }); toast('Test-Benachrichtigung gesendet 🔔', 'ok'); } catch (e) { toast(e.message, 'err'); } };
}
function renderNotifications(notifs, unread) {
  const card = $('#notif-card');
  card.classList.remove('hidden'); // immer sichtbar – wegen Push-Schalter
  chimeOnIncrease('notif', unread || 0); // Ton, wenn neue Mitteilungen dazugekommen sind
  const icon = (k) => k === 'offer' ? '🎁' : k === 'shift' ? '🕐' : k === 'reminder' ? '⏰' : k === 'sign' ? '✍️' : 'ℹ️';
  const list = (notifs && notifs.length)
    ? `<div class="notif-list">${notifs.map((n) => {
        const needsSign = n.kind === 'sign' && n.ref_booking_id && (myBookingsCache || []).some((b) => b.id === n.ref_booking_id && b.needs_sign);
        return `<div class="notif ${n.read ? '' : 'unread'}">
        <span class="notif-ic">${icon(n.kind)}</span>
        <div class="notif-body"><div class="notif-msg">${esc(n.message)}</div>
          <div class="notif-time">${new Date(n.created_at).toLocaleString(LOCALE, { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
          ${needsSign ? `<button class="sm notif-sign" data-sign="${n.ref_booking_id}" style="margin-top:.5rem">${t('notif_sign_btn')}</button>` : ''}</div>
        ${n.read ? '' : '<span class="notif-dot"></span>'}
      </div>`; }).join('')}</div>
      ${unread ? `<div style="margin-top:.8rem"><button class="sec sm" id="notif-read">${t('notif_mark_read')}</button></div>` : ''}`
    : `<p class="hint">${t('notif_none')}</p>`;
  card.innerHTML = `<h2>${t('notif_title')} ${unread ? `<span class="badge offer">${t('notif_new', { n: unread })}</span>` : ''}</h2>
    <div class="push-ctl" id="push-ctl"></div>
    ${list}`;
  const b = $('#notif-read');
  if (b) b.onclick = async () => { try { await api('/api/my/notifications/read', { method: 'POST' }); syncStudent(); } catch (e) { toast(e.message, 'err'); } };
  card.querySelectorAll('[data-sign]').forEach((btn) => btn.onclick = () => {
    const bk = (myBookingsCache || []).find((x) => x.id === Number(btn.dataset.sign));
    if (bk) openSignModal(bk); else toast(t('lesson_not_found'), 'err');
  });
  refreshPushCtl();
}

function renderOffers(offers, wi) {
  const card = $('#offers-card');
  if (!offers.length) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const canTake = wi.remaining > 0;
  card.innerHTML = `<h2>${t('offers_title')} <span class="sub">${t('offers_sub')}</span></h2>
    ${!canTake ? `<p class="hint">${t('offers_limit')}</p>` : ''}
    <div class="blist">${offers.map((o) => `<div class="bitem warm">
      <div><div class="when">${WD[isoDow(o.date) - 1]} ${fmtShort(o.date)} · ${o.start_time} <span class="muted" style="font-weight:400">(${o.duration_min} ${t('min')})</span></div>
      <div class="meta">${o.from ? `<span class="pill">${t('offers_from', { name: esc(o.from) })}</span>` : `<span class="pill">${t('offers_anon')}</span>`} <span class="muted">${t('offers_take_q')}</span></div></div>
      <div class="inline">
        ${canTake ? `<button class="sm" data-take="${o.id}">${t('take')}</button>` : ''}
        <button class="ghost sm" data-decline="${o.id}">${t('no_time')}</button>
      </div></div>`).join('')}</div>`;
  card.querySelectorAll('[data-take]').forEach((b) => b.onclick = () => takeOffer(b.dataset.take));
  card.querySelectorAll('[data-decline]').forEach((b) => b.onclick = () => declineOffer(b.dataset.decline));
}

function offerBooking(id) {
  const vorname = firstName(state.user?.name);
  modal(`<h3>${t('offer_give_title')}</h3>
    <p class="hint">${t('offer_give_text')}</p>
    <p style="margin:.5rem 0 .3rem">${t('offer_recognizable_q')}</p>
    <div class="offer-choice">
      <button class="sec" id="of-anon">${t('offer_anon_btn')}<span class="oc-sub">${t('offer_anon_sub')}</span></button>
      ${vorname ? `<button class="sec" id="of-named">${t('offer_named_btn', { name: esc(vorname) })}<span class="oc-sub">${t('offer_named_sub')}</span></button>` : ''}
    </div>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">${t('abort')}</button></div>`);
  const go = async (named) => {
    try { await api('/api/bookings/' + id + '/offer', { method: 'POST', body: { named } }); closeModal(); toast(t('toast_offered'), 'ok'); syncStudent(); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#of-anon').onclick = () => go(false);
  const n = $('#of-named'); if (n) n.onclick = () => go(true);
}
async function withdrawOffer(id) {
  try { await api('/api/bookings/' + id + '/withdraw', { method: 'POST' }); toast('Angebot zurückgenommen', 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}
async function takeOffer(id) {
  try { await api('/api/bookings/' + id + '/take', { method: 'POST' }); celebrate(t('celebrate_taken')); toast(t('toast_taken'), 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}
async function declineOffer(id) {
  try { await api('/api/bookings/' + id + '/decline', { method: 'POST' }); toast(t('toast_declined'), 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}

function renderSlots(slots, mine) {
  const mineToday = new Set(mine.filter((b) => b.date === state.date && b.status !== 'cancelled').map((b) => b.start_time));
  const el = $('#slots');
  const dayName = WD_LONG[isoDow(state.date) - 1];
  if (!slots.length) {
    el.innerHTML = `<div class="empty-book">
      <div class="eb-icon">📅</div>
      <div class="eb-title">${esc(t('slots_none_title', { day: dayName }))}</div>
      <p class="eb-text">${t('slots_none_text')}</p>
      <button data-find-next="${state.date}">${t('find_free_long')}</button>
    </div>`;
    el.querySelector('[data-find-next]').onclick = () => jumpToNextFree(addDays(state.date, 1));
    return;
  }
  el.innerHTML = slots.map((s) => {
    const mineHere = mineToday.has(s.start);
    let cls = s.state, inner = '';
    let sub = t('slot_dur', { start: s.start, end: s.end, dur: s.duration });
    // Freier (fliessender) Start: Dauer waehlt der Schüler selbst -> passende Beschriftung.
    if (s.state === 'free' && !mineHere) {
      const md = Number(s.maxDur || s.duration);
      const my = String(state.user?.allowed_durations || '80').split(',').map(Number).filter((n) => n > 0 && n <= md).sort((a, b) => a - b);
      sub = my.length > 1 ? t('slot_free_from_multi', { start: s.start, durs: my.join('/') }) : t('slot_free_from', { start: s.start, dur: my[0] || s.duration });
    }
    if (mineHere) {
      // Nur frei stornierbar, solange die Storno-Frist nicht erreicht ist –
      // sonst 🔒 (Verwalten/Anbieten geht oben unter „Meine Fahrstunden").
      const cancelH = state.settings?.cancel_hours || 48;
      const freeCancel = hoursUntil(state.date, s.start) >= cancelH;
      inner = `<span class="tag b">${t('slot_mine')}</span>`
        + (freeCancel ? `<button class="ghost sm" data-cancel-time="${s.start}">${t('cancel')}</button>`
                      : `<span class="pill">${t('slot_locked')}</span>`);
      cls = 'booked';
    } else if (s.state === 'free') {
      inner = `<span class="tag g">${t('free')}</span><button class="sm" data-book="${s.start}" data-dur="${s.duration}" data-maxdur="${s.maxDur || s.duration}">${t('book')}</button>`;
    } else if (s.state === 'booked') {
      inner = `<span class="tag x">${t('taken')}</span>`;
    } else if (s.state === 'offered') {
      inner = `<span class="tag x">${t('offered_out')}</span>`;
    } else if (s.state === 'blocked') {
      inner = `<span class="tag x">${esc(s.blockTitle || t('taken'))}</span>`;
    } else if (s.state === 'past') {
      inner = `<span class="tag x">${t('past')}</span>`;
    } else if (s.state === 'toofar') {
      inner = `<span class="tag x">${t('toofar')}</span>`;
    } else {
      inner = `<span class="tag x">${t('closed')}</span>`;
    }
    return `<div class="slot ${cls}">
      <div class="time">${s.start}</div>
      <div class="dur">${sub}</div>
      ${inner}
    </div>`;
  }).join('');
  // Tag hat Slots, aber nichts Freies (alles belegt/vorbei) und keiner gehört mir:
  // sanfter Hinweis + Sprung zum nächsten freien Termin.
  const anyFree = slots.some((s) => s.state === 'free');
  const anyMine = slots.some((s) => mineToday.has(s.start));
  if (!anyFree && !anyMine) {
    el.insertAdjacentHTML('beforeend', `<div class="slots-hint">
      ${t('slots_none_free')}
      <button class="sec sm" data-find-next>${t('find_free')}</button>
    </div>`);
    el.querySelector('[data-find-next]').onclick = () => jumpToNextFree(addDays(state.date, 1));
  }
  el.querySelectorAll('[data-book]').forEach((b) => b.onclick = () => bookSlot(b.dataset.book, Number(b.dataset.dur), Number(b.dataset.maxdur || 0)));
  el.querySelectorAll('[data-cancel-time]').forEach((b) => b.onclick = () => {
    const bk = myBookingsCache.find((x) => x.date === state.date && x.start_time === b.dataset.cancelTime);
    if (bk) cancelBooking(bk.id);
  });
}

function bookSlot(start, dur, maxDur) {
  const cancelH = state.settings?.cancel_hours || 48;
  const lockH = state.settings?.lock_hours || 36;
  let allowed = String(state.user?.allowed_durations || '80').split(',').map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  // Fliessender Tagesplan: nur Dauern anbieten, die an diesem Start noch in den Tag passen.
  const cap = Number(maxDur) > 0 ? Number(maxDur) : Infinity;
  const fits = allowed.filter((d) => d <= cap);
  if (!fits.length) {
    const capTxt = cap < Infinity ? t('book_nofit_cap', { n: cap }) : '';
    modal(`<h3>${t('book_title')}</h3>
      <div class="warnbox">${t('book_nofit', { cap: capTxt })}</div>
      <div class="actions"><button class="sec" onclick="window.__closeModal()">${t('close')}</button></div>`);
    return;
  }
  allowed = fits;
  const defDur = allowed.includes(80) ? 80 : allowed[allowed.length - 1];
  const durSelect = allowed.length > 1
    ? `<div class="field"><label>${t('choose_duration')}</label><select id="bk-dur">${allowed.map((d) => `<option value="${d}" ${d === defDur ? 'selected' : ''}>${t('minutes_opt', { d })}</option>`).join('')}</select></div>`
    : '';
  modal(`<h3>${t('book_confirm_title')}</h3>
    <div class="warnbox">
      ${t('book_confirm_text')}
    </div>
    <p style="margin:.6rem 0 .2rem"><strong>${WD_LONG[isoDow(state.date) - 1]}, ${fmtShort(state.date)} ${t('at_time')}${start}${t('oclock')}</strong>${allowed.length > 1 ? '' : ` · ${allowed[0]} ${t('min')}`}</p>
    ${durSelect}
    <ul class="hint" style="margin:.4rem 0 .4rem;padding-inline-start:1.1rem">
      <li>${t('book_rule1', { h: `<strong>${cancelH}</strong>` })}</li>
      <li>${t('book_rule2', { h: `<strong>${lockH}</strong>` })}</li>
      <li>${t('book_rule3')}</li>
    </ul>
    ${state.settings?.policy_text ? `<div class="hint" style="border-top:1px solid var(--line);padding-top:.5rem;white-space:pre-line">${esc(state.settings.policy_text)}</div>` : ''}
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">${t('abort')}</button>
      <button id="bk-confirm">${t('book_go')}</button>
    </div>`);
  $('#bk-confirm').onclick = async () => {
    const chosen = $('#bk-dur') ? Number($('#bk-dur').value) : allowed[0];
    try {
      await api('/api/bookings', { method: 'POST', body: { date: state.date, start_time: start, duration_min: chosen } });
      closeModal(); celebrate(t('celebrate_booked')); toast(t('toast_booked'), 'ok'); syncStudent();
    } catch (e) { toast(e.message, 'err'); }
  };
}
async function cancelBooking(id) {
  if (!confirm(t('cancel_confirm'))) return;
  try { await api('/api/bookings/' + id, { method: 'DELETE' }); toast(t('toast_cancelled'), 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}
async function confirmBooking(id) {
  try { await api('/api/bookings/' + id + '/confirm', { method: 'POST' }); toast(t('toast_accepted'), 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}
async function rejectBooking(id) {
  if (!confirm('Diesen vom Fahrlehrer vorgeschlagenen Termin ablehnen? Der Fahrlehrer wird benachrichtigt und der Zeitpunkt wird wieder frei.')) return;
  try { await api('/api/bookings/' + id + '/reject', { method: 'POST' }); toast('Termin abgelehnt', 'ok'); syncStudent(); }
  catch (e) { toast(e.message, 'err'); }
}

// ====================== FAHRLEHRER ======================
function renderInstructor() {
  // Navigation läuft über das linke Edge-Menü (☰ am Bildschirmrand) –
  // daher keine obere Tab-Leiste mehr.
  app.innerHTML = header() + `<main>
    <div id="itab"></div>
  </main>`;
  wireLogout();
  drawInstrTab();
  mountEdgeMenus('instructor');
  refreshEventBadge();
}

async function refreshEventBadge() {
  try {
    const { unseen } = await api('/api/instructor/events');
    const el = $('#ev-badge');
    if (el) el.innerHTML = unseen ? `<span class="badge offer">${unseen}</span>` : '';
  } catch {}
}

function drawInstrTab() {
  app.querySelectorAll('.navtabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.instrTab));
  // Sanfte Einblendung beim Tab-Wechsel (nur bei Navigation, nicht bei Live-Refresh).
  const _it = $('#itab');
  if (_it) { _it.classList.remove('tab-in'); requestAnimationFrame(() => _it.classList.add('tab-in')); }
  const t = state.instrTab;
  if (t !== 'nachrichten') openConvo = null;
  if (t !== 'navigation') stopNavWatch(); // GPS-Verfolgung nur auf der Navi-Seite
  if (t === 'heute') return tabHeute();
  if (t === 'kalender') return tabKalender();
  if (t === 'navigation') return tabNavigation();
  if (t === 'codes') return tabCodes();
  if (t === 'schueler') return tabSchueler();
  if (t === 'planer') return tabPlaner();
  if (t === 'nachrichten') return tabNachrichten();
  if (t === 'theorie') return tabTheorie();
  if (t === 'arbeitszeiten') return tabArbeitszeiten();
  if (t === 'bewertungen') return tabBewertungen();
  if (t === 'protokoll') return tabProtokoll();
  if (t === 'einstellungen') return tabEinstellungen();
}

// ---- Tab: KI-Planer (Fahrlehrer) ----
// Aus der hinterlegten Verfuegbarkeit + freien Slots konkrete Terminvorschlaege
// erzeugen; ausgewaehlte werden als reservierte Vorschlaege an die Schueler geschickt.
const planState = { from: null, to: null, student: '', suggestions: null, loading: false };
async function tabPlaner() {
  const box = $('#itab');
  if (!planState.from) { planState.from = addDays(todayStr(), 1); planState.to = addDays(todayStr(), 14); }
  // Schuelerliste fuer das Auswahlfeld einmalig laden.
  if (!planState._students) {
    try { planState._students = (await api('/api/students')).students || []; } catch { planState._students = []; }
  }
  const studs = planState._students;
  const opts = `<option value="">Alle Fahrschüler</option>` +
    studs.map((s) => `<option value="${s.id}" ${String(planState.student) === String(s.id) ? 'selected' : ''}>${esc(s.name)}${s.availability ? '' : ' — ohne Verfügbarkeit'}</option>`).join('');
  box.innerHTML = `<div class="card" id="cap-card"><h2>📊 Deine Woche – frei &amp; ausgelastet</h2>
      <p class="hint">Dein Überblick: wie voll dein Kalender ist und wo noch Platz für Stunden ist. Tipp auf einen Tag, um dort direkt selbst einen Termin einzutragen.</p>
      <div id="cap-body">${gLoad('Lädt…')}</div></div>
    <div class="card">
    <h2>🧠 KI-Planer <span class="sub" style="font-weight:400;color:var(--muted);font-size:.8rem">— nur wenn du willst</span></h2>
    <p class="hint">Der Planer meldet sich nie von selbst. Wenn du magst, schaut er sich die <strong>Verfügbarkeit</strong> deiner Fahrschüler an und schlägt passende Termine vor – lückenlos in deine freien Slots, höchstens einer pro Tag &amp; Schüler. Du wählst aus und schickst sie als <strong>Vorschlag</strong> (die Schüler nehmen an oder lehnen ab). <strong>Du</strong> bleibst der Chef – eintragen kannst du jederzeit auch selbst im Kalender.</p>
    <div class="row">
      <div class="field"><label>Von</label><input type="date" id="pl-from" value="${planState.from}" min="${todayStr()}"></div>
      <div class="field"><label>Bis</label><input type="date" id="pl-to" value="${planState.to}" min="${todayStr()}"></div>
      <div class="field"><label>Fahrschüler</label><select id="pl-stu">${opts}</select></div>
    </div>
    <div class="inline" style="margin-top:.3rem"><button id="pl-go">${planState.loading ? 'Rechne…' : '✨ Vorschläge erzeugen'}</button></div>
    <div id="pl-out" style="margin-top:1rem"></div>
  </div>`;
  $('#pl-from').onchange = (e) => planState.from = e.target.value;
  $('#pl-to').onchange = (e) => planState.to = e.target.value;
  $('#pl-stu').onchange = (e) => planState.student = e.target.value;
  $('#pl-go').onclick = runPlanner;
  if (planState.suggestions) renderPlanResults();
  renderCapacityPanel();
}
// Auslastung & freie Zeiten – dein Überblick, wo noch Platz ist (mehr Stunden = mehr Verdienst).
async function renderCapacityPanel() {
  const el = $('#cap-body'); if (!el) return;
  let data;
  try { data = await api('/api/instructor/capacity?from=' + todayStr() + '&to=' + addDays(todayStr(), 13)); }
  catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  const days = (data.days || []).filter((d) => !d.closed);
  const unitMin = data.unit || 90;
  // Diese Woche (Mo–So um heute) zusammenfassen.
  const wkFrom = mondayOf(todayStr()), wkTo = addDays(wkFrom, 6);
  const wkDays = days.filter((d) => d.date >= wkFrom && d.date <= wkTo);
  const wkBooked = wkDays.reduce((a, d) => a + (d.bookedCount || 0), 0);
  const wkFreeMin = wkDays.reduce((a, d) => a + (d.free || 0), 0);
  const wkOccMin = wkDays.reduce((a, d) => a + (d.occ || 0), 0);
  const totMin = wkOccMin + wkFreeMin;
  const fullPct = totMin > 0 ? Math.round((wkOccMin / totMin) * 100) : 0;
  const freeH = (wkFreeMin / 60);
  const freeLessons = wkDays.reduce((a, d) => a + (d.freeLessons || 0), 0);
  const tiles = `<div class="cap-tiles">
    <div class="cap-tile"><b>${wkBooked}</b><span>Fahrstunden gebucht<br>(diese Woche)</span></div>
    <div class="cap-tile accent"><b>${fullPct}%</b><span>Kalender ausgelastet</span></div>
    <div class="cap-tile good"><b>${freeH < 10 ? freeH.toFixed(1) : Math.round(freeH)} h</b><span>noch frei · Platz für ≈ ${freeLessons} Stunden</span></div>
  </div>`;
  const rows = days.map((d) => {
    const pct = d.total > 0 ? Math.round((d.occ / d.total) * 100) : 0;
    const freeH2 = (d.free / 60);
    const isToday = d.date === todayStr();
    return `<button class="cap-row" data-day="${d.date}">
      <span class="cap-wd">${d.weekday}${isToday ? ' <em>heute</em>' : ''} <span class="cap-dt">${fmtShort(d.date)}</span></span>
      <span class="cap-bar"><span class="cap-fill" style="width:${pct}%"></span></span>
      <span class="cap-meta">${d.bookedCount}× · ${d.free > 0 ? `<span class="cap-free">${freeH2 < 10 ? freeH2.toFixed(1) : Math.round(freeH2)} h frei</span>` : '<span class="cap-full">voll</span>'}</span>
    </button>`;
  }).join('');
  el.innerHTML = tiles + `<div class="cap-list">${rows || '<p class="hint">In den nächsten zwei Wochen sind keine Arbeitstage eingetragen.</p>'}</div>`;
  el.querySelectorAll('[data-day]').forEach((b) => b.onclick = () => openDayInCalendar(b.dataset.day));
}
// Zu einem Tag im Kalender springen (dort kann der Fahrlehrer selbst eintragen).
function openDayInCalendar(date) {
  state.date = date; state.instrTab = 'kalender';
  app.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'kalender'));
  drawInstrTab();
}
async function runPlanner() {
  planState.loading = true;
  const btn = $('#pl-go'); if (btn) { btn.disabled = true; btn.textContent = 'Rechne…'; }
  try {
    const qs = `from=${planState.from}&to=${planState.to}` + (planState.student ? `&student_id=${planState.student}` : '');
    const r = await api('/api/instructor/plan?' + qs);
    planState.suggestions = r.suggestions || [];
    planState._withAvail = r.students_with_availability || 0;
    planState._picked = new Set(planState.suggestions.map((_, i) => i)); // anfangs alle ausgewaehlt
    renderPlanResults();
  } catch (e) { toast(e.message, 'err'); }
  finally { planState.loading = false; const b = $('#pl-go'); if (b) { b.disabled = false; b.textContent = '✨ Vorschläge erzeugen'; } }
}
function renderPlanResults() {
  const out = $('#pl-out'); if (!out) return;
  const sug = planState.suggestions || [];
  if (!sug.length) {
    out.innerHTML = planState._withAvail
      ? `<div class="reserve-note">Für diesen Zeitraum ergeben sich keine Vorschläge – die freien Slots passen gerade zu keiner hinterlegten Verfügbarkeit, oder die Woche ist voll. Probier einen größeren Zeitraum.</div>`
      : `<div class="reserve-note">🔶 Noch kein Fahrschüler hat eine <strong>Verfügbarkeit</strong> hinterlegt. Öffne einen Fahrschüler → Reiter „Verfügbarkeit" und trage ein, wann er kann – dann kann der Planer Vorschläge machen.</div>`;
    return;
  }
  // nach Datum gruppieren
  const byDate = {};
  sug.forEach((x, i) => { (byDate[x.date] ||= []).push({ ...x, _i: i }); });
  const rows = Object.keys(byDate).sort().map((d) => {
    const items = byDate[d].sort((a, z) => a.start_time.localeCompare(z.start_time));
    return `<div class="pl-day"><div class="pl-dh">${WD_LONG[isoDow(d) - 1]}, ${fmtShort(d)}</div>` +
      items.map((x) => `<label class="pl-row">
        <input type="checkbox" data-i="${x._i}" ${planState._picked.has(x._i) ? 'checked' : ''}>
        <span class="pl-time">${x.start_time}</span>
        <span class="pl-name">${esc(x.student_name)}</span>
        <span class="pl-dur">${x.duration_min} Min</span>
        <span class="pl-mode ${x.mode === 'pickup' ? 'pick' : ''}">${x.mode === 'pickup' ? '📍 Abholung' + (x.place ? ' · ' + esc(x.place) : '') : '🏫 Fahrschule'}</span>
      </label>`).join('') + `</div>`;
  }).join('');
  const n = planState._picked.size;
  out.innerHTML = `<div class="pl-head"><strong>${sug.length}</strong> Vorschlag${sug.length === 1 ? '' : 'e'}
      <button class="ghost sm" id="pl-all">Alle an/aus</button></div>
    <div class="pl-list">${rows}</div>
    <div class="actions" style="margin-top:1rem"><button id="pl-apply" ${n ? '' : 'disabled'}>✅ ${n} übernehmen &amp; vorschlagen</button></div>`;
  out.querySelectorAll('[data-i]').forEach((cb) => cb.onchange = () => {
    const i = Number(cb.dataset.i);
    if (cb.checked) planState._picked.add(i); else planState._picked.delete(i);
    const ap = $('#pl-apply'); const k = planState._picked.size;
    if (ap) { ap.disabled = !k; ap.innerHTML = `✅ ${k} übernehmen &amp; vorschlagen`; }
  });
  $('#pl-all').onclick = () => {
    if (planState._picked.size === sug.length) planState._picked.clear();
    else sug.forEach((_, i) => planState._picked.add(i));
    renderPlanResults();
  };
  $('#pl-apply').onclick = applyPlan;
}
async function applyPlan() {
  const sug = planState.suggestions || [];
  const items = [...planState._picked].map((i) => sug[i]).filter(Boolean)
    .map((x) => ({ student_id: x.student_id, date: x.date, start_time: x.start_time, duration_min: x.duration_min }));
  if (!items.length) return;
  if (!confirm(`${items.length} Termin${items.length === 1 ? '' : 'e'} als Vorschlag an die Fahrschüler schicken? Sie bekommen eine Benachrichtigung zum Annehmen oder Ablehnen.`)) return;
  const ap = $('#pl-apply'); if (ap) { ap.disabled = true; ap.textContent = 'Sende…'; }
  try {
    const r = await api('/api/instructor/plan/apply', { method: 'POST', body: { items } });
    const failed = (r.results || []).filter((x) => x.error).length;
    toast(`${r.created} Vorschlag${r.created === 1 ? '' : 'e'} verschickt${failed ? `, ${failed} nicht möglich (belegt)` : ''} ✓`, failed ? 'err' : 'ok');
    // erledigte Vorschlaege aus der Liste nehmen und neu zeichnen
    planState.suggestions = null; planState._picked = new Set();
    planState.from = planState.from; // beibehalten
    tabPlaner();
  } catch (e) { toast(e.message, 'err'); if (ap) { ap.disabled = false; ap.textContent = '✅ übernehmen'; } }
}

// ---- Tab: Nachrichten (Fahrlehrer) ----
let openConvo = null; // { id, name }
async function tabNachrichten() {
  const box = $('#itab');
  if (openConvo) return convoView(openConvo.id, openConvo.name);
  box.innerHTML = `<div class="card"><h2>✉️ Nachrichten</h2>${gLoad('Lädt…')}</div>`;
  let data = {};
  try { data = await api('/api/instructor/messages'); } catch (e) { box.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p></div>`; return; }
  const cs = data.conversations || [];
  const rows = cs.map((c) => `<button class="convo ${c.unread > 0 ? 'unread' : ''}" data-convo="${c.student_id}" data-name="${esc(c.student_name || '')}">
      <div class="convo-top"><strong>${esc(c.student_name || 'Fahrschüler')}</strong>
        ${c.unread > 0 ? `<span class="badge offer">${c.unread}</span>` : ''}
        <span class="hint" style="margin-left:auto">${msgTime(c.last_at)}</span></div>
      <div class="convo-last">${c.last_sender === 'instructor' ? '↩︎ ' : ''}${esc(String(c.last_body || '').slice(0, 80))}</div>
    </button>`).join('');
  box.innerHTML = `<div class="card">
    <h2>✉️ Nachrichten ${data.totalUnread ? `<span class="badge offer">${data.totalUnread} neu</span>` : ''}</h2>
    <p class="hint">Schreib mit deinen Fahrschülern. Neue Nachrichten schicken dir eine Push-Benachrichtigung (falls aktiviert). Du kannst auch ein Gespräch mit einem Schüler beginnen.</p>
    <button class="sec sm" id="msg-new" style="margin-bottom:.6rem">✏️ Neue Nachricht an …</button>
    <div class="convo-list">${cs.length ? rows : '<p class="hint">Noch keine Nachrichten.</p>'}</div>
  </div>`;
  box.querySelectorAll('[data-convo]').forEach((b) => b.onclick = () => { openConvo = { id: Number(b.dataset.convo), name: b.dataset.name }; convoView(openConvo.id, openConvo.name); });
  $('#msg-new').onclick = async () => {
    let students = [];
    try { students = (await api('/api/students')).students || []; } catch (e) { toast(e.message, 'err'); return; }
    if (!students.length) { toast('Noch keine Fahrschüler', 'err'); return; }
    modal(`<h3>Neue Nachricht</h3>
      <div class="field"><label>An</label><select id="mn-stu">${students.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Nachricht</label><textarea id="mn-body" rows="3" maxlength="2000"></textarea></div>
      <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="mn-go">Senden</button></div>`);
    $('#mn-go').onclick = async () => {
      const sid = Number($('#mn-stu').value), body = $('#mn-body').value.trim();
      if (!body) return;
      try { await api('/api/instructor/messages', { method: 'POST', body: { student_id: sid, body } }); closeModal(); openConvo = { id: sid, name: students.find((s) => s.id === sid)?.name || '' }; convoView(sid, openConvo.name); toast('Gesendet ✓', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
    };
  };
}
async function convoView(sid, name) {
  const box = $('#itab');
  box.innerHTML = `<div class="card">${gLoad('Lädt…')}</div>`;
  let data = {};
  try { data = await api('/api/instructor/messages/' + sid); } catch (e) { box.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p></div>`; return; }
  const nm = data.student?.name || name || 'Fahrschüler';
  const bubbles = (data.messages || []).map((m) => `<div class="msg ${m.sender === 'instructor' ? 'me' : 'them'}">
      <div class="msg-b">${esc(m.body)}</div><div class="msg-t">${m.sender === 'instructor' ? 'Du' : esc(nm)} · ${msgTime(m.created_at)}</div></div>`).join('')
    || '<p class="hint">Noch keine Nachrichten in diesem Gespräch.</p>';
  box.innerHTML = `<div class="card">
    <div class="inline" style="margin-bottom:.5rem"><button class="ghost sm" id="convo-back">← Zurück</button><h2 style="margin:0">${esc(nm)}</h2></div>
    <div class="msg-list" id="msg-list">${bubbles}</div>
    <div class="msg-compose"><textarea id="ci-body" rows="2" maxlength="2000" placeholder="Antwort schreiben …"></textarea><button class="sm" id="ci-send">Senden</button></div>
  </div>`;
  const list = $('#msg-list'); if (list) list.scrollTop = list.scrollHeight;
  $('#convo-back').onclick = () => { openConvo = null; tabNachrichten(); };
  const send = async () => {
    const body = $('#ci-body').value.trim(); if (!body) return;
    $('#ci-send').disabled = true;
    try { await api('/api/instructor/messages', { method: 'POST', body: { student_id: sid, body } }); $('#ci-body').value = ''; await convoView(sid, nm); }
    catch (e) { toast(e.message, 'err'); }
    finally { const b = $('#ci-send'); if (b) b.disabled = false; }
  };
  $('#ci-send').onclick = send;
  $('#ci-body').onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };
}

// ---- Tab: Bewertungen (Moderation) ----
let revFilter = 'alle';
const revStars = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
async function tabBewertungen() {
  const box = $('#itab');
  box.innerHTML = `<div class="card"><h2>⭐ Bewertungen</h2>${gLoad('Lädt…')}</div>`;
  let reviews = [];
  try { reviews = (await api('/api/instructor/reviews')).reviews || []; } catch (e) { box.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p></div>`; return; }
  reviews.forEach((r) => { if (typeof r.ratings === 'string') { try { r.ratings = JSON.parse(r.ratings); } catch { r.ratings = null; } } });
  const modeL = { full: 'voller Name', initials: 'abgekürzt', anon: 'anonym' };
  const total = reviews.length;
  const visible = reviews.filter((r) => r.published).length;
  const avg = total ? (reviews.reduce((s, r) => s + r.rating, 0) / total) : 0;
  // Durchschnitt je Kategorie ("Durchbewerten"-Auswertung) – nur aus Bewertungen mit Aufschlüsselung.
  const catAvg = REVIEW_CATS.map((c) => {
    const vals = reviews.map((r) => r.ratings && r.ratings[c.k]).filter((x) => x >= 1 && x <= 5);
    return { ...c, avg: vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null, n: vals.length };
  });
  const catAny = catAvg.some((c) => c.n > 0);
  const catAvgHTML = catAny ? `<div class="rev-catavg">
    <div class="rev-catavg-h">Durchschnitt je Kategorie</div>
    <div class="rev-catavg-grid">${catAvg.map((c) => `<div class="rev-catavg-item ${c.avg == null ? 'empty' : ''}">
      <span class="rev-ca-ic">${c.icon}</span>
      <span class="rev-ca-lb">${esc(c.label)}</span>
      <span class="rev-ca-val">${c.avg == null ? '–' : c.avg.toFixed(1) + '★'}</span>
      <span class="rev-ca-bar"><span style="width:${c.avg == null ? 0 : Math.round(c.avg / 5 * 100)}%"></span></span>
    </div>`).join('')}</div></div>` : '';
  // Sterne-Verteilung 5..1
  const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: reviews.filter((r) => r.rating === n).length }));
  const maxc = Math.max(1, ...dist.map((d) => d.c));
  const distHTML = dist.map((d) => `<div class="rev-dist-row"><span class="rev-dist-lbl">${d.n}★</span>
    <span class="rev-dist-bar"><span style="width:${Math.round(d.c / maxc * 100)}%"></span></span>
    <span class="rev-dist-c">${d.c}</span></div>`).join('');

  // Filter anwenden
  const shown = reviews.filter((r) =>
    revFilter === 'sichtbar' ? r.published :
    revFilter === 'verborgen' ? !r.published :
    revFilter === 'top' ? r.featured : true);

  const card = (r) => `<div class="rev-mod ${r.published ? '' : 'hidden-rev'} ${r.featured ? 'is-top' : ''}">
    <div class="rev-mod-top">
      <span class="rev-stars">${revStars(r.rating)}</span>
      ${r.featured ? '<span class="tag top">⭐ Top</span>' : ''}
      ${r.published ? '<span class="tag g">sichtbar</span>' : '<span class="tag x">verborgen</span>'}
      <span class="hint" style="margin-left:auto">${r.created_at ? r.created_at.slice(0, 10) : ''}</span>
    </div>
    <div class="rev-text">„${esc(r.text)}"</div>
    ${r.ratings ? `<div class="rev-mine-chips">${REVIEW_CATS.filter((c) => r.ratings[c.k]).map((c) => `<span class="rev-chip">${c.icon} ${esc(t('rc_' + c.k + '_label'))} <b>${r.ratings[c.k]}★</b></span>`).join('')}</div>` : ''}
    ${r.reply ? `<div class="rev-reply">↩︎ <em>${esc(r.reply)}</em></div>` : ''}
    <div class="rev-mod-who">
      <span class="pill">${esc(r.author_name || 'Ein Fahrschüler')}</span>
      <span class="hint">wird ${modeL[r.author_mode] || 'angezeigt'}${r.show_photo ? ' · mit Foto' : ''}${r.archived_at ? ' · bestanden ✓' : ''}${r.student_name && r.author_mode !== 'full' ? ` · von ${esc(r.student_name)}` : ''}</span>
    </div>
    <div class="rev-actions">
      <button class="ghost sm" data-feat="${r.id}" data-to="${r.featured ? 0 : 1}">${r.featured ? '☆ Top lösen' : '⭐ Top'}</button>
      <button class="sec sm" data-pub="${r.id}" data-to="${r.published ? 0 : 1}">${r.published ? '🙈 Verbergen' : '👁️ Sichtbar'}</button>
      <button class="ghost sm" data-edit="${r.id}">✏️ Bearbeiten</button>
      <button class="ghost sm" data-reply="${r.id}">↩︎ Antworten</button>
      <button class="ghost sm" data-copy="${r.id}">📋 Kopieren</button>
      <button class="danger sm" data-del="${r.id}">🗑️</button>
    </div>
  </div>`;

  const fTab = (k, l) => `<button class="rev-ftab ${revFilter === k ? 'active' : ''}" data-filter="${k}">${l}</button>`;
  box.innerHTML = `<div class="card">
    <div class="rev-head">
      <div class="rev-avg"><div class="rev-avg-num">${total ? avg.toFixed(1) : '–'}</div>
        <div class="rev-avg-stars">${revStars(Math.round(avg))}</div>
        <div class="hint">${total} Bewertung${total === 1 ? '' : 'en'} · ${visible} sichtbar</div></div>
      <div class="rev-dist">${distHTML}</div>
    </div>
    ${catAvgHTML}
    <p class="hint">Sichtbare Bewertungen laufen auf der Startseite als Laufschrift. „⭐ Top" hebt eine Stimme hervor (läuft ganz vorne). Bewertungen bleiben dauerhaft erhalten – auch nach bestandener Prüfung.</p>
    <div class="rev-toolbar">
      <div class="rev-ftabs">${fTab('alle', 'Alle')}${fTab('sichtbar', 'Sichtbar')}${fTab('verborgen', 'Verborgen')}${fTab('top', '⭐ Top')}</div>
      <button class="sm" id="rev-add">➕ Eintragen</button>
    </div>
    <div class="rev-modlist">${shown.length ? shown.map(card).join('') : '<p class="hint" style="padding:.6rem 0">Keine Bewertungen in dieser Ansicht.' + (total ? '' : ' Deine Fahrschüler geben in ihrem Portal unter „⭐ Bewertung" eine ab – oder trag selbst eine ein (z. B. mündliches Lob).') + '</p>'}</div>
  </div>`;

  box.querySelectorAll('[data-filter]').forEach((b) => b.onclick = () => { revFilter = b.dataset.filter; tabBewertungen(); });
  const patch = async (id, body) => { try { await api('/api/instructor/reviews/' + id, { method: 'PATCH', body }); tabBewertungen(); } catch (e) { toast(e.message, 'err'); } };
  box.querySelectorAll('[data-pub]').forEach((b) => b.onclick = () => patch(b.dataset.pub, { published: Number(b.dataset.to) }));
  box.querySelectorAll('[data-feat]').forEach((b) => b.onclick = () => patch(b.dataset.feat, { featured: Number(b.dataset.to) }));
  box.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('Diese Bewertung wirklich dauerhaft löschen?')) return;
    try { await api('/api/instructor/reviews/' + b.dataset.del, { method: 'DELETE' }); toast('Gelöscht', 'ok'); tabBewertungen(); }
    catch (e) { toast(e.message, 'err'); }
  });
  box.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => {
    const r = reviews.find((x) => x.id === Number(b.dataset.copy));
    const txt = `${revStars(r.rating)} „${r.text}" – ${r.author_name || 'Ein Fahrschüler'}`;
    navigator.clipboard.writeText(txt).then(() => toast('Kopiert ✓', 'ok')).catch(() => toast('Kopieren nicht möglich', 'err'));
  });
  box.querySelectorAll('[data-reply]').forEach((b) => b.onclick = () => {
    const r = reviews.find((x) => x.id === Number(b.dataset.reply));
    modal(`<h3>Auf Bewertung antworten</h3>
      <div class="rev-text">„${esc(r.text)}"</div>
      <div class="field" style="margin-top:.6rem"><label>Deine Antwort (öffentlich sichtbar)</label>
        <textarea id="rv-reply" rows="3" style="resize:vertical">${esc(r.reply || '')}</textarea></div>
      <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="rv-reply-go">Speichern</button></div>`);
    $('#rv-reply-go').onclick = async () => {
      try { await api('/api/instructor/reviews/' + r.id, { method: 'PATCH', body: { reply: $('#rv-reply').value } }); closeModal(); toast('Antwort gespeichert ✓', 'ok'); tabBewertungen(); }
      catch (e) { toast(e.message, 'err'); }
    };
  });
  box.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openRevEdit(reviews.find((x) => x.id === Number(b.dataset.edit))));
  $('#rev-add').onclick = () => openRevEdit(null);
}
// Bewertung bearbeiten (Sterne + Text) bzw. neu eintragen (mit Name)
function openRevEdit(r) {
  const isNew = !r;
  const cur = r || { rating: 5, text: '', author_name: '', featured: 0 };
  const starBtns = [1, 2, 3, 4, 5].map((i) => `<button type="button" class="rev-star" data-v="${i}">★</button>`).join('');
  modal(`<h3>${isNew ? 'Bewertung eintragen' : 'Bewertung bearbeiten'}</h3>
    ${errBox()}
    ${isNew ? '<p class="hint">Trag ein mündliches Lob oder eine bestehende Rezension ein – erscheint als Empfehlung auf der Startseite.</p>' : ''}
    <div class="field"><label>Sterne</label><div class="rev-starpick" id="rev-e-star" data-v="${cur.rating}">${starBtns}</div></div>
    ${isNew ? '<div class="field"><label>Name (wie er angezeigt wird)</label><input id="rev-e-name" value="' + esc(cur.author_name || '') + '" placeholder="z. B. Lena M. oder Anonym"></div>' : ''}
    <div class="field"><label>Text</label><textarea id="rev-e-text" rows="4" maxlength="800" style="resize:vertical" placeholder="z. B. Super Fahrlehrer, sehr geduldig – klare Empfehlung!">${esc(cur.text || '')}</textarea></div>
    <label class="ck-line"><input type="checkbox" id="rev-e-feat" ${cur.featured ? 'checked' : ''}> ⭐ Als Top anheften (läuft ganz vorne)</label>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="rev-e-go">${isNew ? 'Eintragen' : 'Speichern'}</button></div>`);
  const pick = $('#rev-e-star');
  const paint = () => pick.querySelectorAll('.rev-star').forEach((x) => x.classList.toggle('on', Number(x.dataset.v) <= Number(pick.dataset.v)));
  pick.querySelectorAll('.rev-star').forEach((x) => x.onclick = () => { pick.dataset.v = x.dataset.v; paint(); });
  paint();
  $('#rev-e-go').onclick = async () => {
    const body = { rating: Number(pick.dataset.v) || 5, text: $('#rev-e-text').value.trim(), featured: $('#rev-e-feat').checked ? 1 : 0 };
    if (body.text.length < 5) { showErr('Bitte ein paar Worte schreiben.'); return; }
    try {
      if (isNew) { body.author_name = $('#rev-e-name').value.trim(); await api('/api/instructor/reviews', { method: 'POST', body }); }
      else await api('/api/instructor/reviews/' + r.id, { method: 'PATCH', body });
      closeModal(); toast('Gespeichert ✓', 'ok'); tabBewertungen();
    } catch (e) { showErr(e.message); }
  };
}

// ---- Tab: Heute & Ziele (Tacho) ----
// Offene „Passwort vergessen"-Anfragen auf dem Dashboard – mit Ein-Tipp-Reset
async function renderResetRequests() {
  const el = $('#reset-reqs'); if (!el) return;
  let reqs = [];
  try { reqs = (await api('/api/instructor/reset-requests')).requests || []; } catch { return; }
  if (!reqs.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card resetreq">
    <h2>🔑 Passwort-Anfragen <span class="badge offer">${reqs.length}</span></h2>
    <p class="hint">Diese Fahrschüler haben „Passwort vergessen" angetippt. Tipp auf „Zurücksetzen" – du bekommst ein neues Passwort zum Weitergeben.</p>
    ${reqs.map((r) => `<div class="rr-item">
      <div><strong>${esc(r.student_name)}</strong> <span class="pill">${esc(r.username || '')}</span>
        <div class="hint">angefragt ${fmtDT(String(r.at).slice(0, 10), String(r.at).slice(11, 16))}</div></div>
      <button class="sm" data-rr="${r.student_id}" data-rrname="${esc(r.student_name)}" data-rruser="${esc(r.username || '')}">🔑 Zurücksetzen</button>
    </div>`).join('')}
  </div>`;
  el.querySelectorAll('[data-rr]').forEach((b) => b.onclick = () => openResetModal(Number(b.dataset.rr), b.dataset.rrname, b.dataset.rruser));
}
async function tabHeute() {
  const box = $('#itab');
  const gname = firstName(state.settings?.instructor_name || state.user?.name || '');
  box.innerHTML = `<div class="card hidden" id="live-card"></div>
    <div id="reset-reqs"></div>
    <div class="card" id="ds-card"></div>
    <div class="card">
      <div class="greet-big">${greetWord()}${gname ? ', <strong>' + esc(gname) + '</strong>' : ''} 👋</div>
      <div id="today-strip"></div>
      <h2 style="margin-top:.3rem">Wochenziel</h2><div id="gauge"></div><div id="tiles"></div>
    </div>
    <div class="card" id="contract-card"></div>
    <div class="card"><h2>Heute <span class="sub" id="today-sub"></span></h2><div id="today-list"></div></div>`;
  try {
    renderLiveInstr();
    renderResetRequests();
    renderInstrDayStatus();
    const stats = await api('/api/instructor/stats?date=' + todayStr());
    renderGauge($('#gauge'), stats);
    renderTiles($('#tiles'), stats);
    renderContract(stats);
    const ov = await api('/api/instructor/overview?from=' + todayStr() + '&to=' + todayStr());
    $('#today-sub').textContent = fmtDay(todayStr());
    renderInstrDay($('#today-list'), todayStr(), ov.bookings, ov.blocks);
    // Kurzüberblick für heute: wie viele Stunden, nächste offen
    const hm = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
    const nowD = new Date(), nowM = nowD.getHours() * 60 + nowD.getMinutes();
    const todays = (ov.bookings || []).filter((b) => b.status !== 'cancelled').sort((a, b) => a.start_time.localeCompare(b.start_time));
    const next = todays.find((b) => b.status === 'booked' && hm(b.start_time) + (b.duration_min || 0) > nowM);
    const strip = `<div class="today-strip">
      <div class="ts-item"><b>${todays.length}</b><span>Fahrstunden heute</span></div>
      ${next ? `<div class="ts-item accent"><b>${next.start_time}</b><span>nächste: ${esc((next.student_name || next.title || '').split(' ')[0] || 'Termin')}</span></div>`
        : `<div class="ts-item"><b>✓</b><span>keine offene Stunde mehr</span></div>`}
    </div>`;
    const strEl = $('#today-strip'); if (strEl) strEl.innerHTML = strip;
  } catch (e) { toast(e.message, 'err'); }
}

async function renderLiveInstr() {
  const card = $('#live-card'); if (!card) return;
  let st;
  try { st = await api('/api/instructor/live-status'); } catch { return; }
  const sharing = state.liveSharing;
  const soon = st.upcoming[0];
  if (!sharing && !soon) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const etaSaid = st.eta ? `<span class="pill" style="background:var(--good-bg);color:var(--good)">✅ gesagt: in ${st.eta.remaining} Min</span>` : '';
  // Abholort + Live-Standort des nächsten Schülers (Uber-Style)
  let studentBox = '';
  if (soon) {
    const vn = esc((soon.student_name || '').split(' ')[0]);
    const m = soon.meet || {}, sl = soon.studentLive;
    studentBox = `<div class="pickup-box">
      <div class="pb-line"><span class="muted">Abholort ${vn}:</span> <strong>${m.label ? esc(m.label) : '– noch nicht gesetzt –'}</strong></div>`;
    if (sl) {
      const route = `https://www.google.com/maps/dir/?api=1&destination=${sl.lat},${sl.lng}`;
      const upd = new Date(sl.updated_at).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
      studentBox += `<div class="inline" style="margin:.45rem 0"><span class="pill" style="background:var(--good-bg);color:var(--good)">📍 ${vn} teilt Standort · ${upd}</span></div>
        <div id="instr-live-map" class="live-map" style="height:220px"><div class="lm-loading"><span class="tire">🛞</span><span>Karte lädt …</span></div></div>
        <a class="pill" href="${route}" target="_blank" rel="noopener" style="text-decoration:none;background:var(--brand);color:#fff;margin-top:.5rem;display:inline-block">🧭 Route zu ${vn} (Navi öffnen)</a>`;
      // Karte nach dem Rendern initialisieren (Schüler-Punkt + Treffpunkt)
      setTimeout(() => {
        initLiveMap('instr-live-map').then(() => {
          const meetPos = (m.lat != null && m.lng != null) ? [m.lat, m.lng] : null;
          updateLiveMap('instr-live-map', [sl.lat, sl.lng], _youIcon(), meetPos, m.label ? esc(m.label) : null, _meetIcon());
        });
      }, 30);
    } else {
      studentBox += `<div class="hint" style="margin:.35rem 0 0">Sobald ${vn} den Standort teilt, siehst du hier genau, wo er/sie steht.</div>`;
    }
    studentBox += `</div>`;
  }
  card.innerHTML = `<h2>🛰️ Live-Standort</h2>
    ${soon ? `<p class="hint">In <strong>${soon.minutes} Min</strong> beginnt die Fahrstunde mit <strong>${esc(soon.student_name)}</strong> (${soon.start_time} Uhr). Teile deinen Standort, damit ${esc(soon.student_name.split(' ')[0])} sieht, wann du da bist.</p>`
      : '<p class="hint">Du kannst deinen Standort mit dem nächsten Fahrschüler teilen.</p>'}
    ${studentBox}
    <div class="eta-row">
      <span class="muted" style="font-size:.85rem">Bescheid geben:</span>
      <button class="sec sm" data-eta="5">in 5 Min da</button>
      <button class="sec sm" data-eta="10">in 10 Min</button>
      <button class="sec sm" data-eta="15">in 15 Min</button>
      ${etaSaid}${st.eta ? '<button class="ghost sm" data-eta="0">zurücknehmen</button>' : ''}
    </div>
    ${soon ? `<div class="eta-row">
      <span class="muted" style="font-size:.85rem">Später anfangen:</span>
      <button class="sec sm" data-delay="10">+10 Min</button>
      <button class="sec sm" data-delay="15">+15 Min</button>
      <button class="sec sm" data-delay="30">+30 Min</button>
      <span class="hint" style="width:100%;margin:.1rem 0 0">Verschiebt die heutigen Termine & sagt den Fahrschülern automatisch Bescheid.</span>
    </div>` : ''}
    ${sharing
      ? `<div class="inline"><span class="pill" style="background:var(--good-bg);color:var(--good)" id="live-instr" data-ts="">📍 Standort wird geteilt …</span>
         <button class="danger sm" id="live-stop">Teilen beenden</button></div>`
      : `<button id="live-start">🛰️ Standort jetzt teilen</button>
         <p class="hint" style="margin-top:.5rem">Dein Browser fragt einmal nach der Standort-Erlaubnis. Läuft, solange die App offen ist.</p>`}`;
  if (sharing) $('#live-stop').onclick = () => stopLiveShare();
  else $('#live-start').onclick = () => startLiveShare();
  card.querySelectorAll('[data-eta]').forEach((b) => b.onclick = async () => {
    const m = Number(b.dataset.eta);
    try {
      await api('/api/instructor/eta', { method: 'POST', body: { minutes: m } });
      toast(m ? `Dem Schüler gesagt: in ${m} Min da ✓` : 'Ansage zurückgenommen', 'ok');
      renderLiveInstr();
    } catch (e) { toast(e.message, 'err'); }
  });
  card.querySelectorAll('[data-delay]').forEach((b) => b.onclick = async () => {
    const m = Number(b.dataset.delay);
    if (!confirm(`Heutige Termine um ${m} Min nach hinten schieben? Die Fahrschüler werden benachrichtigt.`)) return;
    try {
      const r = await api('/api/instructor/delay-today', { method: 'POST', body: { minutes: m } });
      toast(`${r.moved} Termin(e) um ${r.minutes} Min verschoben ✓`, 'ok');
      renderLiveInstr();
    } catch (e) { toast(e.message, 'err'); }
  });
}

// Fahrlehrer: Tagesstatus setzen (läuft planmäßig / Verzögerung mit Grund).
async function renderInstrDayStatus() {
  const card = $('#ds-card'); if (!card) return;
  let status = null;
  try { status = (await api('/api/day-status?date=' + todayStr())).status; } catch {}
  const isDelay = status && status.state === 'delay';
  const cur = isDelay
    ? `<div class="ds-cur ds-delay"><span class="ds-ic">⏳</span><div><strong>Heute ~${status.minutes} Min später</strong>${status.reason ? '<br><span class="muted">' + esc(dsReason(status.reason)) + '</span>' : ''}${status.note ? '<br><span class="muted">' + esc(status.note) + '</span>' : ''}</div></div>`
    : (status && status.state === 'ok'
      ? `<div class="ds-cur ds-ok"><span class="ds-ic">✅</span><div><strong>Läuft planmäßig</strong><br><span class="muted">Deine Fahrschüler mit einem Termin heute wurden informiert.</span></div></div>`
      : `<div class="ds-cur"><span class="ds-ic">🕒</span><div><strong>Noch kein Status für heute</strong><br><span class="muted">Sag deinen Fahrschülern kurz Bescheid, wie der Tag läuft.</span></div></div>`);
  card.innerHTML = `<h2>Tagesstatus</h2>
    <p class="hint">Ein Tipp genügt: deine Fahrschüler mit einem Termin heute sehen sofort, ob alles planmäßig läuft – oder warum es später wird (Berufsverkehr, Glatteis, Schnee). Sie bekommen eine Push.</p>
    ${cur}
    <div id="ds-weather"></div>
    <div id="ds-traffic"></div>
    <div class="inline" style="margin-top:.7rem">
      <button class="${isDelay ? 'sec' : ''}" id="ds-ok">✅ Läuft planmäßig</button>
      <button class="sec" id="ds-delay">⏳ Verzögerung melden</button>
    </div>`;
  // Wetter-Hinweis (DWD): proaktiver Vorschlag, wenn Glätte/Schnee/Starkregen droht.
  (async () => {
    try {
      const wh = (await api('/api/instructor/weather-hint')).hint;
      const wbox = $('#ds-weather'); if (!wbox || !wh) return;
      wbox.innerHTML = `<div class="ds-weather"><div class="ds-ic">${wh.label.split(' ')[0]}</div>
        <div><div class="ds-t">Wetter-Hinweis: ${esc(wh.label.replace(/^\S+\s/, ''))}</div>
          <div class="ds-s">${esc(wh.detail)} Möchtest du das als Verzögerung melden?</div>
          <button class="sm" id="ds-wsuggest" style="margin-top:.5rem">⏳ Verzögerung wegen ${esc(wh.label)} melden</button></div></div>`;
      $('#ds-wsuggest').onclick = () => openDelayStatusModal(status, { reason: wh.reason, minutes: 15 });
    } catch {}
  })();
  // Verkehrs-Hinweis (TomTom): nur wenn ein Schlüssel hinterlegt ist und es staut.
  (async () => {
    try {
      const th = (await api('/api/instructor/traffic-hint')).hint;
      const tbox = $('#ds-traffic'); if (!tbox || !th) return;
      tbox.innerHTML = `<div class="ds-weather ds-jam"><div class="ds-ic">🚧</div>
        <div><div class="ds-t">Verkehrs-Hinweis: Stau</div>
          <div class="ds-s">${esc(th.detail)} Als Verzögerung melden?</div>
          <button class="sm" id="ds-tsuggest" style="margin-top:.5rem">⏳ Verzögerung wegen 🚧 Stau (${th.minutes} Min) melden</button></div></div>`;
      $('#ds-tsuggest').onclick = () => openDelayStatusModal(status, { reason: 'jam', minutes: th.minutes });
    } catch {}
  })();
  $('#ds-ok').onclick = async () => {
    try { const r = await api('/api/instructor/day-status', { method: 'POST', body: { state: 'ok' } });
      toast(`Planmäßig gemeldet${r.notified ? ` · ${r.notified} informiert` : ''} ✓`, 'ok'); renderInstrDayStatus(); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#ds-delay').onclick = () => openDelayStatusModal(status);
}
function openDelayStatusModal(status, prefill) {
  const curMin = prefill && prefill.minutes ? prefill.minutes : (status && status.state === 'delay' ? status.minutes : 15);
  const curReason = prefill && prefill.reason ? prefill.reason : (status && status.state === 'delay' ? status.reason : 'rush');
  const mins = [5, 10, 15, 20, 30, 45];
  modal(`<h3>⏳ Verzögerung melden</h3>
    <p class="hint">Wie viel später wird’s ungefähr – und warum? Deine Fahrschüler heute bekommen eine Push.</p>
    <label>Ungefähr</label>
    <div class="ds-chips" id="ds-min">${mins.map((m) => `<button type="button" class="ds-chip ${m === curMin ? 'on' : ''}" data-m="${m}">+${m} Min</button>`).join('')}</div>
    <label style="margin-top:.6rem">Grund</label>
    <div class="ds-chips" id="ds-reason">${DS_REASONS.map(([k, ic, lb]) => `<button type="button" class="ds-chip ${k === curReason ? 'on' : ''}" data-r="${k}">${ic} ${lb}</button>`).join('')}</div>
    <div class="field" style="margin-top:.6rem"><label>Notiz (optional)</label><input id="ds-note" maxlength="200" placeholder="z. B. Straße gesperrt, fahre außenrum" value="${status && status.note ? esc(status.note) : ''}"></div>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="ds-send">Melden & Push senden</button></div>`);
  let selMin = curMin, selReason = curReason;
  const wrapMin = $('#ds-min'), wrapR = $('#ds-reason');
  wrapMin.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { selMin = Number(b.dataset.m); wrapMin.querySelectorAll('.ds-chip').forEach((x) => x.classList.toggle('on', x === b)); });
  wrapR.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { selReason = b.dataset.r; wrapR.querySelectorAll('.ds-chip').forEach((x) => x.classList.toggle('on', x === b)); });
  $('#ds-send').onclick = async () => {
    try {
      const r = await api('/api/instructor/day-status', { method: 'POST', body: { state: 'delay', minutes: selMin, reason: selReason, note: $('#ds-note').value.trim() } });
      closeModal(); toast(`Verzögerung gemeldet${r.notified ? ` · ${r.notified} informiert` : ''} ✓`, 'ok'); renderInstrDayStatus();
    } catch (e) { toast(e.message, 'err'); }
  };
}

function renderTiles(el, stats) {
  const c = stats.counts || {};
  const targetMin = (stats.weekly.targetH || 0) * 60;
  const pct = targetMin > 0 ? Math.round((stats.weekly.minutes / targetMin) * 100) : 0;
  el.innerHTML = `<div class="tiles">
    <div class="tile brand"><div class="n">${c.lessons || 0}</div><div class="l">Fahrstunden diese Woche</div></div>
    <div class="tile good"><div class="n">${c.driven || 0}</div><div class="l">davon gefahren</div></div>
    <div class="tile ${c.noshow ? 'bad' : ''}"><div class="n">${c.noshow || 0}</div><div class="l">nicht erschienen</div></div>
    <div class="tile"><div class="n">${pct}%</div><div class="l">vom Wochenziel</div></div>
    ${c.vacationDays ? `<div class="tile"><div class="n">🌴 ${c.vacationDays}</div><div class="l">Urlaubstage (Woche)</div></div>` : ''}
  </div>`;
}

function gaugeSVG(minutes, targetH, loH, maxHFixed) {
  const value = minutes / 60;
  const maxH = maxHFixed ? Math.max(maxHFixed, value * 1.02) : Math.max(targetH * 1.4, value * 1.05, targetH + 2);
  const R = 74, cx = 100, cy = 96, sw = 15;
  // f in [0,1]: 0 = links, 1 = rechts, Bogen ueber oben
  const P = (f) => {
    const A = Math.PI * (1 - Math.min(1, Math.max(0, f)));
    return [cx + R * Math.cos(A), cy - R * Math.sin(A)];
  };
  const f = (h) => Math.min(1, Math.max(0, h / maxH));
  const arc = (f0, f1, color, w) => {
    if (f1 <= f0 + 0.001) return '';
    const [x0, y0] = P(f0), [x1, y1] = P(f1);
    return `<path d="M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" `
      + `stroke="${color}" stroke-width="${w || sw}" fill="none"/>`;
  };
  const vf = f(value);
  const [nx, ny] = P(vf);
  const [tx, ty] = P(f(targetH));
  const done = value >= targetH;
  return `<svg viewBox="0 0 200 112" width="220" height="123">
    ${arc(0, 1, '#232e3b')}
    ${arc(0, f(loH), '#e5605f')}
    ${arc(f(loH), f(targetH), '#e6b23a')}
    ${arc(f(targetH), 1, '#35c07d')}
    <line x1="${tx.toFixed(1)}" y1="${(ty - 9).toFixed(1)}" x2="${tx.toFixed(1)}" y2="${(ty + 9).toFixed(1)}" stroke="#0e131a" stroke-width="2"/>
    <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#e7edf5" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="#e7edf5"/>
    <text x="14" y="110" font-size="9" fill="#93a1b3">0</text>
    <text x="172" y="110" font-size="9" fill="#93a1b3">${Math.round(maxH)} h</text>
    ${done ? '<text x="100" y="60" font-size="17" text-anchor="middle">🎯</text>' : ''}
  </svg>`;
}

// Vertrag & Monat: Ist-Stunden gegen Minimum (80), immer-ausgezahlt (130) und Monatsziel.
// Mobil-first: eine klare Leiste mit Marken + drei Status-Zeilen.
function renderContract(stats) {
  const el = $('#contract-card'); if (!el) return;
  const m = stats.monthly || {};
  const h = (min) => (min || 0) / 60;
  const totalH = h(m.minutes);            // gefahren + gebucht (+ Urlaub-Gutschrift)
  const doneH = h(m.doneMinutes);         // schon gefahren
  const minH = Number(m.contractMinH) || 80;
  const paidH = Number(m.contractPaidH) || 130;
  const targetH = Number(m.targetH) || minH;
  const fmt = (x) => (Math.round(x * 10) / 10).toLocaleString(LOCALE);
  // Skala: bis zum größten relevanten Wert + etwas Luft.
  const scale = Math.max(paidH, targetH, totalH) * 1.06;
  const pct = (x) => Math.max(0, Math.min(100, (x / scale) * 100));
  const monName = new Date(m.from || todayStr()).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
  // Ampel: unter Minimum = amber, ab Minimum = blau, ab 130 = grün (alles extra)
  const fillCls = totalH >= paidH ? 'ct-fill-good' : (totalH >= minH ? 'ct-fill-ok' : 'ct-fill-lo');
  // Status-Zeilen
  const line = (ok, label, val) => `<div class="ct-line ${ok ? 'on' : ''}"><span class="ct-dot">${ok ? '✓' : '•'}</span><span class="ct-lb">${label}</span><span class="ct-vl">${val}</span></div>`;
  const toMinLine = totalH >= minH
    ? line(true, `Minimum (${fmt(minH)} h)`, 'erreicht')
    : line(false, `Minimum (${fmt(minH)} h)`, `noch ${fmt(minH - totalH)} h`);
  const toPaidLine = totalH >= paidH
    ? line(true, `Immer ausgezahlt (${fmt(paidH)} h)`, `+${fmt(totalH - paidH)} h extra`)
    : line(false, `Immer ausgezahlt (${fmt(paidH)} h)`, `noch ${fmt(paidH - totalH)} h`);
  const toTargetLine = targetH > paidH
    ? (totalH >= targetH ? line(true, `Monatsziel (${fmt(targetH)} h)`, 'erreicht') : line(false, `Monatsziel (${fmt(targetH)} h)`, `noch ${fmt(targetH - totalH)} h`))
    : '';
  el.innerHTML = `<h2>📄 Vertrag &amp; Monat <span class="sub">${esc(monName)}</span></h2>
    <div class="ct-big"><b>${fmt(totalH)}</b> h <span class="ct-sub">gefahren ${fmt(doneH)} h · gebucht ${fmt(totalH - doneH)} h</span></div>
    <div class="ct-meter">
      <div class="ct-track"><div class="ct-fill ${fillCls}" style="width:${pct(totalH)}%"></div>
        <div class="ct-done" style="width:${pct(doneH)}%"></div>
        <span class="ct-mark" style="left:${pct(minH)}%"></span>
        <span class="ct-mark paid" style="left:${pct(paidH)}%"></span>
        ${targetH > paidH ? `<span class="ct-mark tgt" style="left:${pct(targetH)}%"></span>` : ''}
      </div>
      <div class="ct-scale"><span style="left:${pct(minH)}%">${fmt(minH)}</span><span style="left:${pct(paidH)}%">${fmt(paidH)}</span>${targetH > paidH ? `<span style="left:${pct(targetH)}%">${fmt(targetH)}</span>` : ''}</div>
    </div>
    <div class="ct-lines">${toMinLine}${toPaidLine}${toTargetLine}</div>`;
}

function renderGauge(el, stats) {
  const w = stats.weekly, d = stats.daily;
  el.innerHTML = `<div class="gauge-wrap">
    <div class="gauge">
      ${gaugeSVG(w.minutes, w.targetH, w.loH)}
      <div class="val">${minToH(w.minutes).toFixed(1).replace('.0', '')} h</div>
      <div class="cap">diese Woche · Ziel ${w.targetH} h</div>
      <div class="goal">${w.minutes / 60 >= w.targetH ? '✅ Ziel erreicht!' : `noch ${((w.targetH * 60 - w.minutes) / 60).toFixed(1)} h`} · davon gefahren ${minToH(w.doneMinutes).toFixed(1)} h</div>
    </div>
    <div class="gauge">
      ${gaugeSVG(d.minutes, d.targetH, d.targetH * 0.8)}
      <div class="val">${minToH(d.minutes).toFixed(1).replace('.0', '')} h</div>
      <div class="cap">heute · Ziel ${d.targetH} h</div>
    </div>
    ${stats.monthly ? `<div class="gauge">
      ${gaugeSVG(stats.monthly.minutes, stats.monthly.targetH, stats.monthly.targetH * 0.75, stats.monthly.maxH)}
      <div class="val">${minToH(stats.monthly.minutes).toFixed(1).replace('.0', '')} h</div>
      <div class="cap">dieser Monat · Ziel ${stats.monthly.targetH} h</div>
      <div class="goal">${stats.monthly.minutes / 60 >= stats.monthly.targetH ? '✅ Ziel erreicht!' : `noch ${((stats.monthly.targetH * 60 - stats.monthly.minutes) / 60).toFixed(1)} h`} · davon gefahren ${minToH(stats.monthly.doneMinutes).toFixed(1)} h</div>
    </div>` : ''}
    <div style="flex:1;min-width:260px">
      <div class="cap muted" style="margin-bottom:.3rem">Woche im Überblick</div>
      <div class="weekbars">${weekBars(stats)}</div>
    </div>
  </div>`;
}

function weekBars(stats) {
  const max = Math.max(60, ...stats.perDay.map((d) => d.minutes), stats.weekly.targetH / 7 * 60);
  return stats.perDay.map((d, i) => {
    const h = Math.round((d.minutes / max) * 100);
    return `<div class="b" title="${WD[i]} ${fmtShort(d.date)}: ${hLabel(d.minutes)}">
      <div class="bar ${d.date === todayStr() ? 'today' : ''}" style="height:${h}%"></div>
      <div class="lbl">${WD[i]}</div>
    </div>`;
  }).join('');
}

// ---- Tag-Liste (Fahrlehrer) mit Aktionen ----
function renderInstrDay(el, date, bookings, blocks) {
  window.__instrBookings = bookings;
  const items = [];
  for (const bl of blocks) items.push({ kind: 'block', ...bl });
  for (const b of bookings) items.push({ kind: 'booking', ...b });
  items.sort((a, b) => a.start_time.localeCompare(b.start_time));
  if (!items.length) { el.innerHTML = '<p class="muted">Keine Termine an diesem Tag.</p>'; return; }
  el.innerHTML = `<div class="blist">${items.map((it) => it.kind === 'block' ? blockItem(it) : instrBookingItem(it)).join('')}</div>`;
  el.querySelectorAll('[data-mark]').forEach((b) => b.onclick = () => openMarkModal(b.dataset.mark));
  el.querySelectorAll('[data-cancel]').forEach((b) => b.onclick = () => instrCancel(b.dataset.cancel));
  el.querySelectorAll('[data-delblock]').forEach((b) => b.onclick = () => delBlock(b.dataset.delblock));
  el.querySelectorAll('[data-startlesson]').forEach((b) => b.onclick = () => instrStartLesson(b.dataset.startlesson));
  el.querySelectorAll('[data-route]').forEach((b) => b.onclick = () => { const bk = items.find((x) => x.kind === 'booking' && String(x.id) === b.dataset.route); if (bk) openInstrRoute(bk); });
}
// Fahrlehrer stempelt den genauen Startzeitpunkt der Fahrstunde.
async function instrStartLesson(id) {
  try {
    await api('/api/bookings/' + id + '/start', { method: 'POST' });
    toast('Startzeit festgehalten ▶️', 'ok');
    drawInstrTab();
  } catch (e) { toast(e.message, 'err'); }
}

function instrBookingItem(b) {
  const gear = b.gearbox ? `<span class="badge ${b.gearbox}">${b.gearbox === 'schalt' ? 'Schalter' : 'Automatik'}</span>` : '';
  const st = b.status === 'done' ? '<span class="badge done">gefahren</span>'
    : b.status === 'offered' ? '<span class="badge offer">🔄 wird abgegeben</span>'
    : b.confirmed === 0 ? '<span class="badge reserved">🔶 reserviert (wartet auf Bestätigung)</span>'
    : '<span class="badge booked">✅ bestätigt</span>';
  const who = b.student_name ? esc(b.student_name) : (b.title ? esc(b.title) : 'Eigener Termin');
  const end = addMin(b.start_time, b.duration_min);
  return `<div class="bitem">
    <div>
      <div class="when">${b.start_time}–${end} <span class="muted" style="font-weight:400">(${b.duration_min} Min)</span></div>
      <div class="meta"><strong>${who}</strong> ${b.student_phone ? '· ' + esc(b.student_phone) + ' ' + contactButtons(b.student_phone, `Hallo ${(b.student_name || '').split(' ')[0]}, wegen deiner Fahrstunde am ${fmtShort(b.date)} um ${b.start_time} Uhr:`) : ''}</div>
      <div class="meta">${st} ${typeBadge(b.lesson_type)} ${gear} ${b.plate ? '· 🚘 ' + esc(b.plate) : ''} ${b.meet_label ? '· 📍 ' + esc(b.meet_label) : ''} ${b.note ? '· ' + esc(b.note) : ''}${b.started_at ? ' · 🕒 gestartet ' + new Date(b.started_at).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) + ' Uhr' : ''}</div>
    </div>
    <div class="inline">
      ${b.student_id && b.status !== 'done' && b.meet_lat != null
        ? `<button class="ghost sm" data-route="${b.id}" title="Route & Navigation zum Fahrschüler">🧭</button>` : ''}
      ${b.student_id && b.status !== 'done' && b.confirmed !== 0 && !b.started_at
        ? `<button class="ghost sm" data-startlesson="${b.id}" title="Genauen Startzeitpunkt festhalten">▶️ Start</button>` : ''}
      ${b.student_id && b.status !== 'done'
        ? `<button class="sm" data-mark="${b.id}">✅ Abschließen &amp; abhaken</button>`
        : `<button class="sec sm" data-mark="${b.id}">Bearbeiten</button>`}
      <button class="ghost sm" data-cancel="${b.id}">Stornieren</button>
    </div>
  </div>`;
}
function blockItem(bl) {
  const label = bl.type === 'theorie' ? '📚 Theorie' : (bl.type === 'frei' ? '🌴 Frei' : '⛔ Blockiert');
  return `<div class="bitem warm">
    <div>
      <div class="when">${bl.start_time}–${bl.end_time}</div>
      <div class="meta">${label} · <strong>${esc(bl.title)}</strong> ${bl.count_hours ? '<span class="pill">zählt als Arbeitszeit</span>' : ''}</div>
    </div>
    <button class="ghost sm" data-delblock="${bl.id}">Löschen</button>
  </div>`;
}

function addMin(hhmm, min) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Modal: Stunde bearbeiten / abschließen
function openMarkModal(id) {
  const b = window.__instrBookings.find((x) => String(x.id) === String(id));
  if (!b) return;
  const _who = b.student_name ? esc(b.student_name) : (b.title ? esc(b.title) : 'Termin');
  modal(`<h3>✅ Fahrstunde abschließen</h3>
    <p class="mk-sub">${_who} · ${WD[isoDow(b.date) - 1]} ${fmtShort(b.date)} · ${b.start_time} Uhr</p>

    <div class="mk-step glass" style="--i:0">
      <div class="mk-step-h"><span class="mk-step-n">1</span> Hat die Fahrstunde stattgefunden?</div>
      <div class="row">
        <div class="field"><label>Erschienen?</label>
          <select id="m-att">
            <option value="" ${b.attended == null ? 'selected' : ''}>– offen –</option>
            <option value="1" ${b.attended === 1 ? 'selected' : ''}>Ja, da gewesen</option>
            <option value="0" ${b.attended === 0 ? 'selected' : ''}>Nein, nicht erschienen</option>
          </select></div>
        <div class="field"><label>Abgeschlossen?</label>
          <select id="m-status">
            <option value="booked" ${b.status === 'booked' ? 'selected' : ''}>noch offen</option>
            <option value="done" ${b.status === 'done' ? 'selected' : ''}>abgeschlossen ✓</option>
          </select></div>
      </div>
      <div class="row">
        <div class="field"><label>Dauer (Min)</label><input id="m-dur" type="number" value="${b.duration_min}" min="0" step="5"></div>
        <div class="field"><label>Verspätung (Min)</label><input id="m-late" type="number" value="${b.late_minutes || 0}" min="0" step="5"></div>
      </div>
      <div class="row">
        <div class="field"><label>Getriebe</label>
          <select id="m-gear">
            <option value="">– offen –</option>
            <option value="schalt" ${b.gearbox === 'schalt' ? 'selected' : ''}>Schalter</option>
            <option value="automatik" ${b.gearbox === 'automatik' ? 'selected' : ''}>Automatik</option>
          </select></div>
        <div class="field"><label>Fahrt-Art</label>
          <select id="m-type">
            <option value="">Normal</option>
            <option value="ueberland" ${b.lesson_type === 'ueberland' ? 'selected' : ''}>🌄 Überland</option>
            <option value="autobahn" ${b.lesson_type === 'autobahn' ? 'selected' : ''}>🛣️ Autobahn</option>
            <option value="nacht" ${b.lesson_type === 'nacht' ? 'selected' : ''}>🌙 Nachtfahrt</option>
          </select></div>
      </div>
      <div class="hint" id="m-hint"></div>
      <details class="mk-more"><summary>Mehr Angaben (Kennzeichen, Datum/Zeit, Treffpunkt, Notiz)</summary>
        <div class="field" style="margin-top:.5rem"><label>Kennzeichen (optional)</label><input id="m-plate" value="${esc(b.plate || '')}" placeholder="z.B. B-FS 1234"></div>
        <div class="row">
          <div class="field"><label>Datum (verschieben)</label><input type="date" id="m-date" value="${b.date}"></div>
          <div class="field"><label>Uhrzeit</label><input id="m-time" value="${b.start_time}"></div>
        </div>
        <div class="field"><label>Treffpunkt (Live-Standort &amp; Navigation)</label>
          <div class="inline"><input id="m-meet" value="${esc(b.meet_label || '')}" placeholder="z.B. vor der Schule" style="flex:1">
            <button class="sec sm" id="m-meet-here" type="button">📍 Standort</button></div>
          <div class="hint" id="m-meet-info" style="margin:.3rem 0 0">${b.meet_lat != null ? '✓ Koordinaten hinterlegt (ETA möglich)' : 'Ohne Koordinaten nur als Text.'}</div>
        </div>
        <div class="field"><label>Grund (bei Absage/Nichterscheinen)</label><input id="m-reason" value="${esc(b.reason || '')}"></div>
        <div class="field"><label>Interne Notiz (nur für dich)</label><input id="m-note" value="${esc(b.note || '')}"></div>
      </details>
    </div>

    ${b.student_id ? `<div class="mk-step glass" style="--i:1">
      <div class="mk-step-h"><span class="mk-step-n">2</span> Was habt ihr gemacht?</div>
      <div class="field"><label>📝 Rückmeldung an den Schüler <span class="muted">(sieht der Schüler)</span></label>
        <textarea id="m-feedback" rows="2" placeholder="z.B. Kreisverkehr &amp; Vorfahrt geübt – nächstes Mal Einparken." style="resize:vertical">${esc(b.feedback || '')}</textarea></div>
      <details class="mk-curr" id="m-curr-wrap" ${b.status !== 'done' ? 'open' : ''}><summary>📋 Ausbildungskarte Klasse B – jeden Punkt abhaken</summary>
        <input id="m-curr-search" placeholder="🔎 suchen (z. B. Kreisverkehr)" autocomplete="off" style="margin:.5rem 0">
        <div id="m-curr-list" class="mk-curr-list">${gLoad('Lädt…')}</div>
      </details>
      <button class="adk-open" id="m-adk" type="button">📋 Ausbildungskarte im Vollbild</button>
    </div>` : ''}

    ${b.student_id ? `<div class="mk-step glass" style="--i:2">
      <div class="mk-step-h"><span class="mk-step-n">3</span> Was übt ihr als Nächstes?</div>
      <div id="m-recos" class="mk-recos"><span class="hint">Wird aus der Ausbildungskarte vorgeschlagen …</span></div>
    </div>` : ''}

    ${b.student_id ? `<div class="mk-step glass" style="--i:3">
      <div class="mk-step-h"><span class="mk-step-n">4</span> Unterschriften</div>
      <label class="sign-lb">✍️ Deine Unterschrift <span class="muted">(Fahrlehrer, auf dem Tablet)</span></label>
      <div id="m-isig-body"></div>
      <label class="ck-line" style="justify-content:flex-start;margin-top:.6rem" id="m-sign-line"><input type="checkbox" id="m-sign" ${b.signed_at ? '' : 'checked'}> ✍️ Unterschrift vom Fahrschüler anfordern <span class="muted">(auf seinem Handy)</span></label>
      ${b.signed_at ? '<div class="hint" style="margin:.1rem 0 0">✓ Der Fahrschüler hat bereits unterschrieben.</div>' : ''}
    </div>` : ''}

    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="m-save">Speichern</button>
    </div>`);
  let meetLat = b.meet_lat, meetLng = b.meet_lng;
  const adkBtn = $('#m-adk');
  if (adkBtn) adkBtn.onclick = () => { closeModal(); openTrainingCard(b.student_id, b.student_name || ''); };
  // Fahrlehrer-Unterschrift: gespeicherte verwenden oder neu zeichnen.
  let isigPad = null;
  const isigStored = state.settings?.instructor_signature || '';
  let isigMode = (b.instr_signature || isigStored) ? 'stored' : 'pad';
  let isigShown = b.instr_signature || isigStored; // was gerade als „stored" angezeigt wird
  const renderIsig = () => {
    const box = $('#m-isig-body'); if (!box) return;
    if (isigMode === 'stored' && isigShown) {
      box.innerHTML = `<div class="isig-stored"><img src="${isigShown}" class="isig-prev" alt="Unterschrift Fahrlehrer">
        <button type="button" class="ghost sm" id="isig-redo">✏️ Neu zeichnen</button></div>`;
      $('#isig-redo').onclick = () => { isigMode = 'pad'; renderIsig(); };
    } else {
      box.innerHTML = `<div class="sign-pad-wrap"><canvas id="m-isig-pad" class="sign-pad"></canvas>
          <button type="button" class="ghost sm sign-clear" id="isig-clear">Löschen</button></div>
        <div class="inline" style="margin-top:.3rem">
          <label class="ck-line" style="justify-content:flex-start;margin:0"><input type="checkbox" id="isig-remember" ${isigStored ? '' : 'checked'}> Als meine Standard-Unterschrift merken</label>
          ${isigShown ? '<button type="button" class="ghost sm" id="isig-usestored" style="margin-left:auto">gespeicherte verwenden</button>' : ''}
        </div>`;
      isigPad = attachSignPad($('#m-isig-pad'));
      $('#isig-clear').onclick = () => isigPad.clear();
      const us = $('#isig-usestored'); if (us) us.onclick = () => { isigMode = 'stored'; isigPad = null; renderIsig(); };
    }
  };
  if (b.student_id) renderIsig();
  // „Was habt ihr heute gemacht?" – Ausbildungskarte pro Fahrstunde abhaken,
  // je Punkt mit Stand: 🔴 muss noch geübt · 🟡 geübt · 🟢 sitzt ganz gut.
  let currDone = {};            // Zeitstempel je Punkt (früher erledigt)
  let currAdk = { items: {} };  // Gesamt-Häufigkeit + letzter Stand je Punkt
  const renderCurr = () => {
    const list = $('#m-curr-list'); if (!list) return;
    list.innerHTML = CURRICULUM.map((sec) => `<div class="mk-sec"><div class="mk-sec-t">${esc(sec.title)}</div>${sec.items.map((it, i) => {
      const k = currKey(sec.key, i);
      const agg = currAdk.items[k];
      const prev = agg && agg.count
        ? `<em class="mk-prev">schon ${agg.count}×${agg.lastStatus ? ' · ' + currStatusMeta(agg.lastStatus).dot + ' ' + currStatusMeta(agg.lastStatus).tiny : ''}</em>`
        : (currDone[k] ? '<em class="mk-prev">schon geübt</em>' : '');
      return `<div class="mk-item2" data-txt="${esc((sec.title + ' ' + it).toLowerCase())}">
        <span class="mk-lbl">${esc(it)} ${prev}</span>
        <div class="mk-seg" data-cc="${k}">
          <button type="button" class="st-mehr" data-s="mehr" title="muss noch geübt werden">🔴</button>
          <button type="button" class="st-geuebt" data-s="geuebt" title="geübt">🟡</button>
          <button type="button" class="st-ok" data-s="ok" title="sitzt ganz gut">🟢</button>
        </div></div>`;
    }).join('')}</div>`).join('');
    list.querySelectorAll('.mk-seg').forEach((seg) => seg.querySelectorAll('button').forEach((btn) => btn.onclick = () => {
      const wasOn = btn.classList.contains('on');
      seg.querySelectorAll('button').forEach((b2) => b2.classList.remove('on'));
      if (!wasOn) btn.classList.add('on');
    }));
  };
  // Empfehlung fürs Wiederholen: zuletzt 🔴 oder lange nicht mehr geübt.
  const renderRecos = () => {
    const box = $('#m-recos'); if (!box) return;
    const items = currAdk.items || {};
    const red = (currAdk.needWork || []).slice();
    const now = Date.now(); const STALE = 21 * 864e5;
    const daysAgo = (d) => d ? Math.round((now - (Date.parse(d + 'T12:00:00') || now)) / 864e5) : null;
    const stale = Object.keys(items).filter((k) => !red.includes(k) && items[k].lastStatus !== 'ok' && items[k].lastDate && (now - (Date.parse(items[k].lastDate + 'T12:00:00') || now)) > STALE)
      .sort((a, z) => (items[a].lastDate || '').localeCompare(items[z].lastDate || ''));
    const recos = [...red.map((k) => ({ k, why: 'red' })), ...stale.map((k) => ({ k, why: 'stale' }))].slice(0, 8);
    if (!recos.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="mk-recos-t">🔁 Vorschlag fürs Wiederholen</div>
      <div class="mk-recos-list">${recos.map((r) => {
        const lbl = currLabel(r.k); if (!lbl) return '';
        const dz = daysAgo(items[r.k] && items[r.k].lastDate);
        return `<button type="button" class="mk-reco ${r.why}" data-reco="${r.k}">${r.why === 'red' ? '🔴' : '🕒'} ${esc(lbl)}${dz != null ? ` <span>· vor ${dz} T</span>` : ''}</button>`;
      }).join('')}</div>`;
    box.querySelectorAll('[data-reco]').forEach((btn) => btn.onclick = () => {
      const wrap = $('#m-curr-wrap'); if (wrap) wrap.open = true;
      const seg = document.querySelector(`#m-curr-list .mk-seg[data-cc="${btn.dataset.reco}"]`);
      const item = seg && seg.closest('.mk-item2');
      if (item) { item.style.display = ''; item.scrollIntoView({ block: 'center', behavior: 'smooth' }); item.classList.add('reco-flash'); setTimeout(() => item.classList.remove('reco-flash'), 1600); }
    });
  };
  if (b.student_id) {
    api('/api/students/' + b.student_id + '/training').then((r) => { currDone = r.training || {}; currAdk = r.adk || { items: {} }; renderCurr(); renderRecos(); })
      .catch(() => { const el = $('#m-curr-list'); if (el) el.innerHTML = '<span class="hint">Ausbildungskarte nicht ladbar.</span>'; });
    const cs = $('#m-curr-search');
    if (cs) cs.oninput = () => { const q = cs.value.trim().toLowerCase(); document.querySelectorAll('#m-curr-list .mk-item2').forEach((l) => { l.style.display = (!q || l.dataset.txt.includes(q)) ? '' : 'none'; }); };
  }
  $('#m-meet-here').onclick = async () => {
    try { const c = await getPosOnce(); meetLat = c.latitude; meetLng = c.longitude;
      $('#m-meet-info').innerHTML = `✓ Koordinaten übernommen (${meetLat.toFixed(4)}, ${meetLng.toFixed(4)})`; toast('Treffpunkt gesetzt', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  };
  const grace = state.settings?.late_grace_min || 20;
  const baseDur = b.duration_min;
  const recalc = () => {
    const late = Number($('#m-late').value) || 0;
    const hint = $('#m-hint');
    if (late > grace) {
      const suggested = Math.max(0, baseDur - late);
      hint.innerHTML = `Mehr als ${grace} Min zu spät → die Zeit läuft ab dem vereinbarten Beginn. Vorschlag: <strong>${suggested} Min</strong> Fahrzeit. <button class="sec sm" id="m-apply-dur" type="button">übernehmen</button>`;
      const ab = $('#m-apply-dur'); if (ab) ab.onclick = () => { $('#m-dur').value = suggested; };
    } else { hint.textContent = ''; }
  };
  $('#m-late').oninput = recalc; recalc();
  $('#m-save').onclick = async () => {
    try {
      const att = $('#m-att').value;
      const body = { gearbox: $('#m-gear').value, plate: $('#m-plate').value, duration_min: Number($('#m-dur').value),
        status: $('#m-status').value, note: $('#m-note').value, reason: $('#m-reason').value,
        feedback: $('#m-feedback').value,
        late_minutes: Number($('#m-late').value) || 0, attended: att === '' ? null : (att === '1'),
        lesson_type: $('#m-type').value || 'normal',
        meet_label: $('#m-meet').value, meet_lat: meetLat ?? '', meet_lng: meetLng ?? '' };
      if ($('#m-date').value !== b.date) body.date = $('#m-date').value;
      if ($('#m-time').value !== b.start_time) body.start_time = $('#m-time').value;
      const sign = $('#m-sign');
      if (sign && sign.checked && $('#m-status').value === 'done' && att !== '0') body.request_sign = true;
      // heute behandelte Ausbildungs-Themen mit Stand mitschicken ({k, s})
      const curr = [...document.querySelectorAll('#m-curr-list .mk-seg')].map((seg) => {
        const on = seg.querySelector('button.on');
        return on ? { k: seg.dataset.cc, s: on.dataset.s } : null;
      }).filter(Boolean);
      if (curr.length) body.curriculum = curr;
      // Fahrlehrer-Unterschrift: neu gezeichnet -> mitschicken (+ optional merken); sonst gespeicherte anwenden.
      if (b.student_id) {
        if (isigMode === 'pad' && isigPad && isigPad.drawn()) {
          body.instr_signature = isigPad.url();
          if ($('#isig-remember')?.checked) body.remember_signature = true;
        } else if (isigMode === 'stored' && isigShown && !b.instr_signature) {
          body.instr_signature = isigShown; // gespeicherte Unterschrift für diese Stunde übernehmen
        }
      }
      await api('/api/bookings/' + id, { method: 'PATCH', body });
      closeModal(); toast(body.request_sign ? 'Abgeschlossen ✓ – Unterschrift angefordert' : 'Gespeichert ✓', 'ok'); refreshEventBadge(); drawInstrTab();
    } catch (e) { toast(e.message, 'err'); }
  };
}
window.__closeModal = closeModal;
window.__openMarkModal = openMarkModal;

// Fahrstunde NACHTRAGEN (Fahrlehrer): gefahrene Stunde mit echtem Datum+Uhrzeit eintragen
function openLogLessonModal(sid, name) {
  const s = state.settings || {};
  modal(`<h3>➕ Fahrstunde nachtragen</h3>
    <p class="hint">Trage eine bereits gefahrene Stunde für <strong>${esc(name)}</strong> ein – mit dem <strong>echten Fahrdatum &amp; Uhrzeit</strong>. Das Eintragedatum (heute) wird automatisch zusätzlich vermerkt, damit klar ist: gefahren am X, eingetragen am Y.</p>
    <div class="row">
      <div class="field"><label>Fahrdatum</label><input type="date" id="lg-date" value="${todayStr()}"></div>
      <div class="field"><label>Uhrzeit (Beginn)</label><input id="lg-time" value="" placeholder="z.B. 20:00"></div>
    </div>
    <div class="row">
      <div class="field"><label>Dauer (Min)</label><input type="number" id="lg-dur" value="${s.lesson_min || 80}" min="5" step="5"></div>
      <div class="field"><label>Verspätung (Min)</label><input type="number" id="lg-late" value="0" min="0" step="5"></div>
    </div>
    <div class="field"><label>Fahrt-Art</label>
      <select id="lg-type"><option value="">Normal</option><option value="ueberland">🌄 Überland</option><option value="autobahn">🛣️ Autobahn</option><option value="nacht">🌙 Nachtfahrt</option></select></div>
    <label class="ck-line"><input type="checkbox" id="lg-att" checked> Fahrschüler ist erschienen (gefahren)</label>
    <div class="field"><label>Vermerk <span class="muted">(sieht der Fahrschüler – z.B. Verlauf/Besonderes)</span></label>
      <textarea id="lg-note" rows="3" placeholder="z.B. 20 Min zu spät gekommen, restliche 60 Min gefahren – Kreisverkehr & Vorfahrt geübt." style="resize:vertical"></textarea></div>
    <details class="lg-inv"><summary>🧾 Abweichendes Rechnungsdatum (optional)</summary>
      <p class="hint">Falls diese Stunde auf der Rechnung an einem anderen Tag/Uhrzeit erscheint (z.B. weil am Fahrtag die 495-Min-Tagesgrenze schon voll ist). Der Fahrschüler sieht dann klar: gefahren am … · auf der Rechnung zu sehen am …</p>
      <div class="row">
        <div class="field"><label>Rechnungs-Datum</label><input type="date" id="lg-invdate"></div>
        <div class="field"><label>Rechnungs-Uhrzeit</label><input id="lg-invtime" placeholder="z.B. 09:00"></div>
      </div>
    </details>
    <div class="actions"><button class="sec" onclick="window.__closeModal()">Abbrechen</button><button id="lg-save">Nachtragen</button></div>`);
  $('#lg-save').onclick = async () => {
    const date = $('#lg-date').value, time = $('#lg-time').value.trim();
    if (!date || !time) { toast('Bitte Fahrdatum und Uhrzeit angeben', 'err'); return; }
    try {
      await api('/api/instructor/log-lesson', { method: 'POST', body: {
        student_id: sid, date, start_time: time,
        duration_min: Number($('#lg-dur').value), late_minutes: Number($('#lg-late').value) || 0,
        lesson_type: $('#lg-type').value || 'normal', attended: $('#lg-att').checked,
        feedback: $('#lg-note').value,
        invoice_date: $('#lg-invdate').value || '', invoice_time: $('#lg-invtime').value.trim() } });
      closeModal(); toast('Fahrstunde nachgetragen ✓', 'ok');
      try { refreshEventBadge(); } catch {}
      if (typeof tabSchueler === 'function' && $('#itab')) { /* Liste ggf. aktuell halten */ }
    } catch (e) { toast(e.message, 'err'); }
  };
}

// fsmanager-Eintrag verwalten (Fahrlehrer): pro gefahrener Stunde ein abweichendes
// fsmanager-Datum/-zeit setzen. Zeigt die Minuten je fsmanager-Tag (Warnung > 495).
function openInvoiceModal(sid, name) {
  modal(`<h3>🧾 Rechnungsdatum – ${esc(name)}</h3>
    <p class="hint">Eine Stunde wird an ihrem <strong>Fahrdatum</strong> gefahren, kann aber auf der <strong>Rechnung</strong> an einem anderen Tag/Uhrzeit erscheinen (z.&nbsp;B. weil am Fahrtag die <strong>495-Min-Tagesgrenze</strong> schon voll ist). Trag hier das Rechnungsdatum ein – der Fahrschüler sieht <em>beides</em> klar: „gefahren am … · auf der Rechnung zu sehen am …". Die Summe je Rechnungstag unten warnt, sobald ein Tag über 495 Min ginge.</p>
    <div id="inv-body"><p class="hint">Lädt…</p></div>
    <div class="actions"><button onclick="window.__closeModal()">Fertig</button></div>`, 'wide');
  const render = async () => {
    const box = $('#inv-body'); if (!box) return;
    let data; try { data = await api('/api/students/' + sid + '/lessons'); } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    const lessons = (data.lessons || []).filter((l) => l.attended !== 0)
      .sort((a, z) => (a.date + a.start_time).localeCompare(z.date + z.start_time));
    // Minuten je fsmanager-Tag (fsmanager-Datum, sonst Fahrdatum)
    const byDay = {};
    lessons.forEach((l) => { const d = l.invoice_date || l.date; byDay[d] = (byDay[d] || 0) + (l.duration_min || 0); });
    const dayRows = Object.keys(byDay).sort().map((d) => {
      const m = byDay[d];
      const over = m > 495;
      return `<div class="inv-day${over ? ' over' : ''}"><span>${fmtDT(d)}</span><span>${m} Min (${(m / 60).toFixed(1).replace('.', ',')} h)${over ? ' ⚠️ über 495' : ''}</span></div>`;
    }).join('');
    const padT = (t) => t ? (String(t).length === 4 ? '0' + t : String(t)) : '';
    const rows = lessons.map((l) => {
      const art = (l.lesson_type && l.lesson_type !== 'normal') ? ' · ' + lessonTypeLabel(l.lesson_type) : '';
      const cur = l.invoice_date || '';
      const p1 = addDays(l.date, 1), p2 = addDays(l.date, 2), p3 = addDays(l.date, 3);
      const custom = cur && cur !== p1 && cur !== p2 && cur !== p3;
      const chip = (label, val, on) => `<button class="inv-chip${on ? ' on' : ''}" data-set="${val}">${label}</button>`;
      return `<div class="inv-row" data-id="${l.id}">
        <div class="inv-pair">
          <span class="inv-tag drove">🚗 Gefahren am</span>
          <input type="date" class="inv-gd" value="${l.date}" aria-label="Fahrdatum">
          <input type="time" class="inv-gt" value="${padT(l.start_time)}" aria-label="Fahr-Uhrzeit">
          <span class="inv-dur">${l.duration_min} Min${art}</span>
        </div>
        <div class="inv-pair">
          <span class="inv-tag bill">🧾 Auf der Rechnung zu sehen am:</span>
          <div class="inv-chips">
            ${chip('wie gefahren', '', !cur)}
            ${chip('+1 Tag', p1, cur === p1)}
            ${chip('+2 Tage', p2, cur === p2)}
            ${chip('+3 Tage', p3, cur === p3)}
            <button class="inv-chip inv-custom-btn${custom ? ' on' : ''}" data-custom="1">📅 anderer Tag …</button>
          </div>
        </div>
        <div class="inv-custom" ${custom ? '' : 'hidden'}>
          <span class="inv-tag ghost">🧾 genau am</span>
          <input type="date" class="inv-d" value="${cur}" aria-label="Rechnungs-Datum">
          <input type="time" class="inv-t" value="${padT(l.invoice_time)}" aria-label="Rechnungs-Uhrzeit">
          <button class="sm inv-save">Übernehmen</button>
          <button class="ghost sm inv-clear">✕ leeren</button>
        </div>
      </div>`;
    }).join('');
    const anyOver = Object.values(byDay).some((m) => m > 495);
    box.innerHTML = `<div class="inv-days"><div class="inv-days-h">Minuten je Rechnungstag</div>${dayRows || '<span class="hint">–</span>'}${anyOver ? '<div class="inv-legend">🔴 Rot = dieser Tag läge über der 495-Min-Grenze. Verschiebe unten eine Stunde per Rechnungsdatum auf einen freien Tag – die Summe rechnet sich sofort neu.</div>' : ''}</div>
      <div class="inv-list">${rows || '<p class="hint">Noch keine gefahrenen Stunden.</p>'}</div>`;
    box.querySelectorAll('.inv-row').forEach((row) => {
      const id = row.dataset.id;
      const patch = async (body, okMsg) => {
        try { await api('/api/bookings/' + id, { method: 'PATCH', body }); toast(okMsg, 'ok'); render(); }
        catch (e) { toast(e.message, 'err'); }
      };
      // 🚗 Gefahren: Fahrdatum/-uhrzeit ändern (auto-speichern beim Ändern)
      const gd = row.querySelector('.inv-gd'), gt = row.querySelector('.inv-gt');
      const saveDrove = () => { if (gd.value && gt.value) patch({ date: gd.value, start_time: gt.value }, 'Fahrdatum geändert ✓'); };
      if (gd) gd.onchange = saveDrove;
      if (gt) gt.onchange = saveDrove;
      // 🧾 Rechnung: Schnell-Chips, ein Tipp -> sofort gespeichert
      row.querySelectorAll('.inv-chip[data-set]').forEach((c) => c.onclick = () => patch({ invoice_date: c.dataset.set, invoice_time: '' }, c.dataset.set ? 'Rechnungsdatum gesetzt ✓' : 'Wie gefahren ✓'));
      // „anderer Tag …" klappt das genaue Datum/Uhrzeit auf
      const cb = row.querySelector('.inv-custom-btn');
      if (cb) cb.onclick = () => { const cx = row.querySelector('.inv-custom'); if (cx) cx.hidden = !cx.hidden; };
      // Genauer Tag + Uhrzeit auf der Rechnung – speichert sofort beim Ändern (kein Extra-Klick nötig)
      const rd = row.querySelector('.inv-d'), rt = row.querySelector('.inv-t');
      const saveBill = () => patch({ invoice_date: rd.value, invoice_time: rt.value }, rd.value ? 'Rechnung gesetzt ✓' : 'Wie gefahren ✓');
      if (rd) rd.onchange = saveBill;
      if (rt) rt.onchange = saveBill;
      const sv = row.querySelector('.inv-save');
      if (sv) sv.onclick = saveBill;
      const cl = row.querySelector('.inv-clear');
      if (cl) cl.onclick = () => patch({ invoice_date: '', invoice_time: '' }, 'Rechnung geleert – wie gefahren ✓');
    });
  };
  render();
}

async function instrCancel(id) {
  const reason = prompt('Grund für die Absage (optional, z.B. Krankheit) – wird dem Schüler mitgeteilt:');
  if (reason === null) return; // abgebrochen
  const q = reason.trim() ? '?reason=' + encodeURIComponent(reason.trim()) : '';
  try { await api('/api/bookings/' + id + q, { method: 'DELETE' }); toast('Abgesagt · Schüler informiert', 'ok'); refreshEventBadge(); drawInstrTab(); }
  catch (e) { toast(e.message, 'err'); }
}
async function delBlock(id) {
  if (!confirm('Eintrag löschen?')) return;
  try { await api('/api/blocks/' + id, { method: 'DELETE' }); toast('Gelöscht', 'ok'); drawInstrTab(); }
  catch (e) { toast(e.message, 'err'); }
}

// ---- Tab: Kalender (Tag & eigener Termin) ----
async function tabKalender() {
  const box = $('#itab');
  const mode = state.calMode || 'tag';
  box.innerHTML = `<div class="card">
    <div class="dateline">
      <div class="viewtoggle">
        <button data-mode="tag" class="${mode === 'tag' ? 'active' : ''}">Tag</button>
        <button data-mode="woche" class="${mode === 'woche' ? 'active' : ''}">Woche</button>
        <button data-mode="monat" class="${mode === 'monat' ? 'active' : ''}">Monat</button>
      </div>
      <button class="sec sm" id="k-prev">‹</button>
      <span class="day" id="k-label"></span>
      <button class="sec sm" id="k-next">›</button>
      <input type="date" id="k-date" style="max-width:160px">
      ${mode === 'tag' ? '<button class="ghost sm" id="k-block" style="margin-left:auto"></button>' : ''}
      <button class="ghost sm" id="k-late"${mode === 'tag' ? '' : ' style="margin-left:auto"'}>⏱️ Ich komme später</button>
      <button class="ghost sm" id="k-gap">🧩 Lücken schließen</button>
      <button class="ghost sm" id="k-bulk">📋 Sammel-Eintragen</button>
      <button class="sm" id="k-add">+ Eigener Termin</button>
    </div>
    <div id="k-list"></div>
  </div>`;
  box.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { state.calMode = b.dataset.mode; tabKalender(); });
  $('#k-date').value = state.date;
  const shift = (dir) => {
    if (mode === 'monat') state.date = addMonths(state.date, dir);
    else state.date = addDays(state.date, dir * (mode === 'woche' ? 7 : 1));
    loadK();
  };
  $('#k-prev').onclick = () => shift(-1);
  $('#k-next').onclick = () => shift(1);
  $('#k-date').onchange = (e) => { state.date = e.target.value; loadK(); };
  $('#k-add').onclick = () => openAddBooking();
  $('#k-gap').onclick = () => openGapModal();
  $('#k-bulk').onclick = () => openBulkBooking();
  $('#k-late').onclick = () => openLateModal();
  loadK();
}

// ---- Sammel-Eintragen: bestehende Termine schnell übernehmen ----
async function openBulkBooking() {
  let students = [];
  try { students = (await api('/api/students')).students; } catch {}
  const nameList = students.map((s) => esc(s.name)).join(' · ');
  modal(`<h3>📋 Termine sammeln eintragen</h3>
    <p class="hint" style="margin-bottom:.5rem">Trag deine schon vereinbarten Fahrstunden hier untereinander ein – eine pro Zeile. Ich prüfe alles und zeige dir erst eine Vorschau, bevor etwas gespeichert wird.</p>
    <div class="bulk-help">
      <div class="bh-row"><span class="bh-k">Aufbau</span><span><b>Name, Datum, Uhrzeit, Dauer</b> <span class="muted">(Dauer optional → ${state.settings?.lesson_min || 80} Min)</span></span></div>
      <div class="bh-row"><span class="bh-k">Beispiel</span><code>Maria, 22.7., 14:00, 80</code></div>
      <div class="bh-row"><span class="bh-k">Geht auch</span><span class="muted">22.07.2026 · 14 Uhr ohne Jahr (nimmt das nächste Vorkommen)</span></div>
    </div>
    ${students.length ? `<details class="bulk-names"><summary>Deine ${students.length} Fahrschüler anzeigen</summary><div class="bn-list">${nameList}</div></details>` : '<p class="hint">Noch keine Fahrschüler angelegt.</p>'}
    <div class="field"><label>Termine (eine pro Zeile)</label>
      <textarea id="bk-text" rows="7" placeholder="Maria, 22.7., 14:00, 80&#10;Jason, 22.7., 16:00&#10;Lea, 24.7., 12:00, 120"></textarea></div>
    <label class="bulk-past"><input type="checkbox" id="bk-past" checked> Vergangene Termine als <strong>„gefahren"</strong> übernehmen <span class="muted">(für die Historie / gefahrene Stunden)</span></label>
    <div id="bk-preview"></div>
    <div class="actions" style="justify-content:space-between">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <div class="inline" style="gap:.5rem">
        <button class="sec" id="bk-check">Vorschau prüfen</button>
        <button id="bk-commit" disabled>Eintragen</button>
      </div>
    </div>`, 'wide');
  const preview = $('#bk-preview');
  const commitBtn = $('#bk-commit');
  const runCheck = async (commit) => {
    const text = $('#bk-text').value;
    if (!text.trim()) { toast('Bitte erst Termine eintragen', 'err'); return; }
    const pastAsDone = $('#bk-past') ? $('#bk-past').checked : true;
    try {
      const r = await api('/api/instructor/bookings/bulk', { method: 'POST', body: { text, commit, pastAsDone } });
      if (commit && r.committed) {
        closeModal();
        const extra = r.doneCount ? ` (${r.futureCount} neu · ${r.doneCount} als gefahren)` : '';
        toast(`${r.created} Termin${r.created === 1 ? '' : 'e'} eingetragen ✓${extra}`, 'ok');
        if (state.instrTab === 'kalender') loadK(); else drawInstrTab();
        return;
      }
      renderBulkPreview(preview, r);
      commitBtn.disabled = r.okCount === 0;
      commitBtn.textContent = r.okCount ? `${r.okCount} Termin${r.okCount === 1 ? '' : 'e'} eintragen` : 'Eintragen';
    } catch (e) { toast(e.message, 'err'); }
  };
  $('#bk-check').onclick = () => runCheck(false);
  commitBtn.onclick = () => runCheck(true);
}
function renderBulkPreview(el, r) {
  const icon = (row) => row.status !== 'ok' ? '⚠️' : row.done ? '🅿️' : '✅';
  const line = (row) => {
    const head = row.status === 'ok'
      ? `<b>${esc(row.student)}</b> · ${WD[isoDow(row.date) - 1]} ${fmtShort(row.date)} · ${row.time} <span class="muted">(${row.dur} Min)</span>${row.done ? ' <span class="pill" style="background:var(--good-bg);color:var(--good)">gefahren</span>' : ''}`
      : `<span class="muted">${esc(row.input)}</span>`;
    return `<div class="bulk-row ${row.status}">
      <span class="br-ic">${icon(row)}</span>
      <div><div>${head}</div><div class="br-msg ${row.status}">${esc(row.msg)}${row.status !== 'ok' && row.student ? ' · erkannt: ' + esc(row.student) : ''}</div></div>
    </div>`;
  };
  el.innerHTML = `<div class="bulk-summary">
      ${r.futureCount ? `<span class="pill" style="background:var(--booked);color:#8fb4ff">🗓️ ${r.futureCount} neu</span>` : ''}
      ${r.doneCount ? `<span class="pill" style="background:var(--good-bg);color:var(--good)">🅿️ ${r.doneCount} gefahren</span>` : ''}
      ${!r.futureCount && !r.doneCount ? `<span class="pill">0 bereit</span>` : ''}
      ${r.errCount ? `<span class="pill" style="background:var(--bad-bg);color:var(--bad)">⚠️ ${r.errCount} zu prüfen</span>` : ''}
    </div>
    <div class="bulk-list">${r.rows.map(line).join('')}</div>
    ${r.errCount ? '<p class="hint">Zeilen mit ⚠️ werden übersprungen. Korrigier sie oben und prüfe erneut – oder trag den Rest schon mal ein.</p>' : ''}`;
}
async function loadK() {
  const mode = state.calMode || 'tag';
  $('#k-date').value = state.date;
  if (mode === 'woche') {
    const mon = mondayOf(state.date);
    const sat = addDays(mon, 5);
    $('#k-label').textContent = `Woche ${fmtShort(mon)}–${fmtShort(sat)}`;
    try {
      const ov = await api(`/api/instructor/overview?from=${mon}&to=${sat}`);
      window.__instrBookings = ov.bookings;
      renderWeek($('#k-list'), mon, ov);
    } catch (e) { toast(e.message, 'err'); }
    return;
  }
  if (mode === 'monat') {
    const first = firstOfMonth(state.date);
    const gridStart = mondayOf(first);
    const gridEnd = addDays(gridStart, 41); // 6 Wochen
    $('#k-label').textContent = `${MON_LONG[parseD(first).getMonth()]} ${parseD(first).getFullYear()}`;
    try {
      const ov = await api(`/api/instructor/overview?from=${gridStart}&to=${gridEnd}`);
      window.__instrBookings = ov.bookings;
      renderMonth($('#k-list'), first, gridStart, ov);
    } catch (e) { toast(e.message, 'err'); }
    return;
  }
  $('#k-label').textContent = fmtDay(state.date);
  try {
    const ov = await api('/api/instructor/overview?from=' + state.date + '&to=' + state.date);
    window.__instrBookings = ov.bookings;
    renderInstrDay($('#k-list'), state.date, ov.bookings, ov.blocks);
    const blocked = (ov.overrides || []).some((o) => o.date === state.date && o.closed);
    if (blocked) $('#k-list').insertAdjacentHTML('afterbegin',
      '<div class="day-blocked">🚫 <strong>Tag komplett gesperrt</strong> – Fahrschüler können an diesem Tag nichts buchen.</div>');
    setDayBlockBtn(blocked);
  } catch (e) { toast(e.message, 'err'); }
}
// Ein-Tipp-Knopf: ganzen Tag sperren / wieder freigeben
function setDayBlockBtn(blocked) {
  const btn = $('#k-block');
  if (!btn) return;
  btn.textContent = blocked ? '🔓 Tag freigeben' : '🚫 Tag sperren';
  btn.classList.toggle('danger', !blocked);
  btn.onclick = async () => {
    try {
      if (blocked) {
        await api('/api/day-overrides/' + state.date, { method: 'DELETE' });
        toast('Tag wieder freigegeben ✓', 'ok');
      } else {
        const send = (force) => api('/api/day-overrides', { method: 'POST', body: force ? { type: 'free', date: state.date, force: true } : { type: 'free', date: state.date } });
        try { await send(false); }
        catch (e) {
          if (/schon .* Termin/.test(e.message) && confirm(e.message + '\n\nTrotzdem sperren? Denk daran, die Schüler an dem Tag zu informieren.')) await send(true);
          else throw e;
        }
        toast('Tag komplett gesperrt 🚫', 'ok');
      }
      loadK();
    } catch (e) { toast(e.message, 'err'); }
  };
}

// Farbe je Fahrschüler (stabil über die id)
const WK_COLORS = ['#4d8dff', '#35c07d', '#b079f0', '#e6934d', '#e06b9a', '#3fb6c4', '#c9a13b', '#7c8cf0'];
function studentColor(id) { return id ? WK_COLORS[id % WK_COLORS.length] : '#5a6b80'; }
// Standardfarben je Fahrt-Art (Sonderfahrten + normale Stunde)
const TYPE_COLORS = { ueberland: '#2f9e57', autobahn: '#2f6fd0', nacht: '#6d4bb0', normal: '#5b6b7d' };
const TYPE_ICON = { ueberland: '🌄', autobahn: '🛣️', nacht: '🌙', normal: '🚗' };
const TYPE_LABEL = { ueberland: 'Überland', autobahn: 'Autobahn', nacht: 'Nachtfahrt', normal: 'Normale Stunde' };
// Einheitliches, farbiges Abzeichen für die Fahrt-Art
function typeBadge(type) {
  const t = TYPE_LABEL[type] ? type : 'normal';
  const c = TYPE_COLORS[t];
  return `<span class="type-badge" style="background:${c}22;color:${c};border-color:${c}66">${TYPE_ICON[t]} ${TYPE_LABEL[t]}</span>`;
}

function renderWeek(el, monday, ov) {
  const s = state.settings;
  const toM = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const days = Array.from({ length: 6 }, (_, i) => addDays(monday, i));
  // Zeitbereich dynamisch: Standard-Arbeitszeit, erweitert um alle Termine/Blöcke
  let lo = toM(s.start_time), hi = toM(s.last_start) + s.lesson_min;
  for (const b of ov.bookings) { lo = Math.min(lo, toM(b.start_time)); hi = Math.max(hi, toM(b.start_time) + b.duration_min); }
  for (const bl of ov.blocks) { lo = Math.min(lo, toM(bl.start_time)); hi = Math.max(hi, toM(bl.end_time)); }
  lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
  const total = Math.max(60, hi - lo);
  const HPH = 42; // px pro Stunde
  const bodyH = total / 60 * HPH;
  const y = (min) => (min - lo) / total * bodyH;
  const ovByDate = {}; for (const o of ov.overrides) ovByDate[o.date] = o;
  const today = todayStr();

  const hourLabels = [];
  for (let t = lo; t < hi; t += 60) hourLabels.push(`<div class="wk-hour"><span>${String(t / 60).padStart(2, '0')}:00</span></div>`);
  const hourLines = hourLabels.map(() => '<div class="wk-hour"></div>').join('');

  const dayCol = (d) => {
    const isToday = d === today;
    const ovd = ovByDate[d];
    let inner = '';
    if (ovd && ovd.closed) {
      inner += `<div class="wk-block closed ${ovd.type === 'vacation' ? 'dt-vac' : 'dt-free'}">${ovd.type === 'vacation' ? '🌴 Urlaub' : '🏖️ frei'}</div>`;
    }
    for (const bl of ov.blocks.filter((x) => x.date === d)) {
      const top = y(toM(bl.start_time)), h = Math.max(16, y(toM(bl.end_time)) - top);
      inner += `<div class="wk-block blk" style="top:${top}px;height:${h}px" title="${esc(bl.title)}">
        <div class="t">${bl.start_time}</div>${esc(bl.title)}</div>`;
    }
    for (const b of ov.bookings.filter((x) => x.date === d)) {
      const top = y(toM(b.start_time)), h = Math.max(20, b.duration_min / total * bodyH);
      const col = b.status === 'offered' ? '#e6b23a' : (TYPE_COLORS[b.lesson_type] || studentColor(b.student_id));
      const who = b.student_name || b.title || 'Termin';
      const tIco = TYPE_ICON[b.lesson_type] || '';
      const badge = b.status === 'done' ? ' ✓' : b.status === 'offered' ? ' 🔄' : '';
      inner += `<div class="wk-block" data-wk="${b.id}" style="top:${top}px;height:${h}px;background:${col}"
        title="${b.start_time} ${esc(who)}"><div class="t">${b.start_time}${badge} ${tIco}</div>${esc(who)}</div>`;
    }
    return `<div class="wk-body ${isToday ? 'today' : ''}" style="height:${bodyH}px">${hourLines}${inner}</div>`;
  };

  el.innerHTML = `<div class="weekwrap"><div class="weekgrid">
    <div class="wk-corner"></div>
    ${days.map((d) => {
      const ovd = ovByDate[d];
      const tag = ovd ? (ovd.type === 'vacation' ? '🌴 Urlaub' : ovd.closed ? '🏖️ frei' : `✂️ kurz bis ${ovd.last_start || ''}`) : '';
      const dtCls = ovd ? (ovd.type === 'vacation' ? 'dt-vac' : ovd.closed ? 'dt-free' : 'dt-short') : '';
      return `<div class="wk-head ${d === today ? 'today' : ''}">${WD[isoDow(d) - 1]}<span class="sub">${fmtShort(d)}</span>${tag ? `<span class="daytag ${dtCls}">${tag}</span>` : ''}</div>`;
    }).join('')}
    <div class="wk-times">${hourLabels.join('')}</div>
    ${days.map(dayCol).join('')}
  </div></div>
  <div class="hint" style="margin-top:.7rem">Tipp: auf einen Termin tippen zum Bearbeiten/Abschließen. Farbe = Fahrschüler (bzw. Fahrt-Art), 🔄 = wird abgegeben, ✓ = gefahren.</div>
  <div class="legend"><span class="muted">Fahrt-Arten:</span>
    <span class="legend-chip"><span class="sw" style="background:${TYPE_COLORS.ueberland}"></span>🌄 Überland</span>
    <span class="legend-chip"><span class="sw" style="background:${TYPE_COLORS.autobahn}"></span>🛣️ Autobahn</span>
    <span class="legend-chip"><span class="sw" style="background:${TYPE_COLORS.nacht}"></span>🌙 Nachtfahrt</span>
    <span class="legend-chip"><span class="sw" style="background:${TYPE_COLORS.normal}"></span>🚗 Normale Stunde</span>
  </div>`;
  el.querySelectorAll('[data-wk]').forEach((b) => b.onclick = () => openMarkModal(b.dataset.wk));
}

// ---- Monatsansicht ----
function renderMonth(el, firstDay, gridStart, ov) {
  const monthIdx = parseD(firstDay).getMonth();
  const today = todayStr();
  const workdays = (state.settings?.workdays || '1,2,3,4,5,6').split(',').map(Number);
  // Termine/Bloecke/Overrides nach Datum sammeln
  const byDate = {};
  for (const b of ov.bookings) (byDate[b.date] ||= { books: [], blocks: [] }).books.push(b);
  for (const bl of ov.blocks) (byDate[bl.date] ||= { books: [], blocks: [] }).blocks.push(bl);
  const ovByDate = {}; for (const o of ov.overrides) ovByDate[o.date] = o;

  const heads = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((d) => `<div class="m-head">${d}</div>`).join('');
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const inMonth = parseD(d).getMonth() === monthIdx;
    const info = byDate[d] || { books: [], blocks: [] };
    const ovd = ovByDate[d];
    const dn = parseD(d).getDate();
    const isWorkday = workdays.includes(isoDow(d)) && !(ovd && ovd.closed);
    const cnt = info.books.length;
    const dots = info.books.slice(0, 8).map((b) => {
      const c = b.status === 'offered' ? '#e6b23a' : (TYPE_COLORS[b.lesson_type] || studentColor(b.student_id));
      return `<span class="m-dot" style="background:${c}" title="${b.start_time} ${esc(b.student_name || b.title || '')}"></span>`;
    }).join('');
    let tag = '', tagCls = '';
    if (ovd && ovd.type === 'vacation') { tag = '🌴 Urlaub'; tagCls = 'dt-vac'; }
    else if (ovd && ovd.closed) { tag = '🏖️ frei'; tagCls = 'dt-free'; }
    else if (ovd && ovd.last_start) { tag = '✂️ kurz'; tagCls = 'dt-short'; }
    else if (info.blocks.some((b) => b.type === 'theorie')) tag = '📚 Theorie';
    cells += `<div class="m-cell ${inMonth ? '' : 'out'} ${d === today ? 'today' : ''} ${isWorkday ? '' : 'off'}" data-day="${d}">
      <div class="m-day"><span>${dn}</span>${cnt ? `<span class="cnt">${cnt}</span>` : ''}</div>
      ${tag ? `<div class="m-tag ${tagCls}">${tag}</div>` : ''}
      <div class="m-dots">${dots}</div>
    </div>`;
  }
  el.innerHTML = `<div class="monthgrid">${heads}${cells}</div>
    <p class="hint" style="margin-top:.7rem">Tipp: auf einen Tag tippen öffnet die Tagesansicht. Zahl = Anzahl Fahrstunden, Punkte = Fahrschüler/Fahrt-Art.</p>`;
  el.querySelectorAll('[data-day]').forEach((c) => c.onclick = () => { state.date = c.dataset.day; state.calMode = 'tag'; tabKalender(); });
}

function openLateModal() {
  modal(`<h3>Ich verspäte mich</h3>
    <p class="hint">Alle noch nicht begonnenen Termine an diesem Tag (${fmtShort(state.date)}) rücken um die angegebene Zeit nach hinten. Die betroffenen Fahrschüler werden automatisch benachrichtigt.</p>
    <div class="field"><label>Verspätung in Minuten</label><input id="late-min" type="number" value="10" min="1" step="5"></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="late-go">Termine nachrücken</button>
    </div>`);
  $('#late-go').onclick = async () => {
    try {
      const r = await api('/api/instructor/delay-today', { method: 'POST', body: { date: state.date, minutes: Number($('#late-min').value) } });
      closeModal(); toast(`${r.moved} Termin(e) um ${r.minutes} Min verschoben ✓`, 'ok'); loadK();
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function openGapModal() {
  let plan;
  try { plan = await api('/api/instructor/gap-proposal?date=' + state.date); }
  catch (e) { toast(e.message, 'err'); return; }
  const changes = plan.moves.filter((m) => m.from !== m.to);
  if (!plan.hasGap) {
    modal(`<h3>Lücken schließen</h3>
      <p class="hint">Für ${fmtDay(state.date)} gibt es keine Lücke – die Fahrstunden liegen bereits lückenlos hintereinander. 👍</p>
      <div class="actions"><button class="sec" onclick="window.__closeModal()">Schließen</button></div>`);
    return;
  }
  modal(`<h3>Lücken schließen – Vorschlag</h3>
    <p class="hint">Damit der Tag lückenlos ist, würden diese Fahrstunden nach vorne rücken. Die betroffenen Fahrschüler werden automatisch benachrichtigt.</p>
    <div class="blist">${changes.map((m) => `<div class="bitem warm">
      <div><div class="when">${esc(m.student_name || 'Termin')} <span class="muted" style="font-weight:400">(${m.duration} Min)</span></div>
      <div class="meta">${m.from} Uhr &nbsp;→&nbsp; <strong style="color:var(--good)">${m.to} Uhr</strong></div></div>
    </div>`).join('')}</div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="gap-apply">${changes.length} Verschiebung${changes.length > 1 ? 'en' : ''} anwenden</button>
    </div>`);
  $('#gap-apply').onclick = async () => {
    try {
      const r = await api('/api/instructor/apply-shift', { method: 'POST', body: { date: state.date } });
      closeModal(); toast(`${r.moved} Termin(e) verschoben ✓`, 'ok'); loadK();
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function openAddBooking() {
  let students = [];
  try { students = (await api('/api/students')).students; } catch {}
  const s = state.settings;
  modal(`<h3>Eigenen Termin anlegen</h3>
    <p class="hint">Frei buchen – für einen Fahrschüler oder als Sondertermin (z.B. Prüfung).</p>
    <div class="field"><label>Datum</label><input type="date" id="a-date" value="${state.date}"></div>
    <div class="row">
      <div class="field"><label>Uhrzeit</label><input id="a-time" value="${s.start_time || '12:00'}" placeholder="HH:MM"></div>
      <div class="field"><label>Dauer (Min)</label><input id="a-dur" type="number" value="${s.lesson_min}" step="5" min="10"></div>
    </div>
    <div class="field"><label>Fahrschüler <span class="muted" style="font-weight:400">(optional)</span></label>
      ${studentPicker('a-student', students, { placeholder: '🔍 Namen tippen …' })}</div>
    <div class="field" style="margin-bottom:0"><label>Titel <span class="muted" style="font-weight:400">(wenn kein Fahrschüler)</span></label><input id="a-title" placeholder="z.B. Prüfung, Sonderfahrt"></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="a-save">Anlegen</button>
    </div>`);
  $('#a-save').onclick = async () => {
    try {
      await api('/api/bookings', { method: 'POST', body: {
        date: $('#a-date').value, start_time: $('#a-time').value, duration_min: Number($('#a-dur').value),
        student_id: resolveStudentId($('#a-student'), students) || null, title: $('#a-title').value } });
      closeModal(); toast('Termin angelegt ✓', 'ok');
      state.date = $('#a-date').value; if (state.instrTab === 'kalender') loadK(); else drawInstrTab();
    } catch (e) { toast(e.message, 'err'); }
  };
}

// ---- Tab: Codes ----
async function tabCodes() {
  const box = $('#itab');
  box.innerHTML = `<div class="card">
    <h2>Zugangscodes <span class="sub">für neue Fahrschüler</span></h2>
    <p class="hint">Erzeuge einen Code und gib ihn an deinen Fahrschüler weiter. Damit legt er einmalig sein Konto an – danach ist der Code verbraucht.</p>
    <div class="inline" style="margin-bottom:1rem">
      <input id="c-note" placeholder="Notiz, z.B. Name des Schülers" style="max-width:260px">
      <button id="c-gen">+ Code erzeugen</button>
      <button class="ghost" id="c-test" style="margin-left:auto">🧪 Testschüler anlegen</button>
    </div>
    <p class="hint" style="margin-top:-.5rem">Mit „Testschüler" legst du sofort ein fertiges Demo-Konto an – zum Ausprobieren der Schüler-Ansicht (z. B. in einem zweiten/privaten Browserfenster).</p>
    <div id="c-list"></div>
  </div>`;
  $('#c-gen').onclick = async () => {
    try { const r = await api('/api/codes', { method: 'POST', body: { note: $('#c-note').value } });
      $('#c-note').value = ''; toast('Code ' + r.code + ' erstellt', 'ok'); loadCodes(); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#c-test').onclick = async () => {
    try {
      const r = await api('/api/instructor/test-student', { method: 'POST' });
      const share = `${r.name} – Login zum Testen:\nLogin-Name: ${r.username}\nPasswort: ${r.password}`;
      modal(`<h3>🧪 Testschüler angelegt</h3>
        <p class="hint">So kannst du die Schüler-Ansicht ausprobieren: öffne ein <strong>zweites (oder privates) Browserfenster</strong> auf dieselbe Adresse und melde dich mit diesen Daten an.</p>
        <pre style="background:#0f151d;border:1px solid var(--line);border-radius:8px;padding:.7rem;white-space:pre-wrap;font-size:.9rem">${esc(share)}</pre>
        <div class="actions"><button class="sec" id="ts-copy">📋 Kopieren</button><button onclick="window.__closeModal()">Fertig</button></div>`);
      $('#ts-copy').onclick = () => { navigator.clipboard?.writeText(share); toast('Kopiert', 'ok'); };
      toast('Testschüler ' + r.username + ' angelegt', 'ok');
    } catch (e) { toast(e.message, 'err'); }
  };
  loadCodes();
}
async function loadCodes() {
  try {
    const { codes } = await api('/api/codes');
    $('#c-list').innerHTML = codes.length ? `<table>
      <tr><th>Code</th><th>Status</th><th>Notiz / Schüler</th><th></th></tr>
      ${codes.map((c) => `<tr>
        <td><span class="codechip">${c.code}</span></td>
        <td>${c.used ? '<span class="badge done">verwendet</span>' : '<span class="badge booked">offen</span>'}</td>
        <td>${esc(c.student_name || c.note || '–')}</td>
        <td>${c.used ? '' : `<button class="ghost sm" data-copy="${c.code}">Kopieren</button> <button class="ghost sm" data-del="${c.code}">Löschen</button>`}</td>
      </tr>`).join('')}
    </table>` : '<p class="muted">Noch keine Codes erstellt.</p>';
    $('#c-list').querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => {
      navigator.clipboard?.writeText(b.dataset.copy); toast('Code kopiert: ' + b.dataset.copy, 'ok');
    });
    $('#c-list').querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      try { await api('/api/codes/' + b.dataset.del, { method: 'DELETE' }); loadCodes(); } catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) { toast(e.message, 'err'); }
}

// ---- Tab: Schüler ----
async function tabSchueler(scope) {
  scope = scope || state._schuelerScope || 'active';
  state._schuelerScope = scope;
  const box = $('#itab');
  box.innerHTML = `<div class="card">
    <div class="inline" style="justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.6rem">
      <h2 style="margin:.1rem 0">Fahrschüler <span class="sub">anlegen & verwalten</span></h2>
      <div class="inline" style="gap:.4rem">
        <button class="sm sec" id="s-bulk">📋 Liste einfügen</button>
        <button class="sm" id="s-add">➕ Fahrschüler anlegen</button>
      </div>
    </div>
    <div class="tabs" style="max-width:340px;margin:.2rem 0 .8rem">
      <button id="sc-active" class="${scope === 'active' ? 'active' : ''}">Aktiv <span id="sc-ac"></span></button>
      <button id="sc-arch" class="${scope === 'archived' ? 'active' : ''}">✅ Archiv <span id="sc-arc"></span></button>
    </div>
    <p class="hint">${scope === 'archived'
      ? 'Bestandene / archivierte Fahrschüler. Ihre Daten und Fahrstunden bleiben einsehbar; sie tauchen nicht in der aktiven Liste auf. Über „Reaktivieren“ kommen sie zurück.'
      : 'Lege Fahrschüler an – jeder bekommt automatisch Login + Startpasswort. Über die Zeilen: bearbeiten, Notiz, Stundenlängen (40/80/120), Treffpunkt, Zugangsdaten, archivieren (bestanden) oder löschen.'}</p>
    <div id="s-list"></div></div>`;
  $('#s-add').onclick = () => openCreateStudentModal();
  $('#s-bulk').onclick = () => openBulkStudentModal();
  $('#sc-active').onclick = () => tabSchueler('active');
  $('#sc-arch').onclick = () => tabSchueler('archived');
  try {
    const { students, req, activeCount, archivedCount } = await api('/api/students' + (scope === 'archived' ? '?scope=archived' : ''));
    if ($('#sc-ac')) $('#sc-ac').textContent = activeCount != null ? `(${activeCount})` : '';
    if ($('#sc-arc')) $('#sc-arc').textContent = archivedCount != null ? `(${archivedCount})` : '';
    if (!students.length) { $('#s-list').innerHTML = `<p class="muted">${scope === 'archived' ? 'Noch keine archivierten Fahrschüler.' : 'Noch keine aktiven Fahrschüler. Lege oben welche an.'}</p>`; return; }
    const sonderCell = (s) => ['ueberland', 'autobahn', 'nacht'].map((k) => {
      const have = s.sonder?.[k] || 0, need = req[k]; const done = have >= need;
      return `<span class="pill" style="${done ? 'background:var(--good-bg);color:var(--good)' : ''}">${TYPE_ICON[k]} ${have}/${need}</span>`;
    }).join(' ');
    const sonderDone = (s) => ['ueberland', 'autobahn', 'nacht'].every((k) => (s.sonder?.[k] || 0) >= req[k]);
    const nearReady = (s) => sonderDone(s) && !s.redCount && (s.adkDistinct || 0) >= CURR_TOTAL * 0.8;
    // Gesamtübersicht: Kennzahlen über alle (angezeigten) Fahrschüler
    const nRed = students.filter((s) => s.redCount > 0).length;
    const nNear = students.filter(nearReady).length;
    const nR2 = students.filter((s) => s.rank >= 2).length;
    const ovBar = scope === 'archived' ? '' : `<div class="ov-bar">
      <div class="ov-tile"><b>${students.length}</b><span>Fahrschüler</span></div>
      <div class="ov-tile ${nRed ? 'warn' : ''}"><b>${nRed}</b><span>mit 🔴 offen</span></div>
      <div class="ov-tile"><b>${nR2}</b><span>Rang 2</span></div>
      <div class="ov-tile ${nNear ? 'good' : ''}"><b>${nNear}</b><span>fast prüfungsreif</span></div>
    </div>`;
    $('#s-list').innerHTML = `
      ${ovBar}
      <div class="inline" style="margin-bottom:.7rem;gap:.5rem">
        <input id="s-search" placeholder="🔍 Suchen: Name, Login-Name, Telefon oder E-Mail …" style="flex:1" autocomplete="off">
        <span class="pill" id="s-count">${students.length}</span>
      </div>
      <p class="muted hidden" id="s-noresult">Keine Treffer.</p>
      <div class="stu-grid">
      ${students.map((s) => {
        const searchStr = [s.name, s.username, s.email, s.phone].filter(Boolean).join(' ').toLowerCase();
        const durs = String(s.allowed_durations || '80').split(',').map(Number);
        const boxes = [40, 80, 120].map((d) => `<label class="dur-chip ${durs.includes(d) ? 'on' : ''}"><input type="checkbox" data-sdur="${s.id}" value="${d}" ${durs.includes(d) ? 'checked' : ''}> ${d}</label>`).join('');
        const hasHome = s.home_label || s.home_lat != null;
        const homeCell = hasHome
          ? `<span class="pill" style="background:var(--good-bg);color:var(--good)">📍 ${esc(s.home_label || 'gesetzt')}</span>`
          : `<span class="muted">– nicht vereinbart –</span>`;
        const isArch = !!s.archived_at;
        const av = s.has_photo ? `<img src="/api/students/${s.id}/photo" alt="">` : `<span>${esc(initials(s.name))}</span>`;
        const contact = s.phone
          ? `<span class="muted">${esc(s.phone)}</span> ${contactButtons(s.phone, `Hallo ${s.name.split(' ')[0]}, hier ${state.settings?.instructor_name || 'deine Fahrschule'}:`)}`
          : (s.email ? `<span class="muted">${esc(s.email)}</span>` : '<span class="muted">– kein Kontakt –</span>');
        return `<div class="stu-card" data-search="${esc(searchStr)}">
          <div class="stu-head">
            <span class="stu-av">${av}</span>
            <div class="stu-namewrap">
              <div class="stu-name">${esc(s.name)}${s.birth_year ? ` <span class="muted">(${s.birth_year})</span>` : ''}</div>
              <div class="stu-login">🔑 <span class="codechip">${esc(s.username || '–')}</span></div>
            </div>
            <div class="stu-hours"><b>${s.done_count}</b><span>Std.</span></div>
          </div>
          <div class="stu-chips">
            <span class="pill" style="${s.rank >= 2 ? 'background:var(--good-bg);color:var(--good)' : ''}">🏆 Rang ${s.rank} · ${s.horizon} T</span>
            ${s.units ? `<span class="pill">🚗 ${fmtUnits(s.units)} FS${s.schaltUnits ? ' · ' + fmtUnits(s.schaltUnits) + ' Schalt' : ''}</span>` : ''}
            ${s.redCount ? `<span class="pill" style="background:rgba(255,70,70,.16);color:#ff6b6b">🔴 ${s.redCount} offen</span>` : ''}
            ${!isArch && nearReady(s) ? '<span class="pill" style="background:var(--good-bg);color:var(--good)">🎓 fast prüfungsreif</span>' : ''}
            ${isArch ? '<span class="pill" style="background:var(--good-bg);color:var(--good)">✅ bestanden</span>' : ''}
          </div>
          ${s.notes ? `<div class="stu-note" title="${esc(s.notes)}">📝 ${esc(s.notes.length > 80 ? s.notes.slice(0, 80) + '…' : s.notes)}</div>` : ''}
          <div class="stu-info">
            <div class="sir"><span class="sil">📞</span><span class="siv">${contact}</span></div>
            <div class="sir"><span class="sil">📍</span><span class="siv">${homeCell}
              <button class="linklike" data-home="${s.id}" data-sname="${esc(s.name)}" data-hlabel="${esc(s.home_label || '')}" data-hlat="${s.home_lat != null ? s.home_lat : ''}" data-hlng="${s.home_lng != null ? s.home_lng : ''}">${hasHome ? 'ändern' : 'festlegen'}</button></span></div>
            <div class="sir"><span class="sil">🎯</span><span class="siv stu-sonder">${sonderCell(s)}</span></div>
            <div class="sir"><span class="sil">⏱️</span><span class="siv stu-lengths">${boxes}<button class="linklike" data-savedur="${s.id}">speichern</button></span></div>
          </div>
          <div class="stu-actions">
            <button class="iconbtn" data-edit="${s.id}" title="Bearbeiten" aria-label="Bearbeiten"><span class="ib-ic">✏️</span><span class="ib-lb">Bearbeiten</span></button>
            <button class="iconbtn" data-log="${s.id}" data-lname="${esc(s.name)}" title="Fahrstunde nachtragen" aria-label="Fahrstunde nachtragen"><span class="ib-ic">➕</span><span class="ib-lb">Nachtragen</span></button>
            <button class="iconbtn" data-invoice="${s.id}" data-iname="${esc(s.name)}" title="Rechnungsdatum" aria-label="Rechnungsdatum"><span class="ib-ic">🧾</span><span class="ib-lb">Rechnung</span></button>
            <button class="iconbtn" data-proof="${s.id}" data-pname="${esc(s.name)}" title="Nachweis drucken" aria-label="Nachweis drucken"><span class="ib-ic">📄</span><span class="ib-lb">Nachweis</span></button>
            <button class="iconbtn" data-card="${s.id}" data-cname="${esc(s.name)}" title="Ausbildungskarte" aria-label="Ausbildungskarte"><span class="ib-ic">📋</span><span class="ib-lb">Karte</span></button>
            <button class="iconbtn" data-reset="${s.id}" data-uname="${esc(s.username || '')}" data-sname="${esc(s.name)}" title="Zugangsdaten" aria-label="Zugangsdaten"><span class="ib-ic">🔑</span><span class="ib-lb">Zugang</span></button>
            ${isArch
              ? `<button class="iconbtn ok" data-react="${s.id}" title="Reaktivieren" aria-label="Reaktivieren"><span class="ib-ic">↩︎</span><span class="ib-lb">Zurück</span></button>`
              : `<button class="iconbtn ok" data-arch="${s.id}" data-aname="${esc(s.name)}" title="Als bestanden ins Archiv" aria-label="Bestanden"><span class="ib-ic">✅</span><span class="ib-lb">Bestanden</span></button>`}
            <button class="iconbtn danger stu-del" data-del="${s.id}" data-dname="${esc(s.name)}" title="Löschen" aria-label="Löschen"><span class="ib-ic">🗑️</span><span class="ib-lb">Löschen</span></button>
          </div>
        </div>`;
      }).join('')}
      </div>`;
    // Längen-Chips: optisch mitschalten
    $('#s-list').querySelectorAll('[data-sdur]').forEach((cb) => cb.onchange = () =>
      cb.closest('.dur-chip')?.classList.toggle('on', cb.checked));
    $('#s-list').querySelectorAll('[data-savedur]').forEach((btn) => btn.onclick = async () => {
      const id = btn.dataset.savedur;
      const vals = [...$('#s-list').querySelectorAll(`[data-sdur="${id}"]`)].filter((c) => c.checked).map((c) => Number(c.value));
      if (!vals.length) { toast('Mindestens eine Länge wählen', 'err'); return; }
      try { await api('/api/students/' + id, { method: 'PATCH', body: { allowed_durations: vals } }); toast('Gespeichert ✓', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
    });
    $('#s-list').querySelectorAll('[data-reset]').forEach((btn) => btn.onclick = () =>
      openResetModal(btn.dataset.reset, btn.dataset.sname, btn.dataset.uname));
    $('#s-list').querySelectorAll('[data-home]').forEach((btn) => btn.onclick = () =>
      openStandortModal(btn.dataset.home, btn.dataset.sname, btn.dataset.hlabel, btn.dataset.hlat, btn.dataset.hlng));
    $('#s-list').querySelectorAll('[data-edit]').forEach((btn) => btn.onclick = () =>
      openEditStudentModal(students.find((x) => x.id === Number(btn.dataset.edit))));
    $('#s-list').querySelectorAll('[data-card]').forEach((btn) => btn.onclick = () =>
      openTrainingCard(btn.dataset.card, btn.dataset.cname));
    $('#s-list').querySelectorAll('[data-log]').forEach((btn) => btn.onclick = () =>
      openLogLessonModal(Number(btn.dataset.log), btn.dataset.lname));
    $('#s-list').querySelectorAll('[data-invoice]').forEach((btn) => btn.onclick = () =>
      openInvoiceModal(Number(btn.dataset.invoice), btn.dataset.iname));
    $('#s-list').querySelectorAll('[data-proof]').forEach((btn) => btn.onclick = async () => {
      try { const r = await api('/api/students/' + btn.dataset.proof + '/lessons');
        if (!r.lessons.length) { toast('Noch keine gefahrenen Stunden für den Nachweis.', 'err'); return; }
        printLessonProof(r.name || btn.dataset.pname, r.lessons, r.adk, r.stats);
      } catch (e) { toast(e.message, 'err'); }
    });
    $('#s-list').querySelectorAll('[data-del]').forEach((btn) => btn.onclick = () =>
      deleteStudent(btn.dataset.del, btn.dataset.dname));
    $('#s-list').querySelectorAll('[data-arch]').forEach((btn) => btn.onclick = async () => {
      if (!confirm(`„${btn.dataset.aname}" als bestanden markieren und ins Archiv verschieben? Daten & Fahrstunden bleiben einsehbar, du kannst jederzeit reaktivieren.`)) return;
      try { await api('/api/students/' + btn.dataset.arch + '/archive', { method: 'POST' }); toast('Ins Archiv verschoben ✅', 'ok'); tabSchueler(); }
      catch (e) { toast(e.message, 'err'); }
    });
    $('#s-list').querySelectorAll('[data-react]').forEach((btn) => btn.onclick = async () => {
      try { await api('/api/students/' + btn.dataset.react + '/reactivate', { method: 'POST' }); toast('Reaktiviert ↩︎', 'ok'); tabSchueler(); }
      catch (e) { toast(e.message, 'err'); }
    });
    // Suche: filtert die Zeilen nach Name / Login / Telefon / E-Mail
    const search = $('#s-search');
    if (search) search.oninput = () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      $('#s-list').querySelectorAll('.stu-card[data-search]').forEach((tr) => {
        const match = !q || tr.dataset.search.includes(q);
        tr.style.display = match ? '' : 'none';
        if (match) shown++;
      });
      $('#s-count').textContent = shown;
      $('#s-noresult').classList.toggle('hidden', shown > 0);
    };
  } catch (e) { toast(e.message, 'err'); }
}

// Neuen Fahrschüler anlegen – zeigt danach Login + Startpasswort zum Weitergeben
function openCreateStudentModal() {
  modal(`<h3>Fahrschüler anlegen</h3>
    ${errBox()}
    <div class="row">
      <div class="field"><label>Vorname *</label><input id="cs-first" placeholder="z.B. Maria" autocomplete="off"></div>
      <div class="field"><label>Nachname *</label><input id="cs-last" placeholder="z.B. Bieber" autocomplete="off"></div>
    </div>
    <div class="row">
      <div class="field" style="max-width:130px"><label>Jahrgang (optional)</label><input id="cs-year" type="number" placeholder="1997" min="1930" max="2015"></div>
      <div class="field"><label>Telefon (optional)</label><input id="cs-phone" placeholder="0151 …"></div>
    </div>
    <div class="field"><label>Login-Name (optional – sonst automatisch)</label><input id="cs-user" placeholder="z.B. MB1997" style="text-transform:uppercase"></div>
    <div class="field"><label>Erlaubte Stundenlängen</label>
      <div class="inline">${[40, 80, 120].map((d) => `<label style="margin:0;font-weight:600"><input type="checkbox" class="cs-dur" value="${d}" ${d === 80 ? 'checked' : ''} style="width:auto"> ${d} Min</label>`).join(' ')}</div></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="cs-go">Anlegen</button>
    </div>`);
  $('#cs-go').onclick = async () => {
    const first = $('#cs-first').value.trim(), last = $('#cs-last').value.trim();
    if (!first || !last) { showErr('Bitte Vor- und Nachname eingeben.'); return; }
    const durs = [...document.querySelectorAll('.cs-dur')].filter((c) => c.checked).map((c) => Number(c.value));
    const body = { first_name: first, last_name: last, birth_year: $('#cs-year').value || undefined, phone: $('#cs-phone').value || undefined,
      username: $('#cs-user').value.trim() || undefined, allowed_durations: durs.length ? durs : [80] };
    try {
      const r = await api('/api/students', { method: 'POST', body });
      showCredentials(r, `Fahrschüler „${r.name}" angelegt`);
      tabSchueler();
    } catch (e) { showErr(e.message); }
  };
}

// Mehrere Fahrschüler auf einmal anlegen (Liste einfügen)
function openBulkStudentModal() {
  modal(`<h3>Mehrere Fahrschüler anlegen</h3>
    ${errBox()}
    <p class="hint">Füge deine Namensliste ein – <strong>eine Person pro Zeile</strong>, als „Nachname, Vorname". Ein Jahrgang am Zeilenende ist optional (fließt in den Login ein).</p>
    <div class="field"><textarea id="bulk-text" rows="9" placeholder="Bieber, Maria&#10;Christke, Jason&#10;Franke, Lea-Michelle 2001&#10;…"></textarea></div>
    <p class="hint">Jeder bekommt automatisch einen Login (Initialen, ggf. + Jahrgang) und ein Startpasswort. Danach kannst du alle Zugangsdaten kopieren.</p>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="bulk-go">Alle anlegen</button>
    </div>`);
  $('#bulk-go').onclick = async () => {
    const text = $('#bulk-text').value.trim();
    if (!text) { showErr('Bitte eine Namensliste einfügen.'); return; }
    try {
      const r = await api('/api/students/bulk', { method: 'POST', body: { text } });
      showBulkResults(r);
      tabSchueler();
    } catch (e) { showErr(e.message); }
  };
}

function showBulkResults(r) {
  const rows = (r.created || []).map((c) => `${c.name}\t${c.username}\t${c.password}`).join('\n');
  const errList = (r.errors || []).length
    ? `<p class="hint" style="color:var(--warn)">${r.errors.length} Zeile(n) übersprungen: ${r.errors.map((e) => esc(e.line)).join('; ')}</p>` : '';
  modal(`<h3>${(r.created || []).length} Fahrschüler angelegt ✓</h3>
    <p class="hint">Alle Zugangsdaten – kopiere sie dir weg (jede Zeile: Name · Login · Passwort). Passwörter sind nur jetzt sichtbar.</p>
    ${errList}
    <div style="max-height:46vh;overflow:auto;border:1px solid var(--line);border-radius:10px">
    <table><tr><th>Name</th><th>Login</th><th>Passwort</th></tr>
    ${(r.created || []).map((c) => `<tr><td>${esc(c.name)}</td><td><span class="codechip">${esc(c.username)}</span></td><td><span class="codechip">${esc(c.password)}</span></td></tr>`).join('')}
    </table></div>
    <div class="actions">
      <button class="sec" id="bulk-copy">📋 Alle kopieren</button>
      <button onclick="window.__closeModal()">Fertig</button>
    </div>`);
  $('#bulk-copy').onclick = () => {
    const txt = 'Name\tLogin\tPasswort\n' + rows;
    navigator.clipboard.writeText(txt).then(() => toast('Alle Zugangsdaten kopiert ✓', 'ok')).catch(() => toast('Kopieren nicht möglich', 'err'));
  };
}

// Präzise Verfügbarkeit: pro Wochentag beliebig viele „von–bis"-Zeiträume.
const AV_DAYS = [['mo', 'Montag'], ['di', 'Dienstag'], ['mi', 'Mittwoch'], ['do', 'Donnerstag'], ['fr', 'Freitag'], ['sa', 'Samstag'], ['so', 'Sonntag']];
const AV_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
function avNormWin(w) {
  if (Array.isArray(w) && w.length >= 2) return { v: String(w[0]), b: String(w[1]), m: 'school', p: '' };
  if (w && typeof w === 'object') return { v: String(w.v || ''), b: String(w.b || ''), m: w.m === 'pickup' ? 'pickup' : 'school', p: w.p ? String(w.p) : '' };
  return null;
}
function avParse(json) {
  let av = {}; try { av = JSON.parse(json || '{}') || {}; } catch { av = {}; }
  const st = {};
  for (const [dk] of AV_DAYS) st[dk] = (Array.isArray(av[dk]) ? av[dk] : []).map(avNormWin).filter(Boolean);
  return st;
}
function avSerialize(st) {
  const out = {};
  for (const [dk] of AV_DAYS) {
    const wins = (st[dk] || []).filter((w) => AV_RE.test(w.v) && AV_RE.test(w.b) && w.v < w.b)
      .map((w) => w.m === 'pickup' ? { v: w.v, b: w.b, m: 'pickup', p: (w.p || '').trim() } : { v: w.v, b: w.b });
    if (wins.length) out[dk] = wins;
  }
  return out;
}
// Rendert & verdrahtet den Editor neu (nach jeder Änderung).
function renderAvail(st) {
  const el = document.getElementById('es-avail'); if (!el) return;
  el.innerHTML = AV_DAYS.map(([dk, dl]) => {
    const wins = st[dk] || [];
    const rows = wins.map((w, i) => `<div class="av2-win">
      <input type="time" class="av2-t" data-d="${dk}" data-i="${i}" data-p="v" value="${esc(w.v)}">
      <span class="av2-dash">–</span>
      <input type="time" class="av2-t" data-d="${dk}" data-i="${i}" data-p="b" value="${esc(w.b)}">
      <button type="button" class="av2-mode ${w.m === 'pickup' ? 'pick' : ''}" data-mode="${dk}:${i}">${w.m === 'pickup' ? '📍 Abholung' : '🏫 Fahrschule'}</button>
      <button type="button" class="av2-del" data-del="${dk}:${i}" aria-label="entfernen">✕</button>
      ${w.m === 'pickup' ? `<input class="av2-place" data-place="${dk}:${i}" placeholder="Abholort (z.B. Schule, Bushaltestelle …)" value="${esc(w.p || '')}">` : ''}
    </div>`).join('');
    return `<div class="av2-day"><div class="av2-dh">${dl}${wins.length ? '' : ' <span class="av2-none">– keine Zeit</span>'}</div>${rows}<button type="button" class="av2-add" data-add="${dk}">＋ Zeit hinzufügen</button></div>`;
  }).join('');
  el.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => {
    const dk = b.dataset.add; (st[dk] || (st[dk] = [])).push({ v: '09:00', b: '12:00', m: 'school', p: '' }); renderAvail(st);
  });
  el.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
    const [dk, i] = b.dataset.del.split(':'); st[dk].splice(Number(i), 1); renderAvail(st);
  });
  el.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => {
    const [dk, i] = b.dataset.mode.split(':'); const w = st[dk][Number(i)]; w.m = w.m === 'pickup' ? 'school' : 'pickup'; renderAvail(st);
  });
  el.querySelectorAll('.av2-t').forEach((inp) => inp.onchange = () => {
    const dk = inp.dataset.d, i = Number(inp.dataset.i), p = inp.dataset.p;
    if (st[dk] && st[dk][i]) st[dk][i][p] = inp.value;
  });
  el.querySelectorAll('.av2-place').forEach((inp) => inp.oninput = () => {
    const [dk, i] = inp.dataset.place.split(':'); if (st[dk] && st[dk][i]) st[dk][i].p = inp.value;
  });
}

// Stammdaten bearbeiten
function openEditStudentModal(s) {
  if (!s) return;
  const avOn = avParse(s.availability);
  // Vorname/Nachname aus den Feldern; Fallback: kombinierten Namen zerlegen (letztes Wort = Nachname)
  let first = s.first_name || '', last = s.last_name || '';
  if (!first && !last) { const parts = String(s.name || '').trim().split(/\s+/); last = parts.length > 1 ? parts.pop() : ''; first = parts.join(' '); }
  modal(`<h3>${esc(s.name)} bearbeiten</h3>
    ${errBox()}
    <div class="row">
      <div class="field"><label>Vorname</label><input id="es-first" value="${esc(first)}"></div>
      <div class="field"><label>Nachname</label><input id="es-last" value="${esc(last)}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Geburtsdatum</label><input id="es-bdate" type="date" value="${esc(s.birth_date || '')}" max="2015-12-31"></div>
      <div class="field"><label>Telefon</label><input id="es-phone" value="${esc(s.phone || '')}"></div>
    </div>
    <div class="field"><label>E-Mail</label><input id="es-email" type="email" value="${esc(s.email || '')}"></div>
    <div class="row">
      <div class="field" style="flex:2"><label>Straße</label><input id="es-street" value="${esc(s.street || '')}"></div>
      <div class="field" style="max-width:110px"><label>Hausnr.</label><input id="es-houseno" value="${esc(s.house_no || '')}"></div>
    </div>
    <div class="row">
      <div class="field" style="max-width:130px"><label>PLZ</label><input id="es-zip" inputmode="numeric" value="${esc(s.zip || '')}"></div>
      <div class="field" style="flex:2"><label>Ort</label><input id="es-city" value="${esc(s.city || '')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>🚗 Abholzeit (Min)</label>
        <input id="es-travel" inputmode="numeric" value="${s.travel_min != null ? s.travel_min : ''}" placeholder="z.B. 30"></div>
      <div class="field" style="max-width:180px"><label>Standort</label>
        <select id="es-base">
          <option value="" ${!s.home_base ? 'selected' : ''}>Automatisch (näher)</option>
          <option value="main" ${s.home_base === 'main' ? 'selected' : ''}>Eberswalde</option>
          <option value="finow" ${s.home_base === 'finow' ? 'selected' : ''}>Finow</option>
        </select></div>
    </div>
    <div class="hint" style="margin:-.2rem 0 .2rem">Abholzeit wird im Tagesplan vor jeder Fahrstunde eingerechnet. Leer lassen = automatisch schätzen${s.travel_est ? ` (aktuell ≈ ${s.travel_est} Min)` : ''} – vom gewählten (oder näheren) Standort aus.</div>
    <div class="field"><label>🗓️ Wann hat ${esc(first || 'der Schüler')} Zeit? <span class="muted" style="font-weight:400">— genaue Zeiten pro Tag</span></label>
      <div class="avail2" id="es-avail"></div>
      <div class="hint" style="margin:.4rem 0 0">Trag die echten freien Zeiten ein (Schule/Arbeit schon abgezogen, Anfahrt eingerechnet). Mehrere Zeiträume pro Tag möglich. Damit schlägt Ginoco später passende Termine vor.</div></div>
    <div class="field"><label>📝 Notiz / Karteikarte (nur für dich)</label>
      <textarea id="es-notes" rows="4" placeholder="z.B. Ausbildungsstand, was noch geübt werden muss, Besonderheiten …" style="resize:vertical">${esc(s.notes || '')}</textarea></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="es-go">Speichern</button>
    </div>`);
  renderAvail(avOn);
  $('#es-go').onclick = async () => {
    try {
      await api('/api/students/' + s.id, { method: 'PATCH', body: {
        first_name: $('#es-first').value, last_name: $('#es-last').value,
        birth_date: $('#es-bdate').value || null,
        street: $('#es-street').value || null, house_no: $('#es-houseno').value || null,
        zip: $('#es-zip').value || null, city: $('#es-city').value || null,
        phone: $('#es-phone').value || null, email: $('#es-email').value || null,
        travel_min: $('#es-travel').value.trim() === '' ? '' : $('#es-travel').value.trim(),
        home_base: $('#es-base').value || null,
        availability: avSerialize(avOn),
        notes: $('#es-notes').value || null } });
      closeModal(); toast('Gespeichert ✓', 'ok'); tabSchueler();
    } catch (e) { const el = $('#autherr'); if (el) { el.textContent = e.message; el.classList.remove('hidden'); } else toast(e.message, 'err'); }
  };
}

async function deleteStudent(id, name) {
  if (!confirm(`„${name}" wirklich löschen? Alle Buchungen dieses Schülers werden mitgelöscht. Das kann nicht rückgängig gemacht werden.`)) return;
  try { await api('/api/students/' + id, { method: 'DELETE' }); toast('Fahrschüler gelöscht', 'ok'); tabSchueler(); }
  catch (e) { toast(e.message, 'err'); }
}

// ---------- Ausbildungsdiagrammkarte (BVF) pro Fahrschüler ----------
const CURRICULUM = [
  { key: 'grund', title: 'Grundstufe – Einweisung & Bedienung', items: [
    'Besonderheiten beim Einsteigen', 'Einstellen: Sitz', 'Einstellen: Spiegel', 'Einstellen: Lenkrad', 'Einstellen: Kopfstütze',
    'Lenkradhaltung', 'Pedale', 'Gurt anlegen/anpassen', 'Schalt-/Wählhebel', 'Zündschloss', 'Motor anlassen',
    'Anfahr-/Anhalteübungen', 'Schaltübungen hochschalten', 'Schaltübungen runterschalten', 'Lenkübungen'] },
  { key: 'grundfahr', title: 'Grundfahraufgaben', items: [
    'Rückwärtsfahren', 'Umkehren', 'Gefahrbremsung', 'Einparken längs vorwärts', 'Einparken längs rückwärts', 'Einparken quer vorwärts', 'Einparken quer rückwärts'] },
  { key: 'aufbau', title: 'Aufbaustufe – Umweltschonend, vorausschauend, Blickschulung', items: [
    'Rollen und Schalten', 'Abbremsen und Schalten', 'Bremsübung degressiv', 'Zielbremsung', 'Bremsen in Gefahrsituationen',
    'Gefälle/Steigung: Anhalten', 'Gefälle/Steigung: Anfahren', 'Gefälle/Steigung: Rückwärts', 'Gefälle/Steigung: Sichern', 'Gefälle/Steigung: Schalten',
    'Tastgeschwindigkeit', 'Bedienungs- & Kontrolleinrichtungen', 'Örtliche Besonderheiten'] },
  { key: 'leistung', title: 'Leistungsstufe – Schwierige Verkehrssituationen', items: [
    'Fahrbahnbenutzung / Einordnen', 'Markierungen', 'Fahrstreifenwechsel links', 'Fahrstreifenwechsel rechts', 'Vorbeifahren/Überholen',
    'Abbiegen rechts', 'Abbiegen links', 'Abbiegen mehrspurig', 'Radweg/Sonderstreifen', 'Straßenbahnen/Einbahnstraßen',
    'Vorfahrt: rechts vor links', 'Grünpfeil', 'Polizeibeamte', 'Geschwindigkeit/Abstand',
    'Fußgängerüberwege', 'Kinder', 'ÖPNV/Schulbus', 'Ältere/Behinderte', 'Radfahrer/Mofa', 'Verkehrsberuhigter Bereich',
    'Schwierige Verkehrsführung', 'Engpass', 'Kreisverkehr', 'Bahnübergang', 'Kritische Verkehrssituationen', 'Schwung nutzen'] },
  { key: 'ueberland', title: '🌄 Überlandfahrten', items: [
    'Angepasste Geschwindigkeit/Gangwahl', 'Abstand vorne', 'Abstand hinten', 'Abstand seitlich', 'Beobachtung/Spiegel', 'Verkehrszeichen',
    'Kreuzungen/Einmündungen', 'Kurven', 'Steigungen', 'Gefälle', 'Alleen', 'Überholen',
    'Liegenbleiben + Absichern', 'Fußgänger', 'Einfahren in Ortschaften', 'Wild/Tiere', 'Leistungsgrenze', 'Ablenkung', 'Orientierung'] },
  { key: 'autobahn', title: '🛣️ Autobahn', items: [
    'Fahrtplanung', 'Einfahren in BAB', 'Fahrstreifenwahl', 'Geschwindigkeit', 'Abstand vorne', 'Abstand hinten', 'Abstand seitlich',
    'Überholen', 'Schilder/Markierungen', 'Vorbeifahren/Anschlussstellen', 'Rast-/Parkplätze/Tankstellen', 'Verhalten bei Unfällen',
    'Dichter Verkehr/Stau', 'Leistungsgrenze', 'Konfliktsituationen', 'Ablenkung', 'Verlassen der BAB'] },
  { key: 'dunkel', title: '🌙 Dämmerung / Dunkelheit', items: [
    'Beleuchtung kontrollieren', 'Beleuchtung benutzen', 'Beleuchtung einstellen', 'Fernlicht', 'Beleuchtete Straßen', 'Unbeleuchtete Straßen', 'Parken',
    'Schlechte Witterung', 'Bahnübergänge', 'Tiere', 'Unbeleuchtete Verkehrsteilnehmer', 'Blendung', 'Orientierung', 'Abschlussbesprechung'] },
  { key: 'reife', title: '🎓 Reife- und Teststufe', items: [
    'Selbstständiges Fahren innerorts', 'Selbstständiges Fahren außerorts', 'Verantwortungsbewusstes Fahren', 'Testfahrt unter Prüfungsbedingungen', 'Wiederholung/Vertiefung', 'Leistungsbewertung'] },
];
const CURR_TOTAL = CURRICULUM.reduce((n, s) => n + s.items.length, 0);
const currKey = (sk, i) => `${sk}:${i}`;
function currLabel(key) { const [sk, i] = String(key).split(':'); const s = CURRICULUM.find((x) => x.key === sk); return s ? s.items[Number(i)] : null; }
function currSection(key) { const sk = String(key).split(':')[0]; return CURRICULUM.find((x) => x.key === sk); }
// Stand einer Aufgabe nach einer Fahrstunde
const CURR_STATUS = {
  mehr:   { short: 'muss noch geübt werden', tiny: 'muss noch', dot: '🔴', cls: 'st-mehr' },
  geuebt: { short: 'geübt',                  tiny: 'geübt',     dot: '🟡', cls: 'st-geuebt' },
  ok:     { short: 'sitzt ganz gut',         tiny: 'sitzt',     dot: '🟢', cls: 'st-ok' },
};
const currStatusMeta = (s) => CURR_STATUS[s] || CURR_STATUS.geuebt;
// Zahl mit deutschem Komma, „,0" weglassen (14, 14,5)
function fmtUnits(u) { const n = Math.round((Number(u) || 0) * 10) / 10; return (Number.isInteger(n) ? String(n) : n.toFixed(1)).replace('.', ','); }
function fmtDMY2(d) { try { return parseD(d).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return d; } }
// Statistik-Kacheln: Fahrstunden (à 80 Min), Termine, Schalt/Automatik, Zeit
function statStripHtml(stats) {
  if (!stats) return '';
  const s = stats;
  const cell = (val, lbl) => `<div class="adk-stat"><b>${val}</b><span>${lbl}</span></div>`;
  const parts = [
    cell(fmtUnits(s.units), `Fahrstunden<br>à ${s.unit || 80} Min`),
    cell(s.sessions || 0, 'Termine'),
  ];
  if (s.schalt && s.schalt.sessions) parts.push(cell(fmtUnits(s.schalt.units), 'Schaltstunden'));
  if (s.automatik && s.automatik.sessions) parts.push(cell(fmtUnits(s.automatik.units), 'Automatik'));
  parts.push(cell(fmtUnits(s.hours) + ' h', 'gefahrene Zeit'));
  return `<div class="adk-stats">${parts.join('')}</div>`;
}
// „Muss noch geübt werden" – Punkte, deren letzter Stand 🔴 war
function adkNeedWorkHtml(adk) {
  if (!adk || !adk.needWork || !adk.needWork.length) return '';
  const items = adk.needWork.map((k) => currLabel(k)).filter(Boolean);
  if (!items.length) return '';
  return `<div class="adk-need"><div class="adk-need-t">🔴 Das üben wir noch (${items.length})</div>
    <ul>${items.map((it) => `<li>${esc(it)}</li>`).join('')}</ul></div>`;
}
// Häufigkeits-Übersicht: je geübte Aufgabe wie oft gesamt (+ letzter Stand, + je Tag)
function adkFreqHtml(adk) {
  if (!adk || !adk.items || !adk.distinct) return '<p class="hint">Noch keine Ausbildungspunkte protokolliert. Der Fahrlehrer hakt sie beim Abschließen einer Fahrstunde ab.</p>';
  const rows = CURRICULUM.map((sec) => {
    const its = sec.items.map((it, i) => {
      const k = currKey(sec.key, i); const agg = adk.items[k];
      if (!agg) return '';
      const days = Object.entries(agg.days || {}).sort((a, z) => a[0].localeCompare(z[0]))
        .map(([d, n]) => `${fmtDMY2(d)}${n > 1 ? ` (${n}×)` : ''}`).join(' · ');
      const m = agg.lastStatus ? currStatusMeta(agg.lastStatus) : null;
      return `<tr><td>${esc(it)}${days ? `<div class="adk-day">${days}</div>` : ''}</td>
        <td class="st">${m ? `<span class="badge ${m.cls}">${m.dot} ${m.tiny}</span>` : ''}</td>
        <td class="n"><strong>${agg.count}×</strong></td></tr>`;
    }).filter(Boolean).join('');
    if (!its) return '';
    return `<tr class="adk-sec-row"><td colspan="3" style="padding-top:.5rem"><strong>${esc(sec.title)}</strong></td></tr>${its}`;
  }).filter(Boolean).join('');
  return `<table class="adk-freq"><tbody>${rows}</tbody></table>`;
}
// Ausbildungspunkte, die in EINER Fahrstunde behandelt wurden (aus bookings.curriculum)
function lessonAdkParse(cur) {
  if (!cur) return [];
  let arr = []; try { arr = typeof cur === 'string' ? JSON.parse(cur) : cur; } catch { return []; }
  if (!Array.isArray(arr)) return [];
  return arr.map((raw) => {
    const k = typeof raw === 'string' ? raw : (raw && raw.k);
    if (!k) return null;
    let s = (raw && typeof raw === 'object' && raw.s) ? raw.s : 'geuebt';
    return { k, s, label: currLabel(k), section: currSection(k)?.title || '' };
  }).filter((x) => x && x.label);
}
// Fenster: was wurde in dieser Fahrstunde gemacht (+ Download-PDF)
function openLessonAdk(lesson, name) {
  const items = lessonAdkParse(lesson.curriculum);
  const when = fmtDT(lesson.date, lesson.start_time);
  if (!items.length) {
    modal(`<h3>📋 Ausbildungskarte</h3><p class="hint">Für die Fahrstunde am ${when} wurden keine Ausbildungspunkte protokolliert.</p>
      <div class="actions"><button onclick="window.__closeModal()">Schließen</button></div>`);
    return;
  }
  // nach Abschnitt gruppieren
  const bySec = {};
  for (const it of items) (bySec[it.section] = bySec[it.section] || []).push(it);
  const body = Object.entries(bySec).map(([sec, its]) => `<div class="mk-sec"><div class="mk-sec-t">${esc(sec)}</div>
    ${its.map((it) => { const m = currStatusMeta(it.s); return `<div class="tc-item ro on">${m.dot} ${esc(it.label)} <span class="badge ${m.cls}" style="margin-left:auto">${m.tiny}</span></div>`; }).join('')}</div>`).join('');
  modal(`<h3>📋 Diese Fahrstunde</h3>
    <p class="hint"><strong>${when}</strong> · ${lesson.duration_min} Min${lesson.gearbox ? ' · ' + (lesson.gearbox === 'schalt' ? 'Schalter' : 'Automatik') : ''}${lesson.plate ? ' · 🚘 ' + esc(lesson.plate) : ''}<br>${items.length} Ausbildungspunkt${items.length === 1 ? '' : 'e'} bearbeitet.</p>
    <div style="max-height:52vh;overflow:auto;margin:.2rem -.1rem;padding:0 .1rem">${body}</div>
    <div class="actions"><button class="sec" id="la-pdf">📄 Als PDF</button><button onclick="window.__closeModal()">Schließen</button></div>`, 'wide');
  const pb = $('#la-pdf'); if (pb) pb.onclick = () => printLessonAdk(lesson, name || state.user?.name || 'Fahrschüler');
}
// Eine Fahrstunden-ADK als sauberes weißes PDF (Browser-Druck -> „Als PDF sichern")
function printLessonAdk(lesson, name) {
  const items = lessonAdkParse(lesson.curriculum);
  const when = fmtDT(lesson.date, lesson.start_time);
  const school = esc(state.settings?.instructor_name || 'Fahrschule');
  const bySec = {};
  for (const it of items) (bySec[it.section] = bySec[it.section] || []).push(it);
  const secs = Object.entries(bySec).map(([sec, its]) => `<section><h2>${esc(sec)}</h2><div class="items">${its.map((it) => {
    const m = currStatusMeta(it.s);
    return `<div class="it"><span class="bx">☑</span> <span>${esc(it.label)}</span> <em class="st ${m.cls}">${m.tiny}</em></div>`;
  }).join('')}</div></section>`).join('');
  const doc = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Fahrstunde ${esc(when)} – ${esc(name)}</title>
    <style>*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:26px 30px;max-width:760px}
    .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}
    .head h1{font-size:19px;margin:0}.head .meta{font-size:12px;color:#444;text-align:right;line-height:1.5}
    section{break-inside:avoid;margin:0 0 12px}h2{font-size:14px;margin:0 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}
    .it{font-size:12.5px;line-height:1.9;display:flex;align-items:center;gap:6px}.bx{font-size:14px}
    .st{margin-left:auto;font-style:normal;font-size:11px;border:1px solid #bbb;border-radius:6px;padding:1px 7px}
    .st.st-mehr{color:#c0392b;border-color:#e6a}.st.st-ok{color:#1e8449;border-color:#9d9}.st.st-geuebt{color:#9a6b00;border-color:#eca}
    .foot{margin-top:20px;font-size:11px;color:#666;border-top:1px solid #ccc;padding-top:8px}
    .sign{margin-top:30px;display:flex;gap:40px}.sign div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:11px;color:#444}
    @media print{body{padding:0}}</style></head><body>
    <div class="head"><div><h1>Ausbildungsnachweis – Fahrstunde</h1><div style="font-size:13px;margin-top:2px">${esc(name)} · ${esc(when)} · ${lesson.duration_min} Min${lesson.gearbox ? ' · ' + (lesson.gearbox === 'schalt' ? 'Schalter' : 'Automatik') : ''}</div></div>
      <div class="meta">${school}</div></div>
    ${secs || '<p>Keine Punkte.</p>'}
    <div class="sign"><div>Unterschrift Fahrlehrer</div><div>Unterschrift Fahrschüler</div></div>
    <div class="foot">Erstellt mit ginoco</div>
    <script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Bitte Pop-ups erlauben, um das PDF zu erzeugen.', 'err'); return; }
  w.document.open(); w.document.write(doc); w.document.close();
}

async function openTrainingCard(id, name) {
  let training = {}, adk = null, stats = null;
  try { const r = await api('/api/students/' + id + '/training'); training = r.training || {}; adk = r.adk; stats = r.stats; } catch (e) { toast(e.message, 'err'); return; }
  const doneCount = () => Object.values(training).filter(Boolean).length;
  const barInner = () => {
    const d = doneCount(), pct = Math.round((d / CURR_TOTAL) * 100);
    return `<div class="fp-prog-row"><span>Ausbildungsfortschritt</span><span id="tc-pct">${d}/${CURR_TOTAL} · ${pct}%</span></div>
      <div class="fp-prog-bar"><div id="tc-fill" style="width:${pct}%"></div></div>`;
  };
  const sections = CURRICULUM.map((s) => {
    const done = s.items.filter((_, i) => training[currKey(s.key, i)]).length;
    return `<details class="tc-sec" open>
      <summary>${esc(s.title)} <span class="pill" data-secpill="${s.key}">${done}/${s.items.length}</span></summary>
      <div class="tc-items">${s.items.map((it, i) => {
        const k = currKey(s.key, i); const v = training[k];
        const dt = (typeof v === 'number' && v > 1e12) ? `<span class="tc-date">${new Date(v).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>` : '';
        return `<label class="tc-item"><input type="checkbox" data-tc="${k}" data-sk="${s.key}" ${v ? 'checked' : ''}> <span>${esc(it)}</span>${dt}</label>`;
      }).join('')}</div>
    </details>`;
  }).join('');
  // Vollbild-Seite (nicht als enges Fenster) – viel Platz zum Abhaken
  const ov = document.createElement('div');
  ov.className = 'fp-overlay';
  ov.innerHTML = `<div class="fp">
    <div class="fp-head">
      <button class="fp-back" id="tc-back">‹ Zurück</button>
      <div class="fp-title">📋 Ausbildungskarte <span>${esc(name)}</span></div>
      <button class="sec sm" id="tc-pdf">📄 PDF</button>
    </div>
    <div class="fp-sub">Hake ab, was ${esc((name || '').split(' ')[0])} schon geübt/beherrscht hat. Den Stand je Punkt (🔴🟡🟢) und die Häufigkeit setzt du beim Abschließen der Fahrstunde. Speichert automatisch.</div>
    ${statStripHtml(stats)}
    ${adkNeedWorkHtml(adk)}
    <div class="fp-progwrap"><div id="tc-bar">${barInner()}</div>
      <input id="tc-search" class="fp-search" placeholder="🔍 Punkt suchen … (z.B. Kreisverkehr, Einparken)" autocomplete="off"></div>
    <div class="fp-body">
      <details class="tc-sec"><summary>📊 Häufigkeit – wie oft was geübt wurde (${adk ? adk.distinct : 0})</summary><div style="padding:0 .1rem">${adkFreqHtml(adk)}</div></details>
      ${sections}</div>
    <div class="fp-noresult hidden" id="tc-noresult">Kein Punkt gefunden.</div>
  </div>`;
  document.body.appendChild(ov);
  // Live-Suche: filtert die Punkte, blendet leere Abschnitte aus
  const search = ov.querySelector('#tc-search');
  search.oninput = () => {
    const q = search.value.trim().toLowerCase();
    let anyShown = false;
    ov.querySelectorAll('.tc-sec').forEach((sec) => {
      let secShown = 0;
      sec.querySelectorAll('.tc-item').forEach((it) => {
        const match = !q || it.textContent.toLowerCase().includes(q);
        it.style.display = match ? '' : 'none';
        if (match) secShown++;
      });
      sec.style.display = secShown ? '' : 'none';
      if (q && secShown) sec.open = true;
      if (secShown) anyShown = true;
    });
    ov.querySelector('#tc-noresult').classList.toggle('hidden', anyShown);
  };
  const pwa = document.getElementById('pwa-install'); if (pwa) pwa.style.display = 'none';
  const close = () => { ov.remove(); const p = document.getElementById('pwa-install'); if (p) p.style.display = ''; };
  ov.querySelector('#tc-back').onclick = close;
  ov.querySelector('#tc-pdf').onclick = () => printTrainingCard(name, training);
  const refreshBar = () => { const t = ov.querySelector('#tc-bar'); if (t) t.innerHTML = barInner(); };
  let saveTimer = null;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(async () => {
    try { await api('/api/students/' + id + '/training', { method: 'PUT', body: { training } }); } catch (e) { toast(e.message, 'err'); }
  }, 500); };
  ov.querySelectorAll('[data-tc]').forEach((cb) => cb.onchange = () => {
    if (cb.checked) training[cb.dataset.tc] = Date.now();   // Zeitstempel = „zuletzt abgehakt“
    else delete training[cb.dataset.tc];
    const sec = CURRICULUM.find((s) => s.key === cb.dataset.sk);
    const done = sec.items.filter((_, i) => training[currKey(sec.key, i)]).length;
    const pill = ov.querySelector(`[data-secpill="${cb.dataset.sk}"]`); if (pill) pill.textContent = `${done}/${sec.items.length}`;
    refreshBar(); save();
  });
}

// Ausbildungskarte als sauberes, weißes PDF (über den Drucken-Dialog des Browsers -> „Als PDF sichern")
function printTrainingCard(name, training) {
  const done = Object.values(training).filter(Boolean).length;
  const pct = CURR_TOTAL ? Math.round((done / CURR_TOTAL) * 100) : 0;
  const today = new Date().toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const school = esc(state.settings?.instructor_name || 'Fahrschule');
  const secs = CURRICULUM.map((s) => {
    const dn = s.items.filter((_, i) => training[currKey(s.key, i)]).length;
    const items = s.items.map((it, i) => {
      const on = !!training[currKey(s.key, i)];
      return `<div class="it"><span class="bx">${on ? '☑' : '☐'}</span> <span class="${on ? 'dn' : ''}">${esc(it)}</span></div>`;
    }).join('');
    return `<section><h2>${esc(s.title)} <em>${dn}/${s.items.length}</em></h2><div class="items">${items}</div></section>`;
  }).join('');
  const doc = `<!doctype html><html lang="de"><head><meta charset="utf-8">
    <title>Ausbildungskarte – ${esc(name)}</title>
    <style>
      *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:28px 30px;max-width:820px}
      .head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px}
      .head h1{font-size:20px;margin:0} .head .meta{font-size:12px;color:#444;text-align:right;line-height:1.5}
      .prog{margin:10px 0 16px;font-size:13px} .bar{height:10px;background:#e6e6e6;border-radius:5px;overflow:hidden;margin-top:4px}
      .bar>i{display:block;height:100%;width:${pct}%;background:#111}
      section{break-inside:avoid;margin:0 0 12px} h2{font-size:14px;margin:0 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}
      h2 em{font-style:normal;color:#666;font-weight:normal;font-size:12px;float:right}
      .items{columns:2;column-gap:26px} .it{font-size:12px;line-height:1.7;break-inside:avoid} .bx{font-size:13px}
      .dn{text-decoration:none} .foot{margin-top:20px;font-size:11px;color:#666;border-top:1px solid #ccc;padding-top:8px}
      .sign{margin-top:34px;display:flex;gap:40px} .sign div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:11px;color:#444}
      @media print{body{padding:0}}
    </style></head><body>
    <div class="head"><div><h1>Ausbildungskarte</h1><div style="font-size:13px;margin-top:2px">${esc(name)}</div></div>
      <div class="meta">${school}<br>Stand: ${today}</div></div>
    <div class="prog"><strong>Ausbildungsfortschritt: ${done}/${CURR_TOTAL} (${pct}%)</strong><div class="bar"><i></i></div></div>
    ${secs}
    <div class="sign"><div>Unterschrift Fahrlehrer</div><div>Unterschrift Fahrschüler</div></div>
    <div class="foot">Erstellt mit ginoco · ${today}</div>
    <script>window.onload=function(){setTimeout(function(){window.print()},200)}<\/script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { toast('Bitte Pop-ups erlauben, um das PDF zu erzeugen.', 'err'); return; }
  w.document.open(); w.document.write(doc); w.document.close();
}

// Schüler sieht seine eigene Ausbildungskarte (nur Lesen) – mit Stand, Häufigkeit & Statistik
async function openMyTraining() {
  let training = {}, adk = myAdk, stats = myStats;
  try { const r = await api('/api/my/training'); training = r.training || {}; } catch (e) { toast(e.message, 'err'); return; }
  // adk/stats ggf. frisch holen, falls noch nicht geladen
  if (!adk || !stats) { try { const m = await api('/api/my/bookings'); adk = m.adk; stats = m.stats; myAdk = adk; myStats = stats; } catch {} }
  const done = Object.values(training).filter(Boolean).length;
  const pct = CURR_TOTAL ? Math.round((done / CURR_TOTAL) * 100) : 0;
  const sections = CURRICULUM.map((s) => {
    const dn = s.items.filter((_, i) => training[currKey(s.key, i)]).length;
    const items = s.items.map((it, i) => {
      const k = currKey(s.key, i); const on = !!training[k];
      const agg = adk && adk.items && adk.items[k];
      const m = agg && agg.lastStatus ? currStatusMeta(agg.lastStatus) : null;
      const extra = agg ? `<span class="tc-date">${agg.count}×${m ? ' · ' + m.dot : ''}</span>` : '';
      return `<div class="tc-item ro${on ? ' on' : ''}"><span>${on ? '✅' : '⬜'} ${esc(it)}</span>${extra}</div>`;
    }).join('');
    return `<details class="tc-sec"${dn ? ' open' : ''}><summary>${esc(s.title)} <span class="pill">${dn}/${s.items.length}</span></summary>
      <div class="tc-items">${items}</div></details>`;
  }).join('');
  modal(`<h3>📋 Deine Ausbildungskarte</h3>
    <p class="hint">Dein Ausbildungsstand: <em>was</em> ihr geübt habt, wie oft und wie gut es sitzt. Die Häkchen &amp; Bewertung setzt dein Fahrlehrer.</p>
    ${statStripHtml(stats)}
    <div style="margin:.3rem 0 .5rem">
      <div style="display:flex;justify-content:space-between;font-size:.82rem;color:var(--muted)"><span>Ausbildungsfortschritt</span><span>${done}/${CURR_TOTAL} · ${pct}%</span></div>
      <div style="height:9px;background:#0f151d;border-radius:6px;overflow:hidden;margin-top:.25rem"><div style="height:100%;width:${pct}%;background:var(--brand)"></div></div>
    </div>
    ${adkNeedWorkHtml(adk)}
    <div style="max-height:52vh;overflow:auto;margin:.2rem -.2rem 0;padding:0 .2rem">
      <details class="tc-sec"><summary>📊 Häufigkeit – wie oft was geübt wurde</summary><div style="padding:0 .1rem">${adkFreqHtml(adk)}</div></details>
      ${sections}
    </div>
    <div class="actions"><button onclick="window.__closeModal()">Schließen</button></div>`, 'wide');
}
window.__openMyTraining = openMyTraining;

// Prüfungsreife-Check: was fehlt noch bis zur Prüfung? (Sonderfahrten, rote ADK-Punkte,
// Ausbildungsabschnitte, Fahrstunden). Die endgültige Entscheidung trifft der Fahrlehrer.
async function openExamReadiness() {
  const prog = myProgress; const adk = myAdk; const stats = myStats;
  let training = {};
  try { const r = await api('/api/my/training'); training = r.training || {}; } catch {}
  if ((!adk || !stats) ) { try { const m = await api('/api/my/bookings'); adk = m.adk; stats = m.stats; myAdk = adk; myStats = stats; myProgress = m.progress; } catch {} }
  const req = (prog && prog.req) || { ueberland: 5, autobahn: 4, nacht: 3 };
  const have = (prog && prog.sonder) || { ueberland: 0, autobahn: 0, nacht: 0 };
  const sonderRows = ['ueberland', 'autobahn', 'nacht'].map((k) => ({ k, have: have[k] || 0, need: req[k] || 0, ok: (have[k] || 0) >= (req[k] || 0) }));
  const sonderOpen = sonderRows.filter((r) => !r.ok);
  const red = ((adk && adk.needWork) || []).map(currLabel).filter(Boolean);
  const sections = CURRICULUM.map((s) => { const done = s.items.filter((_, i) => training[currKey(s.key, i)]).length; return { title: s.title, done, total: s.items.length }; });
  const openSections = sections.filter((s) => s.done === 0);
  const coveredItems = sections.reduce((n, s) => n + s.done, 0);
  const covPct = CURR_TOTAL ? Math.round(coveredItems / CURR_TOTAL * 100) : 0;
  const units = (stats && stats.units) || 0;
  const ready = sonderOpen.length === 0 && red.length === 0 && openSections.length === 0 && coveredItems > 0;
  const line = (ok, txt, sub) => `<div class="er-line ${ok ? 'ok' : 'todo'}"><span class="er-ic">${ok ? '✅' : '⬜'}</span><div><div>${txt}</div>${sub ? `<div class="er-sub">${sub}</div>` : ''}</div></div>`;
  const sonderSub = sonderOpen.length
    ? 'Noch offen: ' + sonderOpen.map((r) => `${TYPE_LABEL[r.k]} ${r.have}/${r.need} UE`).join(' · ')
    : `Alle Pflichtfahrten komplett (${sonderRows.map((r) => `${r.have}/${r.need}`).join(' · ')})`;
  const redSub = red.length ? red.slice(0, 8).map(esc).join(' · ') + (red.length > 8 ? ' …' : '') : 'Nichts steht mehr auf 🔴.';
  const secSub = openSections.length ? 'Noch nicht begonnen: ' + openSections.map((s) => esc(s.title.replace(/^[^ ]+ /, ''))).slice(0, 6).join(' · ') : `Alle Abschnitte begonnen · ${coveredItems}/${CURR_TOTAL} Punkte (${covPct}%)`;
  modal(`<h3>🎓 Bin ich bald prüfungsreif?</h3>
    <div class="er-verdict ${ready ? 'ok' : ''}">${ready
      ? '🎉 Sieht stark aus! Sprich deinen Fahrlehrer auf den Prüfungstermin an.'
      : 'Fast geschafft – das fehlt noch. Deinen Prüfungstermin bespricht am Ende dein Fahrlehrer.'}</div>
    ${statStripHtml(stats)}
    <div class="er-list">
      ${line(sonderOpen.length === 0, '🌄 Sonderfahrten', sonderSub)}
      ${line(red.length === 0, '🚦 Nichts steht mehr auf „muss noch geübt werden"', redSub)}
      ${line(openSections.length === 0, '📋 Alle Ausbildungsabschnitte begonnen', secSub)}
      ${line(units > 0, '🚗 Fahrstunden gesammelt', `${fmtUnits(units)} Fahrstunden (à 80 Min)`)}
    </div>
    <p class="hint" style="margin-top:.5rem">Das ist eine Selbsteinschätzung aus deinem Ausbildungsstand. Ob du wirklich zur Prüfung angemeldet wirst, entscheidet dein Fahrlehrer.</p>
    <div class="actions"><button class="sec" onclick="window.__openMyTraining()">📋 Ausbildungskarte</button><button onclick="window.__closeModal()">Schließen</button></div>`, 'wide');
}
window.__openExamReadiness = openExamReadiness;

// Zugangsdaten-Anzeige mit Kopier-Funktion (nach Anlegen)
function showCredentials(r, title) {
  modal(`<h3>${esc(title)}</h3>
    <p class="hint">Gib diese Zugangsdaten an den Fahrschüler weiter. Das Passwort ist nur jetzt sichtbar – du kannst es später aber jederzeit zurücksetzen.</p>
    <div class="field"><label>Login-Name</label><input id="cr-user" value="${esc(r.username)}" readonly></div>
    <div class="field"><label>Passwort</label><input id="cr-pw" value="${esc(r.password)}" readonly></div>
    <div class="actions">
      <button class="sec" id="cr-copy">📋 Kopieren</button>
      <button onclick="window.__closeModal()">Fertig</button>
    </div>`);
  $('#cr-copy').onclick = () => {
    const txt = `ginoco Login\nAdresse: https://ginoco.de\nLogin-Name: ${r.username}\nPasswort: ${r.password}`;
    navigator.clipboard.writeText(txt).then(() => toast('Kopiert ✓', 'ok')).catch(() => toast('Kopieren nicht möglich', 'err'));
  };
}

// Festen Treffpunkt (Standort) eines Schuelers festlegen – wird als Standard fuer dessen Fahrstunden genutzt
function openStandortModal(id, name, label, lat, lng) {
  modal(`<h3>Treffpunkt für ${esc(name)}</h3>
    <p class="hint">Der Ort, an dem du ${esc((name || '').split(' ')[0])} normalerweise abholst. Er wird bei jeder Fahrstunde automatisch als Treffpunkt genutzt – du musst ihn dann nicht mehr einzeln eintragen.</p>
    <div class="field"><label>Adresse / Beschreibung</label>
      <input id="st-label" value="${esc(label || '')}" placeholder="z.B. Bahnhof Musterstadt, Gleis-Eingang"></div>
    <div style="margin:.2rem 0 .7rem"><button class="sec sm" id="st-here" type="button">📍 Aktueller Standort übernehmen</button>
      <span class="hint" id="st-here-info" style="margin-left:.5rem"></span></div>
    <div class="inline">
      <div class="field" style="flex:1"><label>Breitengrad (optional)</label><input id="st-lat" value="${esc(lat || '')}" placeholder="z.B. 52.5200"></div>
      <div class="field" style="flex:1"><label>Längengrad (optional)</label><input id="st-lng" value="${esc(lng || '')}" placeholder="z.B. 13.4050"></div>
    </div>
    <p class="hint" style="margin-top:-.4rem">Tipp: Wenn du gerade beim Treffpunkt stehst, tippe oben auf „Aktueller Standort übernehmen“ – Koordinaten und Adresse werden automatisch ausgefüllt. Alternativ Koordinaten aus Google Maps per Rechtsklick.</p>
    <div class="actions">
      <button class="ghost" id="st-clear" type="button">Treffpunkt entfernen</button>
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="st-save">Speichern</button>
    </div>`);
  const save = async (body, msg) => {
    try { await api('/api/students/' + id, { method: 'PATCH', body }); toast(msg, 'ok'); closeModal(); tabSchueler(); }
    catch (e) { toast(e.message, 'err'); }
  };
  $('#st-save').onclick = () => {
    const l = $('#st-label').value.trim();
    const la = $('#st-lat').value.trim(), lo = $('#st-lng').value.trim();
    if (!l && !la) { toast('Bitte eine Adresse eingeben', 'err'); return; }
    if ((la && !lo) || (!la && lo)) { toast('Bitte Breiten- UND Längengrad eingeben (oder beide leer)', 'err'); return; }
    save({ home_label: l, home_lat: la || null, home_lng: lo || null }, 'Treffpunkt gespeichert ✓');
  };
  $('#st-clear').onclick = () => save({ home_label: null, home_lat: null, home_lng: null }, 'Treffpunkt entfernt');
  $('#st-here').onclick = async () => {
    const info = $('#st-here-info');
    info.textContent = 'GPS wird ermittelt …';
    try {
      const c = await getPosOnce();
      $('#st-lat').value = c.latitude.toFixed(6);
      $('#st-lng').value = c.longitude.toFixed(6);
      info.textContent = '✓ Koordinaten übernommen';
      if (!$('#st-label').value.trim()) {
        const addr = await reverseGeocode(c.latitude, c.longitude);
        if (addr) { $('#st-label').value = addr; info.textContent = '✓ Standort & Adresse übernommen'; }
      }
    } catch (e) { info.textContent = ''; toast(e.message || 'GPS nicht verfügbar', 'err'); }
  };
}

// Starkes, aber lesbares Zufallspasswort: Buchstaben + Zahl + Sonderzeichen
function randomPassword() {
  const lower = 'abcdefghijkmnpqrstuvwxyz';   // ohne l/o
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // ohne I/O
  const digit = '23456789';
  const special = '!?#@%+*';
  const pick = (set) => { const b = new Uint8Array(1); crypto.getRandomValues(b); return set[b[0] % set.length]; };
  // je Kategorie mind. eins, dann auffuellen, dann mischen
  const chars = [pick(lower), pick(upper), pick(digit), pick(special)];
  const all = lower + upper + digit + special;
  while (chars.length < 10) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { const b = new Uint8Array(1); crypto.getRandomValues(b); const j = b[0] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
// Client-seitige Passwort-Pruefung (Server prueft nochmal)
function pwProblem(pw) {
  pw = String(pw || '');
  if (pw.length < 8) return 'mindestens 8 Zeichen';
  if (!/[A-Za-zÄÖÜäöüß]/.test(pw)) return 'einen Buchstaben';
  if (!/[0-9]/.test(pw)) return 'eine Zahl';
  if (!/[^A-Za-z0-9ÄÖÜäöüß]/.test(pw)) return 'ein Sonderzeichen (z. B. ! ? # @)';
  return null;
}

function openResetModal(id, name, username) {
  modal(`<h3>Zugangsdaten für ${esc(name)}</h3>
    <div class="field"><label>Login-Name (bleibt immer gleich)</label>
      <div class="inline"><input id="rs-user" value="${esc(username || '–')}" readonly style="flex:1"><button class="sec sm" id="rs-ucopy" type="button">📋 Login</button></div></div>
    <p class="hint">Das Passwort ist verschlüsselt gespeichert und lässt sich aus Sicherheitsgründen nicht anzeigen. Zum Weitergeben erzeugst du hier ein <strong>neues</strong> Passwort (das alte wird dann ungültig).</p>
    <div class="field"><label>Neues Passwort (mind. 8 Zeichen, mit Zahl & Sonderzeichen)</label>
      <div class="inline"><input id="rs-pw" value="${randomPassword()}" style="flex:1"><button class="sec sm" id="rs-gen" type="button">🎲 Neu</button></div>
    </div>
    <div id="rs-done" class="hidden"></div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <button id="rs-save">Passwort setzen</button>
    </div>`);
  $('#rs-gen').onclick = () => { $('#rs-pw').value = randomPassword(); };
  $('#rs-ucopy').onclick = () => { navigator.clipboard?.writeText(username || ''); toast('Login kopiert', 'ok'); };
  $('#rs-save').onclick = async () => {
    const pw = $('#rs-pw').value.trim();
    const prob = pwProblem(pw);
    if (prob) { toast('Passwort braucht ' + prob, 'err'); return; }
    try {
      await api('/api/students/' + id + '/reset-password', { method: 'POST', body: { new_password: pw } });
      const share = `Hallo ${name}, dein Zugang zu ginoco (Fahrschule):\nLogin-Name: ${username}\nPasswort: ${pw}`;
      $('#rs-done').classList.remove('hidden');
      $('#rs-done').innerHTML = `<div class="warnbox" style="margin-top:.4rem">✓ Passwort gesetzt. Diese Zugangsdaten weitergeben:</div>
        <pre style="background:#0f151d;border:1px solid var(--line);border-radius:8px;padding:.7rem;white-space:pre-wrap;font-size:.85rem;margin:.5rem 0">${esc(share)}</pre>
        <button class="sec sm" id="rs-copy">📋 Kopieren</button>`;
      $('#rs-save').textContent = 'Fertig'; $('#rs-save').onclick = closeModal;
      $('#rs-copy').onclick = () => { navigator.clipboard?.writeText(share); toast('Zugangsdaten kopiert', 'ok'); };
      toast('Passwort gesetzt ✓', 'ok');
      if (document.getElementById('reset-reqs')) renderResetRequests(); // Anfrage-Banner aktualisieren
    } catch (e) { toast(e.message, 'err'); }
  };
}

// ---- Tab: Arbeitszeiten / Dienstplan (kurze Tage, freie Tage) ----
const WTYPES = [
  ['short', '✂️', 'Kürzer', 'früher Feierabend'],
  ['free', '🏖️', 'Frei', 'ganzer Tag zu'],
  ['vacation', '🌴', 'Urlaub', 'zählt als Arbeitszeit'],
];
async function tabArbeitszeiten() {
  const s = state.settings;
  const box = $('#itab');
  state.wType = state.wType || 'short';
  state.wMonth = firstOfMonth(state.date);
  state.wSelected = new Set();
  box.innerHTML = `<div class="card">
    <h2>Arbeitszeiten & Dienstplan <span class="sub">Resturlaub: ${s.vacation_days_left ?? '–'} Tage</span></h2>
    <p class="hint">Trag ein, wenn ein Tag anders läuft – die buchbaren Zeiten passen sich für die Schüler automatisch an.</p>
    <div class="ap-label">Was ist an dem Tag / den Tagen?</div>
    <div class="seg" id="w-seg">
      ${WTYPES.map(([t, ic, lb, sub]) => `<button data-t="${t}" class="${state.wType === t ? 'active' : ''}">
        <span class="seg-ic">${ic}</span><span class="seg-lb">${lb}</span><span class="seg-sub">${sub}</span></button>`).join('')}
    </div>
    <div id="w-single">
      <div class="row"><div class="field"><label>Datum</label><input type="date" id="w-date" value="${state.date}"></div></div>
      <div class="row" id="w-times">
        <div class="field"><label>Arbeitsbeginn</label><input id="w-start" value="${s.start_time}"></div>
        <div class="field"><label>Letzter Slot</label><input id="w-last" value="${s.short_day_last_start || '13:35'}"></div>
      </div>
    </div>
    <div id="w-multi" class="hidden">
      <p class="hint" style="margin:.1rem 0 .5rem">Tippe die Tage an – auch mehrere. Nochmal tippen hebt die Auswahl auf.</p>
      <div id="w-cal"></div>
      <div id="w-selinfo" style="margin:.5rem 0 0"></div>
    </div>
    <div class="inline" style="margin:.6rem 0 1rem"><button id="w-add">Eintragen</button>
      <span class="hint" style="margin:0" id="w-preview"></span></div>
    <div id="w-list"></div>
  </div>`;
  const single = $('#w-single'), multi = $('#w-multi');
  const updateSel = () => {
    const n = state.wSelected.size;
    $('#w-selinfo').innerHTML = n
      ? `<span class="pill" style="background:var(--good-bg);color:var(--good)">${n} Tag${n === 1 ? '' : 'e'} gewählt</span> <button class="ghost sm" id="w-clear">leeren</button>`
      : '<span class="muted" style="font-size:.85rem">Noch keine Tage gewählt.</span>';
    const c = $('#w-clear'); if (c) c.onclick = () => { state.wSelected.clear(); drawWorkCal(); updateWPreview(); };
  };
  const drawWorkCal = () => {
    const first = parseD(state.wMonth), y = first.getFullYear(), mo = first.getMonth();
    const startDow = isoDow(ymd(new Date(y, mo, 1))), inMonth = new Date(y, mo + 1, 0).getDate(), today = todayStr();
    let cells = '';
    for (let i = 1; i < startDow; i++) cells += '<span class="mc-empty"></span>';
    for (let d = 1; d <= inMonth; d++) {
      const ds = ymd(new Date(y, mo, d)), past = ds < today, sel = state.wSelected.has(ds);
      cells += `<button class="mc-day${sel ? ' sel' : ''}${ds === today ? ' today' : ''}" data-day="${ds}" ${past ? 'disabled' : ''}>${d}</button>`;
    }
    $('#w-cal').innerHTML = `<div class="minical">
      <div class="mc-head"><button class="sec sm" data-wmo="-1">‹</button><strong>${MON_LONG[mo]} ${y}</strong><button class="sec sm" data-wmo="1">›</button></div>
      <div class="mc-grid mc-wd">${WD.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="mc-grid">${cells}</div></div>`;
    $('#w-cal').querySelectorAll('[data-day]').forEach((el) => el.onclick = () => {
      const d = el.dataset.day;
      if (state.wSelected.has(d)) state.wSelected.delete(d); else state.wSelected.add(d);
      el.classList.toggle('sel'); updateSel(); updateWPreview();
    });
    $('#w-cal').querySelectorAll('[data-wmo]').forEach((el) => el.onclick = () => { state.wMonth = addMonths(state.wMonth, Number(el.dataset.wmo)); drawWorkCal(); });
    updateSel();
  };
  const updateWPreview = () => {
    const t = state.wType;
    if (t === 'short') {
      const step = s.lesson_min + s.break_min, toM = (x) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; };
      const list = [];
      for (let x = toM($('#w-start').value); x <= toM($('#w-last').value); x += step) list.push(`${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`);
      $('#w-preview').textContent = `${list.length} Slots: ${list.join(', ') || '–'}`;
    } else {
      const n = state.wSelected.size;
      $('#w-preview').textContent = n ? `${t === 'vacation' ? 'Urlaub' : 'Frei'}: ${n} Tag${n === 1 ? '' : 'e'}${t === 'vacation' ? ` · je ${s.vacation_credit_min} Min` : ''}` : '';
    }
  };
  const sync = () => {
    const t = state.wType;
    single.classList.toggle('hidden', t !== 'short');
    multi.classList.toggle('hidden', t === 'short');
    if (t === 'short') { $('#w-start').value = s.start_time; $('#w-last').value = s.short_day_last_start || '13:35'; }
    else drawWorkCal();
    updateWPreview();
  };
  $('#w-seg').querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
    state.wType = b.dataset.t;
    $('#w-seg').querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('active', x === b));
    sync();
  });
  ['w-start', 'w-last', 'w-date'].forEach((id) => $('#' + id).oninput = updateWPreview);
  sync();
  $('#w-add').onclick = async () => {
    const t = state.wType;
    let body;
    if (t === 'short') { body = { date: $('#w-date').value, type: 'short', start_time: $('#w-start').value, last_start: $('#w-last').value }; }
    else {
      if (!state.wSelected.size) { toast('Bitte erst Tage antippen', 'err'); return; }
      body = { type: t, dates: [...state.wSelected] };
    }
    const send = async (force) => api('/api/day-overrides', { method: 'POST', body: force ? { ...body, force: true } : body });
    const done = (r) => { toast(`Eingetragen ✓${r.days > 1 ? ` (${r.days} Tage)` : ''}`, 'ok'); state.wSelected.clear(); loadOverrides(); if (t !== 'short') drawWorkCal(); updateWPreview(); };
    try { done(await send(false)); }
    catch (e) {
      if (/schon .* Termin/.test(e.message) && confirm(e.message + '\n\nTrotzdem eintragen?')) {
        try { done(await send(true)); } catch (e2) { toast(e2.message, 'err'); }
      } else { toast(e.message, 'err'); }
    }
  };
  loadOverrides();
}
async function loadOverrides() {
  try {
    const { overrides } = await api('/api/day-overrides');
    $('#w-list').innerHTML = overrides.length ? `<div class="inline" style="justify-content:space-between;margin-bottom:.5rem">
        <h2 style="font-size:.95rem;margin:0">Eingetragene Tage</h2><span class="pill">${overrides.length}</span></div><div class="blist">${
      overrides.map((o) => `<div class="bitem ${o.type === 'vacation' ? 'ov-vac' : o.closed ? 'ov-free' : 'ov-short'}">
        <div><div class="when">${o.type === 'vacation' ? '🌴' : o.closed ? '🏖️' : '✂️'} ${WD_LONG[isoDow(o.date) - 1]}, ${fmtShort(o.date)}</div>
        <div class="meta">${o.type === 'vacation' ? 'Urlaub' : o.closed ? 'ganzer Tag frei' : `kurzer Tag · ${o.start_time || state.settings.start_time}–${o.last_start || '?'}`}</div></div>
        <button class="ghost sm" data-delov="${o.date}">Löschen</button></div>`).join('')
    }</div>` : '<p class="muted">Keine besonderen Tage eingetragen.</p>';
    $('#w-list').querySelectorAll('[data-delov]').forEach((b) => b.onclick = async () => {
      try { await api('/api/day-overrides/' + b.dataset.delov, { method: 'DELETE' }); loadOverrides(); } catch (e) { toast(e.message, 'err'); }
    });
  } catch (e) { toast(e.message, 'err'); }
}

// ---- Tab: Theorie & Ausnahmen ----
const BLOCK_META = { theorie: ['📚', 'Theorie'], block: ['⛔', 'Blockiert'], frei: ['🌴', 'Frei / Urlaub'] };
// --- Sammel-Theorie: mehrere Termine auf einmal ---
function parseImportDateClient(s) {
  s = String(s || '').trim(); let m;
  if (m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)) return `${m[1]}-${m[2]}-${m[3]}`;
  if (m = s.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/)) {
    const d = +m[1], mo = +m[2]; let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : null;
    const pad = (n) => String(n).padStart(2, '0');
    if (!y) { y = parseD(todayStr()).getFullYear(); if (`${y}-${pad(mo)}-${pad(d)}` < todayStr()) y++; }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
  return null;
}
function parseTimeClient(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})[:.]?(\d{2})?$/); if (!m) return null;
  const h = +m[1], mi = m[2] ? +m[2] : 0; if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
function parseTheoryLine(line) {
  const raw = String(line).trim(); if (!raw) return null;
  const c = raw.split(',').map((x) => x.trim());
  if (c.length < 3) return { ok: false, input: raw, msg: 'Format: Datum, Von, Bis, Titel' };
  const date = parseImportDateClient(c[0]), from = parseTimeClient(c[1]), to = parseTimeClient(c[2]);
  const title = c.slice(3).join(', ');
  const hm = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  if (!date) return { ok: false, input: raw, msg: 'Datum unklar' };
  if (!from || !to) return { ok: false, input: raw, msg: 'Uhrzeit unklar' };
  if (hm(to) <= hm(from)) return { ok: false, input: raw, msg: '„Bis“ muss nach „Von“ liegen' };
  return { ok: true, date, from, to, title };
}
function openBulkTheory() {
  modal(`<h3>📋 Theorie sammeln eintragen</h3>
    <p class="hint" style="margin-bottom:.5rem">Trag deine Theorie-Termine hier untereinander ein – <strong>eine pro Zeile</strong>: <code>Datum, Von, Bis, Titel</code>. Ich prüfe alles und zeige dir eine Vorschau, bevor etwas gespeichert wird.</p>
    <div class="bulk-help">
      <div class="bh-row"><span class="bh-k">Beispiel</span><code>6.8., 17:00, 20:00, Theorie 1</code></div>
      <div class="bh-row"><span class="bh-k">Geht auch</span><span class="muted">06.08.2026 · 17 (= 17:00) · Jahr weglassen nimmt das nächste Vorkommen</span></div>
    </div>
    <div class="row">
      <div class="field" style="max-width:200px"><label>Art</label>
        <select id="bt-type"><option value="theorie">📚 Theorie</option><option value="block">⛔ Blockiert</option><option value="frei">🌴 Frei / Urlaub</option></select></div>
      <div class="field"><label style="opacity:0">.</label><label class="inline" style="margin:0;font-weight:600"><input type="checkbox" id="bt-count" checked style="width:auto"> zählt als Arbeitszeit</label></div>
    </div>
    <div class="field"><label>Termine (eine pro Zeile)</label>
      <textarea id="bt-text" rows="7" placeholder="6.8., 17:00, 20:00, Theorie 1&#10;13.8., 17:00, 20:00, Theorie 2&#10;20.8., 18:00, 21:00, Theorie 3"></textarea></div>
    <div id="bt-preview"></div>
    <div class="actions" style="justify-content:space-between">
      <button class="sec" onclick="window.__closeModal()">Abbrechen</button>
      <div class="inline" style="gap:.5rem">
        <button class="sec" id="bt-check">Vorschau prüfen</button>
        <button id="bt-commit" disabled>Eintragen</button>
      </div>
    </div>`, 'wide');
  const preview = $('#bt-preview'), commitBtn = $('#bt-commit');
  let parsed = [];
  const check = () => {
    parsed = $('#bt-text').value.split('\n').map(parseTheoryLine).filter(Boolean);
    const ok = parsed.filter((r) => r.ok), err = parsed.filter((r) => !r.ok);
    preview.innerHTML = `<div class="bulk-summary">
        ${ok.length ? `<span class="pill" style="background:var(--good-bg);color:var(--good)">✅ ${ok.length} bereit</span>` : '<span class="pill">0 bereit</span>'}
        ${err.length ? `<span class="pill" style="background:var(--bad-bg);color:var(--bad)">⚠️ ${err.length} zu prüfen</span>` : ''}
      </div>
      <div class="bulk-list">${parsed.map((r) => r.ok
        ? `<div class="bulk-row ok"><span class="br-ic">✅</span><div><b>${WD[isoDow(r.date) - 1]} ${fmtShort(r.date)}</b> · ${r.from}–${r.to}${r.title ? ' · ' + esc(r.title) : ''}</div></div>`
        : `<div class="bulk-row error"><span class="br-ic">⚠️</span><div><span class="muted">${esc(r.input)}</span><div class="br-msg error">${esc(r.msg)}</div></div></div>`).join('')}</div>`;
    commitBtn.disabled = ok.length === 0;
    commitBtn.textContent = ok.length ? `${ok.length} eintragen` : 'Eintragen';
  };
  $('#bt-check').onclick = check;
  commitBtn.onclick = async () => {
    const ok = parsed.filter((r) => r.ok);
    if (!ok.length) { check(); return; }
    const type = $('#bt-type').value, count = $('#bt-count').checked;
    let done = 0;
    for (const r of ok) {
      try {
        await api('/api/blocks', { method: 'POST', body: {
          date: r.date, start_time: r.from, end_time: r.to,
          title: r.title || (type === 'theorie' ? 'Theorieunterricht' : type === 'frei' ? 'Frei' : 'Blockiert'),
          type, count_hours: count, repeat_weekly: 1 } });
        done++;
      } catch (e) { /* eine Zeile fehlgeschlagen – weiter */ }
    }
    closeModal();
    toast(`${done} Termin${done === 1 ? '' : 'e'} eingetragen ✓`, 'ok');
    if (state.instrTab === 'theorie') loadBlocks();
  };
}
async function tabTheorie() {
  const box = $('#itab');
  box.innerHTML = `<div class="card">
    <h2>Theorie & Ausnahmen</h2>
    <p class="hint">Blockiere Zeiten, in denen keine Fahrstunden buchbar sein sollen – z.B. Theorieunterricht (auch als <strong>Serie</strong>), Sondertermine oder Freistunden.</p>
    <div class="row">
      <div class="field"><label>Datum</label><input type="date" id="t-date" value="${state.date}"></div>
      <div class="field"><label>Von</label><input id="t-from" value="17:00"></div>
      <div class="field"><label>Bis</label><input id="t-to" value="20:00"></div>
    </div>
    <div class="row">
      <div class="field"><label>Titel</label><input id="t-title" placeholder="z.B. Theorieunterricht"></div>
      <div class="field" style="max-width:180px"><label>Art</label>
        <select id="t-type">
          <option value="theorie">📚 Theorie</option>
          <option value="block">⛔ Blockiert</option>
          <option value="frei">🌴 Frei / Urlaub</option>
        </select></div>
    </div>
    <div class="row">
      <div class="field" style="max-width:230px"><label>Wiederholen</label>
        <select id="t-repeat">
          <option value="1">Einmalig</option>
          <option value="4">Wöchentlich · 4 Wochen</option>
          <option value="6">Wöchentlich · 6 Wochen</option>
          <option value="8">Wöchentlich · 8 Wochen</option>
          <option value="12">Wöchentlich · 12 Wochen</option>
        </select></div>
      <div class="field"><label style="opacity:0">.</label>
        <label class="inline" style="margin:0;font-weight:600"><input type="checkbox" id="t-count" checked style="width:auto"> zählt als Arbeitszeit</label></div>
    </div>
    <div class="inline" style="margin:.2rem 0 1rem">
      <button id="t-add">Eintragen</button>
      <button class="sec" id="t-bulk">📋 Mehrere auf einmal</button>
      <span class="hint" style="margin:0" id="t-preview"></span>
    </div>
    <div id="t-list"></div>
  </div>`;
  $('#t-bulk').onclick = () => openBulkTheory();
  const updatePreview = () => {
    const n = Number($('#t-repeat').value);
    if (n <= 1) { $('#t-preview').textContent = ''; return; }
    const days = Array.from({ length: n }, (_, i) => fmtShort(addDays($('#t-date').value, i * 7)));
    $('#t-preview').textContent = `Legt ${n} Termine an: ${days.slice(0, 5).join(', ')}${n > 5 ? ' …' : ''}`;
  };
  $('#t-repeat').onchange = updatePreview;
  $('#t-date').oninput = updatePreview;
  $('#t-add').onclick = async () => {
    try {
      const r = await api('/api/blocks', { method: 'POST', body: {
        date: $('#t-date').value, start_time: $('#t-from').value, end_time: $('#t-to').value,
        title: $('#t-title').value, type: $('#t-type').value, count_hours: $('#t-count').checked,
        repeat_weekly: Number($('#t-repeat').value) } });
      $('#t-title').value = ''; $('#t-repeat').value = '1'; updatePreview();
      toast(`Eingetragen ✓${r.created > 1 ? ` (${r.created} Termine)` : ''}`, 'ok'); loadBlocks();
    } catch (e) { toast(e.message, 'err'); }
  };
  loadBlocks();
}
async function loadBlocks() {
  try {
    const from = todayStr(), to = addDays(from, 120);
    const ov = await api('/api/instructor/overview?from=' + from + '&to=' + to);
    const bl = ov.blocks;
    // nach Datum gruppiert, mit Icons – übersichtlicher
    $('#t-list').innerHTML = bl.length ? `<div class="inline" style="justify-content:space-between;margin-bottom:.5rem">
        <h2 style="font-size:.95rem;margin:0">Kommende Einträge</h2><span class="pill">${bl.length}</span></div>
      <div class="blist">${bl.map((b) => {
        const [ic, lb] = BLOCK_META[b.type] || ['⛔', b.type];
        return `<div class="bitem warm">
          <div><div class="when">${ic} ${WD_LONG[isoDow(b.date) - 1]}, ${fmtShort(b.date)} · ${b.start_time}–${b.end_time}</div>
          <div class="meta"><strong>${esc(b.title)}</strong> · ${lb} ${b.count_hours ? '<span class="pill">Arbeitszeit</span>' : ''}</div></div>
          <button class="ghost sm" data-delblock="${b.id}">Löschen</button></div>`;
      }).join('')}</div>` : '<p class="muted">Keine kommenden Ausnahmen.</p>';
    $('#t-list').querySelectorAll('[data-delblock]').forEach((b) => b.onclick = () => delBlock(b.dataset.delblock));
  } catch (e) { toast(e.message, 'err'); }
}

// ---- Tab: Protokoll (Ereignis-Log fuer den Chef) ----
const EV_META = {
  book: ['📅', 'Gebucht'], cancel_student: ['❌', 'Storniert (Schüler)'], cancel_instr: ['❌', 'Abgesagt (Fahrlehrer)'],
  offer: ['🔄', 'Angeboten'], take: ['✅', 'Übernommen'], shift: ['🕐', 'Verschoben'],
  delay: ['⏱️', 'Verspätung'], done: ['🚗', 'Gefahren'], noshow: ['🚫', 'Nicht erschienen'],
  vacation: ['🌴', 'Urlaub'], reminder: ['🔔', 'Erinnerung'], info: ['ℹ️', 'Info'],
  reset: ['🔑', 'Passwort vergessen'], message: ['✉️', 'Nachricht'],
};
async function tabProtokoll() {
  const box = $('#itab');
  let students = [];
  try { students = (await api('/api/students')).students; } catch {}
  state._students = students;
  box.innerHTML = `<div class="card">
    <h2>Protokoll <span class="sub">alle Vorgänge – für deine Unterlagen</span></h2>
    <div class="inline" style="margin-bottom:1rem">
      ${studentPicker('pr-student', students, { placeholder: '🔍 Alle Fahrschüler – oder Namen tippen', style: 'max-width:240px' })}
      <input type="date" id="pr-from" style="max-width:160px">
      <input type="date" id="pr-to" style="max-width:160px">
      <button class="sec sm" id="pr-go">Filtern</button>
      <button class="ghost sm" id="pr-csv" style="margin-left:auto">⬇️ Als CSV (Excel)</button>
    </div>
    <div id="pr-list"></div>
  </div>`;
  $('#pr-go').onclick = loadProtokoll;
  $('#pr-csv').onclick = exportProtokollCSV;
  await loadProtokoll();
  // als gesehen markieren + Glocke zuruecksetzen
  try { await api('/api/instructor/events/seen', { method: 'POST' }); refreshEventBadge(); } catch {}
}
async function loadProtokoll() {
  const q = new URLSearchParams();
  const sid = resolveStudentId($('#pr-student'), state._students || []);
  if (sid) q.set('student_id', sid);
  if ($('#pr-from').value) q.set('from', $('#pr-from').value);
  if ($('#pr-to').value) q.set('to', $('#pr-to').value);
  try {
    const { events } = await api('/api/instructor/events?' + q.toString());
    if (!events.length) { $('#pr-list').innerHTML = '<p class="muted">Keine Einträge.</p>'; return; }
    const counts = {}; for (const e of events) counts[e.type] = (counts[e.type] || 0) + 1;
    const order = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const stats = `<div class="pr-stats">
      <div class="pr-stat total"><b>${events.length}</b><span>Vorgänge gesamt</span></div>
      ${order.map((t) => { const [ic, lbl] = EV_META[t] || ['•', t]; return `<div class="pr-stat"><b>${counts[t]}</b><span>${ic} ${esc(lbl)}</span></div>`; }).join('')}
    </div>`;
    $('#pr-list').innerHTML = stats + `<table>
      <tr><th>Wann</th><th>Vorgang</th><th>Fahrschüler</th><th>Details</th></tr>
      ${events.map((e) => {
        const [ic, lbl] = EV_META[e.type] || ['•', e.type];
        const d = new Date(e.at).toLocaleString(LOCALE, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `<tr>
          <td class="muted" style="white-space:nowrap">${d}</td>
          <td>${ic} ${lbl}</td>
          <td>${esc(e.student_name || '–')}</td>
          <td class="muted">${esc(e.detail || '')}</td>
        </tr>`;
      }).join('')}
    </table>`;
  } catch (e) { toast(e.message, 'err'); }
}

async function exportProtokollCSV() {
  const q = new URLSearchParams();
  const sid = resolveStudentId($('#pr-student'), state._students || []);
  if (sid) q.set('student_id', sid);
  if ($('#pr-from').value) q.set('from', $('#pr-from').value);
  if ($('#pr-to').value) q.set('to', $('#pr-to').value);
  try {
    const { events } = await api('/api/instructor/events?' + q.toString());
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Datum/Zeit', 'Vorgang', 'Fahrschüler', 'Details'].map(cell).join(';')];
    for (const e of events) {
      const [, lbl] = EV_META[e.type] || ['', e.type];
      rows.push([new Date(e.at).toLocaleString(LOCALE), lbl, e.student_name || '', e.detail || ''].map(cell).join(';'));
    }
    downloadFile('protokoll.csv', '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
    toast('Protokoll als CSV heruntergeladen ✓', 'ok');
  } catch (e) { toast(e.message, 'err'); }
}

function promptRealign(mis) {
  modal(`<h3>Termine ans neue Raster anpassen?</h3>
    <div class="warnbox">Durch die geänderten Zeiten/Pause passen <strong>${mis.total} Termin(e)</strong> an ${mis.days.length} Tag(en) nicht mehr genau ins Raster.</div>
    <p class="hint">Neue Buchungen nutzen sofort das neue Raster. Bestehende Termine behalten erstmal ihre Zeit. Du kannst sie hier lückenlos ans neue Raster rücken – die betroffenen Fahrschüler werden automatisch benachrichtigt.</p>
    <div class="blist" style="max-height:180px;overflow:auto">${mis.days.map((d) => `<div class="bitem"><div class="when">${WD[isoDow(d.date) - 1]} ${fmtShort(d.date)}</div><span class="pill">${d.count} Termin(e)</span></div>`).join('')}</div>
    <div class="actions">
      <button class="sec" onclick="window.__closeModal()">Später</button>
      <button id="ra-go">Alle anpassen</button>
    </div>`);
  $('#ra-go').onclick = async () => {
    try { const r = await api('/api/instructor/realign', { method: 'POST', body: {} });
      closeModal(); toast(`${r.moved} Termin(e) an ${r.days} Tag(en) angepasst ✓`, 'ok'); refreshEventBadge(); }
    catch (e) { toast(e.message, 'err'); }
  };
}

// ---- Tab: Einstellungen ----
function tabEinstellungen() {
  const s = state.settings;
  const days = (s.workdays || '1,2,3,4,5,6').split(',').map(Number);
  const box = $('#itab');
  const sec = (icon, title, sub, body, open) => `<details class="sset"${open ? ' open' : ''}>
    <summary><span class="sset-ic">${icon}</span><span class="sset-tx"><span class="sset-tt">${title}</span><span class="sset-sub">${sub}</span></span><span class="sset-chev">▾</span></summary>
    <div class="sset-body">${body}</div></details>`;
  box.innerHTML = `<div class="card">
    <h2>Einstellungen <span class="sub">alles an einem Ort</span></h2>
    <p class="hint">Tippe einen Bereich an, um ihn zu öffnen. Änderungen unten mit „Speichern“ sichern – das gilt für alle Bereiche zusammen.</p>

    ${sec('🕒', 'Zeiten & Slots', 'Arbeitszeiten, Dauer, Pausen, Arbeitstage', `
      <div class="row"><div class="field"><label>Arbeitsbeginn (erster Slot)</label><input id="e-start" value="${s.start_time}"></div>
        <div class="field"><label>Letzter buchbarer Slot</label><input id="e-last" value="${s.last_start}"></div></div>
      <div class="row"><div class="field"><label>Dauer Fahrstunde (Min)</label><input id="e-lesson" type="number" value="${s.lesson_min}" step="5"></div>
        <div class="field"><label>Pause dazwischen (Min)</label><input id="e-break" type="number" value="${s.break_min}" step="5"></div></div>
      <div class="field"><label>Arbeitstage</label>
        <div class="daypick" id="e-days">${WD.map((d, i) => `<label class="dur-chip ${days.includes(i + 1) ? 'on' : ''}"><input type="checkbox" data-day="${i + 1}" ${days.includes(i + 1) ? 'checked' : ''}> ${d}</label>`).join('')}</div></div>
      <div class="row"><div class="field"><label>Tägliche Freigabe-Uhrzeit ${helpDot('Ab dieser Uhrzeit wird der jeweils nächste Tag zum Buchen freigeschaltet.')}</label><input id="e-release" value="${s.release_time || '10:00'}"></div>
        <div class="field"><label>Letzter Slot an kurzen Tagen ${helpDot('An „Kürzer“-Tagen ist das die späteste buchbare Startzeit.')}</label><input id="e-shortlast" value="${s.short_day_last_start || '13:35'}"></div></div>
      <div class="hint" id="e-preview" style="margin-top:.3rem"></div>`, true)}

    ${sec('🔄', 'Fließender Tagesplan', 'Lückenlos, Pause + Abholzeit, automatisch nachrücken', `
      <label class="ck-line"><input type="checkbox" id="e-flow" ${s.flow_schedule !== '0' ? 'checked' : ''}> Fließender, lückenloser Tagesplan (Startzeit der nächsten Stunde wächst mit Dauer + Pause + Abholzeit)</label>
      <label class="ck-line" style="margin-top:.4rem"><input type="checkbox" id="e-autofill" ${s.auto_fill_gaps !== '0' ? 'checked' : ''}> Fällt eine Stunde aus, folgende automatisch nach vorne rücken (Schüler werden benachrichtigt)</label>
      <div class="field" style="margin-top:.6rem"><label>Standort 1 – Name</label><input id="e-schoollabel" value="${esc(s.school_label || 'Eberswalde (Eisenbahnstr. 31)')}"></div>
      <div class="row">
        <div class="field"><label>Standort 1 – Breite (lat) ${helpDot('Hauptstandort als Startpunkt für die Abholzeit-Schätzung. Eisenbahnstr. 31, Eberswalde.')}</label><input id="e-schoollat" value="${esc(s.school_lat || '')}" placeholder="52.8300"></div>
        <div class="field"><label>Standort 1 – Länge (lng)</label><input id="e-schoollng" value="${esc(s.school_lng || '')}" placeholder="13.8160"></div></div>
      <div class="field"><label>Standort 2 – Name ${helpDot('Zweiter Standort (z. B. Finow). Die Abholzeit wird automatisch vom näheren Standort gerechnet – oder du wählst pro Schüler den Standort.')}</label><input id="e-school2label" value="${esc(s.school2_label || 'Finow')}"></div>
      <div class="row">
        <div class="field"><label>Standort 2 – Breite (lat)</label><input id="e-school2lat" value="${esc(s.school2_lat || '')}" placeholder="52.8360"></div>
        <div class="field"><label>Standort 2 – Länge (lng)</label><input id="e-school2lng" value="${esc(s.school2_lng || '')}" placeholder="13.6990"></div></div>
      <div class="field"><label>Standard-Abholzeit (Min) ${helpDot('Wird genutzt, wenn beim Schüler keine eigene Abholzeit und kein Wohnort hinterlegt ist.')}</label><input id="e-travdef" type="number" value="${s.travel_default_min || '0'}" min="0" step="5"></div>
      <div class="hint" style="margin:.3rem 0 0">Abholzeit pro Schüler: Fahrschüler → bearbeiten → 🚗 Abholzeit (feste Minuten) und „Standort für Schätzung". Ohne feste Minuten wird aus dem Wohnort geschätzt – vom gewählten oder näheren der beiden Standorte.</div>`)}

    ${sec('📅', 'Buchung & Stornierung', 'Vorausbuchung, Limits, Fristen, Aufklärungstext', `
      <div class="row"><div class="field"><label>Max. Fahrstunden pro Schüler & Woche</label><input id="e-max" type="number" value="${s.max_per_week}" min="1"></div>
        <div class="field"><label>Selbst-Buchung pro Tag ${helpDot('So viele Fahrstunden darf sich ein Fahrschüler pro Tag selbst buchen. 0 = ohne Limit. Deine eigenen Einträge sind nicht betroffen.')}</label><input id="e-maxday" type="number" value="${s.student_max_per_day}" min="0"></div>
        <div class="field"><label>Vorausbuchung (Tage)</label><input id="e-horizon" type="number" value="${s.booking_horizon_days}" min="1"></div></div>
      <div class="field"><label>Vorschlag verfällt nach (Min ohne Antwort) ${helpDot('Schlägst du einem Fahrschüler einen Termin vor, verfällt er nach so vielen Minuten ohne Annehmen/Ablehnen – der Slot wird wieder frei und du bekommst eine Nachricht. Standard 120 (2 Std.). 0 = verfällt nie. Immer gedeckelt durch den Termin selbst.')}</label><input id="e-resv" type="number" value="${s.reserve_expire_min}" min="0" step="15"></div>
      <div class="row"><div class="field"><label>Kostenlos stornieren bis (Std. vorher) ${helpDot('Bis so viele Stunden vor Beginn darf der Fahrschüler kostenlos absagen.')}</label><input id="e-cancel" type="number" value="${s.cancel_hours}" min="0"></div>
        <div class="field"><label>Sperrfrist – fest ab (Std. vorher) ${helpDot('Ab so vielen Stunden vor Beginn steht der Termin fest – kein Absagen oder Ins-Angebot-Geben mehr.')}</label><input id="e-lock" type="number" value="${s.lock_hours}" min="0"></div></div>
      <div class="field"><label>Toleranz Verspätung (Min) ${helpDot('So viele Minuten Verspätung gelten noch nicht als „nicht erschienen“.')}</label><input id="e-grace" type="number" value="${s.late_grace_min}" step="5"></div>
      <div class="field"><label>Aufklärungstext (wird beim Buchen gezeigt)</label><textarea id="e-policy" rows="4" style="resize:vertical">${esc(s.policy_text || '')}</textarea></div>`)}

    ${sec('🎯', 'Ziele (Tacho)', 'Wochen-, Tages- und Monatsziel', `
      <div class="row"><div class="field"><label>Wochenziel (Stunden)</label><input id="e-wt" type="number" value="${s.weekly_target_h}" step="0.5"></div>
        <div class="field"><label>Untere Zielspanne (Stunden)</label><input id="e-wlo" type="number" value="${s.weekly_lo_h}" step="0.5"></div></div>
      <div class="field"><label>Tagesziel (Stunden)</label><input id="e-dt" type="number" value="${s.daily_target_h}" step="0.5"></div>
      <div class="row"><div class="field"><label>Monatsziel (Std, mind. 80)</label><input id="e-mt" type="number" value="${s.monthly_target_h}" min="80" step="1"></div>
        <div class="field"><label>Monat Skala-Ende (höchstens)</label><input id="e-mmax" type="number" value="${s.monthly_max_h}" min="80" step="1"></div></div>`)}

    ${sec('📄', 'Vertrag', 'Dein Stunden-Vertrag (Minimum & Auszahlung)', `
      <div class="row"><div class="field"><label>Minimum (Std/Monat) ${helpDot('Dein vertragliches Monats-Minimum. Bis hierhin musst du kommen.')}</label><input id="e-cmin" type="number" value="${s.contract_min_h}" min="0" step="1"></div>
        <div class="field"><label>Immer ausgezahlt (Std) ${helpDot('Bis zu so vielen Stunden bekommst du immer bezahlt – egal wie der Monat läuft. Alles darüber ist extra.')}</label><input id="e-cpaid" type="number" value="${s.contract_paid_h}" min="0" step="1"></div></div>
      <div class="hint" style="margin:.3rem 0 0">Diese zwei Marken erscheinen auf der Vertrags-Karte unter „Heute“. Den konkreten Monatswert (z. B. 155 h) stellst du oben als <strong>Monatsziel</strong> ein.</div>`)}

    ${sec('🏆', 'Sonderfahrten & Rang', 'Soll-Fahrten, Rang-Aufstieg, anonymer Tausch', `
      <div class="row"><div class="field"><label>Soll Überland</label><input id="e-req-u" type="number" value="${s.req_ueberland}" min="0"></div>
        <div class="field"><label>Soll Autobahn</label><input id="e-req-a" type="number" value="${s.req_autobahn}" min="0"></div>
        <div class="field"><label>Soll Nachtfahrt</label><input id="e-req-n" type="number" value="${s.req_nacht}" min="0"></div></div>
      <div class="row"><div class="field"><label>Rang 2 ab (gefahrene Stunden) ${helpDot('Ab so vielen gefahrenen Stunden steigt ein Fahrschüler in Rang 2 auf und darf weiter im Voraus buchen.')}</label><input id="e-rank2" type="number" value="${s.rank2_min_lessons}" min="1"></div>
        <div class="field"><label>Rang 2: Vorausbuchung (Tage) ${helpDot('So viele Tage im Voraus darf ein Rang-2-Fahrschüler buchen.')}</label><input id="e-horizon2" type="number" value="${s.booking_horizon_days_rank2}" min="1"></div></div>
      <label class="ck-line"><input type="checkbox" id="e-anon" ${s.anonymous_swaps === '1' ? 'checked' : ''}> Tausch anonym (Schüler sehen nicht, von wem ein Termin kommt)</label>`)}

    ${sec('🌴', 'Urlaub', 'Urlaubskonto & Gutschrift', `
      <div class="row"><div class="field"><label>Urlaubstag zählt (Min) ${helpDot('So viele Minuten werden pro Urlaubstag deinem Arbeitszeit-/Stundenkonto gutgeschrieben.')}</label><input id="e-vaccredit" type="number" value="${s.vacation_credit_min}" step="10"></div>
        <div class="field"><label>Resturlaub (Tage)</label><input id="e-vacdays" type="number" value="${s.vacation_days_left}" step="1"></div></div>`)}

    ${sec('🛰️', 'Live-Standort & Treffpunkt', 'Abholung, ETA-Tempo, Standard-Treffpunkt', `
      <div class="row"><div class="field"><label>Standort teilen ab (Min vorher) ${helpDot('So viele Minuten vor Beginn kann der Live-Standort mit dem Fahrschüler geteilt werden.')}</label><input id="e-lead" type="number" value="${s.live_lead_min}" min="1"></div>
        <div class="field"><label>Ø Tempo für ETA (km/h) ${helpDot('Durchschnittstempo zur groben Schätzung der Ankunftszeit auf der Live-Karte.')}</label><input id="e-speed" type="number" value="${s.avg_speed_kmh}" min="5"></div></div>
      <div class="field"><label>Standard-Treffpunkt (nur Rückfall)</label>
        <div class="inline"><input id="e-meet" value="${esc(s.meet_default_label || '')}" placeholder="z.B. Fahrschule / Bahnhof" style="flex:1">
          <button class="sec sm" id="e-meet-here" type="button">📍 Standort</button></div>
        <div class="hint" id="e-meet-info" style="margin:.3rem 0 0">${s.meet_default_lat ? '✓ Koordinaten hinterlegt' : 'Ohne Koordinaten nur als Text.'}</div>
        <div class="hint" style="margin:.3rem 0 0">Wird nur genutzt, wenn weder beim Schüler noch beim Termin ein Treffpunkt gesetzt ist.</div></div>`)}

    ${sec('🌦️', 'Wetter & Verkehr', 'Automatische Vorwarnung bei Glatteis/Schnee', `
      <label class="ck-line"><input type="checkbox" id="e-weather" ${s.weather_enabled !== '0' ? 'checked' : ''}> Wetter-Hinweise anzeigen (Deutscher Wetterdienst – kostenlos, kein Schlüssel nötig)</label>
      <label class="ck-line" style="margin-top:.4rem"><input type="checkbox" id="e-weather-auto" ${s.weather_autostatus === '1' ? 'checked' : ''}> Bei Glatteis/Schnee die heutigen Fahrschüler <strong>automatisch</strong> vorwarnen</label>
      <div class="hint" style="margin:.4rem 0 0">Ist der zweite Haken gesetzt, meldet ginoco von selbst eine kleine Verzögerung und schickt deinen Fahrschülern mit einem Termin heute eine Push – ohne dass du etwas tun musst. Deine eigene Ansage hat immer Vorrang.</div>
      <div class="field" style="margin-top:.7rem"><label>🚧 Verkehrs-Schlüssel (TomTom, kostenlos) ${helpDot('Optional. Mit einem kostenlosen TomTom-Schlüssel warnt ginoco bei echtem Stau auf deinen Wegen. Leer = Verkehrs-Hinweis aus.')}</label><input id="e-traffic" value="${esc(s.traffic_key || '')}" placeholder="hier deinen TomTom-Schlüssel einfügen" autocomplete="off"></div>
      <div class="hint" style="margin:.3rem 0 0">Schlüssel gratis auf <strong>developer.tomtom.com</strong> holen (2 500 Anfragen/Tag frei). Ohne Schlüssel bleibt der Verkehrs-Hinweis einfach aus – nichts geht kaputt.</div>`)}

    ${sec('📧', 'E-Mail-Versand (SMTP)', 'Eigene Domain-Mailbox für Support & Passwort-Mails', `
      <label class="ck-line"><input type="checkbox" id="e-mail-on" ${s.mail_enabled === '1' ? 'checked' : ''}> E-Mail-Versand aktiv</label>
      <div class="hint" style="margin:.4rem 0 .6rem">Trage die Zugangsdaten deines Postfachs (z.&nbsp;B. <strong>gino@ginoco.de</strong>) ein. Erst mit „Test-Mail“ prüfen, dann Haken setzen. Ohne Aktivierung geht nichts raus.</div>
      <div class="row"><div class="field"><label>SMTP-Server (Host)</label><input id="e-smtp-host" value="${esc(s.smtp_host || '')}" placeholder="z.B. smtp.ionos.de" autocomplete="off"></div>
        <div class="field"><label>Port</label><input id="e-smtp-port" type="number" value="${esc(s.smtp_port || '465')}" placeholder="465"></div></div>
      <label class="ck-line" style="margin:.2rem 0 .5rem"><input type="checkbox" id="e-smtp-secure" ${s.smtp_secure !== '0' ? 'checked' : ''}> Verschlüsselt per SSL/TLS (Port 465). Aus = STARTTLS (Port 587)</label>
      <div class="field"><label>Benutzername (meist die volle Mailadresse)</label><input id="e-smtp-user" value="${esc(s.smtp_user || '')}" placeholder="gino@ginoco.de" autocomplete="off"></div>
      <div class="field"><label>Postfach-Passwort ${s.smtp_pass_set ? '<span class="muted">(gespeichert – leer lassen = unverändert)</span>' : ''}</label><input id="e-smtp-pass" type="password" autocomplete="new-password" placeholder="${s.smtp_pass_set ? '••••••••' : 'Passwort deines Postfachs'}"></div>
      <div class="row"><div class="field"><label>Absender-Adresse</label><input id="e-mail-from" value="${esc(s.mail_from || '')}" placeholder="gino@ginoco.de" autocomplete="off"></div>
        <div class="field"><label>Absender-Name</label><input id="e-mail-fromname" value="${esc(s.mail_from_name || '')}" placeholder="Fahrschule Untern Buchen"></div></div>
      <div class="field"><label>Support-Adresse (wohin Support-Anfragen gehen) ${helpDot('Leer = an deine Absender-Adresse. Hier landen Nachrichten aus dem Support-Formular.')}</label><input id="e-mail-support" value="${esc(s.support_to || '')}" placeholder="leer = Absender-Adresse"></div>
      <div class="inline" style="gap:.5rem;margin-top:.6rem;flex-wrap:wrap">
        <input id="e-mail-testto" value="${esc(s.support_to || s.mail_from || '')}" placeholder="Test-Mail an …" style="flex:1;min-width:180px">
        <button class="sec sm" id="e-mail-test" type="button">✉️ Test-Mail senden</button></div>
      <div class="hint" id="e-mail-testinfo" style="margin:.4rem 0 0">Tipp: zuerst <strong>oben speichern</strong>, dann testen – der Test nutzt die gespeicherten Daten.</div>`, s.mail_enabled === '1')}

    ${sec('🔒', 'Privatmodus & Registrierung', 'Wer darf sich neu anmelden?', `
      <label class="ck-line"><input type="checkbox" id="e-reg-open" ${s.registration_open === '1' ? 'checked' : ''}> Neue Fahrschüler dürfen sich mit Code registrieren</label>
      <div class="hint" style="margin:.4rem 0 0">Ist der Haken <strong>weg</strong>, läuft Ginoco im <strong>Privatmodus</strong>: Auf der Startseite gibt es keinen „Neu (mit Code)“-Reiter mehr und niemand Neues kann sich anmelden. Deine bestehenden Zugänge (und du selbst) funktionieren weiter. Du kannst das jederzeit wieder öffnen, wenn du Fahrschüler einladen willst.</div>`, s.registration_open !== '1')}

    ${sec('👤', 'Zugang & Kontakt', 'Name, Handynummer, Passwort', `
      <div class="field"><label>Angezeigter Name</label><input id="e-name" value="${esc(s.instructor_name)}"></div>
      <div class="field"><label>Deine Handynummer (Schüler können anrufen/schreiben)</label><input id="e-phone" value="${esc(s.instructor_phone || '')}" placeholder="z.B. 0151 23456789"></div>
      <div class="field"><label>Neues Fahrlehrer-Passwort (leer = unverändert)</label><input id="e-pin" type="password" autocomplete="new-password" placeholder="mind. 8 Zeichen, mit Zahl & Sonderzeichen"></div>
      <div class="sec-auth" id="e-auth"><div class="sec-auth-h">🔐 Authenticator (2-Faktor & „Passwort vergessen")</div>
        <div id="e-auth-body"><span class="hint">Lädt…</span></div></div>`)}

    <div class="actions" style="justify-content:flex-start"><button id="e-save">💾 Alles speichern</button><span id="e-msg" class="muted"></span></div>
  </div>`;
  const updatePreview = () => {
    const start = $('#e-start').value, last = $('#e-last').value;
    const lesson = Number($('#e-lesson').value), br = Number($('#e-break').value);
    const step = lesson + br;
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const times = [];
    for (let t = toMin(start); t <= toMin(last); t += step) times.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    const daily = (times.length * lesson) / 60;
    $('#e-preview').innerHTML = `Ergibt <strong>${times.length} Slots/Tag</strong> (je ${lesson} Min + ${br} Min Pause) um ${times.join(', ') || '–'} (${daily.toFixed(1)} h/Tag).`;
  };
  ['e-start', 'e-last', 'e-lesson', 'e-break'].forEach((id) => $('#' + id).oninput = updatePreview);
  updatePreview();
  renderAuthSection();
  // Arbeitstage-Chips optisch mitschalten
  box.querySelectorAll('#e-days [data-day]').forEach((cb) => cb.onchange = () =>
    cb.closest('.dur-chip')?.classList.toggle('on', cb.checked));
  let meetLat = s.meet_default_lat || '', meetLng = s.meet_default_lng || '';
  $('#e-meet-here').onclick = async () => {
    try { const c = await getPosOnce(); meetLat = c.latitude; meetLng = c.longitude;
      $('#e-meet-info').innerHTML = `✓ Koordinaten übernommen (${meetLat.toFixed(4)}, ${meetLng.toFixed(4)})`; toast('Treffpunkt gesetzt', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
  };
  // Test-Mail: nutzt die GESPEICHERTEN Zugangsdaten (daher Hinweis: vorher speichern).
  const mailTestBtn = $('#e-mail-test');
  if (mailTestBtn) mailTestBtn.onclick = async () => {
    const info = $('#e-mail-testinfo');
    mailTestBtn.disabled = true; if (info) info.innerHTML = '✉️ Sende Test-Mail …';
    try {
      const r = await api('/api/instructor/mail-test', { method: 'POST', body: { to: $('#e-mail-testto').value.trim() } });
      if (info) info.innerHTML = `✅ Test-Mail an <strong>${esc(r.to)}</strong> verschickt. Schau ins Postfach (auch Spam).`;
      toast('Test-Mail verschickt ✓', 'ok');
    } catch (e) {
      if (info) info.innerHTML = `❌ ${esc(e.message)}`;
      toast(e.message, 'err');
    } finally { mailTestBtn.disabled = false; }
  };
  $('#e-save').onclick = async () => {
    const workdays = [...box.querySelectorAll('[data-day]')].filter((c) => c.checked).map((c) => c.dataset.day).join(',');
    try {
      const r = await api('/api/instructor/settings', { method: 'PUT', body: {
        start_time: $('#e-start').value, last_start: $('#e-last').value,
        lesson_min: Number($('#e-lesson').value), break_min: Number($('#e-break').value),
        weekly_target_h: Number($('#e-wt').value), weekly_lo_h: Number($('#e-wlo').value),
        daily_target_h: Number($('#e-dt').value),
        monthly_target_h: Number($('#e-mt').value), monthly_max_h: Number($('#e-mmax').value),
        contract_min_h: Number($('#e-cmin').value), contract_paid_h: Number($('#e-cpaid').value),
        workdays: workdays || '1,2,3,4,5',
        max_per_week: Number($('#e-max').value), student_max_per_day: Number($('#e-maxday').value), instructor_name: $('#e-name').value,
        reserve_expire_min: Number($('#e-resv').value),
        booking_horizon_days: Number($('#e-horizon').value), cancel_hours: Number($('#e-cancel').value),
        lock_hours: Number($('#e-lock').value),
        release_time: $('#e-release').value, short_day_last_start: $('#e-shortlast').value,
        vacation_credit_min: Number($('#e-vaccredit').value), vacation_days_left: Number($('#e-vacdays').value),
        late_grace_min: Number($('#e-grace').value), policy_text: $('#e-policy').value,
        instructor_phone: $('#e-phone').value, live_lead_min: Number($('#e-lead').value),
        avg_speed_kmh: Number($('#e-speed').value), meet_default_label: $('#e-meet').value,
        meet_default_lat: meetLat === '' ? '' : String(meetLat), meet_default_lng: meetLng === '' ? '' : String(meetLng),
        anonymous_swaps: $('#e-anon').checked ? '1' : '0',
        req_ueberland: Number($('#e-req-u').value), req_autobahn: Number($('#e-req-a').value), req_nacht: Number($('#e-req-n').value),
        rank2_min_lessons: Number($('#e-rank2').value), booking_horizon_days_rank2: Number($('#e-horizon2').value),
        registration_open: $('#e-reg-open').checked ? '1' : '0',
        weather_enabled: $('#e-weather').checked ? '1' : '0',
        weather_autostatus: $('#e-weather-auto').checked ? '1' : '0',
        traffic_key: $('#e-traffic').value.trim(),
        flow_schedule: $('#e-flow').checked ? '1' : '0',
        auto_fill_gaps: $('#e-autofill').checked ? '1' : '0',
        school_label: $('#e-schoollabel').value.trim(),
        school_lat: $('#e-schoollat').value.trim(), school_lng: $('#e-schoollng').value.trim(),
        school2_label: $('#e-school2label').value.trim(),
        school2_lat: $('#e-school2lat').value.trim(), school2_lng: $('#e-school2lng').value.trim(),
        travel_default_min: Number($('#e-travdef').value) || 0,
        mail_enabled: $('#e-mail-on').checked ? '1' : '0',
        smtp_host: $('#e-smtp-host').value.trim(), smtp_port: $('#e-smtp-port').value.trim() || '465',
        smtp_secure: $('#e-smtp-secure').checked ? '1' : '0', smtp_user: $('#e-smtp-user').value.trim(),
        smtp_pass: $('#e-smtp-pass').value || '',
        mail_from: $('#e-mail-from').value.trim(), mail_from_name: $('#e-mail-fromname').value.trim(),
        support_to: $('#e-mail-support').value.trim(),
        new_pin: $('#e-pin').value || undefined } });
      state.settings = r.settings; state.user.name = r.settings.instructor_name;
      toast('Einstellungen gespeichert ✓', 'ok'); $('#e-msg').textContent = 'Gespeichert.';
      if (r.misaligned && r.misaligned.total > 0) promptRealign(r.misaligned);
    } catch (e) { toast(e.message, 'err'); }
  };
}

// Für Kalender-Modal: instrBookings global halten
window.__instrBookings = [];
const _origRenderInstrDay = renderInstrDay;

// ====================== PWA: "App installieren"-Angebot ======================
(function () {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (standalone) return; // laeuft schon als installierte App
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let deferred = null;

  function ensureBtn() {
    let b = document.getElementById('pwa-install');
    if (!b) {
      b = document.createElement('button');
      b.id = 'pwa-install';
      b.className = 'pwa-install';
      b.innerHTML = '📲 App installieren';
      b.onclick = onClick;
      document.body.appendChild(b);
    }
    return b;
  }
  function hide() { const b = document.getElementById('pwa-install'); if (b) b.remove(); }

  async function onClick() {
    if (deferred) {
      deferred.prompt();
      const res = await deferred.userChoice.catch(() => ({}));
      deferred = null;
      if (res && res.outcome === 'accepted') hide();
    } else if (isIOS && typeof modal === 'function') {
      modal(`<h3>ginoco als App installieren</h3>
        <p class="hint">So legst du ginoco wie eine echte App auf deinen Startbildschirm:</p>
        <ol class="hint" style="padding-left:1.1rem;line-height:1.6">
          <li>Tippe unten in Safari auf das <strong>Teilen-Symbol</strong> (Viereck mit Pfeil nach oben).</li>
          <li>Wähle <strong>„Zum Home-Bildschirm"</strong>.</li>
          <li>Auf <strong>„Hinzufügen"</strong> tippen – fertig. 🚗</li>
        </ol>
        <div class="actions"><button onclick="window.__closeModal()">Alles klar</button></div>`);
    }
  }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; ensureBtn(); });
  window.addEventListener('appinstalled', hide);
  // iOS liefert kein beforeinstallprompt -> Button trotzdem anbieten (fuehrt zur Anleitung)
  if (isIOS) window.addEventListener('load', ensureBtn);
})();
