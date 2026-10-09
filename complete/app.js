const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const icons = {
  sliders:'M4 7h16M4 17h16M8 4v6M16 14v6', scan:'M8 3H4v4M16 3h4v4M4 17v4h4M20 17v4h-4M8 12h8',
  download:'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5', refresh:'M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-2L20 8M4 16l2.3 3A7 7 0 0 0 18 17',
  layers:'m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5', star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
  clock:'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', table:'M3 4h18v16H3zM3 9h18M8 9v11M3 14h18',
  cards:'M3 4h7v7H3zM14 4h7v7h-7zM3 15h7v5H3zM14 15h7v5h-7z', chart:'M4 3v18h17M8 16v-4M13 16V7M18 16v-7',
  search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0', info:'M12 11v6M12 7h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'
};
function paintIcons(root = document) { root.querySelectorAll('[data-icon]').forEach(el => { el.outerHTML = `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="${icons[el.dataset.icon] || icons.info}"/></svg>`; }); }
const escapeHTML = text => String(text ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const fmt = n => Number(n).toLocaleString('en-US');
const niceDate = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('en-US', {month:'short',day:'numeric',year:'numeric'}) : '—';
const safeSource = value => { try { const u = new URL(value); return u.protocol === 'https:' && ['store.steampowered.com'].includes(u.hostname) ? u.href : '#'; } catch { return '#'; } };
let config, inspection = null, inspectedInput = '', dataset = null, activeTab = 'table', page = 1, jobId = null, pollTimer = null;

function message(text, type = 'success') { $('#message').textContent = text; $('#message').className = type; $('#message').hidden = !text; }
function selectedFields() { return $$('#fields input:checked').map(input => input.value); }
function updateFields() {
  $('#field-count').textContent = `${selectedFields().length} selected`;
  $('#collect').disabled = !inspection || !selectedFields().length;
}
function renderFields(fields) {
  $('#fields').innerHTML = fields.map(field => `<label class="field-option ${field.available === 0 ? 'unavailable' : ''}" title="${escapeHTML(field.type)}${inspection ? ` · Present in ${field.available} of ${inspection.sampleCount} sampled reviews. Missing fields remain empty.` : ''}"><input type="checkbox" value="${field.key}" ${field.selected && field.available !== 0 ? 'checked' : ''} ${!inspection || field.available === 0 ? 'disabled' : ''}><span><span class="field-name">${field.label}</span><small>${inspection ? `${field.available}/${inspection.sampleCount} available` : field.type}</small></span></label>`).join('');
  $$('#fields input').forEach(input => input.addEventListener('change', updateFields));
  updateFields();
}
function renderProduct(product) {
  $('#product-preview').hidden = false;
  $('#product-preview').innerHTML = `<div class="game-symbol" aria-hidden="true">▶</div><div><h3>${escapeHTML(product.name)}</h3><p>App ${escapeHTML(product.appId || '')} · ${product.total != null ? fmt(product.total) + ' matching English reviews' : 'Steam reviews'}</p></div>`;
}
function has(field) { return dataset?.options.fields.includes(field); }
function filteredRows() {
  if (!dataset) return [];
  const query = activeTab === 'cards' ? $('#search').value.trim().toLowerCase() : '', rating = $('#rating-filter').value;
  const rows = dataset.rows.filter(row => (!rating || row.recommended === (rating === 'true')) && (!query || dataset.options.fields.some(key => String(row[key] ?? '').toLowerCase().includes(query))));
  const mode = $('#sort').value;
  if (mode === 'newest' || mode === 'oldest') rows.sort((a,b) => String(a.review_date || '').localeCompare(String(b.review_date || '')) * (mode === 'newest' ? -1 : 1));
  if (mode === 'longest' || mode === 'shortest') rows.sort((a,b) => a.playtime_hours == null ? (b.playtime_hours == null ? 0 : 1) : b.playtime_hours == null ? -1 : (a.playtime_hours-b.playtime_hours)*(mode === 'longest' ? -1 : 1));
  if (mode === 'helpful') rows.sort((a,b) => (b.helpful_count ?? -1) - (a.helpful_count ?? -1));
  return rows;
}
function recommendation(value) { return value == null ? '<span class="muted">Not collected</span>' : `<span class="recommendation ${value ? 'positive' : 'negative'}">${value ? '↑ Recommended' : '↓ Not recommended'}</span>`; }
function cell(row, field) {
  const value = row[field];
  if (value == null) return '<span class="null-value">—</span>';
  if (field === 'recommended') return recommendation(value);
  if (field === 'playtime_hours') return `${fmt(value)} h`;
  if (field === 'review_date') return `<span class="cell-date">${niceDate(value)}</span>`;
  if (typeof value === 'boolean') return `<span class="bool-pill ${value ? '' : 'no'}">${value ? 'Yes' : 'No'}</span>`;
  if (field === 'title' || field === 'review_text') return `<button class="cell-link cell-${field === 'title' ? 'title' : 'text'}" data-review="${escapeHTML(row.review_id)}" title="Open full review">${escapeHTML(value)}</button>`;
  return escapeHTML(value);
}
function renderTable(rows, offset) {
  const fields = config.fields.filter(f => has(f.key));
  $('#review-table thead').innerHTML = `<tr><th>#</th>${fields.map(f => `<th scope="col">${f.label}</th>`).join('')}</tr>`;
  $('#review-table tbody').innerHTML = rows.map((row,index) => `<tr><td>${String(offset + index + 1).padStart(2,'0')}</td>${fields.map(f => `<td>${cell(row,f.key)}</td>`).join('')}</tr>`).join('');
}
function renderCards(rows) {
  $('#view-cards').innerHTML = rows.map(row => `<article class="review-card"><div class="card-top">${recommendation(row.recommended)}<span class="card-date">${has('review_date') ? niceDate(row.review_date) : ''}</span></div><h3>${row.playtime_hours != null ? `${fmt(row.playtime_hours)} hours at review` : 'Player review'}</h3><p class="card-body">${escapeHTML(row.review_text ?? 'Review text was not collected. Select it in your next collection to read the story.')}</p><div class="card-badges">${row.steam_purchase ? '<span class="bool-pill">Steam purchase</span>' : ''}${row.received_for_free ? '<span class="bool-pill no">Received free</span>' : ''}${row.early_access ? '<span class="bool-pill no">Early Access</span>' : ''}</div><div class="card-bottom"><span>${has('helpful_count') ? `${row.helpful_count ?? '—'} found helpful` : 'Player review'}</span><button class="text-button" data-review="${escapeHTML(row.review_id)}">Read review ↗</button></div></article>`).join('');
}
let insightGrouping = 'detailed', insightSelected = null;
function renderAnalysis() {
  const target = $('#view-analysis');
  if (!has('recommended') || !has('playtime_hours')) {
    target.innerHTML = '<div class="insights-example"><p class="eyebrow">ASSIGNMENT EXAMPLE</p><h3>How does recommendation vary by playtime?</h3><p>Collect Recommended and Playtime at review to explore this question.</p></div>';
    return;
  }
  const summary = ReviewInsights.summarize(dataset.rows, insightGrouping);
  const {groups,count,excluded,rate,median} = summary;
  const percent = value => value == null ? '—' : `${value.toFixed(1)}%`;
  const maxCount = Math.max(1,...groups.map(g=>g.count));
  const chosen = groups.find(g=>g.index===insightSelected && g.count);
  const comparison = groups.filter(g=>g.count>=5).sort((a,b)=>b.rate-a.rate);
  let finding = 'There are not yet two groups with at least 5 reviews. Collect more reviews before comparing groups.';
  if (comparison.length>=2) {
    const high=comparison[0],low=comparison.at(-1),gap=high.rate-low.rate;
    finding=gap===0 ? `All groups with at least 5 reviews have the same recommendation rate (${percent(high.rate)}).` : `Among groups with at least 5 reviews, ${high.label} has the highest recommendation rate (${percent(high.rate)}, n=${high.count}), compared with ${percent(low.rate)} for ${low.label} (n=${low.count}). The gap is ${gap.toFixed(1)} percentage points.`;
  }
  let detail = finding;
  if (chosen) {
    const difference=chosen.rate-rate;
    detail=`${chosen.positive} of ${chosen.count} reviews in ${chosen.label} recommend the game (${percent(chosen.rate)}). That is ${Math.abs(difference).toFixed(1)} percentage points ${difference>=0?'above':'below'} the overall rate of ${percent(rate)}.${chosen.count<5?' This group has fewer than 5 reviews; interpret it cautiously.':''}`;
  }
  const chart = metric => {
    const isRate = metric === 'rate';
    const axisMax = isRate ? 100 : Math.ceil(maxCount/10)*10;
    const title = isRate ? 'Recommendation rate' : 'Review count';
    const rows = groups.map(g=>{
      const denominator=isRate ? g.count : axisMax;
      const green=denominator ? g.positive/denominator*100 : 0,red=denominator ? g.negative/denominator*100 : 0;
      return `<button type="button" class="insight-bar ${chosen?.index===g.index?'selected':''}" data-insight-group="${g.index}" aria-pressed="${chosen?.index===g.index}" ${!g.count?'disabled':''} aria-label="${title}, ${escapeHTML(g.label)}: ${g.positive} of ${g.count} recommend, ${percent(g.rate)}"><span class="insight-group-label">${g.label}<small>n = ${g.count}${g.count>0&&g.count<5?' · small group':''}</small></span><span class="insight-track"><span class="insight-positive" style="width:${green}%"></span><span class="insight-negative" style="width:${red}%"></span></span><span class="insight-bar-value">${isRate?percent(g.rate):g.count}</span></button>`;
    }).join('');
    return `<section class="insight-chart" aria-label="${title}"><h4>${title}</h4><p class="insight-chart-note">${isRate?'Share of each group that recommends the game':'Number of reviews in each playtime group'}</p><div class="insight-axis"><span></span><div>${[0,.5,1].map(t=>`<span>${Math.round(axisMax*t)}${isRate?'%':''}</span>`).join('')}</div><span></span></div>${rows}</section>`;
  };
  target.innerHTML=`<article class="insights-example">
    <div class="insight-heading"><div><p class="eyebrow">ASSIGNMENT EXAMPLE</p><h3>How does recommendation vary by playtime?</h3></div><button type="button" class="text-button" id="insight-present">${document.body.classList.contains('insights-focus')?'Exit presentation view':'Presentation view'}</button></div>
    <p class="insight-sample">All ${summary.total} collected reviews · ${count} usable for this comparison · ${excluded} excluded</p>
    <div class="insight-summary"><span><strong>${percent(rate)}</strong> recommend</span><span><strong>${median==null?'—':median.toFixed(1)+' h'}</strong> median playtime</span><span>Playtime measured when the review was written</span></div>
    <div class="insight-controls"><div class="insight-legend"><span><i class="positive-key"></i>Recommended</span><span><i class="negative-key"></i>Not recommended</span></div><label for="insight-grouping">Playtime groups <select id="insight-grouping"><option value="detailed" ${insightGrouping==='detailed'?'selected':''}>4 groups</option><option value="broad" ${insightGrouping==='broad'?'selected':''}>2 groups</option></select></label></div>
    <div class="insight-charts">${chart('rate')}${chart('count')}</div>
    <div class="insight-detail" aria-live="polite"><strong>Analysis insight${chosen?' · '+escapeHTML(chosen.label):''}</strong><p>${escapeHTML(detail)}</p></div>
    <p class="insight-limits"><strong>Limitations.</strong> This is a recent English-review sample, not all players. Group sizes differ, and playtime alone cannot explain a recommendation. The pattern does not establish causation. ${excluded} reviews lack a valid recommendation or non-negative playtime and are excluded. Playtime is rounded to 0.1 hour.</p>
  </article>`;
}

function render() {
  const exists = Boolean(dataset);
  $('#empty').hidden = exists;
  $('#toolbar').hidden = !exists || !dataset.rows.length || activeTab === 'analysis';
  $('#review-search').hidden = activeTab !== 'cards';
  $('#toolbar').classList.toggle('explorer-toolbar',activeTab === 'cards');
  $('#dataset-meta').hidden = !exists;
  $('#export').disabled = !exists || !dataset.rows.length;
  if (!exists) return;
  const rows = filteredRows(), size = activeTab === 'cards' ? 6 : 10, pages = Math.max(1, Math.ceil(rows.length / size));
  page = Math.min(page,pages);
  const when = new Date(dataset.collectedAt);
  const collectedLabel = when.toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  const reasonLabels = {demo:'Saved sample',limit:'Review limit reached',exhausted:'End of matching reviews',partial:'Partial collection',cancelled:'Stopped by you',error:'Collection failed'};
  const range = dataset.options.start || dataset.options.end ? `${dataset.options.start || 'Any date'} → ${dataset.options.end || 'Today'}` : 'All dates';
  $('#dataset-meta').innerHTML = `<div class="dataset-title-row"><h3>${escapeHTML(dataset.product?.name || 'Collected reviews')}</h3><span class="dataset-count">${fmt(dataset.rows.length)} reviews</span><a href="${escapeHTML(safeSource(dataset.product?.sourceUrl || dataset.options.url))}" target="_blank" rel="noopener">View source ↗</a></div><p class="dataset-scope"><span class="dot"></span>${reasonLabels[dataset.reason] || 'Collected'} · ${escapeHTML(range)}</p><p class="dataset-collected">Sample collected <time datetime="${escapeHTML(dataset.collectedAt)}" title="${escapeHTML(when.toString())}">${escapeHTML(collectedLabel)}</time> · ${dataset.options.fields.length} fields</p>`;
  ['table','cards','analysis'].forEach(tab => { $(`#view-${tab}`).hidden = tab !== activeTab || (!rows.length && activeTab !== 'analysis'); });
  $('#no-matches').hidden = rows.length > 0 || activeTab === 'analysis';
  $('#no-matches h3').textContent = dataset.rows.length ? 'No reviews match these filters.' : 'No reviews in the selected date range.';
  $('#no-matches p').textContent = dataset.rows.length ? (activeTab === 'cards' ? 'Try another keyword or recommendation.' : 'Try another recommendation filter.') : 'Change the collection dates, then run again.';
  $('#clear-filters').hidden = !dataset.rows.length;
  $('#table-footer').hidden = !rows.length || activeTab === 'analysis';
  const offset = (page-1)*size, current = rows.slice(offset,offset+size);
  if (activeTab === 'table') renderTable(current,offset);
  if (activeTab === 'cards') renderCards(current);
  if (activeTab === 'analysis') renderAnalysis(rows);
  $('#showing').textContent = `Showing ${offset+1}–${Math.min(offset+size,rows.length)} of ${fmt(rows.length)}${rows.length !== dataset.rows.length ? ` · ${dataset.rows.length} collected` : ' reviews'}`;
  $('#page-number').textContent = `${page} / ${pages}`;
  $('#prev-page').disabled = page <= 1; $('#next-page').disabled = page >= pages;
}
function loadDataset(result) {
  dataset = result; page = 1; insightSelected = null;
  $('#search').value = ''; $('#rating-filter').value = '';
  $('#rating-filter').disabled = !has('recommended');
  $$('#sort option').forEach(option => { option.disabled = ['newest','oldest'].includes(option.value) ? !has('review_date') : option.value === 'helpful' ? !has('helpful_count') : !has('playtime_hours'); });
  const available = $$('#sort option').find(option=>!option.disabled);
  $('#sort').disabled = !available;
  $('#sort').value = available?.value || 'newest';
  render();
}
function openReview(id) {
  const row=dataset?.rows.find(item=>item.review_id===id); if (!row) return;
  $('#dialog-content').innerHTML = `${recommendation(row.recommended)}<h2 class="dialog-title">Player review</h2><p class="dialog-meta">${has('review_date') ? niceDate(row.review_date)+' · UTC' : ''}${row.playtime_hours != null ? ' · '+fmt(row.playtime_hours)+' hours at review' : ''}</p><p class="dialog-text">${escapeHTML(row.review_text ?? 'Review text was not selected for this collection.')}</p><div class="card-badges" style="margin-top:20px">${row.steam_purchase ? '<span class="bool-pill">Steam purchase</span>' : ''}${row.received_for_free ? '<span class="bool-pill no">Received free</span>' : ''}${row.early_access ? '<span class="bool-pill no">Early Access</span>' : ''}</div><div class="dialog-foot">Review ID ${escapeHTML(row.review_id)} · <a href="${escapeHTML(safeSource(row.source_url))}" target="_blank" rel="noopener">Steam game ↗</a></div>`;
  $('#review-dialog').showModal();
}

paintIcons();
$$('[data-tab]').forEach(button=>button.addEventListener('click',()=> { activeTab = button.dataset.tab; page = 1; $$('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b===button))); render(); }));
['#search','#rating-filter','#sort'].forEach(s=>$(s).addEventListener(s === '#search' ? 'input' : 'change',()=> {page=1;render();}));
$('#clear-filters').addEventListener('click',()=>{$('#search').value='';$('#rating-filter').value='';page=1;render();});
$('#prev-page').addEventListener('click',()=>{page--;render();}); $('#next-page').addEventListener('click',()=>{page++;render();});
$('#export').addEventListener('click',exportSample);
document.addEventListener('click',event=> {const button=event.target.closest('[data-review]');if(button)openReview(button.dataset.review);const bar=event.target.closest('[data-recommendation]');if(bar){$('#rating-filter').value=bar.dataset.recommendation;page=1;render();}});
$('#close-dialog').addEventListener('click',()=>$('#review-dialog').close());
$('#review-dialog').addEventListener('click',event=>{if(event.target===$('#review-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});


$('#view-analysis').addEventListener('click', event => {
  const group = event.target.closest('[data-insight-group]');
  if (group) { const value=Number(group.dataset.insightGroup); insightSelected=insightSelected===value ? null : value; renderAnalysis(); }
  if (event.target.closest('#insight-present')) { document.body.classList.toggle('insights-focus'); renderAnalysis(); }
});
$('#view-analysis').addEventListener('change', event => {
  if (event.target.id==='insight-grouping') { insightGrouping=event.target.value; insightSelected=null; renderAnalysis(); }
});
$$('[data-tab]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.tab!=='analysis')document.body.classList.remove('insights-focus');}));

const isStarter=false;
let savedSample;
async function readJSON(file){const response=await fetch(file);if(!response.ok)throw new Error('Preview data could not be loaded.');return response.json();}
function showSample(){
 $('#product-url').value=savedSample.options.url;
 if(!isStarter){$('#start-date').value=savedSample.options.start||'';$('#end-date').value=savedSample.options.end||'';$('#review-limit').value=String(savedSample.options.limit);$$('[data-days]').forEach(b=>b.classList.remove('active'));}
 renderFields(config.fields.map(f=>({...f,selected:savedSample.options.fields.includes(f.key)})));
 renderProduct(savedSample.product);loadDataset(savedSample);
 if(isStarter){$('#demo-load').textContent='Reset to starting screen';message('Showing 20 saved reviews with the three provided fields.');}
}
function exportSample(){
 if(!dataset)return;
 const keys=['review_id',...dataset.options.fields,'source_url','collected_at'];
 const csvCell=value=>{let s=String(value??'');if(/^[\s\u0000-\u001f]*[=+@-]/.test(s)||/^[\t\r\n]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const csv='\uFEFF'+[keys.map(csvCell).join(','),...dataset.rows.map(row=>keys.map(k=>csvCell(row[k])).join(','))].join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='review-lab-saved-sample.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function boot(){
 try{
  [config,savedSample]=await Promise.all([readJSON('./config.json'),readJSON('./sample.json')]);
  renderFields(config.fields);render();
  if(isStarter){
   applyLabControls();$('#demo-load').disabled=false;
   $('#demo-load').addEventListener('click',()=>{
    if(!dataset){showSample();return;}
    dataset=null;page=1;activeTab='table';$$('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab==='table')));
    $('#product-url').value='';$('#product-preview').hidden=true;$('#demo-load').textContent='Load 20 sample reviews';message('');render();
   });
  }else showSample();
 }catch(error){message('The preview could not load its saved data. Reload this page to try again.','error');}
}
boot();
