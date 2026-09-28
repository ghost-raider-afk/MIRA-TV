import { isoNow, jsonValue, normaliseRow } from './helpers.js';

function normaliseTemplate(row) {
  const current=normaliseRow(row);
  if(!current) return null;
  return {
    ...current,
    settings:jsonValue(current.settings_json,{}),
    scene:jsonValue(current.scene_json,{version:1,elements:[]})
  };
}

export function createMenuThemeTemplatesRepository(pool) {
  return Object.freeze({
    async listMenuThemeTemplates() {
      const {rows}=await pool.query('SELECT * FROM menu_theme_templates ORDER BY LOWER(name), id');
      return rows.map(normaliseTemplate);
    },
    async getMenuThemeTemplate(id) {
      const {rows}=await pool.query('SELECT * FROM menu_theme_templates WHERE id=$1',[id]);
      return normaliseTemplate(rows[0]);
    },
    async createMenuThemeTemplate({name,settings,scene,username}) {
      const now=isoNow();
      const {rows}=await pool.query(
        `INSERT INTO menu_theme_templates
          (name,settings_json,scene_json,created_by,updated_by,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$4,$5,$5) RETURNING *`,
        [name,JSON.stringify(settings),JSON.stringify(scene),username || '',now]
      );
      return normaliseTemplate(rows[0]);
    },
    async updateMenuThemeTemplate(id,{name,settings,scene,username}) {
      const {rows}=await pool.query(
        `UPDATE menu_theme_templates
         SET name=$1,settings_json=$2,scene_json=$3,updated_by=$4,updated_at=$5
         WHERE id=$6 RETURNING *`,
        [name,JSON.stringify(settings),JSON.stringify(scene),username || '',isoNow(),id]
      );
      return normaliseTemplate(rows[0]);
    },
    async deleteMenuThemeTemplate(id) {
      const {rows}=await pool.query('DELETE FROM menu_theme_templates WHERE id=$1 RETURNING *',[id]);
      return normaliseTemplate(rows[0]);
    }
  });
}
