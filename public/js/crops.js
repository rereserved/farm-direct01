const CROPS = {
  Tomato:  { img: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400', cat: 'Vegetables' },
  Onion:   { img: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?w=400', cat: 'Vegetables' },
  Potato:  { img: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400', cat: 'Vegetables' },
  Wheat:   { img: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400', cat: 'Grains' },
  Soybean: { img: 'https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=400', cat: 'Oilseeds' },
  Carrot:  { img: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400', cat: 'Vegetables' },
  Spinach: { img: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400', cat: 'Vegetables' },
  Mango:   { img: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=400', cat: 'Fruits' },
  Banana:  { img: 'https://images.unsplash.com/photo-1603833665858-e61d17a86224?w=400', cat: 'Fruits' },
};
const cropImg = c => (CROPS[c] || {}).img || 'https://images.unsplash.com/photo-1610348725531-843dff563e2c?w=400';
const cropCat = c => (CROPS[c] || {}).cat || 'Other';
const stars = r => {
  const n = Math.max(0, Math.min(5, Math.round(Number(r) || 0)));
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
};