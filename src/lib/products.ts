// Fonction pour chercher un produit dans la base mondiale Open Food Facts
export async function fetchGlobalProduct(ean: string) {
    try {
      const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`);
      const data = await response.json();
  
      if (data.status === 1) {
        // Le produit a été trouvé
        return {
          name: data.product.product_name || "Produit inconnu",
          brand: data.product.brands || "Marque inconnue",
          category: data.product.categories_tags?.[0]?.replace('en:', '') || "Divers",
          image: data.product.image_front_url || null,
          success: true
        };
      }
      return { success: false };
    } catch (error) {
      console.error("Erreur base mondiale:", error);
      return { success: false };
    }
  }