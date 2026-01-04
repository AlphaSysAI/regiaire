export function calculateSmartOrder(products: any[], weather: any, isVacances: boolean) {
    return products.map(product => {
      let suggestion = "Maintenir";
      let coefficient = 1.0;
      let reason = "Flux stable";
  
      // 1. Croisement Météo + Catégorie
      if (weather.temp > 25 && product.category === 'Boissons') {
        coefficient += 0.4; // +40% de demande
        reason = "Forte chaleur prévue";
      }
  
      // 2. Croisement Vacances + Snacking
      if (isVacances && (product.category === 'Snacking' || product.category === 'Boulangerie')) {
        coefficient += 0.25; // +25% de flux touristique
        reason = "Période de vacances scolaires";
      }
  
      // 3. Analyse des Ruptures (Urgence)
      if (product.current_stock <= product.min_threshold) {
        suggestion = "Réapprovisionnement Urgent";
        coefficient += 0.1; // Sécurité supplémentaire
      }
  
      // 4. Calcul de la quantité suggérée
      const quantityToOrder = Math.ceil((product.target_stock * coefficient) - product.current_stock);
  
      return {
        ...product,
        suggestedQuantity: Math.max(0, quantityToOrder),
        reason: reason,
        priority: product.current_stock <= 2 ? 'Haute' : 'Normale'
      };
    });
  }