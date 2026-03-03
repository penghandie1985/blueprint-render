const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

function callAnthropic(profile, apiKey) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: "You are a retirement relocation research specialist creating educational retirement blueprints for Northeast US retirees. Content is educational only, not financial advice. Use ranges not specific figures. Use people in similar situations typically language. Always refer to licensed professionals. Format with headers like === SECTION NAME ===. Target 1500-2000 words.",
      messages: [{ role: "user", content: "Create a Retirement Relocation Blueprint for: " + profile.firstName + ", age " + profile.age + ", from " + profile.location + ", retiring in " + profile.timeline + ", home " + profile.homeOwner + " worth " + profile.homeValue + ", income " + profile.income + ", savings: " + profile.savings + ", priority: " + profile.priority + ", concern: " + profile.concern + ", destination: " + profile.destination + ", lifestyle: " + profile.lifestyle + ", proximity: " + profile.proximity + ", rent first: " + profile.rentFirst + ". Include: 1) SNAPSHOT 2) COST OF STAYING VS MOVING 3) TOP 3 DESTINATION MATCHES 4) SOCIAL SECURITY OVERVIEW end with CFP referral 5) BUDGET SCENARIOS three levels end with CFP referral 6) HOME TRANSITION OPTIONS 3 paths 7) LEGAL AND TAX CONSIDERATIONS 8) ACTION PLAN 90 day 6 month 1 year 9) QUESTIONS FOR YOUR PROFESSIONALS 10) EDUCATIONAL DISCLAIMER" }]
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

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const file = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
    res.setHeader('Content-Type', 'text/html');
    res.writeHead(200);
    res.end(file);
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
        const blueprint = (data.content && data.content[0] && data.content[0].text) ? data.content[0].text : 'DEBUG: ' + JSON.stringify(data).substring(0, 300);
        res.writeHead(200);
        res.end(JSON.stringify({ blueprint }));
      } catch(err) { res.writeHead(500); res.end(JSON.stringify({ error: err.message })); }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
}).listen(PORT, () => console.log('Running on port ' + PORT));
