const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Stripe = require('stripe');
const { Resend } = require('resend');

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DATA_FILE = path.join(__dirname, 'reports.json');

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      maxNetworkRetries: 0,
      timeout: 20000
    })
  : null;

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function readJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
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

function sendJSON(res, status, payload) {
  res.setHeader('Content-Type', 'application/json');
  res.writeHead(status);
  res.end(JSON.stringify(payload));
}

function readReports() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
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
    'Florida': {
      emoji: '🌴',
      name: 'Florida',
      cities: 'Tampa, Sarasota, or Jacksonville',
      savings: '$2,800–$3,900/mo',
      tax: '$8,000–$22,000/yr'
    },
    'The Carolinas': {
      emoji: '🌄',
      name: 'The Carolinas',
      cities: 'Charlotte, Raleigh, or Asheville',
      savings: '$1,800–$2,800/mo',
      tax: '$5,000–$15,000/yr'
    },
    'Tennessee': {
      emoji: '🎸',
      name: 'Tennessee',
      cities: 'Nashville, Chattanooga, or Knoxville',
      savings: '$2,000–$3,200/mo',
      tax: '$7,000–$18,000/yr'
    },
    'Delaware': {
      emoji: '🦅',
      name: 'Delaware',
      cities: 'Rehoboth Beach or Wilmington',
      savings: '$1,200–$2,200/mo',
      tax: '$4,000–$12,000/yr'
    },
    'Texas': {
      emoji: '⭐',
      name: 'Texas',
      cities: 'Austin, San Antonio, or The Woodlands',
      savings: '$1,800–$3,000/mo',
      tax: '$6,000–$16,000/yr'
    },
    'Arizona': {
      emoji: '🌵',
      name: 'Arizona',
      cities: 'Scottsdale, Tucson, or Sedona',
      savings: '$1,500–$2,800/mo',
      tax: '$5,000–$14,000/yr'
    }
  };

  return DEST[destination] || {
    emoji: '🌞',
    name: destination || 'Your Destination',
    cities: 'Top retirement cities',
    savings: '$1,500–$3,500/mo',
    tax: '$5,000–$18,000/yr'
  };
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
            '.\n\nReturn ONLY valid JSON in this exact format:\n{"sections":[{"title":"Section Name","content":"Content here"}]}\n\nInclude exactly these 12 sections with 2-3 paragraphs each (keep each content field under 900 characters):\n1. Your Retirement Relocation Snapshot\n2. The Cost of Staying vs. The Opportunity of Moving\n3. Your Top 3 Destination Matches\n4. How Social Security Works\n5. Your Retirement Budget - Three Scenarios\n6. Your Home Transition - Three Paths\n7. Legal and Tax Considerations\n8. Weather Climate and Natural Disaster Preparedness\n9. Understanding the Cultural Shift\n10. Your Action Plan\n11. Questions to Ask Your Professionals\n12. Educational Disclaimer\n\nIMPORTANT: Keep each content field concise. The entire JSON response must be complete and valid.'
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

    const anthropicReq = https.request(options, anthropicRes => {
      let data = '';

      anthropicRes.on('data', chunk => {
        data += chunk;
      });

      anthropicRes.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
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

  const rawText =
    data.content &&
    data.content[0] &&
    data.content[0].text
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

function generateHTML(profile, sections, dest, opts = {}) {
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const FREE_SECTIONS = opts.full ? sections.length : 3;
  const icons = ['👤', '💰', '📍', '💼', '📊', '🏠', '⚖️', '🌪️', '🤝', '📋', '❓', '📌'];

  const coverImages = {
    Florida: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1400&q=80',
    'The Carolinas': 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1400&q=80',
    Tennessee: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1400&q=80',
    Texas: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1400&q=80',
    Arizona: 'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=1400&q=80',
    Delaware: 'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?w=1400&q=80'
  };

  const lifestyleImages = [
    'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=80',
    'https://images.unsplash.com/photo-1460317442991-0ec209397118?w=1200&q=80',
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=1200&q=80',
    'https://images.unsplash.com/photo-1494526585095-c41746248156?w=1200&q=80'
  ];

  const coverImage = coverImages[dest.name] || 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1400&q=80';

  function formatParagraphs(text) {
    if (!text) return '<p>Content unavailable.</p>';

    return text
      .split(/\n\n+/)
      .filter(Boolean)
      .map(p => `<p>${p.trim()}</p>`)
      .join('');
  }

  function teaserContent(content) {
    if (!content) return '';
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.slice(0, 2).join(' ').trim();
  }

  const sectionsHTML = sections.map((sec, i) => {
    const isFree = i < FREE_SECTIONS;
    const img = lifestyleImages[i % lifestyleImages.length];

    if (isFree) {
      return `
        <section class="report-section">
          <div class="section-header">
            <div class="section-icon">${icons[i] || '📄'}</div>
            <div class="section-title-wrap">
              <h2>${sec.title}</h2>
              <div class="section-badge">${opts.full ? 'Full Access' : 'Free Preview'}</div>
            </div>
          </div>

          <img class="section-image" src="${img}" alt="${sec.title}" />

          <div class="section-content">
            ${formatParagraphs(sec.content)}
          </div>
        </section>
      `;
    }

    const teaser = teaserContent(sec.content);

    return `
      <section class="report-section locked-section">
        <div class="section-header">
          <div class="section-icon">${icons[i] || '📄'}</div>
          <div class="section-title-wrap">
            <h2>${sec.title}</h2>
            <div class="locked-badge">🔒 Locked</div>
          </div>
        </div>

        <div class="section-content locked-content">
          <p>${teaser}</p>
          <div class="locked-overlay">
            <div class="locked-card">
              <div class="locked-icon">🔒</div>
              <h3>Unlock Your Full Blueprint</h3>
              <p>This section is included in the paid report along with your full relocation strategy, budget planning, and action plan.</p>
            </div>
          </div>
        </div>
      </section>
    `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Retirement Relocation Blueprint</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      font-family: 'Inter', sans-serif;
      background: #f4f1ec;
      color: #1f2937;
      line-height: 1.7;
    }

    .page-wrap {
      max-width: 960px;
      margin: 0 auto;
      background: #fffaf4;
      box-shadow: 0 8px 40px rgba(0,0,0,0.08);
    }

    .hero {
      position: relative;
      min-height: 460px;
      color: white;
      padding: 56px 48px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      background:
        linear-gradient(rgba(12, 32, 43, 0.45), rgba(12, 32, 43, 0.78)),
        url('${coverImage}') center/cover no-repeat;
    }

    .hero-badge {
      position: absolute;
      top: 32px;
      left: 48px;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.25);
      padding: 10px 16px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      backdrop-filter: blur(6px);
    }

    .hero h1 {
      font-family: 'Playfair Display', serif;
      font-size: 52px;
      line-height: 1.05;
      margin: 0 0 14px 0;
      max-width: 700px;
    }

    .hero p {
      max-width: 720px;
      margin: 0 0 20px 0;
      font-size: 18px;
      color: rgba(255,255,255,0.92);
    }

    .hero-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 8px;
    }

    .hero-chip {
      background: rgba(255,255,255,0.14);
      border: 1px solid rgba(255,255,255,0.18);
      padding: 10px 14px;
      border-radius: 14px;
      font-size: 14px;
      backdrop-filter: blur(4px);
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      padding: 28px 32px;
      background: #0f2027;
      color: white;
    }

    .summary-card {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 18px;
      padding: 18px;
    }

    .summary-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255,255,255,0.7);
      margin-bottom: 8px;
    }

    .summary-value {
      font-size: 20px;
      font-weight: 700;
      line-height: 1.3;
    }

    .intro-banner {
      margin: 28px 32px 0;
      padding: 22px 24px;
      border-radius: 20px;
      background: linear-gradient(135deg, #fff4d8, #fbe7bf);
      border: 1px solid #edd6a0;
    }

    .intro-banner h3 {
      margin: 0 0 8px 0;
      font-size: 24px;
      font-family: 'Playfair Display', serif;
      color: #5a3d00;
    }

    .intro-banner p {
      margin: 0;
      color: #6b4f1d;
    }

    .content {
      padding: 28px 32px 40px;
    }

    .report-section {
      background: white;
      border-radius: 24px;
      border: 1px solid #eee4d7;
      box-shadow: 0 8px 24px rgba(0,0,0,0.05);
      padding: 28px;
      margin-bottom: 24px;
      overflow: hidden;
    }

    .section-header {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 18px;
    }

    .section-icon {
      width: 52px;
      height: 52px;
      min-width: 52px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f2027, #2c5364);
      color: white;
      font-size: 24px;
    }

    .section-title-wrap {
      flex: 1;
    }

    .section-title-wrap h2 {
      margin: 0 0 8px 0;
      font-family: 'Playfair Display', serif;
      font-size: 32px;
      color: #152531;
      line-height: 1.2;
    }

    .section-badge,
    .locked-badge {
      display: inline-block;
      padding: 7px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.03em;
    }

    .section-badge {
      background: #e9f7ef;
      color: #147a4f;
    }

    .locked-badge {
      background: #fff1f2;
      color: #b42318;
    }

    .section-image {
      width: 100%;
      height: 250px;
      object-fit: cover;
      border-radius: 18px;
      margin-bottom: 18px;
    }

    .section-content p {
      margin: 0 0 16px 0;
      font-size: 16px;
      color: #374151;
    }

    .locked-section {
      position: relative;
    }

    .locked-content {
      position: relative;
      min-height: 180px;
      overflow: hidden;
    }

    .locked-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: end;
      justify-content: center;
      background: linear-gradient(to bottom, rgba(255,255,255,0.15), rgba(255,255,255,0.92) 50%, rgba(255,255,255,1));
      padding: 24px;
    }

    .locked-card {
      background: white;
      border-radius: 20px;
      padding: 22px;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 8px 30px rgba(0,0,0,0.08);
      border: 1px solid #eadfce;
      text-align: center;
    }

    .locked-icon {
      font-size: 28px;
      margin-bottom: 8px;
    }

    .locked-card h3 {
      margin: 0 0 10px 0;
      font-family: 'Playfair Display', serif;
      font-size: 24px;
      color: #1f2937;
    }

    .locked-card p {
      margin: 0;
      color: #6b7280;
      font-size: 15px;
    }

    .footer {
      background: #10212c;
      color: rgba(255,255,255,0.86);
      padding: 28px 32px 36px;
    }

    .footer h4 {
      margin: 0 0 10px 0;
      font-size: 18px;
      font-family: 'Playfair Display', serif;
      color: #f3c66b;
    }

    .footer p {
      margin: 0;
      font-size: 12px;
      line-height: 1.8;
    }

    @media (max-width: 768px) {
      .hero {
        padding: 40px 24px;
        min-height: 380px;
      }

      .hero-badge {
        left: 24px;
        top: 24px;
      }

      .hero h1 {
        font-size: 36px;
      }

      .summary-grid,
      .content,
      .footer {
        padding-left: 20px;
        padding-right: 20px;
      }

      .intro-banner {
        margin-left: 20px;
        margin-right: 20px;
      }

      .section-title-wrap h2 {
        font-size: 26px;
      }

      .section-image {
        height: 200px;
      }
    }

    @media print {
      body {
        background: white;
      }

      .page-wrap {
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="page-wrap">
    <section class="hero">
      <div class="hero-badge">Retirement Relocation Blueprint</div>
      <h1>Prepared for ${profile.firstName}</h1>
      <p>
        A personalized relocation guide for a Northeast retiree evaluating <strong>${dest.name}</strong>,
        with practical savings estimates, lifestyle factors, and planning guidance.
      </p>
      <div class="hero-meta">
        <div class="hero-chip">📍 Destination: ${dest.name}</div>
        <div class="hero-chip">📅 Prepared: ${today}</div>
        <div class="hero-chip">👤 Client: ${profile.firstName}</div>
      </div>
    </section>

    <section class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Top Cities</div>
        <div class="summary-value">${dest.cities}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Potential Monthly Savings</div>
        <div class="summary-value">${dest.savings}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Potential Tax Advantage</div>
        <div class="summary-value">${dest.tax}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Timeline</div>
        <div class="summary-value">${profile.timeline || 'To be determined'}</div>
      </div>
    </section>

    <section class="intro-banner">
      <h3>Your Personalized Retirement Blueprint</h3>
      <p>
        This report is designed to help you compare destinations, understand costs and tradeoffs,
        and move toward a smarter retirement relocation decision with clarity and confidence.
      </p>
    </section>

    <main class="content">
      ${sectionsHTML}
    </main>

    <footer class="footer">
      <h4>Educational Disclaimer</h4>
      <p>
        This blueprint is generated for general informational purposes only and is not financial, legal,
        tax, or investment advice. Always consult qualified professionals before making major decisions
        regarding retirement, relocation, taxes, real estate, or healthcare planning.
      </p>
    </footer>
  </div>
</body>
</html>
  `;
}

async function sendReportEmail(toEmail, firstName, reportUrl) {
  if (!resend) {
    throw new Error('Resend is not configured.');
  }

  if (!process.env.FROM_EMAIL) {
    throw new Error('FROM_EMAIL is not configured.');
  }

  console.log('Sending report email:', {
    toEmail,
    firstName,
    reportUrl
  });

  const response = await resend.emails.send({
    from: process.env.FROM_EMAIL,
    to: [toEmail],
    subject: 'Your Retirement Relocation Blueprint Is Ready',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#1f2937;line-height:1.7;">
        <h1 style="font-size:28px;margin-bottom:12px;">Your Blueprint is Ready</h1>
        <p>Hi ${firstName || 'there'},</p>
        <p>Thanks for your purchase. Your full <strong>Retirement Relocation Blueprint</strong> is ready.</p>
        <p>
          <a href="${reportUrl}" style="display:inline-block;background:#f59e0b;color:#fff;text-decoration:none;padding:14px 20px;border-radius:10px;font-weight:700;">
            Open My Full Report
          </a>
        </p>
        <p>If the button doesn’t work, copy and paste this link into your browser:</p>
        <p style="word-break:break-all;color:#2563eb;">${reportUrl}</p>
        <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb;" />
        <p style="font-size:12px;color:#6b7280;">
          Educational content only. This is not financial, tax, legal, or investment advice.
        </p>
      </div>
    `
  });

  console.log('Resend response:', response);

  return response;
}

async function fulfillPaidReport(checkoutSessionId) {
  if (!stripe) throw new Error('Stripe is not configured.');
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured.');

  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);

  console.log('Fulfillment retrieved Stripe session:', {
    session_id: session.id,
    payment_status: session.payment_status,
    metadata: session.metadata
  });

  if (session.payment_status !== 'paid') {
    throw new Error('Checkout session is not paid.');
  }

  const reportId = session.metadata && session.metadata.report_id;
  if (!reportId) {
    throw new Error('No report_id found in Stripe metadata.');
  }

  const reports = readReports();
  const report = reports.find(r => r.report_id === reportId);

  if (!report) {
    throw new Error('Report not found.');
  }

  if (report.status === 'fulfilled' && report.generated_file) {
    console.log('Report already fulfilled:', {
      report_id: report.report_id,
      generated_file: report.generated_file
    });

    return {
      success: true,
      already_fulfilled: true,
      report_id: report.report_id,
      email_to: report.email,
      generated_file: report.generated_file
    };
  }

  console.log('Generating full report for:', {
    report_id: report.report_id,
    email: report.email,
    name: report.name
  });

  const aiData = await callAnthropic(report.profile, process.env.ANTHROPIC_API_KEY);
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
  report.stripe_session_id = checkoutSessionId;
  report.generated_file = `/generated_reports/${filename}`;

  const reportUrl = `${BASE_URL}${report.generated_file}`;
  const emailResult = await sendReportEmail(report.email, report.name, reportUrl);

  report.email_sent_at = new Date().toISOString();
  report.email_id = emailResult && emailResult.data ? emailResult.data.id : null;

  writeReports(reports);

  console.log('Fulfillment completed successfully:', {
    report_id: report.report_id,
    email_to: report.email,
    generated_file: report.generated_file
  });

  return {
    success: true,
    report_id: report.report_id,
    email_to: report.email,
    generated_file: report.generated_file
  };
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Stripe-Signature');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/debug-env') {
    return sendJSON(res, 200, {
      hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
      hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
      stripeKeyPrefix: process.env.STRIPE_SECRET_KEY ? process.env.STRIPE_SECRET_KEY.substring(0, 7) : null,
      hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
      hasResendKey: !!process.env.RESEND_API_KEY,
      hasFromEmail: !!process.env.FROM_EMAIL,
      baseUrl: process.env.BASE_URL || null
    });
  }

  if (req.method === 'GET' && req.url === '/test-stripe') {
    try {
      if (!stripe) {
        return sendJSON(res, 500, { ok: false, error: 'Stripe is not configured' });
      }

      const balance = await stripe.balance.retrieve();
      return sendJSON(res, 200, { ok: true, object: balance.object });
    } catch (err) {
      return sendJSON(res, 500, {
        ok: false,
        error: err.message,
        stripe_type: err.type || null,
        stripe_code: err.code || null
      });
    }
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html' || req.url.startsWith('/?'))) {
    try {
      const file = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end(file);
    } catch (err) {
      res.writeHead(500);
      res.end('Could not load index.html: ' + err.message);
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/generate') {
    try {
      const body = await readJSONBody(req);
      const profile = body.profile;

      if (!process.env.ANTHROPIC_API_KEY) {
        return sendJSON(res, 500, { error: 'ANTHROPIC_API_KEY is not configured.' });
      }

      const aiData = await callAnthropic(profile, process.env.ANTHROPIC_API_KEY);
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
      const body = await readJSONBody(req);
      const { name, email, answers, destinationName } = body;

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

      console.log('Saved report record:', {
        report_id,
        name,
        email,
        destinationName
      });

      return sendJSON(res, 200, { report_id });
    } catch (err) {
      return sendJSON(res, 500, { error: err.message });
    }
  }

  if (req.method === 'POST' && req.url === '/create-checkout-session') {
    try {
      if (!stripe) {
        return sendJSON(res, 500, {
          error: 'Stripe is not configured. Add STRIPE_SECRET_KEY in Render and redeploy.'
        });
      }

      const body = await readJSONBody(req);
      const { report_id } = body;

      if (!report_id) {
        return sendJSON(res, 400, { error: 'Missing report_id.' });
      }

      const reports = readReports();
      const report = reports.find(r => r.report_id === report_id);

      if (!report) {
        return sendJSON(res, 404, { error: 'Report not found.' });
      }

      console.log('Creating checkout session with metadata:', {
        report_id: report.report_id,
        email: report.email,
        name: report.name
      });

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

      console.log('Stripe checkout session created:', {
        session_id: session.id,
        metadata: session.metadata
      });

      report.stripe_checkout_created_at = new Date().toISOString();
      report.stripe_checkout_session_id = session.id;
      writeReports(reports);

      return sendJSON(res, 200, { url: session.url });
    } catch (err) {
      console.error('Stripe checkout session error:', {
        type: err.type,
        code: err.code,
        message: err.message
      });

      return sendJSON(res, 500, {
        error: err.message,
        stripe_type: err.type || null,
        stripe_code: err.code || null
      });
    }
  }

  if (req.method === 'POST' && req.url === '/stripe-webhook') {
    try {
      if (!stripe) {
        res.writeHead(500);
        res.end('Stripe is not configured.');
        return;
      }

      if (!process.env.STRIPE_WEBHOOK_SECRET) {
        res.writeHead(500);
        res.end('STRIPE_WEBHOOK_SECRET is not configured.');
        return;
      }

      const sig = req.headers['stripe-signature'];
      const rawBody = await readRawBody(req);

      let event;
      try {
        event = stripe.webhooks.constructEvent(
          rawBody,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );
      } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        res.writeHead(400);
        res.end(`Webhook Error: ${err.message}`);
        return;
      }

      console.log('Stripe webhook received:', {
        event_type: event.type,
        event_id: event.id
      });

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        console.log('Webhook checkout.session.completed received:', {
          session_id: session.id,
          metadata: session.metadata
        });

        try {
          await fulfillPaidReport(session.id);
        } catch (err) {
          console.error('Fulfillment error:', err.message);
          res.writeHead(500);
          res.end(`Fulfillment Error: ${err.message}`);
          return;
        }
      }

      res.writeHead(200);
      res.end('ok');
    } catch (err) {
      console.error('Stripe webhook error:', err.message);
      res.writeHead(500);
      res.end(err.message);
    }
    return;
  }

  if (req.method === 'GET' && req.url.startsWith('/generated_reports/')) {
    try {
      const safePath = path.normalize(req.url).replace(/^(\.\.[/\\])+/, '');
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
