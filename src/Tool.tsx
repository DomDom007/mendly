// Mendly: parcel-style tracking for repairs. Customers get a status link instead of calling the shop.
import { useState } from "react";
import { moneyFmt } from "./lib/money";
import { openLater, shareLink, waLink } from "./lib/share";
import { uid, useStored } from "./lib/store";
import { useShared } from "./lib/useShared";
import { Section, Stat, Stats } from "./ui/kit";

const T = "mendly";
const STAGES = ["Received", "Diagnosing", "Waiting for parts", "Repairing", "Ready to collect", "Collected"];
type Job = { id: string; ref: string; customer: string; phone: string; item: string; problem: string; quote: number; stage: number; history: { stage: number; at: string; note: string }[]; due: string };
type Public = { shop: string; shopPhone: string; hours: string; currency: string; job: Omit<Job, "phone"> };

const now = () => new Date().toISOString();
const SAMPLE: Job[] = [
  { id: "j1", ref: "R-1041", customer: "Amine", phone: "22333444", item: "iPhone 12", problem: "Cracked screen", quote: 180, stage: 3, due: "", history: [{ stage: 0, at: "2026-09-26T09:10:00Z", note: "" }, { stage: 1, at: "2026-09-26T11:00:00Z", note: "Screen and frame fine, glass only" }, { stage: 3, at: "2026-09-27T10:00:00Z", note: "" }] },
  { id: "j2", ref: "R-1042", customer: "Sonia", phone: "55111000", item: "City bike", problem: "Gears slipping", quote: 45, stage: 2, due: "", history: [{ stage: 0, at: "2026-09-27T15:00:00Z", note: "" }, { stage: 2, at: "2026-09-28T08:30:00Z", note: "New chain ordered, arrives Wednesday" }] },
];

function Tracker({ job, currency }: { job: Omit<Job, "phone">; currency: string }) {
  const shown = STAGES.slice(0, 5);
  return (
    <div className="md-track">
      <div className="md-steps">{shown.map((s, i) => (
        <div key={s} className={"md-step" + (i < job.stage ? " done" : i === job.stage ? " now" : "")}><i />{s}</div>
      ))}</div>
      <table className="t" style={{ marginTop: 16 }}><tbody>
        <tr><td>Item</td><td>{job.item}</td></tr><tr><td>Problem</td><td>{job.problem}</td></tr>
        {job.quote > 0 && <tr><td>Quote</td><td>{moneyFmt(currency)(job.quote)}</td></tr>}
        {job.due && <tr><td>Expected</td><td>{new Date(job.due).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</td></tr>}
      </tbody></table>
      <ol className="md-hist">{[...job.history].reverse().map((h, i) => <li key={i}><strong>{STAGES[h.stage]}</strong> <span className="note">{new Date(h.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>{h.note && <p>{h.note}</p>}</li>)}</ol>
    </div>
  );
}

export default function Mendly() {
  const shared = useShared<Public>();
  const [shop, setShop] = useStored(T, "shop", "FixIt Lafayette");
  const [shopPhone, setShopPhone] = useStored(T, "shopPhone", "+216 71 000 000");
  const [hours, setHours] = useStored(T, "hours", "Mon to Sat, 9:00 to 19:00");
  const [cur, setCur] = useStored(T, "cur", "TND");
  const [cc, setCc] = useStored(T, "cc", "216");
  const [jobs, setJobs] = useStored<Job[]>(T, "jobs", SAMPLE);
  const [nextRef, setNextRef] = useStored(T, "nextRef", 1043);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [d, setD] = useState({ customer: "", phone: "", item: "", problem: "", quote: "", due: "" });
  const css = <style>{`.md-steps{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}.md-step{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:600;color:var(--muted)}.md-step i{height:8px;border-radius:4px;background:var(--line)}
  .md-step.done i{background:var(--good)}.md-step.now i{background:var(--accent)}.md-step.now{color:var(--ink)}.md-hist{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:10px}.md-hist li{padding-left:14px;border-left:3px solid var(--line)}
  .md-job{display:flex;gap:14px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line);flex-wrap:wrap;cursor:pointer}.md-ref{font-family:var(--mono);font-size:13px;color:var(--muted);min-width:64px}`}</style>;

  if (shared.loading) return <p className="empty-note">Loading repair status…</p>;
  if (shared.data) {
    const p = shared.data;
    return (
      <div className="stack">{css}
        <section className="panel">
          <p className="eyebrow">{p.shop} · repair {p.job.ref}</p>
          <h2 style={{ fontSize: 36, margin: "6px 0 18px" }}>{STAGES[p.job.stage]}</h2>
          <Tracker job={p.job} currency={p.currency} />
          <p className="note" style={{ marginTop: 16 }}>Questions? Call {p.shopPhone}. Open {p.hours}. This page shows the status when the link was sent. The shop sends a new link at each step.</p>
        </section>
      </div>
    );
  }

  const job = jobs.find(j => j.id === open);
  const publicOf = (j: Job): Public => ({ shop, shopPhone, hours, currency: cur, job: { ...j, phone: undefined } as unknown as Omit<Job, "phone"> });
  const phone = (x: string) => { const n = x.replace(/\D/g, ""); return n.length > 9 ? n : cc + n; };
  const advance = async (j: Job, stage: number) => {
    const updated = { ...j, stage, history: [...j.history, { stage, at: now(), note: note.trim() }] };
    setJobs(jobs.map(x => (x.id === j.id ? updated : x)));
    setNote("");
    const msg = stage === 4 ? `Hi ${j.customer}, your ${j.item} is ready to collect at ${shop}! ${hours}.` : `Hi ${j.customer}, update on your ${j.item} (${j.ref}): ${STAGES[stage]}.${updated.history.at(-1)!.note ? " " + updated.history.at(-1)!.note : ""}`;
    if (j.phone) await openLater(async () => waLink(`${msg}\nTrack it here: ${await shareLink(T, publicOf(updated), "m=track")}`, phone(j.phone)));
  };
  const active = jobs.filter(j => j.stage < 5);
  const money = moneyFmt(cur);

  return (
    <div className="stack">{css}
      <Section title={shop}>
        <Stats><Stat value={active.length} label="Open repairs" /><Stat value={jobs.filter(j => j.stage === 4).length} label="Ready to collect" tone="good" /><Stat value={jobs.filter(j => j.stage === 2).length} label="Waiting for parts" tone="warn" /><Stat value={money(active.reduce((a, j) => a + j.quote, 0))} label="Value in the workshop" /></Stats>
      </Section>
      <div className="grid2">
        <Section title="Book in a repair">
          <form className="stack" style={{ gap: 10 }} onSubmit={async e => {
            e.preventDefault(); if (!d.customer.trim() || !d.item.trim()) return;
            const j: Job = { id: uid(), ref: `R-${nextRef}`, customer: d.customer.trim(), phone: d.phone, item: d.item.trim(), problem: d.problem, quote: parseFloat(d.quote) || 0, due: d.due, stage: 0, history: [{ stage: 0, at: now(), note: "" }] };
            setJobs([j, ...jobs]); setNextRef(nextRef + 1); setD({ customer: "", phone: "", item: "", problem: "", quote: "", due: "" });
            if (j.phone) await openLater(async () => waLink(`Hi ${j.customer}, we have your ${j.item} (ref ${j.ref}). Track it here: ${await shareLink(T, publicOf(j), "m=track")}`, phone(j.phone)));
          }}>
            <div className="row"><label className="field"><span>Customer</span><input id="md-c" className="input" value={d.customer} onChange={e => setD({ ...d, customer: e.target.value })} /></label><label className="field"><span>WhatsApp</span><input id="md-p" className="input" inputMode="tel" value={d.phone} onChange={e => setD({ ...d, phone: e.target.value })} /></label></div>
            <div className="row"><label className="field"><span>Item</span><input id="md-i" className="input" value={d.item} onChange={e => setD({ ...d, item: e.target.value })} placeholder="Samsung A52" /></label><label className="field"><span>Problem</span><input id="md-pr" className="input" value={d.problem} onChange={e => setD({ ...d, problem: e.target.value })} /></label></div>
            <div className="row" style={{ alignItems: "flex-end" }}><label className="field"><span>Quote ({cur})</span><input id="md-q" className="input num" value={d.quote} onChange={e => setD({ ...d, quote: e.target.value })} /></label><label className="field"><span>Expected ready</span><input id="md-due" type="date" className="input" value={d.due} onChange={e => setD({ ...d, due: e.target.value })} /></label><button className="btn primary" type="submit">Book in {`R-${nextRef}`}</button></div>
          </form>
        </Section>
        <Section title="Shop details">
          <div className="stack" style={{ gap: 10 }}>
            <label className="field"><span>Shop name</span><input id="md-shop" className="input" value={shop} onChange={e => setShop(e.target.value)} /></label>
            <div className="row"><label className="field"><span>Shop phone</span><input id="md-sp" className="input" value={shopPhone} onChange={e => setShopPhone(e.target.value)} /></label><label className="field"><span>Opening hours</span><input id="md-h" className="input" value={hours} onChange={e => setHours(e.target.value)} /></label></div>
            <div className="row"><label className="field"><span>Currency</span><input id="md-cur" className="input" value={cur} onChange={e => setCur(e.target.value.toUpperCase().slice(0, 3))} /></label><label className="field"><span>Country code</span><input id="md-cc" className="input num" value={cc} onChange={e => setCc(e.target.value.replace(/\D/g, ""))} /></label></div>
          </div>
        </Section>
      </div>

      {job && (
        <Section title={`${job.ref} · ${job.customer}`} aside={<button className="btn ghost small" onClick={() => setOpen(null)}>Close</button>}>
          <Tracker job={job} currency={cur} />
          <div className="row" style={{ marginTop: 16, alignItems: "flex-end" }}>
            <label className="field" style={{ flexGrow: 3 }}><span>Note for the customer (optional)</span><input id="md-note" className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Part arrives Wednesday" /></label>
            {job.stage < 5 && <button className="btn primary" onClick={() => advance(job, job.stage + 1)}>Move to “{STAGES[job.stage + 1]}” and notify</button>}
          </div>
          <div className="row" style={{ marginTop: 10 }}>{STAGES.map((s, i) => i !== job.stage && <button key={s} className="btn ghost small" onClick={() => advance(job, i)}>{s}</button>)}</div>
        </Section>
      )}

      <Section title="Workshop">
        {jobs.length === 0 ? <p className="empty-note">No repairs yet.</p> : jobs.map(j => (
          <div key={j.id} className="md-job" onClick={() => setOpen(j.id)} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && setOpen(j.id)}>
            <span className="md-ref">{j.ref}</span>
            <div style={{ flex: 1, minWidth: 0 }}><strong>{j.item}</strong> · {j.customer}<p className="note">{j.problem}</p></div>
            <span className={"pill " + (j.stage === 4 ? "good" : j.stage === 2 ? "warn" : "")}>{STAGES[j.stage]}</span>
            {j.stage === 5 && <button className="btn ghost small danger" onClick={e => { e.stopPropagation(); setJobs(jobs.filter(x => x.id !== j.id)); }}>Archive</button>}
          </div>
        ))}
      </Section>
    </div>
  );
}
