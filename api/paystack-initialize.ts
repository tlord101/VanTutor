export const maxDuration = 30;

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { amount, planKey, type, userId, email: userEmail } = body;

    if (!amount || amount < 100) {
      return new Response(
        JSON.stringify({ error: 'Invalid amount. Minimum is ₦100.' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
    if (!PAYSTACK_SECRET_KEY) {
      return new Response(
        JSON.stringify({ error: 'PAYSTACK_SECRET_KEY is not configured on the server' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const host = req.headers.get('host') || 'www.avelut.xyz';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const callback_url = `${protocol}://${host}/payment-success`;

    const email = userEmail || `${userId || 'student'}@avelut.com`;
    const payload = {
      email,
      amount: Math.round(amount * 100), // Paystack uses kobo
      callback_url,
      metadata: {
        custom_fields: [
          { display_name: 'User ID', variable_name: 'user_id', value: userId },
          { display_name: 'Purchase Type', variable_name: 'purchase_type', value: type },
          { display_name: 'Plan Key', variable_name: 'plan_key', value: planKey || 'none' },
        ],
      },
    };

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json();

    if (!json.status) {
      return new Response(
        JSON.stringify({ error: json.message || 'Failed to initialize payment with provider' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    return new Response(
      JSON.stringify({
        authorization_url: json.data.authorization_url,
        reference: json.data.reference,
        access_code: json.data.access_code,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || 'Error connecting to payment provider' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
