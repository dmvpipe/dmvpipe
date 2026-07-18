// Admin-only Stripe stats for the dashboard.
// Verifies the caller's Firebase ID token (RS256, Google certs) and requires the admin email.
import crypto from 'node:crypto';

const ADMIN_EMAILS = ['info@dmvpipe.com'];
const FIREBASE_PROJECT = 'dmvpipe';
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let certsCache = { exp: 0, certs: null };
async function getCerts() {
  if (certsCache.certs && Date.now() < certsCache.exp) return certsCache.certs;
  const resp = await fetch(CERTS_URL);
  const certs = await resp.json();
  const cc = resp.headers.get('cache-control') || '';
  const m = cc.match(/max-age=(\d+)/);
  certsCache = { certs, exp: Date.now() + (m ? parseInt(m[1], 10) : 3600) * 1000 };
  return certs;
}

async function verifyFirebaseToken(idToken) {
  const [h, p, s] = idToken.split('.');
  if (!h || !p || !s) throw new Error('bad token');
  const header = JSON.parse(Buffer.from(h, 'base64url').toString());
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  const certs = await getCerts();
  const pem = certs[header.kid];
  if (!pem) throw new Error('unknown key');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), crypto.createPublicKey(pem), Buffer.from(s, 'base64url'));
  if (!ok) throw new Error('bad signature');
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('expired');
  if (payload.aud !== FIREBASE_PROJECT) throw new Error('bad audience');
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT}`) throw new Error('bad issuer');
  return payload;
}

export default async function handler(req, res) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: 'Stripe not configured' });
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = await verifyFirebaseToken(token);
    if (!ADMIN_EMAILS.includes((payload.email || '').toLowerCase())) return res.status(403).json({ error: 'Not authorized' });
  } catch (e) {
    return res.status(401).json({ error: 'Sign in as admin to view Stripe stats' });
  }

  try {
    const auth = { headers: { Authorization: `Bearer ${key}` } };
    const [chargesResp, balanceResp] = await Promise.all([
      fetch('https://api.stripe.com/v1/charges?limit=100', auth),
      fetch('https://api.stripe.com/v1/balance', auth)
    ]);
    const charges = await chargesResp.json();
    const balance = await balanceResp.json();
    if (!chargesResp.ok) throw new Error(charges.error && charges.error.message);

    const paid = (charges.data || []).filter(c => c.paid && !c.refunded);
    const now = Date.now() / 1000;
    const sum = (arr) => arr.reduce((s, c) => s + c.amount, 0) / 100;
    const stats = {
      grossVolume: sum(paid),
      paymentCount: paid.length,
      refundedCount: (charges.data || []).filter(c => c.refunded).length,
      last30Days: sum(paid.filter(c => c.created > now - 30 * 86400)),
      last7Days: sum(paid.filter(c => c.created > now - 7 * 86400)),
      availableBalance: ((balance.available || []).reduce((s, b) => s + b.amount, 0)) / 100,
      pendingBalance: ((balance.pending || []).reduce((s, b) => s + b.amount, 0)) / 100,
      recent: paid.slice(0, 10).map(c => ({
        amount: c.amount / 100,
        name: (c.billing_details && c.billing_details.name) || c.metadata?.customerName || 'Customer',
        date: new Date(c.created * 1000).toISOString().slice(0, 10),
        status: c.status
      }))
    };
    return res.status(200).json(stats);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Could not load Stripe stats' });
  }
}
