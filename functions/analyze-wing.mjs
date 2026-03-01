const CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'POST' } });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  }

  const apiKey = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid API key. It should start with sk-ant-...' }), { status: 401, headers: CORS });
  }

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: CORS });
  }

  const { image, mediaType } = body;
  if (!image || !mediaType) {
    return new Response(JSON.stringify({ error: 'Missing image or mediaType' }), { status: 400, headers: CORS });
  }

  const SYSTEM_PROMPT = `You are a butterfly wing measurement tool for a physics ornithopter lab at a school gala. You analyze overhead photographs of butterfly wings (cut from paper, fabric, or other craft materials) laid flat on a surface with a reference object for scale.

Your job:
1. Identify the reference object (ruler, credit card, coin, paper sheet, dollar bill, or other known object) and use its known dimensions to establish a pixels-to-centimeters scale
2. Measure the wing's maximum span (tip to tip if both wings shown, or double the single wing width)
3. Measure the chord (front-to-back depth at the widest point of one wing, perpendicular to the span axis)
4. Classify the wing shape as one of: monarch, swallowtail, luna, rounded
5. Estimate the taper percentage (100 = rectangular/no taper, lower = pointier tips)
6. Estimate the weight based on the visible material and measured area

IMPORTANT: If the photo appears to be taken at an angle (not straight overhead), note this in the "notes" field and adjust your confidence to "medium" or "low". Perspective distortion from angled photos can cause 10-30% measurement error.

If multiple wings are visible, measure the largest/most prominent one and note others.

If any part of the wing extends beyond the photo frame, note this and set confidence to "low".

Return ONLY a valid JSON object. No markdown fences, no explanation, no extra text. Just the JSON.`;

  const USER_PROMPT = `Analyze this photograph of a butterfly wing laid flat on a surface. There should be a reference object visible for scale measurement.

Reference object sizes for calibration:
- Ruler: read the cm/inch markings directly
- Standard credit/debit card: 8.56 cm × 5.40 cm
- US quarter coin: 2.43 cm diameter
- US penny coin: 1.91 cm diameter
- US dollar bill: 15.61 cm × 6.63 cm
- US letter paper (8.5×11): 27.94 cm × 21.59 cm
- A4 paper: 29.7 cm × 21.0 cm
- Standard sticky note (Post-it): 7.62 cm × 7.62 cm
- iPhone (any recent model): approximately 7.1 cm wide
- Standard pencil (new/unsharpened): 19 cm long, 0.7 cm diameter

Wing shape classification guide:
- "monarch": wide at base/root, tapers to narrower rounded tips. Taper around 35%
- "swallowtail": widest at mid-wing, dramatic taper with possible tail extensions. Taper around 45%
- "luna": long and narrow with elegant trailing edges. Taper around 30%
- "rounded": broad and evenly wide, gentle even taper. Taper around 70%

For weight estimation, identify the material and use these GSM values:
- Tissue paper (30 gsm): area_cm² × 0.003 g
- Vellum / tracing paper (75 gsm): area_cm² × 0.0075 g
- Standard copy paper (80 gsm): area_cm² × 0.008 g
- Construction paper (150 gsm): area_cm² × 0.015 g
- Cardstock (200 gsm): area_cm² × 0.020 g
- Felt/craft fabric (~150 gsm): area_cm² × 0.015 g
- Organza/sheer fabric (~35 gsm): area_cm² × 0.0035 g
- Silk fabric (~50 gsm): area_cm² × 0.005 g
- Cellophane/acetate (~40 gsm): area_cm² × 0.004 g
- Mylar/metallic film (~30 gsm): area_cm² × 0.003 g
- Foam sheet 2mm (~165 gsm): area_cm² × 0.0165 g
- Balsa wood sheet (1mm thick): area_cm² × 0.016 g
- If unsure of material, assume cardstock (0.020 g/cm²)

For body_weight_estimate_g: estimate 1.5× to 2.5× a single wing's weight (body is typically denser).

If NO reference object is visible, estimate dimensions based on typical craft wing sizes and set confidence to "low" with a note explaining.

Return this exact JSON structure:
{
  "wingspan_cm": <number - full tip-to-tip span>,
  "chord_cm": <number - front-to-back depth of widest wing>,
  "shape": "<monarch|swallowtail|luna|rounded>",
  "taper_pct": <number 20-100>,
  "estimated_weight_g": <number - weight of BOTH wings combined>,
  "body_weight_estimate_g": <number>,
  "confidence": "<high|medium|low>",
  "reference_object": "<what you detected as the scale reference>",
  "notes": "<brief helpful note about the wing, material, or any measurement caveats>"
}`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: USER_PROMPT }
          ]
        }]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      let detail = errText;
      try { detail = JSON.parse(errText).error?.message || errText; } catch {}
      return new Response(JSON.stringify({ error: 'Anthropic API error', status: anthropicRes.status, detail }), {
        status: anthropicRes.status, headers: CORS
      });
    }

    const result = await anthropicRes.json();
    const textBlock = result.content?.find(b => b.type === 'text');
    if (!textBlock) {
      return new Response(JSON.stringify({ error: 'No text in Claude response' }), { status: 502, headers: CORS });
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Could not parse structured response', raw: textBlock.text.substring(0, 500) }), {
        status: 502, headers: CORS
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      return new Response(JSON.stringify({ error: 'Claude returned invalid JSON', raw: textBlock.text.substring(0, 500) }), {
        status: 502, headers: CORS
      });
    }

    // Validate and sanitize response
    const validated = {
      wingspan_cm: typeof parsed.wingspan_cm === 'number' && parsed.wingspan_cm > 0 && parsed.wingspan_cm < 500 ? parsed.wingspan_cm : null,
      chord_cm: typeof parsed.chord_cm === 'number' && parsed.chord_cm > 0 && parsed.chord_cm < 200 ? parsed.chord_cm : null,
      shape: ['monarch','swallowtail','luna','rounded'].includes(parsed.shape) ? parsed.shape : null,
      taper_pct: typeof parsed.taper_pct === 'number' && parsed.taper_pct >= 20 && parsed.taper_pct <= 100 ? parsed.taper_pct : null,
      estimated_weight_g: typeof parsed.estimated_weight_g === 'number' && parsed.estimated_weight_g > 0 ? parsed.estimated_weight_g : null,
      body_weight_estimate_g: typeof parsed.body_weight_estimate_g === 'number' && parsed.body_weight_estimate_g > 0 ? parsed.body_weight_estimate_g : null,
      confidence: ['high','medium','low'].includes(parsed.confidence) ? parsed.confidence : 'low',
      reference_object: typeof parsed.reference_object === 'string' ? parsed.reference_object.substring(0, 200) : null,
      notes: typeof parsed.notes === 'string' ? parsed.notes.substring(0, 500) : null,
    };

    return new Response(JSON.stringify(validated), { status: 200, headers: CORS });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Function error', detail: err.message }), {
      status: 500, headers: CORS
    });
  }
};
