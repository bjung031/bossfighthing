const ITEM_DATA = {
  health_potion: {
    id: 'health_potion',
    name: 'Health Potion',
    icon: '🧪',
    type: 'consumable',
    rarity: 'Common',
    description: 'Restores 1 HP',
    effect: { heal: 1 },
  },
};

function getItemById(id) {
  return ITEM_DATA[id] ? { ...ITEM_DATA[id] } : null;
}
