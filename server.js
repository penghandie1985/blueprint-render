const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

function callAnthropic(profile, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      system: "You are a retirement relocation research specialist. Return ONLY a valid JSON object. No markdown, no code fences, no text before or after — just the raw JSON. The JSON must have a 'sections' array where each item has 'title' and 'content' keys. Write detailed, warm, specific content. Use 'people in similar situations typically...' language. Always refer to licensed professionals for personalized advice. Educational content only — not financial advice.",
      messages: [{ role: "user", content: "Create a Retirement Relocation Blueprint for: " + profile.firstName + ", age " + profile.age + ", from " + profile.location + ", retiring in " + profile.timeline + ", home " + profile.homeOwner + " worth " + profile.homeValue + ", income " + profile.income + ", savings: " + profile.savings + ", priority: " + profile.priority + ", concern: " + profile.concern + ", destination: " + profile.destination + ", lifestyle: " + profile.lifestyle + ", proximity: " + profile.proximity + ", rent first: " + profile.rentFirst + ".\n\nReturn ONLY valid JSON in this exact format:\n{\"sections\":[{\"title\":\"Section Name\",\"content\":\"Content here\"}]}\n\nInclude exactly these 12 sections with 2-3 paragraphs each (keep each content field under 900 characters):\n1. Your Retirement Relocation Snapshot\n2. The Cost of Staying vs. The Opportunity of Moving\n3. Your Top 3 Destination Matches\n4. How Social Security Works\n5. Your Retirement Budget - Three Scenarios\n6. Your Home Transition - Three Paths\n7. Legal and Tax Considerations\n8. Weather Climate and Natural Disaster Preparedness - include specific info about hurricane season in Florida (June-November, impact windows, hip roofs, concrete block, flood zones, windstorm insurance), storms in the Carolinas (nor'easters, ice storms, occasional hurricanes, newer construction with hurricane straps), tornadoes and ice in Tennessee, how to read FEMA flood maps, what an elevation certificate is, and why insurance costs vary by zip code\n9. Understanding the Cultural Shift - include pace of life differences (South is slower, more relaxed), genuine friendliness and small talk norms, political and social culture differences (more conservative overall, church more central, but Charlotte/Raleigh/Tampa are more mixed), food culture changes, college football culture in Carolinas and Tennessee, the large Northeast transplant communities already in FL and the Carolinas, and driving culture differences\n10. Your Action Plan\n11. Questions to Ask Your Professionals\n12. Educational Disclaimer\n\nIMPORTANT: Keep each content field concise. The entire JSON response must be complete and valid." }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Anthropic response parse error: ' + data.substring(0, 100))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

const IMAGES = {
  cover_florida:   'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80',
  cover_carolinas: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80',
  cover_tennessee: 'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=1200&q=80',
  cover_default:   'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200&q=80',
  couple1:         'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&q=80',
  couple2:         'https://images.unsplash.com/photo-1559181567-c3190ca9959b?w=800&q=80',
  planning:        'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80',
  neighborhood:    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80',
  golf:            'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800&q=80'
};

function getCoverImage(destination) {
  if (!destination) return IMAGES.cover_default;
  const d = destination.toLowerCase();
  if (d.includes('florida')) return IMAGES.cover_florida;
  if (d.includes('carolina')) return IMAGES.cover_carolinas;
  if (d.includes('tennessee')) return IMAGES.cover_tennessee;
  return IMAGES.cover_default;
}

function formatContent(content) {
  if (!content) return '<p>Content unavailable.</p>';
  const paras = content.split(/\n\n+/).filter(p => p.trim());
  return (paras.length ? paras : [content]).map(p =>
    '<p>' + p.trim()
      .replace(/Scenario (A|B|C|One|Two|Three)[:\s]/g, '<strong class="scenario-label">Scenario $1:</strong> ')
      .replace(/Path (One|Two|Three|A|B|C)[:\s]/g, '<strong class="scenario-label">Path $1:</strong> ') + '</p>'
  ).join('\n');
}

// Returns first 2 sentences of content for teaser
function teaserContent(content) {
  if (!content) return '';
  const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
  return sentences.slice(0, 2).join(' ').trim();
}

function generateHTML(profile, sections, dest) {
  const today = new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'});
  const coverImg = getCoverImage(profile.destination);

  // First 3 sections are FREE, rest are LOCKED
  const FREE_SECTIONS = 3;
  const icons = ['👤','💰','📍','💼','📊','🏠','⚖️','🌪️','🤝','📋','❓','📌'];
  const sectionImages = { 0: IMAGES.couple1, 2: coverImg, 4: IMAGES.planning, 5: IMAGES.neighborhood, 7: IMAGES.couple2 };

  const sectionsHTML = sections.map((sec, i) => {
    const isFree = i < FREE_SECTIONS;
    const img = sectionImages[i] ? `<img src="${sectionImages[i]}" class="section-img" alt=""/>` : '';

    if (isFree) {
      return `
      <div class="section">
        <div class="section-header">
          <span class="section-icon">${icons[i] || '📄'}</span>
          <h2>${sec.title}</h2>
          <span class="free-badge">FREE</span>
        </div>
        ${img}
        <div class="section-content">${formatContent(sec.content)}</div>
      </div>`;
    } else {
      const teaser = teaserContent(sec.content);
      return `
      <div class="section section-locked">
        <div class="section-header">
          <span class="section-icon">${icons[i] || '📄'}</span>
          <h2>${sec.title}</h2>
          <span class="locked-badge">🔒 LOCKED</span>
        </div>
        <div class="section-content">
          <p class="teaser-text">${teaser}</p>
          <div class="blur-overlay">
            <div class="blur-content">${formatContent(sec.content)}</div>
            <div class="lock-screen">
              <div class="lock-icon">🔒</div>
              <div class="lock-title">This section is included in the Full Blueprint</div>
              <div class="lock-desc">Unlock all 9 remaining sections including Weather Preparedness, Cultural Differences, your personalized Action Plan, and more.</div>
              <a href="https://buy.stripe.com/cNibJ2f8yat49vd7mC5sA00" class="unlock-btn">Unlock Full Blueprint — $49</a><div style="margin-top:10px;font-size:12px;color:#888;">One-time payment only · No subscription · No hidden fees</div>
              <div class="lock-guarantee">✅ Instant delivery &nbsp;·&nbsp; ✅ 30-day money-back guarantee &nbsp;·&nbsp; ✅ Educational use only</div>
            </div>
          </div>
        </div>
      </div>`;
    }
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Your Retirement Relocation Blueprint — ${profile.firstName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Inter:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Georgia, sans-serif; color: #1a2a3a; background: #f8fafb; }

  /* COVER */
  .cover { position: relative; min-height: 100vh; display: flex; flex-direction: column; justify-content: flex-end; padding: 60px 56px; overflow: hidden; }
  .cover-bg { position: absolute; inset: 0; z-index: 0; background-image: url('${coverImg}'); background-size: cover; background-position: center; }
  .cover-overlay { position: absolute; inset: 0; z-index: 1; background: linear-gradient(160deg, rgba(15,32,39,0.88) 0%, rgba(44,83,100,0.78) 100%); }
  .cover-content { position: relative; z-index: 2; color: white; }
  .cover-eyebrow { font-size: 12px; letter-spacing: 3px; color: #f7b733; font-weight: 700; text-transform: uppercase; margin-bottom: 20px; }
  .cover h1 { font-family: 'Playfair Display', serif; font-size: 48px; font-weight: 900; line-height: 1.15; margin-bottom: 16px; }
  .cover h1 span { color: #f7b733; }
  .cover-sub { font-size: 17px; color: rgba(255,255,255,0.8); line-height: 1.6; margin-bottom: 40px; max-width: 520px; }
  .cover-meta { display: flex; flex-wrap: wrap; gap: 28px; margin-bottom: 36px; }
  .meta-label { font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 5px; }
  .meta-value { font-size: 15px; color: white; font-weight: 600; }
  .cover-divider { height: 1px; background: rgba(255,255,255,0.2); margin-bottom: 32px; }
  .cover-stats { display: flex; gap: 40px; flex-wrap: wrap; }
  .stat-val { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 700; color: #f7b733; }
  .stat-lbl { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 4px; }
  .cover-footer { position: relative; z-index: 2; margin-top: 48px; font-size: 11px; color: rgba(255,255,255,0.4); border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px; }

  /* FREE PREVIEW BANNER */
  .preview-banner { background: linear-gradient(135deg, #0f2027, #2c5364); color: white; padding: 24px 56px; text-align: center; }
  .preview-banner h3 { font-family: 'Playfair Display', serif; font-size: 22px; color: #f7b733; margin-bottom: 8px; }
  .preview-banner p { font-size: 14px; color: rgba(255,255,255,0.8); line-height: 1.6; }
  .preview-banner .preview-cta { display: inline-block; margin-top: 16px; background: #f7b733; color: #0f2027; font-weight: 700; font-size: 15px; padding: 12px 32px; border-radius: 50px; text-decoration: none; }

  /* TOC */
  .toc-page { background: white; padding: 56px; border-bottom: 2px solid #f0f0f0; }
  .toc-eyebrow { font-size: 11px; letter-spacing: 3px; color: #2c5364; font-weight: 700; text-transform: uppercase; margin-bottom: 12px; }
  .toc-page h2 { font-family: 'Playfair Display', serif; font-size: 32px; color: #1a2a3a; margin-bottom: 8px; font-weight: 900; }
  .toc-sub { font-size: 14px; color: #777; margin-bottom: 32px; }
  .toc-item { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid #f5f5f5; }
  .toc-num { width: 30px; height: 30px; background: linear-gradient(135deg, #2c5364, #0f2027); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }
  .toc-num.locked { background: linear-gradient(135deg, #ccc, #999); }
  .toc-title { font-size: 14px; color: #333; font-weight: 500; flex: 1; }
  .toc-status { font-size: 12px; font-weight: 700; }
  .toc-status.free { color: #27ae60; }
  .toc-status.locked { color: #e74c3c; }

  /* PHOTO STRIP */
  .img-strip { display: flex; gap: 10px; margin: 32px 56px; height: 160px; border-radius: 14px; overflow: hidden; }
  .img-strip img { flex: 1; object-fit: cover; width: 33%; }

  /* CONTENT */
  .content { padding: 0 56px 56px; background: white; margin: 0 0 40px; }
  .section { padding: 40px 0; border-bottom: 2px solid #f5f5f5; }
  .section:last-child { border-bottom: none; }
  .section-header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #e8f4f8; flex-wrap: wrap; }
  .section-icon { font-size: 30px; flex-shrink: 0; }
  .section-header h2 { font-family: 'Playfair Display', serif; font-size: 24px; color: #1a2a3a; font-weight: 700; line-height: 1.2; flex: 1; }
  .free-badge { background: #e8f8f0; color: #27ae60; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; letter-spacing: 1px; text-transform: uppercase; }
  .locked-badge { background: #fef0f0; color: #e74c3c; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; letter-spacing: 1px; text-transform: uppercase; }
  .section-img { width: 100%; height: 200px; object-fit: cover; border-radius: 12px; margin-bottom: 20px; }
  .section-content p { font-size: 15px; line-height: 1.95; color: #2c3e50; margin-bottom: 14px; }
  .section-content p:last-child { margin-bottom: 0; }
  .scenario-label { color: #2c5364; font-weight: 700; }

  /* LOCKED SECTION */
  .section-locked .section-header h2 { color: #999; }
  .teaser-text { font-size: 15px; line-height: 1.9; color: #2c3e50; margin-bottom: 16px; }
  .blur-overlay { position: relative; border-radius: 12px; overflow: hidden; }
  .blur-content { filter: blur(6px); user-select: none; pointer-events: none; max-height: 200px; overflow: hidden; padding: 20px; background: #f8fafb; font-size: 15px; line-height: 1.9; color: #2c3e50; }
  .lock-screen { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(248,250,251,0.3) 0%, rgba(248,250,251,0.97) 40%); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; text-align: center; }
  .lock-icon { font-size: 36px; margin-bottom: 12px; }
  .lock-title { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 700; color: #1a2a3a; margin-bottom: 10px; }
  .lock-desc { font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 20px; max-width: 420px; }
  .unlock-btn { display: inline-block; background: linear-gradient(135deg, #f7b733, #e6a020); color: #0f2027; font-weight: 700; font-size: 17px; padding: 16px 40px; border-radius: 50px; text-decoration: none; box-shadow: 0 4px 20px rgba(247,183,51,0.4); transition: transform 0.2s; }
  .unlock-btn:hover { transform: translateY(-2px); }
  .lock-guarantee { font-size: 12px; color: #888; margin-top: 14px; line-height: 1.8; }

  /* UPGRADE STRIP */
  .upgrade-strip { background: linear-gradient(135deg, #0f2027, #2c5364); margin: 0 0 0; padding: 48px 56px; text-align: center; }
  .upgrade-strip h3 { font-family: 'Playfair Display', serif; font-size: 30px; color: white; margin-bottom: 12px; }
  .upgrade-strip p { font-size: 16px; color: rgba(255,255,255,0.8); margin-bottom: 8px; line-height: 1.7; max-width: 560px; margin-left: auto; margin-right: auto; }
  .upgrade-features { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin: 24px 0; }
  .upgrade-feature { background: rgba(255,255,255,0.1); color: white; font-size: 13px; padding: 8px 16px; border-radius: 20px; }
  .upgrade-price { font-family: 'Playfair Display', serif; font-size: 48px; color: #f7b733; font-weight: 900; margin: 16px 0 4px; }
  .upgrade-price-sub { font-size: 14px; color: rgba(255,255,255,0.6); margin-bottom: 24px; }
  .upgrade-btn { display: inline-block; background: #f7b733; color: #0f2027; font-weight: 700; font-size: 18px; padding: 18px 56px; border-radius: 50px; text-decoration: none; box-shadow: 0 4px 24px rgba(247,183,51,0.5); }
  .upgrade-guarantee { font-size: 13px; color: rgba(255,255,255,0.5); margin-top: 16px; }

  /* FOOTER */
  .report-footer { background: #0f2027; color: rgba(255,255,255,0.7); padding: 32px 56px; }
  .footer-brand { font-family: 'Playfair Display', serif; font-size: 20px; color: #f7b733; font-weight: 700; margin-bottom: 12px; }
  .footer-disc { font-size: 11px; line-height: 1.8; }

  @media (max-width: 600px) {
    .cover { padding: 40px 24px; }
    .cover h1 { font-size: 32px; }
    .toc-page, .content, .preview-banner, .upgrade-strip, .report-footer { padding-left: 24px; padding-right: 24px; }
    .img-strip { margin: 24px; height: 120px; }
    .upgrade-price { font-size: 36px; }
  }
  @media print {
    .lock-screen, .blur-overlay, .upgrade-strip, .preview-banner { display: none; }
    .section { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- COVER -->
<div class="cover">
  <div class="cover-bg"></div>
  <div class="cover-overlay"></div>
  <div class="cover-content">
    <div class="cover-eyebrow">🗺️ Retirement Relocation Blueprint</div>
    <h1>Prepared for<br/><span>${profile.firstName}</span></h1>
    <p class="cover-sub">Your personalized educational guide to retiring from the Northeast — researched, organized, and written in plain English.</p>
    <div class="cover-meta">
      <div><div class="meta-label">Prepared For</div><div class="meta-value">${profile.firstName}</div></div>
      <div><div class="meta-label">Current Location</div><div class="meta-value">${profile.location}</div></div>
      <div><div class="meta-label">Top Destination</div><div class="meta-value">${dest.name} ${dest.emoji}</div></div>
      <div><div class="meta-label">Date Prepared</div><div class="meta-value">${today}</div></div>
    </div>
    <div class="cover-divider"></div>
    <div class="cover-stats">
      <div><div class="stat-val">${dest.savings}</div><div class="stat-lbl">Est. monthly savings</div></div>
      <div><div class="stat-val">${dest.tax}</div><div class="stat-lbl">Potential tax savings/yr</div></div>
      <div><div class="stat-val">${dest.cities}</div><div class="stat-lbl">Top cities to explore</div></div>
    </div>
  </div>
  <div class="cover-footer">Educational purposes only. Not personalized financial, legal, or investment advice. Prepared ${today}.</div>
</div>

<!-- FREE PREVIEW BANNER -->
<div class="preview-banner">
  <h3>🎁 You're viewing your FREE Preview Blueprint</h3>
  <p>Your report includes <strong>12 personalized sections</strong>. The first 3 are yours free.<br/>Unlock all 9 remaining sections — including Weather Preparedness, Cultural Differences, your Budget Scenarios, and your full Action Plan.</p>
  <a href="https://buy.stripe.com/cNibJ2f8yat49vd7mC5sA00" class="preview-cta">Unlock Full Blueprint — $49 →</a><div style="margin-top:10px;font-size:13px;color:rgba(255,255,255,0.7);">✅ One-time payment only &nbsp;·&nbsp; No subscription &nbsp;·&nbsp; No hidden fees</div>
</div>

<!-- TABLE OF CONTENTS -->
<div class="toc-page">
  <div class="toc-eyebrow">Inside Your Report</div>
  <h2>What's In Your Blueprint</h2>
  <p class="toc-sub">12 sections written specifically for ${profile.firstName} — 3 free, 9 unlocked with your full Blueprint.</p>
  ${sections.map((s,i) => `
  <div class="toc-item">
    <div class="toc-num ${i >= FREE_SECTIONS ? 'locked' : ''}">${i+1}</div>
    <div class="toc-title">${s.title}</div>
    <div class="toc-status ${i < FREE_SECTIONS ? 'free' : 'locked'}">${i < FREE_SECTIONS ? '✓ Free' : '🔒 Locked'}</div>
  </div>`).join('')}
</div>

<!-- PHOTO STRIP -->
<div class="img-strip">
  <img src="${IMAGES.couple1}" alt="Retired couple"/>
  <img src="${coverImg}" alt="Destination scenery"/>
  <img src="${IMAGES.golf}" alt="Active retirement"/>
</div>

<!-- MAIN CONTENT -->
<div class="content">
  ${sectionsHTML}
</div>

<!-- UPGRADE CTA STRIP -->
<div class="upgrade-strip">
  <h3>Unlock Your Complete Blueprint</h3>
  <p>You've seen what's possible. Your full report includes 9 more sections of personalized research — everything you need to make a confident, informed decision about your retirement move.</p>
  <div class="upgrade-features">
    <div class="upgrade-feature">💼 Social Security Strategy</div>
    <div class="upgrade-feature">📊 3 Budget Scenarios</div>
    <div class="upgrade-feature">🏠 Home Transition Paths</div>
    <div class="upgrade-feature">⚖️ Legal & Tax Guide</div>
    <div class="upgrade-feature">🌪️ Weather Preparedness</div>
    <div class="upgrade-feature">🤝 Cultural Differences</div>
    <div class="upgrade-feature">📋 Your Action Plan</div>
    <div class="upgrade-feature">❓ Questions for Professionals</div>
  </div>
  <div class="upgrade-price">$49</div>
  <div class="upgrade-price-sub">One-time payment only &nbsp;·&nbsp; No subscription &nbsp;·&nbsp; No hidden fees</div>
  <a href="https://buy.stripe.com/cNibJ2f8yat49vd7mC5sA00" class="upgrade-btn">Unlock My Full Blueprint →</a>
  <div class="upgrade-guarantee">✅ One-time payment · No subscription · No hidden fees &nbsp;·&nbsp; ✅ Instant delivery &nbsp;·&nbsp; ✅ 30-day money-back guarantee</div>
</div>

<!-- FOOTER -->
<div class="report-footer">
  <div class="footer-brand">Retirement Relocation Blueprint</div>
  <div class="footer-disc">
    <strong>Educational Disclaimer:</strong> This blueprint is generated for general educational and informational purposes only using publicly available data. It does not constitute personalized financial, investment, tax, legal, or retirement planning advice. All figures shown are general illustrations and estimates — they do not reflect any individual's specific financial situation. This platform is not a registered investment adviser. Always consult a licensed financial planner, CPA, real estate attorney, and other qualified professionals before making any major financial or life decisions. © ${new Date().getFullYear()} Retirement Relocation Blueprint. All rights reserved.
  </div>
</div>

</body>
</html>`;
}

// FREE_SECTIONS constant referenced in template literal
const FREE_SECTIONS = 3;

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html' || req.url.startsWith('/?'))) {
    try {
      const file = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200); res.end(file);
    } catch(e) { res.writeHead(500); res.end('Could not load index.html: ' + e.message); }
    return;
  }

  if (req.method === 'POST' && req.url === '/generate') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const { profile } = JSON.parse(body);
        const apiKey = process.env.ANTHROPIC_API_KEY;
        if (!apiKey) { res.writeHead(500); res.end(JSON.stringify({ error: 'API key not configured.' })); return; }

        const data = await callAnthropic(profile, apiKey);
        if (data.error) { res.writeHead(400); res.end(JSON.stringify({ error: data.error.message })); return; }

        const rawText = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text.trim() : '';
        if (!rawText) { res.writeHead(500); res.end(JSON.stringify({ error: 'No content returned from AI.' })); return; }

        let sections;
        try {
          const cleaned = rawText.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
          const parsed = JSON.parse(cleaned);
          sections = parsed.sections;
          if (!sections || !Array.isArray(sections) || sections.length === 0) throw new Error('No sections');
        } catch(e) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'JSON parse failed. Stop reason: ' + (data.stop_reason || 'unknown') + '. Length: ' + rawText.length + '. Preview: ' + rawText.substring(0, 200) }));
          return;
        }

        const DEST = {
          "Florida": {emoji:"🌴",name:"Florida",cities:"Tampa, Sarasota, or Jacksonville",savings:"$2,800–$3,900/mo",tax:"$8,000–$22,000/yr"},
          "The Carolinas": {emoji:"🌄",name:"The Carolinas",cities:"Charlotte, Raleigh, or Asheville",savings:"$1,800–$2,800/mo",tax:"$5,000–$15,000/yr"},
          "Tennessee": {emoji:"🎸",name:"Tennessee",cities:"Nashville, Chattanooga, or Knoxville",savings:"$2,000–$3,200/mo",tax:"$7,000–$18,000/yr"},
          "Delaware": {emoji:"🦅",name:"Delaware",cities:"Rehoboth Beach or Wilmington",savings:"$1,200–$2,200/mo",tax:"$4,000–$12,000/yr"},
          "Texas": {emoji:"⭐",name:"Texas",cities:"Austin, San Antonio, or The Woodlands",savings:"$1,800–$3,000/mo",tax:"$6,000–$16,000/yr"},
          "Arizona": {emoji:"🌵",name:"Arizona",cities:"Scottsdale, Tucson, or Sedona",savings:"$1,500–$2,800/mo",tax:"$5,000–$14,000/yr"}
        };
        const dest = DEST[profile.destination] || {emoji:"🌞",name:profile.destination||"Your Destination",cities:"Top retirement cities",savings:"$1,500–$3,500/mo",tax:"$5,000–$18,000/yr"};

        const pdfHTML = generateHTML(profile, sections, dest);
        res.writeHead(200);
        res.end(JSON.stringify({ pdfHTML, sections }));

      } catch(err) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
}).listen(PORT, () => console.log('Server running on port ' + PORT));
