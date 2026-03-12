const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Stripe = require('stripe');

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DATA_FILE = path.join(__dirname, 'reports.json');

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

function readJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function readReports() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeReports(reports) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(reports, null, 2), 'utf8');
}

function makeReportId() {
  return 'rep_' + crypto.randomBytes(8).toString('hex');
}

function getDestMeta(destination) {
  const DEST = {
    'Florida': { emoji: '🌴', name: 'Florida', cities: 'Tampa, Sarasota, or Jacksonville', savings: '$2,800–$3,900/mo', tax: '$8,000–$22,000/yr' },
    'The Carolinas': { emoji: '🌄', name: 'The Carolinas', cities: 'Charlotte, Raleigh, or Asheville', savings: '$1,800–$2,800/mo', tax: '$5,000–$15,000/yr' },
    'Tennessee': { emoji: '🎸', name: 'Tennessee', cities: 'Nashville, Chattanooga, or Knoxville', savings: '$2,000–$3,200/mo', tax: '$7,000–$18,000/yr' },
    'Delaware': { emoji: '🦅', name: 'Delaware', cities: 'Rehoboth Beach or Wilmington', savings: '$1,200–$2,200/mo', tax: '$4,000–$12,000/yr' },
    'Texas': { emoji: '⭐', name: 'Texas', cities: 'Austin, San Antonio, or The Woodlands', savings: '$1,800–$3,000/mo', tax: '$6,000–$16,000/yr' },
    'Arizona': { emoji: '🌵', name: 'Arizona', cities: 'Scottsdale, Tucson, or Sedona', savings: '$1,500–$2,800/mo', tax: '$5,000–$14,000/yr' }
  };

  return DEST[destination] || {
    emoji: '🌞',
    name: destination || 'Your Destination',
    cities: 'Top retirement cities',
    savings: '$1,500–$3,500/mo',
    tax: '$5,000–$18,000/yr'
  };
}

function callAnthropic(profile, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      system:
        "You are a retirement relocation research specialist. Return ONLY a valid JSON object. No markdown, no code fences, no text before or after — just the raw JSON. The JSON must have a 'sections' array where each item has 'title' and 'content' keys. Write detailed, warm, specific content. Use 'people in similar situations typically...' language. Always refer to licensed professionals for personalized advice. Educational content only — not financial advice.",
      messages: [
        {
          role: 'user',
          content:
            'Create a Retirement Relocation Blueprint for: ' + profile.firstName +
            ', age ' + profile.age +
            ', from ' + profile.location +
            ', retiring in ' + profile.timeline +
            ', home ' + profile.homeOwner +
            ' worth ' + profile.homeValue +
            ', income ' + profile.income +
            ', savings: ' + profile.savings +
            ', priority: ' + profile.priority +
            ', concern: ' + profile.concern +
            ', destination: ' + profile.destination +
            ', lifestyle: ' + profile.lifestyle +
            ', proximity: ' + profile.proximity +
            ', rent first: ' + profile.rentFirst +
            '.\n\nReturn ONLY valid JSON in this exact format:\n{"sections":[{"title":"Section Name","content":"Content here"}]}\n\nInclude exactly these 12 sections with 2-3 paragraphs each (keep each content field under 900 characters):\n1. Your Retirement Relocation Snapshot\n2. The Cost of Staying vs. The Opportunity of Moving\n3. Your Top 3 Destination Matches\n4. How Social Security Works\n5. Your Retirement Budget - Three Scenarios\n6. Your Home Transition - Three Paths\n7. Legal and Tax Considerations\n8. Weather Climate and Natural Disaster Preparedness - include specific info about hurricane season in Florida (June-November, impact windows, hip roofs, concrete block, flood zones, windstorm insurance), storms in the Carolinas (nor\'easters, ice storms, occasional hurricanes, newer construction with hurricane straps), tornadoes and ice in Tennessee, how to read FEMA flood maps, what an elevation certificate is, and why insurance costs vary by zip code\n9. Understanding the Cultural Shift - include pace of life differences (South is slower, more relaxed), genuine friendliness and small talk norms, political and social culture differences (more conservative overall, church more central, but Charlotte/Raleigh/Tampa are more mixed), food culture changes, college football culture in Carolinas and Tennessee, the large Northeast transplant communities already in FL and the Carolinas, and driving culture differences\n10. Your Action Plan\n11. Questions to Ask Your Professionals\n12. Educational Disclaimer\n\nIMPORTANT: Keep each content field concise. The entire JSON response must be complete and valid.'
        }
      ]
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

    const anthropicReq = https.request(options, (anthropicRes) => {
      let data = '';
      anthropicRes.on('data', chunk => data += chunk);
      anthropicRes.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error('Anthropic response parse error: ' + data.substring(0, 200)));
        }
      });
    });

    anthropicReq.on('error', reject);
    anthropicReq.write(body);
    anthropicReq.end();
  });
}

function parseSectionsFromAnthropic(data) {
  if (data.error) {
    throw new Error(data.error.message || 'AI request failed');
  }

  const rawText = (data.content && data.content[0] && data.content[0].text)
    ? data.content[0].text.trim()
    : '';

  if (!rawText) {
    throw new Error('No content returned from AI.');
  }

  const cleaned = rawText
    .replace(/^```json\s*/, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();

  const parsed = JSON.parse(cleaned);
  if (!parsed.sections || !Array.isArray(parsed.sections) || parsed.sections.length === 0) {
    throw new Error('AI returned no sections.');
  }

  return parsed.sections;
}

const IMAGES = {
  cover_florida: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80',
  cover_carolinas: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&q=80',
  cover_tennessee: 'https://images.unsplash.com/photo-1540541338287-41700207dee6?w=1200&q=80',
  cover_default: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200&q=80',
  couple1: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&q=80',
  couple2: 'https://images.unsplash.com/photo-1559181567-c3190ca9959b?w=800&q=80',
  planning: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80',
  neighborhood: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80',
  golf: 'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=800&q=80'
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

function teaserContent(content) {
  if (!content) return '';
  const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
  return sentences.slice(0, 2).join(' ').trim();
}

function generateHTML(profile, sections, dest, opts = {}) {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const coverImg = getCoverImage(profile.destination);
  const FREE_SECTIONS = opts.full ? sections.length : 3;
  const icons = ['👤', '💰', '📍', '💼', '📊', '🏠', '⚖️', '🌪️', '🤝', '📋', '❓', '📌'];
  const sectionImages = {
    0: IMAGES.couple1,
    2: coverImg,
    4: IMAGES.planning,
    5: IMAGES.neighborhood,
    7: IMAGES.couple2
  };

  const sectionsHTML = sections.map((sec, i) => {
    const isFree = i < FREE_SECTIONS;
    const img = sectionImages[i] ? `<img src="${sectionImages[i]}" class="section-img" alt=""/>` : '';

    if (isFree) {
      return `
      <div class="section">
        <div class="section-header">
          <span class="section-icon">${icons[i] || '📄'}</span>
          <h2>${sec.title}</h2>
          ${opts.full ? '<span class="free-badge">FULL</span>' : '<span class="free-badge">FREE</span>'}
        </div>
        ${img}
        <div class="section-content">${formatContent(sec.content)}</div>
      </div>`;
    }

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
        <div class="blur-overlay"></div>
        <div class="lock-screen">
          <div class="lock-icon">🔒</div>
          <div class="lock-title">Upgrade to Unlock This Section</div>
          <div class="lock-copy">Your complete Blueprint includes all 12 sections, custom action steps, and deeper destination guidance.</div>
        </div>
      </div>
    </div>`;
  }).join('\n');

  const previewBanner = opts.full ? '' : `
  <div class="preview-banner">
    <div class="preview-pill">FREE PREVIEW</div>
    <div class="preview-title">You’re viewing the first 3 sections of your personalized Blueprint.</div>
    <div class="preview-sub">Upgrade to unlock all 12 sections, including your budget scenarios, home transition paths, legal/tax guide, weather risks, cultural fit, and action plan.</div>
  </div>`;

  const upgradeStrip = opts.full ? '' : `
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
    <div class="upgrade-guarantee">✅ One-time payment · No subscription · No hidden fees &nbsp;·&nbsp; ✅ Instant delivery &nbsp;·&nbsp; ✅ 30-day money-back guarantee</div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Retirement Relocation Blueprint</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', sans-serif;
    background: #f5f3ef;
    color: #1f2937;
  }
  .cover {
    position: relative;
    min-height: 540px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 64px 56px 40px;
    overflow: hidden;
    color: white;
  }
  .cover-bg {
    position: absolute;
    inset: 0;
    background-image: url('${coverImg}');
    background-size: cover;
    background-position: center;
    transform: scale(1.03);
  }
  .cover-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(15,32,39,0.32), rgba(15,32,39,0.82));
  }
  .cover-content, .cover-footer { position: relative; z-index: 2; }
  .cover-eyebrow {
    display: inline-block;
    background: rgba(247,183,51,0.18);
    border: 1px solid rgba(247,183,51,0.4);
    color: #f7b733;
    padding: 8px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1px;
    margin-bottom: 20px;
    text-transform: uppercase;
  }
  .cover h1 {
    font-family: 'Playfair Display', serif;
    font-size: 54px;
    line-height: 1.05;
    max-width: 720px;
    margin-bottom: 12px;
  }
  .cover h1 span {
    color: #f7b733;
    font-style: italic;
  }
  .cover-sub {
    font-size: 18px;
    line-height: 1.7;
    max-width: 680px;
    color: rgba(255,255,255,0.9);
    margin-bottom: 26px;
  }
  .cover-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    max-width: 760px;
  }
  .stat-card {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    backdrop-filter: blur(6px);
    border-radius: 18px;
    padding: 18px 18px;
  }
  .stat-val {
    font-size: 22px;
    font-weight: 800;
    color: white;
  }
  .stat-lbl {
    margin-top: 6px;
    font-size: 13px;
    line-height: 1.5;
    color: rgba(255,255,255,0.74);
  }
  .cover-footer {
    margin-top: 36px;
    font-size: 13px;
    color: rgba(255,255,255,0.78);
  }
  .preview-banner {
    background: linear-gradient(90deg, #fff6dd, #fde8c8);
    border-top: 1px solid #f5d892;
    border-bottom: 1px solid #f5d892;
    padding: 24px 56px;
    text-align: center;
  }
  .preview-pill {
    display: inline-block;
    background: #f7b733;
    color: #0f2027;
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1px;
    margin-bottom: 10px;
    text-transform: uppercase;
  }
  .preview-title {
    font-family: 'Playfair Display', serif;
    font-size: 28px;
    color: #1f2937;
    margin-bottom: 8px;
  }
  .preview-sub {
    max-width: 760px;
    margin: 0 auto;
    font-size: 15px;
    color: #4b5563;
    line-height: 1.7;
  }
  .toc-page {
    padding: 48px 56px 24px;
    background: #fff;
  }
  .toc-eyebrow {
    font-size: 11px;
    color: #b58900;
    font-weight: 800;
    letter-spacing: 1.4px;
    margin-bottom: 10px;
    text-transform: uppercase;
  }
  .toc-page h2 {
    font-family: 'Playfair Display', serif;
    font-size: 36px;
    color: #0f2027;
    margin-bottom: 10px;
  }
  .toc-sub {
    color: #6b7280;
    line-height: 1.7;
    margin-bottom: 22px;
    max-width: 760px;
  }
  .toc-item {
    display: grid;
    grid-template-columns: 44px 1fr auto;
    gap: 14px;
    align-items: center;
    padding: 14px 0;
    border-bottom: 1px solid #f0ece6;
  }
  .toc-num {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #0f2027;
    color: white;
    display: grid;
    place-items: center;
    font-weight: 800;
    font-size: 14px;
  }
  .toc-num.locked {
    background: #d1d5db;
    color: #6b7280;
  }
  .toc-title {
    font-size: 16px;
    color: #1f2937;
    font-weight: 600;
  }
  .toc-status {
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.4px;
    text-transform: uppercase;
  }
  .toc-status.free { color: #2e7d32; }
  .toc-status.locked { color: #b91c1c; }

  .img-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    padding: 0 56px;
    margin: 18px 0 32px;
  }
  .img-strip img {
    width: 100%;
    height: 180px;
    object-fit: cover;
    border-radius: 20px;
    box-shadow: 0 8px 28px rgba(0,0,0,0.12);
  }

  .content {
    padding: 0 56px 32px;
  }
  .section {
    background: white;
    border-radius: 24px;
    padding: 32px;
    margin-bottom: 22px;
    box-shadow: 0 10px 30px rgba(15,32,39,0.08);
    border: 1px solid #f1ede6;
  }
  .section-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 18px;
    flex-wrap: wrap;
  }
  .section-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: linear-gradient(135deg, #fff4d6, #fde8c8);
    display: grid;
    place-items: center;
    font-size: 22px;
  }
  .section-header h2 {
    font-family: 'Playfair Display', serif;
    font-size: 28px;
    color: #0f2027;
    line-height: 1.2;
    flex: 1;
  }
  .free-badge, .locked-badge {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 1px;
    padding: 8px 12px;
    border-radius: 999px;
    text-transform: uppercase;
  }
  .free-badge {
    background: #e8f8e8;
    color: #2e7d32;
  }
  .locked-badge {
    background: #fef2f2;
    color: #b91c1c;
  }
  .section-img {
    width: 100%;
    height: 220px;
    object-fit: cover;
    border-radius: 18px;
    margin-bottom: 18px;
  }
  .section-content p {
    font-size: 16px;
    line-height: 1.85;
    color: #374151;
    margin-bottom: 14px;
  }
  .scenario-label {
    color: #0f2027;
  }

  .section-locked {
    position: relative;
    overflow: hidden;
  }
  .section-locked .section-content {
    position: relative;
    min-height: 190px;
  }
  .teaser-text {
    color: #4b5563;
    margin-bottom: 18px;
  }
  .blur-overlay {
    position: absolute;
    inset: 40px 0 0 0;
    background: linear-gradient(180deg, rgba(255,255,255,0.15), rgba(255,255,255,0.94) 42%, rgba(255,255,255,1));
    backdrop-filter: blur(6px);
  }
  .lock-screen {
    position: absolute;
    inset: auto 0 0 0;
    padding: 30px 18px 12px;
    text-align: center;
  }
  .lock-icon {
    font-size: 36px;
    margin-bottom: 10px;
  }
  .lock-title {
    font-family: 'Playfair Display', serif;
    font-size: 24px;
    color: #0f2027;
    margin-bottom: 6px;
  }
  .lock-copy {
    max-width: 520px;
    margin: 0 auto;
    color: #6b7280;
    line-height: 1.8;
  }

  .upgrade-strip {
    background: linear-gradient(135deg, #0f2027, #2c5364);
    margin: 0 0 0;
    padding: 48px 56px;
    text-align: center;
  }
  .upgrade-strip h3 {
    font-family: 'Playfair Display', serif;
    font-size: 30px;
    color: white;
    margin-bottom: 12px;
  }
  .upgrade-strip p {
    font-size: 16px;
    color: rgba(255,255,255,0.8);
    margin-bottom: 8px;
    line-height: 1.7;
    max-width: 560px;
    margin-left: auto;
    margin-right: auto;
  }
  .upgrade-features {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
    margin: 24px 0;
  }
  .upgrade-feature {
    background: rgba(255,255,255,0.1);
    color: white;
    font-size: 13px;
    padding: 8px 16px;
    border-radius: 20px;
  }
  .upgrade-price {
    font-family: 'Playfair Display', serif;
    font-size: 48px;
    color: #f7b733;
    font-weight: 900;
    margin: 16px 0 4px;
  }
  .upgrade-price-sub {
    font-size: 14px;
    color: rgba(255,255,255,0.6);
    margin-bottom: 24px;
  }
  .upgrade-guarantee {
    font-size: 13px;
    color: rgba(255,255,255,0.5);
    margin-top: 16px;
  }

  .report-footer {
    background: #0f2027;
    color: rgba(255,255,255,0.7);
    padding: 32px 56px;
  }
  .footer-brand {
    font-family: 'Playfair Display', serif;
    font-size: 20px;
    color: #f7b733;
    font-weight: 700;
    margin-bottom: 12px;
  }
  .footer-disc {
    font-size: 11px;
    line-height: 1.8;
  }

  @media (max-width: 600px) {
    .cover { padding: 40px 24px; }
    .cover h1 { font-size: 32px; }
    .cover-grid { grid-template-columns: 1fr; }
    .toc-page, .content, .preview-banner, .upgrade-strip, .report-footer { padding-left: 24px; padding-right: 24px; }
    .img-strip { margin: 24px; height: auto; grid-template-columns: 1fr; }
    .upgrade-price { font-size: 36px; }
  }
  @media print {
    .lock-screen, .blur-overlay, .upgrade-strip, .preview-banner { display: none; }
    .section { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="cover">
  <div class="cover-bg"></div>
  <div class="cover-overlay"></div>
  <div class="cover-content">
    <div class="cover-eyebrow">🗺️ Retirement Relocation Blueprint</div>
    <h1>Prepared for<br/><span>${profile.firstName}</span></h1>
    <div class="cover-sub">
      A personalized relocation guide for a Northeast retiree evaluating <strong>${dest.name}</strong>,
      with practical savings estimates, risks, cultural differences, and next-step planning.
    </div>
    <div class="cover-grid">
      <div class="stat-card">
        <div class="stat-val">${dest.name}</div>
        <div class="stat-lbl">Your likely destination match</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${dest.savings}</div>
        <div class="stat-lbl">Est. monthly savings</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${dest.tax}</div>
        <div class="stat-lbl">Potential tax savings/yr</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${dest.cities}</div>
        <div class="stat-lbl">Top cities to explore</div>
      </div>
    </div>
  </div>
  <div class="cover-footer">Educational purposes only. Not personalized financial, legal, or investment advice. Prepared ${today}.</div>
</div>

${previewBanner}

<div class="toc-page">
  <div class="toc-eyebrow">Inside Your Report</div>
  <h2>What's In Your Blueprint</h2>
  <p class="toc-sub">12 sections written specifically for ${profile.firstName} — ${opts.full ? 'all unlocked' : '3 free, 9 unlocked with your full Blueprint'}.</p>
  ${sections.map((s, i) => `
  <div class="toc-item">
    <div class="toc-num ${i >= FREE_SECTIONS ? 'locked' : ''}">${i + 1}</div>
    <div class="toc-title">${s.title}</div>
    <div class="toc-status ${i < FREE_SECTIONS ? 'free' : 'locked'}">${i < FREE_SECTIONS ? (opts.full ? '✓ Included' : '✓ Free') : '🔒 Locked'}</div>
  </div>`).join('')}
</div>

<div class="img-strip">
  <img src="${IMAGES.couple1}" alt="Retired couple"/>
  <img src="${coverImg}" alt="Destination scenery"/>
  <img src="${IMAGES.golf}" alt="Active retirement"/>
</div>

<div class="content">
  ${sectionsHTML}
</div>

${upgradeStrip}

<div class="report-footer">
  <div class="footer-brand">Retirement Relocation Blueprint</div>
  <div class="footer-disc">
    <strong>Educational Disclaimer:</strong> This blueprint is generated for general educational and informational purposes only using publicly available data. It does not constitute personalized financial, investment, tax, legal, or retirement planning advice. All figures shown are general illustrations and estimates — they do not reflect any individual's specific financial situation. This platform is not a registered investment adviser. Always consult a licensed financial planner, CPA, real estate attorney, and other qualified professionals before making any major financial or life decisions. © ${new Date().getFullYear()} Retirement Relocation Blueprint. All rights reserved.
  </div>
</div>
</body>
</html>`;
}

function sendJSON(res, status, payload) {
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(status);
  res.end(JSON.stringify(payload));
}

function buildProfileFromAnswers(name, answers, destinationName) {
  return {
    firstName: name,
    age: answers.age || '60-63',
    location: answers.location || 'New York City / Long Island',
    timeline: answers.timeline || '1-2 years',
    homeOwner: answers.homeOwner || 'Yes - plan to sell',
    homeValue: answers.homeValue || '$600K-$1M',
    income: answers.income || '$100K-$150K/year',
    savings: answers.savings || 'Not sure if enough',
    priority: answers.priority || 'Low cost of living',
    concern: answers.concern || 'Running out of money',
    destination: destinationName,
    lifestyle: answers.lifestyle || 'Warm beach / coastal',
    proximity: answers.proximity || 'Short flight is fine',
    rentFirst: answers.rentFirst || 'Yes - great idea'
  };
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-make-secret');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html' || req.url.startsWith('/?'))) {
    try {
      const file = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end(file);
    } catch (e) {
      res.writeHead(500);
      res.end('Could not load index.html: ' + e.message);
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/generate') {
    try {
      const { profile } = await readJSONBody(req);
      const apiKey = process.env.ANTHROPIC_API_KEY;

      if (!apiKey) {
        return sendJSON(res, 500, { error: 'API key not configured.' });
      }

      const aiData = await callAnthropic(profile, apiKey);
      const sections = parseSectionsFromAnthropic(aiData);
      const dest = getDestMeta(profile.destination);
      const pdfHTML = generateHTML(profile, sections, dest, { full: false });

      return sendJSON(res, 200, { pdfHTML, sections });
    } catch (err) {
      return sendJSON(res, 500, { error: err.message });
    }
  }

  if (req.method === 'POST' && req.url === '/save-report') {
    try {
      const { name, email, answers, destinationName } = await readJSONBody(req);

      if (!name || !email || !answers || !destinationName) {
        return sendJSON(res, 400, { error: 'Missing required fields.' });
      }

      const reports = readReports();
      const report_id = makeReportId();
      const profile = buildProfileFromAnswers(name, answers, destinationName);

      reports.push({
        report_id,
        name,
        email,
        answers,
        profile,
        status: 'pending_payment',
        created_at: new Date().toISOString()
      });

      writeReports(reports);
      return sendJSON(res, 200, { report_id });
    } catch (err) {
      return sendJSON(res, 500, { error: err.message });
    }
  }

  if (req.method === 'POST' && req.url === '/create-checkout-session') {
    try {
      if (!stripe) {
        return sendJSON(res, 500, { error: 'Stripe is not configured.' });
      }

      const { report_id } = await readJSONBody(req);

      if (!report_id) {
        return sendJSON(res, 400, { error: 'Missing report_id.' });
      }

      const reports = readReports();
      const report = reports.find(r => r.report_id === report_id);

      if (!report) {
        return sendJSON(res, 404, { error: 'Report not found.' });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: report.email,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Retirement Relocation Full Blueprint'
              },
              unit_amount: 4900
            },
            quantity: 1
          }
        ],
        success_url: `${BASE_URL}/?paid=1`,
        cancel_url: `${BASE_URL}/?canceled=1`,
        metadata: {
          report_id: report.report_id,
          email: report.email,
          name: report.name
        }
      });

      report.stripe_checkout_created_at = new Date().toISOString();
      report.stripe_checkout_session_id = session.id;
      writeReports(reports);

      return sendJSON(res, 200, { url: session.url });
    } catch (err) {
      return sendJSON(res, 500, { error: err.message });
    }
  }

  if (req.method === 'POST' && req.url === '/fulfill-report') {
    try {
      if (!stripe) {
        return sendJSON(res, 500, { error: 'Stripe is not configured.' });
      }

      const makeSecret = req.headers['x-make-secret'];
      if (!process.env.MAKE_SHARED_SECRET || makeSecret !== process.env.MAKE_SHARED_SECRET) {
        return sendJSON(res, 401, { error: 'Unauthorized.' });
      }

      const { report_id, stripe_session_id } = await readJSONBody(req);

      if (!report_id || !stripe_session_id) {
        return sendJSON(res, 400, { error: 'Missing required fields.' });
      }

      const session = await stripe.checkout.sessions.retrieve(stripe_session_id);
      if (session.payment_status !== 'paid') {
        return sendJSON(res, 400, { error: 'Payment not completed.' });
      }

      const reports = readReports();
      const report = reports.find(r => r.report_id === report_id);

      if (!report) {
        return sendJSON(res, 404, { error: 'Report not found.' });
      }

      if (report.status === 'fulfilled') {
        return sendJSON(res, 200, { success: true, message: 'Already fulfilled.' });
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return sendJSON(res, 500, { error: 'API key not configured.' });
      }

      const aiData = await callAnthropic(report.profile, apiKey);
      const sections = parseSectionsFromAnthropic(aiData);
      const dest = getDestMeta(report.profile.destination);
      const fullHTML = generateHTML(report.profile, sections, dest, { full: true });

      const outDir = path.join(__dirname, 'generated_reports');
      fs.mkdirSync(outDir, { recursive: true });

      const filename = `${report.report_id}.html`;
      const filePath = path.join(outDir, filename);
      fs.writeFileSync(filePath, fullHTML, 'utf8');

      report.status = 'fulfilled';
      report.fulfilled_at = new Date().toISOString();
      report.stripe_session_id = stripe_session_id;
      report.generated_file = `/generated_reports/${filename}`;
      writeReports(reports);

      return sendJSON(res, 200, {
        success: true,
        report_id: report.report_id,
        email_to: report.email,
        generated_file: report.generated_file,
        note: 'Full report generated successfully. Add email sending next.'
      });
    } catch (err) {
      return sendJSON(res, 500, { error: err.message });
    }
  }

  if (req.method === 'GET' && req.url.startsWith('/generated_reports/')) {
    try {
      const safePath = path.normalize(req.url).replace(/^(\.\.[\/\\])+/, '');
      const filePath = path.join(__dirname, safePath);

      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const file = fs.readFileSync(filePath);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.writeHead(200);
      res.end(file);
    } catch (err) {
      res.writeHead(500);
      res.end(err.message);
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
}).listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
