import React, { useEffect, useMemo, useState } from 'react';

// ======= Config =======
const ENDPOINT = '/.netlify/functions/state';
const DEFAULT_RATING = 1000;

// ======= Utils & Surnames =======
const uid = () => Math.random().toString(36).slice(2,10);
const ITALIANI = [
  "Andrea Paris","Giovanni Cardarelli","Nicola Di Marzio","Stefano Ruscitti","Domenico Di Gianfilippo","Giorgio Contestabile",
  "Alfredo Di Donato","Paolo Chiola","Angelo Persia","Marco Idrofano","Lorenzo Eligi","Matteo Di Stefano",
  "Claudio Morgante","Pierluigi Paris","Gabriele Rossi","Luca Bianchi","Marco Verdi","Antonio Esposito","Francesco Romano","Davide Moretti"
];
const PARTICLES = new Set(["di","de","del","della","dello","dalla","dalle","dei","degli","delle","da","dal","d","lo","la","le","van","von"]);
const cleanLower = (s) => String(s||"").toLowerCase();
function surnameFrom(full){
  const p = String(full||'').trim().split(/\s+/);
  if(p.length<=1) return p[0]||'';
  const last = p[p.length-1];
  const prevRaw = p[p.length-2];
  const prev = cleanLower(prevRaw.replace(/\.$/,''));
  if(prev.endsWith("'") || PARTICLES.has(prev)) return `${prevRaw} ${last}`;
  return last;
}

// ======= Ranking Paris =======
function computeResultFromSets(sets){
  let setsA=0, setsB=0, gamesA=0, gamesB=0;
  for(const s of sets||[]){
    const a=Number(s?.a||0), b=Number(s?.b||0);
    if(String(s?.a??'')==='' && String(s?.b??'')==='') continue;
    gamesA+=a; gamesB+=b; if(a>b) setsA++; else if(b>a) setsB++;
  }
  let winner=null; if(setsA>setsB) winner='A'; else if(setsB>setsA) winner='B';
  return {setsA,setsB,gamesA,gamesB,winner};
}
function setsToString(sets){
  return (sets||[]).filter(s=>String(s?.a??'')!==''||String(s?.b??'')!=='')
    .map(s=>`${Number(s.a||0)}-${Number(s.b||0)}`).join(', ');
}
function calcParisDelta({ rA1,rA2,rB1,rB2,gA,gB,winner,sets }){
  const base=(rA1+rA2+rB1+rB2)/100;
  const bonus=Math.abs(gA-gB);
  const pts=base+bonus;
  const deltaA = winner==='A'? pts : -pts;
  const deltaB = winner==='B'? pts : -pts;
  const formula = `Base = (R1 + R2 + R3 + R4) / 100 = (${rA1.toFixed(2)} + ${rA2.toFixed(2)} + ${rB1.toFixed(2)} + ${rB2.toFixed(2)}) / 100 = ${base.toFixed(2)}
Bonus differenza game = |${gA} - ${gB}| = ${bonus}
Punti per vincitori = ${base.toFixed(2)} + ${bonus} = ${pts.toFixed(2)}
${winner==='A' ? 'A +'+pts.toFixed(2)+', B -'+pts.toFixed(2) : 'B +'+pts.toFixed(2)+', A -'+pts.toFixed(2)}
Risultato set: ${setsToString(sets)}`;
  return { deltaA, deltaB, pts, formula };
}

// ======= UI helpers =======
function Section({title, children, right}){
  return <section className="max-w-6xl mx-auto my-6">
    <div className="flex items-center justify-between mb-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      {right}
    </div>
    <div className="bg-white rounded-2xl shadow p-4">{children}</div>
  </section>
}
function Button({children, onClick, kind='primary'}){
  const cls = kind==='primary' ? 'bg-black text-white' : 'border';
  return <button onClick={onClick} className={`px-3 py-2 rounded-xl ${cls}`}>{children}</button>
}

// ======= Backend (normalized SQL) =======
async function readState(){
  const r = await fetch(ENDPOINT, {cache:'no-store'});
  if(!r.ok) throw new Error('Backend error');
  const data = await r.json();
  // normalize keys (teamA/teamB camelCase in frontend)
  const matches = (data.matches||[]).map(m=> ({ id:m.id, date:m.date, teamA:m.team_a||m.teamA, teamB:m.team_b||m.teamB, sets:m.sets||[] }));
  return { players: data.players||[], matches };
}
async function writeState(next){
  const payload = {
    players: next.players.map(p=> ({id:p.id, name:p.name})),
    matches: next.matches.map(m=> ({id:m.id, date:m.date, teamA:m.teamA, teamB:m.teamB, sets:m.sets}))
  };
  const r = await fetch(ENDPOINT, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  if(!r.ok) throw new Error('Save failed');
  return await r.json();
}

// ======= App =======
export default function App(){
  const [tab,setTab]=useState('classifica');
  const [state,setState]=useState({players:[],matches:[]});
  const [loading,setLoading]=useState(true);
  const [toast,setToast]=useState('');
  const [formulaText,setFormulaText]=useState('');
  const [selectedPlayer,setSelectedPlayer]=useState('');

  useEffect(()=>{
    (async()=>{
      try{
        const data=await readState();
        if((data.players||[]).length===0){
          const seeded = seedData();
          await writeState(seeded);
          setState(seeded);
        }else{
          setState(data);
        }
      }catch(e){
        setToast('Errore backend: '+e.message);
      }finally{ setLoading(false); }
    })();
  },[]);

  async function persist(next){
    setLoading(true);
    try{
      await writeState(next);
      setState(next);
      setToast('Salvato');
    }catch(e){ setToast('Errore salvataggio: '+e.message); }
    finally{ setLoading(false); }
  }

  // Derived ratings
  const derived = useMemo(()=>{
    const map=new Map(state.players.map(p=>[p.id,{...p,rating:DEFAULT_RATING,wins:0,losses:0}]));
    const enriched=[];
    const sorted=[...(state.matches||[])].sort((a,b)=> new Date(a.date)-new Date(b.date));
    for(const m of sorted){
      const a1=map.get(m.teamA[0])||{rating:DEFAULT_RATING,wins:0,losses:0};
      const a2=map.get(m.teamA[1])||{rating:DEFAULT_RATING,wins:0,losses:0};
      const b1=map.get(m.teamB[0])||{rating:DEFAULT_RATING,wins:0,losses:0};
      const b2=map.get(m.teamB[1])||{rating:DEFAULT_RATING,wins:0,losses:0};
      const rr=computeResultFromSets(m.sets);
      const {deltaA,deltaB,pts,formula}=calcParisDelta({rA1:a1.rating,rA2:a2.rating,rB1:b1.rating,rB2:b2.rating,gA:rr.gamesA,gB:rr.gamesB,winner:rr.winner,sets:m.sets});
      enriched.push({...m,...rr,deltaA,deltaB,pts,formula});
      if(rr.winner==='A'){a1.rating+=deltaA; a2.rating+=deltaA; b1.rating+=deltaB; b2.rating+=deltaB; a1.wins++; a2.wins++; b1.losses++; b2.losses++;}
      else if(rr.winner==='B'){a1.rating+=deltaA; a2.rating+=deltaA; b1.rating+=deltaB; b2.rating+=deltaB; b1.wins++; b2.wins++; a1.losses++; a2.losses++;}
    }
    return { players:[...map.values()], matches: enriched };
  },[state]);

  const playersById = useMemo(()=> Object.fromEntries(derived.players.map(p=>[p.id,p])), [derived.players]);

  if(loading) return <div className="max-w-6xl mx-auto p-6">Caricamento…</div>;

  return <div>
    <header className="bg-white shadow sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="text-2xl font-bold">Paris League</div>
        <nav className="flex gap-2">
          {[
            {id:'classifica',label:'Classifica'},
            {id:'giocatori',label:'Giocatori'},
            {id:'crea',label:'Crea Partita'},
            {id:'stats',label:'Statistiche Giocatore'},
            {id:'torneo',label:'Torneo'},
            {id:'extra',label:'Extra'},
          ].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} className={`px-3 py-1.5 rounded-xl border ${tab===t.id?'bg-black text-white':''}`}>{t.label}</button>
          ))}
        </nav>
      </div>
    </header>

    {tab==='classifica' && <Classifica players={derived.players} onOpen={(id)=>{setSelectedPlayer(id); setTab('stats');}} />}
    {tab==='giocatori' && <Giocatori state={state} setState={persist} onOpen={(id)=>{setSelectedPlayer(id); setTab('stats');}} />}
    {tab==='crea' && <CreaPartita state={state} setState={persist} playersById={playersById} showFormula={setFormulaText} />}
    {tab==='stats' && <Statistiche state={state} derived={derived} selected={selectedPlayer} setSelected={setSelectedPlayer} showFormula={setFormulaText} />}
    {tab==='torneo' && <Torneo state={state} setState={persist} players={derived.players} />}
    {tab==='extra' && <Extra state={state} setState={persist} derived={derived} />}

    {formulaText && <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={()=>setFormulaText('')} />
      <div className="relative z-10 bg-white rounded-2xl p-4 w-[min(90vw,700px)] whitespace-pre-wrap text-sm">
        <div className="font-semibold mb-2">Formula calcolo punti</div>
        {formulaText}
      </div>
    </div>}
  </div>
}

// ======= Screens =======
function Classifica({players,onOpen}){
  const rows = [...players].map(p=>({
    ...p,
    winRate: ((p.wins||0)+(p.losses||0))? (p.wins/((p.wins||0)+(p.losses||0))*100) : 0
  })).sort((a,b)=> b.rating-a.rating);

  return <Section title="Classifica (Ranking Paris)">
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead><tr className="text-left border-b"><th className="py-1 pr-3">#</th><th>Giocatore</th><th>Ranking</th><th>V</th><th>S</th><th>%</th></tr></thead>
        <tbody>
          {rows.map((p,i)=>(
            <tr key={p.id} className="border-b hover:bg-gray-50">
              <td className="py-1 pr-3">{i+1}</td>
              <td className="py-1 pr-3"><button className="underline" onClick={()=>onOpen(p.id)}>{p.name}</button></td>
              <td className="py-1 pr-3 font-semibold">{p.rating.toFixed(2)}</td>
              <td className="py-1 pr-3">{p.wins||0}</td>
              <td className="py-1 pr-3">{p.losses||0}</td>
              <td className="py-1 pr-3">{p.winRate.toFixed(0)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Section>
}

function Giocatori({state,setState,onOpen}){
  const [name,setName]=useState('');
  const add=()=>{
    if(!name.trim()) return;
    setState({...state, players:[...state.players,{id:uid(), name:name.trim()}]});
    setName('');
  };
  const del=(id)=>{
    if(!confirm('Rimuovere il giocatore?')) return;
    const next = {...state, players: state.players.filter(p=>p.id!==id), matches: state.matches.filter(m=> !m.teamA.includes(id) && !m.teamB.includes(id))};
    setState(next);
  };
  return <Section title="Giocatori">
    <div className="flex gap-2 mb-2">
      <input className="border rounded-xl px-3 py-2 w-64" placeholder="Nome" value={name} onChange={e=>setName(e.target.value)}/>
      <Button onClick={add}>Aggiungi</Button>
    </div>
    <div className="grid md:grid-cols-2 gap-2">
      {state.players.map(p=>(
        <div key={p.id} className="border rounded-xl p-3 flex items-center justify-between">
          <div>
            <button onClick={()=>onOpen(p.id)} className="underline font-medium">{p.name}</button>
            <div className="text-xs text-gray-500">{p.id}</div>
          </div>
          <button className="text-red-600 text-sm" onClick={()=>del(p.id)}>Elimina</button>
        </div>
      ))}
    </div>
  </Section>
}

function PlayerSelect({players, value, onChange}){
  return (<select value={value} onChange={e=>onChange(e.target.value)} className="border rounded-xl px-2 py-1">
    <option value="">—</option>
    {players.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
  </select>);
}

function CreaPartita({state,setState,playersById,showFormula}){
  const players=state.players;
  const [a1,setA1]=useState(''); const [a2,setA2]=useState(''); const [b1,setB1]=useState(''); const [b2,setB2]=useState('');
  const [sets,setSets]=useState([{a:'',b:''},{a:'',b:''},{a:'',b:''}]);

  const rr=computeResultFromSets(sets);
  const ready = a1 && a2 && b1 && b2 && rr.winner;

  const previewFormula=()=>{
    const {formula}=calcParisDelta({rA1:playersById[a1]?.rating||DEFAULT_RATING,rA2:playersById[a2]?.rating||DEFAULT_RATING,rB1:playersById[b1]?.rating||DEFAULT_RATING,rB2:playersById[b2]?.rating||DEFAULT_RATING,gA:rr.gamesA,gB:rr.gamesB,winner:rr.winner,sets});
    showFormula(formula);
  };

  const add=()=>{
    if(!ready) return alert('Seleziona 4 giocatori e inserisci i set (best of 3). Non può finire 1–1: aggiungi il terzo set.');
    const match = {id:uid(), date:new Date().toISOString(), teamA:[a1,a2], teamB:[b1,b2], sets};
    setState({...state, matches:[...state.matches, match]});
    setA1('');setA2('');setB1('');setB2('');setSets([{a:'',b:''},{a:'',b:''},{a:'',b:''}]);
  };

  const del=(id)=>{
    if(!confirm('Cancellare la partita?')) return;
    setState({...state, matches: state.matches.filter(m=>m.id!==id)});
  };

  return <>
    <Section title="Crea Partita">
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="font-medium">Team A</div>
          <div className="flex gap-2"><PlayerSelect players={players} value={a1} onChange={setA1}/><PlayerSelect players={players} value={a2} onChange={setA2}/></div>
        </div>
        <div className="space-y-1">
          <div className="font-medium">Team B</div>
          <div className="flex gap-2"><PlayerSelect players={players} value={b1} onChange={setB1}/><PlayerSelect players={players} value={b2} onChange={setB2}/></div>
        </div>
      </div>
      <div className="mt-3 max-w-md">
        <table className="w-full text-sm border rounded-xl overflow-hidden">
          <thead><tr className="bg-gray-100"><th className="py-2 px-2 text-left">Set</th><th className="py-2 px-2 text-center">A</th><th className="py-2 px-2 text-center">B</th></tr></thead>
          <tbody>
            {[0,1,2].map(i=>(
            <tr key={i} className="border-t">
              <td className="py-2 px-2">{i+1}</td>
              <td className="py-2 px-2"><input type="number" min="0" className="border rounded-xl px-2 py-1 w-20 text-center" value={sets[i].a} onChange={e=>setSets(s=>s.map((x,j)=> j===i?{...x,a:e.target.value}:x))}/></td>
              <td className="py-2 px-2"><input type="number" min="0" className="border rounded-xl px-2 py-1 w-20 text-center" value={sets[i].b} onChange={e=>setSets(s=>s.map((x,j)=> j===i?{...x,b:e.target.value}:x))}/></td>
            </tr>
            ))}
          </tbody>
        </table>
        <div className="text-xs text-gray-500 mt-1">Se dopo 2 set è 1–1, inserisci il terzo set per decidere.</div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button onClick={add}>Salva partita</Button>
        <Button onClick={previewFormula} kind="ghost">Mostra formula punti</Button>
      </div>
    </Section>
    <Section title="Ultime partite">
      <div className="space-y-2">
        {[...state.matches].slice(-20).reverse().map(m=> <MatchRow key={m.id} m={m} playersById={playersById} onShow={showFormula} onDel={()=>del(m.id)} />)}
      </div>
    </Section>
  </>
}

function MatchRow({m,playersById,onShow,onDel}){
  const rr=computeResultFromSets(m.sets);
  const getName=(id)=> playersById[id]?.name || id;
  const A = `${surnameFrom(getName(m.teamA[0]))} & ${surnameFrom(getName(m.teamA[1]))}`;
  const B = `${surnameFrom(getName(m.teamB[0]))} & ${surnameFrom(getName(m.teamB[1]))}`;
  const {formula, pts} = calcParisDelta({
    rA1: playersById[m.teamA[0]]?.rating ?? DEFAULT_RATING,
    rA2: playersById[m.teamA[1]]?.rating ?? DEFAULT_RATING,
    rB1: playersById[m.teamB[0]]?.rating ?? DEFAULT_RATING,
    rB2: playersById[m.teamB[1]]?.rating ?? DEFAULT_RATING,
    gA: rr.gamesA, gB: rr.gamesB, winner: rr.winner, sets: m.sets
  });
  const sign = rr.winner==='A'? '+' : '-';
  return <div className="border rounded-xl p-3 flex items-center justify-between">
    <div className="text-sm">
      <div className="font-medium">{A} <span className="text-gray-500">vs</span> {B}</div>
      <div className="text-gray-600">Sets {rr.setsA}-{rr.setsB} | Games {rr.gamesA}-{rr.gamesB}</div>
    </div>
    <div className="flex items-center gap-3">
      <button className="text-sm underline" onClick={()=>onShow(formula)}>Δ punti: {sign}{pts.toFixed(2)}</button>
      <button className="text-red-600 text-sm" onClick={onDel}>Elimina</button>
    </div>
  </div>
}

function Statistiche({state,derived,selected,setSelected,showFormula}){
  const [pid,setPid]=useState(selected || (derived.players[0]?.id || ''));
  useEffect(()=>{ if(selected) setPid(selected); },[selected]);
  const player = derived.players.find(p=>p.id===pid);

  const data = useMemo(()=>{
    if(!player) return null;
    const played = derived.matches.filter(m=> m.teamA.includes(pid) || m.teamB.includes(pid));
    const rows = played.map(m=>{
      const isA = m.teamA.includes(pid);
      const delta = isA ? m.deltaA : m.deltaB;
      const mate = isA ? m.teamA.find(x=>x!==pid) : m.teamB.find(x=>x!==pid);
      const foes = isA ? m.teamB : m.teamA;
      return { m, isA, delta, mate, foes };
    });
    const mw=new Map(), ml=new Map(), fb=new Map(), fw=new Map();
    for(const r of rows){
      const win = (r.isA && r.m.winner==='A') || (!r.isA && r.m.winner==='B');
      if(r.mate){ (win?mw:ml).set(r.mate, ((win?mw:ml).get(r.mate)||0)+1); }
      for(const f of r.foes){ if(win) fb.set(f, (fb.get(f)||0)+1); else fw.set(f,(fw.get(f)||0)+1); }
    }
    const sortTop=(m)=> [...m.entries()].sort((a,b)=> b[1]-a[1]).filter(([,n])=> n>0).slice(0,5);
    return { rows, mateWins:sortTop(mw), mateLoss:sortTop(ml), foesBeaten:sortTop(fb), foesWhoBeat:sortTop(fw) };
  },[pid, derived]);

  const nameById=(id)=> derived.players.find(p=>p.id===id)?.name || id;
  const teamStr = (ids)=> ids.map(id=> surnameFrom(nameById(id))).join(' & ');

  if(!player) return <Section title="Statistiche giocatore">Nessun giocatore.</Section>;

  return <Section title="Statistiche giocatore" right={<div className="min-w-[240px]">
    <select className="border rounded-xl px-3 py-2 w-full" value={pid} onChange={e=>{setPid(e.target.value); setSelected(e.target.value);}}>
      {derived.players.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  </div>}>
    <div className="grid md:grid-cols-2 gap-3">
      <Box title="Compagni con più vittorie">
        {data.mateWins.length? data.mateWins.map(([id,n])=> <div key={id} className="text-sm">{nameById(id)} — {n}</div>) : <Empty/>}
      </Box>
      <Box title="Compagni con più sconfitte">
        {data.mateLoss.length? data.mateLoss.map(([id,n])=> <div key={id} className="text-sm">{nameById(id)} — {n}</div>) : <Empty/>}
      </Box>
      <Box title="Avversari battuti più volte">
        {data.foesBeaten.length? data.foesBeaten.map(([id,n])=> <div key={id} className="text-sm">{nameById(id)} — {n}</div>) : <Empty/>}
      </Box>
      <Box title="Avversari che hanno battuto di più">
        {data.foesWhoBeat.length? data.foesWhoBeat.map(([id,n])=> <div key={id} className="text-sm">{nameById(id)} — {n}</div>) : <Empty/>}
      </Box>
    </div>

    <div className="mt-4">
      <div className="font-medium mb-1">Tutte le partite</div>
      <div className="space-y-2">
        {data.rows.map(({m,delta,isA})=> (
          <div key={m.id} className="border rounded-xl p-3 flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{teamStr(isA?m.teamA:m.teamB)}</span> <span className="text-gray-500">vs</span> {teamStr(isA?m.teamB:m.teamA)} — Sets {m.setsA}-{m.setsB} | Games {m.gamesA}-{m.gamesB}
            </div>
            <button className={delta>=0?'text-green-600':'text-red-600'} onClick={()=>showFormula(m.formula)}>Δ {delta>=0?'+':''}{delta.toFixed(2)}</button>
          </div>
        ))}
      </div>
    </div>
  </Section>
}
function Box({title,children}){ return <div className="border rounded-xl p-3"><div className="font-medium mb-1">{title}</div>{children}</div> }
function Empty(){ return <div className="text-sm text-gray-500">(nessuno)</div> }

function Torneo({state,setState,players}){
  const [groups,setGroups]=useState([]);
  const [bonus,setBonus]=useState({ first:10, second:6, third:3 });
  const addGroup=()=> setGroups(gs=>[...gs,{id:uid(), name:`Girone ${String.fromCharCode(65+gs.length)}`, teams:[], matches:[]}]);
  const addTeam=(gid)=>{
    const id1=prompt('ID giocatore 1'), id2=prompt('ID giocatore 2');
    if(!id1||!id2) return;
    setGroups(gs=> gs.map(g=> g.id===gid? {...g, teams:[...g.teams,[id1,id2]] } : g));
  };
  const addMatch=(gid)=>{
    const g=groups.find(x=>x.id===gid); if(!g||g.teams.length<2) return alert('Aggiungi prima squadre');
    const list=g.teams.map(t=> t.map(id=> players.find(p=>p.id===id)?.name||id).join(' & '));
    const ia=Number(prompt(`Indice Team A (0..${g.teams.length-1})\n`+list.map((n,i)=>`${i}: ${n}`).join('\n')));
    const ib=Number(prompt('Indice Team B (0..'+(g.teams.length-1)+')'));
    const s1a=Number(prompt('Set1 A')||0), s1b=Number(prompt('Set1 B')||0);
    const s2a=Number(prompt('Set2 A')||0), s2b=Number(prompt('Set2 B')||0);
    const s3a=Number(prompt('Set3 A (opz)')||0), s3b=Number(prompt('Set3 B (opz)')||0);
    const sets=[{a:s1a,b:s1b},{a:s2a,b:s2b},{a:s3a,b:s3b}];
    const rr=computeResultFromSets(sets); if(!rr.winner) return alert('Risultato non valido (1–1)');
    setGroups(gs=> gs.map(g=> g.id===gid? {...g, matches:[...g.matches,{id:uid(),a:g.teams[ia],b:g.teams[ib],sets}]}:g));
  };
  const standings=(g)=>{
    const table=g.teams.map(t=>({team:t, pts:0, gf:0, gs:0, w:0,l:0}));
    const idx=(t)=> g.teams.findIndex(x=> x[0]===t[0] && x[1]===t[1]);
    for(const m of g.matches){
      const rr=computeResultFromSets(m.sets||[]); const ia=idx(m.a), ib=idx(m.b);
      table[ia].gf+=rr.gamesA; table[ia].gs+=rr.gamesB; table[ib].gf+=rr.gamesB; table[ib].gs+=rr.gamesA;
      if(rr.winner==='A'){table[ia].w++; table[ib].l++; table[ia].pts+=3;}
      if(rr.winner==='B'){table[ib].w++; table[ia].l++; table[ib].pts+=3;}
    }
    return table.sort((a,b)=> b.pts-a.pts || (b.gf-b.gs)-(a.gf-a.gs));
  };
  const teamStr=(t)=> t.map(id=> players.find(p=>p.id===id)?.name || id).join(' & ');

  return <Section title="Torneo (Gironi)">
    <div className="mb-3 flex flex-wrap gap-2 items-center">
      <Button onClick={addGroup}>+ Girone</Button>
      <div className="text-sm ml-2">Bonus posizioni: 1° {bonus.first}, 2° {bonus.second}, 3° {bonus.third}</div>
    </div>
    <div className="grid md:grid-cols-2 gap-4">
      {groups.map(g=>(
        <div key={g.id} className="border rounded-2xl p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="font-semibold">{g.name}</div>
            <div className="flex gap-2">
              <Button onClick={()=>addTeam(g.id)} kind="ghost">+ Squadra</Button>
              <Button onClick={()=>addMatch(g.id)} kind="ghost">+ Partita</Button>
            </div>
          </div>
          <div className="text-sm mb-2">Squadre: {g.teams.length}</div>
          <div className="mb-2">
            <div className="font-medium mb-1">Classifica girone</div>
            <table className="w-full text-sm"><thead><tr className="text-left border-b"><th>Pos</th><th>Squadra</th><th>Pt</th><th>GF-GS</th></tr></thead>
              <tbody>{standings(g).map((row,i)=>(<tr key={i} className="border-b"><td>{i+1}</td><td>{teamStr(row.team)}</td><td>{row.pts}</td><td>{row.gf}-{row.gs}</td></tr>))}</tbody>
            </table>
          </div>
          <div>
            <div className="font-medium mb-1">Partite</div>
            <div className="space-y-1">{g.matches.map(m=>{ const rr=computeResultFromSets(m.sets); return (<div key={m.id} className="text-sm border rounded-xl p-2">{teamStr(m.a)} vs {teamStr(m.b)} — Sets {rr.setsA}-{rr.setsB} | Games {rr.gamesA}-{rr.gamesB}</div>)})}</div>
          </div>
        </div>
      ))}
    </div>
  </Section>
}

function Extra({state,setState,derived}){
  const backupJSON=()=>{
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='paris-league-backup.json'; a.click(); URL.revokeObjectURL(url);
  };
  const importJSON=(file)=>{
    const fr=new FileReader(); fr.onload=()=>{ try{ const data=JSON.parse(fr.result); setState(data); }catch{ alert('File non valido'); } }; fr.readAsText(file);
  };
  const exportCSV=(rows, name)=>{
    const esc=v=>`"${String(v).replace(/"/g,'""')}"`;
    const header=Object.keys(rows[0]||{}).map(esc).join(',');
    const body=rows.map(r=> Object.values(r).map(esc).join(',')).join('\n');
    const blob=new Blob([header+'\n'+body],{type:'text/csv'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
  };
  const exportClassificaCSV=()=>{
    const rows=[...derived.players].sort((a,b)=>b.rating-a.rating).map((p,i)=>({pos:i+1,name:p.name,rating:p.rating.toFixed(2),wins:p.wins||0,losses:p.losses||0}));
    exportCSV(rows,'classifica.csv');
  };
  const exportMatchesCSV=()=>{
    const nameById = id => derived.players.find(p=>p.id===id)?.name || id;
    const rows=derived.matches.map(m=>({date:m.date,teamA:m.teamA.map(nameById).join(' & '),teamB:m.teamB.map(nameById).join(' & '),sets:setsToString(m.sets),gamesA:m.gamesA,gamesB:m.gamesB,winner:m.winner,deltaA:m.deltaA.toFixed(2),deltaB:m.deltaB.toFixed(2)}));
    exportCSV(rows,'partite.csv');
  };
  const resetAll=()=>{ if(!confirm('Rigenera simulazione iniziale (sovrascrive il DB)?')) return; setState(seedData()); };

  return <Section title="Extra – Backup & Export">
    <div className="flex flex-wrap gap-2 items-center">
      <Button onClick={backupJSON}>Backup JSON</Button>
      <label className="px-3 py-2 rounded-xl border cursor-pointer">Import JSON<input type="file" className="hidden" accept="application/json" onChange={e=>e.target.files?.[0] && importJSON(e.target.files[0])}/></label>
      <Button onClick={exportClassificaCSV} kind="ghost">Export Classifica CSV</Button>
      <Button onClick={exportMatchesCSV} kind="ghost">Export Partite CSV</Button>
      <Button onClick={resetAll} kind="ghost">Rigenera simulazione</Button>
    </div>
  </Section>
}

// ======= Seed =======
function seedData(){
  const players = ITALIANI.map(n=>({id:uid(), name:n}));
  const pick4=()=>{ const pool=[...players]; return new Array(4).fill(0).map(()=> pool.splice(Math.floor(Math.random()*pool.length),1)[0]); };
  const matches=[];
  for(let i=0;i<15;i++){
    const [a1,a2,b1,b2]=pick4();
    const sets=[]; let wA=0,wB=0;
    while(wA<2 && wB<2){
      const aw=Math.random()<0.5; const ga=6, gb=Math.floor(Math.random()*5);
      if(aw){sets.push({a:ga,b:gb}); wA++;} else {sets.push({a:gb,b:ga}); wB++;}
    }
    matches.push({id:uid(), date:new Date().toISOString(), teamA:[a1.id,a2.id], teamB:[b1.id,b2.id], sets});
  }
  return {players, matches};
}
