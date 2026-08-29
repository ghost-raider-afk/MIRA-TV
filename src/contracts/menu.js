/**
 * @typedef {'section'|'item'|'packaging'} MenuRowKind
 *
 * @typedef {Object} MenuSectionRow
 * @property {string} id
 * @property {'section'} kind
 * @property {string} name
 * @property {boolean} enabled
 *
 * @typedef {Object} MenuProductRow
 * @property {string} id
 * @property {'item'} kind
 * @property {number} product_id
 * @property {string} name
 * @property {string} characteristics
 * @property {string} price_primary
 * @property {string} price_secondary
 * @property {boolean} promotion
 * @property {string} promotion_text
 * @property {boolean} enabled
 *
 * @typedef {Object} MenuPackagingRow
 * @property {string} id
 * @property {'packaging'} kind
 * @property {number} packaging_id
 * @property {string} name
 * @property {string} unit_price
 * @property {boolean} enabled
 *
 * @typedef {MenuSectionRow|MenuProductRow|MenuPackagingRow} MenuRow
 *
 * @typedef {Object.<string, unknown>} TemplateSettings
 *
 * @typedef {Object} ScreenDraft
 * @property {MenuRow[]} rows
 * @property {TemplateSettings} settings
 *
 * @typedef {Object} EditorState
 * @property {Object|null} screen
 * @property {MenuRow[]} rows
 * @property {TemplateSettings} settings
 * @property {string|null} selectedRowId
 * @property {number|null} templateId
 * @property {boolean} dirty
 * @property {number} revision
 */

export const MENU_ROW_KINDS = Object.freeze(['section', 'item', 'packaging']);
