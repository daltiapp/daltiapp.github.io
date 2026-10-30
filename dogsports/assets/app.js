const SPORTS = {agility:'어질리티',disc_dog:'디스크독',canicross:'캐니크로스',dog_dance:'독댄스',flyball:'플라이볼',obedience:'복종훈련',rally_obedience:'랠리 오비디언스',dog_trick:'독트릭',igp:'IGP'};
const sportsOf=(item,fallback=[])=>Array.isArray(item.sportIds)?item.sportIds.filter(id=>Object.hasOwn(SPORTS,id)):fallback;
const inSport=item=>filter.sport==='all'||item.sportIds.includes(filter.sport);
const scopedHash=(page,sport=filter.sport)=>'#'+page+'?sport='+encodeURIComponent(sport);
function selectSport(id){if(id==='all'||Object.hasOwn(SPORTS,id)){libCategory='all';location.hash=scopedHash(current,id);}}
const sportNames = e => (e.sportIds||[]).map(s=>SPORTS[s]||s).join(' · ');
const sportIcon = id => `<svg viewBox="0 0 24 24" aria-hidden="true">${({
 all:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 agility:'<path d="M4 21V7h3v14m10 0V7h3v14M7 12h10M2 21h7m6 0h7"/>',
 disc_dog:'<ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-25 12 12)"/><path d="m2 4 5 1M1 8l3 1"/>',
 canicross:'<circle cx="14" cy="4" r="2"/><path d="m7 10 4-3 4 3 4 1M11 7l-1 7 5 2 2 5m-7-7-3 6H3"/>',
 dog_dance:'<path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="16" rx="3" ry="2"/>',
 flyball:'<circle cx="17" cy="7" r="4"/><path d="m3 10 5-2m-5 7 8-3m-6 8 8-5"/>',
 obedience:'<path d="m4 12 5 5L20 6"/>',rally_obedience:'<path d="M5 21V4h12l-3 4 3 4H5m4 9h-8"/>',
 dog_trick:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
 igp:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6Zm-4 9 3 3 5-6"/>'
 })[id]||'<circle cx="12" cy="12" r="8"/>'}</svg>`;
function pageScope(){return {id:filter.sport,label:SPORTS[filter.sport]||'전체 스포츠'};}
let activeDetail=null;
function sportChoices(){return Object.entries({all:'전체 스포츠',...SPORTS}).map(([id,name])=>`<li><a href="${scopedHash(current,id)}" data-sport-link="${id}" ${filter.sport===id?'aria-current="true"':''}>${sportIcon(id)}<span>${name}</span>${filter.sport===id?'<span class="choice-check" aria-hidden="true">✓</span><span class="sr-only">선택됨</span>':''}</a></li>`).join('');}
function closeSportMenu(restoreFocus=false){const panel=$('#sport-menu');if(panel.hidden)return;panel.hidden=true;$('#sport-trigger').setAttribute('aria-expanded','false');if(restoreFocus)$('#sport-trigger').focus();}
function toggleSportMenu(){const panel=$('#sport-menu');if(!panel.hidden){closeSportMenu();return;}panel.hidden=false;$('#sport-trigger').setAttribute('aria-expanded','true');}
function updateContext(detail){
 if(detail)activeDetail=detail;const target=detail||($('#detail').open?activeDetail:null);const scope=pageScope();const label=target?sportNames(target):scope.label;
 $('#current-scope').textContent='선택한 스포츠 · '+scope.label;$('#sport-trigger').disabled=false;
 $('#sport-trigger').innerHTML=sportIcon(scope.id)+`<span>${esc(scope.label)}</span><span class="picker-chevron" aria-hidden="true"></span>`;
 $('#sport-trigger').setAttribute('aria-label','스포츠 변경: '+scope.label);
 const menuKey=current+'|'+scope.id;if($('#sport-options').dataset.context!==menuKey){$('#sport-options').innerHTML=sportChoices();$('#sport-options').dataset.context=menuKey;}
 document.title=(target?target.name:pages[current][0])+' · '+label+' | 독스포츠';
}
const LIBRARY_KINDS={all:'전체 자료',result:'대회 결과',entry_list:'출진표',course_map:'코스맵',seminar:'세미나',reference:'규정·안내',timetable:'시간표'};
const ROOT = 'https://daltiapp.github.io';
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe = u => /^https?:\/\//i.test(u || '') ? u : '';
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${({calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',learn:'<path d="m2 9 10-6 10 6-10 6ZM6 12v6c4 3 8 3 12 0v-6m4-3v8"/>',library:'<rect x="4" y="4" width="16" height="17" rx="2"/><path d="M8 4v17m4-12h4m-4 4h4"/>',club:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3m1-15a3 3 0 0 1 0 6m2 3a4 4 0 0 1 3 4v2"/>',notice:'<path d="M4 6h16v12H9l-5 3V6Zm4 4h8m-8 4h5"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',list:'<path d="M8 6h12M8 12h12M8 18h12M3 6h1M3 12h1M3 18h1"/>'})[name]||''}</svg>`;
const pages = {schedule:['대회 일정','calendar'],seminars:['세미나','learn'],library:['경기 자료실','library'],clubs:['클럽 찾기','club'],notices:['공지사항','notice'],saved:['내 일정','heart']};
const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let snapshot, extra, library, libraryLoading=false, libraryError=false, events=[], current='schedule', filter={sport:'all',range:'upcoming',area:'domestic',q:'',view:'list',month:today.slice(0,7),day:'',limit:40}, libKind='all', libCategory='all';
let saved;
try { saved=new Set(JSON.parse(localStorage.getItem('dogsports.saved.v1')||'[]')); } catch { saved=new Set(); }
const eventId = e => 'ag-'+encodeURIComponent([e.name,e.startAt].join('|'));
const day = v => String(v||'').slice(0,10);
const fmt = v => v ? day(v).replaceAll('-','.') : '미정';
const weekday = v => new Intl.DateTimeFormat('ko-KR',{weekday:'short',timeZone:'Asia/Seoul'}).format(new Date(day(v)+'T12:00:00+09:00'));
const shortDate = v => day(v).slice(5).replace('-','.');
const dateRange = e => e.start===e.end ? `${fmt(e.start)} (${weekday(e.start)})` : `${fmt(e.start)} – ${fmt(e.end)}`;
const photo = u => { const m=(u||'').match(/[?&]id=([\w-]+)/); return m && u.includes('drive.google.com') ? `https://lh3.googleusercontent.com/d/${m[1]}=w1400` : safe(u); };
const tags = e => (e.sportIds||[]).map(s=>`<span class="tag sport-tag ${esc(s)}">${sportIcon(s)}${esc(SPORTS[s]||s)}</span>`).join('');
const sourceLink = (u,label='주최 측 안내 보기') => safe(u) ? `<a class="button primary" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>` : '';
const nowKorea = () => new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false});
function toast(s){ $('#toast').textContent=s;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),2300); }
function normalize(){
  events=[...snapshot.match.competitions.map(e=>({id:eventId(e),name:e.name,start:day(e.startAt),end:day(e.endAt||e.startAt),startAt:e.startAt,endAt:e.endAt,sportIds:sportsOf(e,['agility']),region:'국내',area:'domestic',location:e.location,organizer:e.club,judge:e.judge||[],types:e.matchTypes||[],eventType:e.eventType,applicationStartAt:e.applicationStartAt,applicationEndAt:e.applicationEndAt,description:e.detailNotice,detailStatus:e.detailStatus,url:e.url,images:e.detailImages||[],sourceName:'어질리티 코리아',sourceVersion:snapshot.manifest.dataVersion})),
    ...snapshot.globalMatch.globalmatch.map(e=>({id:'global-'+e.id,name:e.name,start:e.startDate,end:e.endDate,location:e.location,region:e.country,area:'overseas',sportIds:sportsOf(e,['agility']),organizer:e.federation,url:e.url,images:[],sourceName:'어질리티 코리아',types:[],judge:[]})),...(extra.events||[])];
  events.sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
}
function canOpen(e){return e.detailStatus!=='detail_pending' && Boolean(safe(e.url));}
function status(e){
  if(e.end<today)return ['종료',''];
  if(e.start<=today)return ['대회 진행','open'];
  if(e.applicationStartAt?.length===10 || e.applicationEndAt?.length===10){if(e.applicationEndAt&&e.applicationEndAt<today)return ['접수 마감',''];if(e.applicationStartAt&&e.applicationStartAt>today)return ['접수 예정',''];if(e.applicationStartAt&&e.applicationEndAt)return ['접수 중','open'];return ['개최 예정',''];}
  const now=new Date(); const s=e.applicationStartAt?new Date(e.applicationStartAt.replace(/Z$|[+]\d\d:\d\d$/,'')+'+09:00'):null;const end=e.applicationEndAt?new Date(e.applicationEndAt.replace(/Z$|[+]\d\d:\d\d$/,'')+'+09:00'):null;
  if(end&&end<now)return ['접수 마감',''];
  if(s&&end&&s<=now&&now<=end)return ['접수 중','open'];
  if(s&&now<s)return ['접수 예정',''];
  return ['개최 예정',''];
}
function datesFor(e,sport=filter.sport){
  if(e.sessions?.length && sport!=='all') return e.sessions.filter(s=>s.sportIds.includes(sport)).map(s=>s.date);
  const out=[];let d=new Date(e.start+'T12:00:00Z');const end=new Date(e.end+'T12:00:00Z');
  for(let n=0;d<=end && n<90;n++,d.setUTCDate(d.getUTCDate()+1))out.push(d.toISOString().slice(0,10));
  return out;
}
function matches(e,ignoreDate=false){
  return (filter.sport==='all'||e.sportIds.includes(filter.sport))&&(filter.area==='all'||e.area===filter.area)&&
   (ignoreDate||filter.range==='all'||(filter.range==='upcoming'?e.end>=today:e.end<today))&&
   (!filter.q||[e.name,e.location,e.organizer,e.region,...e.sportIds.map(s=>SPORTS[s]),...(e.types||[])].join(' ').toLowerCase().includes(filter.q.toLowerCase()))&&
   (filter.view==='calendar'||!filter.day||datesFor(e).includes(filter.day));
}
function filtered(){let pool=current==='saved'?[...events,...seminars()]:events;let list=pool.filter(e=>(current!=='saved'||saved.has(e.id))&&matches(e,filter.view==='calendar'));return filter.range==='past'?list.toReversed():list;}
function saveButton(id){return `<button class="save ${saved.has(id)?'saved':''}" data-save="${esc(id)}" aria-label="${saved.has(id)?'내 일정에서 삭제':'내 일정에 저장'}" aria-pressed="${saved.has(id)}">${saved.has(id)?'♥':'♡'}</button>`;}
function dateBox(e){return `<div class="date-box"><small>${e.start.slice(0,4)}.${e.start.slice(5,7)}</small><b>${e.start.slice(8,10)}</b><span>${weekday(e.start)}${e.start!==e.end?' – '+shortDate(e.end):''}</span></div>`;}
function row(e){let [s,c]=status(e);return `<article class="event">${dateBox(e)}<button class="event-main" data-event="${esc(e.id)}" ${canOpen(e)?'':'disabled title="세부 안내 준비 중"'}><div class="tag-row">${tags(e)}${e.id.startsWith('seminar-')?'<span class="tag">세미나</span>':''}${e.area==='overseas'?'<span class="tag">해외</span>':''}</div><h3>${esc(e.name)}</h3><div class="event-meta"><span>${esc(e.location||'장소 미정')}</span>${e.organizer?`<span>·</span><span>${esc(e.organizer)}</span>`:''}</div></button><div class="event-side"><span class="status ${c}">${e.detailStatus==='detail_pending'?'세부 안내 준비 중':s}</span>${saveButton(e.id)}</div><span class="arrow" aria-hidden="true">↗</span></article>`;}
function empty(title='조건에 맞는 일정이 없어요',body='다른 종목이나 기간을 선택해 보세요.'){return `<div class="empty"><b>${esc(title)}</b>${esc(body)}</div>`;}
function heading(title){const scope=pageScope();return `<div class="page-heading"><h1>${scope.id!=='all'?esc(scope.label)+' ':''}${title}</h1></div>`;}
function searchBox(placeholder){return `<label class="search">${icon('search')}<input id="search" type="search" placeholder="${placeholder}" value="${esc(filter.q)}" aria-label="${placeholder}" autocomplete="off"></label>`;}
function render(){
  if(!snapshot)return;
  $('#navigation').innerHTML=Object.entries(pages).map(([id,[label,ico]])=>`<a class="nav-link ${current===id?'active':''}" ${current===id?'aria-current="page"':''} href="${scopedHash(id)}">${icon(ico)}<span class="nav-label">${label}</span>${id==='saved'&&saved.size?`<b class="badge">${saved.size}</b>`:''}</a>`).join('');
  $('.brand').href=scopedHash('schedule');$('.my-button').href=scopedHash('saved');$('#current-page').textContent=pages[current][0];$('#saved-count').textContent=saved.size;updateContext();
  if(['schedule','saved'].includes(current))renderSchedule();
  else if(current==='seminars')renderSeminars();else if(current==='clubs')renderClubs();else if(current==='notices')renderNotices();else renderLibrary();
  bindImages();
}
function renderSchedule(){
 let html=heading(current==='saved'?'내 일정':'대회 일정');
 if(current==='saved')html+='<p class="saved-note">이 브라우저에 저장한 일정입니다.</p>';
 html+=`<div class="filters">${searchBox('대회명, 지역, 클럽 검색')}<select id="range" aria-label="일정 기간" ${filter.view==='calendar'?'hidden':''}><option value="upcoming" ${filter.range==='upcoming'?'selected':''}>다가오는 대회</option><option value="all" ${filter.range==='all'?'selected':''}>전체 기간</option><option value="past" ${filter.range==='past'?'selected':''}>지난 대회</option></select><select id="area" aria-label="개최 지역"><option value="domestic" ${filter.area==='domestic'?'selected':''}>국내</option><option value="overseas" ${filter.area==='overseas'?'selected':''}>해외</option><option value="all" ${filter.area==='all'?'selected':''}>국내 + 해외</option></select><div class="view-switch"><button data-view="list" class="${filter.view==='list'?'active':''}" aria-pressed="${filter.view==='list'}">${icon('list')}목록</button><button data-view="calendar" class="${filter.view==='calendar'?'active':''}" aria-pressed="${filter.view==='calendar'}">${icon('calendar')}달력</button></div></div><section id="results" aria-live="polite"></section>`;
 $('#main').innerHTML=html;renderResults();
}
function renderResults(){
 let list=filtered();if(filter.view==='calendar'){renderCalendar(list);return;}
 $('#results').innerHTML=`<div class="list-head"><span><strong>${list.length}</strong>개의 대회${filter.day?' · '+fmt(filter.day):''}</span><span>${filter.range==='past'?'최근 개최일순':'개최일순'}</span></div>${list.length?`<div class="event-list">${list.slice(0,filter.limit).map(row).join('')}</div>`:empty(current==='saved'&&!saved.size?'아직 담아 둔 일정이 없어요':undefined,current==='saved'&&!saved.size?'일정 옆의 ♡ 버튼을 눌러 내 일정을 만들어 보세요.':undefined)}${list.length>filter.limit?'<button class="button load-more" id="more">대회 더 보기 ↓</button>':''}`;
}
function renderCalendar(list){
 const [y,m]=filter.month.split('-').map(Number),first=new Date(Date.UTC(y,m-1,1)),offset=first.getUTCDay(),days=new Date(Date.UTC(y,m,0)).getUTCDate();
 let cells='';for(let i=0;i<Math.ceil((offset+days)/7)*7;i++){
  const n=i-offset+1;if(n<1||n>days){cells+='<div class="day muted" aria-hidden="true"></div>';continue;}
  const date=`${y}-${String(m).padStart(2,'0')}-${String(n).padStart(2,'0')}`, items=list.filter(e=>datesFor(e).includes(date));
  cells+=`<div class="day ${date===today?'today':''} ${filter.day===date?'selected':''}"><button class="day-number" data-day="${date}" aria-label="${date} 대회 ${items.length}개">${n}</button>${items.slice(0,3).map(e=>`<button class="calendar-event ${esc(e.sportIds[0])}" data-event="${esc(e.id)}" title="${esc(sportNames(e)+' · '+e.name)}" aria-label="${esc(sportNames(e)+' · '+e.name)}" ${canOpen(e)?'':'disabled'}><span class="calendar-sport">${esc(sportNames(e))}</span><span class="calendar-name">${esc(e.name)}</span></button>`).join('')}${items.length>3?`<button class="calendar-more" data-day="${date}">+${items.length-3}개 더 보기</button>`:''}</div>`;
 }
 const selected=filter.day?list.filter(e=>datesFor(e).includes(filter.day)):[];
 $('#results').innerHTML=`<div class="calendar-toolbar"><h2>${y}년 ${m}월</h2><div><button data-month="-1" aria-label="이전 달">‹</button><button data-month="0">이번 달</button><button data-month="1" aria-label="다음 달">›</button></div></div><div class="calendar"><div class="weekdays">${['일','월','화','수','목','금','토'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-grid">${cells}</div></div>${filter.day?`<div class="section-heading"><h2>${fmt(filter.day)} · ${selected.length}개</h2><button class="button" data-day="">선택 해제</button></div><div class="event-list">${selected.length?selected.map(row).join(''):empty('이날 등록된 대회가 없어요','다른 날짜를 눌러 확인해 보세요.')}</div>`:''}`;
}
function seminarEvent(s,fallback=['agility']){return {id:'seminar-'+encodeURIComponent(s.name+'|'+s.date),name:s.name,start:day(s.date),end:day(s.endDate||s.date),sportIds:sportsOf(s,fallback),area:'domestic',location:s.location||'',organizer:s.organizer,description:s.description||'',time:s.time,fee:s.fee,address:s.address,verifiedAt:s.verifiedAt,sessions:s.sessions||[],types:[],judge:[],images:s.detailImages?.length?s.detailImages:(s.listImage?[s.listImage]:[]),url:s.url,speaker:s.speaker,speakerId:s.speakerId,sourceName:s.sourceName||(fallback.length?'어질리티 코리아':'주최 공식 안내')};}
function seminars(){return [...snapshot.seminar.seminar.map(s=>seminarEvent(s)),...(extra.seminars||[]).filter(s=>sportsOf(s).length).map(s=>({...seminarEvent(s,[]),id:'seminar-extra-'+s.id}))];}
function clubs(){return [...snapshot.clubs.map(c=>({...c,sportIds:sportsOf(c,['agility'])})),...(extra.clubs||[]).filter(c=>sportsOf(c).length).map(c=>({...c,sportIds:sportsOf(c)}))];}
function notices(){return [...snapshot.notice.items.map(n=>({...n,sportIds:sportsOf(n,['agility'])})),...(extra.notices||[]).filter(n=>sportsOf(n).length).map(n=>({...n,sportIds:sportsOf(n)}))];}
function scopeEmpty(noun){const label=pageScope().label;return `<div class="empty"><b>${esc(label)} ${esc(noun)} 정보가 아직 없어요</b>자료가 등록되면 이곳에서 확인할 수 있어요.${filter.sport!=='all'?`<div><button class="button" data-sport="all">전체 스포츠 ${esc(noun)} 보기</button></div>`:''}</div>`;}
function renderSeminars(){
 const all=seminars().filter(inSport).sort((a,b)=>a.start.localeCompare(b.start));const items=all.filter(e=>(filter.range==='all'||(filter.range==='past'?e.end<today:e.end>=today))&&(!filter.q||[e.name,e.speaker,e.organizer].join(' ').includes(filter.q)));
 $('#main').innerHTML=heading('세미나')+`<div class="filters">${searchBox('세미나명, 강사, 주최 검색')}<select id="range" aria-label="세미나 기간"><option value="upcoming" ${filter.range==='upcoming'?'selected':''}>다가오는 세미나</option><option value="all" ${filter.range==='all'?'selected':''}>전체 기간</option><option value="past" ${filter.range==='past'?'selected':''}>지난 세미나</option></select></div><div class="list-head">${items.length}개의 세미나</div><div class="card-grid">${items.map(e=>`<article class="content-card">${e.images[0]?`<img class="card-image" src="${esc(photo(e.images[0]))}" data-original="${esc(e.images[0])}" loading="lazy" alt="${esc(e.name)} 안내 이미지">`:''}<div class="card-body"><div class="tag-row">${tags(e)}</div><h3>${esc(e.name)}</h3><p>${dateRange(e)}<br>${esc(e.speaker||'')} · ${esc(e.organizer||'')}</p><div class="card-actions"><button class="button" data-seminar="${esc(e.id)}">세미나 보기 ↗</button>${saveButton(e.id)}</div></div></article>`).join('')}</div>${items.length?'':(all.length?empty('조건에 맞는 세미나가 없어요','검색어나 기간을 바꿔 보세요.'):scopeEmpty('세미나'))}`;
}
function renderClubs(){
 const all=clubs().filter(inSport);const list=all.filter(c=>[c.nameKo,c.nameEn,c.address].join(' ').toLowerCase().includes(filter.q.toLowerCase()));
 $('#main').innerHTML=heading('클럽 찾기')+`<div class="filters">${searchBox('클럽명, 지역 검색')}</div><div class="list-head">클럽 ${list.length}곳</div><div class="card-grid">${list.map(c=>`<article class="content-card"><div class="card-body">${tags(c)}<div class="club-icon" aria-hidden="true">${esc(c.nameKo.slice(0,1))}</div><h3>${esc(c.nameKo)}</h3><p>${esc(c.nameEn||'')}<br>${esc(c.address||'주소는 클럽에 문의해 주세요.')}</p><div class="card-actions">${safe(c.instagram)?`<a class="button" href="${esc(c.instagram)}" target="_blank" rel="noopener noreferrer">인스타그램 ↗</a>`:''}${safe(c.naver)?`<a class="button" href="${esc(c.naver)}" target="_blank" rel="noopener noreferrer">클럽 안내 ↗</a>`:''}</div></div></article>`).join('')}</div>${list.length?'':(all.length?empty('검색된 클럽이 없어요','다른 이름이나 지역으로 검색해 보세요.'):scopeEmpty('클럽'))}`;
}
function renderNotices(){
 const all=notices().filter(inSport);const list=all.filter(n=>n.title.toLowerCase().includes(filter.q.toLowerCase())).sort((a,b)=>(b.published_at||'').localeCompare(a.published_at||''));
 $('#main').innerHTML=heading('공지사항')+`<div class="filters">${searchBox('공지 제목 검색')}</div><div class="list-head">${list.length}개의 공지</div>${list.slice(0,filter.limit).map(n=>`<a class="notice-row" href="${esc(safe(n.url))}" target="_blank" rel="noopener noreferrer"><div><div class="tag-row">${tags(n)}<span class="tag">${esc({kkf:'KKF',kkc:'KKC',dongsa:'동물과사람'}[n.source]||n.source)}</span></div><h3>${esc(n.title)}</h3><p>${fmt(n.published_at)}</p></div><span class="arrow">↗</span></a>`).join('')}${list.length>filter.limit?'<button class="button load-more" id="more">공지 더 보기 ↓</button>':''}${list.length?'':(all.length?empty('검색된 공지가 없어요','검색어를 바꿔 보세요.'):scopeEmpty('공지'))}`;
}
async function loadLibrary(){if(library||libraryLoading||libraryError)return;libraryLoading=true;try{let url=ROOT+snapshot.manifest.basePath+'/'+snapshot.manifest.files.library;try{library=await json(url,12000);}catch{library=await json('./data/library.json');}if(current==='library')render();}catch{libraryError=true;if(current==='library')renderLibrary();}finally{libraryLoading=false;}}
function libraryEvent(e){return {...e,sportIds:sportsOf(e,['agility'])};}
function libraryAssetIds(group,kind=libKind){const fields={course_map:'courseMapIds',result:'resultIds',entry_list:'entryListIds'};return [...new Set((kind==='all'?Object.values(fields):[fields[kind]]).filter(Boolean).flatMap(key=>group[key]||[]))];}
function libraryGroups(){return library.competitionGroups.filter(g=>libCategory==='all'||g.categoryId===libCategory).map(g=>({g,e:library.events.find(e=>e.id===g.eventId)})).filter(({e})=>e).map(({e,g})=>({g,e:libraryEvent(e)})).filter(({e,g})=>inSport(e)&&e.name.toLowerCase().includes(filter.q.toLowerCase())&&libraryAssetIds(g).length);}
function resources(){return (extra.resources||[]).filter(r=>sportsOf(r).length&&r.title&&safe(r.url)&&LIBRARY_KINDS[r.kind]);}
function resourceItems(){return resources().filter(r=>inSport(r)&&(libKind==='all'||r.kind===libKind)&&libCategory==='all'&&[r.title,r.eventName,r.sourceName,...r.sportIds.map(id=>SPORTS[id])].join(' ').toLowerCase().includes(filter.q.toLowerCase()));}
const resourceDate=r=>r.eventDate||r.publishedAt||r.year||'';
const resourceDateLabel=r=>r.eventDate?fmt(r.eventDate)+(r.eventEndDate&&r.eventEndDate!==r.eventDate?' – '+fmt(r.eventEndDate):''):r.publishedAt?'게시 '+fmt(r.publishedAt):r.year?String(r.year)+'년 자료':'날짜 미공개';
function resourceRow(r){return `<article class="event"><button class="event-main" data-resource="${esc(r.id)}"><div class="tag-row">${tags(r)}<span class="tag">${esc(LIBRARY_KINDS[r.kind])}</span></div><h3>${esc(r.title)}</h3><div class="library-meta">${resourceDateLabel(r)} · ${esc(r.sourceName)}${r.files?.length?' · 첨부 '+r.files.length+'개':''}</div></button><span class="arrow" aria-hidden="true">↗</span></article>`;}
function renderLibrary(){
 $('#main').innerHTML=heading('경기 자료실');
 const refs=resourceItems(),needsLegacy=['all','agility'].includes(filter.sport);
 if(needsLegacy&&!library&&!libraryError){loadLibrary();if(!refs.length){$('#main').insertAdjacentHTML('beforeend','<div class="loading">경기 자료를 불러오고 있어요.</div>');return;}}
 const scopedEvents=(library?.events||[]).map(libraryEvent).filter(inSport),eventIds=new Set(scopedEvents.map(e=>e.id));
 const categoryIds=new Set((library?.competitionGroups||[]).filter(g=>eventIds.has(g.eventId)).map(g=>g.categoryId));
 const categories=(library?.competitionCategories||[]).filter(c=>categoryIds.has(c.id));
 const legacy=library?libraryGroups():[];
 const list=[...legacy.map(x=>({...x,type:'legacy',id:x.g.id,date:x.e.startDate||String(x.e.year||'')})),...refs.map(r=>({type:'resource',id:r.id,date:resourceDate(r),r}))].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));
 const allForSport=resources().filter(inSport).length+scopedEvents.length;
 $('#main').insertAdjacentHTML('beforeend',`<div class="sports library-kinds">${Object.entries(LIBRARY_KINDS).map(([id,label])=>`<button class="sport ${libKind===id?'active':''}" data-kind="${id}" aria-pressed="${libKind===id}">${label}</button>`).join('')}</div><div class="filters">${searchBox('대회·자료명, 주최 검색')}${categories.length&&['all','course_map','result','entry_list'].includes(libKind)?`<select id="category" aria-label="어질리티 경기 부문"><option value="all">모든 어질리티 부문</option>${categories.map(c=>`<option value="${esc(c.id)}" ${libCategory===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select>`:''}</div>${needsLegacy&&!library?`<p class="source-note">${libraryError?'어질리티 경기 자료 연결에 실패했습니다. 새로고침으로 다시 확인할 수 있어요.':'어질리티 경기 자료를 추가로 불러오는 중입니다.'}</p>`:''}<div class="list-head">${list.length}개 자료 묶음 <span>최신 자료순</span></div><div class="event-list">${list.slice(0,filter.limit).map(item=>item.type==='resource'?resourceRow(item.r):`<article class="event"><button class="event-main" data-library="${esc(item.g.id)}"><div class="tag-row">${tags(item.e)}<span class="tag">${esc(library.competitionCategories.find(c=>c.id===item.g.categoryId)?.name||'')}</span></div><h3>${esc(item.e.name)}</h3><div class="library-meta">${item.e.startDate?fmt(item.e.startDate):'개최일 미확인'} · ${libraryAssetIds(item.g).length}개 자료</div></button><span class="arrow" aria-hidden="true">↗</span></article>`).join('')}</div>${list.length>filter.limit?'<button class="button load-more" id="more">자료 더 보기 ↓</button>':''}${list.length?'':(libraryError&&needsLegacy&&!allForSport?empty('자료 연결을 확인해 주세요','상단 새로고침으로 다시 시도할 수 있어요.'):allForSport?empty('조건에 맞는 자료가 없어요','다른 자료 종류나 검색어를 선택해 보세요.'):scopeEmpty('경기 자료'))}`);
}
function gallery(images,title,label='안내 이미지'){return images?.length?`<div class="section-heading"><h3>${esc(label)}</h3><small>${images.length}장</small></div><div class="gallery">${images.map((u,i)=>`<figure><a href="${esc(safe(u))}" target="_blank" rel="noopener noreferrer"><img src="${esc(photo(u))}" data-original="${esc(safe(u))}" loading="lazy" alt="${esc(title)} 안내 ${i+1}"></a><figcaption>${i+1} / ${images.length} · 눌러서 원본 보기</figcaption></figure>`).join('')}</div>`:'';}
function showEvent(e){
 if(!e||!canOpen(e)){toast('세부 안내가 공개되면 확인할 수 있어요.');return;}
 const venue=snapshot.venue.venues.find(v=>v.name===e.location);const speaker=e.speakerId?snapshot.seminar.speakers.find(s=>s.id===e.speakerId):null;
 $('#detail-content').innerHTML=`<div class="detail-context">${tags(e)}<span>${e.id.startsWith('seminar-')?'세미나':'대회 일정'}</span></div><div class="detail-inner"><div class="tag-row"><span class="status">${status(e)[0]}</span></div><h2 id="detail-title">${esc(e.name)}</h2><p class="detail-lead">${dateRange(e)}${e.time?' · '+esc(e.time):''}</p><dl class="detail-grid"><div><dt>개최 장소</dt><dd>${esc(e.location||'주최 안내 확인')}${venue?.location.address?'<br>'+esc(venue.location.address):e.address?'<br>'+esc(e.address):''}</dd></div><div><dt>주최 · 주관</dt><dd>${esc(e.organizer||'주최 안내 확인')}</dd></div>${e.judge?.length?`<div><dt>심사위원</dt><dd>${esc(e.judge.join(', '))}</dd></div>`:''}${e.types?.length?`<div><dt>경기 종목 · 부문</dt><dd>${esc(e.types.join(' · '))}</dd></div>`:''}${e.applicationStartAt||e.applicationEndAt?`<div><dt>접수 기간</dt><dd>${e.applicationStartAt?fmt(e.applicationStartAt):'시작일 미공개'} – ${e.applicationEndAt?fmt(e.applicationEndAt):'마감일 미공개'}</dd></div>`:''}${e.fee?`<div><dt>참가비</dt><dd>${esc(e.fee)}</dd></div>`:''}${e.speaker?`<div><dt>강사</dt><dd>${esc(e.speaker)}</dd></div>`:''}</dl>${e.sessions?.length?`<h3>부문별 일정</h3>${e.sessions.map(s=>`<div class="session"><b>${shortDate(s.date)} (${weekday(s.date)})</b><span>${esc(s.label)}</span></div>`).join('')}`:''}${e.description?`<div class="detail-note">${esc(e.description)}</div>`:''}${speaker?`<h3>${esc(speaker.nameKo||speaker.name)} 강사 소개</h3><p class="detail-lead">${esc(speaker.summary)}</p>${sourceLink(speaker.instagramUrl,'강사 인스타그램')}`:''}<div class="detail-actions">${sourceLink(e.url)}<button class="button" data-save="${esc(e.id)}">${saved.has(e.id)?'♥ 내 일정에 저장됨':'♡ 내 일정에 저장'}</button><button class="button" data-ics="${esc(e.id)}">캘린더에 추가 ↓</button><button class="button" data-copy="${esc(e.id)}">링크 복사</button></div>${gallery(e.images,e.name)}<p class="source-note">출처: ${esc(e.sourceName||'주최 공식 안내')}${e.verifiedAt?' · 확인 '+fmt(e.verifiedAt):''}<br>최종 출진 조건과 변경 사항은 주최 측 공지를 확인해 주세요.</p></div>`;
 updateContext(e);$('#detail').showModal();$('#detail').scrollTop=0;bindImages();
}
function showLibrary(id){
 const g=library.competitionGroups.find(g=>g.id===id);if(!g)return;const e=libraryEvent(library.events.find(e=>e.id===g.eventId));const ids=libraryAssetIds(g);const assets=ids.map(id=>library.assets.find(a=>a.id===id)).filter(Boolean);
 $('#detail-content').innerHTML=`<div class="detail-context">${tags(e)}<span>경기 자료실</span></div><div class="detail-inner"><span class="tag">${esc(library.competitionCategories.find(c=>c.id===g.categoryId)?.name)}</span><h2 id="detail-title">${esc(e.name)}</h2><p class="detail-lead">${e.startDate?fmt(e.startDate):'개최일 미확인'} · ${assets.length}개 자료</p><div class="gallery">${assets.map((a,i)=>a.image?.url?`<figure><a href="${esc(safe(a.image.url))}" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="${esc(safe(a.image.url))}" data-original="${esc(safe(a.source?.postUrl||a.image.url))}" alt="${esc(a.title)}"></a><figcaption>${i+1}. ${esc(a.title)} ${safe(a.source?.postUrl)?`<a href="${esc(a.source.postUrl)}" target="_blank" rel="noopener noreferrer">· 원문 ↗</a>`:''}</figcaption></figure>`:`<article class="detail-note">${esc(a.title)}<br>${sourceLink(a.source?.postUrl||a.source?.url,'기록 원문 보기')}</article>`).join('')}</div></div>`;
 updateContext(e);$('#detail').showModal();$('#detail').scrollTop=0;bindImages();
}
function showResource(id){
 const r=resources().find(r=>r.id===id);if(!r)return;
 $('#detail-content').innerHTML=`<div class="detail-context">${tags(r)}<span>${esc(LIBRARY_KINDS[r.kind])}</span></div><div class="detail-inner"><h2 id="detail-title">${esc(r.title)}</h2><p class="detail-lead">${resourceDateLabel(r)} · ${esc(r.sourceName)}</p>${r.eventName?`<p class="library-meta">${esc(r.eventName)}</p>`:''}${r.summary?`<div class="detail-note">${esc(r.summary)}</div>`:''}<div class="resource-files">${(r.files||[]).filter(f=>safe(f.url)).map(f=>`<a class="resource-file" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer"><span class="tag">${esc(f.mime==='application/pdf'?'PDF':f.mime?.startsWith('image/')?'이미지':f.mime?.includes('excel')?'Excel':'원문')}</span><span>${esc(f.title)}${f.pages?`<small>${f.pages}쪽</small>`:''}</span><span aria-hidden="true">↗</span></a>`).join('')}</div><div class="detail-actions">${sourceLink(r.url,'공식 원문 보기')}${r.seminarId?`<button class="button" data-seminar="${esc(r.seminarId)}">세미나 일정 보기</button>`:''}</div>${gallery(r.images||[],r.title,'자료 이미지')}<p class="source-note">출처: ${esc(r.sourceName)} · 확인 ${fmt(r.verifiedAt)}${r.language?' · '+esc(r.language):''}<br>규정과 대회 운영 자료는 발행 기관의 최신 원문을 확인해 주세요.</p></div>`;
 updateContext({...r,name:r.title});$('#detail').showModal();$('#detail').scrollTop=0;bindImages();
}
function bindImages(){document.querySelectorAll('img[data-original]').forEach(img=>{img.addEventListener('error',()=>{const box=document.createElement('div');box.className='image-fallback';box.innerHTML=`이미지를 불러오지 못했어요. <a href="${esc(safe(img.dataset.original))}" target="_blank" rel="noopener noreferrer">원본에서 확인 ↗</a>`;img.replaceWith(box);},{once:true});});}
function findEvent(id){return events.find(e=>e.id===id)||seminars().find(e=>e.id===id);}
function toggleSave(id){const old=new Set(saved);if(saved.has(id))saved.delete(id);else saved.add(id);try{localStorage.setItem('dogsports.saved.v1',JSON.stringify([...saved]));}catch{saved=old;toast('브라우저 저장 공간을 사용할 수 없어요.');return;}render();if($('#detail').open){const e=findEvent(id);if(e)showEvent(e);}toast(saved.has(id)?'내 일정에 담았어요.':'내 일정에서 해제했어요.');}
function downloadICS(e){
 const end=new Date(e.end+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+1);
 const clean=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Dalti//DogSports//KO','BEGIN:VEVENT','UID:'+encodeURIComponent(e.id)+'@dogsports.dalti','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART;VALUE=DATE:'+e.start.replaceAll('-',''),'DTEND;VALUE=DATE:'+end.toISOString().slice(0,10).replaceAll('-',''),'SUMMARY:'+clean(e.name),'LOCATION:'+clean(e.location),'DESCRIPTION:'+clean(e.url),'END:VEVENT','END:VCALENDAR'];
 const u=URL.createObjectURL(new Blob([lines.join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download='dogsports-'+e.start+'.ics';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);toast('캘린더 파일을 다운로드했어요.');
}
document.addEventListener('click',async event=>{
 if(event.target.closest('#sport-trigger')){toggleSportMenu();return;}
 if(event.target.closest('[data-sport-link]'))closeSportMenu(true);else if(!event.target.closest('.sport-switch'))closeSportMenu();
 if(event.target.closest('a.skip')){event.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'});return;}
 const b=event.target.closest('button');if(!b)return;
 if(b.dataset.event)showEvent(findEvent(b.dataset.event));else if(b.dataset.seminar)showEvent(findEvent(b.dataset.seminar));else if(b.dataset.save)toggleSave(b.dataset.save);else if(b.dataset.library)showLibrary(b.dataset.library);else if(b.dataset.resource)showResource(b.dataset.resource);
 else if(b.dataset.sport){selectSport(b.dataset.sport);}
 else if(b.dataset.view){filter.view=b.dataset.view;filter.day='';render();}
 else if(b.dataset.month!==undefined){const n=Number(b.dataset.month);const d=new Date(filter.month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);filter.month=n?d.toISOString().slice(0,7):today.slice(0,7);filter.day='';renderResults();}
 else if(b.dataset.day!==undefined){filter.day=b.dataset.day;const active=filter.day;filter.day='';const list=filtered();filter.day=active;renderCalendar(list);}
 else if(b.dataset.kind){libKind=b.dataset.kind;if(!['all','course_map','result','entry_list'].includes(libKind))libCategory='all';filter.limit=40;render();}
 else if(b.id==='more'){filter.limit+=40;render();}
 else if(b.dataset.ics)downloadICS(findEvent(b.dataset.ics));
 else if(b.dataset.copy){try{await navigator.clipboard.writeText(location.origin+location.pathname+'#event='+encodeURIComponent(b.dataset.copy)+'?sport='+encodeURIComponent(filter.sport));toast('대회 링크를 복사했어요.');}catch{toast('주소창의 링크를 복사해 주세요.');}}
});
document.addEventListener('change',e=>{if(['range','area','category'].includes(e.target.id)){if(e.target.id==='category')libCategory=e.target.value;else filter[e.target.id]=e.target.value;filter.day='';filter.limit=40;render();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#sport-menu').hidden){e.preventDefault();closeSportMenu(true);}});
document.addEventListener('focusin',e=>{if(!e.target.closest('.sport-switch'))closeSportMenu();});
document.addEventListener('input',e=>{if(e.target.id!=='search')return;filter.q=e.target.value;filter.limit=40;const pos=e.target.selectionStart;if(['schedule','saved'].includes(current))renderResults();else{render();$('#search')?.focus();try{$('#search')?.setSelectionRange(pos,pos);}catch{}}});
$('#detail').addEventListener('close',()=>{activeDetail=null;updateContext();});
$('#close-detail').onclick=()=>$('#detail').close();$('#detail').addEventListener('click',e=>{if(e.target===$('#detail')){const r=$('#detail').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('#detail').close();}});
function route(){closeSportMenu();const [path,query='']=location.hash.slice(1).split('?');const requested=new URLSearchParams(query).get('sport');if(!path.startsWith('event=')&&$('#detail').open)$('#detail').close();const nextSport=Object.hasOwn(SPORTS,requested)?requested:'all';if(filter.sport!==nextSport)libCategory='all';filter.sport=nextSport;
 if(path.startsWith('event=')){let e;try{e=findEvent(decodeURIComponent(path.slice(6)));}catch{}current='schedule';if(e&&!requested&&e.sportIds.length===1)filter.sport=e.sportIds[0];render();if(e)showEvent(e);return;}
 current=pages[path]?path:'schedule';filter.q='';filter.day='';filter.limit=40;if(current==='saved'){filter.range='all';filter.area='all';filter.view='list';}render();window.scrollTo(0,0);
}
window.addEventListener('hashchange',route);
async function json(url,timeout=10000){const response=await fetch(url,{signal:AbortSignal.timeout(timeout),cache:'no-cache'});if(!response.ok)throw Error('HTTP '+response.status);return response.json();}
async function refresh(){
 $('#refresh').disabled=true;$('#sync-status').textContent='최신 일정 확인 중';
 try{const m=await json(ROOT+'/agilitykorea-manifest.json');if(!/^\/ak\/v\d+$/.test(m.basePath)||m.service!=='agilitykorea')throw Error('Invalid manifest');
  const keys=['match','seminar','clubs','venue','globalMatch','notice'];const data=await Promise.all(keys.map(k=>{if(!m.files[k]||m.files[k].includes('..'))throw Error('Invalid manifest path');return json(ROOT+m.basePath+'/'+m.files[k]);}));
  if(snapshot.manifest.dataVersion!==m.dataVersion)library=undefined;
  snapshot={manifest:m,...Object.fromEntries(keys.map((k,i)=>[k,data[i]]))};try{extra=await json('./data/dogsports.json');}catch{}normalize();render();$('#sync-status').textContent=nowKorea()+' 업데이트 확인';
 }catch{$('#sync-status').textContent='저장 데이터 · '+snapshot.manifest.dataVersion;$('#sync-status').title='최신 서버 연결에 실패해 마지막 저장 데이터를 표시합니다.';}finally{$('#refresh').disabled=false;}
}
$('#refresh').onclick=()=>{libraryError=false;refresh();};
try{[snapshot,extra]=await Promise.all([json('./data/agility-snapshot.json'),json('./data/dogsports.json')]);normalize();route();$('#sync-status').textContent='저장 데이터 · '+snapshot.manifest.dataVersion;refresh();}catch{$('#main').innerHTML=empty('일정을 불러오지 못했어요','인터넷 연결을 확인한 뒤 페이지를 새로고침해 주세요.');}
