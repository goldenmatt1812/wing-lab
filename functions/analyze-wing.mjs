const CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST' } });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  }

  // Use server-side environment variable — never exposed to client
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error: API key not set' }), { status: 500, headers: CORS });
  }

  let body;
  try { body = await request.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: CORS });
  }

  const { image, mediaType } = body;
  if (!image || !mediaType) {
    return new Response(JSON.stringify({ error: 'Missing image or mediaType' }), { status: 400, headers: CORS });
  }

  // ─── SYSTEM PROMPT ───────────────────────────────────────────
  const SYSTEM_PROMPT = `You are the AI vision system for Wing Lab — an interactive physics tool used at a school gala where students and families build butterfly wings from craft materials (paper, cardboard, fabric, foam, plywood) and then hang them on a string-and-weight mechanism that makes them flap.

Your task: analyze an overhead photograph of a hand-made butterfly wing to extract precise measurements that feed into a physics simulator. The simulator uses these measurements to calculate optimal weights, string positions, and flap dynamics.

## ANALYSIS PIPELINE

### Step 1: Photo Quality Assessment
Before measuring anything, evaluate whether this photo CAN be accurately measured:
- Is there a wing visible?
- Is there a recognizable reference object for scale?
- Is the photo taken roughly overhead (bird's-eye)?
- Is the wing reasonably flat and fully visible?
- Is lighting adequate (not washed out, not too dark)?

If the photo has serious problems that prevent accurate measurement, set "photo_ok" to false and provide specific, friendly guidance in "photo_tips" explaining exactly what to fix. Be encouraging — these are families at a school event, not professional photographers.

### Step 2: Scale Calibration
Identify the reference object and compute a pixels-to-cm conversion factor.

Known reference dimensions:
| Object | Size |
|--------|------|
| Ruler | Read markings directly |
| Credit/debit card | 8.56 × 5.40 cm |
| US quarter | 2.43 cm ⌀ |
| US penny | 1.91 cm ⌀ |
| US dollar bill | 15.61 × 6.63 cm |
| US letter paper | 27.94 × 21.59 cm |
| A4 paper | 29.7 × 21.0 cm |
| Post-it note | 7.62 × 7.62 cm |
| iPhone (recent) | ~7.1 cm wide |
| Standard pencil | 19 cm long |

If no reference object is found, estimate based on contextual clues (hand size, table features, etc.) but set confidence to "low".

### Step 3: Wing Measurements
- **wingspan_cm**: Full tip-to-tip span. If only one wing is visible, double it.
- **chord_cm**: Front-to-back depth at the widest point of one wing, measured perpendicular to the span axis.
- **shape**: Classify as one of four types:
  - "monarch" — wide at root/base, tapers to narrower rounded tips (taper ~35%)
  - "swallowtail" — widest at mid-wing, dramatic taper, may have tail extensions (taper ~45%)
  - "luna" — long, narrow, elegant trailing edges (taper ~30%)
  - "rounded" — broad and evenly wide, gentle even taper (taper ~70%)
- **taper_pct**: 100 = perfectly rectangular (no taper), lower = pointier tips. Range: 20-100.

### Step 4: Weight Estimation
Identify the material by visual appearance and estimate weight using GSM (grams per square meter):

| Material | GSM | g/cm² |
|----------|-----|-------|
| Tissue paper | 30 | 0.003 |
| Tracing paper / vellum | 75 | 0.0075 |
| Copy paper (standard) | 80 | 0.008 |
| Construction paper | 150 | 0.015 |
| Cardstock (poster board) | 200 | 0.020 |
| Felt / craft fabric | 150 | 0.015 |
| Organza / sheer fabric | 35 | 0.0035 |
| Silk fabric | 50 | 0.005 |
| Cellophane / acetate | 40 | 0.004 |
| Mylar / metallic film | 30 | 0.003 |
| Foam sheet (2mm) | 165 | 0.0165 |
| Corrugated cardboard | 500 | 0.050 |
| Balsa wood (1mm) | 160 | 0.016 |
| Plywood (3mm) | 1200 | 0.120 |

Wing area ≈ wingspan × chord × 0.65 (accounts for wing shape vs rectangle).
estimated_weight_g = area_cm² × material_g_per_cm². This is for BOTH wings combined.
body_weight_estimate_g ≈ 1.5× to 2.5× a single wing's weight.

If the material is unclear, state what you think it might be and assume cardstock (0.020 g/cm²).

### Step 5: Confidence Assessment
- **high**: Clear reference object, overhead angle, wing fully visible, good lighting
- **medium**: Minor issues (slight angle, partial shadow, reference partly obscured)
- **low**: Major issues (no reference, extreme angle, wing cut off, very dark/blurry)

Adjust measurements if you detect perspective distortion from angled photos (can cause 10-30% error).

## OUTPUT FORMAT
Return ONLY valid JSON. No markdown fences. No explanation. Just the JSON object.`;

  // ─── USER PROMPT ─────────────────────────────────────────────
  const USER_PROMPT = `Analyze this wing photograph and return measurements for the Wing Lab physics simulator.

Return this exact JSON structure:
{
  "photo_ok": true,
  "photo_tips": null,
  "wingspan_cm": 45.2,
  "chord_cm": 12.8,
  "shape": "monarch",
  "taper_pct": 35,
  "estimated_weight_g": 8.4,
  "body_weight_estimate_g": 6.3,
  "material_guess": "cardstock",
  "confidence": "high",
  "reference_object": "US dollar bill",
  "notes": "Clean measurement, well-lit overhead photo."
}

If the photo has problems that prevent accurate measurement, return:
{
  "photo_ok": false,
  "photo_tips": "Friendly, specific tips on how to retake the photo for better results. Be encouraging!",
  "wingspan_cm": null,
  "chord_cm": null,
  "shape": null,
  "taper_pct": null,
  "estimated_weight_g": null,
  "body_weight_estimate_g": null,
  "material_guess": null,
  "confidence": "low",
  "reference_object": null,
  "notes": "What went wrong and why measurements aren't possible."
}

Even with a problematic photo, if you CAN make reasonable estimates, do so (set photo_ok: true but confidence: "low" or "medium") and include tips in photo_tips for a better retake. Only set photo_ok: false if the image truly cannot be measured at all (no wing visible, completely blurry, etc.)`;

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
      return new Response(JSON.stringify({ error: 'Analysis service error', status: anthropicRes.status, detail }), {
        status: anthropicRes.status, headers: CORS
      });
    }

    const result = await anthropicRes.json();
    const textBlock = result.content?.find(b => b.type === 'text');
    if (!textBlock) {
      return new Response(JSON.stringify({ error: 'No response from analysis' }), { status: 502, headers: CORS });
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(JSON.stringify({ error: 'Could not parse response', raw: textBlock.text.substring(0, 500) }), {
        status: 502, headers: CORS
      });
    }

    let parsed;
    try { parsed = JSON.parse(jsonMatch[0]); } catch {
      return new Response(JSON.stringify({ error: 'Invalid response format', raw: textBlock.text.substring(0, 500) }), {
        status: 502, headers: CORS
      });
    }

    // Validate and sanitize
    const validated = {
      photo_ok: parsed.photo_ok === true,
      photo_tips: typeof parsed.photo_tips === 'string' ? parsed.photo_tips.substring(0, 600) : null,
      wingspan_cm: typeof parsed.wingspan_cm === 'number' && parsed.wingspan_cm > 0 && parsed.wingspan_cm < 500 ? parsed.wingspan_cm : null,
      chord_cm: typeof parsed.chord_cm === 'number' && parsed.chord_cm > 0 && parsed.chord_cm < 200 ? parsed.chord_cm : null,
      shape: ['monarch','swallowtail','luna','rounded'].includes(parsed.shape) ? parsed.shape : null,
      taper_pct: typeof parsed.taper_pct === 'number' && parsed.taper_pct >= 20 && parsed.taper_pct <= 100 ? parsed.taper_pct : null,
      estimated_weight_g: typeof parsed.estimated_weight_g === 'number' && parsed.estimated_weight_g > 0 ? parsed.estimated_weight_g : null,
      body_weight_estimate_g: typeof parsed.body_weight_estimate_g === 'number' && parsed.body_weight_estimate_g > 0 ? parsed.body_weight_estimate_g : null,
      material_guess: typeof parsed.material_guess === 'string' ? parsed.material_guess.substring(0, 100) : null,
      confidence: ['high','medium','low'].includes(parsed.confidence) ? parsed.confidence : 'low',
      reference_object: typeof parsed.reference_object === 'string' ? parsed.reference_object.substring(0, 200) : null,
      notes: typeof parsed.notes === 'string' ? parsed.notes.substring(0, 500) : null,
    };

    return new Response(JSON.stringify(validated), { status: 200, headers: CORS });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'Analysis failed', detail: err.message }), {
      status: 500, headers: CORS
    });
  }
};
