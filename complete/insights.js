(function(root) {
  function summarize(rows, grouping = 'detailed') {
    const bins = grouping === 'broad' ? [[0,20,'Under 20 h'],[20,Infinity,'20+ h']] : [[0,5,'Under 5 h'],[5,20,'5–<20 h'],[20,100,'20–<100 h'],[100,Infinity,'100+ h']];
    const valid = rows.filter(r => Number.isFinite(r.playtime_hours) && r.playtime_hours >= 0 && typeof r.recommended === 'boolean');
    const groups = bins.map(([min,max,label],index) => {
      const members = valid.filter(r => r.playtime_hours >= min && r.playtime_hours < max);
      const positive = members.filter(r => r.recommended).length;
      return {index,label,count:members.length,positive,negative:members.length-positive,rate:members.length ? positive/members.length*100 : null};
    });
    const hours = valid.map(r=>r.playtime_hours).sort((a,b)=>a-b), n=hours.length;
    const median = n ? (hours[Math.floor((n-1)/2)]+hours[Math.floor(n/2)])/2 : null;
    const positive = valid.filter(r=>r.recommended).length;
    return {groups,total:rows.length,count:n,excluded:rows.length-n,positive,rate:n ? positive/n*100 : null,median};
  }
  const api={summarize};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.ReviewInsights=api;
})(globalThis);
