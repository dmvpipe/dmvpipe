// Vercel serverless function — creates a Stripe Checkout session.
// Requires env var STRIPE_SECRET_KEY (set in Vercel dashboard → Settings → Environment Variables).
// No SDK needed: calls Stripe's REST API directly.
import { PRICES } from './_products.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: 'Payments not configured yet (missing STRIPE_SECRET_KEY).' });

  try {
    const { items, customerName, phone } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'No items' });

    const params = new URLSearchParams();
    params.append('mode', 'payment');
    const origin = req.headers.origin || 'https://dmvpipe.com';
    params.append('success_url', `${origin}/?payment=success`);
    params.append('cancel_url', `${origin}/?payment=cancelled`);
    if (customerName) params.append('metadata[customerName]', String(customerName).slice(0, 200));
    if (phone) params.append('metadata[phone]', String(phone).slice(0, 40));

    items.slice(0, 50).forEach((it, i) => {
      const p = PRICES[it.id];
      const qty = Math.max(1, Math.min(20, parseInt(it.qty, 10) || 1));
      if (!p || p.price <= 0) return; // unknown ids and $0 items are skipped — prices come from server only
      params.append(`line_items[${i}][price_data][currency]`, 'usd');
      params.append(`line_items[${i}][price_data][unit_amount]`, String(Math.round(p.price * 100)));
      params.append(`line_items[${i}][price_data][product_data][name]`, p.name.slice(0, 250));
      params.append(`line_items[${i}][quantity]`, String(qty));
    });
    if (![...params.keys()].some(k => k.startsWith('line_items'))) return res.status(400).json({ error: 'No payable items' });

    const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const session = await resp.json();
    if (!resp.ok) {
      console.error('Stripe error:', session.error && session.error.message);
      return res.status(502).json({ error: 'Payment provider error. Please try again or pay on completion.' });
    }
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unexpected error creating payment session.' });
  }
}
