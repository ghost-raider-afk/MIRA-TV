function decimal(value, { decimals = 2, min = 0 } = {}) {
  const number = Number(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(number) && number >= min ? number.toFixed(decimals) : '0';
}

function abv(value) {
  const normalized = String(value ?? '').replace(',', '.').match(/[0-9]+(?:\.[0-9]+)?/u)?.[0];
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
}

function productAttributes(product) {
  const attributes = {
    alcoholic: product.alcoholic === true,
    beverage_color: String(product.beverage_color || 'none'),
    filtration: String(product.filtration || 'none')
  };
  const producer = String(product.producer || '').trim();
  const characteristics = String(product.characteristics || '').trim();
  const strength = abv(product.strength);
  if (producer) attributes.producer = producer;
  if (characteristics) attributes.characteristics = characteristics;
  if (strength !== null) attributes.abv = strength;
  return attributes;
}

async function insertLegacyItems(pool, items) {
  const BATCH_SIZE = 250;
  const COLUMNS_PER_ROW = 12;
  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const batch = items.slice(start, start + BATCH_SIZE);
    const params = [];
    const tuples = batch.map((item, index) => {
      const offset = index * COLUMNS_PER_ROW;
      params.push(
        item.class_id,
        item.name,
        item.description,
        item.base_price,
        item.base_quantity,
        item.unit,
        JSON.stringify(item.attributes),
        item.active,
        item.legacy_source_kind,
        item.legacy_source_id,
        item.created_at,
        item.updated_at
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12})`;
    });
    await pool.query(`
      INSERT INTO catalog_items (
        class_id, name, description, base_price, base_quantity, unit, attributes, active,
        legacy_source_kind, legacy_source_id, created_at, updated_at
      ) VALUES ${tuples.join(', ')}
      ON CONFLICT DO NOTHING
    `, params);
  }
}

export async function migrateUniversalCatalog(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_classes (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      parent_id BIGINT REFERENCES catalog_classes(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      field_schema JSONB NOT NULL DEFAULT '[]'::jsonb,
      pricing_model TEXT NOT NULL DEFAULT 'fixed' CHECK(pricing_model IN ('fixed', 'proportional', 'weight', 'variant')),
      default_unit TEXT NOT NULL DEFAULT 'шт',
      sort_order INTEGER NOT NULL DEFAULT 0,
      system BOOLEAN NOT NULL DEFAULT FALSE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS catalog_items (
      id BIGSERIAL PRIMARY KEY,
      class_id BIGINT NOT NULL REFERENCES catalog_classes(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      base_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK(base_price >= 0),
      base_quantity NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK(base_quantity > 0),
      unit TEXT NOT NULL DEFAULT 'шт',
      attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      legacy_source_kind TEXT CHECK(legacy_source_kind IN ('product', 'packaging')),
      legacy_source_id BIGINT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(class_id, name)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS catalog_items_legacy_source_unique
      ON catalog_items(legacy_source_kind, legacy_source_id);
    CREATE INDEX IF NOT EXISTS catalog_items_class_index ON catalog_items(class_id, name);
    CREATE INDEX IF NOT EXISTS catalog_items_active_index ON catalog_items(active, name);
    CREATE INDEX IF NOT EXISTS catalog_classes_parent_index ON catalog_classes(parent_id, sort_order, name);
  `);

  const classes = [
    {
      code: 'beverage', parent: null, name: 'Напиток', description: 'Базовый класс напитков.', pricing: 'proportional', unit: 'л', order: 10,
      fields: [
        { key: 'producer', label: 'Производитель', type: 'text', max: 120 },
        { key: 'characteristics', label: 'Характеристики', type: 'text', max: 180 },
        { key: 'alcoholic', label: 'Алкогольный', type: 'boolean' },
        { key: 'abv', label: 'Крепость, %', type: 'number', min: 0, max: 100, step: 0.1, optional: true }
      ]
    },
    {
      code: 'beer', parent: 'beverage', name: 'Пиво', description: 'Пиво и пивные напитки.', pricing: 'proportional', unit: 'л', order: 11,
      fields: [
        { key: 'beverage_color', label: 'Цвет', type: 'select', options: [
          { value: 'none', label: 'Не указан' }, { value: 'light', label: 'Светлое' }, { value: 'dark', label: 'Тёмное' },
          { value: 'white', label: 'Белое' }, { value: 'semi_dark', label: 'Полутёмное' }, { value: 'amber', label: 'Янтарное' }, { value: 'red', label: 'Красное' }
        ] },
        { key: 'filtration', label: 'Фильтрация', type: 'select', options: [
          { value: 'none', label: 'Не указана' }, { value: 'filtered', label: 'Фильтрованное' }, { value: 'unfiltered', label: 'Нефильтрованное' }
        ] }
      ]
    },
    {
      code: 'wine', parent: 'beverage', name: 'Вино', description: 'Вино и винные напитки.', pricing: 'fixed', unit: 'бут.', order: 12,
      fields: [
        { key: 'wine_color', label: 'Цвет вина', type: 'select', options: [
          { value: 'red', label: 'Красное' }, { value: 'white', label: 'Белое' }, { value: 'rose', label: 'Розовое' }
        ] },
        { key: 'sweetness', label: 'Сладость', type: 'select', options: [
          { value: 'dry', label: 'Сухое' }, { value: 'semi_dry', label: 'Полусухое' }, { value: 'semi_sweet', label: 'Полусладкое' }, { value: 'sweet', label: 'Сладкое' }
        ] }
      ]
    },
    {
      code: 'cocktail', parent: 'beverage', name: 'Коктейль', description: 'Готовые коктейли.', pricing: 'fixed', unit: 'шт', order: 13,
      fields: [{ key: 'ingredients', label: 'Состав', type: 'text', max: 500, optional: true }]
    },
    {
      code: 'soft_drink', parent: 'beverage', name: 'Безалкогольный напиток', description: 'Лимонады, вода, соки и другие безалкогольные напитки.', pricing: 'fixed', unit: 'шт', order: 14,
      fields: [{ key: 'sugar_free', label: 'Без сахара', type: 'boolean' }]
    },
    {
      code: 'food', parent: null, name: 'Еда', description: 'Базовый класс блюд.', pricing: 'fixed', unit: 'порц.', order: 20,
      fields: [
        { key: 'composition', label: 'Состав', type: 'text', max: 500, optional: true },
        { key: 'allergens', label: 'Аллергены', type: 'text', max: 300, optional: true },
        { key: 'weight_g', label: 'Вес, г', type: 'number', min: 0, max: 100000, step: 1, optional: true }
      ]
    },
    {
      code: 'snack', parent: 'food', name: 'Закуска', description: 'Закуски и снеки.', pricing: 'fixed', unit: 'порц.', order: 21,
      fields: [
        { key: 'spiciness', label: 'Острота', type: 'select', options: [
          { value: 'none', label: 'Неострое' }, { value: 'mild', label: 'Слабоострое' }, { value: 'medium', label: 'Острое' }, { value: 'hot', label: 'Очень острое' }
        ] },
        { key: 'sauce', label: 'Соус', type: 'text', max: 120, optional: true }
      ]
    },
    { code: 'main_course', parent: 'food', name: 'Основное блюдо', description: 'Основные блюда.', pricing: 'fixed', unit: 'порц.', order: 22, fields: [] },
    { code: 'dessert', parent: 'food', name: 'Десерт', description: 'Десерты.', pricing: 'fixed', unit: 'порц.', order: 23, fields: [] },
    { code: 'sauce', parent: 'food', name: 'Соус', description: 'Соусы и добавки.', pricing: 'fixed', unit: 'шт', order: 24, fields: [] },
    {
      code: 'packaging', parent: null, name: 'Тара', description: 'Упаковка и тара.', pricing: 'fixed', unit: 'шт', order: 30,
      fields: [
        { key: 'material', label: 'Материал', type: 'text', max: 80, optional: true },
        { key: 'volume', label: 'Объём', type: 'text', max: 40, optional: true },
        { key: 'returnable', label: 'Возвратная', type: 'boolean' }
      ]
    },
    { code: 'other', parent: null, name: 'Прочее', description: 'Универсальный класс для остальных позиций.', pricing: 'fixed', unit: 'шт', order: 90, fields: [] }
  ];

  for (const item of classes) {
    const parentId = item.parent
      ? `(SELECT id FROM catalog_classes WHERE code = '${item.parent}')`
      : 'NULL';
    await pool.query(`
      INSERT INTO catalog_classes (code, parent_id, name, description, field_schema, pricing_model, default_unit, sort_order, system, active)
      VALUES ($1, ${parentId}, $2, $3, $4::jsonb, $5, $6, $7, TRUE, TRUE)
      ON CONFLICT (code) DO UPDATE SET
        parent_id = EXCLUDED.parent_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        field_schema = EXCLUDED.field_schema,
        pricing_model = EXCLUDED.pricing_model,
        default_unit = EXCLUDED.default_unit,
        sort_order = EXCLUDED.sort_order,
        system = TRUE,
        active = TRUE,
        updated_at = NOW()
    `, [item.code, item.name, item.description, JSON.stringify(item.fields), item.pricing, item.unit, item.order]);
  }

  const { rows: classRows } = await pool.query("SELECT id, code FROM catalog_classes WHERE code IN ('beer', 'packaging')");
  const classIds = new Map(classRows.map((row) => [row.code, Number(row.id)]));
  const beerClassId = classIds.get('beer');
  const packagingClassId = classIds.get('packaging');
  if (!beerClassId || !packagingClassId) throw new Error('Не удалось подготовить системные классы универсального каталога.');

  const [{ rows: products }, { rows: packaging }] = await Promise.all([
    pool.query('SELECT p.* FROM catalog_products p ORDER BY p.id'),
    pool.query('SELECT p.* FROM catalog_packaging p ORDER BY p.id')
  ]);

  const legacyItems = [
    ...products.map((product) => ({
      class_id: beerClassId,
      name: product.name,
      description: '',
      base_price: decimal(product.price_primary),
      base_quantity: '1',
      unit: 'л',
      attributes: productAttributes(product),
      active: product.active !== false,
      legacy_source_kind: 'product',
      legacy_source_id: Number(product.id),
      created_at: product.created_at,
      updated_at: product.updated_at
    })),
    ...packaging.map((item) => ({
      class_id: packagingClassId,
      name: item.name,
      description: '',
      base_price: decimal(item.unit_price),
      base_quantity: '1',
      unit: 'шт',
      attributes: {},
      active: item.active !== false,
      legacy_source_kind: 'packaging',
      legacy_source_id: Number(item.id),
      created_at: item.created_at,
      updated_at: item.updated_at
    }))
  ];

  if (legacyItems.length) await insertLegacyItems(pool, legacyItems);
}
