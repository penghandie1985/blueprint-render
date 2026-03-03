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
      system: "You are a retirement relocation research specialist creating educational retirement blueprints for Northeast US retirees. Content is educational only, not financial advice. Use ranges not specific figures. Use 'people in similar situations typically...' language. Always refer to licensed professionals for personalized advice. Target 2000-2500 words. Be specific, detailed, and genuinely useful.",
      messages: [{ role: "user", content: "Create a detailed Retirement Relocation Blueprint for: " + profile.firstName + ", age " + profile.age + ", from " + profile.location + ", retiring in " + profile.timeline + ", home " + profile.homeOwner + " worth " + profile.homeValue + ", income " + profile.income + ", savings: " + profile.savings + ", priority: " + profile.priority + ", concern: " + profile.concern + ", destination: " + profile.destination + ", lifestyle: " + profile.lifestyle + ", proximity: " + profile.proximity + ", rent first: " + profile.rentFirst + ".\n\nFormat your response as JSON with this exact structure (no markdown, just valid JSON):\n{\n  \"sections\": [\n    {\n      \"title\": \"Section Title\",\n      \"content\": \"Full section content here\"\n    }\n  ]\n}\n\nInclude these 10 sections with detailed content:\n1. Your Retirement Relocation Snapshot\n2. The Cost of Staying vs. The Opportunity of Moving\n3. Your Top 3 Destination Matches\n4. How Social Security Works — Key Considerations\n5. Thinking About Your Retirement Budget — Three Scenarios\n6. Your Home Transition — Three Paths\n7. Legal and Tax Considerations When Moving States\n8. Your Action Plan — 90 Days, 6 Months, 1 Year\n9. Questions to Ask Your Professionals\n10. Educational Disclaimer\n\nBe thorough and specific in each section. Use the three scenario model for major decisions. Always end money sections with referral to licensed professionals." }]
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
        catch(e) { reject(new Error('Invalid JSON: ' + data.substring(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function generatePDFHTML(profile, sections, dest) {
  const today = new Date().toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'});
  const sectionIcons = ['👤','💰','📍','💼','📊','🏠','⚖️','📋','❓','📌'];

  let sectionsHTML = '';
  sections.forEach(function(sec, i) {
    const content = sec.content
      .replace(/Scenario A[:\s]/g, '<strong class="scenario">Scenario A:</strong> ')
      .replace(/Scenario B[:\s]/g, '<strong class="scenario">Scenario B:</strong> ')
      .replace(/Scenario C[:\s]/g, '<strong class="scenario">Scenario C:</strong> ')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');

    sectionsHTML += `
      <div class="section">
        <div class="section-header">
          <span class="section-icon">${sectionIcons[i] || '📄'}</span>
          <h2>${sec.title}</h2>
        </div>
        <div class="section-content"><p>${content}</p></div>
      </div>`;
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Source+Sans+3:wght@300;400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Source Sans 3', Georgia, serif; color: #1a2a3a; background: white; }

  .cover {
    background: linear-gradient(160deg, #0f2027, #203a43, #2c5364);
    color: white; padding: 60px 48px; min-height: 100vh;
    display: flex; flex-direction: column; justify-content: center;
  }
  .cover-eyebrow { font-size: 12px; letter-spacing: 3px; color: #f7b733; font-weight: 600; text-transform: uppercase; margin-bottom: 20px; }
  .cover h1 { font-family: 'Playfair Display', serif; font-size: 42px; font-weight: 900; line-height: 1.2; margin-bottom: 16px; }
  .cover h1 span { color: #f7b733; }
  .cover-sub { font-size: 18px; color: rgba(255,255,255,0.75); line-height: 1.6; margin-bottom: 40px; max-width: 480px; }
  .cover-meta { display: flex; flex-wrap: wrap; gap: 24px; margin-bottom: 48px; }
  .meta-item { }
  .meta-label { font-size: 11px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .meta-value { font-size: 15px; color: white; font-weight: 500; }
  .cover-stats { display: flex; gap: 32px; flex-wrap: wrap; padding-top: 32px; border-top: 1px solid rgba(255,255,255,0.15); }
  .stat { }
  .stat-val { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 700; color: #f7b733; }
  .stat-lbl { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 3px; }
  .cover-footer { margin-top: 48px; font-size: 12px; color: rgba(255,255,255,0.4); }

  .toc-page { padding: 48px; border-bottom: 1px solid #eee; }
  .toc-page h2 { font-family: 'Playfair Display', serif; font-size: 28px; color: #1a2a3a; margin-bottom: 24px; }
  .toc-item { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px dotted #e0e0e0; font-size: 15px; color: #333; }
  .toc-num { width: 28px; height: 28px; background: #2c5364; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; }

  .content { padding: 0 48px; }
  .section { padding: 40px 0; border-bottom: 1px solid #f0f0f0; }
  .section:last-child { border-bottom: none; }
  .section-header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; padding-bottom: 14px; border-bottom: 2px solid #e8f4f8; }
  .section-icon { font-size: 28px; }
  .section-header h2 { font-family: 'Playfair Display', serif; font-size: 24px; color: #1a2a3a; font-weight: 700; line-height: 1.2; }
  .section-content p { font-size: 15px; line-height: 1.9; color: #333; margin-bottom: 14px; }
  .section-content p:last-child { margin-bottom: 0; }
  .scenario { color: #2c5364; font-weight: 700; }

  .highlight-box { background: linear-gradient(135deg, #f0f7fa, #e8f4f8); border-left: 4px solid #2c5364; border-radius: 0 10px 10px 0; padding: 16px 20px; margin: 16px 0; font-size: 14px; color: #2c3e50; line-height: 1.7; }

  .footer { background: #f8fafb; border-top: 2px solid #e0e8ee; padding: 24px 48px; margin-top: 40px; }
  .footer-disc { font-size: 11px; color: #888; line-height: 1.7; }
  .footer-brand { font-family: 'Playfair Display', serif; font-size: 16px; color: #2c5364; font-weight: 700; margin-bottom: 8px; }

  @media print {
    .cover { page-break-after: always; }
    .toc-page { page-break-after: always; }
    .section { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="cover">
  <div class="cover-eyebrow">🗺️ Retirement Relocation Blueprint</div>
  <h1>Prepared for<br/><span>${profile.firstName}</span></h1>
  <p class="cover-sub">Your personalized educational guide to retiring from the Northeast — researched, organized, and written in plain English.</p>
  <div class="cover-meta">
    <div class="meta-item"><div class="meta-label">Prepared For</div><div class="meta-value">${profile.firstName}</div></div>
    <div class="meta-item"><div class="meta-label">Current Location</div><div class="meta-value">${profile.location}</div></div>
    <div class="meta-item"><div class="meta-label">Top Destination</div><div class="meta-value">${dest.name} ${dest.emoji}</div></div>
    <div class="meta-item"><div class="meta-label">Date Prepared</div><div class="meta-value">${today}</div></div>
  </div>
  <div class="cover-stats">
    <div class="stat"><div class="stat-val">${dest.savings}</div><div class="stat-lbl">Est. monthly savings</div></div>
    <div class="stat"><div class="stat-val">${dest.tax}</div><div class="stat-lbl">Potential tax savings/yr</div></div>
    <div class="stat"><div class="stat-val">${dest.cities}</div><div class="stat-lbl">Top cities to explore</div></div>
  </div>
  <div class="cover-footer">Educational purposes only. Not financial, legal, or investment advice. Prepared ${today}.</div>
</div>

<div class="toc-page">
  <h2>📋 What's Inside Your Blueprint</h2>
  ${sections.map((s,i) => `<div class="toc-item"><div class="toc-num">${i+1}</div>${s.title}</div>`).join('')}
</div>

<div class="content">
  ${sectionsHTML}
  <div class="footer">
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
    const file = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200); res.end(file); return;
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

        const rawText = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text : '';
        if (!rawText) { res.writeHead(500); res.end(JSON.stringify({ error: 'No content returned from AI.' })); return; }

        // Parse JSON sections from AI response
        let sections;
        try {
          const cleaned = rawText.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim();
          const parsed = JSON.parse(cleaned);
          sections = parsed.sections;
        } catch(e) {
          // Fallback: return as plain text if JSON parsing fails
          sections = [{ title: "Your Retirement Blueprint", content: rawText }];
        }

        // Determine destination data for cover page
        const DEST = {
          "Florida": {emoji:"🌴",name:"Florida",cities:"Tampa, Sarasota, or Jacksonville",savings:"$2,800–$3,900/mo",tax:"$8,000–$22,000/yr"},
          "The Carolinas": {emoji:"🌄",name:"The Carolinas",cities:"Charlotte, Raleigh, or Asheville",savings:"$1,800–$2,800/mo",tax:"$5,000–$15,000/yr"},
          "Tennessee": {emoji:"🎸",name:"Tennessee",cities:"Nashville, Chattanooga, or Knoxville",savings:"$2,000–$3,200/mo",tax:"$7,000–$18,000/yr"},
          "Delaware": {emoji:"🦅",name:"Delaware",cities:"Rehoboth Beach or Wilmington",savings:"$1,200–$2,200/mo",tax:"$4,000–$12,000/yr"}
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
}).listen(PORT, () => console.log('Running on port ' + PORT));
