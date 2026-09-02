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
      ON catalog_items(legacy_source_kind, legacy_source_id)
      WHERE legacy_source_kind IS NOT NULL AND legacy_source_id IS NOT NULL;
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

  await pool.query(`
    INSERT INTO catalog_items (
      class_id, name, description, base_price, base_quantity, unit, attributes, active,
      legacy_source_kind, legacy_source_id, created_at, updated_at
    )
    SELECT
      (SELECT id FROM catalog_classes WHERE code = 'beer'),
      p.name,
      '',
      CASE WHEN replace(trim(p.price_primary), ',', '.') ~ '^[0-9]+([.][0-9]{1,2})?$'
        THEN replace(trim(p.price_primary), ',', '.')::numeric ELSE 0 END,
      1,
      'л',
      jsonb_strip_nulls(jsonb_build_object(
        'producer', NULLIF(p.producer, ''),
        'characteristics', NULLIF(p.characteristics, ''),
        'alcoholic', p.alcoholic,
        'abv', CASE
          WHEN regexp_replace(replace(p.strength, ',', '.'), '[^0-9.]', '', 'g') ~ '^[0-9]+([.][0-9]+)?$'
          THEN regexp_replace(replace(p.strength, ',', '.'), '[^0-9.]', '', 'g')::numeric
          ELSE NULL
        END,
        'beverage_color', p.beverage_color,
        'filtration', p.filtration
      )),
      p.active,
      'product',
      p.id,
      p.created_at,
      p.updated_at
    FROM catalog_products p
    ON CONFLICT (legacy_source_kind, legacy_source_id) WHERE legacy_source_kind IS NOT NULL AND legacy_source_id IS NOT NULL DO NOTHING;

    INSERT INTO catalog_items (
      class_id, name, description, base_price, base_quantity, unit, attributes, active,
      legacy_source_kind, legacy_source_id, created_at, updated_at
    )
    SELECT
      (SELECT id FROM catalog_classes WHERE code = 'packaging'),
      p.name,
      '',
      CASE WHEN replace(trim(p.unit_price), ',', '.') ~ '^[0-9]+([.][0-9]{1,2})?$'
        THEN replace(trim(p.unit_price), ',', '.')::numeric ELSE 0 END,
      1,
      'шт',
      '{}'::jsonb,
      p.active,
      'packaging',
      p.id,
      p.created_at,
      p.updated_at
    FROM catalog_packaging p
    ON CONFLICT (legacy_source_kind, legacy_source_id) WHERE legacy_source_kind IS NOT NULL AND legacy_source_id IS NOT NULL DO NOTHING;
  `);
}
