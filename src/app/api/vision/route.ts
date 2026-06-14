import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function POST(req: Request) {
  try {
    const { images, aireId } = await req.json(); // images est un tableau de base64

    if (!images || images.length === 0) {
      return new Response(JSON.stringify({ error: "Aucune image fournie" }), { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
    Tu es un expert en logistique. Analyse ces images de Bon de Livraison (BL).
    
    CONSIGNE :
    1. Extrais chaque produit avec précision.
    2. Pour le colisage : 
       - "total_colis" : le nombre de cartons/boites reçus.
       - "units_per_colis" : le nombre de produits individuels dans un carton (ex: 6, 12, 24).
       - "expected_total_qty" : le nombre total de produits (total_colis * units_per_colis).
    3. Si une information est manquante, calcule-la mathématiquement.
    
    Format de réponse JSON strict :
    [
      {
        "product_name": "SANDWICH POULET 180G",
        "ean": "325039158xxxx",
        "total_colis": 3,
        "units_per_colis": 6,
        "expected_total_qty": 18
      },
      ...
    ]
  `;

    // Préparation des parties images pour Gemini
    const imageParts = images.map((img: string) => ({
      inlineData: {
        data: img.split(",")[1],
        mimeType: "image/jpeg"
      }
    }));

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text().replace(/```json|```/g, "").trim();
    const deliveryItems = JSON.parse(text);

    return new Response(JSON.stringify({ items: deliveryItems }), { status: 200 });
  } catch (error) {
    console.error("Erreur Vision IA:", error);
    return new Response(JSON.stringify({ error: "Échec de l'analyse multi-pages" }), { status: 500 });
  }
}