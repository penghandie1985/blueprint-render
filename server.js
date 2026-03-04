const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

function callAnthropic(profile, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: "You are a retirement relocation research specialist. Return ONLY a valid JSON object with no markdown, no code fences, no extra text before or after. The JSON must have a 'sections' array where each item has 'title' (string) and 'content' (string). Content should be detailed paragraphs separated by actual newline characters. Be thorough, warm, and specific. 2000-2500 words total across all sections. Educational only, not financial advice. Use 'people in similar situations typically...' language. Always refer to licensed professionals.",
      messages: [{ role: "user", content: "Create a Retirement Relocation Blueprint for: " + profile.firstName + ", age " + profile.age + ", from " + profile.location + ", retiring in " + profile.timeline + ", home " + profile.homeOwner + " worth " + profile.homeValue + ", income " + profile.income + ", savings: " + profile.savings + ", priority: " + profile.priority + ", concern: " + profile.concern + ", destination: " + profile.destination + ", lifestyle: " + profile.lifestyle + ", proximity: " + profile.proximity + ", rent first: " + profile.rentFirst + ".\n\nReturn ONLY this JSON structure with no other text:\n{\"sections\":[{\"title\":\"Section Name\",\"content\":\"Full detailed content here\"},{...}]}\n\nInclude exactly these 10 sections:\n1. Your Retirement Relocation Snapshot\n2. The Cost of Staying vs. The Opportunity of Moving\n3. Your Top 3 Destination Matches\n4. How Social Security Works — Key Considerations\n5. Thinking About Your Retirement Budget — Three Scenarios\n6. Your Home Transition — Three Paths\n7. Legal and Tax Considerations When Moving States\n8. Your Action Plan — 90 Days, 6 Months, 1 Year\n9. Questions to Ask Your Professionals\n10. Educational Disclaimer" }]
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
        catch(e) { reject(new Error('Invalid JSON from Anthropic: ' + data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Unsplash source images - free, no API key, reliable
const IMAGES = {
  cover_florida:    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80',
  cover_carolinas:  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80',
  cover_tennessee:  'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=1200&q=80',
  cover_default:    'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200&q=80',
  couple1:          'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&q=80',
  couple2:          'https://images.unsplash.com/photo-1559181567-c3190ca9959b?w=800&q=80',
  beach:            'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
  mountains:        'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
  city:             'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800&q=80',
  planning:         'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80',
  neighborhood:     'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80',
  golf:             'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800&q=80'
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
  if (!content) return '';
  // Split into paragraphs
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
  return paragraphs.map(p => {
    const text = p.trim()
      .replace(/Scenario (A|B|C|One|Two|Three|1|2|3)[:\s]/g, '<strong class="scenario-label">Scenario $1:</strong> ')
      .replace(/Path (One|Two|Three|A|B|C|1|2|3)[:\s]/g, '<strong class="scenario-label">Path $1:</strong> ');
    return '<p>' + text + '</p>';
  }).join('\n');
}

function generatePDFHTML(profile, sections, dest) {
  const today = new Date().toLocaleDateString('en-US', {year:'numeric', month:'long', day:'numeric'});
  const coverImg = getCoverImage(profile.destination);
  const sectionIcons = ['👤','💰','📍','💼','📊','🏠','⚖️','📋','❓','📌'];

  // Assign images to certain sections
  const sectionImages = {
    0: IMAGES.couple1,
    2: getCoverImage(profile.destination),
    4: IMAGES.planning,
    5: IMAGES.neighborhood,
    7: IMAGES.couple2
  };

  let sectionsHTML = sections.map((sec, i) => {
    const img = sectionImages[i] ? `<img src="${sectionImages[i]}" class="section-img" alt=""/>` : '';
    return `
    <div class="section">
      <div class="section-header">
        <span class="section-icon">${sectionIcons[i] || '📄'}</span>
        <h2>${sec.title}</h2>
      </div>
      ${img}
      <div class="section-content">${formatContent(sec.content)}</div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Inter:wght@300;400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', Georgia, sans-serif; color: #1a2a3a; background: white; }

  /* COVER */
  .cover {
    position: relative; min-height: 100vh;
    display: flex; flex-direction: column; justify-content: flex-end;
    padding: 60px 56px; overflow: hidden; page-break-after: always;
  }
  .cover-bg {
    position: absolute; inset: 0; z-index: 0;
    background-image: url('${coverImg}');
    background-size: cover; background-position: center;
  }
  .cover-overlay {
    position: absolute; inset: 0; z-index: 1;
    background: linear-gradient(160deg, rgba(15,32,39,0.85) 0%, rgba(44,83,100,0.75) 100%);
  }
  .cover-content { position: relative; z-index: 2; color: white; }
  .cover-eyebrow { font-size: 12px; letter-spacing: 3px; color: #f7b733; font-weight: 700; text-transform: uppercase; margin-bottom: 20px; }
  .cover h1 { font-family: 'Playfair Display', serif; font-size: 52px; font-weight: 900; line-height: 1.15; margin-bottom: 16px; }
  .cover h1 span { color: #f7b733; }
  .cover-sub { font-size: 18px; color: rgba(255,255,255,0.8); line-height: 1.6; margin-bottom: 40px; max-width: 520px; }
  .cover-meta { display: flex; flex-wrap: wrap; gap: 32px; margin-bottom: 40px; }
  .meta-label { font-size: 10px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 5px; }
  .meta-value { font-size: 16px; color: white; font-weight: 600; }
  .cover-divider { height: 1px; background: rgba(255,255,255,0.2); margin-bottom: 32px; }
  .cover-stats { display: flex; gap: 48px; flex-wrap: wrap; }
  .stat-val { font-family: 'Playfair Display', serif; font-size: 30px; font-weight: 700; color: #f7b733; }
  .stat-lbl { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 4px; }
  .cover-footer { position: relative; z-index: 2; margin-top: 48px; font-size: 11px; color: rgba(255,255,255,0.4); border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px; }

  /* TOC */
  .toc-page { padding: 64px 56px; page-break-after: always; }
  .toc-eyebrow { font-size: 11px; letter-spacing: 3px; color: #2c5364; font-weight: 700; text-transform: uppercase; margin-bottom: 12px; }
  .toc-page h2 { font-family: 'Playfair Display', serif; font-size: 36px; color: #1a2a3a; margin-bottom: 8px; font-weight: 900; }
  .toc-sub { font-size: 15px; color: #777; margin-bottom: 40px; }
  .toc-item { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 1px solid #f0f0f0; }
  .toc-num { width: 32px; height: 32px; background: linear-gradient(135deg, #2c5364, #0f2027); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
  .toc-title { font-size: 15px; color: #333; font-weight: 500; }

  /* INTRO IMAGE STRIP */
  .img-strip { display: flex; gap: 12px; margin: 40px 56px; height: 180px; border-radius: 16px; overflow: hidden; }
  .img-strip img { flex: 1; object-fit: cover; width: 33%; }

  /* CONTENT */
  .content { padding: 0 56px 56px; }
  .section { padding: 44px 0; border-bottom: 2px solid #f5f5f5; }
  .section:last-child { border-bottom: none; }
  .section-header { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #e8f4f8; }
  .section-icon { font-size: 32px; flex-shrink: 0; }
  .section-header h2 { font-family: 'Playfair Display', serif; font-size: 26px; color: #1a2a3a; font-weight: 700; line-height: 1.2; padding-top: 4px; }
  .section-img { width: 100%; height: 220px; object-fit: cover; border-radius: 12px; margin-bottom: 24px; }
  .section-content p { font-size: 15px; line-height: 1.95; color: #2c3e50; margin-bottom: 16px; }
  .section-content p:last-child { margin-bottom: 0; }
  .scenario-label { color: #2c5364; font-weight: 700; }

  /* CALLOUT BOX */
  .callout { background: linear-gradient(135deg, #f0f7fa, #e8f4f8); border-left: 4px solid #2c5364; border-radius: 0 12px 12px 0; padding: 18px 22px; margin: 20px 0; font-size: 14px; color: #2c3e50; line-height: 1.7; font-style: italic; }

  /* FOOTER */
  .report-footer { background: #0f2027; color: rgba(255,255,255,0.7); padding: 32px 56px; margin-top: 48px; }
  .footer-brand { font-family: 'Playfair Display', serif; font-size: 20px; color: #f7b733; font-weight: 700; margin-bottom: 12px; }
  .footer-disc { font-size: 11px; line-height: 1.8; }

  @media print {
    .cover { page-break-after: always; min-height: 100vh; }
    .toc-page { page-break-after: always; }
    .section { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<!-- COVER PAGE -->
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

<!-- TABLE OF CONTENTS -->
<div class="toc-page">
  <div class="toc-eyebrow">Inside Your Report</div>
  <h2>What's In Your Blueprint</h2>
  <p class="toc-sub">A complete educational guide to your retirement relocation — 10 sections, written specifically for ${profile.firstName}.</p>
  ${sections.map((s,i) => `<div class="toc-item"><div class="toc-num">${i+1}</div><div class="toc-title">${s.title}</div></div>`).join('')}
</div>

<!-- PHOTO STRIP -->
<div class="img-strip">
  <img src="${IMAGES.couple1}" alt="Retired couple"/>
  <img src="${coverImg}" alt="Destination scenery"/>
  <img src="${IMAGES.golf}" alt="Retirement lifestyle"/>
</div>

<!-- MAIN CONTENT -->
<div class="content">
  ${sectionsHTML}

  <div class="report-footer">
    <div class="footer-brand">Retirement Relocation Blueprint</div>
    <div class="footer-disc">
      <strong>Educational Disclaimer:</strong> This blueprint is generated for general educational and informational purposes only using publicly available data. It does not constitute personalized financial, investment, tax, legal, or retirement planning advice. All figures shown are general illustrations and estimates — they do not reflect any individual's specific financial situation. This platform is not a registered investment adviser. Always consult a licensed financial planner, CPA, real estate attorney, and other qualified professionals before making any major financial or life decisions. © ${new Date().getFullYear()} Retirement Relocation Blueprint. All rights reserved.
    </div>
  </div>
</div>

</body>
</html>`;
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    try {
      const file = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200); res.end(file);
    } catch(e) { res.writeHead(500); res.end('Could not load index.html'); }
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

        // Clean and parse JSON
        let sections;
        try {
          const cleaned = rawText.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();
          const parsed = JSON.parse(cleaned);
          sections = parsed.sections;
          if (!sections || !Array.isArray(sections)) throw new Error('No sections array');
        } catch(e) {
          // If JSON parse fails, return the error with raw text for debugging
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Could not parse AI response. Raw: ' + rawText.substring(0, 300) }));
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

        const pdfHTML = generatePDFHTML(profile, sections, dest);
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
