import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: VercelRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}

/**
 * Paystack Webhook Handler for Vercel
 * Endpoint: POST /api/paystack-webhook
 *
 * Paystack calls this endpoint when events like `charge.success` occur.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  if (!PAYSTACK_SECRET_KEY) {
    console.error('PAYSTACK_SECRET_KEY is not configured in environment variables.');
    return res.status(500).json({ error: 'Gateway Configuration Error' });
  }

  let rawBuffer: Buffer;
  try {
    rawBuffer = await getRawBody(req);
  } catch (err) {
    console.error('Error reading request stream:', err);
    return res.status(400).json({ error: 'Error reading request body' });
  }

  // 1. Verify Paystack Signature (x-paystack-signature)
  try {
    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(rawBuffer).digest('hex');
    const signatureHeader = Array.isArray(req.headers['x-paystack-signature'])
      ? req.headers['x-paystack-signature'][0]
      : req.headers['x-paystack-signature'];

    if (!signatureHeader || hash !== signatureHeader) {
      console.warn('Invalid Paystack signature on webhook request');
      return res.status(401).json({ error: 'Unauthorized signature' });
    }
  } catch (sigErr) {
    console.error('Error verifying webhook signature:', sigErr);
    return res.status(400).json({ error: 'Bad signature verification request' });
  }

  let event: any;
  try {
    event = JSON.parse(rawBuffer.toString('utf-8'));
  } catch (jsonErr) {
    console.error('Error parsing JSON event payload:', jsonErr);
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // 2. Process charge.success event
  if (event?.event === 'charge.success') {
    const data = event.data || {};
    const reference = data.reference;
    const metadata = data.metadata || {};
    const customFields = Array.isArray(metadata.custom_fields) ? metadata.custom_fields : [];
    const paymentLogId = metadata.payment_log_id || metadata.paymentLogId;

    const uidField = customFields.find((f: any) => f?.variable_name === 'user_id');
    const typeField = customFields.find((f: any) => f?.variable_name === 'purchase_type');
    const planField = customFields.find((f: any) => f?.variable_name === 'plan_key');

    const uid = uidField?.value || metadata.user_id || metadata.userId;
    const purchaseType = typeField?.value || metadata.purchase_type || metadata.purchaseType;
    const planKey = planField?.value || metadata.plan_key || metadata.planKey;
    const verifiedAmountKobo = Number(data.amount);
    const verifiedAmountNgn = Number.isFinite(verifiedAmountKobo) ? Math.round(verifiedAmountKobo) / 100 : 0;

    if (!uid) {
      console.error('Paystack webhook charge.success missing user_id in metadata');
      return res.status(200).send('OK'); // Return 200 so Paystack stops retrying
    }

    const firebaseDbUrl = process.env.VITE_FIREBASE_DATABASE_URL || 'https://tlord-1ab38-default-rtdb.firebaseio.com';
    const databaseSecret = process.env.FIREBASE_DATABASE_SECRET;

    if (!databaseSecret) {
      console.warn('FIREBASE_DATABASE_SECRET is missing. Logging webhook transaction for manual sync.');
      console.log(`Verified payment for user ${uid}, ref: ${reference}, amount: ${verifiedAmountNgn}, type: ${purchaseType}, plan: ${planKey}`);
      return res.status(200).send('OK');
    }

    try {
      // 3. Check if transaction was already processed
      const checkTxUrl = `${firebaseDbUrl}/processed_transactions/${reference}.json?auth=${databaseSecret}`;
      const txCheckRes = await fetch(checkTxUrl);
      const existingTx = await txCheckRes.json();

      if (existingTx && existingTx !== null && existingTx !== 'null') {
        console.log(`Transaction ${reference} already processed.`);
        return res.status(200).send('OK');
      }

      // 4. Update user profile in Firebase Realtime Database
      const userUrl = `${firebaseDbUrl}/users/${uid}.json?auth=${databaseSecret}`;
      const userRes = await fetch(userUrl);
      const currentUser = await userRes.json() || {};

      const updates: Record<string, any> = {
        is_activated: true,
        last_payment_reference: reference,
        last_payment_at: Date.now(),
      };

      if (purchaseType === 'subscription') {
        const creditAllocations: Record<string, number> = {
          weekly: 500,
          basic: 500,
          monthly: 2500,
          premium: 2500,
          semester: 8000,
        };
        const creditAlloc = creditAllocations[planKey] || 500;
        updates.subscription_status = planKey || 'weekly';
        updates.ai_credits_balance = creditAlloc;
      } else if (purchaseType === 'additional_credits') {
        const currentBal = typeof currentUser.ai_credits_balance === 'number' ? currentUser.ai_credits_balance : 0;
        updates.ai_credits_balance = currentBal + (verifiedAmountNgn || 0);
      }

      // Perform user update via PATCH
      await fetch(userUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      // 5. Record processed transaction
      await fetch(checkTxUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          purchaseType,
          planKey: purchaseType === 'subscription' ? planKey : null,
          creditAmount: purchaseType === 'additional_credits' ? verifiedAmountNgn : null,
          reference,
          timestamp: Date.now(),
        }),
      });

      // 6. Update payment log status if ID present
      if (paymentLogId) {
        const logUrl = `${firebaseDbUrl}/usage_logs/payments/${paymentLogId}.json?auth=${databaseSecret}`;
        await fetch(logUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'success',
            reference,
            user_id: uid,
            last_updated_at: Date.now(),
          }),
        });
      }

      console.log(`Successfully processed Paystack webhook for user ${uid}, ref: ${reference}`);
    } catch (dbErr) {
      console.error('Error updating Firebase RTDB from Vercel Webhook:', dbErr);
      return res.status(500).json({ error: 'Database update failed' });
    }
  }

  return res.status(200).send('OK');
}
