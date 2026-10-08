import { useEffect, useMemo, useState } from "react";
import {
  Sparkles, Wallet, AlertTriangle, CalendarClock, Percent, MessageCircle, Copy, Check, ChevronRight,
  Bell, BellOff, Smartphone, Share, PlusSquare, FileDown, Play, ClipboardCheck, Phone, DoorOpen, TrendingUp, Download, Mail, X, Send,
} from "lucide-react";
import { api } from "./api";
import { styles } from "./theme.jsx";
import { isIos, isStandalone, pushSupported, currentSubscription, enablePush, disablePush } from "./pushClient";

function fmt(n) {
  return new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 0 }).format(n || 0) + " DH";
}
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function monthShort(period) {
  const [y, m] = period.split("-");
  return `${MOIS_COURTS[Number(m) - 1]} ${y.slice(2)}`;
}
function frDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

const s = {
  hero: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 24 },
  heroSub: { fontSize: 14, color: "var(--text-dim)", marginTop: 6 },
  agentHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" },
  agentTitle: { display: "flex", alignItems: "center", gap: 10 },
  agentIcon: { width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  agentName: { fontSize: 14.5, fontWeight: 600, letterSpacing: "-0.01em" },
  agentDesc: { fontSize: 12.5, color: "var(--text-dim)", marginTop: 1 },
  row: { display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderTop: "1px solid var(--border)", flexWrap: "wrap" },
  rowMain: { flex: "1 1 240px", minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rowMeta: { fontSize: 12, color: "var(--text-dim)", marginTop: 3, lineHeight: 1.45 },
  amount: { fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" },
  rowSide: { display: "flex", alignItems: "center", gap: 14, marginLeft: "auto" },
  actions: { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" },
  smallBtn: { display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5, fontWeight: 500, fontFamily: "var(--font-body)", cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap" },
  hint: { fontSize: 12, color: "var(--text-dim)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", marginBottom: 12, lineHeight: 1.5 },
  step: { display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, padding: "7px 0" },
  stepNum: { width: 22, height: 22, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent)", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  toggleRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "9px 0", borderTop: "1px solid var(--border)", fontSize: 13.5 },
};

function Toggle({ on, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{ width: 38, height: 22, borderRadius: 999, border: "none", padding: 2, background: on ? "var(--good)" : "var(--surface-3)", cursor: "pointer", flexShrink: 0, transition: "background .15s" }}>
      <span style={{ display: "block", width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.25)", transform: on ? "translateX(16px)" : "none", transition: "transform .15s" }} />
    </button>
  );
}

function AgentCard({ icon: Icon, tone = "warn", name, desc, right, children }) {
  const t = styles.badge(tone);
  return (
    <section style={{ ...styles.card, marginBottom: 16 }}>
      <div style={s.agentHead}>
        <div style={s.agentTitle}>
          <div style={{ ...s.agentIcon, background: t.background, color: t.color }}><Icon size={16} strokeWidth={2} /></div>
          <div>
            <div style={s.agentName}>{name}</div>
            <div style={s.agentDesc}>{desc}</div>
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

const COLLECTION_PREVIEW = 8;

export default function AssistantPage({ currentUser, onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tierFilter, setTierFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);

  async function load() {
    try {
      setData(await api.assistantInsights());
    } catch (err) {
      setError(err.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function runNow() {
    setRunning(true);
    setRunResult(null);
    try {
      const r = await api.assistantRunNow();
      setRunResult(r.push?.sent ? `Briefing envoyé sur ${r.push.sent} appareil(s).` : "Agents passés. Aucun appareil abonné aux notifications pour l'instant.");
      load();
    } catch (err) {
      setRunResult(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch { /* presse-papiers indisponible */ }
  }

  const ins = data?.insights;
  const collections = useMemo(() => {
    if (!ins) return [];
    return tierFilter === "all" ? ins.collections : ins.collections.filter((c) => String(c.tier.level) === tierFilter);
  }, [ins, tierFilter]);

  if (error) return <div className="page" style={styles.page}><div style={styles.formError}>{error}</div></div>;
  if (!ins) return <div className="page" style={styles.page}><div style={styles.loadingText}><span className="spinner" /> L'assistant analyse le portefeuille…</div></div>;

  const firstName = (currentUser.name || "").split(" ")[0];
  const hour = new Date().getHours();
  const hello = hour < 18 ? "Bonjour" : "Bonsoir";
  const tierCounts = ins.collections.reduce((acc, c) => { acc[c.tier.level] = (acc[c.tier.level] || 0) + 1; return acc; }, {});
  const visible = showAll ? collections : collections.slice(0, COLLECTION_PREVIEW);
  const dq = ins.dataQuality;
  const urgentLeases = ins.leaseEnds.filter((l) => l.days <= 30).length;

  return (
    <div className="page" style={styles.page}>
      <header style={s.hero}>
        <div>
          <div style={styles.eyebrow}>Assistant</div>
          <h1 style={styles.h1}>{hello} {firstName}</h1>
          <div style={s.heroSub}>Voici le point sur ton portefeuille, {frDate(ins.generatedAt)}.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href="/api/assistant/report.pdf" target="_blank" rel="noreferrer" style={{ ...styles.secondaryBtn, textDecoration: "none" }}>
            <FileDown size={15} /> Rapport PDF du jour
          </a>
          <button type="button" style={styles.primaryBtn} onClick={runNow} disabled={running}>
            {running ? <span className="spinner" /> : <Play size={15} />} Lancer les agents
          </button>
        </div>
      </header>
      {runResult && <div style={{ ...s.hint, marginTop: -8 }}>{runResult}</div>}

      <div className="kpi-grid" style={styles.kpiGrid}>
        <Kpi icon={Wallet} tone="good" label={`Encaissé · ${ins.periodLabel}`} value={fmt(ins.month.collected)} sub={`${ins.month.rate} % de ${fmt(ins.month.expected)}`} progress={ins.month.rate} />
        <Kpi icon={TrendingUp} tone="warn" label="Reste à encaisser ce mois" value={fmt(ins.month.remaining)} sub={`${ins.month.occupiedCount - ins.month.paidCount} loyer(s) sur ${ins.month.occupiedCount}`} />
        <Kpi icon={AlertTriangle} tone={ins.collections.length ? "bad" : "good"} label="Locataires en retard" value={String(ins.collections.length)} sub={`${fmt(ins.arrearsTotal)} d'arriérés`} />
        <Kpi icon={CalendarClock} tone="warn" label="Échéances à venir" value={String(ins.leaseEnds.length + ins.revisions.length)} sub={`${urgentLeases} fin(s) de bail sous 30 j · ${ins.revisions.filter((r) => r.eligible).length} révision(s)`} />
      </div>

      <AgentCard
        icon={Wallet} tone="bad" name="Agent Recouvrement"
        desc={`Suit les loyers impayés (le mois en cours compte à partir du ${ins.graceDay} du mois) et propose la relance adaptée.`}
        right={ins.collections.length > 0 && (
          <div style={{ ...styles.tierSelector, margin: 0 }}>
            {[["all", "Tous", ins.collections.length], ["3", "Mise en demeure", tierCounts[3] || 0], ["2", "Avertissement", tierCounts[2] || 0], ["1", "1er rappel", tierCounts[1] || 0]]
              .filter(([id, , n]) => id === "all" || n > 0)
              .map(([id, label, n]) => (
                <button key={id} type="button" onClick={() => { setTierFilter(id); setShowAll(false); }} style={{ ...styles.tierBtn, flex: "none", padding: "5px 10px", ...(tierFilter === id ? styles.tierBtnActive : {}) }}>
                  {label} <span style={{ color: "var(--text-faint)", marginLeft: 3 }}>{n}</span>
                </button>
              ))}
          </div>
        )}
      >
        {ins.collections.length === 0 ? (
          <div style={styles.emptyNote}>Personne n'est en retard. Tous les loyers dus sont encaissés.</div>
        ) : (
          <>
            {visible.map((c) => {
              const key = `${c.tenant}|${c.propertyId}`;
              const unitNames = c.units.map((u) => u.name);
              return (
                <div key={key} style={s.row}>
                  <div style={s.rowMain}>
                    <div style={s.rowTitle}>
                      {c.tenant}
                      <span style={styles.badge(c.tier.tone)}>{c.tier.label}</span>
                    </div>
                    <div style={s.rowMeta}>
                      {c.propertyName} · {unitNames.length > 3 ? `${unitNames.slice(0, 3).join(", ")} +${unitNames.length - 3}` : unitNames.join(", ")}
                      {" · "}{c.monthsLate} mois ({c.units[0].months.slice().reverse().map(monthShort).join(", ")})
                      {c.unknownHistory && <span title="Sans date de début de bail ni paiement enregistré, seul le dernier mois dû est compté."> · historique inconnu</span>}
                    </div>
                  </div>
                  <div className="as-side" style={s.rowSide}>
                  <div style={s.amount}>{fmt(c.amount)}</div>
                  <div style={s.actions}>
                    {c.whatsapp ? (
                      <a href={c.whatsapp} target="_blank" rel="noreferrer" style={s.smallBtn}><MessageCircle size={14} /> WhatsApp</a>
                    ) : (
                      <button type="button" style={s.smallBtn} onClick={() => copy(c.message, key)} title={c.message}>
                        {copied === key ? <Check size={14} color="var(--good)" /> : <Copy size={14} />} {copied === key ? "Copié" : "Message"}
                      </button>
                    )}
                    <button type="button" style={s.smallBtn} onClick={() => onNavigate("loyers", { tab: "encaisser", query: c.tenant })}>
                      Encaisser <ChevronRight size={14} />
                    </button>
                  </div>
                  </div>
                </div>
              );
            })}
            {collections.length > COLLECTION_PREVIEW && (
              <button type="button" style={{ ...styles.secondaryBtn, marginTop: 10 }} onClick={() => setShowAll(!showAll)}>
                {showAll ? "Réduire" : `Voir les ${collections.length} locataires`}
              </button>
            )}
          </>
        )}
      </AgentCard>

      <div className="two-col" style={styles.twoCol}>
        <AgentCard icon={CalendarClock} tone="warn" name="Agent Baux & révisions" desc="Fins de bail sous 90 jours et révisions triennales (lois 49-16 et 67-12).">
          {ins.leaseEnds.length === 0 && ins.revisions.length === 0 ? (
            <div style={styles.emptyNote}>
              Rien à signaler.{dq.noLeaseStartCount > 0 && ` Attention : ${dq.noLeaseStartCount} local(aux) n'ont pas de dates de bail, l'agent ne peut donc pas les surveiller.`}
            </div>
          ) : (
            <>
              {ins.leaseEnds.map((l) => (
                <div key={`e${l.id}`} style={s.row}>
                  <div style={s.rowMain}>
                    <div style={s.rowTitle}>{l.tenant} <span style={styles.badge(l.days < 0 ? "bad" : "warn")}>{l.days < 0 ? `Expiré depuis ${-l.days} j` : `Fin dans ${l.days} j`}</span></div>
                    <div style={s.rowMeta}>{l.propertyName} · {l.unit} · échéance {new Date(l.leaseEnd).toLocaleDateString("fr-FR")}</div>
                  </div>
                </div>
              ))}
              {ins.revisions.map((r) => (
                <div key={`r${r.id}`} style={s.row}>
                  <div style={s.rowMain}>
                    <div style={s.rowTitle}>{r.tenant} <span style={styles.badge("good")}>{r.eligible ? "Révision possible" : `Révision dans ${r.days} j`}</span></div>
                    <div style={s.rowMeta}>{r.propertyName} · {r.unit} · {fmt(r.rent)} → jusqu'à {fmt(r.newRentMax)} (+{r.capPct} %)</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </AgentCard>

        <AgentCard icon={ClipboardCheck} tone="neutral" name="Agent Qualité des données" desc="Ce qui manque pour que les autres agents soient fiables.">
          <DqRow icon={Percent} done={dq.missingCa.length === 0}
            label={dq.missingCa.length ? `CA à saisir : ${dq.missingCa.map((m) => m.tenant).join(", ")}` : "CA des loyers variables à jour"}
            meta={dq.missingCa.length ? `Chiffre d'affaires du mois précédent manquant : le loyer dû est calculé au minimum garanti.` : null} />
          <DqRow icon={CalendarClock} done={dq.noLeaseStartCount === 0}
            label={dq.noLeaseStartCount ? `${dq.noLeaseStartCount} local(aux) sans date de début de bail` : "Dates de bail renseignées"}
            meta={dq.noLeaseStartCount ? Object.entries(dq.noLeaseStartByProperty).map(([p, n]) => `${p} : ${n}`).join(" · ") + ". Sans elles : pas d'alerte de fin de bail ni de révision, et retards incomplets." : null} />
          <DqRow icon={Phone} done={dq.noPhoneCount === 0}
            label={dq.noPhoneCount ? `${dq.noPhoneCount} locataire(s) sans téléphone` : "Téléphones renseignés"}
            meta={dq.noPhoneCount ? "Ajoute-les dans la fiche du local pour envoyer les relances WhatsApp en un clic." : null} />
          <DqRow icon={DoorOpen} done={dq.vacant.length === 0}
            label={dq.vacant.length ? `${dq.vacant.length} local(aux) vacant(s)` : "Aucun local vacant"}
            meta={dq.vacant.length ? dq.vacant.slice(0, 6).map((v) => `${v.unit} (${v.propertyName})`).join(", ") : null} />
        </AgentCard>
      </div>

      <div className="two-col" style={styles.twoCol}>
        <PhoneCard />
        <ReportsCard />
      </div>
      <EmailCard />

      <div style={{ ...styles.emptyNote, textAlign: "center", marginTop: 8 }}>
        {data.lastRun
          ? `Dernier passage automatique des agents : ${new Date(data.lastRun.created_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })}. Le briefing part chaque matin à 8 h.`
          : "Les agents passent automatiquement chaque matin à 8 h et t'envoient le briefing sur ton téléphone."}
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, tone, label, value, sub, progress }) {
  const t = styles.badge(tone);
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiHead}>
        <div style={{ ...styles.kpiLabel, marginBottom: 0 }}>{label}</div>
        <div style={{ ...styles.kpiIcon, background: t.background, color: t.color }}><Icon size={15} strokeWidth={2} /></div>
      </div>
      <div className="kpi-value" style={styles.kpiValue}>{value}</div>
      {sub && <div style={styles.kpiSuffix}>{sub}</div>}
      {progress !== undefined && (
        <div style={{ ...styles.progressTrack, flex: "none", marginTop: 10 }}><div style={styles.progressFill(progress, "var(--good)")} /></div>
      )}
    </div>
  );
}

function DqRow({ icon: Icon, done, label, meta }) {
  return (
    <div style={s.row}>
      <div style={{ width: 26, display: "flex", justifyContent: "center", color: done ? "var(--good)" : "var(--accent)" }}>
        {done ? <Check size={16} strokeWidth={2.2} /> : <Icon size={16} strokeWidth={1.9} />}
      </div>
      <div style={s.rowMain}>
        <div style={{ ...s.rowTitle, fontWeight: done ? 500 : 600, color: done ? "var(--text-dim)" : "var(--text)" }}>{label}</div>
        {meta && <div style={s.rowMeta}>{meta}</div>}
      </div>
    </div>
  );
}

// Emails de rapport : destinataires, rapport quotidien, mises à jour.
function EmailCard() {
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.emailSettings().then(setState).catch((err) => setMsg(err.message));
  }, []);

  async function save(next) {
    setMsg(null);
    try {
      const { settings } = await api.saveEmailSettings(next);
      setState((cur) => ({ ...cur, settings }));
      return true;
    } catch (err) {
      setMsg(err.message);
      return false;
    }
  }
  async function addRecipient(e) {
    e.preventDefault();
    const email = draft.trim();
    if (!email) return;
    if (await save({ ...state.settings, recipients: [...state.settings.recipients, email] })) setDraft("");
  }
  async function sendNow() {
    setBusy(true); setMsg(null);
    try {
      const r = await api.sendEmailReport();
      setMsg(`Rapport envoyé à ${r.recipients} adresse(s). Il arrive en général en moins d'une minute.`);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  const st = state.settings;
  return (
    <AgentCard icon={Mail} tone="warn" name="Emails de rapport" desc="Chaque matin à 8 h et après chaque série de changements : résumé, rapport PDF, classeur Excel et sauvegarde complète en pièces jointes.">
      {!state.configured && (
        <div style={s.hint}>
          L'envoi d'emails n'est pas encore activé sur le serveur. Il faut un compte Brevo gratuit et deux réglages sur Render (<strong>BREVO_API_KEY</strong> et <strong>EMAIL_FROM</strong>). Tu peux déjà choisir les destinataires ci-dessous.
        </div>
      )}
      <form onSubmit={addRecipient} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <input type="email" style={{ ...styles.input, flex: "1 1 220px", width: "auto" }} placeholder="adresse@exemple.com" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Adresse email à ajouter" />
        <button type="submit" style={styles.secondaryBtn}>Ajouter</button>
      </form>
      {st.recipients.length === 0 ? (
        <div style={styles.emptyNote}>Aucun destinataire pour l'instant.</div>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
          {st.recipients.map((r) => (
            <span key={r} style={{ ...styles.badge("neutral"), fontSize: 12.5, padding: "4px 6px 4px 10px" }}>
              {r}
              <button type="button" onClick={() => save({ ...st, recipients: st.recipients.filter((x) => x !== r) })} aria-label={`Retirer ${r}`} title="Retirer"
                style={{ border: "none", background: "transparent", color: "var(--text-dim)", cursor: "pointer", padding: 2, display: "inline-flex" }}>
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={s.toggleRow}><span>Rapport quotidien (8 h)</span><Toggle on={st.daily} onChange={(v) => save({ ...st, daily: v })} label="Rapport quotidien" /></div>
      <div style={s.toggleRow}><span>Email après des changements (paiements, biens), regroupés toutes les 10 min</span><Toggle on={st.onChange} onChange={(v) => save({ ...st, onChange: v })} label="Emails de mise à jour" /></div>
      <div style={{ marginTop: 12 }}>
        <button type="button" style={styles.secondaryBtn} onClick={sendNow} disabled={busy || !state.configured || !st.recipients.length}>
          {busy ? <span className="spinner" /> : <Send size={14} />} Envoyer le rapport maintenant
        </button>
        {state.configured && state.from && <span style={{ fontSize: 12, color: "var(--text-dim)", marginLeft: 10 }}>Expéditeur : {state.from}</span>}
      </div>
      {msg && <div style={{ ...s.hint, marginTop: 12, marginBottom: 0 }}>{msg}</div>}
    </AgentCard>
  );
}

// Rapports PDF archivés chaque matin par le passage automatique des agents.
function ReportsCard() {
  const [reports, setReports] = useState(null);
  useEffect(() => {
    api.assistantReports().then((r) => setReports(r.reports)).catch(() => setReports([]));
  }, []);
  return (
    <AgentCard icon={FileDown} tone="neutral" name="Rapports et sauvegardes" desc="Chaque matin à 8 h : un rapport PDF et une sauvegarde complète des données (restaurable avec « Importer »), gardés 90 jours.">
      {reports === null ? (
        <div style={styles.loadingText}><span className="spinner" /> Chargement…</div>
      ) : reports.length === 0 ? (
        <div style={styles.emptyNote}>Le premier rapport sera archivé demain matin. En attendant, « Rapport PDF du jour » en haut de la page le génère à la demande.</div>
      ) : (
        reports.slice(0, 10).map((r) => (
          <div key={r.date} style={s.row}>
            <div style={s.rowMain}>
              <div style={{ ...s.rowTitle, fontWeight: 500 }}>{new Date(`${r.date}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div>
              <div style={s.rowMeta}>{fmt(r.summary?.month?.collected)} encaissés · {r.summary?.lateTenants ?? 0} en retard · {fmt(r.summary?.arrearsTotal)} d'arriérés</div>
            </div>
            <div style={s.actions}>
              <a href={`/api/assistant/report.pdf?date=${r.date}`} target="_blank" rel="noreferrer" style={s.smallBtn}><FileDown size={14} /> PDF</a>
              {r.has_backup && <a href={`/api/assistant/backup.json?date=${r.date}`} style={s.smallBtn}><Download size={14} /> Sauvegarde</a>}
            </div>
          </div>
        ))
      )}
    </AgentCard>
  );
}

// Carte « Sur ton iPhone » : installation de la web app et notifications.
function PhoneCard() {
  const [state, setState] = useState({ loading: true, endpoint: null, prefs: null });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const standalone = isStandalone();
  const ios = isIos();
  const supported = pushSupported();

  useEffect(() => {
    (async () => {
      try {
        const sub = await currentSubscription();
        if (sub) {
          const st = await api.pushStatus(sub.endpoint);
          setState({ loading: false, endpoint: st.subscribed ? sub.endpoint : null, prefs: st.prefs });
        } else {
          setState({ loading: false, endpoint: null, prefs: null });
        }
      } catch {
        setState({ loading: false, endpoint: null, prefs: null });
      }
    })();
  }, []);

  async function turnOn() {
    setBusy(true); setMsg(null);
    try {
      const r = await enablePush();
      setState({ loading: false, endpoint: r.endpoint, prefs: r.prefs });
      setMsg("Notifications activées sur cet appareil.");
    } catch (err) {
      setMsg(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function turnOff() {
    setBusy(true); setMsg(null);
    await disablePush();
    setState({ loading: false, endpoint: null, prefs: null });
    setBusy(false);
  }
  async function setPref(key, value) {
    const prefs = { ...state.prefs, [key]: value };
    setState((cur) => ({ ...cur, prefs }));
    try { await api.pushPrefs(state.endpoint, prefs); } catch (err) { setMsg(err.message); }
  }
  async function test() {
    setMsg(null);
    try {
      const r = await api.pushTest();
      setMsg(r.sent ? "Notification de test envoyée." : "Aucun appareil n'a pu être joint.");
    } catch (err) { setMsg(err.message); }
  }

  const needsInstall = ios && !standalone;

  return (
    <AgentCard icon={Smartphone} tone="good" name="Sur ton téléphone" desc="L'extranet comme une app, avec le briefing du matin et les alertes en notification.">
      {needsInstall ? (
        <>
          <div style={s.hint}>Sur iPhone, les notifications ne marchent que depuis l'app installée sur l'écran d'accueil. Trente secondes :</div>
          <div style={s.step}><span style={s.stepNum}>1</span> <span>Ouvre l'extranet dans <strong>Safari</strong>.</span></div>
          <div style={s.step}><span style={s.stepNum}>2</span> <span>Touche <Share size={15} style={{ margin: "0 2px" }} /> <strong>Partager</strong>, en bas de l'écran.</span></div>
          <div style={s.step}><span style={s.stepNum}>3</span> <span>Choisis <PlusSquare size={15} style={{ margin: "0 2px" }} /> <strong>Sur l'écran d'accueil</strong>, puis <strong>Ajouter</strong>.</span></div>
          <div style={s.step}><span style={s.stepNum}>4</span> <span>Ouvre l'app <strong>Extranet</strong> depuis l'écran d'accueil et reviens ici pour activer les notifications.</span></div>
        </>
      ) : !supported ? (
        <div style={styles.emptyNote}>Ce navigateur ne gère pas les notifications. Sur iPhone, installe l'app depuis Safari (iOS 16.4 ou plus récent).</div>
      ) : state.loading ? (
        <div style={styles.loadingText}><span className="spinner" /> Vérification…</div>
      ) : !state.endpoint ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button type="button" style={styles.primaryBtn} onClick={turnOn} disabled={busy}>
            {busy ? <span className="spinner" /> : <Bell size={15} />} Activer les notifications sur cet appareil
          </button>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Briefing à 8 h, loyers encaissés par l'équipe, alertes.</span>
        </div>
      ) : (
        <>
          <div style={s.toggleRow}><span>Briefing du matin (8 h)</span><Toggle on={state.prefs?.briefing !== false} onChange={(v) => setPref("briefing", v)} label="Briefing du matin" /></div>
          <div style={s.toggleRow}><span>Loyer encaissé par un employé</span><Toggle on={state.prefs?.payments !== false} onChange={(v) => setPref("payments", v)} label="Loyers encaissés" /></div>
          <div style={s.toggleRow}><span>Alertes (fins de bail, révisions)</span><Toggle on={state.prefs?.alerts !== false} onChange={(v) => setPref("alerts", v)} label="Alertes" /></div>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" style={styles.secondaryBtn} onClick={test}><Sparkles size={14} /> Envoyer une notification de test</button>
            <button type="button" style={{ ...styles.secondaryBtn, color: "var(--text-dim)" }} onClick={turnOff} disabled={busy}><BellOff size={14} /> Désactiver sur cet appareil</button>
          </div>
        </>
      )}
      {msg && <div style={{ ...s.hint, marginTop: 12, marginBottom: 0 }}>{msg}</div>}
    </AgentCard>
  );
}
