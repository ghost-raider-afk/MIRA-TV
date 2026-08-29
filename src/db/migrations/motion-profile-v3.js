import { isoNow } from '../helpers.js';
import { DEFAULT_ANIMATION_PROFILE } from '../../shared/animation-profile.js';

export async function migrateMotionProfileV3(pool) {
  await pool.query(
    `UPDATE animation_settings
     SET preset_id = 'cinematic-live-menu', profile_json = $1, updated_at = $2
     WHERE preset_id <> 'cinematic-live-menu'
        OR profile_json = '{}'
        OR profile_json NOT LIKE '%"motion_version":3%'`,
    [JSON.stringify(DEFAULT_ANIMATION_PROFILE), isoNow()]
  );
}
